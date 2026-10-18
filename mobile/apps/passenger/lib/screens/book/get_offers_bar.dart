import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';
import '../../utils/error_utils.dart';
class GetOffersBar extends StatefulWidget {
  const GetOffersBar({super.key, required this.state});

  final AppState state;

  @override
  State<GetOffersBar> createState() => _GetOffersBarState();
}

class _GetOffersBarState extends State<GetOffersBar> {
  bool _isSubmitting = false;

  AppState get state => widget.state;

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
        if (names.length == MockData.vehicleClasses.length) {
          parts.add('All classes');
        } else {
          final shown = names.take(2).join(', ');
          parts.add(names.length > 2 ? '$shown…' : shown);
        }
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
    if (_isSubmitting || state.isCreatingBooking) return;

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
      if (!state.canSubmitWithCurrentRoute) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              state.routeRecalcFailed
                  ? 'Route calculation failed. Adjust pickup/drop-off and try again.'
                  : 'Waiting for driving route distance. Please wait or adjust locations.',
            ),
          ),
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

    final now = DateTime.now();
    if (!state.pickupNow && state.pickupDateTime.isBefore(now.subtract(const Duration(minutes: 2)))) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pickup time cannot be in the past')),
      );
      return;
    }
    if (state.returnEnabled && state.returnDateTime != null) {
      if (state.returnDateTime!.isBefore(now.subtract(const Duration(minutes: 2)))) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Return time cannot be in the past')),
        );
        return;
      }
      if (!state.returnDateTime!.isAfter(state.effectivePickupDateTime)) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Return time must be after pickup time')),
        );
        return;
      }
    }

    setState(() => _isSubmitting = true);
    try {
      final req = await state.createBookingRequestAsync();
      if (!context.mounted) return;
      context.push('/waiting/${req.id}');
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Booking failed: ${cleanErrorMessage(e)}')),
      );
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isSubmitting = _isSubmitting || state.isCreatingBooking;
    final needsRoute = state.serviceType == ServiceType.ride ||
        state.serviceType == ServiceType.delivery;
    final canSubmit = state.termsAccepted &&
        state.from != null &&
        (!needsRoute || state.canSubmitWithCurrentRoute);

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
              onTap: isSubmitting
                  ? null
                  : () => state.setTermsAccepted(!state.termsAccepted),
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
                      onChanged: isSubmitting
                          ? null
                          : (v) => state.setTermsAccepted(v ?? false),
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
              opacity: canSubmit && !isSubmitting ? 1 : 0.55,
              child: GtGreenButton(
                label: isSubmitting ? 'Getting offers…' : 'Get offers',
                onPressed: isSubmitting ? null : () => _submit(context),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
