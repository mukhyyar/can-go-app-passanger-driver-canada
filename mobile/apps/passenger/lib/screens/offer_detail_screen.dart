import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

class OfferDetailScreen extends StatelessWidget {
  const OfferDetailScreen({
    super.key,
    required this.rideId,
    required this.offerId,
  });

  final String rideId;
  final String offerId;

  @override
  Widget build(BuildContext context) {
    final offer = context.watch<AppState>().offerByIds(rideId, offerId);
    if (offer == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Offer')),
        body: const Center(child: Text('Offer not found')),
      );
    }

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
                Container(
                  height: 180,
                  decoration: BoxDecoration(
                    color: GtColors.bgGrey,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: MockData.vehicleImageAsset(offer.vehicleClass) != null
                      ? Image.asset(
                          MockData.vehicleImageAsset(offer.vehicleClass)!,
                          package: 'gt_ui',
                          fit: BoxFit.contain,
                        )
                      : const Center(
                          child: Icon(Icons.directions_car, size: 72, color: Colors.black45),
                        ),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${offer.vehicleBrand} ${offer.vehicleModel}',
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
                const SizedBox(height: 12),
                Row(
                  children: [
                    const Icon(Icons.star, color: GtColors.star, size: 18),
                    const SizedBox(width: 4),
                    Text(
                      '${offer.rating} (${offer.ratingCount})',
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(width: 12),
                    Text('${offer.rides} rides'),
                    const SizedBox(width: 12),
                    Text('${offer.yearsWithPlatform} yrs on platform'),
                  ],
                ),
                const SizedBox(height: 16),
                const Text('Options', style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
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
                const Text('Languages', style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Text(offer.languages.join(' · ')),
                const SizedBox(height: 16),
                const Text('Carrier', style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Text('Carrier ID ${offer.carrierId}'),
                Text('Up to ${offer.passengers} passengers'),
                const SizedBox(height: 16),
                TextButton(
                  onPressed: () => _showReviews(context, offer),
                  child: const Text(
                    'Show reviews',
                    style: TextStyle(color: GtColors.orange),
                  ),
                ),
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
                      label: 'Book',
                      onPressed: () =>
                          context.push('/payment/$rideId/$offerId'),
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

  void _showReviews(BuildContext context, Offer offer) {
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
            if (offer.reviews.isEmpty)
              const Text('No reviews yet', style: TextStyle(color: GtColors.textMuted))
            else
              ...offer.reviews.map(
                (r) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          ...List.generate(
                            r.stars,
                            (_) => const Icon(Icons.star, size: 14, color: GtColors.star),
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
}
