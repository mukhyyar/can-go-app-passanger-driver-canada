import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:driver/screens/rides_screen.dart';
import 'package:driver/state/app_state.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:provider/provider.dart';

DriverRequest _makeRide({
  required String id,
  required String status,
  DateTime? pickupAt,
  DateTime? createdAt,
  String? from,
  String? to,
}) {
  return DriverRequest(
    id: id,
    status: status,
    datetimeLabel: 'Today, 10:00',
    from: from ?? 'Pickup',
    to: to ?? 'Dropoff',
    distance: '10 km',
    duration: '15 min',
    vehicleNeed: 'Sedan',
    passengers: 1,
    pickupAt: pickupAt,
    createdAt: createdAt,
  );
}

class _TestAppState extends AppState {
  @override
  Future<void> refreshMyRides() async {}
}

void main() {
  group('Driver app rides descending order tests', () {
    test('scheduledRides returns booked rides in descending order (newest pickup first)', () {
      final appState = AppState();
      final now = DateTime.now();

      final ride1 = _makeRide(
        id: 'ride-1-oldest',
        status: 'BOOKED',
        pickupAt: now.add(const Duration(days: 1)),
        createdAt: now.subtract(const Duration(hours: 5)),
      );

      final ride2 = _makeRide(
        id: 'ride-2-newest',
        status: 'BOOKED',
        pickupAt: now.add(const Duration(days: 5)),
        createdAt: now.subtract(const Duration(hours: 1)),
      );

      final ride3 = _makeRide(
        id: 'ride-3-middle',
        status: 'BOOKED',
        pickupAt: now.add(const Duration(days: 3)),
        createdAt: now.subtract(const Duration(hours: 3)),
      );

      // Even if myRides was inserted in ascending or random order:
      appState.myRides = [ride1, ride3, ride2];

      final scheduled = appState.scheduledRides;
      expect(scheduled.length, 3);
      expect(scheduled[0].id, 'ride-2-newest');
      expect(scheduled[1].id, 'ride-3-middle');
      expect(scheduled[2].id, 'ride-1-oldest');
    });

    test('scheduledRides falls back to createdAt descending when pickupAt is identical', () {
      final appState = AppState();
      final now = DateTime.now();
      final samePickup = now.add(const Duration(days: 2));

      final rideA = _makeRide(
        id: 'ride-created-first',
        status: 'BOOKED',
        pickupAt: samePickup,
        createdAt: now.subtract(const Duration(hours: 4)),
      );

      final rideB = _makeRide(
        id: 'ride-created-later',
        status: 'BOOKED',
        pickupAt: samePickup,
        createdAt: now.subtract(const Duration(minutes: 10)),
      );

      appState.myRides = [rideA, rideB];

      final scheduled = appState.scheduledRides;
      expect(scheduled.length, 2);
      expect(scheduled[0].id, 'ride-created-later');
      expect(scheduled[1].id, 'ride-created-first');
    });

    test('pastRides returns completed and cancelled rides in descending order (newest first)', () {
      final appState = AppState();
      final now = DateTime.now();

      final oldCompleted = _makeRide(
        id: 'past-old',
        status: 'COMPLETED',
        pickupAt: now.subtract(const Duration(days: 10)),
        createdAt: now.subtract(const Duration(days: 10, hours: 2)),
      );

      final recentCancelled = _makeRide(
        id: 'past-recent',
        status: 'PASSENGER_CANCELLED',
        pickupAt: now.subtract(const Duration(days: 1)),
        createdAt: now.subtract(const Duration(days: 1, hours: 1)),
      );

      appState.myRides = [oldCompleted, recentCancelled];

      final past = appState.pastRides;
      expect(past.length, 2);
      expect(past[0].id, 'past-recent');
      expect(past[1].id, 'past-old');
    });

    testWidgets('RidesScreen scheduled tab renders newest rides at the top', (tester) async {
      final appState = _TestAppState();
      final now = DateTime.now();

      final olderRide = _makeRide(
        id: 'ride-101',
        status: 'BOOKED',
        from: 'Older Pickup Station',
        to: 'Airport',
        pickupAt: now.add(const Duration(days: 1)),
      );
      final newerRide = _makeRide(
        id: 'ride-202',
        status: 'BOOKED',
        from: 'Newer Pickup Station',
        to: 'Downtown',
        pickupAt: now.add(const Duration(days: 4)),
      );

      appState.myRides = [olderRide, newerRide];

      await tester.pumpWidget(
        MaterialApp(
          home: ChangeNotifierProvider<AppState>.value(
            value: appState,
            child: const RidesScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      final newerFinder = find.text('Newer Pickup Station');
      final olderFinder = find.text('Older Pickup Station');

      expect(newerFinder, findsOneWidget);
      expect(olderFinder, findsOneWidget);

      final newerY = tester.getTopLeft(newerFinder).dy;
      final olderY = tester.getTopLeft(olderFinder).dy;

      // Newer ride should be above older ride (smaller Y coordinate)
      expect(newerY, lessThan(olderY));
    });
  });
}
