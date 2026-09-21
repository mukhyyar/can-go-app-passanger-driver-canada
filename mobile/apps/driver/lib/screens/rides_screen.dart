import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import 'brand_chrome.dart';

class RidesScreen extends StatefulWidget {
  const RidesScreen({super.key});

  @override
  State<RidesScreen> createState() => _RidesScreenState();
}

class _RidesScreenState extends State<RidesScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  DateTime _day = DateTime.now();
  int _viewMode = 0; // 0 month, 1 week, 2 day

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
    _tabs.addListener(() {
      if (mounted) setState(() {});
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<AppState>().refreshMyRides();
    });
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  DateTime get _today {
    final n = DateTime.now();
    return DateTime(n.year, n.month, n.day);
  }

  DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  List<DriverRequest> _ridesOnDay(List<DriverRequest> all, DateTime day) {
    return all.where((r) {
      final at = r.pickupAt;
      if (at == null) return false;
      final local = at.toLocal();
      return _sameDay(local, day);
    }).toList();
  }

  Future<void> _onRefresh() => context.read<AppState>().refreshMyRides();

  void _openRide(DriverRequest r) {
    context.push('/trip/${r.id}');
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final scheduled = app.scheduledRides;
    final past = app.pastRides;

    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      body: SafeArea(
        child: Column(
          children: [
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 12),
              child: DriverBrandHeader(
                subtitle: 'Your schedule & past transfers',
              ),
            ),
            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: GtColors.border),
                ),
                child: Row(
                  children: [
                    _Segment(
                      label: 'Scheduled',
                      selected: _tabs.index == 0,
                      onTap: () => _tabs.animateTo(0),
                    ),
                    _Segment(
                      label: 'Past',
                      selected: _tabs.index == 1,
                      onTap: () => _tabs.animateTo(1),
                    ),
                    _Segment(
                      label: 'Calendar',
                      selected: _tabs.index == 2,
                      onTap: () => _tabs.animateTo(2),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: TabBarView(
                controller: _tabs,
                children: [
                  _rideList(
                    scheduled,
                    empty: 'No scheduled rides',
                    showStatus: true,
                  ),
                  _rideList(
                    past,
                    empty: 'No past rides',
                    showStatus: true,
                  ),
                  _calendar(app.myRides),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _rideList(
    List<DriverRequest> items, {
    required String empty,
    bool showStatus = false,
  }) {
    if (items.isEmpty) {
      return RefreshIndicator(
        color: GtColors.brand,
        onRefresh: _onRefresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            SizedBox(
              height: MediaQuery.sizeOf(context).height * 0.45,
              child: _emptyState(empty),
            ),
          ],
        ),
      );
    }
    return RefreshIndicator(
      color: GtColors.brand,
      onRefresh: _onRefresh,
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
        itemCount: items.length,
        itemBuilder: (_, i) => _ScheduledRideCard(
          request: items[i],
          showStatus: showStatus,
          onTap: () => _openRide(items[i]),
        ),
      ),
    );
  }

  Widget _emptyState(String msg) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: GtColors.soft,
              shape: BoxShape.circle,
              border: Border.all(color: GtColors.brand.withValues(alpha: 0.16)),
            ),
            child: const Icon(
              Icons.calendar_month_outlined,
              color: GtColors.brand,
              size: 32,
            ),
          ),
          const SizedBox(height: 14),
          Text(
            msg,
            style: const TextStyle(
              color: GtColors.textSecondary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _calendar(List<DriverRequest> rides) {
    final label = _viewMode == 0
        ? DateFormat('MMMM y').format(_day)
        : _viewMode == 1
            ? _weekRangeLabel(_day)
            : DateFormat('MMMM d, y').format(_day);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          child: Row(
            children: [
              TextButton(
                onPressed: () => setState(() => _day = _today),
                style: TextButton.styleFrom(foregroundColor: GtColors.brand),
                child: const Text('today'),
              ),
              IconButton(
                onPressed: () => setState(() {
                  if (_viewMode == 0) {
                    _day = DateTime(_day.year, _day.month - 1, 1);
                  } else if (_viewMode == 1) {
                    _day = _day.subtract(const Duration(days: 7));
                  } else {
                    _day = _day.subtract(const Duration(days: 1));
                  }
                }),
                icon: const Icon(Icons.chevron_left),
              ),
              IconButton(
                onPressed: () => setState(() {
                  if (_viewMode == 0) {
                    _day = DateTime(_day.year, _day.month + 1, 1);
                  } else if (_viewMode == 1) {
                    _day = _day.add(const Duration(days: 7));
                  } else {
                    _day = _day.add(const Duration(days: 1));
                  }
                }),
                icon: const Icon(Icons.chevron_right),
              ),
              Expanded(
                child: Text(
                  label,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(12),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: GtColors.border),
            ),
            child: Row(
              children: List.generate(3, (i) {
                final labels = ['Month', 'Week', 'Day'];
                final selected = _viewMode == i;
                return Expanded(
                  child: GestureDetector(
                    onTap: () => setState(() => _viewMode = i),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      decoration: BoxDecoration(
                        color: selected ? GtColors.brand : Colors.transparent,
                        borderRadius: BorderRadius.circular(24),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        labels[i],
                        style: TextStyle(
                          color: selected ? Colors.white : GtColors.text,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                );
              }),
            ),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            color: GtColors.brand,
            onRefresh: _onRefresh,
            child: _viewMode == 0
                ? _monthView(rides)
                : _viewMode == 1
                    ? _weekView(rides)
                    : _dayTimeline(rides),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: SizedBox(
            width: double.infinity,
            height: 48,
            child: OutlinedButton.icon(
              onPressed: () async {
                final messenger = ScaffoldMessenger.of(context);
                final s = context.read<AppState>();
                final date =
                    '${_day.year.toString().padLeft(4, '0')}-${_day.month.toString().padLeft(2, '0')}-${_day.day.toString().padLeft(2, '0')}';
                try {
                  await s.api.driver.addDayOff(date);
                  messenger.showSnackBar(
                    SnackBar(content: Text('Day off added for $date')),
                  );
                } catch (e) {
                  messenger.showSnackBar(
                    SnackBar(content: Text('Day off failed: $e')),
                  );
                }
              },
              style: OutlinedButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: GtColors.text,
                side: const BorderSide(color: GtColors.border),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              icon: const Icon(Icons.event_busy, color: GtColors.brand),
              label: const Text('Add day off'),
            ),
          ),
        ),
      ],
    );
  }

  String _weekRangeLabel(DateTime day) {
    final start = _weekStart(day);
    final end = start.add(const Duration(days: 6));
    if (start.month == end.month) {
      return '${DateFormat('MMM d').format(start)} – ${DateFormat('d, y').format(end)}';
    }
    return '${DateFormat('MMM d').format(start)} – ${DateFormat('MMM d, y').format(end)}';
  }

  DateTime _weekStart(DateTime day) {
    final d = _dateOnly(day);
    return d.subtract(Duration(days: d.weekday % 7));
  }

  Widget _monthView(List<DriverRequest> rides) {
    final monthStart = DateTime(_day.year, _day.month, 1);
    final daysInMonth = DateTime(_day.year, _day.month + 1, 0).day;
    final lead = monthStart.weekday % 7; // Sunday = 0
    final cells = lead + daysInMonth;
    final rows = ((cells + 6) ~/ 7);

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: GtColors.border),
          ),
          child: Column(
            children: [
              Row(
                children: ['S', 'M', 'T', 'W', 'T', 'F', 'S']
                    .map(
                      (d) => Expanded(
                        child: Center(
                          child: Text(
                            d,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: GtColors.textSecondary,
                            ),
                          ),
                        ),
                      ),
                    )
                    .toList(),
              ),
              const SizedBox(height: 8),
              ...List.generate(rows, (row) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(
                    children: List.generate(7, (col) {
                      final index = row * 7 + col;
                      final dayNum = index - lead + 1;
                      if (dayNum < 1 || dayNum > daysInMonth) {
                        return const Expanded(child: SizedBox(height: 48));
                      }
                      final date = DateTime(_day.year, _day.month, dayNum);
                      final dayRides = _ridesOnDay(rides, date);
                      final selected = _sameDay(date, _day);
                      final isToday = _sameDay(date, _today);
                      return Expanded(
                        child: InkWell(
                          borderRadius: BorderRadius.circular(10),
                          onTap: () => setState(() {
                            _day = date;
                            _viewMode = 2;
                          }),
                          child: Container(
                            height: 52,
                            margin: const EdgeInsets.all(2),
                            decoration: BoxDecoration(
                              color: selected
                                  ? GtColors.brand
                                  : isToday
                                      ? GtColors.soft
                                      : Colors.transparent,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(
                                  '$dayNum',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w700,
                                    color: selected
                                        ? Colors.white
                                        : GtColors.text,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                if (dayRides.isNotEmpty)
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: List.generate(
                                      dayRides.length.clamp(1, 3),
                                      (_) => Container(
                                        width: 5,
                                        height: 5,
                                        margin: const EdgeInsets.symmetric(
                                          horizontal: 1,
                                        ),
                                        decoration: BoxDecoration(
                                          color: selected
                                              ? Colors.white
                                              : GtColors.brand,
                                          shape: BoxShape.circle,
                                        ),
                                      ),
                                    ),
                                  )
                                else
                                  const SizedBox(height: 5),
                              ],
                            ),
                          ),
                        ),
                      );
                    }),
                  ),
                );
              }),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Text(
          DateFormat('EEEE, MMM d').format(_day),
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        ..._dayRideCards(_ridesOnDay(rides, _day)),
      ],
    );
  }

  Widget _weekView(List<DriverRequest> rides) {
    final start = _weekStart(_day);
    return ListView.builder(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      itemCount: 7,
      itemBuilder: (_, i) {
        final date = start.add(Duration(days: i));
        final dayRides = _ridesOnDay(rides, date);
        final selected = _sameDay(date, _day);
        final isToday = _sameDay(date, _today);
        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Material(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: () => setState(() {
                _day = date;
                _viewMode = 2;
              }),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: selected ? GtColors.brand : GtColors.border,
                    width: selected ? 1.5 : 1,
                  ),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      width: 52,
                      child: Column(
                        children: [
                          Text(
                            DateFormat('E').format(date),
                            style: TextStyle(
                              fontWeight: FontWeight.w600,
                              color: isToday
                                  ? GtColors.brand
                                  : GtColors.textSecondary,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Container(
                            width: 32,
                            height: 32,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: selected || isToday
                                  ? GtColors.brand
                                  : GtColors.soft,
                              shape: BoxShape.circle,
                            ),
                            child: Text(
                              '${date.day}',
                              style: TextStyle(
                                color: selected || isToday
                                    ? Colors.white
                                    : GtColors.text,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: dayRides.isEmpty
                          ? const Padding(
                              padding: EdgeInsets.only(top: 8),
                              child: Text(
                                'No rides',
                                style: TextStyle(
                                  color: GtColors.textMuted,
                                  fontSize: 13,
                                ),
                              ),
                            )
                          : Column(
                              children: dayRides
                                  .map(
                                    (r) => Padding(
                                      padding: const EdgeInsets.only(bottom: 6),
                                      child: _miniRideRow(r),
                                    ),
                                  )
                                  .toList(),
                            ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _miniRideRow(DriverRequest r) {
    final time = r.pickupAt != null
        ? DateFormat('HH:mm').format(r.pickupAt!.toLocal())
        : '—';
    return GestureDetector(
      onTap: () => _openRide(r),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: GtColors.soft,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(
          '$time  ${r.from} → ${r.to}',
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }

  List<Widget> _dayRideCards(List<DriverRequest> dayRides) {
    if (dayRides.isEmpty) {
      return [
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 24),
          child: Center(
            child: Text(
              'No rides this day',
              style: TextStyle(color: GtColors.textMuted),
            ),
          ),
        ),
      ];
    }
    return dayRides
        .map(
          (r) => _ScheduledRideCard(
            request: r,
            showStatus: true,
            onTap: () => _openRide(r),
          ),
        )
        .toList();
  }

  Widget _dayTimeline(List<DriverRequest> rides) {
    final dayRides = _ridesOnDay(rides, _day);
    final weekday = DateFormat('E').format(_day);
    final now = DateTime.now();

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 12),
      children: [
        Row(
          children: [
            Column(
              children: [
                Text(
                  weekday,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                Container(
                  width: 32,
                  height: 32,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                    color: GtColors.brand,
                    shape: BoxShape.circle,
                  ),
                  child: Text(
                    '${_day.day}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            const Spacer(),
            Text(
              DateFormat('HH:mm').format(now),
              style: const TextStyle(color: GtColors.textMuted),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (dayRides.isNotEmpty) ...[
          ...dayRides.map(
            (r) => _ScheduledRideCard(
              request: r,
              showStatus: true,
              onTap: () => _openRide(r),
            ),
          ),
          const SizedBox(height: 8),
        ],
        ...List.generate(24, (hour) {
          final hourRides = dayRides.where((r) {
            final at = r.pickupAt?.toLocal();
            return at != null && at.hour == hour;
          }).toList();
          final label =
              DateFormat('HH:00').format(DateTime(2026, 1, 1, hour));
          return SizedBox(
            height: hourRides.isEmpty ? 44 : 44.0 + hourRides.length * 36,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 52,
                  child: Text(
                    label,
                    style: const TextStyle(
                      fontSize: 12,
                      color: GtColors.textSecondary,
                    ),
                  ),
                ),
                Expanded(
                  child: Container(
                    decoration: const BoxDecoration(
                      border: Border(top: BorderSide(color: GtColors.border)),
                    ),
                    child: hourRides.isEmpty
                        ? null
                        : Padding(
                            padding: const EdgeInsets.only(top: 4, left: 4),
                            child: Column(
                              children: hourRides
                                  .map(
                                    (r) => Padding(
                                      padding: const EdgeInsets.only(bottom: 4),
                                      child: _miniRideRow(r),
                                    ),
                                  )
                                  .toList(),
                            ),
                          ),
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }
}

class _ScheduledRideCard extends StatelessWidget {
  const _ScheduledRideCard({
    required this.request,
    required this.onTap,
    this.showStatus = false,
  });

  final DriverRequest request;
  final VoidCallback onTap;
  final bool showStatus;

  @override
  Widget build(BuildContext context) {
    final statusLabel = friendlyRideStatus(request.status);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: GtCard(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    request.datetimeLabel,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                if (showStatus) ...[
                  const SizedBox(width: 8),
                  Flexible(
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: GtColors.soft,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: GtColors.brand.withValues(alpha: 0.14),
                        ),
                      ),
                      child: Text(
                        statusLabel,
                        textAlign: TextAlign.end,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: GtColors.brand,
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 2),
            Text(
              'Ride #${request.displayId}',
              style: const TextStyle(color: GtColors.textMuted, fontSize: 12),
            ),
            if ((request.status ?? '').toUpperCase() != 'COMPLETED' &&
                (request.passengerName ?? '').trim().isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                request.passengerName!.trim(),
                style: const TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
            if (request.isRoundTrip && request.returnDatetimeLabel != null) ...[
              const SizedBox(height: 4),
              Text(
                'Return: ${request.returnDatetimeLabel}',
                style: const TextStyle(
                  fontSize: 12.5,
                  color: GtColors.textSecondary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
            const SizedBox(height: 12),
            GtRouteRow(
              from: request.from,
              to: request.to,
              distance: request.distance,
              duration: request.duration,
            ),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    request.vehicleNeed,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
                const SizedBox(width: 8),
                const Icon(
                  Icons.person_outline,
                  size: 18,
                  color: GtColors.brand,
                ),
                Text(' × ${request.passengers}'),
              ],
            ),
            if (request.offerPrice != null) ...[
              const SizedBox(height: 10),
              Text(
                '${request.currency} ${request.offerPrice!.toStringAsFixed(0)}',
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  color: GtColors.brand,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Segment extends StatelessWidget {
  const _Segment({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(10),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              color: selected ? GtColors.brand : Colors.transparent,
              borderRadius: BorderRadius.circular(10),
            ),
            alignment: Alignment.center,
            child: Text(
              label,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: selected ? Colors.white : GtColors.textSecondary,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
