import 'package:flutter/material.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';

class ServiceModeSegment extends StatelessWidget {
  const ServiceModeSegment({super.key, required this.state});

  final AppState state;

  static const _items = <(ServiceType, String)>[
    (ServiceType.ride, 'RIDE'),
    (ServiceType.perHour, 'PER HOUR'),
    (ServiceType.delivery, 'DELIVERY'),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: const Color(0xFFEBEBEC),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          for (final (type, label) in _items)
            Expanded(
              child: _SegmentTab(
                label: label,
                selected: state.serviceType == type,
                onTap: () => state.setServiceType(type),
              ),
            ),
        ],
      ),
    );
  }
}

class _SegmentTab extends StatelessWidget {
  const _SegmentTab({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(9),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: selected ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(9),
            boxShadow: selected
                ? [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.08),
                      blurRadius: 4,
                      offset: const Offset(0, 1),
                    ),
                  ]
                : null,
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.2,
              color: selected ? GtColors.brand : GtColors.textSecondary,
            ),
          ),
        ),
      ),
    );
  }
}
