import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_api/gt_api.dart';
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
  bool _handlingEvent = false;
  String? _error;
  Offer? _offer;
  String? _activeOfferId;

  @override
  void initState() {
    super.initState();
    _activeOfferId = widget.offerId;
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _page.dispose();
    super.dispose();
  }

  Future<void> _load({String? offerId}) async {
    final id = offerId ?? _activeOfferId ?? widget.offerId;
    setState(() {
      _loading = true;
      _error = null;
    });
    final app = context.read<AppState>();
    final refreshedRide = await app.refreshRide(widget.rideId);
    if (!mounted) return;
    if (refreshedRide != null && refreshedRide.isBooked) {
      context.go('/ride/${widget.rideId}');
      return;
    }
    final offer = await app.fetchOffer(widget.rideId, id);
    if (!mounted) return;
    if (offer == null) {
      setState(() {
        _loading = false;
        _error = 'Offer not found';
      });
      return;
    }
    final status = (offer.status ?? '').toUpperCase();
    final withdrawn = status.contains('WITHDRAW') ||
        status == 'EXPIRED' ||
        status == 'CANCELLED' ||
        status == 'SUPERSEDED';
    setState(() {
      _offer = offer;
      _activeOfferId = offer.id;
      _loading = false;
      _error = withdrawn ? 'This offer is no longer available' : null;
    });
  }

  void _consumeRealtime(AppState app) {
    if (_handlingEvent) return;
    final type = app.pendingOfferEventType;
    if (type == null) return;
    final rideId = app.pendingOfferEventRideId;
    if (rideId != widget.rideId) return;

    final eventOfferId = app.pendingOfferEventOfferId;
    final superseded = app.pendingOfferEventSupersededId;
    final watching = _activeOfferId ?? widget.offerId;
    final matches = eventOfferId == watching ||
        superseded == watching ||
        (type == 'offer.withdrawn' && eventOfferId == watching);

    if (!matches && type != 'offer.updated') return;
    if (type == 'offer.updated' && !matches && eventOfferId == null) return;

    _handlingEvent = true;
    app.clearPendingOfferDetailEvent();

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) {
        _handlingEvent = false;
        return;
      }
      if (type == 'offer.withdrawn' &&
          (eventOfferId == watching || superseded == watching)) {
        await showDialog<void>(
          context: context,
          barrierDismissible: false,
          builder: (ctx) => AlertDialog(
            title: const Text('Offer withdrawn'),
            content: const Text(
              'This offer has been withdrawn by the driver.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text(
                  'OK',
                  style: TextStyle(color: GtColors.brand),
                ),
              ),
            ],
          ),
        );
        if (mounted) {
          if (context.canPop()) {
            context.pop();
          } else {
            context.go('/offers/${widget.rideId}');
          }
        }
      } else if (type == 'offer.updated') {
        final nextId = eventOfferId ?? watching;
        await showDialog<void>(
          context: context,
          barrierDismissible: false,
          builder: (ctx) => AlertDialog(
            title: const Text('Offer updated'),
            content: const Text(
              'This offer has been enhanced / updated by the driver. Tap OK to refresh.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text(
                  'OK',
                  style: TextStyle(color: GtColors.brand),
                ),
              ),
            ],
          ),
        );
        if (mounted) await _load(offerId: nextId);
      }
      _handlingEvent = false;
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
      final refreshed = await app.refreshRide(widget.rideId);
      if (!mounted) return;
      if (refreshed != null && refreshed.isBooked) {
        context.go('/ride/${widget.rideId}');
        return;
      }
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
                  padding: const EdgeInsets.only(bottom: 14),
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
                          if (r.createdAt != null) ...[
                            const SizedBox(width: 8),
                            Text(
                              '${r.createdAt!.day}/${r.createdAt!.month}/${r.createdAt!.year}',
                              style: const TextStyle(
                                fontSize: 12,
                                color: GtColors.textMuted,
                              ),
                            ),
                          ],
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
                      if (r.communicationStars != null ||
                          r.driverStars != null ||
                          r.vehicleStars != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          [
                            if (r.communicationStars != null)
                              'Comm ★${r.communicationStars}',
                            if (r.driverStars != null)
                              'Driver ★${r.driverStars}',
                            if (r.vehicleStars != null)
                              'Vehicle ★${r.vehicleStars}',
                          ].join(' · '),
                          style: const TextStyle(
                            fontSize: 12,
                            color: GtColors.textSecondary,
                          ),
                        ),
                      ],
                      if (r.text.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(r.text),
                      ],
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
    final app = context.watch<AppState>();
    _consumeRealtime(app);

    final ride = app.rideById(widget.rideId);
    if (ride != null && ride.isBooked) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.go('/ride/${widget.rideId}');
      });
    }

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
        body: Center(child: Text(_error ?? 'Offer not found')),
      );
    }

    final images = offer.imageUrls;
    final asset = MockData.vehicleImageAsset(offer.vehicleClass);
    final breakdown = offer.priceBreakdown;
    final rating = offer.ratingBreakdown;
    final unavailable = _error != null;

    return Scaffold(
      backgroundColor: const Color(0xFFF7F7F8),
      appBar: AppBar(
        title: const Text('Offer details'),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => context.pop(),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              children: [
                if (unavailable)
                  Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: GtColors.soft,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      _error!,
                      style: const TextStyle(
                        color: GtColors.brand,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                // Hero photo
                ClipRRect(
                  borderRadius: BorderRadius.circular(14),
                  child: SizedBox(
                    height: 200,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        PageView.builder(
                          controller: _page,
                          itemCount: images.isEmpty ? 1 : images.length,
                          onPageChanged: (i) =>
                              setState(() => _pageIndex = i),
                          itemBuilder: (_, i) {
                            if (images.isEmpty) {
                              return _imagePlaceholder(asset);
                            }
                            return AuthNetworkImage(
                              url: images[i],
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) =>
                                  _imagePlaceholder(asset),
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
                                  width: 7,
                                  height: 7,
                                  margin: const EdgeInsets.symmetric(
                                      horizontal: 3),
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: i == _pageIndex
                                        ? Colors.white
                                        : Colors.white54,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        Positioned(
                          right: 12,
                          top: 12,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 8,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: 0.72),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              offer.priceLabel,
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w900,
                                fontSize: 16,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                // Vehicle block
                _Section(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        offer.displayName,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        [
                          offer.vehicleClass,
                          if ((offer.color ?? '').isNotEmpty) offer.color,
                          if ((offer.plate ?? '').trim().isNotEmpty)
                            'Plate ${offer.plate!.trim()}',
                        ].whereType<String>().join(' · '),
                        style: const TextStyle(
                          color: GtColors.textSecondary,
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          _MetaChip(
                            icon: Icons.people_outline,
                            label: 'Up to ${offer.passengers}',
                          ),
                          if (offer.baggage != null)
                            _MetaChip(
                              icon: Icons.luggage_outlined,
                              label: '${offer.baggage} bags',
                            ),
                          if ((offer.plate ?? '').trim().isNotEmpty)
                            _MetaChip(
                              icon: Icons.pin_outlined,
                              label: offer.plate!.trim(),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                // Amenities
                if (offer.options.isNotEmpty)
                  _Section(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Included',
                          style: TextStyle(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: offer.options
                              .map(
                                (o) => Chip(
                                  label: Text(o, style: const TextStyle(fontSize: 12)),
                                  visualDensity: VisualDensity.compact,
                                  backgroundColor: GtColors.bgGrey,
                                  side: BorderSide.none,
                                  materialTapTargetSize:
                                      MaterialTapTargetSize.shrinkWrap,
                                ),
                              )
                              .toList(),
                        ),
                      ],
                    ),
                  ),
                if (offer.options.isNotEmpty) const SizedBox(height: 10),
                // Driver trust
                _Section(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Driver',
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
                                : 'New',
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(width: 12),
                          Text(
                            '${offer.rides} trips',
                            style: const TextStyle(
                              color: GtColors.textSecondary,
                              fontSize: 13,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Text(
                            '${offer.yearsWithPlatform} yrs',
                            style: const TextStyle(
                              color: GtColors.textSecondary,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                      if (rating != null && rating.count > 0) ...[
                        const SizedBox(height: 8),
                        _ratingBar('Communication', rating.communication),
                        _ratingBar('Driver', rating.driver),
                        _ratingBar('Vehicle', rating.vehicle),
                      ],
                      if (offer.languages.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(
                          'Languages: ${offer.languages.join(', ')}',
                          style: const TextStyle(
                            fontSize: 13,
                            color: GtColors.textSecondary,
                          ),
                        ),
                      ],
                      TextButton(
                        onPressed: () => _showReviews(offer),
                        style: TextButton.styleFrom(
                          padding: EdgeInsets.zero,
                          minimumSize: const Size(0, 36),
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        child: const Text(
                          'Show reviews',
                          style: TextStyle(color: GtColors.brand),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                // Price
                _Section(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              offer.priceLabel,
                              style: const TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                          InkWell(
                            onTap: () => setState(
                              () => _breakdownOpen = !_breakdownOpen,
                            ),
                            child: Row(
                              children: [
                                Text(
                                  breakdown?.includesNote ??
                                      'Taxes & fees included',
                                  style: const TextStyle(
                                    color: GtColors.green,
                                    fontSize: 12,
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
                        ],
                      ),
                      if (_breakdownOpen) ...[
                        const SizedBox(height: 8),
                        _breakRow(
                          'Ride fare',
                          (breakdown != null && breakdown.ridePrice > 0)
                              ? breakdown.ridePrice
                              : (offer.price / 1.2),
                          offer.currency,
                        ),
                        _breakRow(
                          'Platform fee',
                          (breakdown != null && breakdown.platformFee > 0)
                              ? breakdown.platformFee
                              : (((((breakdown != null && breakdown.ridePrice > 0)
                                              ? breakdown.ridePrice
                                              : (offer.price / 1.2)) *
                                          0.2) *
                                      100)
                                  .roundToDouble() /
                              100.0),
                          offer.currency,
                        ),
                        if (breakdown != null && breakdown.taxes > 0)
                          _breakRow('Taxes', breakdown.taxes, offer.currency),
                        const Divider(height: 16),
                        _breakRow(
                          'Total',
                          (breakdown != null && breakdown.total > 0)
                              ? breakdown.total
                              : offer.price,
                          offer.currency,
                          bold: true,
                        ),
                      ],

                    ],
                  ),
                ),
                if (offer.waitingTimeSummary != null) ...[
                  const SizedBox(height: 10),
                  _Section(
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      dense: true,
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
                  ),
                ],
                const SizedBox(height: 8),
                Text(
                  'Carrier ID ${offer.carrierId}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: GtColors.textMuted,
                  ),
                ),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Container(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(top: BorderSide(color: GtColors.border)),
              ),
              child: Row(
                children: [
                  Text(
                    offer.priceLabel,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: GtGreenButton(
                      label: _booking ? 'Checking…' : 'Book',
                      onPressed: (_booking || unavailable) ? null : _book,
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
    return ColoredBox(
      color: GtColors.bgGrey,
      child: asset != null
          ? Image.asset(asset, package: 'gt_ui', fit: BoxFit.contain)
          : const Center(
              child:
                  Icon(Icons.directions_car, size: 72, color: Colors.black45),
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
                fontSize: 13,
              ),
            ),
          ),
          Text(
            formatMoney(amount, currency),
            style: TextStyle(
              fontWeight: bold ? FontWeight.w800 : FontWeight.w500,
              fontSize: 13,
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
              style: const TextStyle(fontSize: 12, color: GtColors.textSecondary),
            ),
          ),
          Expanded(
            child: LinearProgressIndicator(
              value: (value / 5).clamp(0.0, 1.0),
              backgroundColor: GtColors.border,
              color: GtColors.star,
              minHeight: 5,
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

class _Section extends StatelessWidget {
  const _Section({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: GtColors.border),
      ),
      child: child,
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: GtColors.bgGrey,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: GtColors.textSecondary),
          const SizedBox(width: 4),
          Text(label, style: const TextStyle(fontSize: 12)),
        ],
      ),
    );
  }
}
