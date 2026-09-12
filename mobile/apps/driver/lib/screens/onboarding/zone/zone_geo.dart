import 'dart:math' as math;

import 'package:gt_mock/gt_mock.dart';

/// Geographic helpers for operating-zone circle / freehand drawing.
class ZoneGeo {
  ZoneGeo._();

  /// Approximate circle as a closed polygon using geodesic offsets.
  static List<GeoPoint> circleToPolygon(
    GeoPoint center,
    double radiusKm, {
    int steps = 64,
  }) {
    final meters = radiusKm * 1000.0;
    final out = <GeoPoint>[];
    for (var i = 0; i < steps; i++) {
      final bearing = (360.0 / steps) * i;
      out.add(_offset(center, meters, bearing));
    }
    return out;
  }

  static GeoPoint _offset(GeoPoint origin, double meters, double bearingDeg) {
    const earth = 6371000.0;
    final brng = bearingDeg * math.pi / 180;
    final lat1 = origin.latitude * math.pi / 180;
    final lng1 = origin.longitude * math.pi / 180;
    final ang = meters / earth;
    final lat2 = math.asin(
      math.sin(lat1) * math.cos(ang) +
          math.cos(lat1) * math.sin(ang) * math.cos(brng),
    );
    final lng2 = lng1 +
        math.atan2(
          math.sin(brng) * math.sin(ang) * math.cos(lat1),
          math.cos(ang) - math.sin(lat1) * math.sin(lat2),
        );
    return GeoPoint(
      latitude: lat2 * 180 / math.pi,
      longitude: lng2 * 180 / math.pi,
    );
  }

  static double distanceKm(GeoPoint a, GeoPoint b) {
    const r = 6371.0;
    final dLat = _rad(b.latitude - a.latitude);
    final dLng = _rad(b.longitude - a.longitude);
    final la1 = _rad(a.latitude);
    final la2 = _rad(b.latitude);
    final h = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(la1) * math.cos(la2) * math.sin(dLng / 2) * math.sin(dLng / 2);
    return 2 * r * math.asin(math.min(1, math.sqrt(h)));
  }

  static double _rad(double d) => d * math.pi / 180;

  /// Point-in-circle using geodesic distance.
  static bool containsInCircle(
    GeoPoint point,
    GeoPoint center,
    double radiusKm,
  ) {
    return distanceKm(point, center) <= radiusKm;
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
