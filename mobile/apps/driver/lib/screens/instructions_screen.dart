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
            CanGoLogo(size: 28),
            SizedBox(width: 8),
            Text('Instructions'),
          ],
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
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
                  '2. Good appearance of the car, no advertisements.\n'
                  '3. No tobacco or any other smoke inside.'
            ),
            (
              'Driver',
              '1. 3 years or more of a driving experience and at least 21 years of age.\n'
                  '2. Safe and comfortable driving style.\n'
                  '3. Adherence to local traffic regulations.\n'
                  '4. Presentable appearance.\n'
                  '5. Meeting with a name sign on request and help with luggage.\n'
                  '6. No phone talk while driving or forced conversation with passengers.\n'
                  '7. No price change after confirmation with passenger on CAN-GO.'
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
