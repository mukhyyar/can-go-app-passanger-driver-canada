import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';

class InstructionsScreen extends StatelessWidget {
  const InstructionsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      appBar: AppBar(
        title: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CanRideWordmark(fontSize: 18, compact: true),
            SizedBox(width: 10),
            Text('Instructions'),
          ],
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.canPop() ? context.pop() : context.go('/'),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Instructions',
            textAlign: TextAlign.center,
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
          ),
          const SizedBox(height: 8),
          _group([
            (
              'How to get started',
              'Complete your carrier profile, upload documents, set your operating zone, and wait for activation.'
            ),
            (
              'Working with requests',
              'Open New requests, review the route and timing, then submit your offer price when activated.'
            ),
            (
              'Payment of orders',
              'Completed rides are billed on your billing period. Outpayments follow the configured payment period.'
            ),
          ]),
          const SizedBox(height: 20),
          const Text(
            'Requirements',
            textAlign: TextAlign.center,
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
          ),
          const SizedBox(height: 8),
          _group([
            (
              'Vehicle',
              '1. Valid registration, insurance and inspection certificate.\n'
                  '2. Clean, presentable vehicle matching your registered details.\n'
                  '3. No prohibited advertising or company contact info on the vehicle.\n'
                  '4. Smoke-free cabin at all times.'
            ),
            (
              'Driver',
              '1. Valid driving licence and minimum experience/age required in your jurisdiction.\n'
                  '2. Safe driving and local traffic-law compliance.\n'
                  '3. Professional appearance and respectful passenger communication.\n'
                  '4. Meet with a name sign on request and help with luggage.\n'
                  '5. No unsafe phone use while driving.\n'
                  '6. No unauthorized price changes after confirmation.'
            ),
            (
              'Ride service',
              '1. Arrive on time for pickups; communicate delays early.\n'
                  '2. Follow waiting and airport pickup procedures.\n'
                  '3. Complete trips only when the passenger is safely dropped off.\n'
                  '4. Follow passenger no-show and cancellation rules.\n'
                  '5. Use emergency procedures and contact support when needed.'
            ),
          ]),
          const SizedBox(height: 24),
          const Text(
            'Still need help?',
            textAlign: TextAlign.center,
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 48,
            child: OutlinedButton(
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Contact: partner@can-go.ca')),
                );
              },
              style: OutlinedButton.styleFrom(
                foregroundColor: GtColors.brand,
                side: const BorderSide(color: GtColors.brand),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: const Text('Contact us'),
            ),
          ),
          const SizedBox(height: 10),
          GtGreenButton(
            label: 'Go to requests',
            onPressed: () => context.go('/'),
          ),
        ],
      ),
    );
  }

  Widget _group(List<(String, String)> items) {
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: GtColors.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        children: [
          for (var i = 0; i < items.length; i++) ...[
            Theme(
              data: ThemeData().copyWith(dividerColor: Colors.transparent),
              child: ExpansionTile(
                title: Text(items[i].$1),
                childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                children: [
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text(items[i].$2),
                  ),
                ],
              ),
            ),
            if (i < items.length - 1) const Divider(height: 1),
          ],
        ],
      ),
    );
  }
}
