import 'package:flutter/material.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../utils/error_utils.dart';

/// Modal bottom sheet that provides clear, plain-language Canadian driver instructions
/// for Stripe Express payout verification, required numbers, and 1-tap browser launch.
class StripeInstructionsSheet extends StatefulWidget {
  const StripeInstructionsSheet({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => const StripeInstructionsSheet(),
    );
  }

  @override
  State<StripeInstructionsSheet> createState() =>
      _StripeInstructionsSheetState();
}

class _StripeInstructionsSheetState extends State<StripeInstructionsSheet> {
  bool _loading = false;
  String? _error;

  Future<void> _handleLaunch(AppState s) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final launched = await s.launchStripeVerification();
      if (!launched && mounted) {
        setState(() => _error = 'Could not open browser. Please try again.');
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = 'Failed to launch Stripe: ${cleanErrorMessage(e)}');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _handleCheckStatus(AppState s) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await s.refreshStripeStatus();
      if (!mounted) return;
      if (s.isStripePayoutsVerified) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            behavior: SnackBarBehavior.floating,
            backgroundColor: GtColors.green,
            content: Text('🎉 Stripe payout verification active! You can now submit offers.'),
          ),
        );
      } else {
        setState(() {
          _error = 'Stripe verification is still pending. If you completed onboarding, please allow 1-2 minutes for Stripe to process.';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = 'Status check failed: ${cleanErrorMessage(e)}');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final isVerified = s.isStripePayoutsVerified;
    final isLinked = s.stripeAccountId != null && s.stripeAccountId!.isNotEmpty;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 4,
          bottom: MediaQuery.viewInsetsOf(context).bottom + 20,
        ),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * 0.85,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Header badge & title
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: const Color(0xFF635BFF).withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(
                        Icons.account_balance,
                        color: Color(0xFF635BFF),
                        size: 26,
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Direct Payouts (Stripe Express)',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: GtColors.text,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            isVerified
                                ? 'CAD Direct Deposits Active'
                                : (isLinked
                                    ? 'Verification in progress'
                                    : 'Setup required to submit offers'),
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              color: isVerified
                                  ? GtColors.green
                                  : (isLinked
                                      ? Colors.blue.shade700
                                      : Colors.amber.shade900),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // Explanation
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF9FAFB),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFE5E7EB)),
                  ),
                  child: const Text(
                    'CAN-RIDE partners with Stripe Express to deposit ride earnings directly into your Canadian bank account in CAD. Before you can bid on requests, Stripe requires a quick one-time identity and payout verification.',
                    style: TextStyle(
                      fontSize: 13.5,
                      color: Color(0xFF374151),
                      height: 1.4,
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                const Text(
                  'What you will need:',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: GtColors.text,
                  ),
                ),
                const SizedBox(height: 10),

                // Requirement 1: Canadian Bank Account
                _RequirementItem(
                  icon: Icons.account_balance_outlined,
                  title: 'Canadian Bank Details',
                  subtitle:
                      'Institution # (3 digits), Transit # (5 digits), and Account # (7-12 digits). Available in your Canadian mobile banking app under "Direct Deposit" or on a void cheque.',
                ),
                const SizedBox(height: 10),

                // Requirement 2: Canadian Photo ID
                _RequirementItem(
                  icon: Icons.badge_outlined,
                  title: 'Valid Photo ID',
                  subtitle:
                      'A clear photo of your Canadian Provincial Driver\'s License or Canadian Passport for security compliance.',
                ),
                const SizedBox(height: 10),

                // Requirement 3: Privacy & Security
                _RequirementItem(
                  icon: Icons.lock_outline,
                  title: 'Bank-Grade Security',
                  subtitle:
                      'All banking and identity data is encrypted and handled directly by Stripe. CAN-RIDE never stores your bank account numbers.',
                ),
                const SizedBox(height: 16),

                if (_error != null) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: Colors.red.shade200),
                    ),
                    child: Text(
                      _error!,
                      style: TextStyle(
                        fontSize: 12.5,
                        color: Colors.red.shade900,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                ],

                // Action Buttons
                if (_loading)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 12),
                      child: CircularProgressIndicator(color: GtColors.brand),
                    ),
                  )
                else ...[
                  FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF635BFF),
                      foregroundColor: Colors.white,
                      minimumSize: const Size.fromHeight(48),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    icon: const Icon(Icons.open_in_new, size: 18),
                    label: Text(
                      isVerified
                          ? 'Open Stripe Dashboard'
                          : (isLinked
                              ? 'Continue Stripe Verification'
                              : 'Set Up Direct Payouts with Stripe'),
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    onPressed: () => _handleLaunch(s),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(44),
                      foregroundColor: GtColors.text,
                      side: const BorderSide(color: Color(0xFFD1D5DB)),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    icon: const Icon(Icons.refresh, size: 18),
                    label: const Text(
                      'Check Verification Status',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                    ),
                    onPressed: () => _handleCheckStatus(s),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RequirementItem extends StatelessWidget {
  const _RequirementItem({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF3F4F6),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: const Color(0xFF4B5563), size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: GtColors.text,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xFF6B7280),
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
