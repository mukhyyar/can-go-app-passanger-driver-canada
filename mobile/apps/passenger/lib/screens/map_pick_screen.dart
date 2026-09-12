import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';
import 'package:passenger/utils/device_geo.dart';
import 'package:provider/provider.dart';

class MapPickScreen extends StatefulWidget {
  const MapPickScreen({super.key});

  @override
  State<MapPickScreen> createState() => _MapPickScreenState();
}

class _MapPickScreenState extends State<MapPickScreen>
    with SingleTickerProviderStateMixin {
  final _mapController = GtMapPickerController();

  late double _centerLat;
  late double _centerLng;
  late final double _initialLat;
  late final double _initialLng;

  String _addressLabel = 'Move the map to set the pin';
  bool _geocoding = false;
  bool _moving = false;
  bool _locating = false;
  bool _confirming = false;
  bool _showHint = true;
  int _geoSeq = 0;
  Timer? _reverseDebounce;

  late final AnimationController _pinCtrl;
  late final Animation<double> _pinLift;

  @override
  void initState() {
    super.initState();
    final state = context.read<AppState>();
    final existing = state.locationField == 'to' ? state.to : state.from;
    final seed = existing?.hasCoords == true
        ? existing!
        : MockData.places.first;
    _initialLat = seed.lat;
    _initialLng = seed.lng;
    _centerLat = seed.lat;
    _centerLng = seed.lng;
    if (seed.label.isNotEmpty) {
      _addressLabel = seed.label;
    }

    _pinCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 220),
    );
    _pinLift = Tween<double>(begin: 0, end: -10).animate(
      CurvedAnimation(parent: _pinCtrl, curve: Curves.easeOutCubic),
    );

    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_bootstrapGpsIfNeeded(existing));
      unawaited(_reverse(_centerLat, _centerLng));
    });
  }

  Future<void> _bootstrapGpsIfNeeded(Place? existing) async {
    if (existing?.hasCoords == true) return;
    final coords = await readDeviceCoords();
    if (!mounted || coords == null) return;
    _mapController.animateTo(coords.$1, coords.$2);
  }

  @override
  void dispose() {
    _reverseDebounce?.cancel();
    _pinCtrl.dispose();
    super.dispose();
  }

  void _onMovingChanged(bool moving) {
    if (_moving == moving) return;
    setState(() {
      _moving = moving;
      if (moving) {
        _showHint = false;
        _geocoding = true;
        // Clear stale seed/previous label so UI does not keep showing the
        // already-selected place while the pin moves.
        _addressLabel = 'Searching address…';
      }
    });
    if (moving) {
      _pinCtrl.forward();
    } else {
      _pinCtrl.reverse().then((_) {
        if (!mounted) return;
        _pinCtrl.forward().then((_) {
          if (mounted) _pinCtrl.reverse();
        });
      });
    }
  }

  void _onCenterChanged(double lat, double lng) {
    // Always track the live pin target immediately.
    _centerLat = lat;
    _centerLng = lng;
    _reverseDebounce?.cancel();
    _reverseDebounce = Timer(const Duration(milliseconds: 280), () {
      if (!mounted) return;
      unawaited(_reverse(lat, lng));
    });
  }

  /// Prefer live map camera center over last cached values.
  (double, double) _liveCenter() {
    final live = _mapController.center;
    if (live != null) return live;
    return (_centerLat, _centerLng);
  }

  Future<void> _reverse(double lat, double lng) async {
    final seq = ++_geoSeq;
    if (mounted) {
      setState(() => _geocoding = true);
    }

    String? label;
    try {
      // Web: Google JS Geocoder (browser key) — accurate street addresses.
      label = await reverseGeocodeLatLng(lat, lng)
          .timeout(const Duration(seconds: 8));
    } catch (_) {
      label = null;
    }
    if (label == null || label.isEmpty) {
      try {
        final place = await PlacesSearch.reverse(lat, lng)
            .timeout(const Duration(seconds: 8));
        label = place?.label;
      } catch (_) {
        label = null;
      }
    }

    if (!mounted || seq != _geoSeq) return;
    final live = _liveCenter();
    if ((live.$1 - lat).abs() > 0.00008 || (live.$2 - lng).abs() > 0.00008) {
      return;
    }
    setState(() {
      _geocoding = false;
      _centerLat = lat;
      _centerLng = lng;
      _addressLabel = (label != null && label.isNotEmpty)
          ? label
          : '${lat.toStringAsFixed(5)}, ${lng.toStringAsFixed(5)}';
    });
  }

  Future<void> _goMyLocation() async {
    if (_locating) return;
    setState(() => _locating = true);
    try {
      final coords = await readDeviceCoords();
      if (!mounted) return;
      if (coords == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Location permission needed — move the map instead',
            ),
          ),
        );
        return;
      }
      _mapController.animateTo(coords.$1, coords.$2);
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Future<void> _confirm() async {
    if (_confirming || _moving) return;
    setState(() => _confirming = true);

    final app = context.read<AppState>();
    final field = app.locationField;
    final live = _liveCenter();
    final lat = live.$1;
    final lng = live.$2;
    final fallbackLabel = _addressLabel.trim().isNotEmpty &&
            _addressLabel != 'Searching address…'
        ? _addressLabel
        : '${lat.toStringAsFixed(5)}, ${lng.toStringAsFixed(5)}';

    try {
      Place? reversed;
      String? label;
      try {
        label = await reverseGeocodeLatLng(lat, lng)
            .timeout(const Duration(seconds: 8));
      } catch (_) {
        label = null;
      }
      if (label == null || label.isEmpty) {
        try {
          reversed = await PlacesSearch.reverse(lat, lng)
              .timeout(const Duration(seconds: 8));
          label = reversed?.label;
        } catch (_) {
          reversed = null;
        }
      }
      if (!mounted) return;

      final place = Place(
        id: reversed?.id.isNotEmpty == true
            ? reversed!.id
            : 'pin-$lat-$lng',
        label: (label != null && label.isNotEmpty) ? label : fallbackLabel,
        subtitle: reversed?.subtitle ?? '',
        lat: lat,
        lng: lng,
        placeId: reversed?.placeId,
      );

      if (Navigator.of(context).canPop()) {
        Navigator.of(context).pop();
      }
      if (Navigator.of(context).canPop()) {
        Navigator.of(context).pop();
      } else {
        context.go('/');
      }
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (field == 'to') {
          app.setTo(place);
        } else {
          app.setFrom(place);
        }
        unawaited(app.addPlaceToSearchHistory(place));
      });
    } finally {
      if (mounted) setState(() => _confirming = false);
    }
  }

  String get _fieldTitle {
    final field = context.read<AppState>().locationField;
    return field == 'to' ? 'Drop-off on map' : 'Pickup on map';
  }

  @override
  Widget build(BuildContext context) {
    final canConfirm = !_confirming && !_moving;

    return Scaffold(
      backgroundColor: GtColors.bg,
      appBar: AppBar(
        title: Text(_fieldTitle),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          Positioned.fill(
            child: GtMapPicker(
              initialLat: _initialLat,
              initialLng: _initialLng,
              controller: _mapController,
              onCenterChanged: _onCenterChanged,
              onMovingChanged: _onMovingChanged,
            ),
          ),

          // Fixed center pin (tip at visual center) — small hit box only.
          IgnorePointer(
            child: Align(
              alignment: Alignment.center,
              child: AnimatedBuilder(
                animation: _pinLift,
                builder: (context, child) {
                  return Transform.translate(
                    offset: Offset(0, _pinLift.value - 22),
                    child: child,
                  );
                },
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.location_on,
                      size: 48,
                      color: GtColors.brand,
                      shadows: [
                        Shadow(
                          color: Colors.black.withValues(alpha: 0.25),
                          blurRadius: 8,
                          offset: const Offset(0, 3),
                        ),
                      ],
                    ),
                    Transform.translate(
                      offset: const Offset(0, -6),
                      child: AnimatedOpacity(
                        duration: const Duration(milliseconds: 160),
                        opacity: _moving ? 0.35 : 0.55,
                        child: Container(
                          width: _moving ? 10 : 14,
                          height: _moving ? 4 : 6,
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.35),
                            borderRadius: BorderRadius.circular(99),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // Top address card + hint.
          Positioned(
            left: 16,
            right: 16,
            top: 12,
            child: SafeArea(
              bottom: false,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Material(
                    color: Colors.white,
                    elevation: 2,
                    shadowColor: Colors.black26,
                    borderRadius: BorderRadius.circular(12),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Icon(
                              Icons.place,
                              color: GtColors.brand,
                              size: 22,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  _geocoding || _moving
                                      ? 'Searching address…'
                                      : 'Selected location',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: GtColors.textMuted,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  _addressLabel,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                    color: GtColors.text,
                                    height: 1.25,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          if (_geocoding || _moving) ...[
                            const SizedBox(width: 8),
                            const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: GtColors.brand,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                  if (_showHint) ...[
                    const SizedBox(height: 8),
                    Text(
                      'Map move karo — pin center pe rehti hai',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                        color: GtColors.text.withValues(alpha: 0.75),
                        shadows: const [
                          Shadow(
                            color: Colors.white,
                            blurRadius: 6,
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),

          // My location FAB.
          Positioned(
            right: 16,
            bottom: 108,
            child: SafeArea(
              top: false,
              child: Material(
                color: Colors.white,
                elevation: 3,
                shadowColor: Colors.black26,
                shape: const CircleBorder(),
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: _locating ? null : _goMyLocation,
                  child: SizedBox(
                    width: 48,
                    height: 48,
                    child: Center(
                      child: _locating
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.2,
                                color: GtColors.brand,
                              ),
                            )
                          : const Icon(
                              Icons.my_location,
                              color: GtColors.text,
                            ),
                    ),
                  ),
                ),
              ),
            ),
          ),

          // Confirm bar.
          Positioned(
            left: 16,
            right: 16,
            bottom: 24,
            child: SafeArea(
              top: false,
              child: GtGreenButton(
                label: _confirming ? 'Saving…' : 'Done',
                onPressed: canConfirm ? _confirm : null,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
