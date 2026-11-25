import 'dart:math';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../payment/wallet_transaction_detail.dart';
import '../state/app_state.dart';
import '../utils/error_utils.dart';

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
      final msg = e is ApiException && e.statusCode == 401
          ? 'Session expired. Please sign in again.'
          : cleanErrorMessage(e);
      setState(() {
        _error = msg;
        _loading = false;
      });
    }
  }

  String _money(dynamic v) => (v ?? '0.00').toString();

  String _balanceFallback(Map<String, dynamic>? wallet) {
    final a = double.tryParse(_money(wallet?['available'])) ?? 0;
    final p = double.tryParse(_money(wallet?['pending'])) ?? 0;
    return (a + p).toStringAsFixed(2);
  }

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
                : 'Withdrawal ${formatStatus(status)}',
          ),
        ),
      );
      _amountCtrl.clear();
      await _refresh();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(cleanErrorMessage(e))),
      );
    } finally {
      if (mounted) setState(() => _withdrawing = false);
    }
  }

  void _showFinancialStatementDialog() {
    final now = DateTime.now();
    int selectedYear = now.year;
    // Default to previous month if available, else current month
    int selectedMonth = now.month > 1 ? now.month - 1 : 12;
    if (now.month == 1) selectedYear = now.year - 1;
    String statementType = 'MONTHLY'; // 'MONTHLY' | 'YEARLY'
    bool sending = false;
    String? errorText;

    final availableYears = List.generate(4, (i) => now.year - i);
    final monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 24,
                bottom: MediaQuery.of(context).viewInsets.bottom + 24,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: GtColors.brand.withValues(alpha: 0.1),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.receipt_long_outlined,
                          color: GtColors.brand,
                        ),
                      ),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Text(
                          'Email Financial Statement',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => Navigator.of(context).pop(),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Get an itemized statement of gross fares, commissions, tips, and payouts sent to your registered email for personal records and CRA tax filing.',
                    style: TextStyle(fontSize: 13, color: Colors.black54),
                  ),
                  const SizedBox(height: 16),
                  SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(value: 'MONTHLY', label: Text('Monthly')),
                      ButtonSegment(value: 'YEARLY', label: Text('Annual (Yearly)')),
                    ],
                    selected: {statementType},
                    onSelectionChanged: (set) {
                      setModalState(() {
                        statementType = set.first;
                      });
                    },
                  ),
                  const SizedBox(height: 16),
                  if (statementType == 'MONTHLY') ...[
                    Row(
                      children: [
                        Expanded(
                          flex: 3,
                          child: DropdownButtonFormField<int>(
                            initialValue: selectedMonth,
                            decoration: const InputDecoration(
                              labelText: 'Month',
                              border: OutlineInputBorder(),
                              contentPadding: EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 8,
                              ),
                            ),
                            items: List.generate(12, (index) {
                              return DropdownMenuItem(
                                value: index + 1,
                                child: Text(monthNames[index]),
                              );
                            }),
                            onChanged: (val) {
                              if (val != null) {
                                setModalState(() => selectedMonth = val);
                              }
                            },
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          flex: 2,
                          child: DropdownButtonFormField<int>(
                            initialValue: selectedYear,
                            decoration: const InputDecoration(
                              labelText: 'Year',
                              border: OutlineInputBorder(),
                              contentPadding: EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 8,
                              ),
                            ),
                            items: availableYears.map((y) {
                              return DropdownMenuItem(
                                value: y,
                                child: Text('$y'),
                              );
                            }).toList(),
                            onChanged: (val) {
                              if (val != null) {
                                setModalState(() => selectedYear = val);
                              }
                            },
                          ),
                        ),
                      ],
                    ),
                  ] else ...[
                    DropdownButtonFormField<int>(
                      initialValue: selectedYear,
                      decoration: const InputDecoration(
                        labelText: 'Tax Year',
                        border: OutlineInputBorder(),
                        contentPadding: EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                      ),
                      items: availableYears.map((y) {
                        return DropdownMenuItem(
                          value: y,
                          child: Text('Annual Tax Year $y'),
                        );
                      }).toList(),
                      onChanged: (val) {
                        if (val != null) {
                          setModalState(() => selectedYear = val);
                        }
                      },
                    ),
                  ],
                  if (errorText != null) ...[
                    const SizedBox(height: 12),
                    Text(
                      errorText!,
                      style: const TextStyle(color: Colors.red, fontSize: 13),
                    ),
                  ],
                  const SizedBox(height: 20),
                  FilledButton.icon(
                    icon: sending
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.send_rounded, size: 18),
                    label: Text(
                      sending ? 'Sending...' : 'Send Statement to Email',
                    ),
                    onPressed: sending
                        ? null
                        : () async {
                            setModalState(() {
                              sending = true;
                              errorText = null;
                            });
                            try {
                              final app = context.read<AppState>();
                              final res = await app.emailFinancialSummary(
                                type: statementType,
                                year: selectedYear,
                                month: statementType == 'MONTHLY'
                                    ? selectedMonth
                                    : null,
                              );
                              if (context.mounted) {
                                Navigator.of(context).pop();
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text(
                                      res['message']?.toString() ??
                                          'Financial statement sent to your email!',
                                    ),
                                    backgroundColor: Colors.green[800],
                                  ),
                                );
                              }
                            } catch (e) {
                              setModalState(() {
                                sending = false;
                                errorText = cleanErrorMessage(e);
                              });
                            }
                          },
                  ),
                ],
              ),
            );
          },
        );
      },
    );
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
    return formatStatus(type);
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

    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      appBar: AppBar(
        title: const Text('Wallet'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.canPop() ? context.pop() : context.go('/'),
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
                        const Text('Balance',
                            style: TextStyle(color: Colors.black54)),
                        const SizedBox(height: 4),
                        Text(
                          '$currency ${_money(wallet?['balance'] ?? _balanceFallback(wallet))}',
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
                                'Available to withdraw',
                                '$currency ${_money(wallet?['available'])}',
                              ),
                            ),
                            Expanded(
                              child: _miniStat(
                                'On hold',
                                '$currency ${_money(wallet?['pending'])}',
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        _miniStat(
                          'Lifetime earned',
                          '$currency ${_money(wallet?['lifetimeEarned'])}',
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
                        if (!canWithdraw) _buildWithdrawalNotice(wallet),
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
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Activity',
                        style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                      ),
                      TextButton.icon(
                        icon: const Icon(Icons.receipt_long_outlined, size: 18),
                        label: const Text('Email Statement'),
                        style: TextButton.styleFrom(
                          foregroundColor: GtColors.brand,
                          visualDensity: VisualDensity.compact,
                        ),
                        onPressed: _showFinancialStatementDialog,
                      ),
                    ],
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

  Widget _buildWithdrawalNotice(Map<String, dynamic>? wallet) {
    final reason = wallet?['cannotWithdrawReason']?.toString();
    if (reason == null) return const SizedBox.shrink();

    final formattedReason =
        wallet?['cannotWithdrawFormattedReason']?.toString() ??
            formatStatus(reason);
    final message = wallet?['cannotWithdrawMessage']?.toString();
    final details = wallet?['cannotWithdrawDetails'];
    final subReason =
        (details is Map ? details['subReason']?.toString() : null) ?? '';
    final openDisputesCount = (details is Map
            ? (details['openDisputesCount'] as num?)?.toInt()
            : null) ??
        (wallet?['openDisputesCount'] as num?)?.toInt() ??
        0;

    final isDispute = subReason == 'OPEN_DISPUTES' ||
        openDisputesCount > 0 ||
        (message != null && message.toLowerCase().contains('dispute'));
    final isPayoutMethod = reason.contains('PAYOUT_METHOD');

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isDispute
            ? const Color(0xFFFEF2F2)
            : const Color(0xFFFFFBEB),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isDispute
              ? const Color(0xFFFCA5A5)
              : const Color(0xFFFDE68A),
          width: 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                isDispute
                    ? Icons.warning_amber_rounded
                    : Icons.info_outline,
                size: 20,
                color: isDispute
                    ? const Color(0xFFDC2626)
                    : const Color(0xFFD97706),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  formattedReason,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                    color: isDispute
                        ? const Color(0xFF991B1B)
                        : const Color(0xFF92400E),
                  ),
                ),
              ),
              if (openDisputesCount > 0)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFFDC2626),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    '$openDisputesCount Open Dispute${openDisputesCount > 1 ? 's' : ''}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            message ??
                (isDispute
                    ? 'Payouts are temporarily on hold due to open ride disputes under review.'
                    : (isPayoutMethod
                        ? 'Please complete your payout method setup before requesting a withdrawal.'
                        : 'You are currently not eligible for withdrawals.')),
            style: TextStyle(
              fontSize: 13,
              color: isDispute
                  ? const Color(0xFF7F1D1D)
                  : const Color(0xFF78350F),
              height: 1.35,
            ),
          ),
          if (isDispute) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFFDC2626),
                    foregroundColor: Colors.white,
                    visualDensity: VisualDensity.compact,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 6),
                  ),
                  icon: const Icon(Icons.support_agent, size: 16),
                  label: const Text('Contact Support',
                      style:
                          TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                  onPressed: () => context.push('/chats'),
                ),
                const SizedBox(width: 8),
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF4B5563),
                    visualDensity: VisualDensity.compact,
                    side: const BorderSide(color: Color(0xFFD1D5DB)),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 6),
                  ),
                  icon: const Icon(Icons.refresh, size: 14),
                  label:
                      const Text('Check Again', style: TextStyle(fontSize: 12)),
                  onPressed: _refresh,
                ),
              ],
            ),
          ] else if (isPayoutMethod) ...[
            const SizedBox(height: 8),
            FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: GtColors.brand,
                foregroundColor: Colors.white,
                visualDensity: VisualDensity.compact,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              ),
              icon: const Icon(Icons.account_balance, size: 16),
              label: const Text('Open Payment Details',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
              onPressed: () => context.push('/onboarding/payment'),
            ),
          ],
        ],
      ),
    );
  }
}
