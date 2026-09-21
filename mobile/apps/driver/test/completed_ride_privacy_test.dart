import 'package:flutter_test/flutter_test.dart';
import 'package:gt_api/gt_api.dart';

void main() {
  group('Completed ride privacy tests (passenger & driver name redaction)', () {
    test('driverRequestFromServer strips passengerName when status is COMPLETED', () {
      final activeRequest = driverRequestFromServer({
        'id': 'ride-active-1',
        'status': 'TRIP_STARTED',
        'fromLabel': 'Union Station, Toronto',
        'toLabel': 'Pearson Airport',
        'passengerName': 'Sarah Connor',
      });
      expect(activeRequest.passengerName, 'Sarah Connor');

      final completedRequest = driverRequestFromServer({
        'id': 'ride-completed-1',
        'status': 'COMPLETED',
        'fromLabel': 'Union Station, Toronto',
        'toLabel': 'Pearson Airport',
        'passengerName': 'Sarah Connor',
      });
      expect(completedRequest.passengerName, isNull);
    });

    test('offerFromServer strips driverName when status is COMPLETED', () {
      final activeOffer = offerFromServer({
        'id': 'offer-active-1',
        'status': 'ACCEPTED',
        'price': 65.0,
        'currency': 'CAD',
        'driver': {
          'id': 'driver-1',
          'fullName': 'John Doe',
        },
        'vehicle': {
          'name': 'Toyota Camry',
          'vehicleClass': 'Comfort',
        },
      });
      expect(activeOffer.driverName, 'John Doe');

      final completedOffer = offerFromServer({
        'id': 'offer-completed-1',
        'status': 'COMPLETED',
        'price': 65.0,
        'currency': 'CAD',
        'driver': {
          'id': 'driver-1',
          'fullName': 'John Doe',
        },
        'vehicle': {
          'name': 'Toyota Camry',
          'vehicleClass': 'Comfort',
        },
      });
      expect(completedOffer.driverName, isNull);
    });
  });
}
