import 'dart:math';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../payment/wallet_transaction_detail.dart';
import '../state/app_state.dart';

String _newIdempotencyKey() {
  final r = Random.secure();
  String hex(int n) =>
      List.generate(n, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0'))
          .join();
  return '${hex(4)}-${hex(2)}-${hex(2)}-${hex(2)}-${hex(6)}';
}
class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key});

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  final _amountCtrl = TextEditingController();
  bool _loading = true;
  bool _withdrawing = false;
  String? _error;
  Map<String, dynamic>? _wallet;
  List<Map<String, dynamic>> _entries = [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _refresh());
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final s = context.read<AppState>();
      final wallet = await s.loadWallet();
      final entries = await s.loadWalletEntries();
      if (!mounted) return;
      setState(() {
        _wallet = wallet;
        _entries = entries;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  String _money(dynamic v) => (v ?? '0.00').toString();

  Future<void> _confirmWithdraw() async {
    final wallet = _wallet;
    if (wallet == null || _withdrawing) return;
    final currency = (wallet['currency'] ?? 'CAD').toString();
    final available = _money(wallet['available']);
    final min = _money(wallet['minimumWithdrawal']);
    final amount = _amountCtrl.text.trim();
    if (amount.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter an amount')),
      );
      return;
    }
    final mask = context.read<AppState>().accountMask;
    final dest = mask.isNotEmpty ? 'Bank account $mask' : 'Configured bank account';

    final ok = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      builder: (ctx) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Withdraw $currency $amount',
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
              ),
              const SizedBox(height: 8),
              Text('Available: $currency $available'),
              Text('Minimum: $currency $min'),
              const SizedBox(height: 8),
              Text('To: $dest'),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Confirm withdrawal'),
              ),
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Cancel'),
              ),
            ],
          ),
        );
      },
    );
    if (ok != true || !mounted) return;

    setState(() => _withdrawing = true);
    final key = _newIdempotencyKey();
    try {
      final result = await context.read<AppState>().withdrawWallet(
            amount: amount,
            currency: currency,
            idempotencyKey: key,
          );
      if (!mounted) return;
      final status = result['status']?.toString() ?? '';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            status == 'SUCCEEDED'
                ? 'Withdrawal completed'
                : 'Withdrawal $status',
          ),
        ),
      );
      _amountCtrl.clear();
      await _refresh();
    } on ApiException catch (e) {
      if (!mounted) return;
      final code = e.code;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(code != null ? '$code: ${e.message}' : e.message)),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    } finally {
      if (mounted) setState(() => _withdrawing = false);
    }
  }

  String _entryTitle(Map<String, dynamic> e) {
    final type = e['type']?.toString() ?? '';
    final status = e['status']?.toString() ?? '';
    if (type == 'EARNING') {
      if (status == 'PENDING') return 'Pending earning';
      return 'Trip earning';
    }
    if (type == 'PAYOUT') {
      if (status == 'PENDING' || status == 'PROCESSING') {
        return 'Withdrawal processing';
      }
      if (status == 'FAILED') return 'Withdrawal failed';
      if (status == 'POSTED') return 'Withdrawal completed';
      return 'Withdrawal';
    }
    if (type == 'REVERSAL') return 'Reversal';
    if (type == 'ADJUSTMENT') return 'Adjustment';
    return type;
  }

  String _entrySubtitle(Map<String, dynamic> e) {
    final availableAt = e['availableAt']?.toString();
    if (e['type'] == 'EARNING' &&
        e['status'] == 'PENDING' &&
        availableAt != null &&
        availableAt.isNotEmpty) {
      final dt = DateTime.tryParse(availableAt)?.toLocal();
      if (dt != null) {
        return 'Available on ${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
      }
    }
    final ride = e['ride'];
    if (ride is Map) {
      final from = ride['pickupSummary']?.toString() ?? '';
      final to = ride['dropoffSummary']?.toString() ?? '';
      if (from.isNotEmpty) return to.isNotEmpty ? '$from → $to' : from;
    }
    return e['description']?.toString() ?? '';
  }

  @override
  Widget build(BuildContext context) {
    final wallet = _wallet;
    final currency = (wallet?['currency'] ?? 'CAD').toString();
    final canWithdraw = wallet?['canWithdraw'] == true;
    final reason = wallet?['cannotWithdrawReason']?.toString();

    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      appBar: AppBar(
        title: const Text('Wallet'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loading ? null : _refresh,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(_error!, style: const TextStyle(color: Colors.red)),
                    ),
                  GtCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Available',
                            style: TextStyle(color: Colors.black54)),
                        const SizedBox(height: 4),
                        Text(
                          '$currency ${_money(wallet?['available'])}',
                          style: const TextStyle(
                            fontSize: 28,
                            fontWeight: FontWeight.w800,
                            color: GtColors.brand,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(
                              child: _miniStat(
                                'Pending',
                                '$currency ${_money(wallet?['pending'])}',
                              ),
                            ),
                            Expanded(
                              child: _miniStat(
                                'Lifetime earned',
                                '$currency ${_money(wallet?['lifetimeEarned'])}',
                              ),
                            ),
                          ],
                        ),
                        if (wallet?['nextAvailableAt'] != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            'Next available: ${DateTime.tryParse(wallet!['nextAvailableAt'].toString())?.toLocal() ?? wallet['nextAvailableAt']}',
                            style: const TextStyle(fontSize: 12, color: Colors.black54),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  GtCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          'Withdraw',
                          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Minimum ${_money(wallet?['minimumWithdrawal'])} $currency',
                          style: const TextStyle(color: Colors.black54),
                        ),
                        if (reason != null && !canWithdraw) ...[
                          const SizedBox(height: 6),
                          Text(reason, style: const TextStyle(color: Colors.orange)),
                          if (reason.contains('PAYOUT_METHOD'))
                            TextButton(
                              onPressed: () => context.push('/onboarding/payment'),
                              child: const Text('Open payment details'),
                            ),
                        ],
                        const SizedBox(height: 8),
                        TextField(
                          controller: _amountCtrl,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          decoration: InputDecoration(
                            labelText: 'Amount ($currency)',
                            border: const OutlineInputBorder(),
                          ),
                          enabled: !_withdrawing,
                        ),
                        const SizedBox(height: 12),
                        FilledButton(
                          onPressed: (!_withdrawing && canWithdraw)
                              ? _confirmWithdraw
                              : null,
                          child: _withdrawing
                              ? const SizedBox(
                                  height: 18,
                                  width: 18,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Text('Withdraw'),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Activity',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                  ),
                  const SizedBox(height: 8),
                  if (_entries.isEmpty)
                    const GtCard(child: Text('No wallet activity yet')),
                  ..._entries.map((e) {
                    final dir = e['direction']?.toString();
                    final amt = _money(e['amount']);
                    final cur = e['currency']?.toString() ?? currency;
                    final signed = dir == 'DEBIT' ? '-$cur $amt' : '+$cur $amt';
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: GtCard(
                        child: ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(
                            _entryTitle(e),
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                          subtitle: Text(_entrySubtitle(e)),
                          trailing: Text(
                            signed,
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              color: dir == 'DEBIT' ? Colors.red[700] : GtColors.brand,
                            ),
                          ),
                          onTap: () => showWalletTransactionSheet(context, e),
                        ),
                      ),
                    );
                  }),
                ],
              ),
            ),
    );
  }

  Widget _miniStat(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.black54, fontSize: 12)),
        const SizedBox(height: 2),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
      ],
    );
  }
}
