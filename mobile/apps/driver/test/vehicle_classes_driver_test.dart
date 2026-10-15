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
      expect(kVehicleClasses, containsAll(['sedan', 'suv', 'van', 'minibus', 'economy', 'comfort']));
      expect(kVehicleClasses, isNot(contains('bus')));
    });
  });
}
