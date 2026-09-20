import 'package:flutter/material.dart';
import 'theme.dart';

enum ReviewTarget {
  driver,
  passenger,
}

class ReviewSuggestionsData {
  static const Map<int, List<String>> driverSuggestions = {
    5: [
      'Clean vehicle',
      'Smooth driving',
      'Polite & professional',
      'Punctual pickup',
      'Great conversation',
      'Comfortable ride',
    ],
    4: [
      'Good driving',
      'Pleasant ride',
      'Clean vehicle',
      'Friendly driver',
      'On-time pickup',
    ],
    3: [
      'Average ride',
      'Could be cleaner',
      'Slight delay',
      'Minor route detour',
      'Driving could improve',
    ],
    2: [
      'Late arrival',
      'Rough driving',
      'Car not clean',
      'Poor navigation',
      'Unfriendly service',
    ],
    1: [
      'Unsafe driving',
      'Excessive delay',
      'Rude behavior',
      'Dirty vehicle',
      'Wrong destination',
    ],
  };

  static const Map<int, List<String>> passengerSuggestions = {
    5: [
      'Polite & respectful',
      'Ready at pickup',
      'Clean & tidy rider',
      'Great communication',
      'Pleasant conversation',
      'Followed ride rules',
    ],
    4: [
      'On time',
      'Pleasant passenger',
      'Good communication',
      'Respectful rider',
    ],
    3: [
      'Delayed at pickup',
      'Hard to locate',
      'Minor communication delay',
      'Quiet ride',
    ],
    2: [
      'Long wait time',
      'Difficult pickup location',
      'Mess left in vehicle',
      'Slow to respond',
    ],
    1: [
      'Rude / Disrespectful',
      'Excessive wait time',
      'Demanded unsafe stops',
      'Left trash in car',
      'Ignored messages',
    ],
  };

  static List<String> suggestionsFor({
    required ReviewTarget target,
    required int stars,
  }) {
    final clamped = stars.clamp(1, 5);
    final map = target == ReviewTarget.driver
        ? driverSuggestions
        : passengerSuggestions;
    return map[clamped] ?? const [];
  }

  static String sectionTitleFor(int stars) {
    if (stars >= 4) {
      return 'What went well?';
    } else if (stars == 3) {
      return 'What could be improved?';
    } else {
      return 'What went wrong?';
    }
  }
}

class GtReviewSuggestions extends StatelessWidget {
  const GtReviewSuggestions({
    super.key,
    required this.target,
    required this.stars,
    required this.selectedSuggestions,
    required this.onToggle,
    this.title,
  });

  final ReviewTarget target;
  final int stars;
  final Set<String> selectedSuggestions;
  final ValueChanged<String> onToggle;
  final String? title;

  @override
  Widget build(BuildContext context) {
    final items = ReviewSuggestionsData.suggestionsFor(
      target: target,
      stars: stars,
    );
    if (items.isEmpty) return const SizedBox.shrink();

    final heading = title ?? ReviewSuggestionsData.sectionTitleFor(stars);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          heading,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: GtColors.text,
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: items.map((suggestion) {
            final isSelected = selectedSuggestions.contains(suggestion);
            return Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: () => onToggle(suggestion),
                borderRadius: BorderRadius.circular(20),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 11,
                    vertical: 7,
                  ),
                  decoration: BoxDecoration(
                    color: isSelected
                        ? GtColors.brand.withValues(alpha: 0.1)
                        : GtColors.bgGrey,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: isSelected ? GtColors.brand : GtColors.border,
                      width: isSelected ? 1.3 : 1.0,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        isSelected ? Icons.check_rounded : Icons.add_rounded,
                        size: 14,
                        color: isSelected
                            ? GtColors.brand
                            : GtColors.textSecondary,
                      ),
                      const SizedBox(width: 5),
                      Text(
                        suggestion,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: isSelected
                              ? FontWeight.w700
                              : FontWeight.w500,
                          color: isSelected ? GtColors.brand : GtColors.text,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }
}
