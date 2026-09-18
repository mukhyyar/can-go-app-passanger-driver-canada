import 'package:flutter/material.dart';
import 'theme.dart';
import 'google_route_map_impl.dart'
    if (dart.library.html) 'google_route_map_web.dart' as map_impl;

/// Structured route option representing a driving directions alternative.
class GtRouteOption {
  const GtRouteOption({
    required this.id,
    required this.summary,
    required this.distanceKm,
    required this.durationMin,
    this.points = const [],
    this.isFastest = false,
  });

  final String id;
  final String summary;
  final double distanceKm;
  final int durationMin;
  final List<dynamic> points;
  final bool isFastest;
}

/// Google Maps directions preview (A → B) with optional distance badge.
class GtGoogleRouteMap extends StatelessWidget {
  const GtGoogleRouteMap({
    super.key,
    required this.fromLat,
    required this.fromLng,
    required this.fromLabel,
    this.toLat,
    this.toLng,
    this.toLabel,
    this.distanceLabel,
    this.height = 220,
    this.onRouteSelected,
    this.onRoutesLoaded,
    this.enableRouteSelection = true,
    this.initialRouteIndex = 0,
  });

  final double fromLat;
  final double fromLng;
  final String fromLabel;
  final double? toLat;
  final double? toLng;
  final String? toLabel;
  final String? distanceLabel;
  final double height;
  final ValueChanged<GtRouteOption>? onRouteSelected;
  final ValueChanged<List<GtRouteOption>>? onRoutesLoaded;
  final bool enableRouteSelection;
  final int initialRouteIndex;

  bool get _hasRoute =>
      toLat != null && toLng != null && toLabel != null && toLabel!.isNotEmpty;

  @override
  Widget build(BuildContext context) {
    // Do not wrap GoogleMap in ClipRRect — it blanks the Android platform view.
    return SizedBox(
      height: height,
      width: double.infinity,
      child: Stack(
        fit: StackFit.expand,
        children: [
          map_impl.buildGoogleMapEmbed(
            fromLat: fromLat,
            fromLng: fromLng,
            toLat: _hasRoute ? toLat : null,
            toLng: _hasRoute ? toLng : null,
            onRouteSelected: onRouteSelected,
            onRoutesLoaded: onRoutesLoaded,
            enableRouteSelection: enableRouteSelection,
            initialRouteIndex: initialRouteIndex,
          ),
          Positioned(
            left: 10,
            top: 10,
            child: _Chip(
              icon: Icons.place,
              label: _hasRoute ? 'A → B route' : 'A · Pickup',
            ),
          ),
          if (distanceLabel != null)
            Positioned(
              right: 10,
              top: 10,
              child: _Chip(
                icon: Icons.straighten,
                label: distanceLabel!,
                emphasize: true,
              ),
            ),
          Positioned(
            left: 10,
            right: 10,
            bottom: 10,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.94),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: GtColors.border),
              ),
              child: Text(
                _hasRoute
                    ? '${_short(fromLabel)}  →  ${_short(toLabel!)}'
                    : fromLabel,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: GtColors.text,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  static String _short(String s) =>
      s.length > 36 ? '${s.substring(0, 36)}…' : s;
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.icon,
    required this.label,
    this.emphasize = false,
  });

  final IconData icon;
  final String label;
  final bool emphasize;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: emphasize ? GtColors.brand : Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [
          BoxShadow(
            color: Color(0x22000000),
            blurRadius: 6,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 14,
            color: emphasize ? Colors.white : GtColors.brand,
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w800,
              color: emphasize ? Colors.white : GtColors.text,
            ),
          ),
        ],
      ),
    );
  }
}
