import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import 'map_picker.dart';

/// Native has no browser Geocoder — caller uses PlacesSearch.reverse.
Future<String?> reverseGeocodeLatLng(double lat, double lng) async => null;

/// Native map picker via Google Maps SDK (API key in AndroidManifest).
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
  GoogleMapController? _map;
  LatLng _center = const LatLng(0, 0);
  bool _moving = false;
  bool _programmaticMove = false;

  @override
  void initState() {
    super.initState();
    _center = LatLng(widget.initialLat, widget.initialLng);
    _bindController();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      widget.onCenterChanged?.call(widget.initialLat, widget.initialLng);
    });
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
    // Do not dispose GoogleMapController — the GoogleMap widget owns it.
    _map = null;
    super.dispose();
  }

  Future<void> _animateTo(double lat, double lng) async {
    final target = LatLng(lat, lng);
    _center = target;
    final map = _map;
    if (map == null) return;
    _programmaticMove = true;
    await map.animateCamera(
      CameraUpdate.newCameraPosition(
        CameraPosition(target: target, zoom: widget.initialZoom),
      ),
    );
    _programmaticMove = false;
    widget.onCenterChanged?.call(lat, lng);
  }

  void _setMoving(bool value) {
    if (_moving == value) return;
    _moving = value;
    widget.onMovingChanged?.call(value);
  }

  @override
  Widget build(BuildContext context) {
    return GoogleMap(
      initialCameraPosition: CameraPosition(
        target: LatLng(widget.initialLat, widget.initialLng),
        zoom: widget.initialZoom,
      ),
      myLocationButtonEnabled: false,
      zoomControlsEnabled: false,
      mapToolbarEnabled: false,
      compassEnabled: false,
      onMapCreated: (c) {
        _map = c;
      },
      onCameraMove: (pos) {
        _center = pos.target;
        if (!_programmaticMove) _setMoving(true);
      },
      onCameraIdle: () {
        _setMoving(false);
        widget.onCenterChanged?.call(_center.latitude, _center.longitude);
      },
    );
  }
}
