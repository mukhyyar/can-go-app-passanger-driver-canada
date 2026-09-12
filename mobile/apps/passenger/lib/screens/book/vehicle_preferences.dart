import 'package:flutter/material.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';

class VehiclePreferences extends StatelessWidget {
  const VehiclePreferences({
    super.key,
    required this.state,
    required this.showFromPrice,
  });

  final AppState state;
  final bool showFromPrice;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: showFromPrice ? 138 : 118,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: MockData.vehicleClasses.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final vc = MockData.vehicleClasses[i];
          final selected = state.vehicleClassIds.contains(vc.id);
          final priceValue = showFromPrice
              ? vc.fromPrice?.replaceFirst(
                  RegExp(r'^from\s+', caseSensitive: false),
                  '',
                )
              : null;
          return InkWell(
            onTap: () => state.toggleVehicleClass(vc.id),
            borderRadius: BorderRadius.circular(12),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              width: 108,
              padding: EdgeInsets.fromLTRB(
                showFromPrice ? 8 : 6,
                8,
                showFromPrice ? 8 : 6,
                8,
              ),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: selected ? GtColors.brand : const Color(0xFFE8C4A8),
                  width: selected ? 1.5 : 1,
                ),
              ),
              child: Column(
                crossAxisAlignment: showFromPrice
                    ? CrossAxisAlignment.start
                    : CrossAxisAlignment.center,
                children: [
                  Expanded(
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        Center(
                          child: vc.imageAsset != null
                              ? Image.asset(
                                  vc.imageAsset!,
                                  package: 'gt_ui',
                                  fit: BoxFit.contain,
                                  width: double.infinity,
                                  filterQuality: FilterQuality.medium,
                                  errorBuilder: (_, __, ___) => Icon(
                                    Icons.directions_car,
                                    size: 40,
                                    color: selected
                                        ? GtColors.brand
                                        : GtColors.text,
                                  ),
                                )
                              : Icon(
                                  Icons.directions_car,
                                  size: 40,
                                  color: selected
                                      ? GtColors.brand
                                      : GtColors.text,
                                ),
                        ),
                        if (selected)
                          const Positioned(
                            top: -2,
                            right: -2,
                            child: Icon(
                              Icons.check_circle,
                              size: 18,
                              color: GtColors.brand,
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    vc.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                  if (priceValue != null) ...[
                    const SizedBox(height: 2),
                    Text.rich(
                      TextSpan(
                        children: [
                          const TextSpan(
                            text: 'from ',
                            style: TextStyle(
                              color: GtColors.textSecondary,
                              fontWeight: FontWeight.w400,
                              fontSize: 11,
                            ),
                          ),
                          TextSpan(
                            text: priceValue,
                            style: const TextStyle(
                              color: Color(0xFF2E9E45),
                              fontWeight: FontWeight.w700,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
