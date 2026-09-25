import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

class BookingConfirmedScreen extends StatefulWidget {
  const BookingConfirmedScreen({super.key, required this.rideId});

  final String rideId;

  @override
  State<BookingConfirmedScreen> createState() => _BookingConfirmedScreenState();
}

class _BookingConfirmedScreenState extends State<BookingConfirmedScreen> {
  Map<String, dynamic>? _paymentStatus;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final app = context.read<AppState>();
    try {
      await app.refreshRide(widget.rideId);
    } catch (_) {}
    Map<String, dynamic>? status;
    try {
      status = await app.getPaymentStatus(widget.rideId);
    } catch (_) {
      status = app.lastPaymentResult;
    }
    if (!mounted) return;
    setState(() {
      _paymentStatus = status ?? app.lastPaymentQuote;
      _loading = false;
    });
  }

  double _num(dynamic v) => (v is num) ? v.toDouble() : 0;

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final ride = app.rideById(widget.rideId);
    final offerId = ride?.selectedOfferId;
    final offer =
        offerId != null ? app.offerByIds(widget.rideId, offerId) : null;
    final quote = app.lastPaymentQuote ?? _paymentStatus;
    final result = app.lastPaymentResult ?? _paymentStatus;

    final currency = quote?['onlineCurrency']?.toString() ??
        quote?['totalCurrency']?.toString() ??
        offer?.currency ??
        'CAD';
    final total = _num(quote?['totalAmount'] ?? result?['totalAmount'] ?? offer?.price);
    final online = _num(quote?['onlineAmount'] ?? result?['onlineAmount']);
    final cash = _num(quote?['cashAmount'] ?? result?['cashAmount']);
    final payStatus = result?['status']?.toString() ??
        result?['paymentStatus']?.toString() ??
        'PAID';

    final breakdown = offer?.priceBreakdown;
    final breakdownQuote = quote?['priceBreakdown'] ?? result?['priceBreakdown'];
    final rideFare = breakdown != null && breakdown.ridePrice > 0
        ? breakdown.ridePrice
        : (breakdownQuote is Map && _num(breakdownQuote['ridePrice']) > 0
            ? _num(breakdownQuote['ridePrice'])
            : (total > 0 ? (((total / 1.2) * 100).roundToDouble() / 100.0) : 0.0));
    final platformFee = breakdown != null && breakdown.platformFee > 0
        ? breakdown.platformFee
        : (breakdownQuote is Map && _num(breakdownQuote['platformFee']) > 0
            ? _num(breakdownQuote['platformFee'])
            : (((rideFare * 0.2) * 100).roundToDouble() / 100.0));

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        app.clearPendingDeepLink();
        app.setShellTab(1);
        while (Navigator.of(context, rootNavigator: true).canPop()) {
          Navigator.of(context, rootNavigator: true).pop();
        }
        GoRouter.of(context).go('/');
      },
      child: Scaffold(
        backgroundColor: GtColors.bgGrey,
        appBar: AppBar(
          title: const Text('Booking confirmed'),
          automaticallyImplyLeading: false,
        ),
        body: _loading
            ? const Center(
                child: CircularProgressIndicator(color: GtColors.brand),
              )
            : ListView(
                padding: EdgeInsets.fromLTRB(
                  24,
                  24,
                  24,
                  MediaQuery.paddingOf(context).bottom + 24,
                ),
                children: [
                  const SizedBox(height: 12),
                  Center(
                    child: Container(
                      width: 72,
                      height: 72,
                      decoration: const BoxDecoration(
                        color: GtColors.green,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.check,
                        color: Colors.white,
                        size: 40,
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  const Text(
                    'You\'re booked',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    ride != null
                        ? 'Booking #${ride.displayId}'
                        : 'Booking #${widget.rideId}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: GtColors.textSecondary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 24),
                  GtCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (ride != null) ...[
                          GtRouteRow(
                            from: ride.from,
                            to: ride.to,
                            distance: ride.distance,
                            duration: ride.duration,
                            timeBadge: ride.timeBadge,
                            isRoundTrip: ride.hasReturnTrip,
                            returnLabel: ride.returnLabel,
                          ),
                          const SizedBox(height: 12),
                          _row('Pickup', ride.datetimeLabel),
                          if (ride.hasReturnTrip)
                            _row(
                              'Return',
                              ride.returnLabel != null &&
                                      ride.returnLabel!.isNotEmpty
                                  ? ride.returnLabel!
                                  : 'Return trip (Round trip)',
                            ),
                        ],
                        if (offer != null) ...[
                          const Divider(height: 24),
                          if ((offer.driverName ?? '').trim().isNotEmpty)
                            _row('Driver', offer.driverName!.trim()),
                          _row('Vehicle', offer.displayName),
                          _row('Class', offer.vehicleClass),
                          if (offer.plate != null &&
                              offer.plate!.trim().isNotEmpty)
                            _row('Plate', offer.plate!.trim().toUpperCase()),
                        ],
                        const Divider(height: 24),
                        _row('Payment', payStatus),
                        if (rideFare > 0 && platformFee > 0) ...[
                          _row('Ride fare', formatMoney(rideFare, currency)),
                          _row('Platform fee', formatMoney(platformFee, currency)),
                        ],
                        _row('Total', formatMoney(total, currency)),
                        if (online > 0)
                          _row('Paid online', formatMoney(online, currency)),
                        if (cash > 0)
                          _row(
                            'Cash due to driver',
                            formatMoney(cash, currency),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  GtGreenButton(
                    label: 'View ride',
                    onPressed: () {
                      app.clearPendingDeepLink();
                      while (Navigator.of(context, rootNavigator: true).canPop()) {
                        Navigator.of(context, rootNavigator: true).pop();
                      }
                      GoRouter.of(context).go('/ride/${widget.rideId}');
                    },
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton(
                    onPressed: () {
                      app.clearPendingDeepLink();
                      app.setShellTab(2);
                      while (Navigator.of(context, rootNavigator: true).canPop()) {
                        Navigator.of(context, rootNavigator: true).pop();
                      }
                      GoRouter.of(context).go('/');
                    },
                    style: OutlinedButton.styleFrom(
                      foregroundColor: GtColors.brand,
                      side: const BorderSide(color: GtColors.brand),
                      minimumSize: const Size.fromHeight(48),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: const Text(
                      'Contact support',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: const TextStyle(color: GtColors.textSecondary),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}
