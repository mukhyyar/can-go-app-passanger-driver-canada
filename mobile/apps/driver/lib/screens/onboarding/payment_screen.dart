import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';

class PaymentScreen extends StatefulWidget {
  const PaymentScreen({super.key});

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppState>().loadPaymentDetails();
    });
  }

  Future<void> _save(AppState s) async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      if (s.isAuthenticated) {
        await s.savePaymentDetails();
      }
      if (!mounted) return;
      if (s.onboardedComplete) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Payment details saved')),
        );
        context.pop();
      } else {
        await s.completeOnboarding();
        if (mounted) context.go('/');
      }
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final statusLabel = s.paymentStatus.replaceAll('_', ' ');
    return Scaffold(
      appBar: AppBar(
        title: const Text('Payment details'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(_error!,
                        style: const TextStyle(color: GtColors.red)),
                  ),
                GtCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Payout preferences',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Configure how CAN-RIDE pays out completed rides. '
                        'Sensitive bank credentials are never stored in the app.',
                        style: TextStyle(
                          color: GtColors.textSecondary.withValues(alpha: 0.95),
                          fontSize: 13,
                        ),
                      ),
                      const Divider(height: 24),
                      Row(
                        children: [
                          const Expanded(child: Text('Commission')),
                          Text(
                            '${s.paymentDetails?['commissionPct'] ?? 5}%',
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Current payment period',
                  style: TextStyle(color: GtColors.textSecondary, fontSize: 13),
                ),
                const Text('30 working days', style: TextStyle(fontSize: 16)),
                const Divider(),
                _dropdown(
                  label: 'Current billing period',
                  value: s.billingPeriod,
                  items: const ['1 day', '3 days', '7 days', '14 days'],
                  onChanged: (v) => s.setPayment(billingPeriod: v),
                ),
                _dropdown(
                  label: 'Outpayment currency',
                  value: s.outpaymentCurrency,
                  items: const ['CAD', 'USD', 'EUR', 'GBP'],
                  onChanged: (v) => s.setPayment(outpaymentCurrency: v),
                ),
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text(
                    'Choosing a currency different from your bank account currency can imply conversion expenses',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: GtColors.textSecondary,
                      fontSize: 12,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Bank details',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Expanded(child: Text('Verification status')),
                    Icon(
                      s.paymentStatus == 'VERIFIED'
                          ? Icons.verified
                          : Icons.hourglass_empty,
                      size: 16,
                      color: GtColors.brand,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      statusLabel,
                      style: const TextStyle(color: GtColors.brand),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                _dropdown(
                  label: 'Bank country',
                  value: s.bankCountry,
                  items: const [
                    'Canada',
                    'United States',
                    'Germany',
                    'UAE',
                    'United Kingdom',
                  ],
                  onChanged: (v) => s.setPayment(bankCountry: v),
                ),
                const SizedBox(height: 16),
                GtCard(
                  child: Column(
                    children: [
                      const Icon(Icons.account_balance,
                          color: GtColors.brand, size: 32),
                      const SizedBox(height: 12),
                      const Text(
                        'Bank transfer',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 18,
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Full account linking and verification are completed after activation. '
                        'Save your payout currency and bank country to continue.',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontWeight: FontWeight.w500),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: GtGreenButton(
              label: _saving ? 'Saving…' : 'Save',
              onPressed: _saving ? null : () => _save(s),
            ),
          ),
        ],
      ),
    );
  }

  Widget _dropdown({
    required String label,
    required String value,
    required List<String> items,
    required ValueChanged<String> onChanged,
  }) {
    final safeValue = items.contains(value) ? value : items.first;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style:
                const TextStyle(color: GtColors.textSecondary, fontSize: 13)),
        DropdownButtonHideUnderline(
          child: DropdownButton<String>(
            isExpanded: true,
            value: safeValue,
            icon: const Icon(Icons.keyboard_arrow_down),
            items: items
                .map((e) => DropdownMenuItem(value: e, child: Text(e)))
                .toList(),
            onChanged: (v) {
              if (v != null) onChanged(v);
            },
          ),
        ),
        const Divider(),
      ],
    );
  }
}
