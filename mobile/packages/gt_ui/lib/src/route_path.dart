import 'dart:math' as math;
import 'package:flutter/foundation.dart';

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

/// Parameters passed to the background isolate for trajectory generation.
class TrajectoryParams {
  const TrajectoryParams({
    required this.points,
    this.sampleCount = 120,
  });

  final List<RouteLatLng> points;
  final int sampleCount;
}

/// Top-level function executed in a background isolate via [compute].
///
/// Offloads all Haversine cumulative distance calculations, bearing trigonometry
/// (`atan2`, `sin`, `cos`), and keyframe interpolation from the main UI thread.
List<RouteSample> computeTrajectoryIsolate(TrajectoryParams params) {
  final sampler = RoutePathSampler(params.points);
  if (sampler.isEmpty) return const [];

  final count = params.sampleCount.clamp(20, 400);
  final samples = <RouteSample>[];
  for (var i = 0; i < count; i++) {
    final t = i / (count - 1);
    samples.add(sampler.sample(t));
  }
  return samples;
}

/// Asynchronously precomputes a sampled trajectory for the given route points.
///
/// Runs in a background isolate via [compute] so the main UI thread stays 100% free
/// for scrolling and animations.
Future<List<RouteSample>> precomputeTrajectory(
  List<RouteLatLng> points, {
  int sampleCount = 120,
}) async {
  if (points.length < 2) return const [];
  if (kIsWeb || points.length < 10) {
    return computeTrajectoryIsolate(
      TrajectoryParams(points: points, sampleCount: sampleCount),
    );
  }
  try {
    return await compute(
      computeTrajectoryIsolate,
      TrajectoryParams(points: points, sampleCount: sampleCount),
    );
  } catch (_) {
    return computeTrajectoryIsolate(
      TrajectoryParams(points: points, sampleCount: sampleCount),
    );
  }
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

    // O(log N) binary search on cumulative distances instead of O(N) linear loop.
    var low = 1;
    var high = _points.length - 1;
    var idx = high;
    while (low <= high) {
      final mid = (low + high) >> 1;
      if (_cum[mid] >= d) {
        idx = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    final segLen = (_cum[idx] - _cum[idx - 1]).clamp(1e-6, double.infinity);
    final localT = (d - _cum[idx - 1]) / segLen;
    final a = _points[idx - 1];
    final b = _points[idx];
    return RouteSample(
      lat: a.lat + (b.lat - a.lat) * localT,
      lng: a.lng + (b.lng - a.lng) * localT,
      bearingDeg: _bearingDeg(a, b),
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
