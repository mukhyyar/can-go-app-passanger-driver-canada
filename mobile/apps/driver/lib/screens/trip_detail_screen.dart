import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../state/app_state.dart';

class TripDetailScreen extends StatefulWidget {
  const TripDetailScreen({super.key, required this.rideId});

  final String rideId;

  @override
  State<TripDetailScreen> createState() => _TripDetailScreenState();
}

class _TripDetailScreenState extends State<TripDetailScreen> {
  DriverRequest? _ride;
  bool _loading = true;
  bool _acting = false;
  String? _error;
  AppState? _app;
  Map<String, dynamic>? _contact;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _app ??= context.read<AppState>();
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _app?.stopTripLocationTracking();
    super.dispose();
  }

  Future<void> _load() async {
    final s = context.read<AppState>();
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final detail = await s.loadTripDetail(widget.rideId);
      Map<String, dynamic>? contact;
      try {
        final st = (detail.status ?? '').toUpperCase();
        if (AppState.chatAllowedStatuses.contains(st)) {
          contact = await s.getRideContact(widget.rideId);
        }
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _ride = detail;
        _contact = contact;
        _loading = false;
      });
      _syncLocationTracking(detail.status);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  void _syncLocationTracking(String? status) {
    final s = context.read<AppState>();
    final upper = (status ?? '').toUpperCase();
    if (upper == 'DRIVER_EN_ROUTE' ||
        upper == 'DRIVER_ARRIVED' ||
        upper == 'TRIP_STARTED' ||
        upper == 'IN_PROGRESS') {
      s.startTripLocationTracking(widget.rideId);
    } else {
      s.stopTripLocationTracking();
    }
  }

  Future<void> _callPassenger() async {
    final phone = _contact?['phoneE164']?.toString();
    if (phone == null || phone.isEmpty) return;
    final uri = Uri(scheme: 'tel', path: phone);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  Future<void> _whatsAppPassenger() async {
    final phone = _contact?['phoneE164']?.toString() ?? '';
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    if (digits.length < 8) return;
    final uri = Uri.parse('https://wa.me/$digits');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  String get _serverStatus => (_ride?.status ?? '').toUpperCase();

  bool get _isActiveTrip {
    const active = {
      'BOOKED',
      'DRIVER_EN_ROUTE',
      'DRIVER_ARRIVED',
      'TRIP_STARTED',
      'IN_PROGRESS',
    };
    return active.contains(_serverStatus);
  }

  Future<void> _primaryAction() async {
    if (_acting || _ride == null) return;
    final s = context.read<AppState>();
    setState(() => _acting = true);
    try {
      switch (_serverStatus) {
        case 'BOOKED':
          await s.tripGoEnRoute(widget.rideId);
        case 'DRIVER_EN_ROUTE':
          await s.tripArrived(widget.rideId);
        case 'DRIVER_ARRIVED':
          await s.tripStart(widget.rideId);
        case 'TRIP_STARTED':
        case 'IN_PROGRESS':
          await s.tripComplete(widget.rideId);
      }
      if (!mounted) return;
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Action failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _acting = false);
    }
  }

  String? get _primaryLabel {
    switch (_serverStatus) {
      case 'BOOKED':
        return 'Go en route';
      case 'DRIVER_EN_ROUTE':
        return 'Arrived at pickup';
      case 'DRIVER_ARRIVED':
        return 'Start trip';
      case 'TRIP_STARTED':
      case 'IN_PROGRESS':
        return 'Complete trip';
      default:
        return null;
    }
  }

  Future<void> _openMaps() async {
    final r = _ride;
    if (r == null) return;
    final lat = r.fromLat;
    final lng = r.fromLng;
    if (lat == null || lng == null) return;
    final uri = Uri.parse(
      'https://www.google.com/maps/search/?api=1&query=$lat,$lng',
    );
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  int _timelineIndex(String status) {
    switch (status.toUpperCase()) {
      case 'BOOKED':
        return 0;
      case 'DRIVER_EN_ROUTE':
        return 1;
      case 'DRIVER_ARRIVED':
        return 2;
      case 'TRIP_STARTED':
      case 'IN_PROGRESS':
        return 3;
      case 'COMPLETED':
        return 4;
      default:
        return 0;
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = _ride;
    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      appBar: AppBar(
        title: Text(r != null ? 'Trip #${r.displayId}' : 'Trip'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_error!, textAlign: TextAlign.center),
                        const SizedBox(height: 12),
                        GtGreenButton(label: 'Retry', onPressed: _load),
                      ],
                    ),
                  ),
                )
              : r == null
                  ? const Center(child: Text('Trip not found'))
                  : Column(
                      children: [
                        Expanded(
                          child: ListView(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                            children: [
                              GtCard(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Expanded(
                                          child: Text(
                                            r.datetimeLabel,
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w700,
                                              fontSize: 16,
                                            ),
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        Flexible(
                                          child: Container(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 10,
                                              vertical: 4,
                                            ),
                                            decoration: BoxDecoration(
                                              color: GtColors.soft,
                                              borderRadius:
                                                  BorderRadius.circular(12),
                                            ),
                                            child: Text(
                                              friendlyRideStatus(r.status),
                                              textAlign: TextAlign.end,
                                              style: const TextStyle(
                                                fontSize: 12,
                                                fontWeight: FontWeight.w700,
                                                color: GtColors.brand,
                                              ),
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                    if (r.isRoundTrip &&
                                        r.returnDatetimeLabel != null) ...[
                                      const SizedBox(height: 6),
                                      Text(
                                        'Return: ${r.returnDatetimeLabel}',
                                        style: const TextStyle(
                                          fontSize: 13,
                                          color: GtColors.textSecondary,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                    const SizedBox(height: 14),
                                    GtRouteRow(
                                      from: r.from,
                                      to: r.to,
                                      distance: r.distance,
                                      duration: r.duration,
                                    ),
                                    const SizedBox(height: 12),
                                    Row(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Expanded(
                                          child: Text(
                                            r.vehicleNeed,
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        const Icon(
                                          Icons.person_outline,
                                          size: 18,
                                          color: GtColors.brand,
                                        ),
                                        Text(' × ${r.passengers}'),
                                      ],
                                    ),
                                    if (r.offerPrice != null) ...[
                                      const SizedBox(height: 10),
                                      Text(
                                        '${r.currency} ${r.offerPrice!.toStringAsFixed(0)}',
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w800,
                                          color: GtColors.brand,
                                          fontSize: 18,
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                              const SizedBox(height: 16),
                              GtCard(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text(
                                      'Passenger',
                                      style: TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 15,
                                      ),
                                    ),
                                    const SizedBox(height: 10),
                                    if ((r.passengerName ?? '')
                                        .trim()
                                        .isNotEmpty) ...[
                                      Text(
                                        r.passengerName!.trim(),
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w800,
                                          fontSize: 17,
                                        ),
                                      ),
                                      const SizedBox(height: 10),
                                    ],
                                    Wrap(
                                      spacing: 8,
                                      runSpacing: 8,
                                      children: [
                                        _TripChip(
                                          label: 'Adults × ${r.passengers}',
                                        ),
                                        ..._childSeatChips(r),
                                        if ((r.flight ?? '')
                                            .trim()
                                            .isNotEmpty)
                                          _TripChip(
                                            label:
                                                'Flight ${r.flight!.trim()}',
                                            icon: Icons.flight,
                                          ),
                                        if ((r.returnFlight ?? '')
                                            .trim()
                                            .isNotEmpty)
                                          _TripChip(
                                            label:
                                                'Return flight ${r.returnFlight!.trim()}',
                                            icon: Icons.flight_land,
                                          ),
                                        if ((r.signage ?? '')
                                            .trim()
                                            .isNotEmpty)
                                          _TripChip(
                                            label:
                                                'Name sign: ${r.signage!.trim()}',
                                            icon: Icons.badge_outlined,
                                          ),
                                        if (r.flightWait != null)
                                          _TripChip(
                                            label:
                                                'Wait ${r.flightWait}',
                                            icon: Icons.schedule,
                                          )
                                        else if (r.pickupWaitMin != null)
                                          _TripChip(
                                            label:
                                                'Wait ${r.pickupWaitMin} min',
                                            icon: Icons.schedule,
                                          ),
                                        if (r.returnWaitMin != null)
                                          _TripChip(
                                            label:
                                                'Return wait ${r.returnWaitMin} min',
                                            icon: Icons.schedule,
                                          ),
                                        for (final o in r.requiredOptions)
                                          if (o != 'name_sign')
                                            _TripChip(
                                              label: o.replaceAll('_', ' '),
                                            ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 16),
                              const Text(
                                'Trip progress',
                                style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 15,
                                ),
                              ),
                              const SizedBox(height: 10),
                              GtCard(
                                child: _TripTimeline(
                                  currentIndex: _timelineIndex(_serverStatus),
                                ),
                              ),
                              if ((r.comment ?? '').trim().isNotEmpty) ...[
                                const SizedBox(height: 16),
                                GtCard(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      const Text(
                                        'Passenger note',
                                        style: TextStyle(
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      const SizedBox(height: 6),
                                      Text(
                                        r.comment!.trim(),
                                        style: const TextStyle(
                                          color: GtColors.textSecondary,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                        if (_isActiveTrip && _primaryLabel != null)
                          Container(
                            width: double.infinity,
                            padding: EdgeInsets.fromLTRB(
                              16,
                              12,
                              16,
                              12 + MediaQuery.paddingOf(context).bottom,
                            ),
                            decoration: const BoxDecoration(
                              color: Colors.white,
                              border: Border(top: BorderSide(color: GtColors.border)),
                            ),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: OutlinedButton.icon(
                                        onPressed: _openMaps,
                                        icon: const Icon(Icons.navigation_outlined),
                                        label: const Text('Navigate'),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: OutlinedButton.icon(
                                        onPressed: () =>
                                            context.push('/chat/${r.id}'),
                                        icon: const Icon(Icons.chat_outlined),
                                        label: const Text('Chat'),
                                      ),
                                    ),
                                  ],
                                ),
                                if (_contact?['canCall'] == true ||
                                    _contact?['canWhatsApp'] == true) ...[
                                  const SizedBox(height: 8),
                                  Row(
                                    children: [
                                      if (_contact?['canCall'] == true)
                                        Expanded(
                                          child: OutlinedButton.icon(
                                            onPressed: _callPassenger,
                                            icon: const Icon(Icons.phone_outlined),
                                            label: const Text('Call'),
                                          ),
                                        ),
                                      if (_contact?['canCall'] == true &&
                                          _contact?['canWhatsApp'] == true)
                                        const SizedBox(width: 8),
                                      if (_contact?['canWhatsApp'] == true)
                                        Expanded(
                                          child: OutlinedButton.icon(
                                            onPressed: _whatsAppPassenger,
                                            icon: const Icon(Icons.chat),
                                            label: const Text('WhatsApp'),
                                          ),
                                        ),
                                    ],
                                  ),
                                ],
                                const SizedBox(height: 10),
                                GtGreenButton(
                                  label: _acting ? 'Updating…' : _primaryLabel!,
                                  onPressed: _acting ? null : _primaryAction,
                                ),
                              ],
                            ),
                          )
                        else if (_serverStatus == 'COMPLETED')
                          Container(
                            width: double.infinity,
                            padding: EdgeInsets.fromLTRB(
                              16,
                              12,
                              16,
                              12 + MediaQuery.paddingOf(context).bottom,
                            ),
                            color: Colors.white,
                            child: const Text(
                              'Trip completed',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                color: GtColors.brand,
                              ),
                            ),
                          ),
                      ],
                    ),
    );
  }

  List<Widget> _childSeatChips(DriverRequest req) {
    final out = <Widget>[];
    final convertible = (req.childSeats['convertible'] as num?)?.toInt() ??
        (req.childSeats['child'] as num?)?.toInt() ??
        0;
    final infant = (req.childSeats['infant'] as num?)?.toInt() ?? 0;
    final booster = (req.childSeats['booster'] as num?)?.toInt() ?? 0;
    if (infant > 0) {
      out.add(_TripChip(label: 'Infant carrier × $infant'));
    }
    if (convertible > 0) {
      out.add(_TripChip(label: 'Convertible seat × $convertible'));
    }
    if (booster > 0) {
      out.add(_TripChip(label: 'Booster seat × $booster'));
    }
    return out;
  }
}

class _TripChip extends StatelessWidget {
  const _TripChip({required this.label, this.icon});

  final String label;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: GtColors.bgGrey,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: GtColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 14, color: GtColors.brand),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _TripTimeline extends StatelessWidget {
  const _TripTimeline({required this.currentIndex});

  final int currentIndex;

  static const _steps = [
    ('Confirmed', Icons.check_circle_outline),
    ('En route', Icons.directions_car_outlined),
    ('Arrived', Icons.place_outlined),
    ('On trip', Icons.route_outlined),
    ('Done', Icons.flag_outlined),
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(_steps.length, (i) {
        final (label, icon) = _steps[i];
        final done = i <= currentIndex;
        final active = i == currentIndex;
        final isLast = i == _steps.length - 1;
        return IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Column(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: done
                          ? (active ? GtColors.brand : GtColors.soft)
                          : GtColors.bgGrey,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: done ? GtColors.brand : GtColors.border,
                        width: active ? 2 : 1,
                      ),
                    ),
                    child: Icon(
                      icon,
                      size: 18,
                      color: done ? GtColors.brand : GtColors.textMuted,
                    ),
                  ),
                  if (!isLast)
                    Expanded(
                      child: Container(
                        width: 2,
                        margin: const EdgeInsets.symmetric(vertical: 4),
                        color: i < currentIndex ? GtColors.brand : GtColors.border,
                      ),
                    ),
                ],
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Padding(
                  padding: EdgeInsets.only(bottom: isLast ? 0 : 18, top: 6),
                  child: Text(
                    label,
                    style: TextStyle(
                      fontWeight: active ? FontWeight.w800 : FontWeight.w600,
                      color: done ? GtColors.text : GtColors.textMuted,
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      }),
    );
  }
}
