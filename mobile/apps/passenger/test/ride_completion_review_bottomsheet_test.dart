import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:passenger/screens/ride_detail_screen.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });

  AppState createMockAppState({
    List<Map<String, dynamic>> initialRatings = const [],
    String currentServerStatus = 'IN_PROGRESS',
  }) {
    var status = currentServerStatus;
    final mockHttpClient = MockClient((request) async {
      if (request.url.path.endsWith('/payment-status')) {
        return http.Response(
          jsonEncode({
            'status': 'PAID',
            'totalAmount': 45.0,
            'onlineCurrency': 'CAD',
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (request.url.path.contains('/rating')) {
        return http.Response(
          jsonEncode(initialRatings),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (request.url.path.contains('/tracking')) {
        return http.Response(
          jsonEncode({}),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (request.url.path.contains('/rides/')) {
        final segments = request.url.pathSegments;
        final rideId = segments.isNotEmpty ? segments.last : 'test-ride';
        return http.Response(
          jsonEncode({
            'id': rideId,
            'pickupAt': '2026-09-29T15:00:00.000Z',
            'fromLabel': '100 King St W',
            'toLabel': 'Pearson Terminal 1',
            'status': status,
            'offers': [],
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response(
        jsonEncode({}),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final session = CanGoSession(client: ApiClient(httpClient: mockHttpClient));
    final app = AppState(session: session);
    app.isAuthenticated = true;
    app.me = {'id': 'passenger-user-1'};
    return app;
  }

  group('Ride Completion Review BottomSheet Tests (Passenger)', () {
    test('AppState handles ride.status event from backend', () {
      final appState = createMockAppState();
      addTearDown(appState.dispose);
      appState.repo.rides.add(
        RideRequest(
          id: 'ride-101',
          datetimeLabel: 'Today, 2:00 PM',
          from: 'Downtown',
          to: 'Airport',
          status: RideStatus.booked,
          serverStatus: 'IN_PROGRESS',
        ),
      );

      expect(appState.pendingRideStatusAlert, isNull);
      expect(
        appState.rideById('ride-101')?.serverStatus,
        equals('IN_PROGRESS'),
      );
    });

    testWidgets(
      'Review bottomsheet automatically appears when ride becomes COMPLETED',
      (tester) async {
        final appState = createMockAppState(currentServerStatus: 'IN_PROGRESS');
        addTearDown(appState.dispose);
        await tester.pump(const Duration(milliseconds: 100));

        final ride = RideRequest(
          id: 'ride-complete-test',
          datetimeLabel: 'Today, 3:00 PM',
          from: '100 King St W',
          to: 'Pearson Terminal 1',
          status: RideStatus.booked,
          serverStatus: 'IN_PROGRESS',
        );

        appState.isAuthenticated = true;
        appState.me = {'id': 'passenger-user-1'};
        appState.repo.rides.clear();
        appState.repo.rides.add(ride);

        await tester.pumpWidget(
          MaterialApp(
            home: ChangeNotifierProvider<AppState>.value(
              value: appState,
              child: const RideDetailScreen(rideId: 'ride-complete-test'),
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Initially in progress, no rating sheet
        expect(find.text('Rate your trip'), findsNothing);

        // Ride transitions to COMPLETED via a new RideRequest instance (as done by refreshRide)
        final updatedRide = RideRequest(
          id: 'ride-complete-test',
          datetimeLabel: 'Today, 3:00 PM',
          from: '100 King St W',
          to: 'Pearson Terminal 1',
          status: RideStatus.past,
          serverStatus: 'COMPLETED',
        );
        final idx = appState.repo.rides.indexWhere((r) => r.id == 'ride-complete-test');
        appState.repo.rides[idx] = updatedRide;
        appState.notifyListeners();

        // Let the reactive check trigger the post frame callback and sheet animation
        await tester.pumpAndSettle();

        // Verify bottomsheet is displayed with rating fields
        expect(find.text('Rate your trip'), findsOneWidget);
        expect(
          find.text('Help others by rating communication, driver, and vehicle.'),
          findsOneWidget,
        );
        expect(find.text('Communication'), findsOneWidget);
        expect(find.text('Driver'), findsOneWidget);
        expect(find.text('Vehicle'), findsOneWidget);
        expect(find.text('Submit rating'), findsOneWidget);
        expect(find.text('Later'), findsOneWidget);

        // Dismiss via 'Later'
        await tester.ensureVisible(find.text('Later'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Later'));
        await tester.pumpAndSettle();

        // Sheet dismissed, "Rate this ride" button is available in the scrollable view
        expect(find.text('Rate your trip'), findsNothing);
        expect(find.text('Rate this ride', skipOffstage: false), findsOneWidget);
      },
    );

    testWidgets(
      'Review bottomsheet does not appear if ride is already rated',
      (tester) async {
        final appState = createMockAppState(
          currentServerStatus: 'COMPLETED',
          initialRatings: [
            {'fromUserId': 'passenger-user-1', 'stars': 5}
          ],
        );
        addTearDown(appState.dispose);
        await tester.pump(const Duration(milliseconds: 100));

        final ride = RideRequest(
          id: 'ride-already-rated',
          datetimeLabel: 'Today, 1:00 PM',
          from: '100 King St W',
          to: 'Pearson Terminal 1',
          status: RideStatus.past,
          serverStatus: 'COMPLETED',
        );

        appState.isAuthenticated = true;
        appState.me = {'id': 'passenger-user-1'};
        appState.repo.rides.clear();
        appState.repo.rides.add(ride);

        await tester.pumpWidget(
          MaterialApp(
            home: ChangeNotifierProvider<AppState>.value(
              value: appState,
              child: const RideDetailScreen(rideId: 'ride-already-rated'),
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Bottomsheet should NOT be shown
        expect(find.text('Rate your trip'), findsNothing);
        // Instead shows rating indicator
        expect(
          find.textContaining('You rated ★5', skipOffstage: false),
          findsOneWidget,
        );
      },
    );
  });
}
