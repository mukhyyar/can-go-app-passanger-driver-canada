import 'package:flutter/material.dart';
import 'package:gt_ui/gt_ui.dart';

/// Compact map controls for the booking route strip.
class RouteMapControls extends StatelessWidget {
  const RouteMapControls({
    super.key,
    required this.onRecenter,
    required this.onZoomIn,
    required this.onZoomOut,
    required this.onAdjustPickup,
    required this.onAdjustDropoff,
    this.showAdjustDropoff = true,
    this.enabled = true,
  });

  final VoidCallback onRecenter;
  final VoidCallback onZoomIn;
  final VoidCallback onZoomOut;
  final VoidCallback onAdjustPickup;
  final VoidCallback onAdjustDropoff;
  final bool showAdjustDropoff;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _CtrlBtn(
          icon: Icons.center_focus_strong_rounded,
          tooltip: 'Recenter route',
          onTap: enabled ? onRecenter : null,
        ),
        const SizedBox(height: 6),
        _CtrlBtn(
          icon: Icons.add_rounded,
          tooltip: 'Zoom in',
          onTap: enabled ? onZoomIn : null,
        ),
        const SizedBox(height: 6),
        _CtrlBtn(
          icon: Icons.remove_rounded,
          tooltip: 'Zoom out',
          onTap: enabled ? onZoomOut : null,
        ),
        const SizedBox(height: 6),
        _CtrlBtn(
          icon: Icons.trip_origin_rounded,
          tooltip: 'Adjust pickup',
          onTap: enabled ? onAdjustPickup : null,
        ),
        if (showAdjustDropoff) ...[
          const SizedBox(height: 6),
          _CtrlBtn(
            icon: Icons.flag_rounded,
            tooltip: 'Adjust drop-off',
            onTap: enabled ? onAdjustDropoff : null,
          ),
        ],
      ],
    );
  }
}

class _CtrlBtn extends StatelessWidget {
  const _CtrlBtn({
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final active = onTap != null;
    return Material(
      color: Colors.transparent,
      child: Tooltip(
        message: tooltip,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: active ? 0.96 : 0.7),
              shape: BoxShape.circle,
              border: Border.all(color: const Color(0x18000000)),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x22000000),
                  blurRadius: 5,
                  offset: Offset(0, 2),
                ),
              ],
            ),
            child: Icon(
              icon,
              size: 17,
              color: active ? GtColors.text : GtColors.textMuted,
            ),
          ),
        ),
      ),
    );
  }
}
