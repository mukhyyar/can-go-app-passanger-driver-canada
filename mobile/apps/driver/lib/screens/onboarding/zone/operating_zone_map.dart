import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:latlong2/latlong.dart';

import 'base_location_marker.dart';
import 'delete_zone_button.dart';
import 'map_controls.dart';
import 'operating_zone_polygon.dart';
import 'zone_creation_bar.dart';
import 'zone_geo.dart';

enum ZoneMapMode { viewing, creating, selected }

/// Interactive operating-zone map with circle + freehand draw creation.
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
  /// Explicit flag — Draw mode must pass false so radius circle never mounts.
  final bool showDraftCircle;
  final List<List<GeoPoint>> draftPolygons;
  final String? selectedZoneId;
  final void Function(String? zoneId)? onZoneSelected;
  final VoidCallback? onDeleteSelected;
  final ValueChanged<List<GeoPoint>>? onFreehandCompleted;
  final MapController? mapController;

  @override
  State<OperatingZoneMap> createState() => _OperatingZoneMapState();
}

class _OperatingZoneMapState extends State<OperatingZoneMap> {
  late final MapController _controller;
  bool _ownsController = false;
  bool _tilesError = false;

  /// Live freehand stroke — local notifier to avoid full-screen rebuilds.
  final ValueNotifier<List<LatLng>> _stroke = ValueNotifier(const []);
  /// Draft circle center without MapCamera.of (safe across tool switches).
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
      _controller = MapController();
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
        try {
          _draftCenter.value = _controller.camera.center;
        } catch (_) {
          _draftCenter.value = _base;
        }
      }
    }
  }

  @override
  void dispose() {
    _stroke.dispose();
    _draftCenter.dispose();
    if (_ownsController) _controller.dispose();
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

  void _zoomBy(double delta) {
    final cam = _controller.camera;
    _controller.move(cam.center, (cam.zoom + delta).clamp(3.0, 18.0));
  }

  void _recenter() {
    final zoom = _isCircle ? _zoomForRadius(widget.draftRadiusKm) : 10.5;
    _controller.move(_base, zoom);
  }

  double _zoomForRadius(double radiusKm) {
    if (radiusKm <= 15) return 11;
    if (radiusKm <= 40) return 10;
    if (radiusKm <= 80) return 9;
    if (radiusKm <= 120) return 8;
    return 7.5;
  }

  String? _hitTest(LatLng point) {
    for (final z in widget.zones.reversed) {
      if (z.isCircle && z.center != null && z.radiusKm != null) {
        if (ZoneGeo.containsInCircle(point, z.center!, z.radiusKm!)) {
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

  void _onPointerDown(PointerDownEvent e) {
    if (!_isDraw) return;
    final cam = _controller.camera;
    final latLng = cam.screenOffsetToLatLng(e.localPosition);
    _lastSample = e.localPosition;
    _stroke.value = [latLng];
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
    final cam = _controller.camera;
    final latLng = cam.screenOffsetToLatLng(e.localPosition);
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

  int get _interactionFlags {
    if (_isDraw) return InteractiveFlag.none;
    return InteractiveFlag.all & ~InteractiveFlag.rotate;
  }

  @override
  Widget build(BuildContext context) {
    final selected = widget.selectedZoneId == null
        ? null
        : widget.zones.cast<OperatingZone?>().firstWhere(
              (z) => z?.id == widget.selectedZoneId,
              orElse: () => null,
            );
    final deleteAt =
        selected == null ? null : OperatingZonePolygons.centroidOf(selected);

    final draftPolygonLayers = <Polygon>[];
    for (final poly in widget.draftPolygons) {
      if (poly.length < 3) continue;
      draftPolygonLayers.add(
        Polygon(
          points: poly.map((p) => LatLng(p.latitude, p.longitude)).toList(),
          color: OperatingZonePolygons.fill,
          borderColor: GtColors.brand,
          borderStrokeWidth: 2.5,
        ),
      );
    }

    return Stack(
      fit: StackFit.expand,
      children: [
        FlutterMap(
          mapController: _controller,
          options: MapOptions(
            initialCenter: _base,
            initialZoom: 10.5,
            minZoom: 3,
            maxZoom: 18,
            interactionOptions: InteractionOptions(flags: _interactionFlags),
            onPositionChanged: (camera, _) {
              if (!_isCircle) return;
              final next = camera.center;
              if (_draftCenter.value != next) {
                _draftCenter.value = next;
              }
            },
            onTap: (tap, latLng) {
              if (_isCreating) return;
              widget.onZoneSelected?.call(_hitTest(latLng));
            },
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.cango.driver',
              errorTileCallback: (_, __, ___) {
                if (!_tilesError && mounted) {
                  setState(() => _tilesError = true);
                }
              },
            ),
            PolygonLayer(
              polygons: OperatingZonePolygons.build(
                zones: widget.zones,
                selectedId: widget.selectedZoneId,
              ),
            ),
            // Draft circle ONLY in Circle tool — never in Draw.
            // Uses controller center notifier (no MapCamera.of) so tool
            // switches never look up a deactivated ancestor.
            if (_isCircle && widget.draftRadiusKm > 0)
              ValueListenableBuilder<LatLng>(
                valueListenable: _draftCenter,
                builder: (context, center, _) {
                  return CircleLayer(
                    circles: [
                      CircleMarker(
                        point: center,
                        radius: widget.draftRadiusKm * 1000,
                        useRadiusInMeter: true,
                        color: GtColors.brand.withValues(alpha: 0.18),
                        borderStrokeWidth: 2.5,
                        borderColor: GtColors.brand,
                      ),
                    ],
                  );
                },
              ),
            if (_isDraw && draftPolygonLayers.isNotEmpty)
              PolygonLayer(polygons: draftPolygonLayers),
            if (_isDraw)
              ValueListenableBuilder<List<LatLng>>(
                valueListenable: _stroke,
                builder: (context, pts, _) {
                  if (pts.length < 2) return const SizedBox.shrink();
                  return PolylineLayer(
                    polylines: [
                      Polyline(
                        points: pts,
                        color: GtColors.brand,
                        strokeWidth: 3,
                      ),
                    ],
                  );
                },
              ),
            MarkerLayer(
              markers: [
                Marker(
                  point: _base,
                  width: 200,
                  height: 90,
                  alignment: Alignment.bottomCenter,
                  child: const IgnorePointer(child: BaseLocationMarker()),
                ),
                if (deleteAt != null &&
                    widget.mode == ZoneMapMode.selected &&
                    widget.onDeleteSelected != null)
                  Marker(
                    point: deleteAt,
                    width: 48,
                    height: 48,
                    child:
                        DeleteZoneButton(onPressed: widget.onDeleteSelected!),
                  ),
              ],
            ),
          ],
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
        if (_tilesError)
          Positioned(
            left: 12,
            right: 60,
            top: 12,
            child: Material(
              color: Colors.white.withValues(alpha: 0.95),
              borderRadius: BorderRadius.circular(8),
              child: const Padding(
                padding: EdgeInsets.all(10),
                child: Text(
                  'Map tiles unavailable. You can still add zones; try again when online.',
                  style: TextStyle(fontSize: 12, color: GtColors.textSecondary),
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
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
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
