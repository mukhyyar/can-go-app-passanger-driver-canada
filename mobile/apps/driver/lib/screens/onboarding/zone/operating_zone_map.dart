import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';

import 'delete_zone_button.dart';
import 'map_controls.dart';
import 'operating_zone_polygon.dart';
import 'zone_creation_bar.dart';
import 'zone_geo.dart';

enum ZoneMapMode { viewing, creating, selected }

/// Thin controller so parent screens can move / read center.
class ZoneMapController {
  GoogleMapController? _map;
  double _zoom = 10.5;
  GeoPoint center;

  ZoneMapController({required double lat, required double lng})
      : center = GeoPoint(latitude: lat, longitude: lng);

  void attach(GoogleMapController c) => _map = c;

  Future<void> move(double lat, double lng, double zoom) async {
    center = GeoPoint(latitude: lat, longitude: lng);
    _zoom = zoom;
    final c = _map;
    if (c == null) return;
    await c.animateCamera(
      CameraUpdate.newCameraPosition(
        CameraPosition(target: LatLng(lat, lng), zoom: zoom),
      ),
    );
  }

  Future<void> zoomBy(double delta) async {
    final c = _map;
    if (c == null) return;
    _zoom = (_zoom + delta).clamp(3.0, 20.0);
    await c.animateCamera(CameraUpdate.zoomTo(_zoom));
  }
}

/// Interactive operating-zone map (Google Maps SDK).
class OperatingZoneMap extends StatefulWidget {
  const OperatingZoneMap({
    super.key,
    required this.baseLatitude,
    required this.baseLongitude,
    required this.zones,
    required this.mode,
    this.creationTool,
    this.draftRadiusKm = 66,
    this.showDraftCircle = false,
    this.draftPolygons = const [],
    this.selectedZoneId,
    this.onZoneSelected,
    this.onDeleteSelected,
    this.onFreehandCompleted,
    this.mapController,
  });

  final double baseLatitude;
  final double baseLongitude;
  final List<OperatingZone> zones;
  final ZoneMapMode mode;
  final ZoneCreationTool? creationTool;
  final double draftRadiusKm;
  final bool showDraftCircle;
  final List<List<GeoPoint>> draftPolygons;
  final String? selectedZoneId;
  final void Function(String? zoneId)? onZoneSelected;
  final VoidCallback? onDeleteSelected;
  final ValueChanged<List<GeoPoint>>? onFreehandCompleted;
  final ZoneMapController? mapController;

  @override
  State<OperatingZoneMap> createState() => _OperatingZoneMapState();
}

class _OperatingZoneMapState extends State<OperatingZoneMap> {
  late final ZoneMapController _controller;
  bool _ownsController = false;
  GoogleMapController? _map;

  final ValueNotifier<List<LatLng>> _stroke = ValueNotifier(const []);
  late final ValueNotifier<LatLng> _draftCenter;
  Offset? _lastSample;
  static const _minSamplePx = 6.0;

  @override
  void initState() {
    super.initState();
    _draftCenter = ValueNotifier(_base);
    if (widget.mapController != null) {
      _controller = widget.mapController!;
    } else {
      _controller = ZoneMapController(
        lat: widget.baseLatitude,
        lng: widget.baseLongitude,
      );
      _ownsController = true;
    }
  }

  @override
  void didUpdateWidget(covariant OperatingZoneMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.creationTool != widget.creationTool ||
        oldWidget.mode != widget.mode) {
      _stroke.value = const [];
      _lastSample = null;
      if (_isCircle) {
        _draftCenter.value = LatLng(
          _controller.center.latitude,
          _controller.center.longitude,
        );
      }
    }
  }

  @override
  void dispose() {
    _stroke.dispose();
    _draftCenter.dispose();
    if (_ownsController) {
      // ZoneMapController has no resources beyond GoogleMapController.
    }
    _map?.dispose();
    super.dispose();
  }

  LatLng get _base => LatLng(widget.baseLatitude, widget.baseLongitude);

  bool get _isCreating => widget.mode == ZoneMapMode.creating;
  bool get _isDraw =>
      _isCreating && widget.creationTool == ZoneCreationTool.draw;
  bool get _isCircle =>
      _isCreating &&
      widget.creationTool == ZoneCreationTool.circle &&
      widget.showDraftCircle;

  void _zoomBy(double delta) => _controller.zoomBy(delta);

  void _recenter() {
    final zoom = _isCircle ? _zoomForRadius(widget.draftRadiusKm) : 10.5;
    _controller.move(widget.baseLatitude, widget.baseLongitude, zoom);
  }

  double _zoomForRadius(double radiusKm) {
    if (radiusKm <= 15) return 11;
    if (radiusKm <= 40) return 10;
    if (radiusKm <= 80) return 9;
    if (radiusKm <= 120) return 8;
    return 7.5;
  }

  String? _hitTest(LatLng point) {
    final gp = GeoPoint(latitude: point.latitude, longitude: point.longitude);
    for (final z in widget.zones.reversed) {
      if (z.isCircle && z.center != null && z.radiusKm != null) {
        if (ZoneGeo.containsInCircle(gp, z.center!, z.radiusKm!)) {
          return z.id;
        }
        continue;
      }
      if (z.coordinates.length < 3) continue;
      if (_containsPoly(point, z.coordinates)) return z.id;
    }
    return null;
  }

  bool _containsPoly(LatLng point, List<GeoPoint> poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      final xi = poly[i].longitude;
      final yi = poly[i].latitude;
      final xj = poly[j].longitude;
      final yj = poly[j].latitude;
      final intersect = ((yi > point.latitude) != (yj > point.latitude)) &&
          (point.longitude <
              (xj - xi) *
                      (point.latitude - yi) /
                      ((yj - yi) == 0 ? 1e-12 : (yj - yi)) +
                  xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  Future<LatLng?> _screenToLatLng(Offset local) async {
    final map = _map;
    if (map == null || !mounted) return null;
    final dpr = MediaQuery.devicePixelRatioOf(context);
    try {
      return await map.getLatLng(
        ScreenCoordinate(
          x: (local.dx * dpr).round(),
          y: (local.dy * dpr).round(),
        ),
      );
    } catch (_) {
      return null;
    }
  }

  void _onPointerDown(PointerDownEvent e) {
    if (!_isDraw) return;
    unawaited(() async {
      final latLng = await _screenToLatLng(e.localPosition);
      if (latLng == null) return;
      _lastSample = e.localPosition;
      _stroke.value = [latLng];
    }());
  }

  void _onPointerMove(PointerMoveEvent e) {
    if (!_isDraw || _stroke.value.isEmpty) return;
    final last = _lastSample;
    if (last != null) {
      final dx = e.localPosition.dx - last.dx;
      final dy = e.localPosition.dy - last.dy;
      if (dx * dx + dy * dy < _minSamplePx * _minSamplePx) return;
    }
    _lastSample = e.localPosition;
    unawaited(() async {
      final latLng = await _screenToLatLng(e.localPosition);
      if (latLng == null) return;
      _stroke.value = List<LatLng>.from(_stroke.value)..add(latLng);
    }());
  }

  void _onPointerUp(PointerUpEvent e) {
    if (!_isDraw) return;
    final raw = _stroke.value;
    _lastSample = null;
    if (raw.length < 3) {
      _stroke.value = const [];
      return;
    }
    final geos = raw
        .map((p) => GeoPoint(latitude: p.latitude, longitude: p.longitude))
        .toList();
    final simplified = ZoneGeo.simplifyRdp(geos, 0.00015);
    _stroke.value = const [];
    if (simplified.length < 3) return;
    widget.onFreehandCompleted?.call(simplified);
  }

  void _onPointerCancel(PointerCancelEvent e) {
    if (!_isDraw) return;
    _stroke.value = const [];
    _lastSample = null;
  }

  Set<Polygon> _zonePolygons() {
    final out = <Polygon>{};
    for (final z in widget.zones) {
      final pts = OperatingZonePolygons.pointsFor(z);
      if (pts.length < 3) continue;
      final selected = z.id == widget.selectedZoneId;
      out.add(
        Polygon(
          polygonId: PolygonId('zone-${z.id}'),
          points: pts,
          fillColor: selected
              ? OperatingZonePolygons.selectedFill
              : OperatingZonePolygons.fill,
          strokeColor: selected
              ? OperatingZonePolygons.selectedStroke
              : OperatingZonePolygons.stroke,
          strokeWidth: selected ? 3 : 2,
          consumeTapEvents: !_isCreating,
          onTap: () {
            if (_isCreating) return;
            widget.onZoneSelected?.call(z.id);
          },
        ),
      );
    }
    return out;
  }

  Set<Polygon> _draftPolys() {
    final out = <Polygon>{};
    for (var i = 0; i < widget.draftPolygons.length; i++) {
      final poly = widget.draftPolygons[i];
      if (poly.length < 3) continue;
      out.add(
        Polygon(
          polygonId: PolygonId('draft-$i'),
          points: poly.map((p) => LatLng(p.latitude, p.longitude)).toList(),
          fillColor: OperatingZonePolygons.fill,
          strokeColor: GtColors.brand,
          strokeWidth: 3,
        ),
      );
    }
    return out;
  }

  Set<Marker> _markers() {
    final out = <Marker>{
      Marker(
        markerId: const MarkerId('base'),
        position: _base,
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
      ),
    };
    if (widget.mode == ZoneMapMode.selected &&
        widget.selectedZoneId != null &&
        widget.onDeleteSelected != null) {
      OperatingZone? selected;
      for (final z in widget.zones) {
        if (z.id == widget.selectedZoneId) {
          selected = z;
          break;
        }
      }
      final at =
          selected == null ? null : OperatingZonePolygons.centroidOf(selected);
      if (at != null) {
        out.add(
          Marker(
            markerId: const MarkerId('delete'),
            position: at,
            icon: BitmapDescriptor.defaultMarkerWithHue(
              BitmapDescriptor.hueOrange,
            ),
            onTap: widget.onDeleteSelected,
          ),
        );
      }
    }
    return out;
  }

  Set<Circle> _circles(LatLng draftCenter) {
    if (!_isCircle || widget.draftRadiusKm <= 0) return {};
    return {
      Circle(
        circleId: const CircleId('draft'),
        center: draftCenter,
        radius: widget.draftRadiusKm * 1000,
        fillColor: GtColors.brand.withValues(alpha: 0.18),
        strokeColor: GtColors.brand,
        strokeWidth: 2,
      ),
    };
  }

  Set<Polyline> _strokeLine(List<LatLng> strokePts) {
    if (!_isDraw || strokePts.length < 2) return {};
    return {
      Polyline(
        polylineId: const PolylineId('stroke'),
        points: strokePts,
        color: GtColors.brand,
        width: 3,
      ),
    };
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        ValueListenableBuilder<LatLng>(
          valueListenable: _draftCenter,
          builder: (context, draftCenter, _) {
            return ValueListenableBuilder<List<LatLng>>(
              valueListenable: _stroke,
              builder: (context, strokePts, __) {
                return GoogleMap(
                  initialCameraPosition: CameraPosition(
                    target: _base,
                    zoom: 10.5,
                  ),
                  myLocationButtonEnabled: false,
                  zoomControlsEnabled: false,
                  mapToolbarEnabled: false,
                  compassEnabled: false,
                  scrollGesturesEnabled: !_isDraw,
                  zoomGesturesEnabled: !_isDraw,
                  tiltGesturesEnabled: false,
                  rotateGesturesEnabled: false,
                  gestureRecognizers: !_isDraw
                      ? <Factory<OneSequenceGestureRecognizer>>{
                          Factory<OneSequenceGestureRecognizer>(
                            () => EagerGestureRecognizer(),
                          ),
                        }
                      : const <Factory<OneSequenceGestureRecognizer>>{},
                  polygons: {
                    ..._zonePolygons(),
                    if (_isDraw) ..._draftPolys(),
                  },
                  circles: _circles(draftCenter),
                  polylines: _strokeLine(strokePts),
                  markers: _markers(),
                  onMapCreated: (c) {
                    _map = c;
                    _controller.attach(c);
                  },
                  onCameraMove: (pos) {
                    _controller.center = GeoPoint(
                      latitude: pos.target.latitude,
                      longitude: pos.target.longitude,
                    );
                    _controller._zoom = pos.zoom;
                    if (_isCircle) {
                      _draftCenter.value = pos.target;
                    }
                  },
                  onTap: (latLng) {
                    if (_isCreating) return;
                    widget.onZoneSelected?.call(_hitTest(latLng));
                  },
                );
              },
            );
          },
        ),
        if (_isDraw)
          Positioned.fill(
            child: Listener(
              behavior: HitTestBehavior.opaque,
              onPointerDown: _onPointerDown,
              onPointerMove: _onPointerMove,
              onPointerUp: _onPointerUp,
              onPointerCancel: _onPointerCancel,
              child: const ColoredBox(color: Color(0x00000000)),
            ),
          ),
        Positioned(
          right: 12,
          top: 72,
          child: MapControls(
            onZoomIn: () => _zoomBy(1),
            onZoomOut: () => _zoomBy(-1),
            onRecenter: _recenter,
          ),
        ),
        if (widget.mode == ZoneMapMode.selected &&
            widget.onDeleteSelected != null)
          Positioned(
            left: 12,
            bottom: 24,
            child: DeleteZoneButton(onPressed: widget.onDeleteSelected!),
          ),
        Positioned(
          left: 12,
          bottom: 72,
          child: Material(
            color: Colors.white.withValues(alpha: 0.92),
            borderRadius: BorderRadius.circular(8),
            child: const Padding(
              padding: EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.place, color: GtColors.brand, size: 16),
                  SizedBox(width: 6),
                  Text(
                    'Base',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12),
                  ),
                ],
              ),
            ),
          ),
        ),
        if (_isDraw)
          Positioned(
            left: 12,
            right: 60,
            top: 12,
            child: Material(
              elevation: 2,
              borderRadius: BorderRadius.circular(10),
              color: Colors.white,
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                child: Text(
                  widget.draftPolygons.isEmpty
                      ? 'Draw mode — drag on the map to outline your area'
                      : '${widget.draftPolygons.length} area${widget.draftPolygons.length == 1 ? '' : 's'} drawn — draw more or tap ✓',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
