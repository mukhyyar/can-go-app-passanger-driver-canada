import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

class WaitingScreen extends StatefulWidget {
  const WaitingScreen({super.key, required this.rideId});
  final String rideId;

  @override
  State<WaitingScreen> createState() => _WaitingScreenState();
}

class _WaitingScreenState extends State<WaitingScreen>
    with SingleTickerProviderStateMixin {
  Timer? _poll;
  Timer? _initialDelay;
  late final AnimationController _pulse;
  bool _refreshed = false;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);
    _poll = Timer.periodic(const Duration(seconds: 3), (_) => _refresh());
    _initialDelay = Timer(const Duration(milliseconds: 400), _refresh);
  }

  Future<void> _refresh() async {
    final app = context.read<AppState>();
    try {
      await Future.wait([
        app.refreshRidesFromServer(),
        app.refreshRide(widget.rideId),
      ]);
    } catch (_) {}
    if (!mounted) return;
    setState(() => _refreshed = true);
    final ride = app.rideById(widget.rideId);
    if (ride != null && ride.isBooked) {
      context.go('/ride/${widget.rideId}');
      return;
    }
    final offers = app.offersFor(widget.rideId);
    if (ride != null &&
        (ride.status == RideStatus.chooseOffer ||
            offers.isNotEmpty ||
            (ride.offerCount > 0) ||
            ride.serverStatus == 'OFFER_SELECTION')) {
      context.go('/offers/${widget.rideId}');
    }
  }

  @override
  void dispose() {
    _poll?.cancel();
    _initialDelay?.cancel();
    _pulse.dispose();
    super.dispose();
  }

  Future<void> _confirmCancel() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel ride?'),
        content: const Text(
          'Are you sure you want to cancel this ride request?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Cancel ride'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await context.read<AppState>().cancelRide(widget.rideId);
      if (!mounted) return;
      context.go('/');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not cancel: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final ride = state.rideById(widget.rideId);

    if (ride != null && ride.isBooked) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.go('/ride/${widget.rideId}');
      });
    }
    final offers = state.offersFor(widget.rideId);
    final offerCount =
        offers.isNotEmpty ? offers.length : (ride?.offerCount ?? 0);
    final hasOffers = offerCount > 0 ||
        ride?.status == RideStatus.chooseOffer ||
        ride?.serverStatus == 'OFFER_SELECTION';
    final status = (ride?.serverStatus ?? '').toUpperCase();
    final canEdit =
        status == 'WAITING_FOR_OFFERS' || status == 'OFFER_SELECTION';
    final canCancel = status == 'WAITING_FOR_OFFERS' ||
        status == 'OFFER_SELECTION' ||
        status == 'PAYMENT_PENDING' ||
        status.isEmpty;

    return Scaffold(
      backgroundColor: const Color(0xFFF3F4F6),
      appBar: AppBar(
        title: Text(
          ride != null ? 'Ride · #${ride.displayId}' : 'Finding offers',
        ),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => context.go('/'),
        ),
        actions: [
          if (canEdit)
            TextButton(
              onPressed: () => context.push('/edit-ride/${widget.rideId}'),
              child: const Text('Edit'),
            ),
          if (canCancel)
            TextButton(
              onPressed: _confirmCancel,
              child: const Text(
                'Cancel',
                style: TextStyle(color: GtColors.brand),
              ),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          if (ride != null)
            GtCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (ride.datetimeLabel.isNotEmpty)
                              Text(
                                ride.datetimeLabel,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 14,
                                ),
                              ),
                            if (ride.hasReturnTrip &&
                                ride.returnLabel != null &&
                                ride.returnLabel!.isNotEmpty) ...[
                              const SizedBox(height: 2),
                              Text(
                                'Return: ${ride.returnLabel}',
                                style: const TextStyle(
                                  color: Color(0xFF8A6900),
                                  fontWeight: FontWeight.w600,
                                  fontSize: 12.5,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      if (ride.hasReturnTrip)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFFF3CD),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                                color: const Color(0xFFE6B800), width: 0.8),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.swap_vert_rounded,
                                  size: 13, color: Color(0xFF8A6900)),
                              SizedBox(width: 4),
                              Text(
                                'Return trip',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: Color(0xFF6B5000),
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  GtRouteRow(
                    from: ride.from,
                    to: ride.to,
                    distance: ride.distance,
                    duration: ride.duration,
                    timeBadge: ride.timeBadge,
                    isRoundTrip: ride.hasReturnTrip,
                    returnLabel: ride.returnLabel,
                  ),
                ],
              ),
            ),
          const SizedBox(height: 28),
          FadeTransition(
            opacity: Tween(begin: 0.45, end: 1.0).animate(_pulse),
            child: const Icon(
              Icons.radar,
              size: 56,
              color: GtColors.brand,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            hasOffers
                ? '$offerCount offer${offerCount == 1 ? '' : 's'} received'
                : 'Finding the best offers for you',
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          Text(
            hasOffers
                ? 'Drivers have bid on your ride. Review and choose an offer.'
                : 'Connecting you with nearby drivers. You can leave this screen — your request stays active.',
            style: const TextStyle(
              color: GtColors.textSecondary,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 28),
          _step(true, 'Request sent'),
          _step(true, 'Receive offers'),
          _step(hasOffers, 'Select an offer'),
          _step(false, 'Book & pay'),
          const SizedBox(height: 28),
          if (_refreshed && hasOffers)
            GtGreenButton(
              label: 'Show offers',
              onPressed: () => context.push('/offers/${widget.rideId}'),
            ),
          if (_refreshed && !hasOffers)
            OutlinedButton(
              onPressed: _refresh,
              style: OutlinedButton.styleFrom(
                foregroundColor: GtColors.brand,
                side: const BorderSide(color: GtColors.brand),
                minimumSize: const Size.fromHeight(48),
              ),
              child: const Text('Refresh'),
            ),
          const SizedBox(height: 12),
          TextButton(
            onPressed: () => context.go('/'),
            child: const Text(
              'Back to home',
              style: TextStyle(color: GtColors.textSecondary),
            ),
          ),
        ],
      ),
    );
  }

  Widget _step(bool done, String label) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Icon(
            done ? Icons.check_circle : Icons.radio_button_unchecked,
            size: 22,
            color: done ? GtColors.green : GtColors.textMuted,
          ),
          const SizedBox(width: 10),
          Text(
            label,
            style: TextStyle(
              fontWeight: done ? FontWeight.w700 : FontWeight.w500,
              color: done ? GtColors.text : GtColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}
