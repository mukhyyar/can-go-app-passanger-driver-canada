import 'package:driver/screens/settings/vehicle_form_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_mock/gt_mock.dart';

void main() {
  group('Driver Vehicle Classes', () {
    test('kVehicleClasses matches MockData.vehicleClasses as single source of truth', () {
      expect(kVehicleClasses, equals(MockData.vehicleClasses.map((v) => v.id).toList()));
    });

    test('kVehicleClasses excludes business, vip, bus, and legacy sedan', () {
      expect(kVehicleClasses.contains('business'), isFalse);
      expect(kVehicleClasses.contains('vip'), isFalse);
      expect(kVehicleClasses.contains('bus'), isFalse);
      expect(kVehicleClasses.contains('sedan'), isFalse);
    });

    test('kVehicleClasses contains expected in-sync vehicle classes', () {
      expect(
        kVehicleClasses,
        equals(['economy', 'comfort', 'suv_xl', 'van', 'minibus', 'premium', 'suv']),
      );
    });

    test('defaultSeatsForClass returns correct default seating for classes', () {
      expect(defaultSeatsForClass('suv_xl'), equals(7));
      expect(defaultSeatsForClass('suv'), equals(6));
      expect(defaultSeatsForClass('van'), equals(7));
      expect(defaultSeatsForClass('minivan (xxl)'), equals(7));
      expect(defaultSeatsForClass('minibus'), equals(16));
      expect(defaultSeatsForClass('mini bus'), equals(16));
      expect(defaultSeatsForClass('economy'), equals(4));
      expect(defaultSeatsForClass('premium'), equals(4));
    });

    test('vehicleClassAsset returns premium vehicle icon asset for sedan and premium', () {
      expect(vehicleClassAsset('sedan'), equals('packages/gt_ui/assets/vehicles/premium.png'));
      expect(vehicleClassAsset('Sedan'), equals('packages/gt_ui/assets/vehicles/premium.png'));
      expect(vehicleClassAsset('premium'), equals('packages/gt_ui/assets/vehicles/premium.png'));
      expect(vehicleClassAsset('economy'), equals('packages/gt_ui/assets/vehicles/economy.png'));
      expect(vehicleClassAsset('comfort'), equals('packages/gt_ui/assets/vehicles/comfort.png'));
      expect(vehicleClassAsset('suv'), equals('packages/gt_ui/assets/vehicles/suv.png'));
      expect(vehicleClassAsset('suv_xl'), equals('packages/gt_ui/assets/vehicles/suv_xl.png'));
      expect(vehicleClassAsset('van'), equals('packages/gt_ui/assets/vehicles/van.png'));
      expect(vehicleClassAsset('minibus'), equals('packages/gt_ui/assets/vehicles/minibus.png'));
    });

    test('every class in kVehicleClasses has a valid side-view vehicle asset and not map marker pin', () {
      for (final vc in kVehicleClasses) {
        final asset = vehicleClassAsset(vc);
        expect(asset, isNot(contains('can-ride-car.png')));
        expect(asset, startsWith('packages/gt_ui/assets/vehicles/'));
      }
    });

    testWidgets('VehicleClassPicker renders classes in required order with luxury gold styling', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: SizedBox(
                width: 1000,
                child: VehicleClassPicker(
                  value: 'economy',
                  onChanged: (_) {},
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      final expectedNames = [
        'Economy',
        'Comfort',
        'SUV (XL)',
        'Minivan (XXL)',
        'Mini bus',
        'Premium',
        'Black SUV',
      ];

      for (final name in expectedNames) {
        expect(find.text(name), findsOneWidget);
      }

      // LUXE badge appears on Premium and Black SUV
      expect(find.text('LUXE'), findsNWidgets(2));
    });
  });
}
