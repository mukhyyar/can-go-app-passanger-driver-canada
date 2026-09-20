import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import 'zone/map_controls.dart';

class MapScreen extends StatefulWidget {
  const MapScreen({super.key});

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  GoogleMapController? _controller;
  late double _lat;
  late double _lng;
  double _zoom = 14;
  bool _inited = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_inited) return;
    final s = context.read<AppState>();
    _lat = s.baseLatitude;
    _lng = s.baseLongitude;
    _inited = true;
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  void _done() {
    final s = context.read<AppState>();
    final address = s.baseLocation.isEmpty
        ? '9580 Jane St, Vaughan, ON L4H 2E8, Canada'
        : s.baseLocation;
    s.updateProfile(
      baseLocation: address,
      baseLatitude: _lat,
      baseLongitude: _lng,
    );
    context.go('/onboarding/zone');
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final address = s.baseLocation.isEmpty
        ? '9580 Jane St, Vaughan, ON L4H 2E8, Canada'
        : s.baseLocation;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Base location'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        actions: [
          TextButton(
            onPressed: _done,
            child: const Text(
              'Done',
              style: TextStyle(
                color: GtColors.orange,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: Stack(
              fit: StackFit.expand,
              children: [
                GoogleMap(
                  initialCameraPosition: CameraPosition(
                    target: LatLng(_lat, _lng),
                    zoom: _zoom,
                  ),
                  myLocationButtonEnabled: false,
                  zoomControlsEnabled: false,
                  mapToolbarEnabled: false,
                  compassEnabled: false,
                  gestureRecognizers: <Factory<OneSequenceGestureRecognizer>>{
                    Factory<OneSequenceGestureRecognizer>(
                      () => EagerGestureRecognizer(),
                    ),
                  },
                  markers: {
                    Marker(
                      markerId: const MarkerId('base'),
                      position: LatLng(_lat, _lng),
                      icon: BitmapDescriptor.defaultMarkerWithHue(
                        BitmapDescriptor.hueRed,
                      ),
                    ),
                  },
                  onMapCreated: (c) => _controller = c,
                  onTap: (p) => setState(() {
                    _lat = p.latitude;
                    _lng = p.longitude;
                  }),
                  onCameraMove: (pos) {
                    _zoom = pos.zoom;
                  },
                ),
                Positioned(
                  right: 12,
                  top: 72,
                  child: MapControls(
                    onZoomIn: () {
                      _zoom = (_zoom + 1).clamp(3.0, 20.0);
                      _controller?.animateCamera(CameraUpdate.zoomTo(_zoom));
                    },
                    onZoomOut: () {
                      _zoom = (_zoom - 1).clamp(3.0, 20.0);
                      _controller?.animateCamera(CameraUpdate.zoomTo(_zoom));
                    },
                    onRecenter: () => _controller?.animateCamera(
                      CameraUpdate.newLatLngZoom(LatLng(_lat, _lng), 14),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: const BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: GtColors.border)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Base location of your transport',
                  style: TextStyle(fontSize: 12, color: GtColors.textMuted),
                ),
                const SizedBox(height: 6),
                Text(
                  address,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 4),
                Text(
                  '${_lat.toStringAsFixed(5)}, ${_lng.toStringAsFixed(5)}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: GtColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
