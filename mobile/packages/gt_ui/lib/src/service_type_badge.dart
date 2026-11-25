import 'package:flutter/material.dart';

/// Formats raw service type code (e.g. `PER_HOUR`, `DELIVERY`, `RIDE`)
/// into clean, user-facing label text (`Per Hour`, `Delivery`, `Ride`).
String formatServiceType(String? serviceType) {
  if (serviceType == null || serviceType.trim().isEmpty) return 'Ride';
  switch (serviceType.trim().toUpperCase()) {
    case 'PER_HOUR':
      return 'Per Hour';
    case 'DELIVERY':
      return 'Delivery';
    case 'CAR_RENTAL':
      return 'Car Rental';
    case 'EXPERIENCES':
      return 'Experiences';
    case 'RIDE':
    default:
      return 'Ride';
  }
}

/// Returns the icon representing the given service type.
IconData getServiceTypeIcon(String? serviceType) {
  if (serviceType == null || serviceType.trim().isEmpty) {
    return Icons.directions_car_rounded;
  }
  switch (serviceType.trim().toUpperCase()) {
    case 'PER_HOUR':
      return Icons.schedule_rounded;
    case 'DELIVERY':
      return Icons.inventory_2_outlined;
    case 'CAR_RENTAL':
      return Icons.car_rental_rounded;
    case 'EXPERIENCES':
      return Icons.explore_outlined;
    case 'RIDE':
    default:
      return Icons.directions_car_rounded;
  }
}

/// A chip / badge that visually identifies the type of service
/// (`Per Hour`, `Delivery`, or `Ride`).
class ServiceTypeBadge extends StatelessWidget {
  const ServiceTypeBadge({
    super.key,
    required this.serviceType,
    this.compact = false,
    this.showIcon = true,
    this.margin,
  });

  final String? serviceType;
  final bool compact;
  final bool showIcon;
  final EdgeInsetsGeometry? margin;

  @override
  Widget build(BuildContext context) {
    final typeUpper = (serviceType ?? '').trim().toUpperCase();
    final label = formatServiceType(serviceType);
    final icon = getServiceTypeIcon(serviceType);

    Color bg;
    Color border;
    Color fg;

    switch (typeUpper) {
      case 'PER_HOUR':
        // Soft violet/indigo
        bg = const Color(0xFFEDE7F6);
        border = const Color(0xFFD1C4E9);
        fg = const Color(0xFF512DA8);
        break;
      case 'DELIVERY':
        // Warm orange / amber for package/parcel delivery
        bg = const Color(0xFFFFF3E0);
        border = const Color(0xFFFFCC80);
        fg = const Color(0xFFE65100);
        break;
      case 'CAR_RENTAL':
        bg = const Color(0xFFE3F2FD);
        border = const Color(0xFF90CAF9);
        fg = const Color(0xFF1565C0);
        break;
      case 'EXPERIENCES':
        bg = const Color(0xFFFCE4EC);
        border = const Color(0xFFF48FB1);
        fg = const Color(0xFFAD1457);
        break;
      case 'RIDE':
      default:
        // Fresh teal / emerald for passenger rides
        bg = const Color(0xFFE0F2F1);
        border = const Color(0xFF80CBC4);
        fg = const Color(0xFF00695C);
        break;
    }

    final badge = Container(
      margin: margin,
      padding: compact
          ? const EdgeInsets.symmetric(horizontal: 6, vertical: 2)
          : const EdgeInsets.symmetric(horizontal: 8, vertical: 3.5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: border, width: 0.8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (showIcon) ...[
            Icon(icon, size: compact ? 12 : 13.5, color: fg),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              fontSize: compact ? 11 : 12,
              fontWeight: FontWeight.w700,
              color: fg,
              height: 1.15,
            ),
          ),
        ],
      ),
    );

    return badge;
  }
}
