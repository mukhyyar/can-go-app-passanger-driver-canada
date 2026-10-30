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

    testWidgets(
      'Past ride with 1-star category ratings normalizes and displays You rated ★1 even if stars was 5',
      (tester) async {
        final appState = createMockAppState(
          currentServerStatus: 'COMPLETED',
          initialRatings: [
            {
              'fromUserId': 'passenger-user-1',
              'stars': 5, // Old mismatched database value
              'communicationStars': 1,
              'driverStars': 1,
              'vehicleStars': 1,
            }
          ],
        );
        addTearDown(appState.dispose);
        await tester.pump(const Duration(milliseconds: 100));

        final ride = RideRequest(
          id: 'ride-normalized-rating',
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
              child: const RideDetailScreen(rideId: 'ride-normalized-rating'),
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Should display You rated ★1
        expect(
          find.textContaining('You rated ★1', skipOffstage: false),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'Rating 1 star updates categories and submits 1 star, showing You rated ★1',
      (tester) async {
        Map<String, dynamic>? submittedBody;
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
          if (request.method == 'POST' && request.url.path.contains('/ratings')) {
            submittedBody = jsonDecode(request.body) as Map<String, dynamic>;
            return http.Response(
              jsonEncode({'id': 'r-new', ...submittedBody!}),
              201,
              headers: {'content-type': 'application/json'},
            );
          }
          if (request.url.path.contains('/rating')) {
            return http.Response(
              jsonEncode([]),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          if (request.url.path.contains('/rides/')) {
            return http.Response(
              jsonEncode({
                'id': 'ride-submit-1star',
                'pickupAt': '2026-09-29T15:00:00.000Z',
                'fromLabel': '100 King St W',
                'toLabel': 'Pearson Terminal 1',
                'status': 'COMPLETED',
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
        final appState = AppState(session: session);
        addTearDown(appState.dispose);

        final ride = RideRequest(
          id: 'ride-submit-1star',
          datetimeLabel: 'Today, 3:00 PM',
          from: '100 King St W',
          to: 'Pearson Terminal 1',
          status: RideStatus.booked,
          serverStatus: 'IN_PROGRESS',
        );

        appState.isAuthenticated = true;
        appState.me = {'id': 'passenger-user-1'};
        appState.repo.rides.add(ride);

        await tester.pumpWidget(
          MaterialApp(
            home: ChangeNotifierProvider<AppState>.value(
              value: appState,
              child: const RideDetailScreen(rideId: 'ride-submit-1star'),
            ),
          ),
        );
        await tester.pumpAndSettle();

        final updatedRide = RideRequest(
          id: 'ride-submit-1star',
          datetimeLabel: 'Today, 3:00 PM',
          from: '100 King St W',
          to: 'Pearson Terminal 1',
          status: RideStatus.past,
          serverStatus: 'COMPLETED',
        );
        final idx =
            appState.repo.rides.indexWhere((r) => r.id == 'ride-submit-1star');
        if (idx >= 0) {
          appState.repo.rides[idx] = updatedRide;
        } else {
          appState.repo.rides.add(updatedRide);
        }
        appState.notifyListeners();
        await tester.pumpAndSettle();

        expect(find.text('Rate your trip'), findsOneWidget);

        // Tap the 1st star in the Overall row (icon size 36)
        final starIcons = find.byWidgetPredicate(
          (w) =>
              w is Icon &&
              (w.icon == Icons.star || w.icon == Icons.star_border) &&
              w.size == 36,
        );
        expect(starIcons, findsNWidgets(5));
        // Initially 5 stars: shows "What went well?" and positive tags
        expect(find.text('What went well?'), findsOneWidget);
        expect(find.text('Clean vehicle'), findsOneWidget);

        await tester.tap(starIcons.first);
        await tester.pumpAndSettle();

        // After tapping 1 star overall: switches to "What went wrong?" and 1-star tags
        expect(find.text('What went wrong?'), findsOneWidget);
        expect(find.text('Unsafe driving'), findsOneWidget);
        expect(find.text('Clean vehicle'), findsNothing);

        // Tap submit rating
        await tester.ensureVisible(find.text('Submit rating'));
        await tester.tap(find.text('Submit rating'));
        await tester.pumpAndSettle();

        expect(submittedBody, isNotNull);
        expect(submittedBody!['stars'], equals(1));
        expect(submittedBody!['communicationStars'], equals(1));
        expect(submittedBody!['driverStars'], equals(1));
        expect(submittedBody!['vehicleStars'], equals(1));

        expect(
          find.textContaining('You rated ★1', skipOffstage: false),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'Rating categories independently recomputes overall rating and submits consistent 1-star rating',
      (tester) async {
        Map<String, dynamic>? submittedBody;
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
          if (request.method == 'POST' && request.url.path.contains('/ratings')) {
            submittedBody = jsonDecode(request.body) as Map<String, dynamic>;
            return http.Response(
              jsonEncode({'id': 'r-new-cat', ...submittedBody!}),
              201,
              headers: {'content-type': 'application/json'},
            );
          }
          if (request.url.path.contains('/rating')) {
            return http.Response(
              jsonEncode([]),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          if (request.url.path.contains('/rides/')) {
            return http.Response(
              jsonEncode({
                'id': 'ride-cat-1star',
                'pickupAt': '2026-09-29T15:00:00.000Z',
                'fromLabel': '100 King St W',
                'toLabel': 'Pearson Terminal 1',
                'status': 'COMPLETED',
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
        final appState = AppState(session: session);
        addTearDown(appState.dispose);

        final ride = RideRequest(
          id: 'ride-cat-1star',
          datetimeLabel: 'Today, 3:00 PM',
          from: '100 King St W',
          to: 'Pearson Terminal 1',
          status: RideStatus.booked,
          serverStatus: 'IN_PROGRESS',
        );

        appState.isAuthenticated = true;
        appState.me = {'id': 'passenger-user-1'};
        appState.repo.rides.add(ride);

        await tester.pumpWidget(
          MaterialApp(
            home: ChangeNotifierProvider<AppState>.value(
              value: appState,
              child: const RideDetailScreen(rideId: 'ride-cat-1star'),
            ),
          ),
        );
        await tester.pumpAndSettle();

        final updatedRide = RideRequest(
          id: 'ride-cat-1star',
          datetimeLabel: 'Today, 3:00 PM',
          from: '100 King St W',
          to: 'Pearson Terminal 1',
          status: RideStatus.past,
          serverStatus: 'COMPLETED',
        );
        final idx =
            appState.repo.rides.indexWhere((r) => r.id == 'ride-cat-1star');
        if (idx >= 0) {
          appState.repo.rides[idx] = updatedRide;
        } else {
          appState.repo.rides.add(updatedRide);
        }
        appState.notifyListeners();
        await tester.pumpAndSettle();

        expect(find.text('Rate your trip'), findsOneWidget);

        // Find the 28px category star icons (15 total: 5 for Comm, 5 for Driver, 5 for Vehicle)
        final categoryStarIcons = find.byWidgetPredicate(
          (w) =>
              w is Icon &&
              (w.icon == Icons.star || w.icon == Icons.star_border) &&
              w.size == 28,
        );
        expect(categoryStarIcons, findsNWidgets(15));

        // Initially 5 stars: shows "What went well?" and positive tags
        expect(find.text('What went well?'), findsOneWidget);
        expect(find.text('Clean vehicle'), findsOneWidget);

        // Tap 1st star of Communication (index 0)
        await tester.tap(categoryStarIcons.at(0));
        await tester.pumpAndSettle();

        // Tap 1st star of Driver (index 5)
        await tester.tap(categoryStarIcons.at(5));
        await tester.pumpAndSettle();

        // Tap 1st star of Vehicle (index 10)
        await tester.tap(categoryStarIcons.at(10));
        await tester.pumpAndSettle();

        // After all categories set to 1 star: suggestions switch to "What went wrong?"
        expect(find.text('What went wrong?'), findsOneWidget);
        expect(find.text('Unsafe driving'), findsOneWidget);
        expect(find.text('Clean vehicle'), findsNothing);

        // Submit
        await tester.ensureVisible(find.text('Submit rating'));
        await tester.tap(find.text('Submit rating'));
        await tester.pumpAndSettle();

        expect(submittedBody, isNotNull);
        expect(submittedBody!['stars'], equals(1));
        expect(submittedBody!['communicationStars'], equals(1));
        expect(submittedBody!['driverStars'], equals(1));
        expect(submittedBody!['vehicleStars'], equals(1));

        expect(
          find.textContaining('You rated ★1', skipOffstage: false),
          findsOneWidget,
        );
      },
    );
  });
}
