import 'package:driver/state/driver_settings_mappers.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_mock/gt_mock.dart';

void main() {
  test('operatingZoneFromServer maps polygon ring', () {
    final zone = operatingZoneFromServer({
      'id': 'z1',
      'name': 'GTA',
      'zoneType': 'polygon',
      'geoJson': {
        'type': 'Polygon',
        'coordinates': [
          [
            [-79.5, 43.7],
            [-79.4, 43.7],
            [-79.4, 43.8],
            [-79.5, 43.8],
            [-79.5, 43.7],
          ],
        ],
      },
    });
    expect(zone.id, 'z1');
    expect(zone.type, OperatingZoneType.polygon);
    expect(zone.coordinates.length, 4);
    expect(zone.coordinates.first.latitude, 43.7);
    expect(zone.coordinates.first.longitude, -79.5);
  });

  test('operatingZoneFromServer maps circle', () {
    final zone = operatingZoneFromServer({
      'id': 'z2',
      'name': 'Airport',
      'zoneType': 'circle',
      'radiusKm': 12,
      'geoJson': {
        'center': [-79.6, 43.65],
        'radiusKm': 12,
      },
    });
    expect(zone.isCircle, isTrue);
    expect(zone.center!.latitude, 43.65);
    expect(zone.radiusKm, 12);
  });
}
