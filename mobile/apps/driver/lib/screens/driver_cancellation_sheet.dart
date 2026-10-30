import 'package:flutter/material.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:url_launcher/url_launcher.dart';

class CancellationReasonItem {
  final String code;
  final String label;
  final String description;
  final IconData icon;
  final bool requiresDetails;
  final bool isJustified;

  const CancellationReasonItem({
    required this.code,
    required this.label,
    required this.description,
    required this.icon,
    this.requiresDetails = false,
    this.isJustified = false,
  });
}

/// The 6 canonical Section 15 safety reasons + road conditions and other
const List<CancellationReasonItem> kDefaultCancellationReasons = [
  CancellationReasonItem(
    code: 'UNSAFE_CONDITIONS',
    label: 'Immediate Safety Threat',
    description: 'Physical danger, threats, weapons, hostility, or hazardous environment',
    icon: Icons.warning_amber_rounded,
    requiresDetails: true,
    isJustified: true,
  ),
  CancellationReasonItem(
    code: 'UNLAWFUL_ACTIVITY',
    label: 'Unlawful Activity',
    description: 'Solicitation of illegal acts, illicit substances, or contraband',
    icon: Icons.gavel_rounded,
    requiresDetails: true,
    isJustified: true,
  ),
  CancellationReasonItem(
    code: 'PASSENGER_ISSUE',
    label: 'Dangerous Passenger Conduct',
    description: 'Aggression, violence, severe intoxication, or safety violations',
    icon: Icons.person_off_rounded,
    requiresDetails: true,
    isJustified: true,
  ),
  CancellationReasonItem(
    code: 'VEHICLE_BREAKDOWN',
    label: 'Unsafe Vehicle Condition',
    description: 'Mechanical failure, flat tire, brake trouble, or compromised vehicle safety',
    icon: Icons.car_repair_rounded,
    requiresDetails: false,
    isJustified: true,
  ),
  CancellationReasonItem(
    code: 'DRIVER_EMERGENCY',
    label: 'Emergency',
    description: 'Personal or passenger medical crisis, accident, or acute emergency',
    icon: Icons.emergency_rounded,
    requiresDetails: false,
    isJustified: true,
  ),
  CancellationReasonItem(
    code: 'LEGAL_RESTRICTION',
    label: 'Legal Restriction',
    description: 'Missing required child safety seat, excess capacity beyond seatbelts, or regulatory restriction',
    icon: Icons.policy_rounded,
    requiresDetails: true,
    isJustified: true,
  ),
  CancellationReasonItem(
    code: 'WEATHER_ROAD_CONDITIONS',
    label: 'Weather or Road Conditions',
    description: 'Severe weather, impassable roads, or highway closures',
    icon: Icons.thunderstorm_rounded,
    requiresDetails: false,
    isJustified: true,
  ),
  CancellationReasonItem(
    code: 'OTHER',
    label: 'Other',
    description: 'Any unlisted reason (requires explanation)',
    icon: Icons.edit_note_rounded,
    requiresDetails: true,
    isJustified: false,
  ),
];

class DriverCancellationSheet extends StatefulWidget {
  final List<CancellationReasonItem> reasons;
  final bool isInProgress;

  const DriverCancellationSheet({
    super.key,
    this.reasons = kDefaultCancellationReasons,
    this.isInProgress = false,
  });

  @override
  State<DriverCancellationSheet> createState() =>
      _DriverCancellationSheetState();
}

class _DriverCancellationSheetState extends State<DriverCancellationSheet> {
  String? _selectedCode;
  final TextEditingController _detailsController = TextEditingController();
  String? _validationError;

  @override
  void dispose() {
    _detailsController.dispose();
    super.dispose();
  }

  void _onConfirm() {
    if (_selectedCode == null) {
      setState(() {
        _validationError = 'Please select a reason.';
      });
      return;
    }

    final reason =
        widget.reasons.firstWhere((r) => r.code == _selectedCode);
    final text = _detailsController.text.trim();

    if (reason.requiresDetails && text.length < 5) {
      setState(() {
        _validationError =
            'Please provide more details (minimum 5 characters).';
      });
      return;
    }

    Navigator.pop(context, <String, String>{
      'reasonCode': _selectedCode!,
      if (text.isNotEmpty) 'reasonDetails': text,
    });
  }

  Future<void> _call911() async {
    final uri = Uri.parse('tel:911');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isStop = widget.isInProgress;

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
        top: 12,
        left: 20,
        right: 20,
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Drag Handle
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),

              // Title Header
              Row(
                children: [
                  Icon(
                    isStop ? Icons.shield_outlined : Icons.cancel_outlined,
                    color: Colors.red,
                    size: 24,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      isStop ? 'Stop Trip for Safety' : 'Refuse / Cancel Trip',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: Colors.black87,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                isStop
                  ? 'Safety overrides completion of a booking. Select the reason to stop this trip immediately.'
                  : 'Safety overrides completion of a booking. Drivers may refuse or stop a trip where there is a legitimate safety or legal concern.',
                style: const TextStyle(
                  fontSize: 12.5,
                  color: GtColors.textSecondary,
                  height: 1.35,
                ),
              ),
              const SizedBox(height: 12),

              // Emergency 911 Callout Banner (Section 15 requirement)
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.shade50,
                  border: Border.all(color: Colors.red.shade200),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Icon(Icons.local_police_rounded,
                            color: Colors.red.shade700, size: 22),
                        const SizedBox(width: 8),
                        const Expanded(
                          child: Text(
                            'For emergencies, call 911 immediately',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: Colors.red,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        ElevatedButton.icon(
                          onPressed: _call911,
                          icon: const Icon(Icons.phone, size: 14),
                          label: const Text('911',
                              style: TextStyle(
                                  fontWeight: FontWeight.w800, fontSize: 13)),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.red.shade700,
                            foregroundColor: Colors.white,
                            minimumSize: const Size(0, 32),
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 6),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8)),
                            elevation: 0,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'CAN-RIDE Support should not be represented as an emergency-response service.',
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.red.shade900,
                        height: 1.3,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),

              // Safety Overrides Completion Protection Note
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFFEFF6FF),
                  border: Border.all(color: const Color(0xFFBFDBFE)),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.verified_user_outlined,
                        color: Color(0xFF1D4ED8), size: 18),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Safety overrides completion of a Booking. Justified safety stops and refusals are protected and do not penalize your account.',
                        style: TextStyle(
                          fontSize: 11.5,
                          color: Color(0xFF1E40AF),
                          fontWeight: FontWeight.w600,
                          height: 1.35,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),

              // Driver Cancellation Policy Card
              Container(
                margin: const EdgeInsets.only(bottom: 16),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFFCBD5E1)),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.03),
                      blurRadius: 4,
                      offset: const Offset(0, 1),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(
                          Icons.policy_outlined,
                          size: 18,
                          color: Color(0xFF0F172A),
                        ),
                        const SizedBox(width: 8),
                        const Expanded(
                          child: Text(
                            'Driver Cancellation Policy',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFF0F172A),
                            ),
                          ),
                        ),
                        InkWell(
                          onTap: () => showDriverCancellationPolicyDialog(context),
                          borderRadius: BorderRadius.circular(4),
                          child: const Padding(
                            padding: EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  'Full Policy',
                                  style: TextStyle(
                                    fontSize: 11.5,
                                    fontWeight: FontWeight.w700,
                                    color: GtColors.brand,
                                  ),
                                ),
                                SizedBox(width: 2),
                                Icon(Icons.open_in_new, size: 12, color: GtColors.brand),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    _policyRuleRow(
                      icon: Icons.payments_outlined,
                      title: '100% Passenger Refund',
                      desc: 'Customer receives an immediate full refund to their payment method.',
                    ),
                    const SizedBox(height: 6),
                    _policyRuleRow(
                      icon: Icons.money_off_rounded,
                      title: 'Zero Payout (\$0.00 CAD)',
                      desc: 'No earnings or compensation are paid for cancelled rides.',
                    ),
                    const SizedBox(height: 6),
                    _policyRuleRow(
                      icon: Icons.verified_user_outlined,
                      title: 'Safety Concerns Protected',
                      desc: 'Justified safety stops or refusals do not penalize your driver rating.',
                    ),
                    const SizedBox(height: 6),
                    _policyRuleRow(
                      icon: Icons.warning_amber_rounded,
                      title: 'Repeated Unjustified Cancels',
                      desc: 'Unjustified cancellations affect account standing and dispatch eligibility.',
                    ),
                  ],
                ),
              ),

              // Reason Radio Cards
              const Text(
                'SELECT SAFETY / CANCELLATION REASON',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF6B7280),
                  letterSpacing: 0.5,
                ),
              ),
              const SizedBox(height: 8),

              ...widget.reasons.map((reason) {
                final isSelected = _selectedCode == reason.code;
                return InkWell(
                  key: Key('reason_${reason.code}'),
                  onTap: () {
                    setState(() {
                      _selectedCode = reason.code;
                      _validationError = null;
                    });
                  },
                  borderRadius: BorderRadius.circular(10),
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? const Color(0xFFEFF6FF)
                          : Colors.grey.shade50,
                      border: Border.all(
                        color: isSelected
                            ? const Color(0xFF3B82F6)
                            : Colors.grey.shade200,
                        width: isSelected ? 1.5 : 1,
                      ),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          reason.icon,
                          size: 22,
                          color: isSelected
                              ? const Color(0xFF1D4ED8)
                              : Colors.grey.shade600,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      reason.label,
                                      style: TextStyle(
                                        fontWeight: isSelected
                                            ? FontWeight.w700
                                            : FontWeight.w600,
                                        fontSize: 13.5,
                                        color: isSelected
                                            ? const Color(0xFF1E3A8A)
                                            : Colors.black87,
                                      ),
                                    ),
                                  ),
                                  if (reason.isJustified) ...[
                                    const SizedBox(width: 6),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 6, vertical: 1),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFFDCFCE7),
                                        borderRadius:
                                            BorderRadius.circular(4),
                                      ),
                                      child: const Text(
                                        'Justified',
                                        style: TextStyle(
                                          fontSize: 10,
                                          fontWeight: FontWeight.w700,
                                          color: Color(0xFF15803D),
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                              const SizedBox(height: 2),
                              Text(
                                reason.description,
                                style: TextStyle(
                                  fontSize: 11.5,
                                  color: Colors.grey.shade600,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Radio<String>(
                          value: reason.code,
                          groupValue: _selectedCode,
                          activeColor: const Color(0xFF2563EB),
                          onChanged: (val) {
                            setState(() {
                              _selectedCode = val;
                              _validationError = null;
                            });
                          },
                        ),
                      ],
                    ),
                  ),
                );
              }),

              // Context Details Input
              if (_selectedCode != null) ...[
                const SizedBox(height: 10),
                TextField(
                  key: const Key('cancellation_details_input'),
                  controller: _detailsController,
                  maxLines: 2,
                  decoration: InputDecoration(
                    labelText: widget.reasons
                            .firstWhere((r) => r.code == _selectedCode)
                            .requiresDetails
                        ? 'Provide safety details (Required) *'
                        : 'Additional safety context (Optional)',
                    labelStyle: const TextStyle(fontSize: 13),
                    hintText: 'Describe the safety threat or circumstances...',
                    hintStyle: TextStyle(
                        fontSize: 12, color: Colors.grey.shade400),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 10),
                  ),
                ),
              ],

              // Error banner
              if (_validationError != null) ...[
                const SizedBox(height: 10),
                Text(
                  _validationError!,
                  style: const TextStyle(
                    color: Colors.red,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],

              const SizedBox(height: 20),

              // Action Buttons
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      key: const Key('keep_ride_button'),
                      onPressed: () => Navigator.pop(context),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      child: Text(isStop ? 'Continue Ride' : 'Keep Ride'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      key: const Key('confirm_cancel_button'),
                      onPressed: _onConfirm,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.red.shade600,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      child: Text(isStop ? 'Stop Trip' : 'Refuse / Cancel'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _policyRuleRow({
    required IconData icon,
    required String title,
    required String desc,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 15, color: const Color(0xFF475569)),
        const SizedBox(width: 8),
        Expanded(
          child: RichText(
            text: TextSpan(
              style: const TextStyle(
                fontSize: 11.5,
                color: Color(0xFF334155),
                height: 1.35,
              ),
              children: [
                TextSpan(
                  text: '$title: ',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF0F172A),
                  ),
                ),
                TextSpan(text: desc),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// Displays an informational dialog explaining CAN-RIDE's Driver Cancellation & Refund Policy.
Future<void> showDriverCancellationPolicyDialog(BuildContext context) {
  return showDialog(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Row(
        children: [
          Icon(Icons.policy_outlined, color: GtColors.brand, size: 22),
          SizedBox(width: 8),
          Expanded(
            child: Text(
              'Driver Cancellation Policy',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ),
      content: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Please review the cancellation rules and terms that apply to drivers before cancelling a booking:',
              style: TextStyle(
                fontSize: 12.5,
                color: GtColors.textSecondary,
                height: 1.35,
              ),
            ),
            const SizedBox(height: 12),
            _dialogPolicySection(
              title: '1. Passenger Refund & Earnings Forfeiture',
              body:
                  'When you cancel an accepted or ongoing trip, the passenger receives an immediate 100% full refund to their payment card. The driver receives \$0.00 CAD earnings for the trip.',
            ),
            const SizedBox(height: 10),
            _dialogPolicySection(
              title: '2. Section 15 Safety & Protection Rights',
              body:
                  'Safety strictly overrides completion of a booking. Drivers may refuse or halt a trip where there is a legitimate safety threat, unlawful activity, passenger hostility, compromised vehicle condition, or severe weather. Justified safety cancellations are protected and do not lower your driver rating or account standing.',
            ),
            const SizedBox(height: 10),
            _dialogPolicySection(
              title: '3. Unjustified Cancellations & Penalties',
              body:
                  'Cancelling without valid safety, emergency, or legal grounds (e.g. personal convenience or refusing accepted rates) is considered unjustified. Repeated unjustified cancellations lower your completion rating and can lead to dispatch pauses or account review.',
            ),
            const SizedBox(height: 10),
            _dialogPolicySection(
              title: '4. Passenger No-Show Procedure',
              body:
                  'If the passenger fails to appear at pickup after the included waiting period (15 minutes for standard trips, 60 minutes for airports/ports), do NOT cancel the trip here. Instead, select "Passenger No-Show" to protect your compensation and earn the eligible no-show fee.',
            ),
          ],
        ),
      ),
      actions: [
        TextButton.icon(
          onPressed: () => GtPolicyUrls.openCancellation(),
          icon: const Icon(Icons.open_in_browser, size: 16),
          label: const Text('Online Policy'),
        ),
        ElevatedButton(
          onPressed: () => Navigator.pop(ctx),
          style: ElevatedButton.styleFrom(
            backgroundColor: GtColors.brand,
            foregroundColor: Colors.white,
          ),
          child: const Text('Understood'),
        ),
      ],
    ),
  );
}

Widget _dialogPolicySection({required String title, required String body}) {
  return Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        title,
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: Color(0xFF0F172A),
        ),
      ),
      const SizedBox(height: 3),
      Text(
        body,
        style: const TextStyle(
          fontSize: 12,
          color: Color(0xFF475569),
          height: 1.35,
        ),
      ),
    ],
  );
}
