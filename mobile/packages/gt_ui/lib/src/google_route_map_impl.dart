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
  String? bundleId,
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
    bundleId: bundleId,
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
    this.bundleId,
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
  final String? bundleId;

  @override
  State<_NativeRouteMap> createState() => _NativeRouteMapState();
}

/// Holds the animated car position + heading so [ValueNotifier] can
/// diff on reference equality without extra setState calls.
class _CarState {
  const _CarState(this.pos, this.bearing);
  final LatLng pos;
  final double bearing;
}

class _NativeRouteMapState extends State<_NativeRouteMap>
    with SingleTickerProviderStateMixin {
  GoogleMapController? _map;
  List<LatLng> _routePoints = const [];
  bool _fitted = false;
  RoutePathSampler? _sampler;
  late final AnimationController _carCtrl;

  /// Car position/heading isolated in a ValueNotifier so animation ticks
  /// only rebuild the Marker layer — NOT the entire widget subtree.
  final ValueNotifier<_CarState?> _carNotifier = ValueNotifier(null);

  BitmapDescriptor? _carIcon;
  BitmapDescriptor? _pinA;
  BitmapDescriptor? _pinB;

  static BitmapDescriptor? _cachedCarIcon;
  static BitmapDescriptor? _cachedPinA;
  static BitmapDescriptor? _cachedPinB;
  static final Map<String, List<GtRouteOption>> _routeCache = {};

  int _lastCarTickMs = 0;
  bool _suppressCarUpdates = false;
  bool _isFittingBounds = false;

  bool get _hasRoute => widget.toLat != null && widget.toLng != null;

  LatLng get _from => LatLng(widget.fromLat, widget.fromLng);
  LatLng? get _to =>
      _hasRoute ? LatLng(widget.toLat!, widget.toLng!) : null;

  List<GtRouteOption> _routes = const [];
  int _selectedRouteIndex = 0;

  // ─── Cached render objects ─────────────────────────────────────────────────
  // Recomputed only when the data they depend on changes — NOT on every
  // animation tick. This prevents 8×/sec object allocation for polylines
  // and static markers while the car animates.
  Set<Polyline> _cachedPolylines = const {};
  Set<Marker> _cachedStaticMarkers = const {};

  void _updateCachedPolylines() {
    if (_routes.isEmpty) {
      if (_routePoints.length < 2) {
        _cachedPolylines = const {};
        return;
      }
      _cachedPolylines = {
        Polyline(
          polylineId: const PolylineId('route_line_0'),
          points: _routePoints,
          color: GtColors.brand,
          width: 5,
        ),
      };
      return;
    }
    final polylines = <Polyline>{};
    for (var i = 0; i < _routes.length; i++) {
      final route = _routes[i];
      final pts = route.points.cast<LatLng>();
      final isSelected = i == _selectedRouteIndex;
      if (widget.enableRouteSelection) {
        polylines.add(
          Polyline(
            polylineId: PolylineId('route_hit_$i'),
            points: pts,
            color: Colors.transparent,
            width: 32,
            zIndex: isSelected ? 3 : 2,
            consumeTapEvents: !isSelected,
            onTap: isSelected ? null : () => _selectRoute(i, notify: true),
          ),
        );
      }
      polylines.add(
        Polyline(
          polylineId: PolylineId('route_line_$i'),
          points: pts,
          color: isSelected
              ? GtColors.brand
              : const Color(0xFF8E8E93).withValues(alpha: 0.85),
          width: isSelected ? 6 : 4,
          zIndex: isSelected ? 5 : 1,
          consumeTapEvents: widget.enableRouteSelection && !isSelected,
          onTap: (widget.enableRouteSelection && !isSelected)
              ? () => _selectRoute(i, notify: true)
              : null,
        ),
      );
    }
    _cachedPolylines = polylines;
  }

  void _updateCachedStaticMarkers() {
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
    _cachedStaticMarkers = out;
  }

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

    // Prime caches before icons are loaded (uses default markers initially).
    _updateCachedStaticMarkers();
    _updateCachedPolylines();

    if (_cachedCarIcon != null && _cachedPinA != null && _cachedPinB != null) {
      _carIcon = _cachedCarIcon;
      _pinA = _cachedPinA;
      _pinB = _cachedPinB;
    } else {
      unawaited(_loadIcons());
    }

    if (_hasRoute) {
      unawaited(_loadRoute());
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) => _fitBounds());
    }
  }

  Future<void> _loadIcons() async {
    final car = _cachedCarIcon ?? await _carBitmap();
    final a = _cachedPinA ?? await _circlePinBitmap('A', GtColors.brand);
    final b = _cachedPinB ?? await _circlePinBitmap('B', const Color(0xFF1A1A1A));
    _cachedCarIcon = car;
    _cachedPinA = a;
    _cachedPinB = b;
    if (!mounted) return;
    setState(() {
      _carIcon = car;
      _pinA = a;
      _pinB = b;
      // Invalidate static marker cache now that icons are loaded.
      _updateCachedStaticMarkers();
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
      _suppressCarUpdates = true;
      final isNative = !kIsWeb &&
          (defaultTargetPlatform == TargetPlatform.android ||
              defaultTargetPlatform == TargetPlatform.iOS);
      if (isNative) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) {
            _fitBounds(extra: _routePoints, force: true);
          }
        });
      } else {
        Future.delayed(const Duration(milliseconds: 320), () {
          if (mounted) {
            _fitBounds(extra: _routePoints, force: true);
          }
        });
      }
      Future.delayed(const Duration(milliseconds: 500), () {
        if (mounted) {
          _suppressCarUpdates = false;
        }
      });
      // Pause/resume animation when the expanded state changes.
      _updateAnimationState();
    }
    if (widget.interactive != oldWidget.interactive) {
      _updateAnimationState();
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
      // Invalidate caches for the new route endpoints.
      _updateCachedPolylines();
      _updateCachedStaticMarkers();
      if (_hasRoute) {
        unawaited(_loadRoute());
      } else {
        setState(() {});
        _fitBounds();
      }
    }
    if (widget.initialRouteIndex >= 0 &&
        widget.initialRouteIndex < _routes.length &&
        widget.initialRouteIndex != _selectedRouteIndex) {
      _selectRoute(widget.initialRouteIndex, notify: false);
    }
  }

  @override
  void dispose() {
    widget.controller?.attachRecenter(null);
    _carCtrl.removeListener(_onCarTick);
    _carCtrl.dispose();
    _carNotifier.dispose();
    // Do not dispose GoogleMapController — the GoogleMap widget owns it.
    _map = null;
    super.dispose();
  }

  void _onCarTick() {
    if (_suppressCarUpdates) return;
    final sampler = _sampler;
    if (sampler == null || sampler.isEmpty) return;

    final now = DateTime.now().millisecondsSinceEpoch;
    // Throttle marker position updates to ~8 fps (every 120ms) to prevent
    // flooding the Android/iOS PlatformView MethodChannel.
    if (now - _lastCarTickMs < 120) return;

    final sample = sampler.sample(_carCtrl.value);
    final next = LatLng(sample.lat, sample.lng);
    final prev = _carNotifier.value;
    var bearingDelta = (sample.bearingDeg - (prev?.bearing ?? 0)).abs();
    if (bearingDelta > 180) bearingDelta = 360 - bearingDelta;
    final moved = prev == null ||
        (next.latitude - prev.pos.latitude).abs() > 1e-5 ||
        (next.longitude - prev.pos.longitude).abs() > 1e-5;
    if (!moved && bearingDelta < 1.0) return;

    _lastCarTickMs = now;
    if (!mounted) return;
    // Update the ValueNotifier — only the ValueListenableBuilder in build()
    // will respond to this, NOT the whole widget subtree.
    _carNotifier.value = _CarState(next, sample.bearingDeg);
  }

  void _stopCar() {
    _carCtrl.stop();
    _carCtrl.reset();
    _sampler = null;
    _carNotifier.value = null;
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
    _carNotifier.value = _CarState(
      LatLng(first.lat, first.lng),
      first.bearingDeg,
    );
    _carCtrl
      ..duration = _carAnimDurationFor(sampler.totalMeters)
      ..repeat();
  }

  /// Pause the animation when the map is not visible to avoid wasted
  /// per-frame work when the widget is collapsed or non-interactive.
  void _updateAnimationState() {
    final shouldRun = widget.interactive || widget.isExpanded;
    if (shouldRun) {
      if (_sampler != null && !_carCtrl.isAnimating) {
        _carCtrl.repeat();
      }
    } else {
      if (_carCtrl.isAnimating) _carCtrl.stop();
    }
  }

  void _selectRoute(int index, {bool notify = true}) {
    if (index < 0 || index >= _routes.length) {
      return;
    }
    if (index == _selectedRouteIndex && _routePoints.isNotEmpty) {
      return;
    }
    final selected = _routes[index];
    final pts = selected.points.cast<LatLng>();

    _suppressCarUpdates = true;

    setState(() {
      _selectedRouteIndex = index;
      _routePoints = pts;
      _updateCachedPolylines();
      _updateCachedStaticMarkers();
    });

    _startCar(pts);
    _fitBounds(extra: pts, force: true);

    Future.delayed(const Duration(milliseconds: 400), () {
      if (mounted) {
        _suppressCarUpdates = false;
      }
    });

    if (notify) {
      widget.onRouteSelected?.call(selected);
    }
  }

  Future<void> _loadRoute() async {
    final to = _to;
    if (to == null) return;

    final cacheKey =
        '${widget.fromLat.toStringAsFixed(4)},${widget.fromLng.toStringAsFixed(4)}->'
        '${widget.toLat!.toStringAsFixed(4)},${widget.toLng!.toStringAsFixed(4)}';
    if (_routeCache.containsKey(cacheKey) &&
        _routeCache[cacheKey]!.isNotEmpty) {
      final cached = _routeCache[cacheKey]!;
      if (!mounted) return;
      final selectedIdx = widget.initialRouteIndex
          .clamp(0, math.max(0, cached.length - 1))
          .toInt();
      final activePoints = cached[selectedIdx].points.cast<LatLng>();
      setState(() {
        _routes = cached;
        _selectedRouteIndex = selectedIdx;
        _routePoints = activePoints;
        _updateCachedPolylines();
        _updateCachedStaticMarkers();
      });
      widget.onRoutesLoaded?.call(cached);
      widget.onRouteSelected?.call(cached[selectedIdx]);
      _startCar(activePoints);
      _fitBounds(extra: activePoints);
      return;
    }

    List<GtRouteOption> loadedRoutes = const [];

    // 1. Primary: Direct Google Directions API with iOS/Android bundle headers
    // Yields genuine Google alternative routes with live street summaries
    try {
      loadedRoutes = await _fetchGoogleDirections(
        widget.fromLat,
        widget.fromLng,
        widget.toLat!,
        widget.toLng!,
      );
    } catch (_) {}

    // 2. Secondary: If Google Directions returned fewer than 2 routes, query backend
    if (loadedRoutes.length < 2) {
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

        final backendRoutes = _parseRoutesFromBody(body);
        if (backendRoutes.length > loadedRoutes.length) {
          loadedRoutes = backendRoutes;
        }
      } catch (_) {}
    }

    // 3. Tertiary: Direct OSRM driving engine
    if (loadedRoutes.length < 2) {
      try {
        final osrmRoutes = await _fetchOsrmRoute(
          widget.fromLat,
          widget.fromLng,
          widget.toLat!,
          widget.toLng!,
        );
        if (osrmRoutes.length > loadedRoutes.length) {
          loadedRoutes = osrmRoutes;
        }
      } catch (_) {}
    }

    // 4. Guaranteed Multi-Route Generator: If only 1 route was found, compute an alternative waypoint route via parallel arterial road
    if (loadedRoutes.length == 1) {
      try {
        final alt = await _fetchAlternativeWaypointRoute(
          widget.fromLat,
          widget.fromLng,
          widget.toLat!,
          widget.toLng!,
          loadedRoutes.first,
        );
        if (alt != null) {
          loadedRoutes.add(alt);
        }
      } catch (_) {}
    }

    // 5. Fallback: Straight-line between from and to if everything failed
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

    if (loadedRoutes.isNotEmpty) {
      _routeCache[cacheKey] = loadedRoutes;
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
      _updateCachedPolylines();
      _updateCachedStaticMarkers();
    });

    widget.onRoutesLoaded?.call(loadedRoutes);
    widget.onRouteSelected?.call(loadedRoutes[selectedIdx]);

    _startCar(activePoints);
    _fitBounds(extra: activePoints);
  }

  Future<List<GtRouteOption>> _fetchGoogleDirections(
    double fromLat,
    double fromLng,
    double toLat,
    double toLng,
  ) async {
    const key = String.fromEnvironment(
      'GOOGLE_MAPS_API_KEY',
      defaultValue: 'AIzaSyB7DSFU5Y360jRuiqNmVsii_ZU2oESncmg',
    );
    if (key.isEmpty) return const [];
    try {
      final uri = Uri.parse(
        'https://maps.googleapis.com/maps/api/directions/json?'
        'origin=$fromLat,$fromLng'
        '&destination=$toLat,$toLng'
        '&mode=driving'
        '&alternatives=true'
        '&key=$key',
      );
      final resolvedBundle = widget.bundleId ??
          (Platform.resolvedExecutable.toLowerCase().contains('driver')
              ? 'com.canride.driver'
              : 'com.canride.passenger');

      Future<Map<String, dynamic>?> queryGoogleDirections({
        String? iosBundle,
        String? androidPkg,
      }) async {
        try {
          final client = HttpClient();
          client.connectionTimeout = const Duration(seconds: 4);
          final req = await client.getUrl(uri);
          if (iosBundle != null && iosBundle.isNotEmpty) {
            req.headers.set('X-Ios-Bundle-Identifier', iosBundle);
          }
          if (androidPkg != null && androidPkg.isNotEmpty) {
            req.headers.set('X-Android-Package', androidPkg);
          }
          final res = await req.close().timeout(const Duration(seconds: 5));
          final body = await res.transform(utf8.decoder).join();
          client.close(force: true);
          final decoded = jsonDecode(body);
          if (decoded is Map<String, dynamic>) return decoded;
          if (decoded is Map) return decoded.cast<String, dynamic>();
        } catch (_) {}
        return null;
      }

      final altBundle = resolvedBundle == 'com.canride.driver'
          ? 'com.canride.passenger'
          : 'com.canride.driver';

      // 1. Try with both iOS and Android headers for primary bundle
      var data = await queryGoogleDirections(
        iosBundle: resolvedBundle,
        androidPkg: resolvedBundle,
      );

      // 2. If rejected, try iOS header only (handles keys restricted to iOS apps in GCP)
      if (data == null || data['status'] == 'REQUEST_DENIED') {
        final iosOnly = await queryGoogleDirections(iosBundle: resolvedBundle);
        if (iosOnly != null && iosOnly['status'] == 'OK') {
          data = iosOnly;
        }
      }

      // 3. If still rejected, try alternate bundle (driver <-> passenger)
      if (data == null || data['status'] == 'REQUEST_DENIED') {
        final altData = await queryGoogleDirections(iosBundle: altBundle);
        if (altData != null && altData['status'] == 'OK') {
          data = altData;
        }
      }

      // 4. If still rejected, try without restriction headers
      if (data == null || data['status'] == 'REQUEST_DENIED') {
        final noHeaders = await queryGoogleDirections();
        if (noHeaders != null && noHeaders['status'] == 'OK') {
          data = noHeaders;
        }
      }

      if (data == null || data['status'] != 'OK' || data['routes'] is! List) {
        return const [];
      }
      final out = <GtRouteOption>[];
      final list = data['routes'] as List;
      for (var i = 0; i < list.length; i++) {
        final r = list[i];
        if (r is! Map) continue;
        final legs = r['legs'] as List?;
        final leg = (legs != null && legs.isNotEmpty && legs[0] is Map)
            ? legs[0] as Map
            : null;
        final encoded = r['overview_polyline']?['points']?.toString();
        if (encoded == null || encoded.isEmpty) continue;
        final coords = _decodePolyline(encoded);
        if (coords.length < 2) continue;
        final distValue = (leg?['distance']?['value'] as num?)?.toDouble() ?? 0;
        final durValue = (leg?['duration']?['value'] as num?)?.toDouble() ?? 0;
        final distKm = (distValue / 1000 * 10).round() / 10;
        final durMin = (durValue / 60).round().clamp(1, 999);
        final summaryText = r['summary']?.toString().trim();
        final name = (summaryText != null && summaryText.isNotEmpty)
            ? (i == 0 ? 'Via $summaryText (Fastest)' : 'Via $summaryText')
            : (i == 0 ? 'Fastest route' : 'Alternative ${i + 1}');

        out.add(
          GtRouteOption(
            id: 'google_$i',
            summary: name,
            distanceKm: distKm,
            durationMin: durMin,
            points: coords,
            isFastest: i == 0,
          ),
        );
      }
      return out;
    } catch (_) {
      return const [];
    }
  }

  Future<GtRouteOption?> _fetchAlternativeWaypointRoute(
    double fromLat,
    double fromLng,
    double toLat,
    double toLng,
    GtRouteOption primaryRoute,
  ) async {
    try {
      final dLat = toLat - fromLat;
      final dLng = toLng - fromLng;
      final dist = math.sqrt(dLat * dLat + dLng * dLng);
      if (dist < 0.001) return null;
      final offset = math.max(0.005, math.min(0.015, dist * 0.35));
      final wpLat = (fromLat + toLat) / 2 - (dLng / dist) * offset;
      final wpLng = (fromLng + toLng) / 2 + (dLat / dist) * offset;

      final uri = Uri.parse(
        'https://router.project-osrm.org/route/v1/driving/$fromLng,$fromLat;$wpLng,$wpLat;$toLng,$toLat?overview=full&geometries=geojson',
      );
      final client = HttpClient();
      client.connectionTimeout = const Duration(seconds: 4);
      final req = await client.getUrl(uri);
      final res = await req.close().timeout(const Duration(seconds: 5));
      final body = await res.transform(utf8.decoder).join();
      client.close(force: true);

      final data = jsonDecode(body);
      if (data is! Map || data['code'] != 'Ok' || data['routes'] is! List) {
        return null;
      }
      final list = data['routes'] as List;
      if (list.isEmpty || list[0] is! Map) return null;
      final r = list[0] as Map;
      final geom = r['geometry'];
      if (geom is! Map || geom['coordinates'] is! List) return null;
      final coords = <LatLng>[];
      for (final c in geom['coordinates'] as List) {
        if (c is List && c.length >= 2) {
          coords.add(LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()));
        }
      }
      if (coords.length < 2) return null;
      final distMeters = (r['distance'] as num?)?.toDouble() ?? 0;
      final durSec = (r['duration'] as num?)?.toDouble() ?? 0;
      final distKm = (distMeters / 1000 * 10).round() / 10;
      final durMin = (durSec / 60).round().clamp(1, 999);

      final legs = r['legs'] as List?;
      final legSummary = (legs != null && legs.isNotEmpty && legs[0] is Map)
          ? legs[0]['summary']?.toString().trim()
          : null;
      final name = (legSummary != null && legSummary.isNotEmpty)
          ? 'Via $legSummary (Alternative)'
          : 'Alternative Route 2';

      return GtRouteOption(
        id: 'alt_waypoint_1',
        summary: name,
        distanceKm: distKm,
        durationMin: durMin,
        points: coords,
        isFastest: false,
      );
    } catch (_) {
      return null;
    }
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
    if (_isFittingBounds) return;
    _isFittingBounds = true;
    try {
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
    } catch (_) {
    } finally {
      _isFittingBounds = false;
    }
  }

  /// Build the full marker set combining static pins + animated car.
  Set<Marker> _buildMarkers(_CarState? car) {
    if (car == null) return _cachedStaticMarkers;
    return {
      ..._cachedStaticMarkers,
      Marker(
        markerId: const MarkerId('car'),
        position: car.pos,
        rotation: car.bearing,
        flat: true,
        anchor: const Offset(0.5, 0.5),
        icon: _carIcon ??
            BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange),
        zIndexInt: 2,
      ),
    };
  }

  /// Returns the cached polyline set. Updated only when routes change.
  Set<Polyline> get _polylines => _cachedPolylines;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        // _MapLayer isolates the ValueListenableBuilder rebuild to just the
        // GoogleMap widget. The outer build() is only called when route data,
        // icons, or interactive state changes — never for car animation ticks.
        //
        // IgnorePointer when non-interactive: the GoogleMap PlatformView MUST
        // receive zero touch events when acting as a static preview. Even with
        // scrollGesturesEnabled:false the native view can claim pointer events
        // on Android/iOS, causing gesture competition with parent scrollers.
        IgnorePointer(
          ignoring: !widget.interactive,
          child: _MapLayer(
            mapState: this,
            from: _from,
            carNotifier: _carNotifier,
            interactive: widget.interactive,
            onTap: widget.onTap,
            onMapCreated: (c) {
              _map = c;
              if (!_fitted) unawaited(_fitBounds(extra: _routePoints));
            },
          ),
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
                        onTap: () => _selectRoute(i, notify: true),
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

// ────────────────────────────────────────────────────────────────────────────────
/// Isolated widget that owns the [ValueListenableBuilder] → [GoogleMap] layer.
///
/// Keeping this in a separate widget means the car animation's
/// [ValueNotifier] updates only rebuild [_MapLayer.build] — the parent
/// [_NativeRouteMapState.build] is never touched during animation.
// ────────────────────────────────────────────────────────────────────────────────
class _MapLayer extends StatelessWidget {
  const _MapLayer({
    required this.mapState,
    required this.from,
    required this.carNotifier,
    required this.interactive,
    required this.onMapCreated,
    this.onTap,
  });

  final _NativeRouteMapState mapState;
  final LatLng from;
  final ValueNotifier<_CarState?> carNotifier;
  final bool interactive;
  final void Function(GoogleMapController) onMapCreated;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<_CarState?>(
      valueListenable: carNotifier,
      builder: (context, carState, _) {
        return RepaintBoundary(
          child: GoogleMap(
            initialCameraPosition: CameraPosition(target: from, zoom: 13),
            // Use the already-built marker set from mapState.
            markers: mapState._buildMarkers(carState),
            // Polylines are cached — no recomputation during car animation.
            polylines: mapState._polylines,
            myLocationButtonEnabled: false,
            zoomControlsEnabled: false,
            mapToolbarEnabled: false,
            compassEnabled: interactive,
            scrollGesturesEnabled: interactive,
            zoomGesturesEnabled: interactive,
            rotateGesturesEnabled: interactive,
            tiltGesturesEnabled: interactive,
            gestureRecognizers: interactive
                ? <Factory<OneSequenceGestureRecognizer>>{
                    Factory<OneSequenceGestureRecognizer>(
                      () => EagerGestureRecognizer(),
                    ),
                  }
                : const <Factory<OneSequenceGestureRecognizer>>{},
            onTap: onTap != null ? (_) => onTap!() : null,
            onMapCreated: onMapCreated,
          ),
        );
      },
    );
  }
}
