import 'package:flutter/material.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import 'brand_chrome.dart';

class RequestsScreen extends StatefulWidget {
  const RequestsScreen({super.key});

  @override
  State<RequestsScreen> createState() => _RequestsScreenState();
}

class _RequestsScreenState extends State<RequestsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    _tabs.addListener(() {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tabs.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _onOffer(DriverRequest req) async {
    final s = context.read<AppState>();
    if (!s.isActivated) {
      await showDialog<void>(
        context: context,
        builder: (_) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          content: const Text(
            'You will be able to offer your price after activation. Please, fill in your profile and contact us: partner@can-go.ca',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('OK', style: TextStyle(color: GtColors.brand)),
            ),
          ],
        ),
      );
      return;
    }

    final priceCtrl = TextEditingController();
    final submitted = await showGtSheet<bool>(
      context: context,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          12,
          20,
          24 + MediaQuery.of(context).viewInsets.bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Offer price',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context, false),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            TextField(
              controller: priceCtrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Your price (US\$)',
                border: UnderlineInputBorder(),
                focusedBorder: UnderlineInputBorder(
                  borderSide: BorderSide(color: GtColors.brand),
                ),
              ),
            ),
            const SizedBox(height: 16),
            GtGreenButton(
              label: 'Submit',
              onPressed: () {
                final p = double.tryParse(priceCtrl.text.trim());
                if (p == null || p <= 0) return;
                s.submitOffer(req.id, p);
                Navigator.pop(context, true);
              },
            ),
          ],
        ),
      ),
    );
    if (submitted == true && mounted) {
      _tabs.animateTo(1);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Offer submitted')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final newReqs = s.repo.newRequests;
    final offers = s.repo.myOffers;

    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      floatingActionButton: FloatingActionButton(
        backgroundColor: GtColors.brand,
        onPressed: () {
          if (_scroll.hasClients) {
            _scroll.animateTo(
              0,
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOut,
            );
          }
        },
        child: const Icon(Icons.arrow_upward, color: Colors.white),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: DriverBrandHeader(
                subtitle: s.isActivated
                    ? 'Partner dashboard · live requests'
                    : 'Complete activation to offer prices',
              ),
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: [
                  DriverStatChip(
                    icon: Icons.alt_route,
                    label: 'New',
                    value: '${newReqs.length}',
                  ),
                  const SizedBox(width: 8),
                  DriverStatChip(
                    icon: Icons.local_offer_outlined,
                    label: 'My offers',
                    value: '${offers.length}',
                  ),
                  const SizedBox(width: 8),
                  DriverStatChip(
                    icon: Icons.verified_outlined,
                    label: 'Status',
                    value: s.isActivated ? 'On' : 'Off',
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: GtColors.border),
                ),
                child: Row(
                  children: [
                    _Segment(
                      label: 'New',
                      selected: _tabs.index == 0,
                      onTap: () => _tabs.animateTo(0),
                    ),
                    _Segment(
                      label: 'With my offers',
                      selected: _tabs.index == 1,
                      onTap: () => _tabs.animateTo(1),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: TabBarView(
                controller: _tabs,
                children: [
                  _list(newReqs, empty: 'No new requests right now'),
                  _list(offers, empty: 'No offers yet', showPrice: true),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _list(
    List<DriverRequest> items, {
    required String empty,
    bool showPrice = false,
  }) {
    if (items.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: GtColors.soft,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: GtColors.brand.withValues(alpha: 0.16),
                  ),
                ),
                child: const Icon(
                  Icons.inbox_outlined,
                  color: GtColors.brand,
                  size: 32,
                ),
              ),
              const SizedBox(height: 14),
              Text(
                empty,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: GtColors.textSecondary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      );
    }
    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 80),
      itemCount: items.length,
      itemBuilder: (_, i) => _RequestCard(
        request: items[i],
        showPrice: showPrice,
        onOffer: () => _onOffer(items[i]),
      ),
    );
  }
}

class _Segment extends StatelessWidget {
  const _Segment({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(10),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              color: selected ? GtColors.brand : Colors.transparent,
              borderRadius: BorderRadius.circular(10),
            ),
            alignment: Alignment.center,
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: selected ? Colors.white : GtColors.textSecondary,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _RequestCard extends StatelessWidget {
  const _RequestCard({
    required this.request,
    required this.onOffer,
    this.showPrice = false,
  });

  final DriverRequest request;
  final VoidCallback onOffer;
  final bool showPrice;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: GtCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    request.datetimeLabel,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: GtColors.soft,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: GtColors.brand.withValues(alpha: 0.14),
                    ),
                  ),
                  child: Text(
                    request.ttlLabel,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: GtColors.brand,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              'Ride #${request.id}',
              style: const TextStyle(color: GtColors.textMuted, fontSize: 12),
            ),
            if (request.flightWait != null) ...[
              const SizedBox(height: 6),
              Row(
                children: [
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: GtColors.soft,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.flight, size: 14, color: GtColors.brand),
                        const SizedBox(width: 4),
                        Text(
                          request.flightWait!,
                          style: const TextStyle(fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 12),
            GtRouteRow(
              from: request.from,
              to: request.to,
              distance: request.distance,
              duration: request.duration,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Text(
                  request.vehicleNeed,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                const Spacer(),
                const Icon(Icons.person_outline, size: 18, color: GtColors.brand),
                Text(' × ${request.passengers}'),
              ],
            ),
            const SizedBox(height: 12),
            if (showPrice && request.offerPrice != null)
              Container(
                width: double.infinity,
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: GtColors.soft,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: GtColors.brand.withValues(alpha: 0.16),
                  ),
                ),
                child: Text(
                  'Your offer: US\$${request.offerPrice!.toStringAsFixed(0)}',
                  style: const TextStyle(
                    color: GtColors.brand,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              )
            else
              GtGreenButton(label: 'Offer price', onPressed: onOffer),
          ],
        ),
      ),
    );
  }
}
