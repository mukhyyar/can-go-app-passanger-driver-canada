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

    final selected = state.selectedRoute;
    final distanceLabel = showTo
        ? (selected != null
            ? '${selected.distanceKm} km • ${selected.durationMin} min'
            : formatDistanceKm(haversineKm(from, to)))
        : null;

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: GtGoogleRouteMap(
            fromLat: from.lat,
            fromLng: from.lng,
            fromLabel: from.label,
            toLat: showTo ? to.lat : null,
            toLng: showTo ? to.lng : null,
            toLabel: showTo ? to.label : null,
            distanceLabel: distanceLabel,
            height: 220,
            initialRouteIndex: state.selectedRouteIndex,
            enableRouteSelection: true,
            onRoutesLoaded: (routes) {
              state.setAvailableRoutes(routes);
            },
            onRouteSelected: (route) {
              state.selectRoute(route);
            },
          ),
        ),
        if (showTo) _RouteSelectorCards(state: state),
      ],
    );
  }
}

class _RouteSelectorCards extends StatelessWidget {
  const _RouteSelectorCards({required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    final routes = state.availableRoutes;
    if (routes.length <= 1) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.alt_route_rounded,
                size: 16,
                color: GtColors.brand,
              ),
              const SizedBox(width: 6),
              const Text(
                'Available Routes',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: GtColors.text,
                ),
              ),
              const Spacer(),
              Text(
                'Tap route to select',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                  color: GtColors.textSecondary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: routes.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final r = routes[index];
              final isSelected = index == state.selectedRouteIndex;
              return InkWell(
                onTap: () => state.selectRouteIndex(index),
                borderRadius: BorderRadius.circular(12),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 220),
                  curve: Curves.easeOutCubic,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: isSelected
                        ? GtColors.brand.withValues(alpha: 0.08)
                        : Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: isSelected
                          ? GtColors.brand
                          : GtColors.border,
                      width: isSelected ? 1.8 : 1.0,
                    ),
                    boxShadow: isSelected
                        ? [
                            BoxShadow(
                              color: GtColors.brand.withValues(alpha: 0.18),
                              blurRadius: 8,
                              offset: const Offset(0, 2),
                            ),
                          ]
                        : const [
                            BoxShadow(
                              color: Color(0x0A000000),
                              blurRadius: 4,
                              offset: Offset(0, 1),
                            ),
                          ],
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(
                          color: isSelected
                              ? GtColors.brand
                              : const Color(0xFFF2F2F7),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          isSelected ? Icons.check : Icons.directions_car,
                          size: 16,
                          color: isSelected ? Colors.white : const Color(0xFF8E8E93),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    r.summary,
                                    style: TextStyle(
                                      fontSize: 13,
                                      fontWeight: isSelected ? FontWeight.w700 : FontWeight.w600,
                                      color: GtColors.text,
                                    ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                if (r.isFastest) ...[
                                  const SizedBox(width: 6),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF34C759).withValues(alpha: 0.15),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: const Text(
                                      'FASTEST',
                                      style: TextStyle(
                                        fontSize: 9,
                                        fontWeight: FontWeight.w800,
                                        color: Color(0xFF248A3D),
                                        letterSpacing: 0.3,
                                      ),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                            const SizedBox(height: 3),
                            Text(
                              '${r.distanceKm} km • ~${r.durationMin} min driving',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w500,
                                color: isSelected ? GtColors.brand : GtColors.textSecondary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
