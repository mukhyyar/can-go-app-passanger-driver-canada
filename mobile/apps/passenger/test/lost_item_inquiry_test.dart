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

  setUpAll(() {
    TestWidgetsFlutterBinding.ensureInitialized();
  });

  group('Lost & Found Data Mapping', () {
    test('RideRequest defaults hasLostItemRequest to false', () {
      final req = RideRequest(
        id: 'ride-1',
        datetimeLabel: 'Today, 2:00 PM',
        from: 'Downtown',
        to: 'Airport',
        status: RideStatus.past,
      );
      expect(req.hasLostItemRequest, isFalse);
    });

    test('rideFromServer accurately parses hasLostItemRequest: true', () {
      final json = {
        'id': 'ride-abc-123',
        'pickupAt': '2026-09-21T15:00:00.000Z',
        'fromLabel': 'Union Station',
        'toLabel': 'Pearson Airport',
        'status': 'COMPLETED',
        'hasLostItemRequest': true,
      };

      final parsed = rideFromServer(json);
      expect(parsed.id, equals('ride-abc-123'));
      expect(parsed.status, equals(RideStatus.past));
      expect(parsed.serverStatus, equals('COMPLETED'));
      expect(parsed.hasLostItemRequest, isTrue);
    });

    test('rideFromServer accurately parses hasLostItemRequest: false / missing', () {
      final json = {
        'id': 'ride-def-456',
        'pickupAt': '2026-09-21T15:00:00.000Z',
        'fromLabel': 'Union Station',
        'toLabel': 'Pearson Airport',
        'status': 'COMPLETED',
      };

      final parsed = rideFromServer(json);
      expect(parsed.hasLostItemRequest, isFalse);
    });
  });

  group('RideDetailScreen Lost & Found UI', () {
    AppState createMockAppState() {
      final mockHttpClient = MockClient((request) async {
        if (request.url.path.contains('/rating')) {
          return http.Response(
            jsonEncode({'rated': true, 'stars': 5}),
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
      return AppState(session: session);
    }

    testWidgets('shows "Find lost item" button on completed ride without active inquiry', (tester) async {
      final appState = createMockAppState();
      final ride = RideRequest(
        id: 'ride-completed-1',
        datetimeLabel: 'Yesterday, 4:00 PM',
        from: '123 Main St',
        to: '456 Queen St',
        status: RideStatus.past,
        serverStatus: 'COMPLETED',
        hasLostItemRequest: false,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: ChangeNotifierProvider<AppState>.value(
            value: appState,
            child: const RideDetailScreen(rideId: 'ride-completed-1'),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));

      appState.repo.rides.clear();
      appState.repo.rides.add(ride);
      appState.notifyListeners();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(find.text('Ride not found'), findsNothing);
      expect(find.text('Find lost item'), findsOneWidget);
      expect(find.text('Lost item inquiry active'), findsNothing);
    });

    testWidgets('shows "Lost item inquiry active" banner on completed ride with active inquiry', (tester) async {
      final appState = createMockAppState();
      final ride = RideRequest(
        id: 'ride-completed-2',
        datetimeLabel: 'Yesterday, 4:00 PM',
        from: '123 Main St',
        to: '456 Queen St',
        status: RideStatus.past,
        serverStatus: 'COMPLETED',
        hasLostItemRequest: true,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: ChangeNotifierProvider<AppState>.value(
            value: appState,
            child: const RideDetailScreen(rideId: 'ride-completed-2'),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));

      appState.repo.rides.clear();
      appState.repo.rides.add(ride);
      appState.notifyListeners();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('Lost item inquiry active'), findsOneWidget);
      expect(find.text('Find lost item'), findsNothing);
    });

    testWidgets('tapping "Find lost item" opens privacy-first bottom sheet modal', (tester) async {
      final appState = createMockAppState();
      final ride = RideRequest(
        id: 'ride-completed-3',
        datetimeLabel: 'Yesterday, 4:00 PM',
        from: '123 Main St',
        to: '456 Queen St',
        status: RideStatus.past,
        serverStatus: 'COMPLETED',
        hasLostItemRequest: false,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: ChangeNotifierProvider<AppState>.value(
            value: appState,
            child: const RideDetailScreen(rideId: 'ride-completed-3'),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));

      appState.repo.rides.clear();
      appState.repo.rides.add(ride);
      appState.repo.passenger.phone = '+15559876543';
      appState.notifyListeners();
      await tester.pump(const Duration(milliseconds: 100));

      // Tap Find lost item button
      await tester.tap(find.text('Find lost item'));
      await tester.pump(const Duration(milliseconds: 300));

      // Verify privacy explanation is shown (Uber / GetTransfer pattern)
      expect(
        find.textContaining('To protect your privacy, you don\'t need to describe personal items'),
        findsOneWidget,
      );
      expect(find.text('Contact phone number'), findsOneWidget);
      expect(find.text('Location in vehicle (optional)'), findsOneWidget);
      expect(find.text('Notify driver'), findsOneWidget);
      final phoneField = tester.widget<TextField>(
        find.widgetWithText(TextField, 'Contact phone number'),
      );
      expect(phoneField.controller?.text, equals('+15559876543'));
    });
  });
}
