import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

class OffersScreen extends StatelessWidget {
  const OffersScreen({super.key, required this.rideId});
  final String rideId;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final ride = state.rideById(rideId);
    final offers = state.offersFor(rideId);

    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      appBar: AppBar(
        title: Text('Offers · #$rideId'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.canPop() ? context.pop() : context.go('/'),
        ),
      ),
      body: Column(
        children: [
          if (ride != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
              child: GtCard(
                child: GtRouteRow(
                  from: ride.from,
                  to: ride.to,
                  distance: ride.distance,
                  duration: ride.duration,
                  timeBadge: ride.timeBadge,
                ),
              ),
            ),
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.all(12),
              itemCount: offers.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (_, i) {
                final o = offers[i];
                return _OfferCard(
                  offer: o,
                  onTap: () => context.push('/offer/$rideId/${o.id}'),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _OfferCard extends StatelessWidget {
  const _OfferCard({required this.offer, required this.onTap});
  final Offer offer;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GtCard(
      onTap: onTap,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 72,
            height: 56,
            decoration: BoxDecoration(
              color: GtColors.bgGrey,
              borderRadius: BorderRadius.circular(8),
            ),
            clipBehavior: Clip.antiAlias,
            child: MockData.vehicleImageAsset(offer.vehicleClass) != null
                ? Image.asset(
                    MockData.vehicleImageAsset(offer.vehicleClass)!,
                    package: 'gt_ui',
                    fit: BoxFit.contain,
                  )
                : const Icon(Icons.directions_car, size: 32),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${offer.vehicleBrand} ${offer.vehicleModel}',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 2),
                Text(
                  offer.vehicleClass,
                  style: const TextStyle(color: GtColors.textSecondary, fontSize: 13),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Icon(Icons.star, size: 14, color: GtColors.star),
                    const SizedBox(width: 4),
                    Text(
                      '${offer.rating} (${offer.ratingCount})',
                      style: const TextStyle(fontSize: 13),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '${offer.rides} rides',
                      style: const TextStyle(fontSize: 12, color: GtColors.textMuted),
                    ),
                  ],
                ),
                if (offer.options.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    offer.options.take(3).join(' · '),
                    style: const TextStyle(fontSize: 12, color: GtColors.textSecondary),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                offer.priceLabel,
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
              ),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: GtColors.green,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text(
                  'BOOK',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
