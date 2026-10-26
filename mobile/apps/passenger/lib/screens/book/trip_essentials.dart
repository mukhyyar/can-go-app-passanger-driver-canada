import 'package:flutter/material.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';

class TripEssentials extends StatelessWidget {
  const TripEssentials({super.key, required this.state});

  final AppState state;

  @override
  Widget build(BuildContext context) {
    final mode = state.serviceType;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _PickupRow(state: state),
        if (mode == ServiceType.perHour) ...[
          const SizedBox(height: 8),
          _RideEndsRow(state: state),
          const SizedBox(height: 8),
          _DurationPills(state: state),
          const SizedBox(height: 8),
          _ToggleRow(
            label: 'Another end location',
            value: state.perHourHasEnd,
            onChanged: state.setPerHourHasEnd,
          ),
        ],
        if (mode == ServiceType.ride || mode == ServiceType.perHour) ...[
          const SizedBox(height: 8),
          _AdultsRow(state: state),
          const SizedBox(height: 8),
          _ChildrenRow(state: state),
        ],
        if (mode == ServiceType.ride) ...[
          const SizedBox(height: 8),
          _ToggleRow(
            label: 'Add return trip',
            value: state.returnEnabled,
            onChanged: state.setReturnEnabled,
          ),
          if (state.returnEnabled) ...[
            const SizedBox(height: 8),
            _ReturnTripRow(state: state),
          ],
        ],
      ],
    );
  }
}

class _EssentialsCard extends StatelessWidget {
  const _EssentialsCard({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: GtColors.border),
      ),
      child: child,
    );
  }
}

class _ToggleRow extends StatelessWidget {
  const _ToggleRow({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return _EssentialsCard(
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 14,
              ),
            ),
          ),
          Switch.adaptive(
            value: value,
            activeTrackColor: GtColors.brand,
            onChanged: onChanged,
          ),
        ],
      ),
    );
  }
}

class _PickupRow extends StatelessWidget {
  const _PickupRow({required this.state});
  final AppState state;

  Future<void> _pickDateTime(BuildContext context) async {
    final now = DateTime.now();
    final initial = state.pickupNow
        ? now
        : (state.pickupDateTime.isBefore(now) ? now : state.pickupDateTime);
    final date = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (date == null) return;
    if (!context.mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(initial),
    );
    if (time == null) return;
    final selectedDt = DateTime(
      date.year,
      date.month,
      date.day,
      time.hour,
      time.minute,
    );
    final nowCheck = DateTime.now();
    final isPast = selectedDt.isBefore(nowCheck.subtract(const Duration(minutes: 1)));
    final effectiveDt = isPast ? nowCheck : selectedDt;
    state.setPickupDateTime(effectiveDt);
    if (isPast && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Selected pickup time was in the past; updated to current time.'),
          duration: Duration(seconds: 2),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return _EssentialsCard(
      child: Row(
        children: [
          Expanded(
            child: InkWell(
              onTap: () => _pickDateTime(context),
              child: Row(
                children: [
                  const Icon(
                    Icons.calendar_today_outlined,
                    size: 20,
                    color: GtColors.textSecondary,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          state.pickupNow
                              ? 'Pickup · Now'
                              : 'Pickup · ${state.formatPickupLabel()}',
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          state.pickupNow
                              ? 'Tap to schedule'
                              : 'Tap to change time',
                          style: const TextStyle(
                            fontSize: 12,
                            color: GtColors.textMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 10),
          GtOrangePill(
            label: 'Now',
            selected: state.pickupNow,
            onTap: state.pickupNow
                ? () => _pickDateTime(context)
                : () => state.setPickupNow(true),
          ),
        ],
      ),
    );
  }
}

class _RideEndsRow extends StatelessWidget {
  const _RideEndsRow({required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    final hasValue = state.rideEndsDateTime != null;
    return _EssentialsCard(
      child: InkWell(
        onTap: () async {
          final now = DateTime.now();
          final start = state.effectivePickupDateTime;
          final minDate = start.isBefore(now) ? now : start;
          final initial =
              state.rideEndsDateTime ?? start.add(const Duration(hours: 1));
          final date = await showDatePicker(
            context: context,
            initialDate: initial.isBefore(minDate) ? minDate : initial,
            firstDate: DateTime(minDate.year, minDate.month, minDate.day),
            lastDate: minDate.add(const Duration(days: 365)),
          );
          if (date == null || !context.mounted) return;
          final time = await showTimePicker(
            context: context,
            initialTime: TimeOfDay.fromDateTime(initial),
          );
          if (time == null || !context.mounted) return;
          var ends = DateTime(
            date.year,
            date.month,
            date.day,
            time.hour,
            time.minute,
          );
          final minEnds = start.add(const Duration(minutes: 30));
          if (ends.isBefore(minEnds) || ends.isBefore(now)) {
            ends = minEnds.isAfter(now) ? minEnds : now.add(const Duration(minutes: 30));
          }
          state.setRideEndsDateTime(ends);
        },
        child: Row(
          children: [
            const Icon(
              Icons.schedule_outlined,
              size: 20,
              color: GtColors.textSecondary,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                state.formatRideEndsLabel(),
                style: TextStyle(
                  color: hasValue ? GtColors.text : GtColors.textMuted,
                  fontWeight: hasValue ? FontWeight.w600 : FontWeight.w500,
                  fontSize: 14,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DurationPills extends StatelessWidget {
  const _DurationPills({required this.state});
  final AppState state;

  static const options = <(int, String)>[
    (30, 'for 30 min'),
    (60, 'for 1 hour'),
    (120, 'for 2 hours'),
    (180, 'for 3 hours'),
  ];

  static const _selectedFill = GtColors.brand;
  static const _idleFill = Color(0xFFE0E0E0);

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (var i = 0; i < options.length; i++) ...[
            if (i > 0) const SizedBox(width: 8),
            Builder(
              builder: (_) {
                final (minutes, label) = options[i];
                final selected = state.perHourDurationMinutes == minutes;
                return GestureDetector(
                  onTap: () => state.setPerHourDurationMinutes(minutes),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 160),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: selected ? _selectedFill : _idleFill,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      label,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: selected ? GtColors.white : GtColors.text,
                      ),
                    ),
                  ),
                );
              },
            ),
          ],
        ],
      ),
    );
  }
}

class _AdultsRow extends StatelessWidget {
  const _AdultsRow({required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    return _EssentialsCard(
      child: Row(
        children: [
          const Icon(
            Icons.person_outline,
            size: 22,
            color: GtColors.textSecondary,
          ),
          const SizedBox(width: 10),
          const Expanded(
            child: Text(
              'Adults',
              style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
            ),
          ),
          GtStepper(
            value: state.adults,
            onChanged: state.setAdults,
            min: 1,
            max: 20,
          ),
        ],
      ),
    );
  }
}

class _ChildrenRow extends StatelessWidget {
  const _ChildrenRow({required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    return _EssentialsCard(
      child: Row(
        children: [
          const Icon(
            Icons.child_care,
            size: 22,
            color: GtColors.textSecondary,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              state.childSeats.summaryLabel,
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
            ),
          ),
          TextButton(
            onPressed: () => _openChildrenSheet(context, state),
            child: const Text(
              'Edit',
              style: TextStyle(color: GtColors.brand, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _openChildrenSheet(BuildContext context, AppState state) async {
    var seats = state.childSeats;
    await showGtSheet(
      context: context,
      child: StatefulBuilder(
        builder: (context, setModal) {
          return Padding(
            padding: EdgeInsets.fromLTRB(
              16,
              16,
              16,
              16 + MediaQuery.of(context).viewInsets.bottom,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Child seats',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 16),
                _seatRow(
                  'Infant carrier',
                  'Up to 10 kg, 6 months',
                  seats.infant,
                  (v) => setModal(() => seats = seats.copyWith(infant: v)),
                ),
                _seatRow(
                  'Convertible seat',
                  '9–25 kg, 0–7 years',
                  seats.convertible,
                  (v) => setModal(() => seats = seats.copyWith(convertible: v)),
                ),
                _seatRow(
                  'Booster seat',
                  '22–36 kg, 6–12 years',
                  seats.booster,
                  (v) => setModal(() => seats = seats.copyWith(booster: v)),
                ),
                const SizedBox(height: 16),
                GtGreenButton(
                  label: 'Done',
                  onPressed: () {
                    state.setChildSeats(seats);
                    Navigator.pop(context);
                  },
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _seatRow(
    String label,
    String subtitle,
    int value,
    ValueChanged<int> onChanged,
  ) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: const TextStyle(fontSize: 12, color: GtColors.textMuted),
                ),
              ],
            ),
          ),
          GtStepper(value: value, min: 0, max: 5, onChanged: onChanged),
        ],
      ),
    );
  }
}

class _ReturnTripRow extends StatelessWidget {
  const _ReturnTripRow({required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    return _EssentialsCard(
      child: InkWell(
        onTap: () async {
          final now = DateTime.now();
          final start = state.effectivePickupDateTime;
          final minReturnDate = start.isBefore(now) ? now : start;
          final initial =
              state.returnDateTime ?? start.add(const Duration(hours: 3));
          final date = await showDatePicker(
            context: context,
            initialDate: initial.isBefore(minReturnDate) ? minReturnDate : initial,
            firstDate: DateTime(minReturnDate.year, minReturnDate.month, minReturnDate.day),
            lastDate: minReturnDate.add(const Duration(days: 365)),
          );
          if (date == null || !context.mounted) return;
          final time = await showTimePicker(
            context: context,
            initialTime: TimeOfDay.fromDateTime(initial),
          );
          if (time == null || !context.mounted) return;
          var returnDt = DateTime(
            date.year,
            date.month,
            date.day,
            time.hour,
            time.minute,
          );
          final minAllowed = start.add(state.minimumReturnBuffer);
          final isConflicting = returnDt.isBefore(minAllowed) || returnDt.isBefore(now);
          if (isConflicting) {
            returnDt = minAllowed.isAfter(now) ? minAllowed : now.add(const Duration(minutes: 30));
            if (context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Return time adjusted to follow pickup arrival time.'),
                  duration: Duration(seconds: 2),
                ),
              );
            }
          }
          state.setReturnDateTime(returnDt);
        },
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: const Color(0xFFFFF3CD),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFFE6B800), width: 0.8),
              ),
              child: const Icon(
                Icons.swap_vert_rounded,
                color: Color(0xFF8A6900),
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Return · ${state.formatReturnLabel()}',
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 13.5,
                      color: Color(0xFF6B5000),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Return to: ${state.from?.label ?? 'pickup location'}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: GtColors.textSecondary,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const Icon(
              Icons.calendar_month_outlined,
              size: 20,
              color: Color(0xFF8A6900),
            ),
          ],
        ),
      ),
    );
  }
}
