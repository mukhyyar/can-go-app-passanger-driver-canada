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
    "Can't find the rider",
    'Nowhere to stop',
    "Rider's items don't fit",
    'Too many riders',
    'Unaccompanied minor',
    'No car seat',
    'Rider has an animal',
    'Rider behaviour',
  ];

  static List<String> suggestionsFor({required ReportTarget target}) {
    return target == ReportTarget.driver
        ? driverSuggestions
        : passengerSuggestions;
  }

  static String sectionTitleFor(ReportTarget target) {
    return target == ReportTarget.driver
        ? 'Select what went wrong:'
        : 'Something wrong? Choose an issue:';
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

  static IconData _iconFor(String suggestion) {
    final s = suggestion.toLowerCase();
    if (s.contains('find')) return Icons.help_outline_rounded;
    if (s.contains('stop')) return Icons.do_not_disturb_alt_rounded;
    if (s.contains('fit') || s.contains('luggage')) return Icons.luggage_rounded;
    if (s.contains('many')) return Icons.groups_rounded;
    if (s.contains('minor')) return Icons.family_restroom_rounded;
    if (s.contains('seat')) return Icons.child_care_rounded;
    if (s.contains('animal') || s.contains('pet')) return Icons.pets_rounded;
    if (s.contains('behavio')) return Icons.warning_amber_rounded;
    if (s.contains('mess') || s.contains('spill') || s.contains('dirty')) return Icons.cleaning_services_rounded;
    if (s.contains('damage')) return Icons.car_crash_rounded;
    if (s.contains('drive') || s.contains('reckless')) return Icons.warning_amber_rounded;
    if (s.contains('phone')) return Icons.phone_android_rounded;
    if (s.contains('unprofessional') || s.contains('rude')) return Icons.person_off_rounded;
    if (s.contains('wrong vehicle')) return Icons.directions_car_rounded;
    if (s.contains('detour') || s.contains('route')) return Icons.alt_route_rounded;
    if (s.contains('cash') || s.contains('fare')) return Icons.money_off_rounded;
    if (s.contains('late') || s.contains('delay') || s.contains('wait')) return Icons.schedule_rounded;
    if (s.contains('conversation')) return Icons.chat_bubble_outline_rounded;
    if (s.contains('ac') || s.contains('heating')) return Icons.ac_unit_rounded;
    return Icons.info_outline_rounded;
  }

  @override
  Widget build(BuildContext context) {
    final items = ReportSuggestionsData.suggestionsFor(target: target);
    if (items.isEmpty) return const SizedBox.shrink();

    final heading = title ?? ReportSuggestionsData.sectionTitleFor(target);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (target == ReportTarget.passenger)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              heading,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: GtColors.textSecondary,
              ),
            ),
          )
        else ...[
          Text(
            heading,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: GtColors.text,
            ),
          ),
          const SizedBox(height: 8),
        ],
        Column(
          children: items.map((suggestion) {
            final isSelected = selectedSuggestions.contains(suggestion);
            return Column(
              children: [
                Material(
                  color: Colors.transparent,
                  child: InkWell(
                    onTap: () => onToggle(suggestion),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Row(
                        children: [
                          Icon(
                            _iconFor(suggestion),
                            color: GtColors.text,
                            size: 24,
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Text(
                              suggestion,
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                                color: GtColors.text,
                              ),
                            ),
                          ),
                          if (isSelected)
                            const Icon(
                              Icons.check_circle_rounded,
                              color: GtColors.brand,
                              size: 24,
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
                const Divider(height: 1, color: GtColors.border),
              ],
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
                  if (target == ReportTarget.driver) ...[
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
                  ] else ...[
                    Row(
                      children: [
                        IconButton(
                          icon: const Icon(Icons.close_rounded),
                          onPressed: () => Navigator.pop(ctx, false),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                  ],
                  if (isSubmitting && target == ReportTarget.passenger)
                    const Center(
                      child: Padding(
                        padding: EdgeInsets.symmetric(vertical: 24),
                        child: CircularProgressIndicator(),
                      ),
                    )
                  else
                    GtReportSuggestions(
                      target: target,
                      selectedSuggestions: selectedReasons,
                      onToggle: (reason) async {
                        if (target == ReportTarget.passenger) {
                          setLocal(() {
                            isSubmitting = true;
                            errorMessage = null;
                          });
                          try {
                            await onSubmit([reason], '');
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
                        } else {
                          setLocal(() {
                            if (selectedReasons.contains(reason)) {
                              selectedReasons.remove(reason);
                            } else {
                              selectedReasons.add(reason);
                            }
                          });
                        }
                      },
                    ),
                  if (target == ReportTarget.driver) ...[
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
                  ],
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
                  if (target == ReportTarget.driver) ...[
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
                ],
              ),
            ),
          );
        },
      );
    },
  );
}
