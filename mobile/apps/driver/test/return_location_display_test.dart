import 'package:driver/screens/request_detail_screen.dart';
import 'package:driver/screens/requests_screen.dart';
import 'package:driver/state/app_state.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _TestAppState extends AppState {
  _TestAppState() {
    isAuthenticated = true;
    isActivated = true;
    drivingEnabled = true;
    hasSeenWelcome = true;
    loaded = true;
  }

  @override
  Future<DriverRequest> loadRequestDetail(String id) async {
    return openRequests.firstWhere((r) => r.id == id);
  }

  @override
  Future<List<DriverVehicle>> loadDriverVehicles() async => const [];

  @override
  Future<void> refreshOpenRequests({bool fromPush = false}) async {}

  @override
  Future<void> refreshMyRides() async {}

  @override
  Future<void> startMarketplaceRealtime() async {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('Return location display tests', () {
    testWidgets(
        'RequestsScreen displays Return to <from> when toLabel is empty on return ride',
        (tester) async {
      final appState = _TestAppState();

      final req = driverRequestFromServer({
        'id': 'req_round_empty_to',
        'fromLabel': 'Toronto Pearson International Airport (YYZ)',
        'toLabel': null,
        'pickupAt': '2026-11-26T23:21:00.000Z',
        'returnAt': '2026-11-27T10:00:00.000Z',
        'isRoundTrip': true,
        'adults': 2,
        'status': 'WAITING_FOR_OFFERS',
        'currency': 'CAD',
        'vehicleClassIds': ['Economy'],
        'priceSnapshot': {
          'distanceKm': 0,
          'durationMin': 120,
          'legs': 2,
          'isRoundTrip': true,
          'guidanceAmount': 100,
          'minBid': 80,
          'maxBid': 120,
        },
      });
      appState.openRequests = [req];

      await tester.pumpWidget(
        ChangeNotifierProvider<AppState>.value(
          value: appState,
          child: const MaterialApp(
            home: RequestsScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Must find Point A
      expect(find.text('Toronto Pearson International Airport (YYZ)'), findsOneWidget);
      // Point B must NOT be blank; it must say 'Return to Toronto Pearson International Airport (YYZ)'
      expect(
        find.text('Return to Toronto Pearson International Airport (YYZ)'),
        findsOneWidget,
      );
    });

    testWidgets(
        'RequestsScreen displays destination and Return to <from> when toLabel is present on return ride',
        (tester) async {
      final appState = _TestAppState();

      final req = driverRequestFromServer({
        'id': 'req_round_with_to',
        'fromLabel': 'Toronto Pearson International Airport (YYZ)',
        'toLabel': 'Fairmont Royal York, Toronto',
        'pickupAt': '2026-11-26T23:21:00.000Z',
        'returnAt': '2026-11-27T10:00:00.000Z',
        'isRoundTrip': true,
        'adults': 2,
        'status': 'WAITING_FOR_OFFERS',
        'currency': 'CAD',
        'vehicleClassIds': ['Economy'],
        'priceSnapshot': {
          'distanceKm': 50,
          'durationMin': 90,
          'legs': 2,
          'isRoundTrip': true,
          'guidanceAmount': 150,
          'minBid': 120,
          'maxBid': 180,
        },
      });
      appState.openRequests = [req];

      await tester.pumpWidget(
        ChangeNotifierProvider<AppState>.value(
          value: appState,
          child: const MaterialApp(
            home: RequestsScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Point A
      expect(find.text('Toronto Pearson International Airport (YYZ)'), findsOneWidget);
      // Point B destination
      expect(find.text('Fairmont Royal York, Toronto'), findsOneWidget);
      // Return destination
      expect(
        find.text('Return to Toronto Pearson International Airport (YYZ)'),
        findsOneWidget,
      );
    });

    testWidgets(
        'RequestDetailScreen displays return destination properly',
        (tester) async {
      final appState = _TestAppState();

      final req = driverRequestFromServer({
        'id': 'req_detail_return',
        'fromLabel': 'Toronto Pearson International Airport (YYZ)',
        'toLabel': '',
        'pickupAt': '2026-11-26T23:21:00.000Z',
        'returnAt': '2026-11-27T10:00:00.000Z',
        'isRoundTrip': true,
        'adults': 1,
        'status': 'WAITING_FOR_OFFERS',
        'currency': 'CAD',
        'vehicleClassIds': ['Economy'],
        'priceSnapshot': {
          'distanceKm': 0,
          'durationMin': 120,
          'guidanceAmount': 100,
          'minBid': 80,
          'maxBid': 120,
        },
      });
      appState.openRequests = [req];

      await tester.pumpWidget(
        ChangeNotifierProvider<AppState>.value(
          value: appState,
          child: const MaterialApp(
            home: RequestDetailScreen(requestId: 'req_detail_return'),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));

      expect(
        find.text('Return to Toronto Pearson International Airport (YYZ)'),
        findsOneWidget,
      );
    });

    testWidgets('GtRouteRow displays return location when to is null on round trip',
        (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: GtRouteRow(
              from: 'YYZ Airport',
              to: null,
              isRoundTrip: true,
              returnLabel: 'Thu 26 Nov',
            ),
          ),
        ),
      );

      expect(find.text('YYZ Airport'), findsOneWidget);
      expect(find.text('Return to YYZ Airport'), findsOneWidget);
      expect(find.text('B'), findsOneWidget);
    });
  });
}
