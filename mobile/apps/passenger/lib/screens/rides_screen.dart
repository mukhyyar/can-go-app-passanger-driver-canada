import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

class RidesScreen extends StatefulWidget {
  const RidesScreen({super.key});

  @override
  State<RidesScreen> createState() => _RidesScreenState();
}

class _RidesScreenState extends State<RidesScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final rides = context.watch<AppState>().repo.rides;
    final upcoming = rides
        .where((r) =>
            r.status != RideStatus.past && r.status != RideStatus.cancelled)
        .toList();
    final past = rides
        .where((r) =>
            r.status == RideStatus.past || r.status == RideStatus.cancelled)
        .toList();

    // Ensure demo has at least one past ride for the tab
    final pastList = past.isEmpty
        ? [
            RideRequest(
              id: '25000001',
              datetimeLabel: 'Mon 1 Sept, 14:00',
              from: MockData.places[4].label,
              to: MockData.places[0].label,
              distance: '34 km',
              duration: '~ 44 min',
              status: RideStatus.past,
            ),
          ]
        : past;

    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      appBar: AppBar(
        title: const Text('Rides'),
        bottom: TabBar(
          controller: _tabs,
          labelColor: GtColors.orange,
          unselectedLabelColor: GtColors.textSecondary,
          indicatorColor: GtColors.orange,
          tabs: const [
            Tab(text: 'Upcoming'),
            Tab(text: 'Past'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: [
          _RideList(rides: upcoming),
          _RideList(rides: pastList),
        ],
      ),
    );
  }
}

class _RideList extends StatelessWidget {
  const _RideList({required this.rides});
  final List<RideRequest> rides;

  String _statusText(RideStatus s) {
    switch (s) {
      case RideStatus.waitingOffers:
        return 'Waiting for offers';
      case RideStatus.chooseOffer:
        return 'Choose an offer';
      case RideStatus.paymentPending:
        return 'Payment pending';
      case RideStatus.booked:
        return 'Booked';
      case RideStatus.past:
        return 'Completed';
      case RideStatus.cancelled:
        return 'Cancelled';
    }
  }

  Color _badgeColor(RideStatus s) {
    switch (s) {
      case RideStatus.waitingOffers:
        return GtColors.orange;
      case RideStatus.chooseOffer:
        return GtColors.green;
      case RideStatus.paymentPending:
        return GtColors.orange;
      case RideStatus.booked:
        return GtColors.greenDark;
      case RideStatus.past:
        return GtColors.textSecondary;
      case RideStatus.cancelled:
        return GtColors.red;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (rides.isEmpty) {
      return const Center(
        child: Text('No rides yet', style: TextStyle(color: GtColors.textMuted)),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(12),
      itemCount: rides.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (_, i) {
        final r = rides[i];
        return GtCard(
          onTap: () {
            if (r.status == RideStatus.chooseOffer ||
                r.status == RideStatus.waitingOffers) {
              if (r.offerCount > 0 || r.status == RideStatus.chooseOffer) {
                context.push('/offers/${r.id}');
              } else {
                context.push('/waiting/${r.id}');
              }
            } else if (r.selectedOfferId != null) {
              context.push('/offer/${r.id}/${r.selectedOfferId}');
            } else {
              context.push('/waiting/${r.id}');
            }
          },
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      r.datetimeLabel,
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: _badgeColor(r.status).withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      _statusText(r.status),
                      style: TextStyle(
                        color: _badgeColor(r.status),
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              GtRouteRow(
                from: r.from,
                to: r.to,
                distance: r.distance,
                duration: r.duration,
                timeBadge: r.timeBadge,
              ),
              if (r.offerCount > 0) ...[
                const SizedBox(height: 8),
                Text(
                  '${r.offerCount} offers',
                  style: const TextStyle(color: GtColors.orange, fontWeight: FontWeight.w600),
                ),
              ],
              if (r.returnLabel != null) ...[
                const SizedBox(height: 6),
                Text(
                  'Return: ${r.returnLabel}',
                  style: const TextStyle(color: GtColors.textSecondary, fontSize: 13),
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}
