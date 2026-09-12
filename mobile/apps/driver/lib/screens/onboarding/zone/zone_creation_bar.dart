import 'package:flutter/material.dart';
import 'package:gt_ui/gt_ui.dart';

enum ZoneCreationTool { circle, draw }

/// Bottom creation toolbar: X | Circle | Draw | ✓
/// Optional radius slider shown above when [tool] == circle.
class ZoneCreationBar extends StatelessWidget {
  const ZoneCreationBar({
    super.key,
    required this.tool,
    required this.radiusKm,
    this.draftPolygonCount = 0,
    required this.canConfirm,
    required this.onCancel,
    required this.onSelectTool,
    required this.onRadiusChanged,
    required this.onConfirm,
    this.bottomInset = 0,
  });

  final ZoneCreationTool tool;
  final double radiusKm;
  final int draftPolygonCount;
  final bool canConfirm;
  final VoidCallback onCancel;
  final ValueChanged<ZoneCreationTool> onSelectTool;
  final ValueChanged<double> onRadiusChanged;
  final VoidCallback onConfirm;
  final double bottomInset;

  static const minKm = 5.0;
  static const maxKm = 200.0;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: Colors.white,
      padding: EdgeInsets.fromLTRB(8, 8, 8, 10 + bottomInset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (tool == ZoneCreationTool.circle) ...[
            Text(
              '${radiusKm.round()} km',
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: GtColors.text,
              ),
            ),
            const Icon(Icons.arrow_drop_down, size: 20, color: GtColors.textMuted),
            SliderTheme(
              data: SliderTheme.of(context).copyWith(
                activeTrackColor: GtColors.brand,
                inactiveTrackColor: GtColors.border,
                thumbColor: GtColors.brand,
                overlayColor: GtColors.brand.withValues(alpha: 0.12),
                trackHeight: 3,
                thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 10),
              ),
              child: Slider(
                value: radiusKm.clamp(minKm, maxKm),
                min: minKm,
                max: maxKm,
                divisions: (maxKm - minKm).round(),
                onChanged: onRadiusChanged,
              ),
            ),
            const SizedBox(height: 4),
          ] else ...[
            // Draw tool — never show radius UI.
            Text(
              draftPolygonCount > 0
                  ? '$draftPolygonCount area${draftPolygonCount == 1 ? '' : 's'} ready — tap ✓ to add'
                  : 'Draw freehand on the map (no radius)',
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: GtColors.text,
              ),
            ),
            const SizedBox(height: 8),
          ],
          Row(
            children: [
              _ToolIconButton(
                icon: Icons.close,
                selected: false,
                tooltip: 'Cancel',
                onTap: onCancel,
              ),
              Expanded(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _ToolLabeled(
                      icon: Icons.circle_outlined,
                      label: 'Circle',
                      selected: tool == ZoneCreationTool.circle,
                      onTap: () => onSelectTool(ZoneCreationTool.circle),
                    ),
                    const SizedBox(width: 28),
                    _ToolLabeled(
                      icon: Icons.gesture,
                      label: 'Draw',
                      selected: tool == ZoneCreationTool.draw,
                      onTap: () => onSelectTool(ZoneCreationTool.draw),
                    ),
                  ],
                ),
              ),
              _ToolIconButton(
                icon: Icons.check,
                selected: true,
                filled: true,
                enabled: canConfirm,
                tooltip: 'Confirm',
                onTap: canConfirm ? onConfirm : null,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ToolIconButton extends StatelessWidget {
  const _ToolIconButton({
    required this.icon,
    required this.selected,
    required this.onTap,
    this.tooltip,
    this.filled = false,
    this.enabled = true,
  });

  final IconData icon;
  final bool selected;
  final VoidCallback? onTap;
  final String? tooltip;
  final bool filled;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final bg = !enabled
        ? GtColors.border
        : filled
            ? GtColors.brand
            : Colors.transparent;
    final fg = !enabled
        ? GtColors.textMuted
        : filled
            ? Colors.white
            : GtColors.text;

    final child = Material(
      color: bg,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: enabled ? onTap : null,
        child: SizedBox(
          width: 48,
          height: 48,
          child: Icon(icon, color: fg, size: 26),
        ),
      ),
    );
    return tooltip == null ? child : Tooltip(message: tooltip!, child: child);
  }
}

class _ToolLabeled extends StatelessWidget {
  const _ToolLabeled({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? GtColors.brand : GtColors.text;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 28, color: color),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
