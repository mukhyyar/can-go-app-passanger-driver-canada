import 'dart:async';

import 'package:flutter/material.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/screens/book/route_map_adjust_bar.dart';
import 'package:passenger/screens/book/route_map_controls.dart';
import 'package:passenger/state/app_state.dart';

class RouteMapStrip extends StatelessWidget {
  const RouteMapStrip({super.key, required this.state});

  final AppState state;

  bool get _showStrip {
    final from = state.from;
    return from != null && from.hasCoords;
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedSize(
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOutCubic,
      alignment: Alignment.topCenter,
      child: !_showStrip
          ? const SizedBox.shrink()
          : AnimatedOpacity(
              duration: const Duration(milliseconds: 250),
              opacity: 1,
              child: Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: _MapBody(state: state),
              ),
            ),
    );
  }
}

class _MapBody extends StatefulWidget {
  const _MapBody({required this.state});
  final AppState state;

  @override
  State<_MapBody> createState() => _MapBodyState();
}

class _MapBodyState extends State<_MapBody> {
  final GtRouteMapController _mapController = GtRouteMapController();

  GtRouteMapAdjustField? _adjusting;
  bool _centerPinMode = false;
  double? _previewLat;
  double? _previewLng;
  String _addressLabel = '';
  bool _geocoding = false;
  bool _confirming = false;
  int _geoSeq = 0;
  Timer? _geoDebounce;
  /// Suppress map-idle preview updates while the camera settles on the pin.
  int _suppressIdleUntilMs = 0;

  AppState get state => widget.state;

  bool get _showTo {
    final to = state.to;
    return to != null &&
        to.hasCoords &&
        (state.serviceType != ServiceType.perHour || state.perHourHasEnd);
  }

  @override
  void dispose() {
    _geoDebounce?.cancel();
    super.dispose();
  }

  void _beginAdjust(GtRouteMapAdjustField field, {bool centerPin = false}) {
    final place = field == GtRouteMapAdjustField.from ? state.from : state.to;
    if (place == null || !place.hasCoords) return;
    _geoDebounce?.cancel();
    setState(() {
      _adjusting = field;
      _centerPinMode = centerPin;
      _previewLat = place.lat;
      _previewLng = place.lng;
      _addressLabel = place.label.isNotEmpty
          ? place.label
          : '${place.lat.toStringAsFixed(5)}, ${place.lng.toStringAsFixed(5)}';
      _geocoding = false;
      _confirming = false;
      if (centerPin) {
        // Ignore idle events from the zoom-to-pin animation (~450ms).
        _suppressIdleUntilMs =
            DateTime.now().millisecondsSinceEpoch + 500;
      }
    });
    if (centerPin) {
      // Focus the pin being adjusted so the fixed center pin matches.
      _mapController.animateTo(place.lat, place.lng, zoom: 16);
      unawaited(_reverse(_previewLat!, _previewLng!));
    }
  }

  void _cancelAdjust() {
    _geoDebounce?.cancel();
    setState(() {
      _adjusting = null;
      _centerPinMode = false;
      _previewLat = null;
      _previewLng = null;
      _addressLabel = '';
      _geocoding = false;
      _confirming = false;
    });
  }

  void _onMarkerTap(GtRouteMapAdjustField field) {
    if (_adjusting != null && _adjusting != field) {
      _cancelAdjust();
    }
    _beginAdjust(field, centerPin: false);
  }

  void _onMarkerDragEnd(
    GtRouteMapAdjustField field,
    double lat,
    double lng,
  ) {
    if (_adjusting != field) {
      _beginAdjust(field, centerPin: false);
    }
    setState(() {
      _previewLat = lat;
      _previewLng = lng;
      _addressLabel = 'Searching address…';
      _geocoding = true;
    });
    unawaited(_reverse(lat, lng));
  }

  void _onCameraIdle(double lat, double lng) {
    if (!_centerPinMode || _adjusting == null || _confirming) return;
    if (DateTime.now().millisecondsSinceEpoch < _suppressIdleUntilMs) {
      return;
    }
    setState(() {
      _previewLat = lat;
      _previewLng = lng;
      _geocoding = true;
      _addressLabel = 'Searching address…';
    });
    _geoDebounce?.cancel();
    _geoDebounce = Timer(const Duration(milliseconds: 280), () {
      if (!mounted) return;
      unawaited(_reverse(lat, lng));
    });
  }

  Future<void> _reverse(double lat, double lng) async {
    final seq = ++_geoSeq;
    if (mounted) setState(() => _geocoding = true);

    String? label;
    try {
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
    if (_previewLat != null &&
        _previewLng != null &&
        ((_previewLat! - lat).abs() > 0.00008 ||
            (_previewLng! - lng).abs() > 0.00008)) {
      return;
    }

    setState(() {
      _geocoding = false;
      _addressLabel = (label != null && label.isNotEmpty)
          ? label
          : '${lat.toStringAsFixed(5)}, ${lng.toStringAsFixed(5)}';
    });
  }

  Future<void> _confirmAdjust() async {
    if (_confirming || _geocoding) return;
    final field = _adjusting;
    final lat = _previewLat;
    final lng = _previewLng;
    if (field == null || lat == null || lng == null) return;

    setState(() => _confirming = true);
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

      final fallback =
          '${lat.toStringAsFixed(5)}, ${lng.toStringAsFixed(5)}';
      final place = Place(
        id: reversed?.id.isNotEmpty == true
            ? reversed!.id
            : 'pin-$lat-$lng',
        label: (label != null && label.isNotEmpty) ? label : fallback,
        subtitle: reversed?.subtitle ?? '',
        lat: lat,
        lng: lng,
        placeId: reversed?.placeId,
      );

      if (!mounted) return;
      if (field == GtRouteMapAdjustField.to) {
        state.setTo(place);
      } else {
        state.setFrom(place);
      }
      unawaited(state.addPlaceToSearchHistory(place));
      _cancelAdjust();
    } finally {
      if (mounted) setState(() => _confirming = false);
    }
  }

  void _onRoutesLoaded(List<GtRouteOption> routes) {
    final usable = routes
        .where((r) => r.distanceKm > 0 && r.id != 'fallback_0')
        .toList();
    if (usable.isEmpty && routes.isNotEmpty) {
      // Synthetic / zero-distance only — do not book with stale road distance.
      state.setAvailableRoutes(const []);
      state.setRouteRecalcFailed(true);
      return;
    }
    state.setRouteRecalcFailed(false);
    state.setAvailableRoutes(usable.isNotEmpty ? usable : routes);
  }

  void _onRoutesLoadFailed() {
    state.setAvailableRoutes(const []);
    state.setRouteRecalcFailed(true);
  }

  @override
  Widget build(BuildContext context) {
    final from = state.from!;
    final showTo = _showTo;
    final to = showTo ? state.to : null;
    final adjusting = _adjusting;

    // Driving distance/ETA only — never haversine crow-flies for this badge.
    final selected = state.selectedRoute;
    final distanceLabel = showTo && selected != null && selected.distanceKm > 0
        ? '${selected.distanceKm} km • ${selected.durationMin} min'
        : null;

    final previewFromLat = adjusting == GtRouteMapAdjustField.from
        ? _previewLat
        : null;
    final previewFromLng = adjusting == GtRouteMapAdjustField.from
        ? _previewLng
        : null;
    final previewToLat =
        adjusting == GtRouteMapAdjustField.to ? _previewLat : null;
    final previewToLng =
        adjusting == GtRouteMapAdjustField.to ? _previewLng : null;

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Stack(
          children: [
            GtGoogleRouteMap(
              fromLat: from.lat,
              fromLng: from.lng,
              fromLabel: from.label,
              toLat: to?.lat,
              toLng: to?.lng,
              toLabel: to?.label,
              distanceLabel: distanceLabel,
              height: 260,
              canExpand: false,
              interactive: true,
              controller: _mapController,
              autoFitOnRouteSelect: false,
              animateRouteCar: false,
              includeSyntheticFallback: false,
              enableMarkerAdjust: true,
              adjustingField: adjusting,
              centerPinAdjust: _centerPinMode && adjusting != null,
              previewFromLat: previewFromLat,
              previewFromLng: previewFromLng,
              previewToLat: previewToLat,
              previewToLng: previewToLng,
              onMarkerTap: _onMarkerTap,
              onMarkerDragEnd: _onMarkerDragEnd,
              onCameraIdle: _centerPinMode ? _onCameraIdle : null,
              initialRouteIndex: state.selectedRouteIndex,
              enableRouteSelection: false,
              onRoutesLoaded: _onRoutesLoaded,
              onRoutesLoadFailed: _onRoutesLoadFailed,
              onRouteSelected: (route) {
                state.selectRoute(route);
              },
            ),
            Positioned(
              right: 10,
              bottom: adjusting != null ? 88 : 12,
              child: RouteMapControls(
                enabled: !_confirming,
                showAdjustDropoff: showTo,
                onRecenter: () => _mapController.recenter(),
                onZoomIn: () => _mapController.zoomIn(),
                onZoomOut: () => _mapController.zoomOut(),
                onAdjustPickup: () => _beginAdjust(
                  GtRouteMapAdjustField.from,
                  centerPin: true,
                ),
                onAdjustDropoff: () => _beginAdjust(
                  GtRouteMapAdjustField.to,
                  centerPin: true,
                ),
              ),
            ),
            if (_centerPinMode && adjusting != null)
              const Positioned.fill(
                child: IgnorePointer(
                  child: Center(
                    child: Padding(
                      padding: EdgeInsets.only(bottom: 22),
                      child: Icon(
                        Icons.location_on,
                        size: 44,
                        color: GtColors.brand,
                        shadows: [
                          Shadow(
                            color: Color(0x40000000),
                            blurRadius: 8,
                            offset: Offset(0, 3),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            if (adjusting != null)
              Positioned(
                left: 10,
                right: 52,
                bottom: 10,
                child: RouteMapAdjustBar(
                  title: adjusting == GtRouteMapAdjustField.from
                      ? 'Adjust pickup'
                      : 'Adjust drop-off',
                  addressLabel: _addressLabel.isEmpty
                      ? 'Move pin to set location'
                      : _addressLabel,
                  geocoding: _geocoding,
                  confirming: _confirming,
                  onConfirm: (_previewLat != null && !_geocoding)
                      ? () => unawaited(_confirmAdjust())
                      : null,
                  onCancel: _cancelAdjust,
                ),
              ),
            if (state.routeRecalcFailed && showTo && adjusting == null)
              Positioned(
                left: 10,
                right: 52,
                bottom: 10,
                child: Material(
                  color: const Color(0xFFFFF4F4),
                  borderRadius: BorderRadius.circular(10),
                  child: const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    child: Text(
                      'Could not calculate a driving route. Adjust locations or try again.',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: GtColors.brandDark,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
        if (showTo) _RouteSelectorCards(state: state),
      ],
    );
  }
}

class _RouteSelectorCards extends StatelessWidget {
  const _RouteSelectorCards({required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    final routes = state.availableRoutes;
    if (routes.isEmpty) return const SizedBox.shrink();

    final hasMultiple = routes.length > 1;

    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.alt_route_rounded,
                size: 16,
                color: GtColors.brand,
              ),
              const SizedBox(width: 6),
              Text(
                hasMultiple
                    ? 'Available Routes (${routes.length})'
                    : 'Selected Route',
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: GtColors.text,
                ),
              ),
              const Spacer(),
              if (hasMultiple)
                Text(
                  'Tap route to switch',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: GtColors.textSecondary,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: routes.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final r = routes[index];
              final isSelected = index == state.selectedRouteIndex;
              return InkWell(
                onTap: () => state.selectRouteIndex(index),
                borderRadius: BorderRadius.circular(12),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 220),
                  curve: Curves.easeOutCubic,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: isSelected
                        ? GtColors.brand.withValues(alpha: 0.08)
                        : Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: isSelected ? GtColors.brand : GtColors.border,
                      width: isSelected ? 1.8 : 1.0,
                    ),
                    boxShadow: isSelected
                        ? [
                            BoxShadow(
                              color: GtColors.brand.withValues(alpha: 0.18),
                              blurRadius: 8,
                              offset: const Offset(0, 2),
                            ),
                          ]
                        : const [
                            BoxShadow(
                              color: Color(0x0A000000),
                              blurRadius: 4,
                              offset: Offset(0, 1),
                            ),
                          ],
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(
                          color: isSelected
                              ? GtColors.brand
                              : const Color(0xFFF2F2F7),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          isSelected ? Icons.check : Icons.directions_car,
                          size: 16,
                          color: isSelected
                              ? Colors.white
                              : const Color(0xFF8E8E93),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    r.summary,
                                    style: TextStyle(
                                      fontSize: 13,
                                      fontWeight: isSelected
                                          ? FontWeight.w700
                                          : FontWeight.w600,
                                      color: GtColors.text,
                                    ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                if (r.isFastest) ...[
                                  const SizedBox(width: 6),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 6,
                                      vertical: 2,
                                    ),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF34C759)
                                          .withValues(alpha: 0.15),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: const Text(
                                      'FASTEST',
                                      style: TextStyle(
                                        fontSize: 9,
                                        fontWeight: FontWeight.w800,
                                        color: Color(0xFF248A3D),
                                        letterSpacing: 0.3,
                                      ),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                            const SizedBox(height: 3),
                            Text(
                              '${r.distanceKm} km • ~${r.durationMin} min driving',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w500,
                                color: isSelected
                                    ? GtColors.brand
                                    : GtColors.textSecondary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
