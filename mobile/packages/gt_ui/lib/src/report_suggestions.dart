import 'package:flutter/material.dart';
import 'theme.dart';
import 'widgets.dart';

enum ReportTarget {
  driver,
  passenger,
}

class ReportSuggestionsData {
  static const List<String> driverSuggestions = [
    'Dangerous / Reckless driving',
    'Distracted driving / Phone use',
    'Unprofessional or rude',
    'Vehicle dirty / poor condition',
    'Wrong vehicle or license plate',
    'Detour / Wrong route taken',
    'Asked for cash or extra fare',
    'Late pickup / Unannounced delay',
    'Inappropriate conversation',
    'AC / Heating refused',
  ];

  static const List<String> passengerSuggestions = [
    'Rude / Disrespectful behavior',
    'Mess or spill in vehicle',
    'Damage to vehicle',
    'Demanded unsafe or illegal stop',
    'Excessive wait time at pickup',
    'Aggressive or threatening',
    'Intoxicated or unruly',
    'Extra unauthorized passengers',
    'Disputed route or fare',
    'Refused to wear seatbelt',
  ];

  static List<String> suggestionsFor({required ReportTarget target}) {
    return target == ReportTarget.driver
        ? driverSuggestions
        : passengerSuggestions;
  }

  static String sectionTitleFor(ReportTarget target) {
    return target == ReportTarget.driver
        ? 'Select what went wrong:'
        : 'Select the issue(s) encountered:';
  }
}

class GtReportSuggestions extends StatelessWidget {
  const GtReportSuggestions({
    super.key,
    required this.target,
    required this.selectedSuggestions,
    required this.onToggle,
    this.title,
  });

  final ReportTarget target;
  final Set<String> selectedSuggestions;
  final ValueChanged<String> onToggle;
  final String? title;

  @override
  Widget build(BuildContext context) {
    final items = ReportSuggestionsData.suggestionsFor(target: target);
    if (items.isEmpty) return const SizedBox.shrink();

    final heading = title ?? ReportSuggestionsData.sectionTitleFor(target);

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
                      Flexible(
                        child: Text(
                          suggestion,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: isSelected
                                ? FontWeight.w700
                                : FontWeight.w500,
                            color: isSelected ? GtColors.brand : GtColors.text,
                          ),
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

Future<bool?> showGtReportBottomSheet({
  required BuildContext context,
  required ReportTarget target,
  required Future<void> Function(List<String> reasons, String details) onSubmit,
  String? title,
  String? subtitle,
}) {
  final defaultTitle = target == ReportTarget.driver
      ? 'Report this ride'
      : 'Report this trip';
  final defaultSubtitle = target == ReportTarget.driver
      ? 'Select issues and tell us what happened. Our trust & safety team reviews every report.'
      : 'Select issues encountered with the passenger. We protect our driver community.';

  final sheetTitle = title ?? defaultTitle;
  final sheetSubtitle = subtitle ?? defaultSubtitle;

  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (ctx) {
      final selectedReasons = <String>{};
      final detailsCtrl = TextEditingController();
      bool isSubmitting = false;
      String? errorMessage;

      return StatefulBuilder(
        builder: (ctx, setLocal) {
          final canSubmit = selectedReasons.isNotEmpty ||
              detailsCtrl.text.trim().isNotEmpty;

          return Padding(
            padding: EdgeInsets.only(
              bottom: MediaQuery.of(ctx).viewInsets.bottom,
              left: 20,
              right: 20,
              top: 20,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.red.shade50,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(
                          Icons.flag_rounded,
                          color: Colors.red.shade700,
                          size: 22,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              sheetTitle,
                              style: const TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                                color: GtColors.text,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              sheetSubtitle,
                              style: const TextStyle(
                                fontSize: 12.5,
                                color: GtColors.textSecondary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const Divider(height: 24),
                  GtReportSuggestions(
                    target: target,
                    selectedSuggestions: selectedReasons,
                    onToggle: (reason) {
                      setLocal(() {
                        if (selectedReasons.contains(reason)) {
                          selectedReasons.remove(reason);
                        } else {
                          selectedReasons.add(reason);
                        }
                      });
                    },
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: detailsCtrl,
                    maxLines: 3,
                    onChanged: (_) => setLocal(() {}),
                    decoration: const InputDecoration(
                      hintText: 'Additional details or context (optional)',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  if (errorMessage != null) ...[
                    const SizedBox(height: 10),
                    Text(
                      errorMessage!,
                      style: const TextStyle(
                        color: Colors.red,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  GtGreenButton(
                    label: isSubmitting ? 'Submitting…' : 'Submit report',
                    onPressed: !canSubmit || isSubmitting
                        ? null
                        : () async {
                            setLocal(() {
                              isSubmitting = true;
                              errorMessage = null;
                            });
                            try {
                              await onSubmit(
                                selectedReasons.toList(),
                                detailsCtrl.text.trim(),
                              );
                              if (ctx.mounted) {
                                Navigator.pop(ctx, true);
                              }
                            } catch (e) {
                              setLocal(() {
                                isSubmitting = false;
                                errorMessage = e.toString().replaceFirst(
                                      'Exception: ',
                                      '',
                                    );
                              });
                            }
                          },
                  ),
                  TextButton(
                    onPressed: isSubmitting
                        ? null
                        : () => Navigator.pop(ctx, false),
                    child: const Text('Cancel'),
                  ),
                  const SizedBox(height: 10),
                ],
              ),
            ),
          );
        },
      );
    },
  );
}
