import 'package:flutter/material.dart';
import 'package:gt_ui/gt_ui.dart';

/// Confirm / cancel bar shown while adjusting a pickup or drop-off pin.
class RouteMapAdjustBar extends StatelessWidget {
  const RouteMapAdjustBar({
    super.key,
    required this.title,
    required this.addressLabel,
    required this.geocoding,
    required this.confirming,
    required this.onConfirm,
    required this.onCancel,
  });

  final String title;
  final String addressLabel;
  final bool geocoding;
  final bool confirming;
  final VoidCallback? onConfirm;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final confirmBusy = geocoding || confirming;
    return Material(
      color: Colors.white.withValues(alpha: 0.96),
      elevation: 2,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              title,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: GtColors.textSecondary,
              ),
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                if (geocoding) ...[
                  const SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  const SizedBox(width: 8),
                ],
                Expanded(
                  child: Text(
                    addressLabel,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: GtColors.text,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    // Cancel always available (except mid-confirm commit).
                    onPressed: confirming ? null : onCancel,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: GtColors.textSecondary,
                      side: const BorderSide(color: GtColors.border),
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 2,
                  child: FilledButton(
                    onPressed:
                        (confirmBusy || onConfirm == null) ? null : onConfirm,
                    style: FilledButton.styleFrom(
                      backgroundColor: GtColors.brand,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                    child: confirming
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text('Confirm location'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
