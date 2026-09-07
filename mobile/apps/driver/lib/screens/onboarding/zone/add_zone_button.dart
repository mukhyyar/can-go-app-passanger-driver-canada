import 'package:flutter/material.dart';
import 'package:gt_ui/gt_ui.dart';

/// Bottom-left "[+] Add" control matching the reference layout.
class AddZoneButton extends StatelessWidget {
  const AddZoneButton({
    super.key,
    required this.onPressed,
    this.enabled = true,
  });

  final VoidCallback onPressed;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final color = enabled ? GtColors.text : GtColors.textMuted;
    return InkWell(
      onTap: enabled ? onPressed : null,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: color, width: 1.6),
              ),
              child: Icon(Icons.add, size: 18, color: color),
            ),
            const SizedBox(height: 2),
            Text(
              'Add',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
