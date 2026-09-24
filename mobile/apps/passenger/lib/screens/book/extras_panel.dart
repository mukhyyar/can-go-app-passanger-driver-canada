import 'package:flutter/material.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/screens/book/bound_field.dart';
import 'package:passenger/state/app_state.dart';

class ExtrasPanel extends StatefulWidget {
  const ExtrasPanel({super.key, required this.state});

  final AppState state;

  @override
  State<ExtrasPanel> createState() => _ExtrasPanelState();
}

class _ExtrasPanelState extends State<ExtrasPanel>
    with SingleTickerProviderStateMixin {
  bool _open = false;

  AppState get state => widget.state;

  @override
  Widget build(BuildContext context) {
    final mode = state.serviceType;
    final showFlightSignage =
        mode == ServiceType.ride || mode == ServiceType.perHour;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: GtColors.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          InkWell(
            onTap: () => setState(() => _open = !_open),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Row(
                children: [
                  const Expanded(
                    child: Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text: 'Extras ',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: GtColors.text,
                            ),
                          ),
                          TextSpan(
                            text: 'optional',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                              color: GtColors.textMuted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  AnimatedRotation(
                    turns: _open ? 0.5 : 0,
                    duration: const Duration(milliseconds: 200),
                    child: const Icon(
                      Icons.keyboard_arrow_down,
                      color: GtColors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
          ),
          AnimatedCrossFade(
            firstChild: const SizedBox(width: double.infinity),
            secondChild: Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
              child: Column(
                children: [
                  const Divider(height: 1, color: GtColors.border),
                  const SizedBox(height: 12),
                  if (showFlightSignage) ...[
                    _ExtraField(
                      icon: Icons.flight,
                      child: BoundField(
                        fieldKey: const ValueKey('flight'),
                        initial: state.flight,
                        hint: 'Arrival flight number',
                        onChanged: state.setFlight,
                      ),
                    ),
                    const SizedBox(height: 8),
                    _ExtraField(
                      icon: Icons.badge_outlined,
                      child: BoundField(
                        fieldKey: const ValueKey('signage'),
                        initial: state.signage,
                        hint: "Name on a sign the driver'll hold",
                        onChanged: state.setSignage,
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                  if (mode == ServiceType.ride && state.returnEnabled) ...[
                    _ReturnDateField(state: state),
                    const SizedBox(height: 8),
                    _ExtraField(
                      icon: Icons.flight,
                      child: BoundField(
                        fieldKey: const ValueKey('returnFlight'),
                        initial: state.returnFlight,
                        hint: 'Return arrival flight number',
                        onChanged: state.setReturnFlight,
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                  _ExtraField(
                    icon: Icons.chat_bubble_outline,
                    child: BoundField(
                      fieldKey: const ValueKey('comment'),
                      initial: state.comment,
                      hint:
                          'Comment: Luggage, special needs or tasks for the driver',
                      maxLines: 3,
                      onChanged: state.setComment,
                    ),
                  ),
                  if (mode == ServiceType.perHour) ...[
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        ActionChip(
                          label: const Text(
                            'My route has several stops',
                            style: TextStyle(fontSize: 12),
                          ),
                          onPressed: () => state
                              .appendCommentChip('My route has several stops'),
                          backgroundColor: GtColors.bgGrey,
                          side: BorderSide.none,
                        ),
                      ],
                    ),
                  ] else if (mode != ServiceType.delivery) ...[
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final c in const [
                          'I need Wi-Fi',
                          'I need an English-speaking driver',
                        ])
                          ActionChip(
                            label: Text(c, style: const TextStyle(fontSize: 12)),
                            onPressed: () => state.appendCommentChip(c),
                            backgroundColor: GtColors.bgGrey,
                            side: BorderSide.none,
                          ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'I have a promo code',
                          style: TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                        ),
                      ),
                      Switch.adaptive(
                        value: state.promoEnabled,
                        activeTrackColor: GtColors.brand,
                        onChanged: state.setPromoEnabled,
                      ),
                    ],
                  ),
                  if (state.promoEnabled) ...[
                    const SizedBox(height: 4),
                    _ExtraField(
                      icon: Icons.local_offer_outlined,
                      child: BoundField(
                        fieldKey: const ValueKey('promo'),
                        initial: state.promoCode,
                        hint: 'Enter promo code',
                        onChanged: state.setPromoCode,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            crossFadeState:
                _open ? CrossFadeState.showSecond : CrossFadeState.showFirst,
            duration: const Duration(milliseconds: 220),
            sizeCurve: Curves.easeOutCubic,
          ),
        ],
      ),
    );
  }
}

class _ExtraField extends StatelessWidget {
  const _ExtraField({required this.icon, required this.child});

  final IconData icon;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: GtColors.bgGrey,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Icon(icon, size: 20, color: GtColors.textSecondary),
          ),
          const SizedBox(width: 10),
          Expanded(child: child),
        ],
      ),
    );
  }
}

class _ReturnDateField extends StatelessWidget {
  const _ReturnDateField({required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () async {
        final now = DateTime.now();
        final start = state.effectivePickupDateTime;
        final initial =
            state.returnDateTime ?? start.add(const Duration(hours: 3));
        final date = await showDatePicker(
          context: context,
          initialDate: initial.isBefore(now) ? now : initial,
          firstDate: DateTime(now.year, now.month, now.day),
          lastDate: now.add(const Duration(days: 365)),
        );
        if (date == null || !context.mounted) return;
        final time = await showTimePicker(
          context: context,
          initialTime: TimeOfDay.fromDateTime(initial),
        );
        if (time == null) return;
        var returnDt = DateTime(
          date.year,
          date.month,
          date.day,
          time.hour,
          time.minute,
        );
        if (!returnDt.isAfter(start)) {
          returnDt = start.add(const Duration(hours: 2));
        }
        state.setReturnDateTime(returnDt);
      },
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: GtColors.bgGrey,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: [
            const Icon(
              Icons.calendar_today_outlined,
              size: 20,
              color: GtColors.textSecondary,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                state.returnDateTime == null
                    ? 'Return ride date & time'
                    : 'Return: ${state.formatReturnLabel()}',
                style: TextStyle(
                  color: state.returnDateTime == null
                      ? GtColors.textMuted
                      : GtColors.text,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
