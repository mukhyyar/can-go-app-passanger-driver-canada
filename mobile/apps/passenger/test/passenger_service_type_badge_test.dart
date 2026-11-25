import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:passenger/screens/rides_screen.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

class MockPassengerTestAppState extends AppState {
  MockPassengerTestAppState() : super(session: CanGoSession());
}

void main() {
  group('Passenger RideRequest Model Service Type Properties', () {
    test('correctly identifies service types on RideRequest', () {
      final rideReq = RideRequest(
        id: 'ride_1',
        datetimeLabel: 'Today, 14:00',
        from: 'Downtown',
        to: 'Airport',
        status: RideStatus.waitingOffers,
        serviceType: 'RIDE',
      );
      expect(rideReq.isRide, isTrue);
      expect(rideReq.isDelivery, isFalse);
      expect(rideReq.isPerHour, isFalse);
      expect(rideReq.serviceTypeLabel, 'Ride');

      final deliveryReq = RideRequest(
        id: 'ride_2',
        datetimeLabel: 'Today, 15:00',
        from: 'Store',
        to: 'Home',
        status: RideStatus.chooseOffer,
        serviceType: 'DELIVERY',
      );
      expect(deliveryReq.isRide, isFalse);
      expect(deliveryReq.isDelivery, isTrue);
      expect(deliveryReq.isPerHour, isFalse);
      expect(deliveryReq.serviceTypeLabel, 'Delivery');

      final perHourReq = RideRequest(
        id: 'ride_3',
        datetimeLabel: 'Today, 16:00',
        from: 'Resort',
        status: RideStatus.booked,
        serviceType: 'PER_HOUR',
      );
      expect(perHourReq.isRide, isFalse);
      expect(perHourReq.isDelivery, isFalse);
      expect(perHourReq.isPerHour, isTrue);
      expect(perHourReq.serviceTypeLabel, 'Per Hour');
    });

    test('rideFromServer parses serviceType from JSON payload', () {
      final json = {
        'id': 'ride_xyz789',
        'status': 'BOOKED',
        'serviceType': 'PER_HOUR',
        'fromLabel': 'Banff Springs Hotel',
        'pickupAt': DateTime.now().add(const Duration(hours: 2)).toIso8601String(),
        'adults': 2,
      };

      final parsed = rideFromServer(json);
      expect(parsed.serviceType, 'PER_HOUR');
      expect(parsed.isPerHour, isTrue);
      expect(parsed.serviceTypeLabel, 'Per Hour');
    });
  });

  group('Passenger RidesScreen ServiceTypeBadge UX', () {
    testWidgets('renders Per Hour, Delivery, and Ride labels on passenger ride list cards',
        (tester) async {
      tester.view.physicalSize = const Size(800, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final state = MockPassengerTestAppState();
      state.repo.rides.clear();
      state.repo.rides.addAll([
        RideRequest(
          id: 'ride_101',
          datetimeLabel: 'Today, 10:00',
          from: '100 King St, Toronto',
          to: 'Pearson Airport',
          status: RideStatus.waitingOffers,
          serviceType: 'RIDE',
        ),
        RideRequest(
          id: 'ride_102',
          datetimeLabel: 'Today, 12:00',
          from: 'Bakery on Main',
          to: 'Customer Residence',
          status: RideStatus.chooseOffer,
          serviceType: 'DELIVERY',
        ),
        RideRequest(
          id: 'ride_103',
          datetimeLabel: 'Today, 14:00',
          from: 'Hotel Downtown',
          status: RideStatus.booked,
          serviceType: 'PER_HOUR',
        ),
      ]);
      state.isAuthenticated = true;
      state.ready = true;

      await tester.pumpWidget(
        ChangeNotifierProvider<AppState>.value(
          value: state,
          child: const MaterialApp(
            home: RidesScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Check for presence of each label badge on the screen
      expect(find.text('Ride'), findsWidgets);
      expect(find.text('Delivery'), findsOneWidget);
      expect(find.text('Per Hour'), findsOneWidget);

      // Verify icons
      expect(find.byIcon(Icons.directions_car_rounded), findsWidgets);
      expect(find.byIcon(Icons.inventory_2_outlined), findsOneWidget);
      expect(find.byIcon(Icons.schedule_rounded), findsOneWidget);
    });
  });
}
