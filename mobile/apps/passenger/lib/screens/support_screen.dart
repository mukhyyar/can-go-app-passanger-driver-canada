import 'package:flutter/material.dart';
import 'package:gt_ui/gt_ui.dart';

class SupportScreen extends StatelessWidget {
  const SupportScreen({super.key});

  static const faqs = [
    (
      'How does CAN-GO work?',
      'Create a ride request, receive offers from carriers, compare and book the one you like.'
    ),
    (
      'When do I pay?',
      'You pay only after selecting an offer. No charge while waiting for bids.'
    ),
    (
      'Can I cancel a booking?',
      'Yes. Cancellation terms depend on timing and the selected offer conditions.'
    ),
    (
      'What if my flight is delayed?',
      'Add your flight number so the driver can track arrivals and wait within the included time.'
    ),
    (
      'Are child seats available?',
      'Yes — request infant, child, or booster seats when creating your ride.'
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      appBar: AppBar(title: const Text('Support')),
      body: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          GtCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Contact us',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 12),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.email_outlined, color: GtColors.orange),
                  title: const Text('support@can-go.ca'),
                  onTap: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Email client (demo)')),
                    );
                  },
                ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.chat_bubble_outline, color: GtColors.orange),
                  title: const Text('In-app chat'),
                  subtitle: const Text('Average reply under 5 minutes'),
                  onTap: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Chat opened (demo)')),
                    );
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 4, vertical: 8),
            child: Text(
              'FAQ',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
          ),
          ...faqs.map(
            (f) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: GtCard(
                child: ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  childrenPadding: const EdgeInsets.only(bottom: 8),
                  title: Text(
                    f.$1,
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                  ),
                  children: [
                    Text(
                      f.$2,
                      style: const TextStyle(color: GtColors.textSecondary, height: 1.4),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
