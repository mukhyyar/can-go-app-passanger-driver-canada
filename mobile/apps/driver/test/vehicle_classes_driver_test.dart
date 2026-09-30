import 'package:driver/screens/settings/vehicle_form_widgets.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Driver Vehicle Classes', () {
    test('kVehicleClasses excludes business and vip', () {
      expect(kVehicleClasses.contains('business'), isFalse);
      expect(kVehicleClasses.contains('vip'), isFalse);
    });

    test('kVehicleClasses contains expected standard driver vehicle classes', () {
      expect(kVehicleClasses, containsAll(['sedan', 'suv', 'van', 'minibus', 'economy', 'comfort']));
    });
  });
}
