import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';

class GetOffersBar extends StatelessWidget {
  const GetOffersBar({super.key, required this.state});

  final AppState state;

  String get _summary {
    final from = state.from?.label;
    final to = state.to?.label;
    final fromShort = _short(from) ?? 'Pickup';
    String toShort;
    if (state.serviceType == ServiceType.perHour && !state.perHourHasEnd) {
      toShort = 'Hourly';
    } else {
      toShort = _short(to) ?? 'Destination';
    }

    final parts = <String>['$fromShort → $toShort'];

    if (state.serviceType == ServiceType.delivery) {
      parts.add('Parcel');
    } else {
      parts.add(
        '${state.adults} adult${state.adults == 1 ? '' : 's'}',
      );
      final names = MockData.vehicleClasses
          .where((v) => state.vehicleClassIds.contains(v.id))
          .map((v) => v.name)
          .toList();
      if (names.isNotEmpty) {
        final shown = names.take(2).join(', ');
        parts.add(names.length > 2 ? '$shown…' : shown);
      }
    }
    return parts.join(' · ');
  }

  String? _short(String? label) {
    if (label == null || label.isEmpty) return null;
    if (label.length <= 22) return label;
    return '${label.substring(0, 20)}…';
  }

  Future<void> _submit(BuildContext context) async {
    if (state.from == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select a pickup location')),
      );
      return;
    }
    if (state.serviceType == ServiceType.ride ||
        state.serviceType == ServiceType.delivery) {
      if (state.to == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Please select a destination')),
        );
        return;
      }
    }
    if (!state.termsAccepted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please accept the terms of service')),
      );
      return;
    }
    if (!state.isAuthenticated) {
      if (!context.mounted) return;
      context.push('/auth');
      return;
    }
    try {
      final req = await state.createBookingRequestAsync();
      if (!context.mounted) return;
      context.push('/waiting/${req.id}');
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Booking failed: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final canSubmit = state.termsAccepted && state.from != null;

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            GtColors.bgGrey.withValues(alpha: 0),
            GtColors.bgGrey,
          ],
          stops: const [0.0, 0.22],
        ),
      ),
      padding: const EdgeInsets.fromLTRB(14, 8, 14, 10),
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: GtColors.border),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.08),
              blurRadius: 24,
              offset: const Offset(0, -4),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              _summary,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: GtColors.textSecondary,
              ),
            ),
            const SizedBox(height: 8),
            InkWell(
              onTap: () => state.setTermsAccepted(!state.termsAccepted),
              borderRadius: BorderRadius.circular(8),
              child: Row(
                children: [
                  SizedBox(
                    width: 22,
                    height: 22,
                    child: Checkbox(
                      value: state.termsAccepted,
                      activeColor: GtColors.brand,
                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      visualDensity: VisualDensity.compact,
                      onChanged: (v) => state.setTermsAccepted(v ?? false),
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'I agree to the terms of service',
                      style: TextStyle(
                        fontSize: 12,
                        color: GtColors.textSecondary,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            AnimatedOpacity(
              duration: const Duration(milliseconds: 180),
              opacity: canSubmit ? 1 : 0.55,
              child: GtGreenButton(
                label: 'Get offers',
                onPressed: () => _submit(context),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
