import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('Driver Lost Item Inquiry Model Mapping', () {
    test('DriverRequest defaults hasLostItemRequest to false', () {
      const req = DriverRequest(
        id: 'driver-req-1',
        datetimeLabel: 'Today, 3:00 PM',
        from: 'Downtown',
        to: 'Airport',
        distance: '25 km',
        duration: '30 min',
        vehicleNeed: 'Standard',
        passengers: 2,
      );
      expect(req.hasLostItemRequest, isFalse);
    });

    test('driverRequestFromServer maps hasLostItemRequest correctly when true', () {
      final json = {
        'id': 'trip-completed-1',
        'pickupAt': '2026-09-21T16:00:00.000Z',
        'fromLabel': '100 King St',
        'toLabel': 'Toronto Pearson Airport',
        'status': 'COMPLETED',
        'adults': 2,
        'hasLostItemRequest': true,
      };

      final req = driverRequestFromServer(json);
      expect(req.id, equals('trip-completed-1'));
      expect(req.hasLostItemRequest, isTrue);
      expect(req.status, equals('COMPLETED'));
    });

    test('driverRequestFromServer maps hasLostItemRequest correctly when false or absent', () {
      final json = {
        'id': 'trip-completed-2',
        'pickupAt': '2026-09-21T16:00:00.000Z',
        'fromLabel': '100 King St',
        'toLabel': 'Toronto Pearson Airport',
        'status': 'COMPLETED',
        'adults': 1,
      };

      final req = driverRequestFromServer(json);
      expect(req.hasLostItemRequest, isFalse);
    });

    test('DriverRequest copyWith preserves or updates hasLostItemRequest', () {
      const initial = DriverRequest(
        id: 'req-copy-1',
        datetimeLabel: 'Now',
        from: 'A',
        to: 'B',
        distance: '5 km',
        duration: '10 min',
        vehicleNeed: 'Sedan',
        passengers: 1,
        hasLostItemRequest: false,
      );

      final updated = initial.copyWith(hasLostItemRequest: true);
      expect(updated.hasLostItemRequest, isTrue);

      final untouched = updated.copyWith(status: 'COMPLETED');
      expect(untouched.hasLostItemRequest, isTrue);
    });
  });
}
