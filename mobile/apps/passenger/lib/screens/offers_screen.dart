import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

enum _OfferSort {
  recommended,
  lowestPrice,
  highestPrice,
  bestRated,
  newest,
  vehicleClass,
}

class OffersScreen extends StatefulWidget {
  const OffersScreen({
    super.key,
    required this.rideId,
    this.focusOfferId,
  });

  final String rideId;
  final String? focusOfferId;

  @override
  State<OffersScreen> createState() => _OffersScreenState();
}

class _OffersScreenState extends State<OffersScreen> {
  Timer? _poll;
  _OfferSort _sort = _OfferSort.recommended;
  bool _viewRecorded = false;
  bool _booking = false;

  @override
  void initState() {
    super.initState();
    _poll = Timer.periodic(const Duration(seconds: 5), (_) {
      if (!mounted) return;
      context.read<AppState>().refreshRide(widget.rideId);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  Future<void> _bootstrap() async {
    if (!mounted) return;
    final app = context.read<AppState>();
    await app.refreshRide(widget.rideId);
    if (!_viewRecorded) {
      _viewRecorded = true;
      await app.recordRideView(widget.rideId);
    }
    final focus = widget.focusOfferId;
    if (focus != null && focus.isNotEmpty && mounted) {
      context.push('/offer/${widget.rideId}/$focus');
    }
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  List<Offer> _sorted(List<Offer> offers) {
    final list = List<Offer>.from(offers);
    switch (_sort) {
      case _OfferSort.recommended:
        list.sort((a, b) {
          final scoreA = a.rating * 10 - a.price / 1000;
          final scoreB = b.rating * 10 - b.price / 1000;
          return scoreB.compareTo(scoreA);
        });
      case _OfferSort.lowestPrice:
        list.sort((a, b) => a.price.compareTo(b.price));
      case _OfferSort.highestPrice:
        list.sort((a, b) => b.price.compareTo(a.price));
      case _OfferSort.bestRated:
        list.sort((a, b) => b.rating.compareTo(a.rating));
      case _OfferSort.newest:
        break;
      case _OfferSort.vehicleClass:
        list.sort((a, b) => a.vehicleClass.compareTo(b.vehicleClass));
    }
    return list;
  }

  Future<void> _book(Offer offer) async {
    if (_booking) return;
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

  String _sortLabel(_OfferSort s) {
    switch (s) {
      case _OfferSort.recommended:
        return 'Recommended';
      case _OfferSort.lowestPrice:
        return 'Lowest price';
      case _OfferSort.highestPrice:
        return 'Highest price';
      case _OfferSort.bestRated:
        return 'Best rated';
      case _OfferSort.newest:
        return 'Newest';
      case _OfferSort.vehicleClass:
        return 'Vehicle class';
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final ride = state.rideById(widget.rideId);
    final offers = _sorted(state.offersFor(widget.rideId));
    final offerCount = offers.isNotEmpty
        ? offers.length
        : (ride?.offerCount ?? 0);

    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      appBar: AppBar(
        title: Text(
          ride != null ? 'Offers · #${ride.displayId}' : 'Offers',
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.canPop() ? context.pop() : context.go('/'),
        ),
      ),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (ride != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                child: GtCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      GtRouteRow(
                        from: ride.from,
                        to: ride.to,
                        distance: ride.distance,
                        duration: ride.duration,
                        timeBadge: ride.timeBadge,
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Text(
                            '$offerCount offer${offerCount == 1 ? '' : 's'}',
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              color: GtColors.brand,
                            ),
                          ),
                          if (ride.viewCount != null) ...[
                            const SizedBox(width: 12),
                            Text(
                              '${ride.viewCount} views',
                              style: const TextStyle(
                                fontSize: 13,
                                color: GtColors.textMuted,
                              ),
                            ),
                          ],
                          const Spacer(),
                          Text(
                            ride.currency ?? state.currency,
                            style: const TextStyle(
                              fontSize: 13,
                              color: GtColors.textSecondary,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
              child: SizedBox(
                height: 44,
                child: Row(
                  children: [
                    const Text(
                      'Sort',
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: GtColors.textSecondary,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Material(
                        color: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                          side: const BorderSide(color: GtColors.border),
                        ),
                        child: PopupMenuButton<_OfferSort>(
                          initialValue: _sort,
                          onSelected: (v) => setState(() => _sort = v),
                          itemBuilder: (_) => [
                            for (final s in _OfferSort.values)
                              PopupMenuItem(
                                value: s,
                                child: Text(_sortLabel(s)),
                              ),
                          ],
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    _sortLabel(_sort),
                                    style: const TextStyle(fontSize: 14),
                                  ),
                                ),
                                const Icon(Icons.arrow_drop_down),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Expanded(
              child: offers.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              offerCount > 0
                                  ? Icons.sync
                                  : Icons.hourglass_empty,
                              size: 40,
                              color: GtColors.textMuted,
                            ),
                            const SizedBox(height: 12),
                            Text(
                              offerCount > 0
                                  ? 'Loading offers…'
                                  : 'No offers yet',
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 16,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              offerCount > 0
                                  ? 'We found $offerCount offer(s). Pulling details…'
                                  : 'Offers appear when a driver bids on your ride. Checking automatically…',
                              textAlign: TextAlign.center,
                              style: const TextStyle(color: GtColors.textMuted),
                            ),
                            const SizedBox(height: 16),
                            TextButton(
                              onPressed: () => context
                                  .read<AppState>()
                                  .refreshRide(widget.rideId),
                              child: const Text('Retry'),
                            ),
                          ],
                        ),
                      ),
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(12),
                      itemCount: offers.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (_, i) {
                        final o = offers[i];
                        return _OfferCard(
                          offer: o,
                          booking: _booking,
                          onDetails: () =>
                              context.push('/offer/${widget.rideId}/${o.id}'),
                          onBook: () => _book(o),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OfferCard extends StatelessWidget {
  const _OfferCard({
    required this.offer,
    required this.onDetails,
    required this.onBook,
    required this.booking,
  });

  final Offer offer;
  final VoidCallback onDetails;
  final VoidCallback onBook;
  final bool booking;

  @override
  Widget build(BuildContext context) {
    final asset = MockData.vehicleImageAsset(offer.vehicleClass);
    final network = offer.imageUrl;

    return GtCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: SizedBox(
                  width: 88,
                  height: 64,
                  child: network != null && network.isNotEmpty
                      ? Image.network(
                          network,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => _placeholder(asset),
                        )
                      : _placeholder(asset),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      offer.displayName,
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      offer.vehicleClass,
                      style: const TextStyle(
                        color: GtColors.textSecondary,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${offer.passengers}×  ·  ${offer.baggage ?? '—'}× bags',
                      style: const TextStyle(
                        fontSize: 12,
                        color: GtColors.textMuted,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        const Icon(Icons.star, size: 14, color: GtColors.star),
                        const SizedBox(width: 4),
                        Text(
                          offer.ratingCount > 0
                              ? '${offer.rating.toStringAsFixed(1)} (${offer.ratingCount})'
                              : 'New',
                          style: const TextStyle(fontSize: 13),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Text(
                offer.priceLabel,
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                ),
              ),
            ],
          ),
          if (offer.options.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              offer.options.take(4).join(' · '),
              style: const TextStyle(
                fontSize: 12,
                color: GtColors.textSecondary,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
          if (offer.languages.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              offer.languages.join(' · '),
              style: const TextStyle(fontSize: 12, color: GtColors.textMuted),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              TextButton(
                onPressed: onDetails,
                child: const Text(
                  'Details',
                  style: TextStyle(
                    color: GtColors.brand,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const Spacer(),
              SizedBox(
                height: 36,
                child: ElevatedButton(
                  onPressed: booking ? null : onBook,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: GtColors.green,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: const Text(
                    'BOOK',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _placeholder(String? asset) {
    return ColoredBox(
      color: GtColors.bgGrey,
      child: asset != null
          ? Image.asset(asset, package: 'gt_ui', fit: BoxFit.contain)
          : const Icon(Icons.directions_car, size: 32, color: GtColors.textMuted),
    );
  }
}
