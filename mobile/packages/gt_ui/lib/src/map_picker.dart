import 'package:flutter/widgets.dart';

import 'map_picker_impl.dart'
    if (dart.library.html) 'map_picker_web.dart' as map_pick_impl;

/// Reverse-geocode using the best available provider for this platform
/// (browser Geocoder on web; caller should fall back to server API).
Future<String?> reverseGeocodeLatLng(double lat, double lng) =>
    map_pick_impl.reverseGeocodeLatLng(lat, lng);

/// Imperative handle so a parent can recenter the picker (e.g. my-location).
class GtMapPickerController {
  void Function(double lat, double lng)? _animateTo;
  (double, double)? Function()? _readCenter;
  void Function()? _disposeHook;

  /// Called by platform embeds — not for app code.
  void bind({
    required void Function(double lat, double lng) animateTo,
    (double, double)? Function()? readCenter,
    void Function()? onDispose,
  }) {
    _animateTo = animateTo;
    _readCenter = readCenter;
    _disposeHook = onDispose;
  }

  /// Called by platform embeds when the map is disposed.
  void unbind() {
    _disposeHook?.call();
    _animateTo = null;
    _readCenter = null;
    _disposeHook = null;
  }

  /// Animate the map so [lat]/[lng] sits under the fixed center pin.
  void animateTo(double lat, double lng) => _animateTo?.call(lat, lng);

  /// Live map-camera center (pin target), or null if the map is not ready.
  (double, double)? get center => _readCenter?.call();
}

/// Pannable Google Map for place picking — no markers; parent overlays a
/// fixed center pin and reads [onCenterChanged] on camera idle.
class GtMapPicker extends StatefulWidget {
  const GtMapPicker({
    super.key,
    required this.initialLat,
    required this.initialLng,
    this.controller,
    this.onCenterChanged,
    this.onMovingChanged,
    this.initialZoom = 15,
  });

  final double initialLat;
  final double initialLng;
  final GtMapPickerController? controller;
  final void Function(double lat, double lng)? onCenterChanged;
  final ValueChanged<bool>? onMovingChanged;
  final double initialZoom;

  @override
  State<GtMapPicker> createState() => _GtMapPickerState();
}

class _GtMapPickerState extends State<GtMapPicker> {
  @override
  Widget build(BuildContext context) {
    return map_pick_impl.buildMapPicker(
      initialLat: widget.initialLat,
      initialLng: widget.initialLng,
      initialZoom: widget.initialZoom,
      controller: widget.controller,
      onCenterChanged: widget.onCenterChanged,
      onMovingChanged: widget.onMovingChanged,
    );
  }
}
