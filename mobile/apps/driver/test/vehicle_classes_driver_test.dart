import 'package:driver/screens/settings/vehicle_form_widgets.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Driver Vehicle Classes', () {
    test('kVehicleClasses excludes business, vip, and bus', () {
      expect(kVehicleClasses.contains('business'), isFalse);
      expect(kVehicleClasses.contains('vip'), isFalse);
      expect(kVehicleClasses.contains('bus'), isFalse);
    });

    test('kVehicleClasses contains expected standard driver vehicle classes', () {
      expect(kVehicleClasses, containsAll(['sedan', 'suv', 'suv_xl', 'van', 'minibus', 'economy', 'comfort']));
      expect(kVehicleClasses, isNot(contains('bus')));
    });

    test('defaultSeatsForClass returns correct default seating for classes', () {
      expect(defaultSeatsForClass('suv_xl'), equals(7));
      expect(defaultSeatsForClass('suv'), equals(6));
      expect(defaultSeatsForClass('van'), equals(7));
      expect(defaultSeatsForClass('minivan (xxl)'), equals(7));
      expect(defaultSeatsForClass('minibus'), equals(16));
      expect(defaultSeatsForClass('mini bus'), equals(16));
      expect(defaultSeatsForClass('economy'), equals(4));
    });
  });
}
