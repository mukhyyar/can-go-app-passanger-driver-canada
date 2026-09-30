import 'package:flutter_test/flutter_test.dart';
import 'package:gt_mock/gt_mock.dart';

void main() {
  group('Vehicle Classes', () {
    test('MockData.vehicleClasses excludes business and vip', () {
      final ids = MockData.vehicleClasses.map((v) => v.id.toLowerCase()).toSet();
      final names = MockData.vehicleClasses.map((v) => v.name.toLowerCase()).toSet();

      expect(ids.contains('business'), isFalse);
      expect(ids.contains('vip'), isFalse);
      expect(names.contains('business'), isFalse);
      expect(names.contains('vip'), isFalse);
    });

    test('MockData.vehicleClasses contains remaining active classes', () {
      final ids = MockData.vehicleClasses.map((v) => v.id).toList();
      expect(ids, containsAll(['economy', 'comfort', 'premium', 'suv', 'van', 'minibus', 'bus']));
    });
  });
}
