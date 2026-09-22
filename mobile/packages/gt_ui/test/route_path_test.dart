import 'package:flutter_test/flutter_test.dart';
import 'package:gt_ui/gt_ui.dart';

void main() {
  group('RoutePathSampler', () {
    test('handles empty and single-point lists gracefully', () {
      final emptySampler = RoutePathSampler(const []);
      expect(emptySampler.isEmpty, isTrue);
      expect(emptySampler.totalMeters, 0.0);
      final sEmpty = emptySampler.sample(0.5);
      expect(sEmpty.lat, 0.0);
      expect(sEmpty.lng, 0.0);

      final singleSampler = RoutePathSampler(const [RouteLatLng(43.6532, -79.3832)]);
      expect(singleSampler.isEmpty, isTrue);
      final sSingle = singleSampler.sample(0.5);
      expect(sSingle.lat, 43.6532);
      expect(sSingle.lng, -79.3832);
    });

    test('binary search sampleAtDistance accurately finds points along multi-point path', () {
      // Toronto to Montreal route points
      final points = [
        const RouteLatLng(43.6532, -79.3832), // Toronto
        const RouteLatLng(44.2312, -76.4860), // Kingston
        const RouteLatLng(45.5017, -73.5673), // Montreal
      ];
      final sampler = RoutePathSampler(points);
      expect(sampler.isEmpty, isFalse);
      expect(sampler.totalMeters, greaterThan(400000)); // ~500 km

      final start = sampler.sample(0.0);
      expect(start.lat, closeTo(43.6532, 1e-4));
      expect(start.lng, closeTo(-79.3832, 1e-4));
      expect(start.bearingDeg, greaterThan(0));

      final mid = sampler.sample(0.5);
      expect(mid.lat, greaterThan(43.6532));
      expect(mid.lat, lessThan(45.5017));

      final end = sampler.sample(1.0);
      expect(end.lat, closeTo(45.5017, 1e-4));
      expect(end.lng, closeTo(-73.5673, 1e-4));
    });
  });

  group('precomputeTrajectory', () {
    test('returns empty for fewer than 2 points', () async {
      expect(await precomputeTrajectory(const []), isEmpty);
      expect(await precomputeTrajectory(const [RouteLatLng(43.0, -79.0)]), isEmpty);
    });

    test('precomputes keyframes with valid positions and bearings', () async {
      final points = [
        const RouteLatLng(43.6532, -79.3832),
        const RouteLatLng(43.6600, -79.3800),
        const RouteLatLng(43.6700, -79.3750),
      ];

      final frames = await precomputeTrajectory(points, sampleCount: 50);
      expect(frames.length, equals(50));

      // First frame matches start
      expect(frames.first.lat, closeTo(43.6532, 1e-4));
      expect(frames.first.lng, closeTo(-79.3832, 1e-4));

      // Last frame matches end
      expect(frames.last.lat, closeTo(43.6700, 1e-4));
      expect(frames.last.lng, closeTo(-79.3750, 1e-4));

      // Bearings are valid degrees [0, 360)
      for (final f in frames) {
        expect(f.bearingDeg, greaterThanOrEqualTo(0.0));
        expect(f.bearingDeg, lessThan(360.0));
      }
    });
  });
}
