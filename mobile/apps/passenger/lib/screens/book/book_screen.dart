import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/screens/book/book_header.dart';
import 'package:passenger/screens/book/extras_panel.dart';
import 'package:passenger/screens/book/get_offers_bar.dart';
import 'package:passenger/screens/book/route_hero.dart';
import 'package:passenger/screens/book/route_map_strip.dart';
import 'package:passenger/screens/book/service_mode_segment.dart';
import 'package:passenger/screens/book/trip_essentials.dart';
import 'package:passenger/screens/book/vehicle_preferences.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

/// Marketplace trip composer — Book tab (RIDE / PER HOUR / DELIVERY).
class BookScreen extends StatefulWidget {
  const BookScreen({super.key});

  @override
  State<BookScreen> createState() => _BookScreenState();
}

class _BookScreenState extends State<BookScreen> {
  final ScrollController _scrollController = ScrollController();
  ServiceType? _lastServiceType;

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  /// Scroll back to the top so the service-mode tabs are always reachable.
  void _resetScrollIfNeeded(ServiceType current) {
    if (_lastServiceType != null && _lastServiceType != current) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          _scrollController.animateTo(
            0,
            duration: const Duration(milliseconds: 260),
            curve: Curves.easeOutCubic,
          );
        }
      });
    }
    _lastServiceType = current;
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final mode = state.serviceType;
    _resetScrollIfNeeded(mode);

    final showTo = mode != ServiceType.perHour || state.perHourHasEnd;
    final showSwap = mode == ServiceType.ride || mode == ServiceType.delivery;
    final showVehicles =
        mode == ServiceType.ride || mode == ServiceType.perHour;
    final showFromPrice = mode == ServiceType.perHour
        ? true
        : (state.from != null && state.to != null);
    final activeRide = state.activeBookedRide;

    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Expanded(
              child: ListView(
                controller: _scrollController,
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 24),
                children: [
                  const BookHeader(),
                  if (activeRide != null) ...[
                    const SizedBox(height: 12),
                    _ActiveBookedRideCard(ride: activeRide),
                  ],
                  const SizedBox(height: 12),
                  ServiceModeSegment(state: state),
                  const SizedBox(height: 14),
                  const _SectionLabel('Your route'),
                  RouteHero(
                    state: state,
                    showTo: mode == ServiceType.perHour ? showTo : true,
                    showSwap: showSwap && showTo,
                  ),
                  const SizedBox(height: 12),
                  RouteMapStrip(state: state),
                  const SizedBox(height: 10),
                  const _SectionLabel('Trip essentials'),
                  TripEssentials(state: state),
                  if (showVehicles) ...[
                    const SizedBox(height: 14),
                    const Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        _SectionLabel('Prefer for offers'),
                        Padding(
                          padding: EdgeInsets.fromLTRB(0, 0, 2, 8),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.lock_outline,
                                size: 12,
                                color: GtColors.textMuted,
                              ),
                              SizedBox(width: 4),
                              Text(
                                'All classes included',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: GtColors.textMuted,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    VehiclePreferences(
                      state: state,
                      showFromPrice: showFromPrice,
                    ),
                  ],
                  const SizedBox(height: 14),
                  ExtrasPanel(state: state),
                  const SizedBox(height: 8),
                ],
              ),
            ),
            GetOffersBar(state: state),
          ],
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 0, 2, 8),
      child: Text(
        text.toUpperCase(),
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.6,
          color: GtColors.textMuted,
        ),
      ),
    );
  }
}

class _ActiveBookedRideCard extends StatelessWidget {
  const _ActiveBookedRideCard({required this.ride});
  final RideRequest ride;

  @override
  Widget build(BuildContext context) {
    final status = (ride.serverStatus ?? '').toUpperCase();
    final isOverdue = ride.isOverdueBooking;
    final statusText = isOverdue
        ? 'Scheduled ride not started · Action required'
        : status == 'DRIVER_EN_ROUTE'
            ? 'Driver is on the way'
            : status == 'DRIVER_ARRIVED'
                ? 'Driver has arrived'
                : status == 'IN_PROGRESS' || status == 'TRIP_STARTED'
                    ? 'Trip in progress'
                    : 'Driver confirmed · Pickup imminent';

    final bgColor =
        isOverdue ? const Color(0xFFFEF3C7) : const Color(0xFFF0FDF4);
    final borderColor =
        isOverdue ? const Color(0xFFFCD34D) : const Color(0xFFBBF7D0);
    final shadowColor = isOverdue
        ? Colors.amber.withValues(alpha: 0.12)
        : Colors.green.withValues(alpha: 0.06);
    final iconBgColor = isOverdue ? const Color(0xFFD97706) : GtColors.green;
    final iconData =
        isOverdue ? Icons.warning_amber_rounded : Icons.directions_car_filled_rounded;
    final statusTextColor =
        isOverdue ? const Color(0xFF92400E) : const Color(0xFF166534);
    final buttonBg = isOverdue ? const Color(0xFFD97706) : GtColors.brand;
    final buttonText = isOverdue ? 'Resolve' : 'View';

    return Container(
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor),
        boxShadow: [
          BoxShadow(
            color: shadowColor,
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => context.push('/ride/${ride.id}'),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: iconBgColor,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    iconData,
                    color: Colors.white,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              statusText,
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 13,
                                color: statusTextColor,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            '#${ride.displayId}',
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: GtColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${ride.from} → ${ride.to ?? "Destination"}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12,
                          color: GtColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: buttonBg,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    buttonText,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
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
