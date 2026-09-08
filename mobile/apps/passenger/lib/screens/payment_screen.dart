import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

class PaymentScreen extends StatefulWidget {
  const PaymentScreen({
    super.key,
    required this.rideId,
    required this.offerId,
  });

  final String rideId;
  final String offerId;

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  bool _saveCard = true;
  bool _loading = false;
  final _card = TextEditingController(text: '4111 1111 1111 1111');
  final _expiry = TextEditingController(text: '12/28');
  final _cvc = TextEditingController(text: '123');
  final _name = TextEditingController(text: 'John Smith');

  @override
  void dispose() {
    _card.dispose();
    _expiry.dispose();
    _cvc.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _pay() async {
    setState(() => _loading = true);
    final app = context.read<AppState>();
    try {
      await app.selectOffer(widget.rideId, widget.offerId);
      await app.paySelectedOffer(widget.rideId);
      if (!mounted) return;
      app.setShellTab(1);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Payment successful — ride booked')),
      );
      context.go('/');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Payment failed: $e')),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final offer =
        context.watch<AppState>().offerByIds(widget.rideId, widget.offerId);

    return Scaffold(
      backgroundColor: Colors.black54,
      body: Align(
        alignment: Alignment.bottomCenter,
        child: Container(
          width: double.infinity,
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
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
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Payment',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: () => context.pop(),
                        icon: const Icon(Icons.close),
                      ),
                    ],
                  ),
                  Text(
                    'Total ${offer?.priceLabel ?? ''}',
                    style: const TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 16),
                  _field('Card number', _card, TextInputType.number),
                  Row(
                    children: [
                      Expanded(child: _field('Expiry', _expiry, TextInputType.datetime)),
                      const SizedBox(width: 12),
                      Expanded(child: _field('CVC', _cvc, TextInputType.number)),
                    ],
                  ),
                  _field('Name on card', _name, TextInputType.name),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Save card for next trips'),
                    value: _saveCard,
                    activeColor: GtColors.green,
                    onChanged: (v) => setState(() => _saveCard = v),
                  ),
                  const SizedBox(height: 8),
                  if (_loading)
                    const Center(
                      child: Padding(
                        padding: EdgeInsets.all(16),
                        child: CircularProgressIndicator(color: GtColors.green),
                      ),
                    )
                  else
                    GtGreenButton(
                      label: 'PAY ${offer?.priceLabel ?? ''}',
                      onPressed: _pay,
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _field(String label, TextEditingController c, TextInputType type) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextField(
        controller: c,
        keyboardType: type,
        decoration: InputDecoration(
          labelText: label,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: GtColors.orange),
          ),
        ),
      ),
    );
  }
}
