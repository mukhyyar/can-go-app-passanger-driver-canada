import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:driver/screens/requests_screen.dart';
import 'package:driver/state/app_state.dart';
import 'package:provider/provider.dart';

class MockDriverTestAppState extends AppState {
  @override
  Future<void> refreshOpenRequests({bool fromPush = false}) async {}
}

void main() {
  group('DriverRequest Model Service Type Properties', () {
    test('correctly identifies service types on DriverRequest', () {
      const rideReq = DriverRequest(
        id: 'req_1',
        datetimeLabel: 'Today, 14:00',
        from: 'Downtown',
        to: 'Airport',
        distance: '15 km',
        duration: '20 min',
        vehicleNeed: 'Sedan',
        passengers: 2,
        serviceType: 'RIDE',
      );
      expect(rideReq.isRide, isTrue);
      expect(rideReq.isDelivery, isFalse);
      expect(rideReq.isPerHour, isFalse);
      expect(rideReq.serviceTypeLabel, 'Ride');

      const deliveryReq = DriverRequest(
        id: 'req_2',
        datetimeLabel: 'Today, 15:00',
        from: 'Warehouse',
        to: 'Client Office',
        distance: '8 km',
        duration: '15 min',
        vehicleNeed: 'Any',
        passengers: 1,
        serviceType: 'DELIVERY',
      );
      expect(deliveryReq.isRide, isFalse);
      expect(deliveryReq.isDelivery, isTrue);
      expect(deliveryReq.isPerHour, isFalse);
      expect(deliveryReq.serviceTypeLabel, 'Delivery');

      const perHourReq = DriverRequest(
        id: 'req_3',
        datetimeLabel: 'Today, 16:00',
        from: 'Hotel',
        to: 'City Center',
        distance: '40 km',
        duration: '2 hours',
        vehicleNeed: 'SUV',
        passengers: 3,
        serviceType: 'PER_HOUR',
      );
      expect(perHourReq.isRide, isFalse);
      expect(perHourReq.isDelivery, isFalse);
      expect(perHourReq.isPerHour, isTrue);
      expect(perHourReq.serviceTypeLabel, 'Per Hour');
    });

    test('driverRequestFromServer parses serviceType from JSON payload', () {
      final json = {
        'id': 'ride_abc123',
        'status': 'WAITING_FOR_OFFERS',
        'serviceType': 'DELIVERY',
        'fromLabel': 'Sender Address',
        'toLabel': 'Recipient Address',
        'pickupAt': DateTime.now().add(const Duration(hours: 1)).toIso8601String(),
        'adults': 1,
      };

      final parsed = driverRequestFromServer(json);
      expect(parsed.serviceType, 'DELIVERY');
      expect(parsed.isDelivery, isTrue);
      expect(parsed.serviceTypeLabel, 'Delivery');
    });
  });

  group('Driver RequestsScreen ServiceTypeBadge UX', () {
    testWidgets('renders Per Hour, Delivery, and Ride labels on driver request cards',
        (tester) async {
      tester.view.physicalSize = const Size(800, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final state = MockDriverTestAppState();
      state.openRequests = [
        const DriverRequest(
          id: '25088001',
          datetimeLabel: 'Today, 10:00',
          from: 'Hotel Waterfront',
          to: 'Airport Terminal 1',
          distance: '25 km',
          duration: '30 min',
          vehicleNeed: 'Sedan',
          passengers: 2,
          serviceType: 'RIDE',
        ),
        const DriverRequest(
          id: '25088002',
          datetimeLabel: 'Today, 11:30',
          from: 'Flower Shop',
          to: 'Residential Ave',
          distance: '5 km',
          duration: '12 min',
          vehicleNeed: 'Any',
          passengers: 1,
          serviceType: 'DELIVERY',
        ),
        const DriverRequest(
          id: '25088003',
          datetimeLabel: 'Today, 14:00',
          from: 'Convention Center',
          to: 'Multiple Stops',
          distance: '50 km',
          duration: '4 hours',
          vehicleNeed: 'SUV',
          passengers: 4,
          serviceType: 'PER_HOUR',
        ),
      ];
      state.isAuthenticated = true;
      state.isActivated = true;

      await tester.pumpWidget(
        ChangeNotifierProvider<AppState>.value(
          value: state,
          child: const MaterialApp(
            home: RequestsScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Check for presence of each label badge on the screen
      expect(find.byType(ServiceTypeBadge), findsNWidgets(3));
      expect(find.text('Ride'), findsWidgets);
      expect(find.text('Delivery'), findsOneWidget);
      expect(find.text('Per Hour'), findsOneWidget);

      // Verify icons
      expect(find.byIcon(Icons.directions_car_rounded), findsWidgets);
      expect(find.byIcon(Icons.inventory_2_outlined), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(ServiceTypeBadge),
          matching: find.byIcon(Icons.schedule_rounded),
        ),
        findsOneWidget,
      );
    });
  });
}
