import 'package:flutter/material.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:intl/intl.dart';

import 'brand_chrome.dart';

class RidesScreen extends StatefulWidget {
  const RidesScreen({super.key});

  @override
  State<RidesScreen> createState() => _RidesScreenState();
}

class _RidesScreenState extends State<RidesScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  DateTime _day = DateTime(2026, 9, 4);
  int _viewMode = 2; // 0 month, 1 week, 2 day

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this, initialIndex: 2);
    _tabs.addListener(() {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
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
                  _emptyList('No scheduled rides'),
                  _emptyList('No past rides'),
                  _calendar(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _emptyList(String msg) {
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

  Widget _calendar() {
    final label = DateFormat('MMMM d, y').format(_day);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          child: Row(
            children: [
              TextButton(
                onPressed: () => setState(() => _day = DateTime(2026, 9, 4)),
                style: TextButton.styleFrom(foregroundColor: GtColors.brand),
                child: const Text('today'),
              ),
              IconButton(
                onPressed: () => setState(
                  () => _day = _day.subtract(const Duration(days: 1)),
                ),
                icon: const Icon(Icons.chevron_left),
              ),
              IconButton(
                onPressed: () =>
                    setState(() => _day = _day.add(const Duration(days: 1))),
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
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(
            children: [
              OutlinedButton.icon(
                onPressed: () {},
                icon: const Icon(Icons.filter_list, size: 18),
                label: const Text('Filter'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: GtColors.text,
                  side: const BorderSide(color: GtColors.border),
                ),
              ),
              const Spacer(),
              IconButton(
                onPressed: () {},
                icon: const Icon(Icons.search, color: GtColors.brand),
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
        Expanded(child: _dayTimeline()),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: SizedBox(
            width: double.infinity,
            height: 48,
            child: OutlinedButton.icon(
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Day off added (demo)')),
                );
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

  Widget _dayTimeline() {
    final weekday = DateFormat('E').format(_day);
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      children: [
        Row(
          children: [
            Column(
              children: [
                Text(weekday, style: const TextStyle(fontWeight: FontWeight.w600)),
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
            const Text('15:59', style: TextStyle(color: GtColors.textMuted)),
          ],
        ),
        const SizedBox(height: 8),
        ...List.generate(12, (i) {
          final hour = i + 1;
          final label =
              DateFormat('hh:00 a').format(DateTime(2026, 1, 1, hour));
          return SizedBox(
            height: 56,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 72,
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
