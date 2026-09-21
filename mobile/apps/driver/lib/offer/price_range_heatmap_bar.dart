import 'package:flutter/material.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';

import 'offer_helpers.dart';

/// Heatmap price range bar showing the eligible bid range (minBid to maxBid),
/// recommended guidance fare, and a dynamic real-time cursor reflecting
/// the driver's entered offer amount with acceptance probability odds.
class PriceRangeHeatmapBar extends StatelessWidget {
  const PriceRangeHeatmapBar({
    super.key,
    required this.minBid,
    required this.maxBid,
    required this.guidanceAmount,
    required this.currency,
    this.currentPrice,
    this.isRoundTrip = false,
    this.compact = false,
  });

  final double minBid;
  final double maxBid;
  final double guidanceAmount;
  final String currency;
  final double? currentPrice;
  final bool isRoundTrip;
  final bool compact;

  /// Helper to compute reliable pricing values with fallback if pricing is missing or 0.
  static ({double minBid, double maxBid, double guidanceAmount}) resolvePricing({
    PricingGuidance? pricing,
    String? distanceStr,
    bool isRoundTrip = false,
  }) {
    if (pricing != null && pricing.minBid > 0 && pricing.maxBid > pricing.minBid) {
      final guidance = pricing.guidanceAmount > 0
          ? pricing.guidanceAmount
          : (pricing.minBid + pricing.maxBid) / 2;
      return (
        minBid: pricing.minBid,
        maxBid: pricing.maxBid,
        guidanceAmount: guidance,
      );
    }

    // Fallback based on distance or base defaults
    double km = 0.0;
    if (distanceStr != null) {
      final match = RegExp(r'(\d+(?:\.\d+)?)').firstMatch(distanceStr);
      if (match != null) {
        km = double.tryParse(match.group(1) ?? '') ?? 0.0;
      }
    }

    final mult = isRoundTrip ? 2.0 : 1.0;
    final baseFare = km > 0 ? (20.0 + km * 1.85) : 60.0;
    final guidance = ((baseFare * mult) * 100).roundToDouble() / 100.0;
    final min = ((guidance * 0.75) * 100).roundToDouble() / 100.0;
    final max = ((guidance * 1.50) * 100).roundToDouble() / 100.0;

    return (
      minBid: min,
      maxBid: max,
      guidanceAmount: guidance,
    );
  }

  @override
  Widget build(BuildContext context) {
    final effectiveMin = minBid > 0 ? minBid : 1.0;
    final effectiveMax = maxBid > effectiveMin ? maxBid : effectiveMin * 1.5;
    final effectiveGuidance = guidanceAmount > 0
        ? guidanceAmount.clamp(effectiveMin, effectiveMax)
        : (effectiveMin + effectiveMax) / 2;

    final span = effectiveMax - effectiveMin;
    final hasPrice = currentPrice != null && currentPrice! > 0;

    // Fractional position between 0.0 and 1.0
    final double ratio;
    if (hasPrice) {
      ratio = ((currentPrice! - effectiveMin) / (span <= 0 ? 1.0 : span))
          .clamp(0.0, 1.0);
    } else {
      ratio = ((effectiveGuidance - effectiveMin) / (span <= 0 ? 1.0 : span))
          .clamp(0.0, 1.0);
    }

    final double guidanceRatio =
        ((effectiveGuidance - effectiveMin) / (span <= 0 ? 1.0 : span))
            .clamp(0.0, 1.0);

    // Dynamic acceptance odds and status badge
    final Color statusColor;
    final Color statusBg;
    final IconData statusIcon;
    final String statusText;
    final Color thumbColor;

    if (!hasPrice) {
      statusColor = GtColors.textSecondary;
      statusBg = GtColors.bgGrey;
      statusIcon = Icons.info_outline;
      statusText = 'Enter amount to see odds';
      thumbColor = GtColors.textMuted;
    } else if (currentPrice! < effectiveMin - 0.001) {
      statusColor = const Color(0xFFC62828);
      statusBg = const Color(0xFFFFEBEE);
      statusIcon = Icons.error_outline;
      statusText = 'Below minimum eligible';
      thumbColor = const Color(0xFFC62828);
    } else if (currentPrice! <= effectiveGuidance) {
      statusColor = const Color(0xFF1B5E20);
      statusBg = const Color(0xFFE8F5E9);
      statusIcon = Icons.check_circle_outline;
      statusText = 'Optimal · High acceptance odds';
      thumbColor = const Color(0xFF1B7A45);
    } else if (currentPrice! <= effectiveMax + 0.001) {
      statusColor = const Color(0xFFE65100);
      statusBg = const Color(0xFFFFF3E0);
      statusIcon = Icons.trending_up;
      statusText = 'Higher fare · Moderate odds';
      thumbColor = const Color(0xFFFF7043);
    } else {
      statusColor = const Color(0xFFC62828);
      statusBg = const Color(0xFFFFEBEE);
      statusIcon = Icons.warning_amber_rounded;
      statusText = 'Exceeds maximum eligible';
      thumbColor = const Color(0xFFC62828);
    }

    return Container(
      width: double.infinity,
      padding: EdgeInsets.symmetric(
        horizontal: 14,
        vertical: compact ? 10 : 14,
      ),
      decoration: BoxDecoration(
        color: const Color(0xFFF9FAFB),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: GtColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header row: Title & Real-time Status Badge
          Row(
            children: [
              const Icon(
                Icons.analytics_outlined,
                size: 16,
                color: GtColors.textSecondary,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  isRoundTrip
                      ? 'Total eligible price range'
                      : 'Eligible price range',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: GtColors.text,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: statusBg,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: statusColor.withValues(alpha: 0.25),
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(statusIcon, size: 12, color: statusColor),
                    const SizedBox(width: 4),
                    Text(
                      statusText,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: statusColor,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Heatmap Track & Thumb Indicator
          LayoutBuilder(
            builder: (context, constraints) {
              final barWidth = constraints.maxWidth;
              final pointerX = (barWidth * ratio).clamp(10.0, barWidth - 10.0);

              return Column(
                children: [
                  SizedBox(
                    height: 24,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        // Heatmap gradient track
                        ClipRRect(
                          borderRadius: BorderRadius.circular(5),
                          child: Container(
                            height: 10,
                            width: double.infinity,
                            decoration: const BoxDecoration(
                              gradient: LinearGradient(
                                colors: [
                                  Color(0xFF1B7A45), // Deep green (highest odds)
                                  Color(0xFF4CAF50), // Light green
                                  Color(0xFFFFB300), // Amber (fair market)
                                  Color(0xFFFF7043), // Orange (higher fare)
                                  Color(0xFFD32F2F), // Red (maximum limit)
                                ],
                                stops: [0.0, 0.25, 0.55, 0.82, 1.0],
                              ),
                            ),
                          ),
                        ),

                        // Guidance tick mark (market benchmark)
                        if (guidanceRatio > 0.06 && guidanceRatio < 0.94)
                          Positioned(
                            left: (barWidth * guidanceRatio)
                                .clamp(4.0, barWidth - 6.0),
                            child: Container(
                              width: 2,
                              height: 14,
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(1),
                                boxShadow: const [
                                  BoxShadow(
                                    color: Colors.black26,
                                    blurRadius: 2,
                                  ),
                                ],
                              ),
                            ),
                          ),

                        // Real-time cursor thumb
                        if (hasPrice)
                          Positioned(
                            left: pointerX - 10,
                            child: Container(
                              width: 20,
                              height: 20,
                              decoration: BoxDecoration(
                                color: Colors.white,
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: thumbColor,
                                  width: 3,
                                ),
                                boxShadow: const [
                                  BoxShadow(
                                    color: Colors.black26,
                                    blurRadius: 4,
                                    offset: Offset(0, 1.5),
                                  ),
                                ],
                              ),
                              child: Center(
                                child: Container(
                                  width: 6,
                                  height: 6,
                                  decoration: BoxDecoration(
                                    color: thumbColor,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 4),

                  // Min, Recommended, and Max fare values
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Min eligible',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w500,
                              color: GtColors.textMuted,
                            ),
                          ),
                          Text(
                            MoneyFormat.formatFlexible(effectiveMin, currency),
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: GtColors.text,
                            ),
                          ),
                        ],
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          const Text(
                            'Recommended',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w500,
                              color: GtColors.textMuted,
                            ),
                          ),
                          Text(
                            MoneyFormat.formatFlexible(
                              effectiveGuidance,
                              currency,
                            ),
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: GtColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          const Text(
                            'Max eligible',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w500,
                              color: GtColors.textMuted,
                            ),
                          ),
                          Text(
                            MoneyFormat.formatFlexible(effectiveMax, currency),
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: GtColors.text,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}
