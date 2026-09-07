import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import 'zone/base_location_marker.dart';
import 'zone/map_controls.dart';

class MapScreen extends StatefulWidget {
  const MapScreen({super.key});

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  final MapController _controller = MapController();
  late double _lat;
  late double _lng;
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
    _controller.dispose();
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
                FlutterMap(
                  mapController: _controller,
                  options: MapOptions(
                    initialCenter: LatLng(_lat, _lng),
                    initialZoom: 14,
                    onTap: (_, p) => setState(() {
                      _lat = p.latitude;
                      _lng = p.longitude;
                    }),
                    interactionOptions: const InteractionOptions(
                      flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
                    ),
                  ),
                  children: [
                    TileLayer(
                      urlTemplate:
                          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'com.cango.driver',
                    ),
                    MarkerLayer(
                      markers: [
                        Marker(
                          point: LatLng(_lat, _lng),
                          width: 200,
                          height: 90,
                          alignment: Alignment.bottomCenter,
                          child: const BaseLocationMarker(),
                        ),
                      ],
                    ),
                  ],
                ),
                Positioned(
                  right: 12,
                  top: 72,
                  child: MapControls(
                    onZoomIn: () {
                      final c = _controller.camera;
                      _controller.move(c.center, (c.zoom + 1).clamp(3.0, 18.0));
                    },
                    onZoomOut: () {
                      final c = _controller.camera;
                      _controller.move(c.center, (c.zoom - 1).clamp(3.0, 18.0));
                    },
                    onRecenter: () => _controller.move(LatLng(_lat, _lng), 14),
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
                const SizedBox(height: 4),
                Text(address, style: const TextStyle(fontSize: 14)),
                const SizedBox(height: 12),
                GtGreenButton(label: 'Done', onPressed: _done),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
