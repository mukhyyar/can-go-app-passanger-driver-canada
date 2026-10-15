import 'package:driver/screens/request_detail_screen.dart';
import 'package:driver/state/app_state.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('DriverRequest isOverdueBooking tests', () {
    test('identifies overdue booking if pickupAt is past by >30 mins', () {
      final overdueReq = DriverRequest(
        id: 'req-overdue',
        datetimeLabel: 'Yesterday',
        from: 'A',
        to: 'B',
        distance: '10 km',
        duration: '15 min',
        vehicleNeed: 'Economy',
        passengers: 1,
        status: 'BOOKED',
        pickupAt: DateTime.now().subtract(const Duration(hours: 2)),
      );
      expect(overdueReq.isOverdueBooking, isTrue);

      final futureReq = DriverRequest(
        id: 'req-future',
        datetimeLabel: 'Tomorrow',
        from: 'A',
        to: 'B',
        distance: '10 km',
        duration: '15 min',
        vehicleNeed: 'Economy',
        passengers: 1,
        status: 'BOOKED',
        pickupAt: DateTime.now().add(const Duration(hours: 5)),
      );
      expect(futureReq.isOverdueBooking, isFalse);
    });

    test('isOverdue flag overrides status and pickupAt', () {
      final flaggedReq = DriverRequest(
        id: 'req-flagged',
        datetimeLabel: 'Today',
        from: 'A',
        to: 'B',
        distance: '10 km',
        duration: '15 min',
        vehicleNeed: 'Economy',
        passengers: 1,
        status: 'BOOKED',
        isOverdue: true,
      );
      expect(flaggedReq.isOverdueBooking, isTrue);
    });
  });

  group('Driver RequestDetailScreen expired handling', () {
    testWidgets(
        'expired driver offer on active request shows offer expired guidance and NOT request expired',
        (tester) async {
      final appState = AppState();
      appState.hasSeenWelcome = true;
      appState.loaded = true;

      final req = driverRequestFromServer({
        'id': 'active_req_expired_offer',
        'fromLabel': '100 Queen St W',
        'toLabel': 'Toronto Pearson Airport',
        'pickupAt': '2026-10-28T20:30:00.000Z',
        'isRoundTrip': false,
        'adults': 1,
        'status': 'WAITING_FOR_OFFERS',
        'currency': 'CAD',
        'vehicleClassIds': ['Economy'],
        'priceSnapshot': {
          'distanceKm': 25,
          'durationMin': 30,
          'guidanceAmount': 50,
          'minBid': 30,
          'maxBid': 80,
          'platformCommissionPct': 15,
        },
        'myOffers': [
          {
            'id': 'offer_exp_1',
            'status': 'EXPIRED',
            'bidAmount': '50',
            'outboundPrice': '50',
            'currency': 'CAD',
            'validForSeconds': '900',
          }
        ],
      });
      appState.openRequests = [req];

      await tester.pumpWidget(
        ChangeNotifierProvider.value(
          value: appState,
          child: const MaterialApp(
            home: RequestDetailScreen(requestId: 'active_req_expired_offer'),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Should NOT say "This ride request has expired"
      expect(find.text('This ride request has expired'), findsNothing);

      // Should show guidance banner about submitting a new offer
      expect(
        find.textContaining('Your previous offer expired'),
        findsOneWidget,
      );

      // Inline offer form is active and allows submitting a new offer
      expect(find.text('Continue to offer customer'), findsOneWidget);
    });

    testWidgets(
        'truly expired ride request shows "This ride request has expired"',
        (tester) async {
      final appState = AppState();
      appState.hasSeenWelcome = true;
      appState.loaded = true;

      final req = driverRequestFromServer({
        'id': 'expired_req_id',
        'fromLabel': '100 Queen St W',
        'toLabel': 'Toronto Pearson Airport',
        'pickupAt': '2026-09-28T20:30:00.000Z',
        'isRoundTrip': false,
        'adults': 1,
        'status': 'EXPIRED',
        'currency': 'CAD',
        'vehicleClassIds': ['Economy'],
        'priceSnapshot': {
          'distanceKm': 25,
          'durationMin': 30,
          'guidanceAmount': 50,
          'minBid': 30,
          'maxBid': 80,
        },
      });
      appState.openRequests = [req];

      await tester.pumpWidget(
        ChangeNotifierProvider.value(
          value: appState,
          child: const MaterialApp(
            home: RequestDetailScreen(requestId: 'expired_req_id'),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('This ride request has expired'), findsOneWidget);
    });
  });
}
