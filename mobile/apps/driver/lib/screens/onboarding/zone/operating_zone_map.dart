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
  GoogleMapController? _google;
  GeoPoint center;

  ZoneMapController({required double lat, required double lng})
      : center = GeoPoint(latitude: lat, longitude: lng);

  void attach(GoogleMapController c) => _google = c;

  Future<void> move(double lat, double lng, double zoom) async {
    center = GeoPoint(latitude: lat, longitude: lng);
    final c = _google;
    if (c == null) return;
    await c.animateCamera(
      CameraUpdate.newLatLngZoom(LatLng(lat, lng), zoom),
    );
  }

  Future<void> zoomBy(double delta) async {
    final c = _google;
    if (c == null) return;
    await c.animateCamera(CameraUpdate.zoomBy(delta));
  }
}

/// Interactive operating-zone map (Google Maps) with circle + freehand draw.
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

  final ValueNotifier<List<LatLng>> _stroke = ValueNotifier(const []);
  late final ValueNotifier<LatLng> _draftCenter;
  Offset? _lastSample;
  static const _minSamplePx = 6.0;
  GoogleMapController? _google;

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
      // no-op — GoogleMapController disposed with map
    }
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

  Future<void> _onPointerDown(PointerDownEvent e) async {
    if (!_isDraw || _google == null) return;
    final latLng = await _google!.getLatLng(
      ScreenCoordinate(x: e.localPosition.dx.round(), y: e.localPosition.dy.round()),
    );
    _lastSample = e.localPosition;
    _stroke.value = [latLng];
  }

  Future<void> _onPointerMove(PointerMoveEvent e) async {
    if (!_isDraw || _stroke.value.isEmpty || _google == null) return;
    final last = _lastSample;
    if (last != null) {
      final dx = e.localPosition.dx - last.dx;
      final dy = e.localPosition.dy - last.dy;
      if (dx * dx + dy * dy < _minSamplePx * _minSamplePx) return;
    }
    _lastSample = e.localPosition;
    final latLng = await _google!.getLatLng(
      ScreenCoordinate(x: e.localPosition.dx.round(), y: e.localPosition.dy.round()),
    );
    _stroke.value = List<LatLng>.from(_stroke.value)..add(latLng);
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

  Set<Polygon> get _polygons {
    final set = OperatingZonePolygons.build(
      zones: widget.zones,
      selectedId: widget.selectedZoneId,
    );
    // Rebuild with onTap for selection
    return set.map((p) {
      final id = p.polygonId.value;
      return Polygon(
        polygonId: p.polygonId,
        points: p.points,
        fillColor: p.fillColor,
        strokeColor: p.strokeColor,
        strokeWidth: p.strokeWidth,
        consumeTapEvents: true,
        onTap: () {
          if (_isCreating) return;
          widget.onZoneSelected?.call(id);
        },
      );
    }).toSet();
  }

  Set<Polygon> get _draftPolys {
    final out = <Polygon>{};
    for (var i = 0; i < widget.draftPolygons.length; i++) {
      final poly = widget.draftPolygons[i];
      if (poly.length < 3) continue;
      out.add(
        Polygon(
          polygonId: PolygonId('draft_$i'),
          points: poly.map((p) => LatLng(p.latitude, p.longitude)).toList(),
          fillColor: OperatingZonePolygons.fill,
          strokeColor: GtColors.brand,
          strokeWidth: 3,
        ),
      );
    }
    return out;
  }

  Set<Circle> get _circles {
    if (!_isCircle || widget.draftRadiusKm <= 0) return {};
    final c = _draftCenter.value;
    return {
      Circle(
        circleId: const CircleId('draft'),
        center: c,
        radius: widget.draftRadiusKm * 1000,
        fillColor: GtColors.brand.withValues(alpha: 0.18),
        strokeColor: GtColors.brand,
        strokeWidth: 2,
      ),
    };
  }

  Set<Polyline> get _strokeLine {
    final pts = _stroke.value;
    if (pts.length < 2) return {};
    return {
      Polyline(
        polylineId: const PolylineId('stroke'),
        points: pts,
        color: GtColors.brand,
        width: 3,
      ),
    };
  }

  Set<Marker> get _markers {
    final markers = <Marker>{
      Marker(
        markerId: const MarkerId('base'),
        position: _base,
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
        infoWindow: const InfoWindow(title: 'Base'),
      ),
    };
    final selected = widget.selectedZoneId == null
        ? null
        : widget.zones.cast<OperatingZone?>().firstWhere(
              (z) => z?.id == widget.selectedZoneId,
              orElse: () => null,
            );
    final deleteAt =
        selected == null ? null : OperatingZonePolygons.centroidOf(selected);
    if (deleteAt != null &&
        widget.mode == ZoneMapMode.selected &&
        widget.onDeleteSelected != null) {
      markers.add(
        Marker(
          markerId: const MarkerId('delete'),
          position: deleteAt,
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange),
          infoWindow: const InfoWindow(title: 'Remove zone'),
          onTap: widget.onDeleteSelected,
        ),
      );
    }
    return markers;
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        ValueListenableBuilder<LatLng>(
          valueListenable: _draftCenter,
          builder: (context, _, __) {
            return ValueListenableBuilder<List<LatLng>>(
              valueListenable: _stroke,
              builder: (context, __, ___) {
                return GoogleMap(
                  initialCameraPosition: CameraPosition(
                    target: _base,
                    zoom: 10.5,
                  ),
                  polygons: {..._polygons, if (_isDraw) ..._draftPolys},
                  circles: _circles,
                  polylines: _isDraw ? _strokeLine : {},
                  markers: _markers,
                  myLocationButtonEnabled: false,
                  zoomControlsEnabled: false,
                  mapToolbarEnabled: false,
                  compassEnabled: false,
                  scrollGesturesEnabled: !_isDraw,
                  rotateGesturesEnabled: false,
                  onMapCreated: (c) {
                    _google = c;
                    _controller.attach(c);
                  },
                  onCameraMove: (pos) {
                    _controller.center = GeoPoint(
                      latitude: pos.target.latitude,
                      longitude: pos.target.longitude,
                    );
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
        // Base marker overlay (branded chip) — visual only
        const IgnorePointer(
          child: SizedBox.shrink(),
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
        // Keep BaseLocationMarker hint as floating label near top-left when useful
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
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: GtColors.text,
                  ),
                ),
              ),
            ),
          ),
        if (_isCircle)
          Positioned(
            left: 12,
            right: 60,
            top: 12,
            child: Material(
              elevation: 2,
              borderRadius: BorderRadius.circular(10),
              color: Colors.white,
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                child: Text(
                  'Circle mode — pan map to move center, drag slider for radius',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: GtColors.text,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
