import 'package:flutter/material.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

class SupportScreen extends StatefulWidget {
  const SupportScreen({super.key});

  @override
  State<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends State<SupportScreen> {
  static const _fallbackFaqs = [
    (
      'How does CAN-RIDE work?',
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

  String _supportBlurb =
      'CAN-RIDE support helps with bookings, offers, payments, and account access.';
  List<(String, String)> _faqs = _fallbackFaqs;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  String _plain(String md) {
    return md
        .replaceAllMapped(
          RegExp(r'\[([^\]]+)\]\([^)]+\)'),
          (m) => m[1] ?? '',
        )
        .replaceAll('**', '')
        .replaceAll(RegExp(r'^#+\s*', multiLine: true), '')
        .replaceAll(RegExp(r'^\s*[-*]\s+', multiLine: true), '')
        .trim();
  }

  Future<void> _load() async {
    final api = context.read<AppState>().api.cms;
    try {
      final page = await api.page('support');
      final faqs = await api.pages(kind: 'faq');
      if (!mounted) return;
      setState(() {
        final body = page['bodyMd']?.toString();
        if (body != null && body.trim().isNotEmpty) {
          _supportBlurb = _plain(body).split('\n').first;
        }
        if (faqs.isNotEmpty) {
          _faqs = faqs
              .map(
                (f) => (
                  f['title']?.toString() ?? '',
                  _plain(f['bodyMd']?.toString() ?? ''),
                ),
              )
              .where((e) => e.$1.isNotEmpty)
              .toList();
        }
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

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
                const SizedBox(height: 8),
                Text(
                  _loading ? 'Loading support copy…' : _supportBlurb,
                  style: const TextStyle(
                    color: GtColors.textSecondary,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 12),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.email_outlined, color: GtColors.orange),
                  title: const Text('support@can-go.ca'),
                  subtitle: const Text('Bookings, payments, account'),
                  onTap: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Email support@can-go.ca')),
                    );
                  },
                ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.handshake_outlined, color: GtColors.orange),
                  title: const Text('partner@can-go.ca'),
                  subtitle: const Text('Drivers, agents, business'),
                  onTap: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Email partner@can-go.ca')),
                    );
                  },
                ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.chat_bubble_outline, color: GtColors.orange),
                  title: const Text('In-app chat'),
                  subtitle: const Text('Use the ride chat while a trip is booked'),
                  onTap: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Open the trip from My trips to chat'),
                      ),
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
          ..._faqs.map(
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
