import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_api/gt_api.dart';
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
  bool _actionBusy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final app = context.read<AppState>();
    await app.refreshRide(widget.rideId);
    Map<String, dynamic>? payment;
    try {
      payment = await app.getPaymentStatus(widget.rideId);
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _paymentStatus = payment;
      _loading = false;
    });
    _maybeShowRating();
  }

  void _maybeShowRating() {
    if (_ratingPromptShown || !mounted) return;
    final ride = context.read<AppState>().rideById(widget.rideId);
    if ((ride?.serverStatus ?? '').toUpperCase() != 'COMPLETED') return;
    _ratingPromptShown = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _showRatingDialog();
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
      'COMPLETED',
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

  Future<void> _showRatingDialog() async {
    var stars = 5;
    final commentCtrl = TextEditingController();
    final submitted = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('Rate your ride'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(5, (i) {
                  final filled = i < stars;
                  return IconButton(
                    icon: Icon(
                      filled ? Icons.star : Icons.star_border,
                      color: GtColors.warn,
                      size: 32,
                    ),
                    onPressed: () => setLocal(() => stars = i + 1),
                  );
                }),
              ),
              TextField(
                controller: commentCtrl,
                maxLines: 3,
                decoration: const InputDecoration(
                  hintText: 'Optional comment',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Later'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Submit'),
            ),
          ],
        ),
      ),
    );
    final commentText = commentCtrl.text.trim();
    commentCtrl.dispose();
    if (submitted != true || !mounted) return;
    try {
      await context.read<AppState>().rateRide(
            widget.rideId,
            stars: stars,
            comment: commentText.isEmpty ? null : commentText,
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Thanks for your feedback')),
        );
      }
    } catch (_) {
      // Already rated or network error — non-blocking.
    }
  }

  Future<void> _submitChangeRequest({
    required String type,
    String? proposedPickupAt,
    String? note,
    String? flightNumber,
  }) async {
    setState(() => _actionBusy = true);
    try {
      await context.read<AppState>().createChangeRequest(
            widget.rideId,
            type: type,
            proposedPickupAt: proposedPickupAt,
            note: note,
            flightNumber: flightNumber,
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Request submitted')),
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
    final statusLabel = friendlyRideStatus(ride?.serverStatus);

    final currency = _paymentStatus?['onlineCurrency']?.toString() ??
        _paymentStatus?['totalCurrency']?.toString() ??
        offer?.currency ??
        ride?.currency ??
        'USD';
    final total = _num(
      _paymentStatus?['totalAmount'] ?? offer?.price,
    );

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
                        child: Row(
                          children: [
                            if (offer.imageUrl != null)
                              ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: Image.network(
                                  offer.imageUrl!,
                                  width: 56,
                                  height: 56,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => const Icon(
                                    Icons.directions_car,
                                    size: 40,
                                    color: GtColors.textMuted,
                                  ),
                                ),
                              )
                            else
                              const Icon(
                                Icons.directions_car,
                                size: 40,
                                color: GtColors.textMuted,
                              ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    '${offer.vehicleBrand} ${offer.vehicleModel}'
                                        .trim(),
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  Text(
                                    offer.vehicleClass,
                                    style: const TextStyle(
                                      color: GtColors.textSecondary,
                                    ),
                                  ),
                                  if (offer.plate != null &&
                                      offer.plate!.isNotEmpty)
                                    Text(
                                      offer.plate!,
                                      style: const TextStyle(
                                        color: GtColors.textMuted,
                                        fontSize: 12,
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  formatMoney(offer.price, offer.currency),
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(
                                      Icons.star,
                                      size: 14,
                                      color: GtColors.warn,
                                    ),
                                    Text(' ${offer.rating.toStringAsFixed(1)}'),
                                  ],
                                ),
                              ],
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
                            _row('Total paid', formatMoney(total, currency)),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 20),
                    if (_canChat)
                      GtGreenButton(
                        label: 'Chat with driver',
                        fullWidth: true,
                        onPressed: _actionBusy
                            ? null
                            : () => context.push(
                                  '/ride/${widget.rideId}/chat',
                                ),
                      ),
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
                      TextButton(
                        onPressed: _showRatingDialog,
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
