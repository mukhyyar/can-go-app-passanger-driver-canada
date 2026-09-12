import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import 'map_picker.dart';

/// Native has no browser Geocoder — caller uses PlacesSearch.reverse.
Future<String?> reverseGeocodeLatLng(double lat, double lng) async => null;

/// Native OpenStreetMap picker embed.
Widget buildMapPicker({
  required double initialLat,
  required double initialLng,
  required double initialZoom,
  GtMapPickerController? controller,
  void Function(double lat, double lng)? onCenterChanged,
  ValueChanged<bool>? onMovingChanged,
}) {
  return _NativeMapPicker(
    initialLat: initialLat,
    initialLng: initialLng,
    initialZoom: initialZoom,
    controller: controller,
    onCenterChanged: onCenterChanged,
    onMovingChanged: onMovingChanged,
  );
}

class _NativeMapPicker extends StatefulWidget {
  const _NativeMapPicker({
    required this.initialLat,
    required this.initialLng,
    required this.initialZoom,
    this.controller,
    this.onCenterChanged,
    this.onMovingChanged,
  });

  final double initialLat;
  final double initialLng;
  final double initialZoom;
  final GtMapPickerController? controller;
  final void Function(double lat, double lng)? onCenterChanged;
  final ValueChanged<bool>? onMovingChanged;

  @override
  State<_NativeMapPicker> createState() => _NativeMapPickerState();
}

class _NativeMapPickerState extends State<_NativeMapPicker> {
  final MapController _map = MapController();
  LatLng _center = const LatLng(0, 0);
  bool _moving = false;

  @override
  void initState() {
    super.initState();
    _center = LatLng(widget.initialLat, widget.initialLng);
    _bindController();
  }

  void _bindController() {
    widget.controller?.bind(
      animateTo: _animateTo,
      readCenter: () => (_center.latitude, _center.longitude),
      onDispose: () {},
    );
  }

  @override
  void didUpdateWidget(covariant _NativeMapPicker oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller?.unbind();
      _bindController();
    }
  }

  @override
  void dispose() {
    widget.controller?.unbind();
    _map.dispose();
    super.dispose();
  }

  Future<void> _animateTo(double lat, double lng) async {
    final target = LatLng(lat, lng);
    _center = target;
    _map.move(target, widget.initialZoom);
    widget.onCenterChanged?.call(lat, lng);
  }

  void _setMoving(bool value) {
    if (_moving == value) return;
    _moving = value;
    widget.onMovingChanged?.call(value);
  }

  @override
  Widget build(BuildContext context) {
    return FlutterMap(
      mapController: _map,
      options: MapOptions(
        initialCenter: LatLng(widget.initialLat, widget.initialLng),
        initialZoom: widget.initialZoom,
        onMapReady: () {
          widget.onCenterChanged?.call(widget.initialLat, widget.initialLng);
        },
        onPositionChanged: (camera, hasGesture) {
          _center = camera.center;
          if (hasGesture) _setMoving(true);
        },
        onMapEvent: (event) {
          if (event is MapEventMoveEnd || event is MapEventFlingAnimationEnd) {
            _setMoving(false);
            widget.onCenterChanged?.call(_center.latitude, _center.longitude);
          }
        },
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.gettransfer',
        ),
        const Align(
          alignment: Alignment.bottomRight,
          child: ColoredBox(
            color: Color(0xCCFFFFFF),
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: 4, vertical: 2),
              child: Text(
                '© OpenStreetMap contributors',
                style: TextStyle(fontSize: 10),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
