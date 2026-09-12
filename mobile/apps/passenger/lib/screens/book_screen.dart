import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/screens/shell.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

class BookScreen extends StatelessWidget {
  const BookScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();

    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      body: SafeArea(
        child: Stack(
          children: [
            ListView(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 120),
              children: [
                const _BookHeader(),
                const SizedBox(height: 12),
                _ServiceChips(state: state),
                const SizedBox(height: 12),
                if (state.serviceType == ServiceType.ride) ...[
                  _RouteCard(state: state, showTo: true, showSwap: true),
                  const SizedBox(height: 12),
                  _VehicleClassRow(
                    state: state,
                    showFromPrice: state.from != null && state.to != null,
                  ),
                  const SizedBox(height: 12),
                  _PickupRow(state: state),
                  _FlightRow(state: state),
                  _SignageRow(state: state),
                  _ReturnToggle(state: state),
                  if (state.returnEnabled) ...[
                    _ReturnDateRow(state: state),
                    _ReturnFlightRow(state: state),
                  ],
                  _AdultsRow(state: state),
                  _ChildrenRow(state: state),
                  _CommentBlock(state: state),
                  _PromoToggle(state: state),
                  const SizedBox(height: 8),
                  _RouteMapSection(state: state),
                  _TermsToggle(state: state),
                ] else if (state.serviceType == ServiceType.perHour) ...[
                  _RouteCard(
                    state: state,
                    showTo: state.perHourHasEnd,
                    showSwap: false,
                  ),
                  SwitchListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                    title: const Text('Another end location'),
                    value: state.perHourHasEnd,
                    onChanged: state.setPerHourHasEnd,
                  ),
                  const SizedBox(height: 4),
                  _VehicleClassRow(state: state, showFromPrice: true),
                  const SizedBox(height: 12),
                  _PickupRow(
                    state: state,
                  ),
                  _RideEndsRow(state: state),
                  const SizedBox(height: 8),
                  _DurationPills(state: state),
                  const SizedBox(height: 12),
                  _FlightRow(state: state),
                  _SignageRow(state: state),
                  _AdultsRow(state: state),
                  _ChildrenRow(state: state),
                  _CommentBlock(
                    state: state,
                    chips: const ['My route has several stops'],
                  ),
                  _PromoToggle(state: state),
                  const SizedBox(height: 8),
                  _RouteMapSection(state: state),
                  _TermsToggle(state: state),
                ] else ...[
                  _RouteCard(state: state, showTo: true, showSwap: true),
                  const SizedBox(height: 12),
                  _PickupRow(state: state),
                  _CommentBlock(state: state),
                  _PromoToggle(state: state),
                  const SizedBox(height: 8),
                  _RouteMapSection(state: state),
                  _TermsToggle(state: state),
                ],
              ],
            ),
            Positioned(
              left: 24,
              right: 24,
              bottom: 16,
              child: GtGreenButton(
                label: 'Get offers',
                onPressed: () async {
                  if (state.from == null) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Please select a pickup location')),
                    );
                    return;
                  }
                  if (state.serviceType == ServiceType.ride ||
                      state.serviceType == ServiceType.delivery) {
                    if (state.to == null) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Please select a destination')),
                      );
                      return;
                    }
                  }
                  if (!state.termsAccepted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Please accept the terms of service'),
                      ),
                    );
                    return;
                  }
                  if (!state.isAuthenticated) {
                    if (!context.mounted) return;
                    context.push('/auth');
                    return;
                  }
                  try {
                    final req = await state.createBookingRequestAsync();
                    if (!context.mounted) return;
                    context.push('/waiting/${req.id}');
                  } catch (e) {
                    if (!context.mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Booking failed: $e')),
                    );
                  }
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BookHeader extends StatelessWidget {
  const _BookHeader();

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(0, 8, 0, 0),
      padding: const EdgeInsets.fromLTRB(6, 8, 8, 10),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFFFFFFFF),
            Color(0xFFFFF8F8),
            Color(0xFFF8EAEA),
          ],
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: GtColors.border),
        boxShadow: [
          BoxShadow(
            color: GtColors.brand.withValues(alpha: 0.06),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        children: [
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () => openPassengerMenu(context),
              borderRadius: BorderRadius.circular(12),
              child: Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: GtColors.border),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.04),
                      blurRadius: 8,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: const Icon(Icons.menu_rounded, color: GtColors.text),
              ),
            ),
          ),
          const SizedBox(width: 10),
          const CanGoLogo(size: 44),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'CAN-GO',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.4,
                    color: GtColors.text,
                    height: 1.1,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Book your next transfer',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: GtColors.textSecondary.withValues(alpha: 0.95),
                  ),
                ),
              ],
            ),
          ),
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () {
                final app = context.read<AppState>();
                if (app.isAuthenticated) {
                  openPassengerMenu(context);
                } else {
                  context.push('/auth');
                }
              },
              borderRadius: BorderRadius.circular(22),
              child: Container(
                width: 40,
                height: 40,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: GtColors.soft,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: GtColors.brand.withValues(alpha: 0.18),
                  ),
                ),
                child: const Icon(
                  Icons.person_outline_rounded,
                  color: GtColors.brand,
                  size: 22,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ServiceChips extends StatelessWidget {
  const _ServiceChips({required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    final items = <(ServiceType, String, IconData)>[
      (ServiceType.ride, 'RIDE', Icons.alt_route),
      (ServiceType.perHour, 'PER HOUR', Icons.access_time),
      (ServiceType.delivery, 'DELIVERY', Icons.inventory_2_outlined),
    ];
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final (type, label, icon) = items[i];
          final selected = state.serviceType == type;
          return InkWell(
            onTap: () => state.setServiceType(type),
            borderRadius: BorderRadius.circular(8),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: selected ? GtColors.orange : GtColors.border,
                  width: selected ? 1.5 : 1,
                ),
              ),
              child: Row(
                children: [
                  Icon(icon, size: 18, color: selected ? GtColors.brand : GtColors.text),
                  const SizedBox(width: 6),
                  Text(
                    label,
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                      color: selected ? GtColors.brand : GtColors.text,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _RouteCard extends StatelessWidget {
  const _RouteCard({
    required this.state,
    required this.showTo,
    required this.showSwap,
  });
  final AppState state;
  final bool showTo;
  final bool showSwap;

  @override
  Widget build(BuildContext context) {
    return GtCard(
      child: Column(
        children: [
          _placeRow(
            context,
            letter: 'A',
            hint: 'From: address, airport, hotel',
            place: state.from,
            onTap: () {
              state.setLocationField('from');
              context.push('/location');
            },
            onClear: state.from == null ? null : () => state.setFrom(null),
          ),
          if (showTo) ...[
            Row(
              children: [
                const SizedBox(width: 10),
                Container(width: 2, height: 18, color: GtColors.border),
                const Spacer(),
                if (showSwap)
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    onPressed: state.swapRoute,
                    icon: const Icon(Icons.swap_vert, color: GtColors.textMuted),
                  ),
              ],
            ),
            _placeRow(
              context,
              letter: 'B',
              hint: 'To: address, airport, hotel',
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
    );
  }

  Widget _placeRow(
    BuildContext context, {
    required String letter,
    required String hint,
    required Place? place,
    required VoidCallback onTap,
    VoidCallback? onClear,
  }) {
    return InkWell(
      onTap: onTap,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GtPointLabel(letter: letter),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              place?.label ?? hint,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: place == null ? GtColors.textMuted : GtColors.text,
                height: 1.3,
              ),
            ),
          ),
          if (onClear != null)
            IconButton(
              visualDensity: VisualDensity.compact,
              onPressed: onClear,
              icon: const Icon(Icons.close, size: 18, color: GtColors.textMuted),
            ),
        ],
      ),
    );
  }
}

class _VehicleClassRow extends StatelessWidget {
  const _VehicleClassRow({
    required this.state,
    this.showFromPrice = false,
  });
  final AppState state;
  final bool showFromPrice;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: showFromPrice ? 138 : 118,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: MockData.vehicleClasses.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final vc = MockData.vehicleClasses[i];
          final selected = state.vehicleClassIds.contains(vc.id);
          final fromPrice = showFromPrice ? vc.fromPrice : null;
          final priceValue = fromPrice == null
              ? null
              : fromPrice.replaceFirst(RegExp(r'^from\s+', caseSensitive: false), '');
          return InkWell(
            onTap: () => state.toggleVehicleClass(vc.id),
            borderRadius: BorderRadius.circular(8),
            child: Container(
              width: 104,
              padding: EdgeInsets.fromLTRB(showFromPrice ? 8 : 6, 8, showFromPrice ? 8 : 6, 8),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: selected ? GtColors.brand : const Color(0xFFE8C4A8),
                  width: selected ? 1.5 : 1,
                ),
              ),
              child: Column(
                crossAxisAlignment:
                    showFromPrice ? CrossAxisAlignment.start : CrossAxisAlignment.center,
                children: [
                  Expanded(
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        Center(
                          child: vc.imageAsset != null
                              ? Image.asset(
                                  vc.imageAsset!,
                                  package: 'gt_ui',
                                  fit: BoxFit.contain,
                                  width: double.infinity,
                                  filterQuality: FilterQuality.medium,
                                  errorBuilder: (_, __, ___) => Icon(
                                    Icons.directions_car,
                                    size: 40,
                                    color: selected ? GtColors.brand : GtColors.text,
                                  ),
                                )
                              : Icon(
                                  Icons.directions_car,
                                  size: 40,
                                  color: selected ? GtColors.brand : GtColors.text,
                                ),
                        ),
                        if (selected)
                          const Positioned(
                            top: -2,
                            right: -2,
                            child: Icon(
                              Icons.check_circle,
                              size: 18,
                              color: GtColors.brand,
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    vc.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                  ),
                  if (priceValue != null) ...[
                    const SizedBox(height: 2),
                    Text.rich(
                      TextSpan(
                        children: [
                          const TextSpan(
                            text: 'from ',
                            style: TextStyle(
                              color: GtColors.textSecondary,
                              fontWeight: FontWeight.w400,
                              fontSize: 11,
                            ),
                          ),
                          TextSpan(
                            text: priceValue,
                            style: const TextStyle(
                              color: Color(0xFF2E9E45),
                              fontWeight: FontWeight.w700,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _PickupRow extends StatelessWidget {
  const _PickupRow({
    required this.state,
  });
  final AppState state;

  @override
  Widget build(BuildContext context) {
    final label = state.formatPickupLabel();

    return GtCard(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          const Icon(Icons.calendar_today_outlined, size: 20, color: GtColors.textSecondary),
          const SizedBox(width: 10),
          Expanded(
            child: InkWell(
              onTap: () async {
                final now = DateTime.now();
                final date = await showDatePicker(
                  context: context,
                  initialDate: state.pickupNow ? now : state.pickupDateTime,
                  firstDate: DateTime(now.year, now.month, now.day),
                  lastDate: now.add(const Duration(days: 365)),
                );
                if (date == null || !context.mounted) return;
                final time = await showTimePicker(
                  context: context,
                  initialTime: TimeOfDay.fromDateTime(
                    state.pickupNow ? now : state.pickupDateTime,
                  ),
                );
                if (time == null || !context.mounted) return;
                state.setPickupDateTime(DateTime(
                  date.year,
                  date.month,
                  date.day,
                  time.hour,
                  time.minute,
                ));
              },
              child: Text(
                label,
                style: const TextStyle(
                  color: GtColors.text,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
          GtOrangePill(
            label: 'Now',
            selected: state.pickupNow,
            onTap: () => state.setPickupNow(true),
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
    return GtCard(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      child: InkWell(
        onTap: () async {
          final start = state.effectivePickupDateTime;
          final initial = state.rideEndsDateTime ??
              start.add(const Duration(hours: 1));
          final date = await showDatePicker(
            context: context,
            initialDate: initial.isBefore(start) ? start : initial,
            firstDate: DateTime(start.year, start.month, start.day),
            lastDate: start.add(const Duration(days: 365)),
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
          if (!ends.isAfter(start)) {
            ends = start.add(const Duration(minutes: 30));
          }
          state.setRideEndsDateTime(ends);
        },
        child: Row(
          children: [
            const Icon(Icons.calendar_today_outlined,
                size: 20, color: GtColors.textSecondary),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                state.formatRideEndsLabel(),
                style: TextStyle(
                  color: hasValue ? GtColors.text : GtColors.textMuted,
                  fontWeight: hasValue ? FontWeight.w600 : FontWeight.w500,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FlightRow extends StatelessWidget {
  const _FlightRow({required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    return GtCard(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Row(
        children: [
          const Icon(Icons.flight, size: 20, color: GtColors.textSecondary),
          const SizedBox(width: 10),
          Expanded(
            child: _BoundField(
              key: const ValueKey('flight'),
              initial: state.flight,
              hint: 'Arrival flight number',
              onChanged: state.setFlight,
            ),
          ),
        ],
      ),
    );
  }
}

class _SignageRow extends StatelessWidget {
  const _SignageRow({required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    return GtCard(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Row(
        children: [
          const Icon(Icons.badge_outlined, size: 20, color: GtColors.textSecondary),
          const SizedBox(width: 10),
          Expanded(
            child: _BoundField(
              key: const ValueKey('signage'),
              initial: state.signage,
              hint: "Name on a sign the driver'll hold",
              onChanged: state.setSignage,
            ),
          ),
        ],
      ),
    );
  }
}

class _ReturnToggle extends StatelessWidget {
  const _ReturnToggle({required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    return SwitchListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 4),
      title: const Text('Add return way'),
      value: state.returnEnabled,
      onChanged: state.setReturnEnabled,
    );
  }
}

class _ReturnDateRow extends StatelessWidget {
  const _ReturnDateRow({required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    return GtCard(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      child: InkWell(
        onTap: () async {
          final date = await showDatePicker(
            context: context,
            initialDate: state.returnDateTime ?? DateTime.now().add(const Duration(days: 1)),
            firstDate: DateTime.now(),
            lastDate: DateTime.now().add(const Duration(days: 365)),
          );
          if (date == null || !context.mounted) return;
          final time = await showTimePicker(
            context: context,
            initialTime: const TimeOfDay(hour: 12, minute: 0),
          );
          if (time == null) return;
          state.setReturnDateTime(DateTime(
            date.year,
            date.month,
            date.day,
            time.hour,
            time.minute,
          ));
        },
        child: Row(
          children: [
            const Icon(Icons.calendar_today_outlined, size: 20, color: GtColors.textSecondary),
            const SizedBox(width: 10),
            Text(
              state.returnDateTime == null
                  ? 'Return ride date & time'
                  : state.returnDateTime!.toString().substring(0, 16),
              style: TextStyle(
                color: state.returnDateTime == null ? GtColors.textMuted : GtColors.text,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ReturnFlightRow extends StatelessWidget {
  const _ReturnFlightRow({required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    return GtCard(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Row(
        children: [
          const Icon(Icons.flight, size: 20, color: GtColors.textSecondary),
          const SizedBox(width: 10),
          Expanded(
            child: TextField(
              decoration: const InputDecoration(
                hintText: 'Return arrival flight number',
                border: InputBorder.none,
              ),
              onChanged: state.setReturnFlight,
            ),
          ),
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
    return GtCard(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          const Icon(Icons.person_outline, size: 22, color: GtColors.textSecondary),
          const SizedBox(width: 10),
          const Expanded(child: Text('Adults', style: TextStyle(fontWeight: FontWeight.w500))),
          GtStepper(value: state.adults, onChanged: state.setAdults, min: 1, max: 20),
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
    return GtCard(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Row(
        children: [
          const Icon(Icons.child_care, size: 22, color: GtColors.textSecondary),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              state.childSeats.summaryLabel,
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
          ),
          TextButton(
            onPressed: () => _openChildrenSheet(context, state),
            child: const Text('Edit', style: TextStyle(color: GtColors.orange)),
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
                  style: const TextStyle(
                    fontSize: 12,
                    color: GtColors.textMuted,
                  ),
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

class _CommentBlock extends StatelessWidget {
  const _CommentBlock({
    required this.state,
    this.chips = const [
      'I need Wi-Fi',
      'I need an English-speaking driver',
    ],
  });
  final AppState state;
  final List<String> chips;

  @override
  Widget build(BuildContext context) {
    return GtCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.chat_bubble_outline, size: 20, color: GtColors.textSecondary),
              const SizedBox(width: 10),
              Expanded(
                child: _BoundField(
                  key: const ValueKey('comment'),
                  initial: state.comment,
                  hint:
                      'Comment: Luggage information, special needs or tasks for the driver',
                  maxLines: 3,
                  onChanged: state.setComment,
                ),
              ),
            ],
          ),
          if (chips.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: chips
                  .map(
                    (c) => ActionChip(
                      label: Text(c, style: const TextStyle(fontSize: 12)),
                      onPressed: () => state.appendCommentChip(c),
                      backgroundColor: GtColors.bgGrey,
                      side: BorderSide.none,
                    ),
                  )
                  .toList(),
            ),
          ],
        ],
      ),
    );
  }
}

class _PromoToggle extends StatelessWidget {
  const _PromoToggle({required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SwitchListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 4),
          title: const Text('I have a promo code'),
          value: state.promoEnabled,
          onChanged: state.setPromoEnabled,
        ),
        if (state.promoEnabled)
          GtCard(
            child: TextField(
              decoration: const InputDecoration(
                hintText: 'Enter promo code',
                border: InputBorder.none,
              ),
              onChanged: state.setPromoCode,
            ),
          ),
      ],
    );
  }
}

class _TermsToggle extends StatelessWidget {
  const _TermsToggle({required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    return SwitchListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 4),
      title: const Text('I agree to the terms of service'),
      value: state.termsAccepted,
      onChanged: state.setTermsAccepted,
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

  /// GetTransfer-style chips: gray idle, orange selected, black label.
  static const _selectedFill = Color(0xFFFF8A00);
  static const _idleFill = Color(0xFFE0E0E0);

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          for (var i = 0; i < options.length; i++) ...[
            if (i > 0) const SizedBox(width: 10),
            Builder(
              builder: (_) {
                final (minutes, label) = options[i];
                final selected = state.perHourDurationMinutes == minutes;
                return Semantics(
                  button: true,
                  selected: selected,
                  label: label,
                  child: MouseRegion(
                    cursor: SystemMouseCursors.click,
                    child: GestureDetector(
                      onTap: () => state.setPerHourDurationMinutes(minutes),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 160),
                        curve: Curves.easeOut,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 18,
                          vertical: 12,
                        ),
                        decoration: BoxDecoration(
                          color: selected ? _selectedFill : _idleFill,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          label,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: GtColors.text,
                            height: 1.2,
                          ),
                        ),
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

class _RouteMapSection extends StatelessWidget {
  const _RouteMapSection({required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    final from = state.from;
    if (from == null || !from.hasCoords) {
      return GtCard(
        child: Row(
          children: [
            const Icon(Icons.map_outlined, color: GtColors.brand),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                state.to == null
                    ? 'Select pickup (A) and destination (B) to preview the route on Google Maps'
                    : 'Select pickup (A) to preview the route on Google Maps',
                style: const TextStyle(
                  fontSize: 13,
                  color: GtColors.textSecondary,
                  height: 1.35,
                ),
              ),
            ),
          ],
        ),
      );
    }

    final to = state.to;
    final showTo = to != null &&
        to.hasCoords &&
        (state.serviceType != ServiceType.perHour || state.perHourHasEnd);

    return GtGoogleRouteMap(
      fromLat: from.lat,
      fromLng: from.lng,
      fromLabel: from.label,
      toLat: showTo ? to.lat : null,
      toLng: showTo ? to.lng : null,
      toLabel: showTo ? to.label : null,
      distanceLabel: showTo ? formatDistanceKm(haversineKm(from, to)) : null,
      height: 240,
    );
  }
}

class _BoundField extends StatefulWidget {
  const _BoundField({
    super.key,
    required this.initial,
    required this.hint,
    required this.onChanged,
    this.maxLines = 1,
  });

  final String initial;
  final String hint;
  final ValueChanged<String> onChanged;
  final int maxLines;

  @override
  State<_BoundField> createState() => _BoundFieldState();
}

class _BoundFieldState extends State<_BoundField> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initial);
  }

  @override
  void didUpdateWidget(covariant _BoundField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.initial != _controller.text &&
        widget.initial != oldWidget.initial) {
      _controller.text = widget.initial;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _controller,
      maxLines: widget.maxLines,
      decoration: InputDecoration(
        hintText: widget.hint,
        border: InputBorder.none,
      ),
      onChanged: widget.onChanged,
    );
  }
}
