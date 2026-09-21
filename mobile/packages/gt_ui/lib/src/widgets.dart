import 'package:flutter/material.dart';
import 'theme.dart';

class GtGreenButton extends StatelessWidget {
  const GtGreenButton({
    super.key,
    required this.label,
    this.onPressed,
    this.fullWidth = true,
    this.icon,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool fullWidth;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final child = icon == null
        ? Text(label)
        : Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(label),
              const SizedBox(width: 8),
              Icon(icon, size: 18),
            ],
          );
    return SizedBox(
      width: fullWidth ? double.infinity : null,
      height: 48,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: GtColors.brand,
          foregroundColor: Colors.white,
          disabledBackgroundColor: GtColors.border,
          elevation: 2,
          shadowColor: const Color(0x47C8102E),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
        child: child,
      ),
    );
  }
}

class GtOrangePill extends StatelessWidget {
  const GtOrangePill({
    super.key,
    required this.label,
    this.onTap,
    this.selected = true,
  });
  final String label;
  final VoidCallback? onTap;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: selected ? GtColors.brand : GtColors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: GtColors.brand, width: 1.5),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? Colors.white : GtColors.brand,
              fontWeight: FontWeight.w600,
              fontSize: 13,
            ),
          ),
        ),
      ),
    );
  }
}

class GtCard extends StatelessWidget {
  const GtCard({super.key, required this.child, this.padding, this.onTap});
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final box = Container(
      width: double.infinity,
      padding: padding ?? const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: GtColors.border),
      ),
      child: child,
    );
    if (onTap == null) return box;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: box,
    );
  }
}

class GtPointLabel extends StatelessWidget {
  const GtPointLabel({super.key, required this.letter});
  final String letter;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 22,
      height: 22,
      alignment: Alignment.center,
      decoration: const BoxDecoration(
        color: GtColors.text,
        shape: BoxShape.circle,
      ),
      child: Text(
        letter,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class GtRouteRow extends StatelessWidget {
  const GtRouteRow({
    super.key,
    required this.from,
    this.to,
    this.distance,
    this.duration,
    this.timeBadge,
  });

  final String from;
  final String? to;
  final String? distance;
  final String? duration;
  final String? timeBadge;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            const GtPointLabel(letter: 'A'),
            Container(
              width: 2,
              height: to == null ? 28 : 36,
              margin: const EdgeInsets.symmetric(vertical: 4),
              color: GtColors.border,
            ),
            if (to != null)
              const GtPointLabel(letter: 'B')
            else if (timeBadge != null)
              const Icon(Icons.access_time, color: GtColors.orange, size: 20),
          ],
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(from, style: const TextStyle(fontSize: 14, height: 1.3)),
              if (distance != null || duration != null) ...[
                const SizedBox(height: 6),
                Row(
                  children: [
                    if (distance != null) ...[
                      const Icon(Icons.route, size: 14, color: GtColors.textMuted),
                      const SizedBox(width: 4),
                      Text(distance!, style: const TextStyle(fontSize: 12, color: GtColors.textSecondary)),
                      const SizedBox(width: 10),
                    ],
                    if (duration != null) ...[
                      const Icon(Icons.schedule, size: 14, color: GtColors.textMuted),
                      const SizedBox(width: 4),
                      Text(duration!, style: const TextStyle(fontSize: 12, color: GtColors.textSecondary)),
                    ],
                  ],
                ),
              ],
              if (to != null) ...[
                const SizedBox(height: 10),
                Text(to!, style: const TextStyle(fontSize: 14, height: 1.3)),
              ] else if (timeBadge != null) ...[
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: GtColors.soft,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(timeBadge!, style: const TextStyle(fontSize: 13)),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class GtStepper extends StatelessWidget {
  const GtStepper({
    super.key,
    required this.value,
    required this.onChanged,
    this.min = 1,
    this.max = 20,
  });

  final int value;
  final ValueChanged<int> onChanged;
  final int min;
  final int max;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _circle(Icons.remove, value > min ? () => onChanged(value - 1) : null),
        Container(
          width: 40,
          alignment: Alignment.center,
          margin: const EdgeInsets.symmetric(horizontal: 6),
          padding: const EdgeInsets.symmetric(vertical: 6),
          decoration: BoxDecoration(
            border: Border.all(color: GtColors.border),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text('$value', style: const TextStyle(fontWeight: FontWeight.w600)),
        ),
        _circle(Icons.add, value < max ? () => onChanged(value + 1) : null),
      ],
    );
  }

  Widget _circle(IconData icon, VoidCallback? onTap) {
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: GtColors.border),
        ),
        child: Icon(icon, size: 16, color: onTap == null ? GtColors.textMuted : GtColors.brand),
      ),
    );
  }
}

class GtBottomNav extends StatelessWidget {
  const GtBottomNav({
    super.key,
    required this.index,
    required this.items,
    required this.onTap,
  });

  final int index;
  final List<GtNavItem> items;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: GtColors.border)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 58,
          child: Row(
            children: List.generate(items.length, (i) {
              final selected = i == index;
              final color = selected ? GtColors.brand : GtColors.textSecondary;
              return Expanded(
                child: InkWell(
                  onTap: () => onTap(i),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Badge(
                        isLabelVisible: items[i].badge > 0,
                        label: Text('${items[i].badge}'),
                        child: Icon(items[i].icon, color: color, size: 22),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        items[i].label,
                        style: TextStyle(fontSize: 11, color: color, fontWeight: selected ? FontWeight.w600 : FontWeight.w400),
                      ),
                    ],
                  ),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}

class GtNavItem {
  const GtNavItem({required this.icon, required this.label, this.badge = 0});
  final IconData icon;
  final String label;
  final int badge;
}

class GtUnderlineField extends StatelessWidget {
  const GtUnderlineField({
    super.key,
    required this.hint,
    this.controller,
    this.onTap,
    this.readOnly = false,
    this.suffix,
  });

  final String hint;
  final TextEditingController? controller;
  final VoidCallback? onTap;
  final bool readOnly;
  final Widget? suffix;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      readOnly: readOnly,
      onTap: onTap,
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: GtColors.textMuted),
        border: const UnderlineInputBorder(borderSide: BorderSide(color: GtColors.border)),
        enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: GtColors.border)),
        focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: GtColors.orange)),
        suffixIcon: suffix,
      ),
    );
  }
}

Future<T?> showGtSheet<T>({
  required BuildContext context,
  required Widget child,
  bool isScrollControlled = true,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: isScrollControlled,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (_) => child,
  );
}

class GtVehicleChips extends StatelessWidget {
  const GtVehicleChips({
    super.key,
    this.types = const [],
    this.rawNeed,
    this.passengers,
  });

  final List<String> types;
  final String? rawNeed;
  final int? passengers;

  static String formatLabel(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return trimmed;
    final lower = trimmed.toLowerCase();
    if (lower == 'suv') return 'SUV';
    if (lower == 'vip') return 'VIP';
    final words = trimmed.replaceAll('_', ' ').split(' ');
    return words.map((w) {
      if (w.isEmpty) return w;
      if (w.toLowerCase() == 'suv') return 'SUV';
      if (w.toLowerCase() == 'vip') return 'VIP';
      return '${w[0].toUpperCase()}${w.substring(1).toLowerCase()}';
    }).join(' ');
  }

  static IconData vehicleIcon(String raw) {
    final lower = raw.toLowerCase().trim();
    if (lower.contains('van') || lower.contains('minibus') || lower.contains('bus')) {
      return Icons.airport_shuttle_outlined;
    }
    if (lower.contains('suv')) {
      return Icons.directions_car_filled_outlined;
    }
    if (lower.contains('vip') || lower.contains('business') || lower.contains('premium')) {
      return Icons.airline_seat_recline_extra_outlined;
    }
    return Icons.directions_car_outlined;
  }

  List<String> get _resolvedTypes {
    if (types.isNotEmpty) {
      return types
          .expand((t) => t.split(','))
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();
    }
    if (rawNeed != null && rawNeed!.trim().isNotEmpty) {
      return rawNeed!
          .split(',')
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();
    }
    return const [];
  }

  @override
  Widget build(BuildContext context) {
    final list = _resolvedTypes;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: list.isEmpty
              ? const SizedBox.shrink()
              : Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final t in list)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: GtColors.bgGrey,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: GtColors.border),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              vehicleIcon(t),
                              size: 13,
                              color: GtColors.textSecondary,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              formatLabel(t),
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: GtColors.text,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
        ),
        if (passengers != null && passengers! > 0) ...[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: GtColors.soft,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: GtColors.brand.withValues(alpha: 0.16),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.person_outline, size: 14, color: GtColors.brand),
                const SizedBox(width: 3),
                Text(
                  '× $passengers',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: GtColors.brand,
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

