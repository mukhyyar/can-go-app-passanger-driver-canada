import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_api/gt_api.dart';
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
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<AppState>().refreshRidesFromServer();
    });
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _onRefresh() =>
      context.read<AppState>().refreshRidesFromServer();

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

    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      appBar: AppBar(
        title: const Text('Rides'),
        bottom: TabBar(
          controller: _tabs,
          labelColor: GtColors.brand,
          unselectedLabelColor: GtColors.textSecondary,
          indicatorColor: GtColors.brand,
          tabs: const [
            Tab(text: 'Upcoming'),
            Tab(text: 'Past'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: [
          _RideList(rides: upcoming, onRefresh: _onRefresh),
          _RideList(rides: past, onRefresh: _onRefresh),
        ],
      ),
    );
  }
}

class _RideList extends StatelessWidget {
  const _RideList({required this.rides, required this.onRefresh});
  final List<RideRequest> rides;
  final Future<void> Function() onRefresh;

  String _statusText(RideRequest r) {
    if (r.serverStatus != null && r.serverStatus!.isNotEmpty) {
      return friendlyRideStatus(r.serverStatus);
    }
    return friendlyLocalRideStatus(r.status);
  }

  Color _badgeColor(RideStatus s) {
    switch (s) {
      case RideStatus.waitingOffers:
        return GtColors.brand;
      case RideStatus.chooseOffer:
        return GtColors.green;
      case RideStatus.paymentPending:
        return GtColors.warn;
      case RideStatus.booked:
        return GtColors.greenDark;
      case RideStatus.past:
        return GtColors.textSecondary;
      case RideStatus.cancelled:
        return GtColors.brand;
    }
  }

  void _openRide(BuildContext context, RideRequest r) {
    switch (r.status) {
      case RideStatus.waitingOffers:
        if (r.offerCount > 0) {
          context.push('/offers/${r.id}');
        } else {
          context.push('/waiting/${r.id}');
        }
      case RideStatus.chooseOffer:
        context.push('/offers/${r.id}');
      case RideStatus.paymentPending:
        final offerId = r.selectedOfferId;
        if (offerId != null && offerId.isNotEmpty) {
          context.push('/payment/${r.id}/$offerId');
        } else {
          context.push('/offers/${r.id}');
        }
      case RideStatus.booked:
        final offerId = r.selectedOfferId;
        if (offerId != null && offerId.isNotEmpty) {
          context.push('/offer/${r.id}/$offerId');
        } else {
          context.push('/booking-confirmed/${r.id}');
        }
      case RideStatus.past:
      case RideStatus.cancelled:
        if (r.selectedOfferId != null) {
          context.push('/offer/${r.id}/${r.selectedOfferId}');
        }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (rides.isEmpty) {
      return RefreshIndicator(
        color: GtColors.brand,
        onRefresh: onRefresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: const [
            SizedBox(height: 120),
            Center(
              child: Text(
                'No rides yet',
                style: TextStyle(color: GtColors.textMuted),
              ),
            ),
          ],
        ),
      );
    }
    return RefreshIndicator(
      color: GtColors.brand,
      onRefresh: onRefresh,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(12),
        itemCount: rides.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (_, i) {
          final r = rides[i];
          return GtCard(
            onTap: () => _openRide(context, r),
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
                    if (r.offerCount > 0 &&
                        (r.status == RideStatus.chooseOffer ||
                            r.status == RideStatus.waitingOffers))
                      Container(
                        margin: const EdgeInsets.only(right: 8),
                        width: 22,
                        height: 22,
                        alignment: Alignment.center,
                        decoration: const BoxDecoration(
                          color: GtColors.brand,
                          shape: BoxShape.circle,
                        ),
                        child: Text(
                          '${r.offerCount > 9 ? '9+' : r.offerCount}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: _badgeColor(r.status).withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        _statusText(r),
                        style: TextStyle(
                          color: _badgeColor(r.status),
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  'Request #${r.displayId}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: GtColors.textMuted,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (r.createdAtLabel != null &&
                    r.createdAtLabel!.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    'Created ${r.createdAtLabel}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: GtColors.textMuted,
                    ),
                  ),
                ],
                const SizedBox(height: 10),
                GtRouteRow(
                  from: r.from,
                  to: r.to,
                  distance: r.distance,
                  duration: r.duration,
                  timeBadge: r.timeBadge,
                ),
                if (r.returnLabel != null) ...[
                  const SizedBox(height: 6),
                  Text(
                    'Return: ${r.returnLabel}',
                    style: const TextStyle(
                      color: GtColors.textSecondary,
                      fontSize: 13,
                    ),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}
