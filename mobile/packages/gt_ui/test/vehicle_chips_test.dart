import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_ui/gt_ui.dart';

void main() {
  group('GtVehicleChips', () {
    test('formatLabel capitalizes words and preserves acronyms like SUV and VIP', () {
      expect(GtVehicleChips.formatLabel('economy'), equals('Economy'));
      expect(GtVehicleChips.formatLabel('comfort'), equals('Comfort'));
      expect(GtVehicleChips.formatLabel('suv'), equals('SUV'));
      expect(GtVehicleChips.formatLabel('vip'), equals('VIP'));
      expect(GtVehicleChips.formatLabel('business_class'), equals('Business Class'));
      expect(GtVehicleChips.formatLabel('minibus'), equals('Minibus'));
    });

    test('vehicleIcon picks appropriate icons for vehicle categories', () {
      expect(GtVehicleChips.vehicleIcon('van'), equals(Icons.airport_shuttle_outlined));
      expect(GtVehicleChips.vehicleIcon('minibus'), equals(Icons.airport_shuttle_outlined));
      expect(GtVehicleChips.vehicleIcon('suv'), equals(Icons.directions_car_filled_outlined));
      expect(GtVehicleChips.vehicleIcon('vip'), equals(Icons.airline_seat_recline_extra_outlined));
      expect(GtVehicleChips.vehicleIcon('economy'), equals(Icons.directions_car_outlined));
    });

    testWidgets('renders multiple chips from raw comma-separated need and displays passenger count badge', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: GtVehicleChips(
              rawNeed: 'economy, comfort, business, premium, vip, suv, van, minibus, bus',
              passengers: 2,
            ),
          ),
        ),
      );

      // Verify chips are rendered for each class
      expect(find.text('Economy'), findsOneWidget);
      expect(find.text('Comfort'), findsOneWidget);
      expect(find.text('Business'), findsOneWidget);
      expect(find.text('Premium'), findsOneWidget);
      expect(find.text('VIP'), findsOneWidget);
      expect(find.text('SUV'), findsOneWidget);
      expect(find.text('Van'), findsOneWidget);
      expect(find.text('Minibus'), findsOneWidget);
      expect(find.text('Bus'), findsOneWidget);

      // Verify passenger count badge
      expect(find.text('× 2'), findsOneWidget);
      expect(find.byIcon(Icons.person_outline), findsOneWidget);
    });
  });
}
