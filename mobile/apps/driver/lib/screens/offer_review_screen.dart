import 'package:flutter/material.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../offer/offer_helpers.dart';
import '../offer/price_range_heatmap_bar.dart';
import '../state/app_state.dart';

class OfferReviewScreen extends StatefulWidget {
  const OfferReviewScreen({
    super.key,
    required this.request,
    required this.draft,
    this.vehicle,
  });

  final DriverRequest request;
  final OfferDraft draft;
  final DriverVehicle? vehicle;

  @override
  State<OfferReviewScreen> createState() => _OfferReviewScreenState();
}

class _OfferReviewScreenState extends State<OfferReviewScreen> {
  bool _submitting = false;
  String? _error;

  String get _currency => widget.request.currency;

  double get _offeredFare => widget.draft.totalPrice;

  double get _customerRidePrice =>
      ((_offeredFare * 1.20) * 100).roundToDouble() / 100.0;

  double get _platformFee =>
      ((_customerRidePrice * 0.20) * 100).roundToDouble() / 100.0;

  double get _customerTotal =>
      ((_customerRidePrice + _platformFee) * 100).roundToDouble() / 100.0;

  Future<void> _submit() async {
    if (_submitting) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await context.read<AppState>().submitOfferDraft(
            widget.request.id,
            widget.draft,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Offer sent to customer')),
      );
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e
            .toString()
            .replaceFirst('ApiException(', '')
            .replaceAll(RegExp(r'\)$'), '');
        _submitting = false;
      });
    }
  }

  Widget _costRow(
    String label,
    double amount, {
    bool isTotal = false,
    String? subtitle,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontSize: isTotal ? 16 : 14,
                    fontWeight: isTotal ? FontWeight.w800 : FontWeight.w500,
                    color: isTotal ? GtColors.text : GtColors.textSecondary,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 12,
                      color: GtColors.textMuted,
                    ),
                  ),
                ],
              ],
            ),
          ),
          Text(
            MoneyFormat.formatFlexible(amount, _currency),
            style: TextStyle(
              fontSize: isTotal ? 18 : 14,
              fontWeight: isTotal ? FontWeight.w900 : FontWeight.w700,
              color: isTotal ? GtColors.brand : GtColors.text,
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final validityLabel = kOfferValidityOptions
        .where((o) => o.seconds == widget.draft.validForSeconds)
        .map((o) => o.label)
        .cast<String?>()
        .firstWhere((_) => true, orElse: () => null);

    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      appBar: AppBar(
        title: const Text('Offer to customer'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed:
              _submitting ? null : () => Navigator.of(context).pop(false),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Ride route card
          GtCard(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        widget.request.datetimeLabel,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: GtColors.soft,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        'Ride #${widget.request.id}',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: GtColors.brand,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                GtRouteRow(
                  from: widget.request.from,
                  to: widget.request.to,
                  distance: widget.request.distance,
                  duration: widget.request.duration,
                  isRoundTrip: widget.request.isRoundTrip,
                  returnLabel: widget.request.returnDatetimeLabel,
                ),
                if (widget.vehicle != null) ...[
                  const Divider(height: 24),
                  Row(
                    children: [
                      const Icon(
                        Icons.directions_car_filled_outlined,
                        size: 20,
                        color: GtColors.brand,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          '${widget.vehicle!.name} (${widget.vehicle!.plate}) · ${widget.vehicle!.vehicleClass}',
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                ],
                if (validityLabel != null) ...[
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(
                        Icons.hourglass_bottom_outlined,
                        size: 20,
                        color: GtColors.textSecondary,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Offer validity: $validityLabel',
                        style: const TextStyle(
                          color: GtColors.textSecondary,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ],
                if (widget.draft.selectedOptions.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final opt in widget.draft.selectedOptions)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: GtColors.bgGrey,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: GtColors.border),
                          ),
                          child: Text(
                            opt.replaceAll('_', ' '),
                            style: const TextStyle(fontSize: 12),
                          ),
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Eligible price range heatmap indicator
          Builder(
            builder: (_) {
              final resolvedPricing = PriceRangeHeatmapBar.resolvePricing(
                pricing: widget.request.pricing,
                distanceStr: widget.request.distance,
                isRoundTrip: widget.request.isRoundTrip,
              );
              return PriceRangeHeatmapBar(
                minBid: resolvedPricing.minBid,
                maxBid: resolvedPricing.maxBid,
                guidanceAmount: resolvedPricing.guidanceAmount,
                currency: _currency,
                currentPrice: _offeredFare,
                isRoundTrip: widget.request.isRoundTrip,
              );
            },
          ),
          const SizedBox(height: 16),

          // Cost breakdown Card
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
                        fontSize: 16,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                if (widget.request.isRoundTrip &&
                    widget.draft.outboundPrice != null &&
                    widget.draft.returnPrice != null) ...[
                  _costRow(
                    'Outbound fare (A → B)',
                    widget.draft.outboundPrice!,
                  ),
                  _costRow(
                    'Return fare (B → A)',
                    widget.draft.returnPrice!,
                  ),
                  const Divider(height: 16),
                ],
                _costRow('Your offered fare', _offeredFare),
                const SizedBox(height: 4),
                _costRow('Platform fee (paid by passenger)', _platformFee),
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Divider(height: 1),
                ),
                _costRow(
                  'Total customer fare',
                  _customerTotal,
                  isTotal: true,
                ),
              ],
            ),
          ),

          if (_error != null) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: GtColors.soft,
                borderRadius: BorderRadius.circular(10),
                border:
                    Border.all(color: GtColors.brand.withValues(alpha: 0.2)),
              ),
              child: Text(
                _error!,
                style: const TextStyle(color: GtColors.brand, fontSize: 13),
              ),
            ),
          ],

          const SizedBox(height: 24),
          if (_submitting)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: CircularProgressIndicator(color: GtColors.green),
              ),
            )
          else
            GtGreenButton(
              label: 'Submit offer to customer',
              onPressed: _submit,
            ),
        ],
      ),
    );
  }
}
