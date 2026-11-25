import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:driver/screens/trip_detail_screen.dart';
import 'package:driver/state/app_state.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

class MockScheduledTripAppState extends AppState {
  DriverRequest? mockTrip;
  int tripGoEnRouteCalls = 0;
  double? lastEnRouteLat;
  double? lastEnRouteLng;

  @override
  Future<DriverRequest> loadTripDetail(String rideId) async {
    if (mockTrip != null) return mockTrip!;
    return super.loadTripDetail(rideId);
  }

  @override
  Future<Map<String, dynamic>> tripGoEnRoute(
    String rideId, {
    double? lat,
    double? lng,
  }) async {
    tripGoEnRouteCalls++;
    lastEnRouteLat = lat;
    lastEnRouteLng = lng;
    return {'id': rideId, 'status': 'DRIVER_EN_ROUTE'};
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('Scheduled Ride En-Route Gating Model & Parser', () {
    test('driverRequestFromServer parses enRouteEligibility correctly', () {
      final json = {
        'id': 'ride_sched_1',
        'status': 'BOOKED',
        'fromLabel': '100 King St W',
        'toLabel': 'Pearson Airport',
        'pickupAt': '2026-11-26T17:00:00.000Z',
        'enRouteEligibility': {
          'canGoEnRoute': false,
          'isActivated': false,
          'isScheduled': true,
          'scheduledPickupAt': '2026-11-26T17:00:00.000Z',
          'allowedEnRouteAt': '2026-11-26T16:20:00.000Z',
          'driveEtaMinutes': 25,
          'bufferMinutes': 15,
          'leadTimeMinutes': 40,
          'remainingMinutesUntilUnlock': 65,
          'reason': 'Cannot start en route yet.',
        },
      };

      final req = driverRequestFromServer(json);
      expect(req.canGoEnRoute, isFalse);
      expect(req.isActivated, isFalse);
      expect(req.driveEtaMinutes, 25);
      expect(req.remainingMinutesUntilUnlock, 65);
      expect(req.allowedEnRouteAt, isNotNull);
      expect(req.allowedEnRouteAt!.toUtc().hour, 16);
      expect(req.allowedEnRouteAt!.toUtc().minute, 20);
    });

    test('canGoEnRoute returns true when eligibility allows it', () {
      final json = {
        'id': 'ride_sched_2',
        'status': 'BOOKED',
        'fromLabel': '100 King St W',
        'toLabel': 'Pearson Airport',
        'pickupAt': '2026-11-26T17:00:00.000Z',
        'enRouteEligibility': {
          'canGoEnRoute': true,
          'isActivated': true,
          'isScheduled': true,
          'remainingMinutesUntilUnlock': 0,
        },
      };

      final req = driverRequestFromServer(json);
      expect(req.canGoEnRoute, isTrue);
      expect(req.isActivated, isTrue);
    });
  });

  group('TripDetailScreen Scheduled Ride UI', () {
    testWidgets('shows Scheduled Trip card and locked button when canGoEnRoute is false', (tester) async {
      final appState = MockScheduledTripAppState();
      appState.mockTrip = driverRequestFromServer({
        'id': 'ride_locked_1',
        'status': 'BOOKED',
        'fromLabel': '100 King St W',
        'toLabel': 'Pearson Airport',
        'pickupAt': '2026-11-26T17:00:00.000Z',
        'enRouteEligibility': {
          'canGoEnRoute': false,
          'isActivated': true,
          'isScheduled': true,
          'scheduledPickupAt': '2026-11-26T17:00:00.000Z',
          'allowedEnRouteAt': '2026-11-26T16:20:00.000Z',
          'driveEtaMinutes': 25,
          'remainingMinutesUntilUnlock': 30,
        },
      });

      await tester.pumpWidget(
        MaterialApp(
          home: ChangeNotifierProvider<AppState>.value(
            value: appState,
            child: const TripDetailScreen(rideId: 'ride_locked_1'),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Scheduled Trip card is shown
      expect(find.text('Scheduled Trip'), findsOneWidget);
      expect(find.textContaining('Drive to pickup: ~25 mins'), findsOneWidget);
      expect(find.textContaining('En route unlocks at'), findsWidgets);

      // Button is locked with clock icon
      expect(find.byIcon(Icons.lock_clock), findsWidgets);
      expect(find.text('Go en route'), findsNothing);

      // Tap locked button opens explanation dialog
      await tester.tap(find.byIcon(Icons.lock_clock).last);
      await tester.pumpAndSettle();

      expect(find.text('Scheduled Pickup'), findsOneWidget);
      expect(find.text('Got it'), findsOneWidget);

      await tester.tap(find.text('Got it'));
      await tester.pumpAndSettle();

      // TripGoEnRoute was not called
      expect(appState.tripGoEnRouteCalls, 0);
    });

    testWidgets('shows active Green "Go en route" button when canGoEnRoute is true', (tester) async {
      final appState = MockScheduledTripAppState();
      appState.mockTrip = driverRequestFromServer({
        'id': 'ride_ready_1',
        'status': 'BOOKED',
        'fromLabel': '100 King St W',
        'toLabel': 'Pearson Airport',
        'pickupAt': '2026-11-26T17:00:00.000Z',
        'enRouteEligibility': {
          'canGoEnRoute': true,
          'isActivated': true,
          'isScheduled': true,
          'remainingMinutesUntilUnlock': 0,
        },
      });

      await tester.pumpWidget(
        MaterialApp(
          home: ChangeNotifierProvider<AppState>.value(
            value: appState,
            child: const TripDetailScreen(rideId: 'ride_ready_1'),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Green "Go en route" button is visible
      expect(find.text('Go en route'), findsOneWidget);

      // Tapping "Go en route" triggers tripGoEnRoute
      await tester.tap(find.text('Go en route'));
      await tester.pumpAndSettle();

      expect(appState.tripGoEnRouteCalls, 1);
    });
  });
}
