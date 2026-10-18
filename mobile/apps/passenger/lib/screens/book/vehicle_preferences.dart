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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          height: showFromPrice ? 138 : 118,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: MockData.vehicleClasses.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (ctx, i) {
              final vc = MockData.vehicleClasses[i];
              final isLuxury = vc.id == 'premium' || vc.id == 'suv';
              final selected = state.vehicleClassIds.contains(vc.id);
              final priceValue = showFromPrice
                  ? vc.fromPrice?.replaceFirst(
                      RegExp(r'^from\s+', caseSensitive: false),
                      '',
                    )
                  : null;
              return InkWell(
                onTap: () {
                  ScaffoldMessenger.of(context).hideCurrentSnackBar();
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      behavior: SnackBarBehavior.floating,
                      duration: Duration(seconds: 2),
                      content: Text(
                        'All vehicle classes are selected to help you get the most driver offers.',
                      ),
                    ),
                  );
                },
                borderRadius: BorderRadius.circular(12),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  width: 108,
                  decoration: BoxDecoration(
                    color: isLuxury ? null : Colors.white,
                    gradient: isLuxury
                        ? const LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [
                              Color(0xFFFFFBEA), // luminous pale gold highlight
                              Color(0xFFFDE68A), // warm metallic amber gold
                              Color(0xFFF59E0B), // deep golden amber
                              Color(0xFFD97706), // rich gold base
                            ],
                            stops: [0.0, 0.35, 0.70, 1.0],
                          )
                        : null,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: isLuxury
                          ? (selected ? const Color(0xFFB45309) : const Color(0xFFF59E0B))
                          : (selected ? GtColors.brand : const Color(0xFFE8C4A8)),
                      width: isLuxury
                          ? (selected ? 2.0 : 1.4)
                          : (selected ? 1.5 : 1),
                    ),
                    boxShadow: isLuxury
                        ? [
                            BoxShadow(
                              color: const Color(0x38D97706),
                              blurRadius: 8,
                              offset: const Offset(0, 3),
                              spreadRadius: selected ? 1 : 0,
                            ),
                            if (selected)
                              const BoxShadow(
                                color: Color(0x30F59E0B),
                                blurRadius: 12,
                                offset: Offset(0, 1),
                              ),
                          ]
                        : null,
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(11),
                    child: Stack(
                      children: [
                        // Specular shine beam for luxury vehicles
                        if (isLuxury)
                          Positioned.fill(
                            child: IgnorePointer(
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    begin: const Alignment(-1.2, -1.2),
                                    end: const Alignment(1.2, 1.2),
                                    colors: [
                                      Colors.white.withValues(alpha: 0.0),
                                      Colors.white.withValues(alpha: 0.0),
                                      Colors.white.withValues(alpha: 0.42),
                                      Colors.white.withValues(alpha: 0.12),
                                      Colors.white.withValues(alpha: 0.0),
                                    ],
                                    stops: const [0.0, 0.30, 0.46, 0.58, 1.0],
                                  ),
                                ),
                              ),
                            ),
                          ),
                        Padding(
                          padding: EdgeInsets.fromLTRB(
                            showFromPrice ? 8 : 6,
                            8,
                            showFromPrice ? 8 : 6,
                            8,
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
                                                    ? (isLuxury
                                                        ? const Color(0xFFB45309)
                                                        : GtColors.brand)
                                                    : (isLuxury
                                                        ? const Color(0xFF78350F)
                                                        : GtColors.text),
                                              ),
                                            )
                                          : Icon(
                                              Icons.directions_car,
                                              size: 40,
                                              color: selected
                                                  ? (isLuxury
                                                      ? const Color(0xFFB45309)
                                                      : GtColors.brand)
                                                  : (isLuxury
                                                      ? const Color(0xFF78350F)
                                                      : GtColors.text),
                                            ),
                                    ),
                                    if (isLuxury)
                                      Positioned(
                                        top: -2,
                                        left: -2,
                                        child: Container(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 5,
                                            vertical: 1.5,
                                          ),
                                          decoration: BoxDecoration(
                                            gradient: const LinearGradient(
                                              colors: [
                                                Color(0xFF2E1704),
                                                Color(0xFF451A03),
                                              ],
                                            ),
                                            borderRadius: BorderRadius.circular(4),
                                            boxShadow: const [
                                              BoxShadow(
                                                color: Color(0x25000000),
                                                blurRadius: 2,
                                                offset: Offset(0, 1),
                                              ),
                                            ],
                                          ),
                                          child: const Row(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              Icon(
                                                Icons.star,
                                                size: 8,
                                                color: Color(0xFFFDE68A),
                                              ),
                                              SizedBox(width: 2),
                                              Text(
                                                'LUXE',
                                                style: TextStyle(
                                                  color: Color(0xFFFFFBE8),
                                                  fontSize: 8.5,
                                                  fontWeight: FontWeight.w800,
                                                  letterSpacing: 0.4,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                      ),
                                    if (selected)
                                      Positioned(
                                        top: -2,
                                        right: -2,
                                        child: Icon(
                                          Icons.check_circle,
                                          size: 18,
                                          color: isLuxury
                                              ? const Color(0xFFB45309)
                                              : GtColors.brand,
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 4),
                              Row(
                                mainAxisAlignment: showFromPrice
                                    ? MainAxisAlignment.start
                                    : MainAxisAlignment.center,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Flexible(
                                    child: Text(
                                      vc.name,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        fontWeight: isLuxury
                                            ? FontWeight.w800
                                            : FontWeight.w700,
                                        fontSize: 13,
                                        color: isLuxury
                                            ? const Color(0xFF2E1704)
                                            : Colors.black87,
                                        letterSpacing: isLuxury ? -0.2 : 0,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 3),
                                  Tooltip(
                                    message:
                                        '${vc.name} Capacity:\n• ${vc.seatsCapacityText} passenger seats\n• Up to ${vc.luggagePlaces} standard bags',
                                    triggerMode: TooltipTriggerMode.tap,
                                    showDuration: const Duration(seconds: 4),
                                    preferBelow: false,
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 10,
                                      vertical: 6,
                                    ),
                                    margin: const EdgeInsets.symmetric(horizontal: 16),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF1E293B),
                                      borderRadius: BorderRadius.circular(8),
                                      boxShadow: const [
                                        BoxShadow(
                                          color: Colors.black26,
                                          blurRadius: 4,
                                          offset: Offset(0, 2),
                                        ),
                                      ],
                                    ),
                                    textStyle: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 11.5,
                                      height: 1.3,
                                      fontWeight: FontWeight.w500,
                                    ),
                                    child: Padding(
                                      padding: const EdgeInsets.all(2.0),
                                      child: Icon(
                                        Icons.info_outline,
                                        size: 13,
                                        color: isLuxury
                                            ? const Color(0xFF78350F)
                                            : GtColors.textSecondary,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              if (priceValue != null) ...[
                                const SizedBox(height: 2),
                                Text.rich(
                                  TextSpan(
                                    children: [
                                      TextSpan(
                                        text: 'from ',
                                        style: TextStyle(
                                          color: isLuxury
                                              ? const Color(0xFF78350F)
                                              : GtColors.textSecondary,
                                          fontWeight: isLuxury
                                              ? FontWeight.w600
                                              : FontWeight.w400,
                                          fontSize: 11,
                                        ),
                                      ),
                                      TextSpan(
                                        text: priceValue,
                                        style: TextStyle(
                                          color: isLuxury
                                              ? const Color(0xFF0F5132)
                                              : const Color(0xFF2E9E45),
                                          fontWeight: FontWeight.w800,
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
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 6),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 2),
          child: Row(
            children: [
              Icon(
                Icons.info_outline,
                size: 13,
                color: GtColors.textSecondary,
              ),
              SizedBox(width: 5),
              Expanded(
                child: Text(
                  'All vehicle classes are selected to give you the most driver offers.',
                  style: TextStyle(
                    fontSize: 11,
                    color: GtColors.textSecondary,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
