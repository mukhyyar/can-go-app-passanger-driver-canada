import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

class OfferDetailScreen extends StatefulWidget {
  const OfferDetailScreen({
    super.key,
    required this.rideId,
    required this.offerId,
  });

  final String rideId;
  final String offerId;

  @override
  State<OfferDetailScreen> createState() => _OfferDetailScreenState();
}

class _OfferDetailScreenState extends State<OfferDetailScreen> {
  final _page = PageController();
  int _pageIndex = 0;
  bool _loading = true;
  bool _booking = false;
  bool _breakdownOpen = false;
  String? _error;
  Offer? _offer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _page.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final app = context.read<AppState>();
    final offer = await app.fetchOffer(widget.rideId, widget.offerId);
    if (!mounted) return;
    if (offer == null) {
      setState(() {
        _loading = false;
        _error = 'Offer not found';
      });
      return;
    }
    final withdrawn = (offer.status ?? '').toUpperCase().contains('WITHDRAW') ||
        (offer.status ?? '').toUpperCase() == 'EXPIRED' ||
        (offer.status ?? '').toUpperCase() == 'CANCELLED';
    setState(() {
      _offer = offer;
      _loading = false;
      _error = withdrawn ? 'This offer is no longer available' : null;
    });
  }

  Future<void> _book() async {
    final offer = _offer;
    if (offer == null || _booking || _error != null) return;
    setState(() => _booking = true);
    final app = context.read<AppState>();
    try {
      await app.validateBook(widget.rideId, offer.id);
      if (!mounted) return;
      context.push('/payment/${widget.rideId}/${offer.id}');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Cannot book: $e')),
      );
    } finally {
      if (mounted) setState(() => _booking = false);
    }
  }

  void _showWaiting(String summary) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Waiting time'),
        content: Text(summary),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('OK', style: TextStyle(color: GtColors.brand)),
          ),
        ],
      ),
    );
  }

  Future<void> _showReviews(Offer offer) async {
    final app = context.read<AppState>();
    var reviews = offer.reviews;
    if (reviews.isEmpty) {
      reviews = await app.fetchOfferReviews(offer.id);
    }
    if (!mounted) return;
    showGtSheet(
      context: context,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Reviews',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            if (reviews.isEmpty)
              const Text(
                'No reviews yet',
                style: TextStyle(color: GtColors.textMuted),
              )
            else
              ...reviews.map(
                (r) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          ...List.generate(
                            r.stars.clamp(0, 5),
                            (_) => const Icon(
                              Icons.star,
                              size: 14,
                              color: GtColors.star,
                            ),
                          ),
                          if (r.fromLanguage != null) ...[
                            const SizedBox(width: 8),
                            Text(
                              'from ${r.fromLanguage}',
                              style: const TextStyle(
                                fontSize: 12,
                                color: GtColors.textMuted,
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(r.text),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: const Text('Details')),
        body: const Center(
          child: CircularProgressIndicator(color: GtColors.brand),
        ),
      );
    }

    final offer = _offer;
    if (offer == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Offer')),
        body: Center(
          child: Text(_error ?? 'Offer not found'),
        ),
      );
    }

    final images = offer.imageUrls;
    final asset = MockData.vehicleImageAsset(offer.vehicleClass);
    final breakdown = offer.priceBreakdown;
    final rating = offer.ratingBreakdown;

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text('Details'),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => context.pop(),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_error != null)
                  Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: GtColors.soft,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      _error!,
                      style: const TextStyle(
                        color: GtColors.brand,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                SizedBox(
                  height: 200,
                  child: Stack(
                    children: [
                      PageView.builder(
                        controller: _page,
                        itemCount: images.isEmpty ? 1 : images.length,
                        onPageChanged: (i) => setState(() => _pageIndex = i),
                        itemBuilder: (_, i) {
                          if (images.isEmpty) {
                            return _imagePlaceholder(asset);
                          }
                          return ClipRRect(
                            borderRadius: BorderRadius.circular(12),
                            child: Image.network(
                              images[i],
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) =>
                                  _imagePlaceholder(asset),
                            ),
                          );
                        },
                      ),
                      if (images.length > 1)
                        Positioned(
                          bottom: 10,
                          left: 0,
                          right: 0,
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: List.generate(
                              images.length,
                              (i) => Container(
                                width: 8,
                                height: 8,
                                margin:
                                    const EdgeInsets.symmetric(horizontal: 3),
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: i == _pageIndex
                                      ? GtColors.brand
                                      : Colors.white70,
                                ),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        offer.displayName,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    Text(
                      offer.priceLabel,
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
                Text(
                  offer.vehicleClass,
                  style: const TextStyle(color: GtColors.textSecondary),
                ),
                InkWell(
                  onTap: () => setState(() => _breakdownOpen = !_breakdownOpen),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Row(
                      children: [
                        Text(
                          breakdown?.includesNote ?? 'Includes all taxes and fees',
                          style: const TextStyle(
                            color: GtColors.green,
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Icon(
                          _breakdownOpen
                              ? Icons.expand_less
                              : Icons.expand_more,
                          color: GtColors.green,
                          size: 20,
                        ),
                      ],
                    ),
                  ),
                ),
                if (_breakdownOpen && breakdown != null) ...[
                  _breakRow('Ride price', breakdown.ridePrice, offer.currency),
                  _breakRow(
                    'Marketplace fee',
                    breakdown.marketplaceFee,
                    offer.currency,
                  ),
                  _breakRow('Taxes', breakdown.taxes, offer.currency),
                  const Divider(),
                  _breakRow('Total', breakdown.total, offer.currency, bold: true),
                  const SizedBox(height: 8),
                ],
                const SizedBox(height: 8),
                const Text(
                  'Options',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                if (offer.options.isEmpty)
                  const Text(
                    'No extras listed',
                    style: TextStyle(color: GtColors.textMuted),
                  )
                else
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: offer.options
                        .map(
                          (o) => Chip(
                            label: Text(o),
                            backgroundColor: GtColors.bgGrey,
                            side: BorderSide.none,
                          ),
                        )
                        .toList(),
                  ),
                const SizedBox(height: 16),
                const Text(
                  'Rating',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Icon(Icons.star, color: GtColors.star, size: 18),
                    const SizedBox(width: 4),
                    Text(
                      offer.ratingCount > 0
                          ? '${offer.rating.toStringAsFixed(1)} (${offer.ratingCount})'
                          : 'New carrier',
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(width: 12),
                    Text('${offer.rides} rides'),
                    const SizedBox(width: 12),
                    Text('${offer.yearsWithPlatform} yrs'),
                  ],
                ),
                if (rating != null && rating.count > 0) ...[
                  const SizedBox(height: 8),
                  _ratingBar('Communication', rating.communication),
                  _ratingBar('Driver', rating.driver),
                  _ratingBar('Vehicle', rating.vehicle),
                ],
                TextButton(
                  onPressed: () => _showReviews(offer),
                  child: const Text(
                    'Show reviews',
                    style: TextStyle(color: GtColors.brand),
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Languages',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                Text(offer.languages.join(' · ')),
                const SizedBox(height: 16),
                const Text(
                  'Carrier',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                Text('Carrier ID ${offer.carrierId}'),
                const SizedBox(height: 16),
                const Text(
                  'Vehicle',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                Text(
                  [
                    offer.displayName,
                    if (offer.color != null) offer.color,
                    'Up to ${offer.passengers} passengers',
                    if (offer.baggage != null) '${offer.baggage} bags',
                  ].whereType<String>().join(' · '),
                ),
                if (offer.waitingTimeSummary != null) ...[
                  const SizedBox(height: 16),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.timer_outlined,
                        color: GtColors.brand),
                    title: const Text(
                      'Waiting time',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Text(
                      offer.waitingTimeSummary!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    onTap: () => _showWaiting(offer.waitingTimeSummary!),
                  ),
                ],
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Container(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(top: BorderSide(color: GtColors.border)),
              ),
              child: Row(
                children: [
                  Text(
                    offer.priceLabel,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: GtGreenButton(
                      label: _booking ? 'Checking…' : 'Book',
                      onPressed:
                          (_booking || _error != null) ? null : _book,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _imagePlaceholder(String? asset) {
    return Container(
      decoration: BoxDecoration(
        color: GtColors.bgGrey,
        borderRadius: BorderRadius.circular(12),
      ),
      clipBehavior: Clip.antiAlias,
      child: asset != null
          ? Image.asset(asset, package: 'gt_ui', fit: BoxFit.contain)
          : const Center(
              child: Icon(Icons.directions_car, size: 72, color: Colors.black45),
            ),
    );
  }

  Widget _breakRow(String label, double amount, String currency,
      {bool bold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontWeight: bold ? FontWeight.w700 : FontWeight.w400,
              ),
            ),
          ),
          Text(
            formatMoney(amount, currency),
            style: TextStyle(
              fontWeight: bold ? FontWeight.w800 : FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _ratingBar(String label, double value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: const TextStyle(fontSize: 13, color: GtColors.textSecondary),
            ),
          ),
          Expanded(
            child: LinearProgressIndicator(
              value: (value / 5).clamp(0.0, 1.0),
              backgroundColor: GtColors.border,
              color: GtColors.star,
              minHeight: 6,
              borderRadius: BorderRadius.circular(4),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            value > 0 ? value.toStringAsFixed(1) : '—',
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}
