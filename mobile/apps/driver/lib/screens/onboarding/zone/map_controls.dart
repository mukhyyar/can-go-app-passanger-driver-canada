import 'package:flutter/material.dart';
import 'package:gt_ui/gt_ui.dart';

/// Floating circular zoom / recenter controls (right side of map).
class MapControls extends StatelessWidget {
  const MapControls({
    super.key,
    required this.onZoomIn,
    required this.onZoomOut,
    required this.onRecenter,
  });

  final VoidCallback onZoomIn;
  final VoidCallback onZoomOut;
  final VoidCallback onRecenter;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _MapFab(icon: Icons.add, onTap: onZoomIn, tooltip: 'Zoom in'),
        const SizedBox(height: 10),
        _MapFab(icon: Icons.remove, onTap: onZoomOut, tooltip: 'Zoom out'),
        const SizedBox(height: 10),
        _MapFab(
          icon: Icons.my_location,
          onTap: onRecenter,
          tooltip: 'Recenter',
        ),
      ],
    );
  }
}

class _MapFab extends StatelessWidget {
  const _MapFab({
    required this.icon,
    required this.onTap,
    required this.tooltip,
  });

  final IconData icon;
  final VoidCallback onTap;
  final String tooltip;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      elevation: 3,
      shadowColor: Colors.black26,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Tooltip(
          message: tooltip,
          child: SizedBox(
            width: 42,
            height: 42,
            child: Icon(icon, size: 20, color: GtColors.text),
          ),
        ),
      ),
    );
  }
}
