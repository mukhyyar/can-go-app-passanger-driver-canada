import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'theme.dart';
import 'widgets.dart';
import 'google_route_map_impl.dart'
    if (dart.library.html) 'google_route_map_web.dart' as map_impl;

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
  });

  final double fromLat;
  final double fromLng;
  final String fromLabel;
  final double? toLat;
  final double? toLng;
  final String? toLabel;
  final String? distanceLabel;
  final double height;

  bool get _hasRoute =>
      toLat != null && toLng != null && toLabel != null && toLabel!.isNotEmpty;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(
        height: height,
        width: double.infinity,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (kIsWeb)
              map_impl.buildGoogleMapEmbed(
                fromLat: fromLat,
                fromLng: fromLng,
                toLat: _hasRoute ? toLat : null,
                toLng: _hasRoute ? toLng : null,
              )
            else
              _FallbackMap(hasRoute: _hasRoute),
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
          BoxShadow(color: Color(0x22000000), blurRadius: 6, offset: Offset(0, 2)),
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

class _FallbackMap extends StatelessWidget {
  const _FallbackMap({required this.hasRoute});
  final bool hasRoute;

  @override
  Widget build(BuildContext context) {
    return GtMockMap(
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.map, color: GtColors.brand, size: 40),
            const SizedBox(height: 8),
            Text(
              hasRoute ? 'Route A → B' : 'Pickup map',
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                color: GtColors.text,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
