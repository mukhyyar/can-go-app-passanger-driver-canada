import 'package:flutter/material.dart';
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
class BookScreen extends StatelessWidget {
  const BookScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final mode = state.serviceType;
    final showTo =
        mode != ServiceType.perHour || state.perHourHasEnd;
    final showSwap = mode == ServiceType.ride || mode == ServiceType.delivery;
    final showVehicles =
        mode == ServiceType.ride || mode == ServiceType.perHour;
    final showFromPrice = mode == ServiceType.perHour
        ? true
        : (state.from != null && state.to != null);

    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 24),
                children: [
                  const BookHeader(),
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
                    const _SectionLabel('Prefer for offers'),
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
