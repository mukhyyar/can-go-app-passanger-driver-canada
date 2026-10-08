import 'package:driver/screens/trip_detail_screen.dart';
import 'package:driver/state/app_state.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  DriverRequest createTestTrip({
    required String id,
    required String status,
    double? offerPrice,
    double? tipAmount,
    double driverEarning = 45.0,
  }) {
    return driverRequestFromServer({
      'id': id,
      'fromLabel': '100 Queen St W',
      'toLabel': 'Pearson Airport',
      'pickupAt': '2026-09-28T20:30:00.000Z',
      'status': status,
      'isRoundTrip': false,
      'adults': 1,
      'currency': 'CAD',
      'vehicleClassIds': ['Economy'],
      'offerPrice': offerPrice, // just in case
      'priceSnapshot': {
        'distanceKm': 25,
        'durationMin': 30,
        'guidanceAmount': 50,
        'bidAmount': offerPrice,
        'driverEarning': driverEarning,
        'tip': tipAmount,
      },
    });
  }

  group('TripDetailScreen Tip Display Tests (Driver)', () {
    testWidgets(
      'Completed trip with tip displays tip banner and detailed fare breakdown',
      (tester) async {
        final appState = AppState();
        appState.hasSeenWelcome = true;
        appState.loaded = true;
        final trip = createTestTrip(
          id: 'trip-tip-1',
          status: 'COMPLETED',
          offerPrice: 50.0,
          tipAmount: 5.0,
          driverEarning: 45.0, // 50 - 10 (fee) + 5 (tip)
        );
        appState.openRequests = [trip];

        final router = GoRouter(
          initialLocation: '/trip/trip-tip-1',
          routes: [
            GoRoute(
              path: '/trip/:rideId',
              builder: (_, state) => TripDetailScreen(
                rideId: state.pathParameters['rideId']!,
              ),
            ),
          ],
        );

        await tester.pumpWidget(
          ChangeNotifierProvider.value(
            value: appState,
            child: MaterialApp.router(
              routerConfig: router,
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Dismiss rating sheet if present
        if (find.text('Later').evaluate().isNotEmpty) {
          await tester.tap(find.text('Later'));
          await tester.pumpAndSettle();
        }

        // Verify tip banner
        expect(find.text('Passenger tipped you CAD 5.00!'), findsOneWidget);
        expect(
          find.text('100% of tips go directly to you. Processed securely via Stripe.'),
          findsOneWidget,
        );

        // Verify earnings breakdown with tip
        expect(find.text('Ride fare'), findsOneWidget);
        expect(find.text('CAD 50.00'), findsOneWidget);
        expect(find.text('Marketplace fee (20%)'), findsOneWidget);
        expect(find.text('-CAD 10.00'), findsOneWidget);
        expect(find.text('Passenger tip (Stripe)'), findsOneWidget);
        expect(find.text('+CAD 5.00'), findsOneWidget);
        expect(find.text('Total earning'), findsOneWidget);
        expect(find.text('CAD 45.00'), findsOneWidget);
      },
    );

    testWidgets(
      'Completed trip without tip displays normal earnings row and no tip banner',
      (tester) async {
        final appState = AppState();
        appState.hasSeenWelcome = true;
        appState.loaded = true;
        final trip = createTestTrip(
          id: 'trip-no-tip',
          status: 'COMPLETED',
          offerPrice: 50.0,
          tipAmount: null,
          driverEarning: 40.0,
        );
        appState.openRequests = [trip];

        final router = GoRouter(
          initialLocation: '/trip/trip-no-tip',
          routes: [
            GoRoute(
              path: '/trip/:rideId',
              builder: (_, state) => TripDetailScreen(
                rideId: state.pathParameters['rideId']!,
              ),
            ),
          ],
        );

        await tester.pumpWidget(
          ChangeNotifierProvider.value(
            value: appState,
            child: MaterialApp.router(
              routerConfig: router,
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Dismiss rating sheet if present
        if (find.text('Later').evaluate().isNotEmpty) {
          await tester.tap(find.text('Later'));
          await tester.pumpAndSettle();
        }

        // Tip banner should NOT be shown
        expect(find.textContaining('Passenger tipped you'), findsNothing);

        // Regular earnings row shown (Breakdown UI)
        expect(find.text('Total earning'), findsOneWidget);
        expect(find.text('CAD 40.00'), findsWidgets); // it might find it twice, once in the breakdown and once in the total
      },
    );

    test(
      'AppState correctly handles driver.tip_received alert and deep links to /trip/:id',
      () {
        final appState = AppState();
        appState.drivingEnabled = true;

        appState.applyPushAlert(
          rideId: 'trip-tip-alert',
          title: 'Passenger added \$5.00 tip!',
          type: 'driver.tip_received',
          status: 'COMPLETED',
        );

        expect(appState.pendingRequestAlert, equals('Passenger added \$5.00 tip!'));
        expect(appState.pendingAlertType, equals('driver.tip_received'));
        expect(appState.pendingRequestRideId, equals('trip-tip-alert'));

        final deepLink = AppState.rideDeepLinkPath(
          rideId: 'trip-tip-alert',
          type: 'driver.tip_received',
          status: 'COMPLETED',
        );
        expect(deepLink, equals('/trip/trip-tip-alert'));
      },
    );
  });
}
