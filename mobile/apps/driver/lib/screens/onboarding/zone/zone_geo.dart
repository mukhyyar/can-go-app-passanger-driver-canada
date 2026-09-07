import 'dart:math' as math;

import 'package:gt_mock/gt_mock.dart';
import 'package:latlong2/latlong.dart';

/// Geographic helpers for operating-zone circle / freehand drawing.
class ZoneGeo {
  ZoneGeo._();

  static const _distance = Distance();

  /// Approximate circle as a closed polygon using geodesic offsets.
  static List<GeoPoint> circleToPolygon(
    GeoPoint center,
    double radiusKm, {
    int steps = 64,
  }) {
    final origin = LatLng(center.latitude, center.longitude);
    final meters = radiusKm * 1000.0;
    final out = <GeoPoint>[];
    for (var i = 0; i < steps; i++) {
      final bearing = (360.0 / steps) * i;
      final p = _distance.offset(origin, meters, bearing);
      out.add(GeoPoint(latitude: p.latitude, longitude: p.longitude));
    }
    return out;
  }

  static double distanceKm(GeoPoint a, GeoPoint b) {
    return _distance.as(
          LengthUnit.Kilometer,
          LatLng(a.latitude, a.longitude),
          LatLng(b.latitude, b.longitude),
        );
  }

  /// Point-in-circle using geodesic distance.
  static bool containsInCircle(
    LatLng point,
    GeoPoint center,
    double radiusKm,
  ) {
    final d = _distance.as(
      LengthUnit.Kilometer,
      LatLng(center.latitude, center.longitude),
      point,
    );
    return d <= radiusKm;
  }

  /// Ramer–Douglas–Peucker simplification (epsilon in degrees ≈ map units).
  static List<GeoPoint> simplifyRdp(List<GeoPoint> points, double epsilon) {
    if (points.length < 3) return List<GeoPoint>.from(points);
    final keep = List<bool>.filled(points.length, false);
    keep[0] = true;
    keep[points.length - 1] = true;
    _rdp(points, 0, points.length - 1, epsilon, keep);
    final out = <GeoPoint>[];
    for (var i = 0; i < points.length; i++) {
      if (keep[i]) out.add(points[i]);
    }
    return out.length >= 3 ? out : List<GeoPoint>.from(points);
  }

  static void _rdp(
    List<GeoPoint> pts,
    int first,
    int last,
    double epsilon,
    List<bool> keep,
  ) {
    if (last <= first + 1) return;
    var maxDist = 0.0;
    var index = first;
    final a = pts[first];
    final b = pts[last];
    for (var i = first + 1; i < last; i++) {
      final d = _perpDistance(pts[i], a, b);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > epsilon) {
      keep[index] = true;
      _rdp(pts, first, index, epsilon, keep);
      _rdp(pts, index, last, epsilon, keep);
    }
  }

  static double _perpDistance(GeoPoint p, GeoPoint a, GeoPoint b) {
    final x = p.longitude;
    final y = p.latitude;
    final x1 = a.longitude;
    final y1 = a.latitude;
    final x2 = b.longitude;
    final y2 = b.latitude;
    final dx = x2 - x1;
    final dy = y2 - y1;
    if (dx == 0 && dy == 0) {
      return math.sqrt(math.pow(x - x1, 2) + math.pow(y - y1, 2));
    }
    final t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
    final projX = x1 + t * dx;
    final projY = y1 + t * dy;
    return math.sqrt(math.pow(x - projX, 2) + math.pow(y - projY, 2));
  }

  static OperatingZone circleZone({
    required String id,
    required String name,
    required GeoPoint center,
    required double radiusKm,
  }) {
    return OperatingZone(
      id: id,
      name: name,
      type: OperatingZoneType.circle,
      center: center,
      radiusKm: radiusKm,
      coordinates: circleToPolygon(center, radiusKm),
    );
  }

  static OperatingZone polygonZone({
    required String id,
    required String name,
    required List<GeoPoint> coordinates,
  }) {
    return OperatingZone(
      id: id,
      name: name,
      type: OperatingZoneType.polygon,
      coordinates: coordinates,
    );
  }
}
