import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import 'route_path.dart';
import 'theme.dart';

const _apiBaseFromEnv = String.fromEnvironment('CANGO_API_BASE');
const _localApiBase = 'http://127.0.0.1:4000/api';
const _prodApiBase = 'https://www.can-rides.ca/api';

const _carAnimDuration = Duration(seconds: 10);

String get _normalizedApiBase {
  final raw = _apiBaseFromEnv.isNotEmpty
      ? _apiBaseFromEnv
      : (kReleaseMode ? _prodApiBase : _localApiBase);
  return raw.endsWith('/') ? raw.substring(0, raw.length - 1) : raw;
}

/// Native route map (OpenStreetMap tiles — works without an Android Maps SDK key).
Widget buildGoogleMapEmbed({
  required double fromLat,
  required double fromLng,
  double? toLat,
  double? toLng,
}) {
  return _NativeRouteMap(
    fromLat: fromLat,
    fromLng: fromLng,
    toLat: toLat,
    toLng: toLng,
  );
}

class _NativeRouteMap extends StatefulWidget {
  const _NativeRouteMap({
    required this.fromLat,
    required this.fromLng,
    this.toLat,
    this.toLng,
  });

  final double fromLat;
  final double fromLng;
  final double? toLat;
  final double? toLng;

  @override
  State<_NativeRouteMap> createState() => _NativeRouteMapState();
}

class _NativeRouteMapState extends State<_NativeRouteMap>
    with SingleTickerProviderStateMixin {
  final MapController _map = MapController();
  List<LatLng> _routePoints = const [];
  bool _fitted = false;
  RoutePathSampler? _sampler;
  late final AnimationController _carCtrl;
  LatLng? _carPos;
  double _carBearing = 0;

  bool get _hasRoute => widget.toLat != null && widget.toLng != null;

  LatLng get _from => LatLng(widget.fromLat, widget.fromLng);
  LatLng? get _to =>
      _hasRoute ? LatLng(widget.toLat!, widget.toLng!) : null;

  @override
  void initState() {
    super.initState();
    _carCtrl = AnimationController(vsync: this, duration: _carAnimDuration)
      ..addListener(_onCarTick);
    if (_hasRoute) {
      unawaited(_loadRoute());
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) => _fitBounds());
    }
  }

  @override
  void didUpdateWidget(covariant _NativeRouteMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.fromLat != widget.fromLat ||
        oldWidget.fromLng != widget.fromLng ||
        oldWidget.toLat != widget.toLat ||
        oldWidget.toLng != widget.toLng) {
      _fitted = false;
      _routePoints = const [];
      _stopCar();
      if (_hasRoute) {
        unawaited(_loadRoute());
      } else {
        setState(() {});
        _fitBounds();
      }
    }
  }

  @override
  void dispose() {
    _carCtrl.removeListener(_onCarTick);
    _carCtrl.dispose();
    _map.dispose();
    super.dispose();
  }

  void _onCarTick() {
    final sampler = _sampler;
    if (sampler == null || sampler.isEmpty) return;
    final sample = sampler.sample(_carCtrl.value);
    setState(() {
      _carPos = LatLng(sample.lat, sample.lng);
      _carBearing = sample.bearingDeg;
    });
  }

  void _stopCar() {
    _carCtrl.stop();
    _carCtrl.reset();
    _sampler = null;
    _carPos = null;
    _carBearing = 0;
  }

  void _startCar(List<LatLng> points) {
    if (points.length < 2) {
      _stopCar();
      return;
    }
    final sampler = RoutePathSampler(
      points.map((p) => RouteLatLng(p.latitude, p.longitude)).toList(),
    );
    if (sampler.isEmpty) {
      _stopCar();
      return;
    }
    _sampler = sampler;
    final first = sampler.sample(0);
    _carPos = LatLng(first.lat, first.lng);
    _carBearing = first.bearingDeg;
    _carCtrl
      ..duration = _carAnimDuration
      ..repeat();
  }

  Future<void> _loadRoute() async {
    final to = _to;
    if (to == null) return;
    try {
      final uri = Uri.parse('$_normalizedApiBase/maps/route');
      final client = HttpClient();
      final req = await client.postUrl(uri);
      req.headers.contentType = ContentType.json;
      req.write(
        jsonEncode({
          'fromLat': widget.fromLat,
          'fromLng': widget.fromLng,
          'toLat': widget.toLat,
          'toLng': widget.toLng,
        }),
      );
      final res = await req.close();
      final body = await res.transform(utf8.decoder).join();
      client.close(force: true);

      var points = _parseRoutePoints(body);
      if (points.isEmpty) {
        points = [_from, to];
      }
      if (!mounted) return;
      setState(() => _routePoints = points);
      _startCar(points);
      _fitBounds(extra: points);
    } catch (_) {
      if (!mounted) return;
      final fallback = [_from, if (_to != null) _to!];
      if (fallback.length >= 2) {
        setState(() => _routePoints = fallback);
        _startCar(fallback);
      }
      _fitBounds();
    }
  }

  List<LatLng> _parseRoutePoints(String body) {
    try {
      final data = jsonDecode(body);
      if (data is! Map) return const [];
      final geometry = data['geometry'];
      if (geometry is Map && geometry['coordinates'] is List) {
        final pts = <LatLng>[];
        for (final c in geometry['coordinates'] as List) {
          if (c is List && c.length >= 2) {
            final lng = (c[0] as num).toDouble();
            final lat = (c[1] as num).toDouble();
            pts.add(LatLng(lat, lng));
          }
        }
        if (pts.isNotEmpty) return pts;
      }
      final overview = data['overviewPolyline'];
      if (overview is String && overview.isNotEmpty) {
        return _decodePolyline(overview);
      }
    } catch (_) {}
    return const [];
  }

  List<LatLng> _decodePolyline(String encoded) {
    final coords = <LatLng>[];
    var index = 0;
    var lat = 0;
    var lng = 0;
    while (index < encoded.length) {
      var result = 0;
      var shift = 0;
      int b;
      do {
        b = encoded.codeUnitAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lat += (result & 1) != 0 ? ~(result >> 1) : (result >> 1);
      result = 0;
      shift = 0;
      do {
        b = encoded.codeUnitAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lng += (result & 1) != 0 ? ~(result >> 1) : (result >> 1);
      coords.add(LatLng(lat / 1e5, lng / 1e5));
    }
    return coords;
  }

  void _fitBounds({List<LatLng> extra = const []}) {
    if (_fitted) return;
    final pts = <LatLng>[_from, if (_to != null) _to!, ...extra];
    if (pts.length == 1) {
      _map.move(pts.first, 13);
      _fitted = true;
      return;
    }
    var minLat = pts.first.latitude;
    var maxLat = pts.first.latitude;
    var minLng = pts.first.longitude;
    var maxLng = pts.first.longitude;
    for (final p in pts.skip(1)) {
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLng) minLng = p.longitude;
      if (p.longitude > maxLng) maxLng = p.longitude;
    }
    final bounds = LatLngBounds(
      LatLng(minLat, minLng),
      LatLng(maxLat, maxLng),
    );
    _map.fitCamera(
      CameraFit.bounds(bounds: bounds, padding: const EdgeInsets.all(48)),
    );
    _fitted = true;
  }

  @override
  Widget build(BuildContext context) {
    final to = _to;
    final car = _carPos;
    return FlutterMap(
      mapController: _map,
      options: MapOptions(
        initialCenter: _from,
        initialZoom: 13,
        onMapReady: () {
          if (!_fitted) _fitBounds(extra: _routePoints);
        },
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.gettransfer.passenger',
        ),
        if (_routePoints.length >= 2)
          PolylineLayer(
            polylines: [
              Polyline(
                points: _routePoints,
                color: GtColors.brand,
                strokeWidth: 5,
              ),
            ],
          ),
        MarkerLayer(
          markers: [
            Marker(
              point: _from,
              width: 36,
              height: 36,
              child: const _EndpointPin(label: 'A', color: GtColors.brand),
            ),
            if (to != null)
              Marker(
                point: to,
                width: 36,
                height: 36,
                child: const _EndpointPin(label: 'B', color: Color(0xFF1A1A1A)),
              ),
            if (car != null)
              Marker(
                point: car,
                width: 48,
                height: 48,
                child: Transform.rotate(
                  angle: _carBearing * math.pi / 180,
                  child: Image.asset(
                    'assets/can-ride-car.png',
                    package: 'gt_ui',
                    width: 40,
                    height: 40,
                    fit: BoxFit.contain,
                  ),
                ),
              ),
          ],
        ),
        const RichAttributionWidget(
          attributions: [
            TextSourceAttribution('OpenStreetMap'),
          ],
          alignment: AttributionAlignment.bottomLeft,
        ),
      ],
    );
  }
}

class _EndpointPin extends StatelessWidget {
  const _EndpointPin({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 2),
        boxShadow: const [
          BoxShadow(color: Color(0x33000000), blurRadius: 4, offset: Offset(0, 1)),
        ],
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
    );
  }
}
