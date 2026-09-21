import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

class RideDetailScreen extends StatefulWidget {
  const RideDetailScreen({super.key, required this.rideId});

  final String rideId;

  @override
  State<RideDetailScreen> createState() => _RideDetailScreenState();
}

class _RideDetailScreenState extends State<RideDetailScreen> {
  bool _loading = true;
  Map<String, dynamic>? _paymentStatus;
  bool _ratingPromptShown = false;
  bool _alreadyRated = false;
  int? _myRatingStars;
  bool _actionBusy = false;
  Map<String, dynamic>? _tracking;
  Timer? _trackingPoll;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _trackingPoll?.cancel();
    super.dispose();
  }

  void _ensureTrackingPoll() {
    _trackingPoll?.cancel();
    if (!_isLiveTrackStatus(_serverStatus)) return;
    unawaited(_refreshTracking());
    _trackingPoll = Timer.periodic(const Duration(seconds: 5), (_) {
      if (mounted) unawaited(_refreshTracking());
    });
  }

  bool _isLiveTrackStatus(String status) {
    const live = {
      'DRIVER_EN_ROUTE',
      'DRIVER_ARRIVED',
      'TRIP_STARTED',
      'IN_PROGRESS',
    };
    return live.contains(status);
  }

  Future<void> _refreshTracking() async {
    try {
      final t = await context.read<AppState>().getRideTracking(widget.rideId);
      if (mounted) setState(() => _tracking = t);
    } catch (_) {}
  }

  Future<void> _load() async {
    final app = context.read<AppState>();
    await app.refreshRide(widget.rideId);
    Map<String, dynamic>? payment;
    Map<String, dynamic>? myRating;
    try {
      payment = await app.getPaymentStatus(widget.rideId);
    } catch (_) {}
    try {
      final status =
          (app.rideById(widget.rideId)?.serverStatus ?? '').toUpperCase();
      if (status == 'COMPLETED') {
        myRating = await app.myRideRating(widget.rideId);
      }
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _paymentStatus = payment;
      _loading = false;
      if (myRating != null) {
        _alreadyRated = true;
        final s = myRating['stars'];
        _myRatingStars = s is int ? s : int.tryParse('$s');
      }
    });
    _ensureTrackingPoll();
    _maybeShowRating();
  }


  void _maybeShowRating() {
    if (_ratingPromptShown || _alreadyRated || !mounted) return;
    final ride = context.read<AppState>().rideById(widget.rideId);
    if ((ride?.serverStatus ?? '').toUpperCase() != 'COMPLETED') return;
    _ratingPromptShown = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && !_alreadyRated) _showRatingSheet();
    });
  }

  String get _serverStatus {
    final ride = context.read<AppState>().rideById(widget.rideId);
    return (ride?.serverStatus ?? '').toUpperCase();
  }

  bool get _canChat {
    const allowed = {
      'BOOKED',
      'DRIVER_EN_ROUTE',
      'DRIVER_ARRIVED',
      'TRIP_STARTED',
      'IN_PROGRESS',
    };
    return allowed.contains(_serverStatus);
  }

  bool get _canCancel {
    const allowed = {
      'BOOKED',
      'DRIVER_EN_ROUTE',
      'DRIVER_ARRIVED',
      'WAITING_FOR_OFFERS',
      'OFFER_SELECTION',
      'PAYMENT_PENDING',
    };
    return allowed.contains(_serverStatus);
  }

  bool get _canEdit {
    return _serverStatus == 'WAITING_FOR_OFFERS' ||
        _serverStatus == 'OFFER_SELECTION';
  }

  bool get _isOngoing {
    const ongoing = {
      'DRIVER_EN_ROUTE',
      'DRIVER_ARRIVED',
      'TRIP_STARTED',
      'IN_PROGRESS',
    };
    return ongoing.contains(_serverStatus);
  }

  Future<void> _confirmCancel() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel ride?'),
        content: const Text(
          'Are you sure you want to cancel this ride? Cancellation fees may apply.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep ride'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Cancel ride'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _actionBusy = true);
    try {
      await context.read<AppState>().cancelRide(widget.rideId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Ride cancelled')),
        );
        await _load();
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not cancel ride')),
        );
      }
    } finally {
      if (mounted) setState(() => _actionBusy = false);
    }
  }

  Future<void> _showRatingSheet() async {
    if (_alreadyRated) return;
    var overall = 5;
    var communication = 5;
    var driver = 5;
    var vehicle = 5;
    final commentCtrl = TextEditingController();
    final selectedSuggestions = <String>{};
    final submitted = await showGtSheet<bool>(
      context: context,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          12,
          20,
          20 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: StatefulBuilder(
          builder: (ctx, setLocal) {
            Widget starRow({
              required String label,
              required int value,
              required ValueChanged<int> onChanged,
              double iconSize = 28,
            }) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
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
                    ...List.generate(5, (i) {
                      final filled = i < value;
                      return IconButton(
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(
                          minWidth: 36,
                          minHeight: 36,
                        ),
                        icon: Icon(
                          filled ? Icons.star : Icons.star_border,
                          color: GtColors.warn,
                          size: iconSize,
                        ),
                        onPressed: () => onChanged(i + 1),
                      );
                    }),
                  ],
                ),
              );
            }

            return SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: GtColors.border,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Rate your trip',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Help others by rating communication, driver, and vehicle.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: GtColors.textSecondary,
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Overall',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(5, (i) {
                      final filled = i < overall;
                      return IconButton(
                        icon: Icon(
                          filled ? Icons.star : Icons.star_border,
                          color: GtColors.warn,
                          size: 36,
                        ),
                        onPressed: () => setLocal(() {
                          final newOverall = i + 1;
                          if (overall != newOverall) {
                            overall = newOverall;
                            selectedSuggestions.clear();
                            commentCtrl.clear();
                          }
                        }),
                      );
                    }),
                  ),
                  const Divider(height: 24),
                  starRow(
                    label: 'Communication',
                    value: communication,
                    onChanged: (v) => setLocal(() => communication = v),
                  ),
                  starRow(
                    label: 'Driver',
                    value: driver,
                    onChanged: (v) => setLocal(() => driver = v),
                  ),
                  starRow(
                    label: 'Vehicle',
                    value: vehicle,
                    onChanged: (v) => setLocal(() => vehicle = v),
                  ),
                  const SizedBox(height: 12),
                  GtReviewSuggestions(
                    target: ReviewTarget.driver,
                    stars: overall,
                    selectedSuggestions: selectedSuggestions,
                    onToggle: (s) => setLocal(() {
                      if (selectedSuggestions.contains(s)) {
                        selectedSuggestions.remove(s);
                      } else {
                        selectedSuggestions.add(s);
                      }
                      commentCtrl.text = selectedSuggestions.join(', ');
                    }),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: commentCtrl,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      hintText: 'How was your experience? (optional)',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  GtGreenButton(
                    label: 'Submit rating',
                    onPressed: () => Navigator.pop(ctx, true),
                  ),
                  TextButton(
                    onPressed: () => Navigator.pop(ctx, false),
                    child: const Text('Later'),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
    final rawText = commentCtrl.text.trim();
    final commentText = rawText.isNotEmpty
        ? rawText
        : (selectedSuggestions.isNotEmpty
            ? selectedSuggestions.join(', ')
            : null);
    commentCtrl.dispose();
    if (submitted != true || !mounted) return;
    try {
      await context.read<AppState>().rateRide(
            widget.rideId,
            stars: overall,
            communicationStars: communication,
            driverStars: driver,
            vehicleStars: vehicle,
            comment: commentText,
          );

      if (mounted) {
        setState(() {
          _alreadyRated = true;
          _myRatingStars = overall;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Thanks for your feedback')),
        );
      }
    } catch (e) {
      if (!mounted) return;
      final msg = e.toString().toLowerCase();
      if (msg.contains('already rated')) {
        setState(() {
          _alreadyRated = true;
          _myRatingStars ??= overall;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('You already rated this ride')),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not submit rating')),
        );
      }
    }
  }

  Future<void> _submitChangeRequest({
    required String type,
    String? proposedPickupAt,
    String? note,
    String? flightNumber,
    String? contactPhone,
  }) async {
    setState(() => _actionBusy = true);
    try {
      await context.read<AppState>().createChangeRequest(
            widget.rideId,
            type: type,
            proposedPickupAt: proposedPickupAt,
            note: note,
            flightNumber: flightNumber,
            contactPhone: contactPhone,
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              type == 'LOST_ITEM'
                  ? 'Driver notified to check vehicle for lost items'
                  : 'Request submitted',
            ),
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not submit request')),
        );
      }
    } finally {
      if (mounted) setState(() => _actionBusy = false);
    }
  }

  Future<void> _showFlightDelayForm() async {
    final flightCtrl = TextEditingController();
    final noteCtrl = TextEditingController();
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(ctx).viewInsets.bottom,
          left: 20,
          right: 20,
          top: 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Report flight delay',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: flightCtrl,
              decoration: const InputDecoration(
                labelText: 'Flight number',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: noteCtrl,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Details (optional)',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            GtGreenButton(
              label: 'Submit',
              onPressed: () => Navigator.pop(ctx, true),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
    if (ok == true) {
      await _submitChangeRequest(
        type: 'FLIGHT_DELAY',
        flightNumber: flightCtrl.text.trim().isEmpty
            ? null
            : flightCtrl.text.trim(),
        note: noteCtrl.text.trim().isEmpty ? null : noteCtrl.text.trim(),
      );
    }
    flightCtrl.dispose();
    noteCtrl.dispose();
  }

  Future<void> _showRescheduleForm() async {
    DateTime picked = DateTime.now().add(const Duration(hours: 2));
    final noteCtrl = TextEditingController();
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(ctx).viewInsets.bottom,
            left: 20,
            right: 20,
            top: 20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Request reschedule',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(_formatPickup(picked)),
                trailing: const Icon(Icons.calendar_today),
                onTap: () async {
                  final date = await showDatePicker(
                    context: ctx,
                    initialDate: picked,
                    firstDate: DateTime.now(),
                    lastDate: DateTime.now().add(const Duration(days: 365)),
                  );
                  if (date == null) return;
                  if (!ctx.mounted) return;
                  final time = await showTimePicker(
                    context: ctx,
                    initialTime: TimeOfDay.fromDateTime(picked),
                  );
                  if (time == null) return;
                  setLocal(() {
                    picked = DateTime(
                      date.year,
                      date.month,
                      date.day,
                      time.hour,
                      time.minute,
                    );
                  });
                },
              ),
              const SizedBox(height: 8),
              TextField(
                controller: noteCtrl,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Note (optional)',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              GtGreenButton(
                label: 'Submit',
                onPressed: () => Navigator.pop(ctx, true),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
    if (ok == true) {
      await _submitChangeRequest(
        type: 'RESCHEDULE',
        proposedPickupAt: picked.toUtc().toIso8601String(),
        note: noteCtrl.text.trim().isEmpty ? null : noteCtrl.text.trim(),
      );
    }
    noteCtrl.dispose();
  }

  Future<void> _showHelpForm(String type, String title) async {
    final noteCtrl = TextEditingController();
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(ctx).viewInsets.bottom,
          left: 20,
          right: 20,
          top: 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              title,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: noteCtrl,
              maxLines: 4,
              decoration: const InputDecoration(
                hintText: 'Describe the issue',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            GtGreenButton(
              label: 'Submit',
              onPressed: () => Navigator.pop(ctx, true),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
    if (ok == true) {
      await _submitChangeRequest(
        type: type,
        note: noteCtrl.text.trim().isEmpty ? null : noteCtrl.text.trim(),
      );
    }
    noteCtrl.dispose();
  }

  Future<void> _showLostItemSheet() async {
    final app = context.read<AppState>();
    final phoneCtrl = TextEditingController(text: app.repo.passenger.phone);
    final noteCtrl = TextEditingController();

    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(ctx).viewInsets.bottom,
          left: 20,
          right: 20,
          top: 20,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: const [
                  Icon(Icons.search, color: GtColors.brand, size: 24),
                  SizedBox(width: 8),
                  Text(
                    'Find lost item',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFF0FDF4),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xFFBBF7D0)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: const [
                    Icon(Icons.lock_outline, color: Color(0xFF16A34A), size: 20),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'To protect your privacy, you don\'t need to describe personal items. We will notify your driver to inspect their vehicle and reach out to you if anything was left behind.',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: Color(0xFF166534),
                          height: 1.35,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: phoneCtrl,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'Contact phone number',
                  prefixIcon: Icon(Icons.phone_outlined),
                  helperText: 'Your driver or support will use this to reach you',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: noteCtrl,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: 'Location in vehicle (optional)',
                  hintText: 'e.g. Back seat, trunk, door pocket',
                  helperText: 'Do not name personal items to protect privacy',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              GtGreenButton(
                label: 'Notify driver',
                onPressed: () {
                  final phone = phoneCtrl.text.trim();
                  if (phone.isEmpty) {
                    ScaffoldMessenger.of(ctx).showSnackBar(
                      const SnackBar(
                        content: Text('Please enter a contact phone number'),
                      ),
                    );
                    return;
                  }
                  Navigator.pop(ctx, true);
                },
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );

    if (ok == true) {
      await _submitChangeRequest(
        type: 'LOST_ITEM',
        contactPhone: phoneCtrl.text.trim(),
        note: noteCtrl.text.trim().isEmpty ? null : noteCtrl.text.trim(),
      );
      if (mounted) {
        await app.refreshRide(widget.rideId);
        setState(() {});
      }
    }
    phoneCtrl.dispose();
    noteCtrl.dispose();
  }

  double _num(dynamic v) => (v is num) ? v.toDouble() : 0;

  Color _bannerColor(String status) {
    switch (status) {
      case 'DRIVER_EN_ROUTE':
      case 'DRIVER_ARRIVED':
        return GtColors.green;
      case 'TRIP_STARTED':
      case 'IN_PROGRESS':
        return GtColors.greenDark;
      case 'COMPLETED':
        return GtColors.textSecondary;
      case 'PASSENGER_CANCELLED':
      case 'DRIVER_CANCELLED':
      case 'ADMIN_CANCELLED':
        return GtColors.brand;
      default:
        return GtColors.brand;
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final ride = app.rideById(widget.rideId);
    final offerId = ride?.selectedOfferId;
    final offer =
        offerId != null ? app.offerByIds(widget.rideId, offerId) : null;
    final status = (ride?.serverStatus ?? '').toUpperCase();
    final isCompleted =
        status == 'COMPLETED' || ride?.status == RideStatus.past;
    final statusLabel = friendlyRideStatus(ride?.serverStatus);

    final currency = _paymentStatus?['onlineCurrency']?.toString() ??
        _paymentStatus?['totalCurrency']?.toString() ??
        offer?.currency ??
        ride?.currency ??
        'CAD';
    final total = _num(
      _paymentStatus?['totalAmount'] ?? offer?.price,
    );
    final breakdown = offer?.priceBreakdown;
    final breakdownPayment = _paymentStatus?['priceBreakdown'];
    final rideFare = breakdown != null && breakdown.ridePrice > 0
        ? breakdown.ridePrice
        : (breakdownPayment is Map && _num(breakdownPayment['ridePrice']) > 0
            ? _num(breakdownPayment['ridePrice'])
            : (total > 0 ? (((total / 1.2) * 100).roundToDouble() / 100.0) : 0.0));
    final platformFee = breakdown != null && breakdown.platformFee > 0
        ? breakdown.platformFee
        : (breakdownPayment is Map && _num(breakdownPayment['platformFee']) > 0
            ? _num(breakdownPayment['platformFee'])
            : (((rideFare * 0.2) * 100).roundToDouble() / 100.0));

    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      appBar: AppBar(
        title: Text(ride != null ? 'Ride #${ride.displayId}' : 'Ride'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
      ),
      body: _loading
          ? const Center(
              child: CircularProgressIndicator(color: GtColors.brand),
            )
          : ride == null
              ? const Center(child: Text('Ride not found'))
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                      decoration: BoxDecoration(
                        color: _bannerColor(status),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        statusLabel,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                        ),
                      ),
                    ),
                    if (_isLiveTrackStatus(status)) ...[
                      const SizedBox(height: 12),
                      _Section(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                const Text(
                                  'Live tracking',
                                  style: TextStyle(fontWeight: FontWeight.w800),
                                ),
                                const Spacer(),
                                if (_tracking?['eta'] is Map)
                                  Text(
                                    'ETA ~${(_tracking!['eta'] as Map)['minutes']} min',
                                    style: const TextStyle(
                                      color: GtColors.brand,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Builder(
                              builder: (_) {
                                final live = _tracking?['live'];
                                final pickup = _tracking?['pickup'];
                                final dropoff = _tracking?['dropoff'];
                                final eta = _tracking?['eta'];
                                if (live is! Map || pickup is! Map) {
                                  return const Text(
                                    'Waiting for driver location…',
                                    style: TextStyle(
                                      color: GtColors.textSecondary,
                                    ),
                                  );
                                }
                                final toDrop =
                                    eta is Map &&
                                    eta['target']?.toString() == 'DROPOFF' &&
                                    dropoff is Map;
                                final toLat = toDrop
                                    ? (dropoff['lat'] as num?)?.toDouble()
                                    : (pickup['lat'] as num?)?.toDouble();
                                final toLng = toDrop
                                    ? (dropoff['lng'] as num?)?.toDouble()
                                    : (pickup['lng'] as num?)?.toDouble();
                                return GtGoogleRouteMap(
                                  fromLat:
                                      (live['lat'] as num).toDouble(),
                                  fromLng:
                                      (live['lng'] as num).toDouble(),
                                  fromLabel: 'Driver',
                                  toLat: toLat,
                                  toLng: toLng,
                                  toLabel: toDrop ? 'Dropoff' : 'Pickup',
                                  distanceLabel: eta is Map
                                      ? '${eta['distanceKm']} km'
                                      : null,
                                  height: 200,
                                );
                              },
                            ),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    _Section(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          GtRouteRow(
                            from: ride.from,
                            to: ride.to ?? '',
                            distance: ride.distance,
                            duration: ride.duration,
                            timeBadge: ride.timeBadge,
                          ),
                          if (ride.returnLabel != null) ...[
                            const SizedBox(height: 12),
                            Text(
                              'Return: ${ride.returnLabel}',
                              style: const TextStyle(
                                color: GtColors.textSecondary,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                          const SizedBox(height: 8),
                          Text(
                            ride.datetimeLabel,
                            style: const TextStyle(
                              color: GtColors.textMuted,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (offer != null) ...[
                      const SizedBox(height: 12),
                      _Section(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Your driver',
                              style: TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 15,
                              ),
                            ),
                            const SizedBox(height: 12),
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if (offer.imageUrl != null)
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(10),
                                    child: AuthNetworkImage(
                                      url: offer.imageUrl!,
                                      width: 72,
                                      height: 72,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, __, ___) =>
                                          const Icon(
                                        Icons.directions_car,
                                        size: 48,
                                        color: GtColors.textMuted,
                                      ),
                                    ),
                                  )
                                else
                                  Container(
                                    width: 72,
                                    height: 72,
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                      color: GtColors.bgGrey,
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: const Icon(
                                      Icons.directions_car,
                                      size: 40,
                                      color: GtColors.textMuted,
                                    ),
                                  ),
                                const SizedBox(width: 14),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      if (!isCompleted &&
                                          (offer.driverName ?? '')
                                              .trim()
                                              .isNotEmpty)
                                        Text(
                                          offer.driverName!.trim(),
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w800,
                                            fontSize: 17,
                                          ),
                                        )
                                      else
                                        Text(
                                          offer.displayName,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w800,
                                            fontSize: 17,
                                          ),
                                        ),
                                      const SizedBox(height: 4),
                                      Row(
                                        children: [
                                          const Icon(
                                            Icons.star,
                                            size: 16,
                                            color: GtColors.warn,
                                          ),
                                          Text(
                                            ' ${offer.rating.toStringAsFixed(1)}'
                                            '${offer.ratingCount > 0 ? ' (${offer.ratingCount})' : ''}',
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                        ],
                                      ),
                                      if (!isCompleted &&
                                          (offer.driverName ?? '')
                                              .trim()
                                              .isNotEmpty) ...[
                                        const SizedBox(height: 6),
                                        Text(
                                          offer.displayName,
                                          style: const TextStyle(
                                            color: GtColors.textSecondary,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ],
                                      Text(
                                        [
                                          offer.vehicleClass,
                                          if ((offer.color ?? '')
                                              .trim()
                                              .isNotEmpty)
                                            offer.color!.trim(),
                                        ].join(' · '),
                                        style: const TextStyle(
                                          color: GtColors.textSecondary,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                            if (offer.plate != null &&
                                offer.plate!.trim().isNotEmpty) ...[
                              const SizedBox(height: 14),
                              Container(
                                width: double.infinity,
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                  vertical: 12,
                                ),
                                decoration: BoxDecoration(
                                  color: GtColors.bgGrey,
                                  borderRadius: BorderRadius.circular(10),
                                  border:
                                      Border.all(color: GtColors.border),
                                ),
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    const Text(
                                      'License plate',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: GtColors.textMuted,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      offer.plate!.trim().toUpperCase(),
                                      style: const TextStyle(
                                        fontSize: 20,
                                        fontWeight: FontWeight.w900,
                                        letterSpacing: 1.2,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                            if (offer.languages.isNotEmpty) ...[
                              const SizedBox(height: 12),
                              Text(
                                'Languages: ${offer.languages.join(', ')}',
                                style: const TextStyle(
                                  color: GtColors.textSecondary,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                            const SizedBox(height: 12),
                            Text(
                              formatMoney(offer.price, offer.currency),
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 18,
                                color: GtColors.brand,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    if (status == 'COMPLETED' && total > 0) ...[
                      const SizedBox(height: 12),
                      _Section(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Payment summary',
                              style: TextStyle(fontWeight: FontWeight.w800),
                            ),
                            const SizedBox(height: 8),
                            if (rideFare > 0 && platformFee > 0) ...[
                              _row('Ride fare', formatMoney(rideFare, currency)),
                              _row('Platform fee', formatMoney(platformFee, currency)),
                            ],
                            _row('Total paid', formatMoney(total, currency)),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 20),
                    if (_canChat) ...[
                      GtGreenButton(
                        label: 'Chat with driver',
                        fullWidth: true,
                        onPressed: _actionBusy
                            ? null
                            : () => context.push(
                                  '/ride/${widget.rideId}/chat',
                                ),
                      ),
                    ],
                    if (_canEdit) ...[
                      const SizedBox(height: 10),
                      OutlinedButton(
                        onPressed: _actionBusy
                            ? null
                            : () => context.push('/edit-ride/${widget.rideId}'),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(double.infinity, 48),
                        ),
                        child: const Text('Edit ride'),
                      ),
                    ],
                    if (_canCancel) ...[
                      const SizedBox(height: 10),
                      OutlinedButton(
                        onPressed: _actionBusy ? null : _confirmCancel,
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(double.infinity, 48),
                          side: const BorderSide(color: GtColors.brand),
                        ),
                        child: const Text('Cancel ride'),
                      ),
                    ],
                    if (_isOngoing) ...[
                      const SizedBox(height: 10),
                      OutlinedButton(
                        onPressed: _actionBusy
                            ? null
                            : () => _showHelpForm(
                                  'CURRENT_RIDE_HELP',
                                  'Help with this ride',
                                ),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(double.infinity, 48),
                        ),
                        child: const Text('Help with this ride'),
                      ),
                    ],
                    if (status == 'COMPLETED') ...[
                      const SizedBox(height: 10),
                      if (ride?.hasLostItemRequest == true)
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: const Color(0xFFEFF6FF),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: const Color(0xFFBFDBFE)),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.search,
                                  color: Color(0xFF1D4ED8), size: 22),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: const [
                                    Text(
                                      'Lost item inquiry active',
                                      style: TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 13,
                                        color: Color(0xFF1E3A8A),
                                      ),
                                    ),
                                    SizedBox(height: 2),
                                    Text(
                                      'The driver has been notified to check their vehicle. We will contact you if an item is found.',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: Color(0xFF1E40AF),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        )
                      else
                        OutlinedButton.icon(
                          onPressed: _actionBusy ? null : _showLostItemSheet,
                          icon: const Icon(Icons.search, size: 18),
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size(double.infinity, 48),
                          ),
                          label: const Text('Find lost item'),
                        ),
                      const SizedBox(height: 10),
                      OutlinedButton(
                        onPressed: _actionBusy
                            ? null
                            : () => _showHelpForm(
                                  'BILLING_HELP',
                                  'Help with billing',
                                ),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(double.infinity, 48),
                        ),
                        child: const Text('Help with billing'),
                      ),
                      const SizedBox(height: 10),
                      OutlinedButton(
                        onPressed: _actionBusy
                            ? null
                            : () => _showHelpForm(
                                  'REFUND_REQUEST',
                                  'Request refund',
                                ),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(double.infinity, 48),
                        ),
                        child: const Text('Request refund'),
                      ),
                      const SizedBox(height: 10),
                      if (_alreadyRated)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Text(
                            _myRatingStars != null
                                ? 'You rated ★$_myRatingStars'
                                : 'You already rated this ride',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              color: GtColors.brand,
                            ),
                          ),
                        )
                      else
                        TextButton(
                          onPressed: _showRatingSheet,
                          child: const Text('Rate this ride'),
                        ),
                    ],
                    if (status == 'BOOKED' ||
                        status == 'DRIVER_EN_ROUTE' ||
                        status == 'DRIVER_ARRIVED') ...[
                      const SizedBox(height: 10),
                      OutlinedButton(
                        onPressed:
                            _actionBusy ? null : _showFlightDelayForm,
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(double.infinity, 48),
                        ),
                        child: const Text('Report flight delay'),
                      ),
                      const SizedBox(height: 10),
                      OutlinedButton(
                        onPressed: _actionBusy ? null : _showRescheduleForm,
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(double.infinity, 48),
                        ),
                        child: const Text('Request reschedule'),
                      ),
                    ],
                    const SizedBox(height: 24),
                  ],
                ),
    );
  }

  String _formatPickup(DateTime d) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec',
    ];
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    final day = days[d.weekday - 1];
    final hour = d.hour % 12 == 0 ? 12 : d.hour % 12;
    final ampm = d.hour >= 12 ? 'PM' : 'AM';
    final min = d.minute.toString().padLeft(2, '0');
    return '$day ${d.day} ${months[d.month - 1]}, $hour:$min $ampm';
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(color: GtColors.textSecondary),
          ),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: GtColors.border),
      ),
      child: child,
    );
  }
}
