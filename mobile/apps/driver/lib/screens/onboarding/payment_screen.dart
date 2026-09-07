import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';

class PaymentScreen extends StatelessWidget {
  const PaymentScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
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
                GtCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          Expanded(child: Text('Turnover for the previous 12 months')),
                          Text('US\$0.00', style: TextStyle(fontWeight: FontWeight.w600)),
                        ],
                      ),
                      const Divider(height: 24),
                      const Text('Special commission', style: TextStyle(fontWeight: FontWeight.w600)),
                      const SizedBox(height: 8),
                      const Row(
                        children: [
                          Text('Urgent'),
                          SizedBox(width: 6),
                          Icon(Icons.help_outline, size: 16, color: GtColors.textMuted),
                          Spacer(),
                          Text('5%', style: TextStyle(fontWeight: FontWeight.w600)),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'Calculation rules',
                        style: TextStyle(
                          color: GtColors.brand,
                          decoration: TextDecoration.underline,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                const Text('Current payment period', style: TextStyle(color: GtColors.textSecondary, fontSize: 13)),
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
                  items: const ['USD', 'EUR', 'CAD', 'GBP'],
                  onChanged: (v) => s.setPayment(outpaymentCurrency: v),
                ),
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text(
                    'Choosing the currency different from your bank account currency can imply conversion expenses',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: GtColors.textSecondary, fontSize: 12),
                  ),
                ),
                const SizedBox(height: 8),
                const Text('Bank details', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Expanded(child: Text('Verification status')),
                    Icon(Icons.hourglass_empty, size: 16, color: GtColors.brand),
                    const SizedBox(width: 4),
                    Text("Isn't checked", style: TextStyle(color: GtColors.brand)),
                  ],
                ),
                const SizedBox(height: 8),
                _dropdown(
                  label: 'Bank country',
                  value: s.bankCountry,
                  items: const ['Canada', 'United States', 'Germany', 'UAE'],
                  onChanged: (v) => s.setPayment(bankCountry: v),
                ),
                const SizedBox(height: 16),
                GtCard(
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Container(
                            width: 28,
                            height: 28,
                            decoration: const BoxDecoration(
                              shape: BoxShape.circle,
                              gradient: SweepGradient(
                                colors: [
                                  GtColors.brand,
                                  GtColors.soft,
                                  GtColors.brandDark,
                                  GtColors.white,
                                  GtColors.brand,
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          const Text('Payoneer', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
                        ],
                      ),
                      const SizedBox(height: 12),
                      const Text(
                        'Payoneer registration link will be available after filling in the registration details and account activation',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontWeight: FontWeight.w600),
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
              label: 'Save',
              onPressed: () async {
                await s.completeOnboarding();
                if (context.mounted) context.go('/');
              },
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: GtColors.textSecondary, fontSize: 13)),
        DropdownButtonHideUnderline(
          child: DropdownButton<String>(
            isExpanded: true,
            value: value,
            icon: const Icon(Icons.keyboard_arrow_down),
            items: items
                .map((e) => DropdownMenuItem(value: e, child: Text(e)))
                .toList(),
            onChanged: (v) {
              if (v != null) onChanged(v);
            },
          ),
        ),
        const Divider(height: 1),
      ],
    );
  }
}
