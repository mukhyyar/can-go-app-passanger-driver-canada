import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import 'route_path.dart';
import 'theme.dart';

const _apiBaseFromEnv = String.fromEnvironment('CANGO_API_BASE');
const _localApiBase = 'http://127.0.0.1:4000/api';
const _prodApiBase = 'https://www.can-rides.ca/api';

/// Logical size of A/B circle pin bitmaps.
const _pinLogicalSize = 40.0;

/// Visual car speed along the route (~80 m/s), clamped for short/long trips.
const _carAnimMetersPerSec = 80.0;
const _carAnimMinMs = 6000;
const _carAnimMaxMs = 18000;

Duration _carAnimDurationFor(double totalMeters) {
  final ms = (totalMeters / _carAnimMetersPerSec * 1000)
      .round()
      .clamp(_carAnimMinMs, _carAnimMaxMs);
  return Duration(milliseconds: ms);
}

String get _normalizedApiBase {
  final raw = _apiBaseFromEnv.isNotEmpty
      ? _apiBaseFromEnv
      : (kReleaseMode ? _prodApiBase : _localApiBase);
  return raw.endsWith('/') ? raw.substring(0, raw.length - 1) : raw;
}

/// Native route map via Google Maps SDK (API key in AndroidManifest).
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
  GoogleMapController? _map;
  List<LatLng> _routePoints = const [];
  bool _fitted = false;
  RoutePathSampler? _sampler;
  late final AnimationController _carCtrl;
  LatLng? _carPos;
  double _carBearing = 0;
  BitmapDescriptor? _carIcon;
  BitmapDescriptor? _pinA;
  BitmapDescriptor? _pinB;

  bool get _hasRoute => widget.toLat != null && widget.toLng != null;

  LatLng get _from => LatLng(widget.fromLat, widget.fromLng);
  LatLng? get _to =>
      _hasRoute ? LatLng(widget.toLat!, widget.toLng!) : null;

  @override
  void initState() {
    super.initState();
    _carCtrl = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 10),
    )..addListener(_onCarTick);
    unawaited(_loadIcons());
    if (_hasRoute) {
      unawaited(_loadRoute());
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) => _fitBounds());
    }
  }

  Future<void> _loadIcons() async {
    final car = await _carBitmap();
    final a = await _circlePinBitmap('A', GtColors.brand);
    final b = await _circlePinBitmap('B', const Color(0xFF1A1A1A));
    if (!mounted) return;
    setState(() {
      _carIcon = car;
      _pinA = a;
      _pinB = b;
    });
  }

  /// Same aspect as web (`kCanRideCarMarkerWidth` × height) on a square canvas
  /// so `Marker.rotation` does not squash the tall top-down car PNG.
  Future<BitmapDescriptor> _carBitmap() async {
    final dpr = ui.PlatformDispatcher.instance.views.first.devicePixelRatio;
    final displayW = kCanRideCarMarkerWidth * dpr;
    final displayH = kCanRideCarMarkerHeight * dpr;
    final canvasLogical =
        math.sqrt(
          kCanRideCarMarkerWidth * kCanRideCarMarkerWidth +
              kCanRideCarMarkerHeight * kCanRideCarMarkerHeight,
        );
    final canvasSize = (canvasLogical * dpr).ceilToDouble();

    final data = await rootBundle.load(
      'packages/gt_ui/assets/can-ride-car.png',
    );
    final codec = await ui.instantiateImageCodec(
      data.buffer.asUint8List(),
      targetWidth: displayW.round(),
      targetHeight: displayH.round(),
    );
    final frame = await codec.getNextFrame();
    final img = frame.image;

    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    canvas.drawImageRect(
      img,
      Rect.fromLTWH(0, 0, img.width.toDouble(), img.height.toDouble()),
      Rect.fromCenter(
        center: Offset(canvasSize / 2, canvasSize / 2),
        width: displayW,
        height: displayH,
      ),
      Paint()..filterQuality = FilterQuality.high,
    );
    img.dispose();

    final out = await recorder.endRecording().toImage(
      canvasSize.ceil(),
      canvasSize.ceil(),
    );
    final bytes = await out.toByteData(format: ui.ImageByteFormat.png);
    out.dispose();
    // Declare logical size so DPR-baked pixels are not treated as 1× dp.
    return BitmapDescriptor.bytes(
      bytes!.buffer.asUint8List(),
      width: canvasLogical,
      height: canvasLogical,
    );
  }

  Future<BitmapDescriptor> _circlePinBitmap(String label, Color color) async {
    final dpr = ui.PlatformDispatcher.instance.views.first.devicePixelRatio;
    final size = _pinLogicalSize * dpr;
    final stroke = 2.5 * dpr;
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    final fill = Paint()..color = color;
    final border = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke;
    final radius = size / 2 - stroke;
    canvas.drawCircle(Offset(size / 2, size / 2), radius, fill);
    canvas.drawCircle(Offset(size / 2, size / 2), radius, border);
    final tp = TextPainter(
      text: TextSpan(
        text: label,
        style: TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w700,
          fontSize: 15 * dpr,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(
      canvas,
      Offset((size - tp.width) / 2, (size - tp.height) / 2),
    );
    final img = await recorder.endRecording().toImage(
      size.ceil(),
      size.ceil(),
    );
    final bytes = await img.toByteData(format: ui.ImageByteFormat.png);
    img.dispose();
    return BitmapDescriptor.bytes(
      bytes!.buffer.asUint8List(),
      width: _pinLogicalSize,
      height: _pinLogicalSize,
    );
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
    // Do not dispose GoogleMapController — the GoogleMap widget owns it.
    _map = null;
    super.dispose();
  }

  void _onCarTick() {
    final sampler = _sampler;
    if (sampler == null || sampler.isEmpty) return;
    final sample = sampler.sample(_carCtrl.value);
    final next = LatLng(sample.lat, sample.lng);
    final prev = _carPos;
    var bearingDelta = (sample.bearingDeg - _carBearing).abs();
    if (bearingDelta > 180) bearingDelta = 360 - bearingDelta;
    final moved = prev == null ||
        (next.latitude - prev.latitude).abs() > 1e-7 ||
        (next.longitude - prev.longitude).abs() > 1e-7;
    if (!moved && bearingDelta < 0.5) return;
    setState(() {
      _carPos = next;
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
      ..duration = _carAnimDurationFor(sampler.totalMeters)
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

  Future<void> _fitBounds({List<LatLng> extra = const []}) async {
    if (_fitted) return;
    final map = _map;
    if (map == null) return;
    final pts = <LatLng>[_from, if (_to != null) _to!, ...extra];
    if (pts.length == 1) {
      await map.animateCamera(
        CameraUpdate.newLatLngZoom(pts.first, 13),
      );
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
    await map.animateCamera(
      CameraUpdate.newLatLngBounds(
        LatLngBounds(
          southwest: LatLng(minLat, minLng),
          northeast: LatLng(maxLat, maxLng),
        ),
        48,
      ),
    );
    _fitted = true;
  }

  Set<Marker> get _markers {
    final out = <Marker>{
      Marker(
        markerId: const MarkerId('from'),
        position: _from,
        icon: _pinA ??
            BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
        anchor: const Offset(0.5, 0.5),
      ),
    };
    final to = _to;
    if (to != null) {
      out.add(
        Marker(
          markerId: const MarkerId('to'),
          position: to,
          icon: _pinB ??
              BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueAzure),
          anchor: const Offset(0.5, 0.5),
        ),
      );
    }
    final car = _carPos;
    if (car != null) {
      out.add(
        Marker(
          markerId: const MarkerId('car'),
          position: car,
          rotation: _carBearing,
          flat: true,
          anchor: const Offset(0.5, 0.5),
          icon: _carIcon ??
              BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange),
          zIndexInt: 2,
        ),
      );
    }
    return out;
  }

  Set<Polyline> get _polylines {
    if (_routePoints.length < 2) return {};
    return {
      Polyline(
        polylineId: const PolylineId('route'),
        points: _routePoints,
        color: GtColors.brand,
        width: 5,
      ),
    };
  }

  @override
  Widget build(BuildContext context) {
    return GoogleMap(
      initialCameraPosition: CameraPosition(target: _from, zoom: 13),
      markers: _markers,
      polylines: _polylines,
      myLocationButtonEnabled: false,
      zoomControlsEnabled: false,
      mapToolbarEnabled: false,
      compassEnabled: false,
      onMapCreated: (c) {
        _map = c;
        if (!_fitted) unawaited(_fitBounds(extra: _routePoints));
      },
    );
  }
}
