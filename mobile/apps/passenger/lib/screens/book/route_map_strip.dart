import 'package:flutter/material.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';

class RouteMapStrip extends StatelessWidget {
  const RouteMapStrip({super.key, required this.state});

  final AppState state;

  bool get _showStrip {
    final from = state.from;
    return from != null && from.hasCoords;
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedSize(
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOutCubic,
      alignment: Alignment.topCenter,
      child: !_showStrip
          ? const SizedBox.shrink()
          : AnimatedOpacity(
              duration: const Duration(milliseconds: 250),
              opacity: 1,
              child: Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: _MapBody(state: state),
              ),
            ),
    );
  }
}

class _MapBody extends StatelessWidget {
  const _MapBody({required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    final from = state.from!;
    final to = state.to;
    final showTo = to != null &&
        to.hasCoords &&
        (state.serviceType != ServiceType.perHour || state.perHourHasEnd);

    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: GtGoogleRouteMap(
        fromLat: from.lat,
        fromLng: from.lng,
        fromLabel: from.label,
        toLat: showTo ? to.lat : null,
        toLng: showTo ? to.lng : null,
        toLabel: showTo ? to.label : null,
        distanceLabel:
            showTo ? formatDistanceKm(haversineKm(from, to)) : null,
        height: 200,
      ),
    );
  }
}
