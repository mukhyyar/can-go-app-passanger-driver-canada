import 'package:flutter/material.dart';
import 'google_route_map_impl.dart'
    if (dart.library.html) 'google_route_map_web.dart' as map_impl;
import 'theme.dart';

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

/// Controller for interacting with [GtGoogleRouteMap] programmatically.
class GtRouteMapController {
  VoidCallback? _onRecenter;
  void attachRecenter(VoidCallback? callback) => _onRecenter = callback;
  void recenter() => _onRecenter?.call();
}

/// Google Maps directions preview (A → B) with interactive expansion.
class GtGoogleRouteMap extends StatefulWidget {
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
    this.expandedHeight = 390,
    this.onRouteSelected,
    this.onRoutesLoaded,
    this.enableRouteSelection = true,
    this.initialRouteIndex = 0,
    this.canExpand = true,
    this.isExpanded,
    this.onExpandChanged,
    this.onTap,
    this.interactive,
    this.showAddressFooter = false,
  });

  final double fromLat;
  final double fromLng;
  final String fromLabel;
  final double? toLat;
  final double? toLng;
  final String? toLabel;
  final String? distanceLabel;
  final double height;
  final double expandedHeight;
  final ValueChanged<GtRouteOption>? onRouteSelected;
  final ValueChanged<List<GtRouteOption>>? onRoutesLoaded;
  final bool enableRouteSelection;
  final int initialRouteIndex;
  final bool canExpand;
  final bool? isExpanded;
  final ValueChanged<bool>? onExpandChanged;
  final VoidCallback? onTap;
  final bool? interactive;
  final bool showAddressFooter;

  @override
  State<GtGoogleRouteMap> createState() => _GtGoogleRouteMapState();
}

class _GtGoogleRouteMapState extends State<GtGoogleRouteMap> {
  bool _internalExpanded = false;
  late final GtRouteMapController _mapController;

  bool get _hasRoute =>
      widget.toLat != null &&
      widget.toLng != null &&
      widget.toLabel != null &&
      widget.toLabel!.isNotEmpty;

  bool get _isExpanded => widget.isExpanded ?? _internalExpanded;

  @override
  void initState() {
    super.initState();
    _mapController = GtRouteMapController();
  }

  @override
  void didUpdateWidget(covariant GtGoogleRouteMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if ((widget.toLat == null || widget.toLng == null) && _internalExpanded) {
      _internalExpanded = false;
    }
  }

  void _setExpanded(bool expanded) {
    if (_isExpanded == expanded) return;
    setState(() {
      _internalExpanded = expanded;
    });
    widget.onExpandChanged?.call(expanded);
  }

  @override
  Widget build(BuildContext context) {
    final canExpand = widget.canExpand && _hasRoute;
    final isExpanded = canExpand && _isExpanded;
    final currentHeight = isExpanded ? widget.expandedHeight : widget.height;
    final isInteractive = widget.interactive ?? isExpanded;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeInOutCubic,
      height: currentHeight,
      width: double.infinity,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [
          BoxShadow(
            color: Color(0x18000000),
            blurRadius: 8,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Stack(
          fit: StackFit.expand,
          children: [
            // 1. Live Google Map
            map_impl.buildGoogleMapEmbed(
              fromLat: widget.fromLat,
              fromLng: widget.fromLng,
              toLat: _hasRoute ? widget.toLat : null,
              toLng: _hasRoute ? widget.toLng : null,
              onRouteSelected: widget.onRouteSelected,
              onRoutesLoaded: widget.onRoutesLoaded,
              enableRouteSelection: widget.enableRouteSelection,
              initialRouteIndex: widget.initialRouteIndex,
              interactive: isInteractive,
              isExpanded: isExpanded,
              controller: _mapController,
              onTap: () {
                if (canExpand && !isExpanded) {
                  _setExpanded(true);
                }
                widget.onTap?.call();
              },
            ),

            // 2. Top-Left: Route & Interactive Badges
            Positioned(
              left: 10,
              top: 10,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _Chip(
                    icon: Icons.place,
                    label: _hasRoute ? 'A → B route' : 'A · Pickup',
                  ),
                  if (isExpanded) ...[
                    const SizedBox(width: 6),
                    const _Chip(
                      icon: Icons.touch_app_rounded,
                      label: 'Interactive',
                      accentColor: Color(0xFF34C759),
                    ),
                  ],
                ],
              ),
            ),

            // 3. Top-Right: Distance Badge, Recenter, Expand/Collapse Toggle
            Positioned(
              right: 10,
              top: 10,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (widget.distanceLabel != null)
                    _Chip(
                      icon: Icons.straighten,
                      label: widget.distanceLabel!,
                      emphasize: true,
                    ),
                  if (isExpanded) ...[
                    const SizedBox(width: 6),
                    _MapIconButton(
                      icon: Icons.center_focus_strong_rounded,
                      tooltip: 'Recenter route',
                      onTap: () => _mapController.recenter(),
                    ),
                  ],
                  if (canExpand) ...[
                    const SizedBox(width: 6),
                    _MapIconButton(
                      icon: isExpanded
                          ? Icons.close_fullscreen_rounded
                          : Icons.open_in_full_rounded,
                      tooltip: isExpanded ? 'Collapse map' : 'Expand map',
                      onTap: () => _setExpanded(!isExpanded),
                    ),
                  ],
                ],
              ),
            ),

            // 4. Subtle Floating Hint Pill when Collapsed
            if (canExpand && !isExpanded)
              Positioned(
                left: 16,
                right: 16,
                bottom: 12,
                child: Center(
                  child: IgnorePointer(
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.72),
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: const [
                          BoxShadow(
                            color: Color(0x33000000),
                            blurRadius: 6,
                            offset: Offset(0, 2),
                          ),
                        ],
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.touch_app_rounded,
                            size: 14,
                            color: Colors.white,
                          ),
                          SizedBox(width: 6),
                          Text(
                            'Tap map to expand & explore',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                              letterSpacing: 0.2,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),

            // 5. Full-surface Tap Detector when Collapsed
            if (canExpand && !isExpanded)
              Positioned.fill(
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    onTap: () {
                      _setExpanded(true);
                      widget.onTap?.call();
                    },
                    splashColor: GtColors.brand.withValues(alpha: 0.12),
                    highlightColor: Colors.transparent,
                  ),
                ),
              ),

            // 6. Optional Address Footer (shown when no route or explicitly enabled)
            if (!_hasRoute || widget.showAddressFooter)
              Positioned(
                left: 10,
                right: 10,
                bottom: 10,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.94),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: GtColors.border),
                  ),
                  child: Text(
                    _hasRoute
                        ? '${_short(widget.fromLabel)}  →  ${_short(widget.toLabel!)}'
                        : widget.fromLabel,
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

class _MapIconButton extends StatelessWidget {
  const _MapIconButton({
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: Tooltip(
        message: tooltip,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(20),
          child: Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
              boxShadow: const [
                BoxShadow(
                  color: Color(0x28000000),
                  blurRadius: 6,
                  offset: Offset(0, 2),
                ),
              ],
              border: Border.all(
                color: const Color(0x18000000),
                width: 0.8,
              ),
            ),
            child: Icon(
              icon,
              size: 16,
              color: GtColors.text,
            ),
          ),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.icon,
    required this.label,
    this.emphasize = false,
    this.accentColor,
  });

  final IconData icon;
  final String label;
  final bool emphasize;
  final Color? accentColor;

  @override
  Widget build(BuildContext context) {
    final bgColor = emphasize
        ? GtColors.brand
        : (accentColor != null
            ? accentColor!.withValues(alpha: 0.12)
            : Colors.white);
    final fgColor = emphasize
        ? Colors.white
        : (accentColor ?? GtColors.text);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(20),
        border: accentColor != null
            ? Border.all(color: accentColor!.withValues(alpha: 0.4), width: 1)
            : null,
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
            color: emphasize ? Colors.white : (accentColor ?? GtColors.brand),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w800,
              color: fgColor,
            ),
          ),
        ],
      ),
    );
  }
}
