import 'dart:math' as math;

/// A lat/lng point used for route sampling (platform-agnostic).
class RouteLatLng {
  const RouteLatLng(this.lat, this.lng);
  final double lat;
  final double lng;
}

/// Sampled position + heading along a polyline.
class RouteSample {
  const RouteSample({
    required this.lat,
    required this.lng,
    required this.bearingDeg,
  });

  final double lat;
  final double lng;

  /// Degrees clockwise from north (0 = north, 90 = east).
  final double bearingDeg;
}

/// Cumulative-distance sampler for animating along an A→B polyline.
class RoutePathSampler {
  RoutePathSampler(List<RouteLatLng> points) : _points = List.unmodifiable(points) {
    _cum = [0.0];
    for (var i = 1; i < _points.length; i++) {
      _cum.add(_cum[i - 1] + _haversineM(_points[i - 1], _points[i]));
    }
    _total = _cum.isEmpty ? 0.0 : _cum.last;
  }

  final List<RouteLatLng> _points;
  late final List<double> _cum;
  late final double _total;

  bool get isEmpty => _points.length < 2 || _total <= 0;
  double get totalMeters => _total;
  List<RouteLatLng> get points => _points;

  /// [t] in `[0, 1]` — progress along the full path.
  RouteSample sample(double t) {
    if (_points.isEmpty) {
      return const RouteSample(lat: 0, lng: 0, bearingDeg: 0);
    }
    if (_points.length == 1 || _total <= 0) {
      final p = _points.first;
      return RouteSample(lat: p.lat, lng: p.lng, bearingDeg: 0);
    }
    final clamped = t.clamp(0.0, 1.0);
    final d = clamped * _total;
    return sampleAtDistance(d);
  }

  RouteSample sampleAtDistance(double distanceM) {
    if (_points.isEmpty) {
      return const RouteSample(lat: 0, lng: 0, bearingDeg: 0);
    }
    if (_points.length == 1 || _total <= 0) {
      final p = _points.first;
      return RouteSample(lat: p.lat, lng: p.lng, bearingDeg: 0);
    }

    final d = distanceM.clamp(0.0, _total);
    for (var i = 1; i < _points.length; i++) {
      if (d <= _cum[i]) {
        final segLen = (_cum[i] - _cum[i - 1]).clamp(1e-6, double.infinity);
        final localT = (d - _cum[i - 1]) / segLen;
        final a = _points[i - 1];
        final b = _points[i];
        return RouteSample(
          lat: a.lat + (b.lat - a.lat) * localT,
          lng: a.lng + (b.lng - a.lng) * localT,
          bearingDeg: _bearingDeg(a, b),
        );
      }
    }
    final last = _points.last;
    final prev = _points[_points.length - 2];
    return RouteSample(
      lat: last.lat,
      lng: last.lng,
      bearingDeg: _bearingDeg(prev, last),
    );
  }

  static double _toRad(double d) => d * math.pi / 180;
  static double _toDeg(double r) => r * 180 / math.pi;

  static double _haversineM(RouteLatLng a, RouteLatLng b) {
    const earthR = 6371000.0;
    final dLat = _toRad(b.lat - a.lat);
    final dLng = _toRad(b.lng - a.lng);
    final lat1 = _toRad(a.lat);
    final lat2 = _toRad(b.lat);
    final h = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(lat1) * math.cos(lat2) * math.sin(dLng / 2) * math.sin(dLng / 2);
    return 2 * earthR * math.asin(math.min(1.0, math.sqrt(h)));
  }

  static double _bearingDeg(RouteLatLng a, RouteLatLng b) {
    final lat1 = _toRad(a.lat);
    final lat2 = _toRad(b.lat);
    final dLng = _toRad(b.lng - a.lng);
    final y = math.sin(dLng) * math.cos(lat2);
    final x = math.cos(lat1) * math.sin(lat2) -
        math.sin(lat1) * math.cos(lat2) * math.cos(dLng);
    return (_toDeg(math.atan2(y, x)) + 360) % 360;
  }
}

/// Asset path for the top-down Can-Ride car map marker.
const kCanRideCarAsset = 'packages/gt_ui/assets/can-ride-car.png';

/// Native pixel size of `can-ride-car.png` (tight-cropped top-down, nose up).
const kCanRideCarNativeWidth = 336;
const kCanRideCarNativeHeight = 742;

/// Width ÷ height of the trimmed car asset (~0.453).
const kCanRideCarAspect =
    kCanRideCarNativeWidth / kCanRideCarNativeHeight;

/// On-map marker height in CSS/logical pixels (width = height × aspect).
const kCanRideCarMarkerHeight = 28.0;

/// Marker width matching [kCanRideCarMarkerHeight] and asset aspect.
const kCanRideCarMarkerWidth =
    kCanRideCarMarkerHeight * kCanRideCarAspect;
