import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';

class RouteHero extends StatelessWidget {
  const RouteHero({
    super.key,
    required this.state,
    required this.showTo,
    required this.showSwap,
  });

  final AppState state;
  final bool showTo;
  final bool showSwap;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: GtColors.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 24,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Stack(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 48, 12),
            child: Column(
              children: [
                _PlaceRow(
                  letter: 'A',
                  brandPin: false,
                  hint: 'Where from?',
                  subHint: 'Address, airport, hotel',
                  place: state.from,
                  onTap: () {
                    state.setLocationField('from');
                    context.push('/location');
                  },
                  onClear: state.from == null ? null : () => state.setFrom(null),
                ),
                if (showTo) ...[
                  Padding(
                    padding: const EdgeInsets.only(left: 12),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Container(
                        width: 2,
                        height: 18,
                        color: GtColors.border,
                      ),
                    ),
                  ),
                  _PlaceRow(
                    letter: 'B',
                    brandPin: true,
                    hint: 'Where to?',
                    subHint: 'Drop-off',
                    place: state.to,
                    onTap: () {
                      state.setLocationField('to');
                      context.push('/location');
                    },
                    onClear: state.to == null ? null : () => state.setTo(null),
                  ),
                ],
              ],
            ),
          ),
          if (showSwap)
            Positioned(
              right: 10,
              top: 0,
              bottom: 0,
              child: Center(
                child: Material(
                  color: GtColors.bgGrey,
                  shape: const CircleBorder(
                    side: BorderSide(color: GtColors.border),
                  ),
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: state.swapRoute,
                    child: const SizedBox(
                      width: 36,
                      height: 36,
                      child: Icon(
                        Icons.swap_vert,
                        size: 20,
                        color: GtColors.textSecondary,
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _PlaceRow extends StatelessWidget {
  const _PlaceRow({
    required this.letter,
    required this.brandPin,
    required this.hint,
    required this.subHint,
    required this.place,
    required this.onTap,
    this.onClear,
  });

  final String letter;
  final bool brandPin;
  final String hint;
  final String subHint;
  final Place? place;
  final VoidCallback onTap;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    final filled = place != null;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 28,
              height: 28,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: brandPin ? GtColors.brand : GtColors.text,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                letter,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    filled ? place!.label : hint,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: filled ? FontWeight.w600 : FontWeight.w500,
                      color: filled ? GtColors.text : GtColors.textMuted,
                      height: 1.3,
                    ),
                  ),
                  if (filled) ...[
                    const SizedBox(height: 2),
                    Text(
                      subHint,
                      style: const TextStyle(
                        fontSize: 12,
                        color: GtColors.textMuted,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (onClear != null)
              IconButton(
                visualDensity: VisualDensity.compact,
                onPressed: onClear,
                icon: const Icon(
                  Icons.close,
                  size: 18,
                  color: GtColors.textMuted,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
