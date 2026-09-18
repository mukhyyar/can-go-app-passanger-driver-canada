import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import 'google_route_map.dart';
import 'route_path.dart';
import 'theme.dart';



const _apiBaseFromEnv = String.fromEnvironment('CANGO_API_BASE');
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
  final raw = _apiBaseFromEnv.isNotEmpty ? _apiBaseFromEnv : _prodApiBase;
  return raw.endsWith('/') ? raw.substring(0, raw.length - 1) : raw;
}

/// Native route map via Google Maps SDK (API key in AndroidManifest).
Widget buildGoogleMapEmbed({
  required double fromLat,
  required double fromLng,
  double? toLat,
  double? toLng,
  ValueChanged<GtRouteOption>? onRouteSelected,
  ValueChanged<List<GtRouteOption>>? onRoutesLoaded,
  bool enableRouteSelection = true,
  int initialRouteIndex = 0,
  bool interactive = true,
  bool isExpanded = false,
  GtRouteMapController? controller,
  VoidCallback? onTap,
  Key? key,
}) {
  return _NativeRouteMap(
    key: key,
    fromLat: fromLat,
    fromLng: fromLng,
    toLat: toLat,
    toLng: toLng,
    onRouteSelected: onRouteSelected,
    onRoutesLoaded: onRoutesLoaded,
    enableRouteSelection: enableRouteSelection,
    initialRouteIndex: initialRouteIndex,
    interactive: interactive,
    isExpanded: isExpanded,
    controller: controller,
    onTap: onTap,
  );
}

class _NativeRouteMap extends StatefulWidget {
  const _NativeRouteMap({
    super.key,
    required this.fromLat,
    required this.fromLng,
    this.toLat,
    this.toLng,
    this.onRouteSelected,
    this.onRoutesLoaded,
    this.enableRouteSelection = true,
    this.initialRouteIndex = 0,
    this.interactive = true,
    this.isExpanded = false,
    this.controller,
    this.onTap,
  });

  final double fromLat;
  final double fromLng;
  final double? toLat;
  final double? toLng;
  final ValueChanged<GtRouteOption>? onRouteSelected;
  final ValueChanged<List<GtRouteOption>>? onRoutesLoaded;
  final bool enableRouteSelection;
  final int initialRouteIndex;
  final bool interactive;
  final bool isExpanded;
  final GtRouteMapController? controller;
  final VoidCallback? onTap;

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

  List<GtRouteOption> _routes = const [];
  int _selectedRouteIndex = 0;

  @override
  void initState() {
    super.initState();
    _selectedRouteIndex = widget.initialRouteIndex;
    widget.controller?.attachRecenter(
      () => _fitBounds(extra: _routePoints, force: true),
    );
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
    final canvasLogical = math.sqrt(
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
    if (widget.controller != oldWidget.controller) {
      oldWidget.controller?.attachRecenter(null);
      widget.controller?.attachRecenter(
        () => _fitBounds(extra: _routePoints, force: true),
      );
    }
    if (widget.isExpanded != oldWidget.isExpanded) {
      Future.delayed(const Duration(milliseconds: 320), () {
        if (mounted) {
          _fitBounds(extra: _routePoints, force: true);
        }
      });
    }
    if (oldWidget.fromLat != widget.fromLat ||
        oldWidget.fromLng != widget.fromLng ||
        oldWidget.toLat != widget.toLat ||
        oldWidget.toLng != widget.toLng) {
      _fitted = false;
      _routes = const [];
      _selectedRouteIndex = widget.initialRouteIndex;
      _routePoints = const [];
      _stopCar();
      if (_hasRoute) {
        unawaited(_loadRoute());
      } else {
        setState(() {});
        _fitBounds();
      }
    } else if (oldWidget.initialRouteIndex != widget.initialRouteIndex &&
        widget.initialRouteIndex >= 0 &&
        widget.initialRouteIndex < _routes.length &&
        widget.initialRouteIndex != _selectedRouteIndex) {
      _selectRoute(widget.initialRouteIndex);
    }
  }

  @override
  void dispose() {
    widget.controller?.attachRecenter(null);
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

  void _selectRoute(int index) {
    if (index < 0 || index >= _routes.length || index == _selectedRouteIndex) {
      return;
    }
    final selected = _routes[index];
    final pts = selected.points.cast<LatLng>();
    setState(() {
      _selectedRouteIndex = index;
      _routePoints = pts;
    });
    _startCar(pts);
    widget.onRouteSelected?.call(selected);
  }

  Future<void> _loadRoute() async {
    final to = _to;
    if (to == null) return;
    List<GtRouteOption> loadedRoutes = const [];

    // 1. Primary: Try backend route endpoint
    try {
      final uri = Uri.parse('$_normalizedApiBase/maps/route');
      final client = HttpClient();
      client.connectionTimeout = const Duration(seconds: 4);
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
      final res = await req.close().timeout(const Duration(seconds: 5));
      final body = await res.transform(utf8.decoder).join();
      client.close(force: true);

      loadedRoutes = _parseRoutesFromBody(body);
    } catch (_) {
      // Backend failed or unreachable
    }

    // 2. Resilient fallback: Direct OSRM driving engine
    if (loadedRoutes.isEmpty) {
      try {
        loadedRoutes = await _fetchOsrmRoute(
          widget.fromLat,
          widget.fromLng,
          widget.toLat!,
          widget.toLng!,
        );
      } catch (_) {
        // Fallback below
      }
    }

    // 3. Fallback: Straight-line between from and to if everything failed
    if (loadedRoutes.isEmpty) {
      final pts = [_from, to];
      loadedRoutes = [
        GtRouteOption(
          id: 'fallback_0',
          summary: 'Direct route',
          distanceKm: 0,
          durationMin: 0,
          points: pts,
          isFastest: true,
        ),
      ];
    }

    if (!mounted) return;
    final selectedIdx = widget.initialRouteIndex
        .clamp(0, math.max(0, loadedRoutes.length - 1))
        .toInt();
    final activePoints = loadedRoutes[selectedIdx].points.cast<LatLng>();

    setState(() {
      _routes = loadedRoutes;
      _selectedRouteIndex = selectedIdx;
      _routePoints = activePoints;
    });

    widget.onRoutesLoaded?.call(loadedRoutes);
    widget.onRouteSelected?.call(loadedRoutes[selectedIdx]);

    _startCar(activePoints);
    _fitBounds(extra: activePoints);
  }

  Future<List<GtRouteOption>> _fetchOsrmRoute(
    double fromLat,
    double fromLng,
    double toLat,
    double toLng,
  ) async {
    final uri = Uri.parse(
      'https://router.project-osrm.org/route/v1/driving/$fromLng,$fromLat;$toLng,$toLat?overview=full&geometries=geojson&alternatives=true',
    );
    final client = HttpClient();
    client.connectionTimeout = const Duration(seconds: 4);
    final req = await client.getUrl(uri);
    final res = await req.close().timeout(const Duration(seconds: 5));
    final body = await res.transform(utf8.decoder).join();
    client.close(force: true);

    final data = jsonDecode(body);
    if (data is! Map || data['code'] != 'Ok' || data['routes'] is! List) {
      return const [];
    }

    final out = <GtRouteOption>[];
    final list = data['routes'] as List;
    for (var i = 0; i < list.length; i++) {
      final r = list[i];
      if (r is! Map) continue;
      final geom = r['geometry'];
      if (geom is! Map || geom['coordinates'] is! List) continue;
      final coords = <LatLng>[];
      for (final c in geom['coordinates'] as List) {
        if (c is List && c.length >= 2) {
          coords.add(LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()));
        }
      }
      if (coords.length < 2) continue;
      final distMeters = (r['distance'] as num?)?.toDouble() ?? 0;
      final durSec = (r['duration'] as num?)?.toDouble() ?? 0;
      final distKm = (distMeters / 1000 * 10).round() / 10;
      final durMin = (durSec / 60).round().clamp(1, 999);
      final legs = r['legs'] as List?;
      final legSummary = (legs != null && legs.isNotEmpty && legs[0] is Map)
          ? legs[0]['summary']?.toString().trim()
          : null;
      final summary = (legSummary != null && legSummary.isNotEmpty)
          ? (i == 0 ? 'Via $legSummary (Fastest)' : 'Via $legSummary')
          : (i == 0 ? 'Fastest route' : 'Alternative ${i + 1}');

      out.add(
        GtRouteOption(
          id: 'osrm_$i',
          summary: summary,
          distanceKm: distKm,
          durationMin: durMin,
          points: coords,
          isFastest: i == 0,
        ),
      );
    }
    return out;
  }

  List<GtRouteOption> _parseRoutesFromBody(String body) {
    try {
      final data = jsonDecode(body);
      if (data is! Map) return const [];

      // Check if backend returned multiple routes
      if (data['routes'] is List && (data['routes'] as List).isNotEmpty) {
        final out = <GtRouteOption>[];
        final list = data['routes'] as List;
        for (var i = 0; i < list.length; i++) {
          final r = list[i];
          if (r is! Map) continue;
          List<LatLng> coords = const [];
          final geom = r['geometry'];
          if (geom is Map && geom['coordinates'] is List) {
            final pts = <LatLng>[];
            for (final c in geom['coordinates'] as List) {
              if (c is List && c.length >= 2) {
                pts.add(
                  LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()),
                );
              }
            }
            coords = pts;
          }
          if (coords.isEmpty && r['overviewPolyline'] is String) {
            coords = _decodePolyline(r['overviewPolyline'] as String);
          }
          if (coords.length < 2) continue;
          out.add(
            GtRouteOption(
              id: r['id']?.toString() ?? 'route_$i',
              summary:
                  r['summary']?.toString() ??
                  (i == 0 ? 'Fastest route' : 'Alternative ${i + 1}'),
              distanceKm: (r['distanceKm'] as num?)?.toDouble() ?? 0,
              durationMin: (r['durationMin'] as num?)?.toInt() ?? 0,
              points: coords,
              isFastest: r['isFastest'] == true || i == 0,
            ),
          );
        }
        if (out.isNotEmpty) return out;
      }

      // Legacy single route format
      final pts = _parseRoutePoints(body);
      if (pts.length >= 2) {
        return [
          GtRouteOption(
            id: 'route_0',
            summary: 'Primary route',
            distanceKm: (data['distanceKm'] as num?)?.toDouble() ?? 0,
            durationMin: (data['durationMin'] as num?)?.toInt() ?? 0,
            points: pts,
            isFastest: true,
          ),
        ];
      }
    } catch (_) {}
    return const [];
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

  Future<void> _fitBounds({
    List<LatLng> extra = const [],
    bool force = false,
  }) async {
    if (_fitted && !force) return;
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
    if (_routes.isEmpty) {
      if (_routePoints.length < 2) return {};
      return {
        Polyline(
          polylineId: const PolylineId('route_primary'),
          points: _routePoints,
          color: GtColors.brand,
          width: 5,
        ),
      };
    }
    final polylines = <Polyline>{};
    // Draw unselected alternative routes first so the selected route renders on top
    for (var i = 0; i < _routes.length; i++) {
      if (i == _selectedRouteIndex) continue;
      final route = _routes[i];
      final pts = route.points.cast<LatLng>();
      polylines.add(
        Polyline(
          polylineId: PolylineId('route_alt_$i'),
          points: pts,
          color: const Color(0xFF8E8E93).withValues(alpha: 0.85),
          width: 4,
          zIndex: 1,
          consumeTapEvents: widget.enableRouteSelection,
          onTap: widget.enableRouteSelection ? () => _selectRoute(i) : null,
        ),
      );
    }
    // Draw selected active route
    final selected = _routes[_selectedRouteIndex];
    polylines.add(
      Polyline(
        polylineId: PolylineId('route_selected_$_selectedRouteIndex'),
        points: selected.points.cast<LatLng>(),
        color: GtColors.brand,
        width: 5,
        zIndex: 3,
        consumeTapEvents: true,
      ),
    );
    return polylines;
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        GoogleMap(
          initialCameraPosition: CameraPosition(target: _from, zoom: 13),
          markers: _markers,
          polylines: _polylines,
          myLocationButtonEnabled: false,
          zoomControlsEnabled: false,
          mapToolbarEnabled: false,
          compassEnabled: widget.interactive,
          scrollGesturesEnabled: widget.interactive,
          zoomGesturesEnabled: widget.interactive,
          rotateGesturesEnabled: widget.interactive,
          tiltGesturesEnabled: widget.interactive,
          gestureRecognizers: widget.interactive
              ? <Factory<OneSequenceGestureRecognizer>>{
                  Factory<OneSequenceGestureRecognizer>(
                    () => EagerGestureRecognizer(),
                  ),
                }
              : const <Factory<OneSequenceGestureRecognizer>>{},
          onTap: (latLng) {
            widget.onTap?.call();
          },
          onMapCreated: (c) {
            _map = c;
            if (!_fitted) unawaited(_fitBounds(extra: _routePoints));
          },
        ),
        if (widget.isExpanded &&
            widget.enableRouteSelection &&
            _routes.length > 1)
          Positioned(
            left: 10,
            right: 10,
            bottom: 16,
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: List.generate(_routes.length, (i) {
                  final r = _routes[i];
                  final isSelected = i == _selectedRouteIndex;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: Material(
                      color: Colors.transparent,
                      child: InkWell(
                        onTap: () => _selectRoute(i),
                        borderRadius: BorderRadius.circular(16),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: isSelected
                                ? GtColors.brand
                                : Colors.white.withValues(alpha: 0.95),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                              color: isSelected
                                  ? GtColors.brand
                                  : const Color(0xFFD1D1D6),
                              width: 1.5,
                            ),
                            boxShadow: const [
                              BoxShadow(
                                color: Color(0x22000000),
                                blurRadius: 4,
                                offset: Offset(0, 2),
                              ),
                            ],
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                isSelected ? Icons.check_circle : Icons.alt_route,
                                size: 14,
                                color: isSelected
                                    ? Colors.white
                                    : GtColors.textSecondary,
                              ),
                              const SizedBox(width: 5),
                              Text(
                                '${r.summary} • ${r.durationMin} min (${r.distanceKm} km)',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: isSelected
                                      ? FontWeight.w700
                                      : FontWeight.w600,
                                  color: isSelected
                                      ? Colors.white
                                      : GtColors.text,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  );
                }),
              ),
            ),
          ),
      ],
    );
  }
}
