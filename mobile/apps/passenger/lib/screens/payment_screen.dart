import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/services/stripe_payment_service.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

class PaymentScreen extends StatefulWidget {
  const PaymentScreen({
    super.key,
    required this.rideId,
    required this.offerId,
  });

  final String rideId;
  final String offerId;

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  bool _loadingQuote = true;
  bool _paying = false;
  bool _termsAccepted = false;
  String _paymentMode = 'FULL';
  /// Backend label only — Stripe PaymentSheet chooses card / wallets.
  static const String _paymentMethod = 'CARD';
  String? _error;
  Map<String, dynamic>? _quote;
  String? _idempotencyKey;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final app = context.read<AppState>();
      app.clearPendingOfferAlert();
      app.clearPendingRideStatusAlert();
      ScaffoldMessenger.maybeOf(context)?.clearSnackBars();
      _loadQuote();
    });
  }

  Future<void> _loadQuote({String? mode}) async {
    setState(() {
      _loadingQuote = true;
      _error = null;
    });
    final app = context.read<AppState>();
    final currentRide = await app.refreshRide(widget.rideId);
    if (!mounted) return;
    if (currentRide != null && currentRide.isBooked) {
      context.go('/ride/${widget.rideId}');
      return;
    }
    try {
      try {
        await app.validateBook(widget.rideId, widget.offerId);
      } catch (_) {
        // Already PAYMENT_PENDING / recovering — quote endpoint still works.
      }
      final quote = await app.getPaymentQuote(
        widget.rideId,
        widget.offerId,
        paymentMode: mode ?? _paymentMode,
        platform: kIsWeb ? 'web' : defaultTargetPlatform.name,
      );
      if (!mounted) return;
      setState(() {
        _quote = quote;
        _paymentMode = quote['paymentMode']?.toString() ?? _paymentMode;
        _loadingQuote = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loadingQuote = false;
      });
    }
  }

  bool get _partialEnabled {
    final q = _quote;
    if (q == null) return false;
    return q['partialEnabled'] == true;
  }

  double _num(dynamic v) => (v is num) ? v.toDouble() : 0;

  String _currency(Map<String, dynamic> q, String key, [String fallback = 'CAD']) {
    return q[key]?.toString() ??
        q['totalCurrency']?.toString() ??
        q['currency']?.toString() ??
        fallback;
  }

  Future<void> _setMode(String mode) async {
    if (_paying || mode == _paymentMode) return;
    setState(() => _paymentMode = mode);
    await _loadQuote(mode: mode);
  }

  Future<void> _pay() async {
    if (_paying || !_termsAccepted || _quote == null) return;
    setState(() {
      _paying = true;
      _error = null;
    });
    _idempotencyKey ??=
        'pay-${widget.rideId}-${widget.offerId}-${DateTime.now().millisecondsSinceEpoch}';
    final app = context.read<AppState>();

    // Idempotent resume: already-booked ride — do not create a new charge.
    final existing = app.rideById(widget.rideId);
    if (existing != null &&
        (existing.isBooked ||
            (existing.serverStatus ?? '').toUpperCase() == 'BOOKED')) {
      _goToConfirmed();
      return;
    }

    try {
      final result = await app.pay(
        rideId: widget.rideId,
        offerId: widget.offerId,
        paymentMode: _paymentMode,
        paymentMethod: _paymentMethod,
        termsAccepted: _termsAccepted,
        idempotencyKey: _idempotencyKey,
      );
      if (!mounted) return;

      final payment = result['payment'];
      final clientSecret = result['clientSecret']?.toString();
      final provider = (result['paymentProvider'] ??
              _quote?['paymentProvider'] ??
              '')
          .toString()
          .toLowerCase();
      final publishableKey = StripePaymentService.resolvePublishableKey(
        result['stripePublishableKey']?.toString() ??
            _quote?['stripePublishableKey']?.toString(),
      );

      // Never treat create-intent alone as paid (blocks unpaid DevPayment booking).
      if (provider == 'dev' ||
          (clientSecret != null && clientSecret.startsWith('dev_secret_'))) {
        setState(() {
          _paying = false;
          _error =
              'Payment is not configured. Please try again later.';
        });
        return;
      }

      // Stripe requires PaymentSheet so a payment method is attached + confirmed.
      String? paymentIntentId;
      if (payment is Map) {
        paymentIntentId = payment['providerRef']?.toString();
      }

      if (clientSecret == null || clientSecret.isEmpty) {
        throw StateError(
          'Payment setup incomplete (missing client secret). Please try again.',
        );
      }
      if (publishableKey == null) {
        throw StateError(
          'Stripe is not configured for this app (missing publishable key).',
        );
      }
      if (kIsWeb) {
        throw StateError(
          'Card payment on web is not available in this build. Please use the mobile app.',
        );
      }

      paymentIntentId ??= clientSecret.contains('_secret')
          ? clientSecret.split('_secret').first
          : null;

      final currency = _currency(_quote!, 'onlineCurrency');
      try {
        await StripePaymentService.presentPaymentSheet(
          clientSecret: clientSecret,
          publishableKey: publishableKey,
          currency: currency,
        );
      } catch (e) {
        if (StripePaymentService.isUserCancelled(e)) {
          if (!mounted) return;
          setState(() {
            _paying = false;
            _error = 'Payment cancelled. Your ride has not been booked.';
          });
          return;
        }
        rethrow;
      }

      final confirmed = await _awaitPaymentConfirmation(
        app,
        paymentIntentId: paymentIntentId,
      );
      if (!mounted) return;
      if (confirmed) {
        _goToConfirmed();
        return;
      }

      setState(() {
        _paying = false;
        _error =
            'Confirming your payment… Please wait a moment, then tap Retry status.';
      });
    } catch (e) {
      if (!mounted) return;
      // Do not treat a create-intent side-effect BOOKED as success after an error;
      // only confirm when PaymentSheet already completed (handled above).
      setState(() {
        _paying = false;
        _error =
            'Payment unsuccessful. Your ride has not been booked.\n$e';
      });
    }
  }

  void _goToConfirmed() {
    if (!mounted) return;
    final rideId = widget.rideId;
    while (Navigator.of(context, rootNavigator: true).canPop()) {
      Navigator.of(context, rootNavigator: true).pop();
    }
    GoRouter.of(context).go('/booking-confirmed/$rideId');
  }

  Future<bool> _awaitPaymentConfirmation(
    AppState app, {
    String? paymentIntentId,
  }) async {
    // Prefer explicit Stripe reconcile — do not rely on webhook alone.
    try {
      final confirm = await app.confirmPayment(
        widget.rideId,
        paymentIntentId: paymentIntentId,
      );
      final ride = confirm['ride'];
      final rideStatus = ride is Map ? ride['status']?.toString() : null;
      final payStatus = confirm['paymentStatus']?.toString().toLowerCase();
      if (confirm['booked'] == true ||
          confirm['alreadyBooked'] == true ||
          rideStatus == 'BOOKED' ||
          payStatus == 'succeeded') {
        await app.refreshRide(widget.rideId);
        return true;
      }
      if (payStatus == 'failed') {
        return false;
      }
    } catch (_) {
      // Fall through to short status poll (webhook may still land).
    }

    for (var i = 0; i < 12; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 700));
      try {
        final status = await app.getPaymentStatus(widget.rideId);
        final rideStatus = status['rideStatus']?.toString() ??
            status['status']?.toString() ??
            '';
        final payStatus =
            status['paymentStatus']?.toString().toLowerCase() ??
            (status['payment'] is Map
                ? (status['payment'] as Map)['status']
                    ?.toString()
                    .toLowerCase()
                : null);
        if (rideStatus == 'BOOKED' || payStatus == 'succeeded') {
          await app.refreshRide(widget.rideId);
          return true;
        }
        if (payStatus == 'failed' || rideStatus == 'PAYMENT_FAILED') {
          return false;
        }
      } catch (_) {
        // Keep polling briefly.
      }
    }
    await app.refreshRide(widget.rideId);
    return app.rideById(widget.rideId)?.serverStatus == 'BOOKED' ||
        app.rideById(widget.rideId)?.status == RideStatus.booked;
  }

  Future<void> _confirmCancel() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel ride?'),
        content: const Text(
          'Cancel this payment and the ride request?',
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
        SnackBar(
          content: Text('Could not cancel: $e'),
          behavior: SnackBarBehavior.floating,
          showCloseIcon: true,
          duration: const Duration(seconds: 4),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final ride = app.rideById(widget.rideId);
    if (ride != null && ride.isBooked && !_paying) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.go('/ride/${widget.rideId}');
      });
    }
    final status =
        (app.rideById(widget.rideId)?.serverStatus ?? '').toUpperCase();
    final canCancel = status == 'PAYMENT_PENDING' ||
        status == 'WAITING_FOR_OFFERS' ||
        status == 'OFFER_SELECTION';
    final offer =
        context.watch<AppState>().offerByIds(widget.rideId, widget.offerId);
    final quote = _quote;

    final breakdown = offer?.priceBreakdown;
    final double rideFare;
    final double platformFee;
    final double taxes;
    final double displayTotal;

    if (breakdown != null && breakdown.ridePrice > 0) {
      rideFare = breakdown.ridePrice;
      platformFee = breakdown.platformFee > 0
          ? breakdown.platformFee
          : (((rideFare * 0.2) * 100).roundToDouble() / 100.0);
      taxes = breakdown.taxes;
      displayTotal = breakdown.total > 0
          ? breakdown.total
          : (((rideFare + platformFee + taxes) * 100).roundToDouble() / 100.0);
    } else {
      final base = (offer != null && offer.price > 0)
          ? offer.price
          : (quote != null ? _num(quote['totalAmount']) : 0.0);
      rideFare = ((base * 100).roundToDouble()) / 100.0;
      platformFee = (((rideFare * 0.2) * 100).roundToDouble()) / 100.0;
      taxes = 0.0;
      displayTotal =
          (((rideFare + platformFee) * 100).roundToDouble()) / 100.0;
    }

    final quoteTotal = quote != null ? _num(quote['totalAmount']) : 0.0;
    final effectiveTotal =
        (quoteTotal > 0 && (quoteTotal - displayTotal).abs() < 0.05)
            ? quoteTotal
            : displayTotal;

    final onlineAmount = quote != null && _num(quote['onlineAmount']) > 0
        ? _num(quote['onlineAmount'])
        : (_paymentMode == 'PARTIAL'
            ? (((effectiveTotal * 0.2) * 100).roundToDouble() / 100.0)
            : effectiveTotal);
    final cashAmount = quote != null && _num(quote['cashAmount']) > 0
        ? _num(quote['cashAmount'])
        : (_paymentMode == 'PARTIAL'
            ? (((effectiveTotal - onlineAmount) * 100).roundToDouble() / 100.0)
            : 0.0);

    final currency = quote != null
        ? _currency(quote, 'onlineCurrency', offer?.currency ?? 'CAD')
        : (offer?.currency ?? 'CAD');
    final policy = quote?['cancellationPolicy'];
    final policyBody = policy is Map
        ? (policy['body']?.toString() ?? '')
        : (quote?['cancellationPolicy']?.toString() ??
            'The ride is not refundable in case of cancellation.');

    return ScaffoldMessenger(
      child: Scaffold(
        backgroundColor: GtColors.bgGrey,
        appBar: AppBar(
          title: const Text('Payment'),
          leading: IconButton(
            icon: const Icon(Icons.close),
            onPressed: () =>
                context.canPop() ? context.pop() : context.go('/'),
          ),
          actions: [
            if (canCancel)
              TextButton(
                onPressed: _paying ? null : _confirmCancel,
                child: const Text(
                  'Cancel',
                  style: TextStyle(color: GtColors.brand),
                ),
              ),
          ],
        ),
        body: _loadingQuote
            ? const Center(
                child: CircularProgressIndicator(color: GtColors.brand),
              )
            : _error != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.error_outline,
                            size: 48,
                            color: GtColors.brand,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            _error!,
                            textAlign: TextAlign.center,
                            style: const TextStyle(height: 1.4),
                          ),
                          const SizedBox(height: 20),
                          GtGreenButton(
                            label: _error!.contains('Confirming')
                                ? 'Retry status'
                                : 'Try again',
                            onPressed: () async {
                              final appState = context.read<AppState>();
                              if (_error!.contains('Confirming')) {
                                setState(() => _paying = true);
                                final ok =
                                    await _awaitPaymentConfirmation(appState);
                                if (!mounted) return;
                                if (ok) {
                                  _goToConfirmed();
                                  return;
                                }
                                setState(() => _paying = false);
                                return;
                              }
                              setState(() => _error = null);
                              await _loadQuote();
                            },
                          ),
                          const SizedBox(height: 10),
                          TextButton(
                            onPressed: () => context.go(
                              '/offers/${widget.rideId}',
                            ),
                            child: const Text(
                              'Back to offers',
                              style: TextStyle(color: GtColors.textSecondary),
                            ),
                          ),
                        ],
                      ),
                    ),
                  )
                : ListView(
                    padding: EdgeInsets.fromLTRB(
                      16,
                      16,
                      16,
                      MediaQuery.paddingOf(context).bottom + 36,
                    ),
                    children: [
                      if (offer != null)
                        GtCard(
                          child: Row(
                            children: [
                              ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: SizedBox(
                                  width: 72,
                                  height: 54,
                                  child: offer.imageUrl != null
                                      ? AuthNetworkImage(
                                          url: offer.imageUrl!,
                                          fit: BoxFit.cover,
                                          errorBuilder: (_, __, ___) =>
                                              const ColoredBox(
                                            color: GtColors.bgGrey,
                                            child: Icon(Icons.directions_car),
                                          ),
                                        )
                                      : const ColoredBox(
                                          color: GtColors.bgGrey,
                                          child: Icon(Icons.directions_car),
                                        ),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      offer.displayName,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    Text(
                                      offer.vehicleClass,
                                      style: const TextStyle(
                                        color: GtColors.textSecondary,
                                        fontSize: 13,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      const SizedBox(height: 16),
                      Text(
                        formatMoney(effectiveTotal, currency),
                        style: const TextStyle(
                          fontSize: 32,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const Text(
                        'Total for this ride',
                        style: TextStyle(color: GtColors.textSecondary),
                      ),
                      const SizedBox(height: 16),
                      GtCard(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Row(
                              children: [
                                Icon(
                                  Icons.receipt_long_rounded,
                                  size: 20,
                                  color: GtColors.brand,
                                ),
                                SizedBox(width: 8),
                                Text(
                                  'Cost breakdown',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 15,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 14),
                            _costRow('Ride fare', rideFare, currency),
                            const SizedBox(height: 8),
                            _costRow('Platform fee', platformFee, currency),
                            if (taxes > 0) ...[
                              const SizedBox(height: 8),
                              _costRow('Taxes', taxes, currency),
                            ],
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: 10),
                              child: Divider(height: 1),
                            ),
                            _costRow(
                              'Total',
                              effectiveTotal,
                              currency,
                              isTotal: true,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'How would you like to pay?',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 8),
                      _modeTile(
                        title: 'Pay in full',
                        subtitle: formatMoney(effectiveTotal, currency),
                        selected: _paymentMode == 'FULL',
                        onTap: () => _setMode('FULL'),
                      ),
                      if (_partialEnabled)
                        _modeTile(
                          title: 'Part now, rest in cash',
                          subtitle:
                              'Pay ${formatMoney(onlineAmount, currency)} now · ${formatMoney(cashAmount, currency)} to driver',
                          selected: _paymentMode == 'PARTIAL',
                          onTap: () => _setMode('PARTIAL'),
                        ),
                      if (_paymentMode == 'PARTIAL' && cashAmount > 0) ...[
                        const SizedBox(height: 8),
                        Text(
                          'Remaining ${formatMoney(cashAmount, currency)} is paid in cash to the driver.',
                          style: const TextStyle(
                            color: GtColors.textSecondary,
                            fontSize: 13,
                          ),
                        ),
                      ],
                      const SizedBox(height: 20),
                      const Text(
                        'Secure payment',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 8),
                      GtCard(
                        padding: const EdgeInsets.all(14),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(
                              Icons.lock_outline,
                              color: GtColors.brand,
                              size: 22,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                kIsWeb
                                    ? 'Use the CAN-RIDE mobile app to pay securely with card or wallets Stripe offers in your region.'
                                    : 'Tap Pay to open Stripe’s secure form — card number with brand icon (Visa/Mastercard), expiry (MM/YY), CVC, plus Google Pay / Apple Pay when available on your device.',
                                style: const TextStyle(
                                  color: GtColors.textSecondary,
                                  fontSize: 13,
                                  height: 1.4,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      const Text(
                        'Cancellation policy',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        policyBody,
                        style: const TextStyle(
                          color: GtColors.textSecondary,
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(height: 12),
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        controlAffinity: ListTileControlAffinity.leading,
                        activeColor: GtColors.brand,
                        value: _termsAccepted,
                        onChanged: _paying
                            ? null
                            : (v) =>
                                setState(() => _termsAccepted = v ?? false),
                        title: const Text(
                          'I accept the terms of service and cancellation policy',
                          style: TextStyle(fontSize: 14),
                        ),
                      ),
                      const SizedBox(height: 12),
                      if (_paying)
                        const Center(
                          child: Padding(
                            padding: EdgeInsets.all(16),
                            child: CircularProgressIndicator(
                              color: GtColors.green,
                            ),
                          ),
                        )
                      else ...[
                        GtGreenButton(
                          label:
                              'Pay ${formatMoney(onlineAmount > 0 ? onlineAmount : effectiveTotal, currency)}',
                          onPressed: _termsAccepted ? _pay : null,
                        ),
                        const SizedBox(height: 20),
                      ],
                    ],
                  ),
      ),
    );
  }

  Widget _costRow(
    String label,
    num amount,
    String currency, {
    bool isTotal = false,
  }) {
    final style = TextStyle(
      fontSize: isTotal ? 16 : 14,
      fontWeight: isTotal ? FontWeight.w800 : FontWeight.w500,
      color: isTotal ? GtColors.text : GtColors.textSecondary,
    );
    final valueStyle = TextStyle(
      fontSize: isTotal ? 16 : 14,
      fontWeight: isTotal ? FontWeight.w800 : FontWeight.w600,
      color: isTotal ? GtColors.brand : GtColors.text,
    );

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: style),
        Text(formatMoney(amount, currency), style: valueStyle),
      ],
    );
  }

  Widget _modeTile({
    required String title,
    required String subtitle,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          onTap: _paying ? null : onTap,
          borderRadius: BorderRadius.circular(10),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: selected ? GtColors.brand : GtColors.border,
                width: selected ? 2 : 1,
              ),
            ),
            child: Row(
              children: [
                Icon(
                  selected
                      ? Icons.radio_button_checked
                      : Icons.radio_button_off,
                  color: selected ? GtColors.brand : GtColors.textMuted,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      Text(
                        subtitle,
                        style: const TextStyle(
                          fontSize: 13,
                          color: GtColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
