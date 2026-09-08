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

class _WaitingScreenState extends State<WaitingScreen> {
  Timer? _pulse;
  Timer? _poll;
  int _step = 0;
  bool _refreshed = false;

  @override
  void initState() {
    super.initState();
    _pulse = Timer.periodic(const Duration(milliseconds: 700), (_) {
      if (!mounted) return;
      setState(() => _step = (_step + 1).clamp(0, 3));
    });
    _poll = Timer.periodic(const Duration(seconds: 3), (_) => _refresh());
    Future.delayed(const Duration(milliseconds: 400), _refresh);
  }

  Future<void> _refresh() async {
    final app = context.read<AppState>();
    await app.refreshRidesFromServer();
    if (!mounted) return;
    setState(() => _refreshed = true);
    final ride = app.rideById(widget.rideId);
    if (ride != null &&
        (ride.status == RideStatus.chooseOffer ||
            (ride.offerCount > 0) ||
            ride.serverStatus == 'OFFER_SELECTION')) {
      context.go('/offers/${widget.rideId}');
    }
  }

  @override
  void dispose() {
    _pulse?.cancel();
    _poll?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final ride = state.rideById(widget.rideId);
    final carriers = 42 + (widget.rideId.hashCode % 30).abs();

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: Text('Ride #${widget.rideId}'),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => context.go('/'),
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (ride != null)
              GtCard(
                child: GtRouteRow(
                  from: ride.from,
                  to: ride.to,
                  distance: ride.distance,
                  duration: ride.duration,
                  timeBadge: ride.timeBadge,
                ),
              ),
            const SizedBox(height: 24),
            Text(
              'Connecting to $carriers carriers',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            const Text(
              'Drivers are reviewing your request and preparing offers.',
              style: TextStyle(color: GtColors.textSecondary),
            ),
            const SizedBox(height: 24),
            _stepRow(0, 'Request sent'),
            _stepRow(1, 'Carriers notified'),
            _stepRow(2, 'Waiting for offers'),
            _stepRow(3, 'Ready to choose'),
            const Spacer(),
            if (_refreshed)
              GtGreenButton(
                label: 'Show offers',
                onPressed: () => context.push('/offers/${widget.rideId}'),
              ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: () => context.go('/'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
              ),
              child: const Text('Back to Book'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _stepRow(int index, String label) {
    final done = _step >= index;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(
            done ? Icons.check_circle : Icons.radio_button_unchecked,
            color: done ? GtColors.green : GtColors.border,
          ),
          const SizedBox(width: 10),
          Text(
            label,
            style: TextStyle(
              fontWeight: done ? FontWeight.w600 : FontWeight.w400,
              color: done ? GtColors.text : GtColors.textMuted,
            ),
          ),
        ],
      ),
    );
  }
}
