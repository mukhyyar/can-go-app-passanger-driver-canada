import 'package:flutter_test/flutter_test.dart';
import 'package:gt_mock/gt_mock.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Location resolution and Place properties', () {
    test('Place.hasCoords correctly identifies coordinates', () {
      const placeWithCoords = Place(
        id: 'p1',
        label: 'Union Station',
        subtitle: 'Toronto, ON',
        lat: 43.6453,
        lng: -79.3806,
      );
      expect(placeWithCoords.hasCoords, isTrue);

      const placeWithoutCoords = Place(
        id: 'p2',
        label: '123 Fake Street',
        subtitle: 'Toronto, ON',
        lat: 0.0,
        lng: 0.0,
      );
      expect(placeWithoutCoords.hasCoords, isFalse);

      const placeWithNullCoords = Place(
        id: 'p3',
        label: '456 Fake Street',
        subtitle: 'Toronto, ON',
      );
      expect(placeWithNullCoords.hasCoords, isFalse);
    });

    test('resolvePlaceDetails returns place immediately if coordinates already exist', () async {
      final repo = MockRepository.instance;
      const placeWithCoords = Place(
        id: 'p1',
        label: 'CN Tower',
        lat: 43.6426,
        lng: -79.3871,
      );
      final resolved = await repo.resolvePlaceDetails(placeWithCoords);
      expect(resolved, isNotNull);
      expect(resolved!.lat, equals(43.6426));
      expect(resolved.lng, equals(-79.3871));
    });

    test('searchPlaces returns local mock fallback if network is unreachable', () async {
      final repo = MockRepository.instance;
      // Should not throw even when network/backend is offline; returns mock results
      final results = await repo.searchPlaces('Airport');
      expect(results, isNotEmpty);
      expect(results.first.hasCoords, isTrue);
    });

    test('searchPlaces works without GPS bias lat/lng', () async {
      final repo = MockRepository.instance;
      // Passenger address search must not require device coordinates.
      final results = await repo.searchPlaces(
        'Airport',
        sessionToken: 'test-session-token',
      );
      expect(results, isNotEmpty);
    });
  });
}
