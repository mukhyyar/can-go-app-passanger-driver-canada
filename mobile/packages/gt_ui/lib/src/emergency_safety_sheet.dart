import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import 'theme.dart';

class EmergencyTripInfo {
  final String? rideId;
  final String? vehiclePlate;
  final String? vehicleModel;
  final String? passengerName;
  final String? driverName;
  final String? pickupAddress;
  final String? dropoffAddress;

  const EmergencyTripInfo({
    this.rideId,
    this.vehiclePlate,
    this.vehicleModel,
    this.passengerName,
    this.driverName,
    this.pickupAddress,
    this.dropoffAddress,
  });

  String toFormattedDetails() {
    final buffer = StringBuffer();
    if (rideId != null && rideId!.isNotEmpty) {
      buffer.writeln('Ride Code: $rideId');
    }
    if (vehiclePlate != null && vehiclePlate!.isNotEmpty) {
      buffer.writeln(
          'Vehicle: ${vehicleModel ?? ''} (${vehiclePlate!.toUpperCase()})');
    }
    if (driverName != null && driverName!.isNotEmpty) {
      buffer.writeln('Driver: $driverName');
    }
    if (passengerName != null && passengerName!.isNotEmpty) {
      buffer.writeln('Passenger: $passengerName');
    }
    if (pickupAddress != null && pickupAddress!.isNotEmpty) {
      buffer.writeln('Pickup: $pickupAddress');
    }
    if (dropoffAddress != null && dropoffAddress!.isNotEmpty) {
      buffer.writeln('Drop-off: $dropoffAddress');
    }
    return buffer.toString().trim();
  }
}

class EmergencySafetySheet extends StatelessWidget {
  final EmergencyTripInfo? tripInfo;
  final bool isDriver;
  final VoidCallback? onStopTripForSafety;
  final VoidCallback? onContactSupport;

  const EmergencySafetySheet({
    super.key,
    this.tripInfo,
    this.isDriver = false,
    this.onStopTripForSafety,
    this.onContactSupport,
  });

  static Future<void> show(
    BuildContext context, {
    EmergencyTripInfo? tripInfo,
    bool isDriver = false,
    VoidCallback? onStopTripForSafety,
    VoidCallback? onContactSupport,
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => EmergencySafetySheet(
        tripInfo: tripInfo,
        isDriver: isDriver,
        onStopTripForSafety: onStopTripForSafety,
        onContactSupport: onContactSupport,
      ),
    );
  }

  Future<void> _call911(BuildContext context) async {
    final uri = Uri.parse('tel:911');
    try {
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri);
      } else {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Please dial 911 on your phone dialer')),
          );
        }
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Please dial 911 on your phone dialer')),
        );
      }
    }
  }

  void _copyTripDetails(BuildContext context) {
    if (tripInfo == null) return;
    final text = tripInfo!.toFormattedDetails();
    if (text.isEmpty) return;
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Trip details copied to clipboard to share with 911 dispatch'),
        duration: Duration(seconds: 3),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final formattedDetails = tripInfo?.toFormattedDetails() ?? '';

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(
        20,
        12,
        20,
        24 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: GtColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Header
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: Colors.red.shade50,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.local_police_rounded,
                    color: Colors.red.shade700,
                    size: 26,
                  ),
                ),
                const SizedBox(width: 14),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Emergency & Safety',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: GtColors.text,
                        ),
                      ),
                      SizedBox(height: 2),
                      Text(
                        'Safety overrides completion of a booking.',
                        style: TextStyle(
                          fontSize: 12,
                          color: GtColors.textSecondary,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),

            // 911 Emergency Card
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.red.shade700,
                borderRadius: BorderRadius.circular(14),
                boxShadow: [
                  BoxShadow(
                    color: Colors.red.shade200.withValues(alpha: 0.5),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.warning_amber_rounded,
                          color: Colors.white, size: 24),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'For emergencies, call 911',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'If there is an immediate safety threat, medical crisis, or unlawful conduct, call 911 immediately.',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      height: 1.35,
                    ),
                  ),
                  const SizedBox(height: 14),
                  ElevatedButton.icon(
                    onPressed: () => _call911(context),
                    icon: const Icon(Icons.phone, color: Colors.red),
                    label: const Text(
                      'CALL 911 NOW',
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                        letterSpacing: 0.5,
                        color: Colors.red,
                      ),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: Colors.red.shade700,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                      elevation: 0,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Mandatory Non-Emergency Disclaimer Box
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFFF7ED),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFFFEDD5)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.info_outline_rounded,
                    color: Colors.orange.shade800,
                    size: 20,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'CAN-RIDE Support is not an emergency service',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: Colors.orange.shade900,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'CAN-RIDE Support should not be represented as an emergency-response service. In an emergency or life-threatening situation, always contact 911 first.',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.orange.shade900,
                            height: 1.35,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Trip Information Card (if active ride)
            if (formattedDetails.isNotEmpty) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: GtColors.bgGrey,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: GtColors.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Trip Information for 911 Dispatch',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: GtColors.textSecondary,
                          ),
                        ),
                        InkWell(
                          onTap: () => _copyTripDetails(context),
                          borderRadius: BorderRadius.circular(4),
                          child: const Padding(
                            padding: EdgeInsets.symmetric(
                                horizontal: 6, vertical: 2),
                            child: Row(
                              children: [
                                Icon(Icons.copy_rounded,
                                    size: 13, color: GtColors.brand),
                                SizedBox(width: 4),
                                Text(
                                  'Copy',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: GtColors.brand,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      formattedDetails,
                      style: const TextStyle(
                        fontSize: 12,
                        fontFamily: 'monospace',
                        color: GtColors.text,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
            ],

            // Stop Trip for Safety Button (if driver)
            if (isDriver && onStopTripForSafety != null) ...[
              OutlinedButton.icon(
                onPressed: () {
                  Navigator.of(context).pop();
                  onStopTripForSafety!();
                },
                icon: const Icon(Icons.shield_outlined, color: Colors.red),
                label: const Text(
                  'Stop Trip / Refuse for Safety',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: Colors.red,
                  ),
                ),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: Colors.red, width: 1.5),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
              ),
              const SizedBox(height: 10),
            ],

            // Non-Emergency Support Button
            if (onContactSupport != null) ...[
              TextButton.icon(
                onPressed: () {
                  Navigator.of(context).pop();
                  onContactSupport!();
                },
                icon: const Icon(Icons.support_agent_outlined,
                    color: GtColors.textSecondary, size: 18),
                label: const Text(
                  'Contact Non-Emergency Support',
                  style: TextStyle(
                    color: GtColors.textSecondary,
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                  ),
                ),
              ),
            ],

            const SizedBox(height: 4),
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text(
                'Close',
                style: TextStyle(color: GtColors.textSecondary),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
