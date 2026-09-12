import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'route_path.dart';
import 'theme.dart';

const _apiBase = String.fromEnvironment(
  'CANGO_API_BASE',
  defaultValue: 'http://127.0.0.1:4000/api',
);

const _carAnimDuration = Duration(seconds: 10);

String get _normalizedApiBase {
  final api = _apiBase.endsWith('/')
      ? _apiBase.substring(0, _apiBase.length - 1)
      : _apiBase;
  return api;
}

/// Native Google Maps preview (A/B markers + optional route polyline + car).
Widget buildGoogleMapEmbed({
  required double fromLat,
  required double fromLng,
  double? toLat,
  double? toLng,
}) {
  return _NativeGoogleRouteMap(
    fromLat: fromLat,
    fromLng: fromLng,
    toLat: toLat,
    toLng: toLng,
  );
}

class _NativeGoogleRouteMap extends StatefulWidget {
  const _NativeGoogleRouteMap({
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
  State<_NativeGoogleRouteMap> createState() => _NativeGoogleRouteMapState();
}

class _NativeGoogleRouteMapState extends State<_NativeGoogleRouteMap>
    with SingleTickerProviderStateMixin {
  GoogleMapController? _controller;
  Set<Polyline> _polylines = {};
  bool _fitted = false;
  BitmapDescriptor? _carIcon;
  RoutePathSampler? _sampler;
  late final AnimationController _carCtrl;
  LatLng? _carPos;
  double _carBearing = 0;

  bool get _hasRoute => widget.toLat != null && widget.toLng != null;

  LatLng get _from => LatLng(widget.fromLat, widget.fromLng);
  LatLng? get _to =>
      _hasRoute ? LatLng(widget.toLat!, widget.toLng!) : null;

  Set<Marker> get _markers {
    final markers = <Marker>{
      Marker(
        markerId: const MarkerId('a'),
        position: _from,
        infoWindow: const InfoWindow(title: 'A'),
        zIndexInt: 1,
      ),
    };
    final to = _to;
    if (to != null) {
      markers.add(
        Marker(
          markerId: const MarkerId('b'),
          position: to,
          infoWindow: const InfoWindow(title: 'B'),
          zIndexInt: 1,
        ),
      );
    }
    final car = _carPos;
    final icon = _carIcon;
    if (car != null && icon != null) {
      markers.add(
        Marker(
          markerId: const MarkerId('car'),
          position: car,
          icon: icon,
          rotation: _carBearing,
          flat: true,
          anchor: const Offset(0.5, 0.5),
          zIndexInt: 2,
        ),
      );
    }
    return markers;
  }

  @override
  void initState() {
    super.initState();
    _carCtrl = AnimationController(vsync: this, duration: _carAnimDuration)
      ..addListener(_onCarTick);
    unawaited(_loadCarIcon());
    if (_hasRoute) unawaited(_loadRoute());
  }

  @override
  void didUpdateWidget(covariant _NativeGoogleRouteMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.fromLat != widget.fromLat ||
        oldWidget.fromLng != widget.fromLng ||
        oldWidget.toLat != widget.toLat ||
        oldWidget.toLng != widget.toLng) {
      _fitted = false;
      _polylines = {};
      _stopCar();
      if (_hasRoute) {
        unawaited(_loadRoute());
      } else {
        setState(() {});
        unawaited(_fitBounds());
      }
    }
  }

  @override
  void dispose() {
    _carCtrl.removeListener(_onCarTick);
    _carCtrl.dispose();
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

  Future<void> _loadCarIcon() async {
    try {
      final data = await rootBundle.load(kCanRideCarAsset);
      // Decode denser than display size; keep trimmed 336×742 aspect.
      final decodeH = (kCanRideCarMarkerHeight * 2).round();
      final decodeW = (decodeH * kCanRideCarAspect).round();
      final codec = await ui.instantiateImageCodec(
        data.buffer.asUint8List(),
        targetWidth: decodeW,
        targetHeight: decodeH,
      );
      final frame = await codec.getNextFrame();
      final bytes = await frame.image.toByteData(format: ui.ImageByteFormat.png);
      if (bytes == null || !mounted) return;
      // Height-only → platform preserves asset aspect (do not pass both).
      final icon = BitmapDescriptor.bytes(
        bytes.buffer.asUint8List(),
        height: kCanRideCarMarkerHeight,
      );
      setState(() => _carIcon = icon);
    } catch (_) {
      // Fallback: default red pin if asset fails.
      if (!mounted) return;
      setState(() {
        _carIcon = BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed);
      });
    }
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
      setState(() {
        _polylines = {
          Polyline(
            polylineId: const PolylineId('route'),
            color: GtColors.brand,
            width: 5,
            points: points,
          ),
        };
      });
      _startCar(points);
      await _fitBounds(extra: points);
    } catch (_) {
      if (!mounted) return;
      final fallback = [_from, if (_to != null) _to!];
      if (fallback.length >= 2) {
        setState(() {
          _polylines = {
            Polyline(
              polylineId: const PolylineId('route'),
              color: GtColors.brand,
              width: 5,
              points: fallback,
            ),
          };
        });
        _startCar(fallback);
      }
      await _fitBounds();
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
    final c = _controller;
    if (c == null || _fitted) return;
    final pts = <LatLng>[_from, if (_to != null) _to!, ...extra];
    if (pts.length == 1) {
      await c.animateCamera(CameraUpdate.newLatLngZoom(pts.first, 13));
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
    await c.animateCamera(
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
      onMapCreated: (controller) {
        _controller = controller;
        unawaited(_fitBounds());
      },
    );
  }
}
