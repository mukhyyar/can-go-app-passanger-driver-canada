import 'package:flutter/material.dart';
import 'package:gt_ui/gt_ui.dart';

/// Structured key/value row — omit when [value] is null/empty.
class WalletDetailRow extends StatelessWidget {
  const WalletDetailRow({
    super.key,
    required this.label,
    required this.value,
  });

  final String label;
  final String? value;

  @override
  Widget build(BuildContext context) {
    final v = value?.trim();
    if (v == null || v.isEmpty || v == 'null' || v == 'undefined') {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: const TextStyle(
                color: GtColors.textSecondary,
                fontSize: 13,
              ),
            ),
          ),
          Expanded(
            child: Text(
              v,
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
            ),
          ),
        ],
      ),
    );
  }
}

String? walletNonEmpty(dynamic v) {
  if (v == null) return null;
  final s = v.toString().trim();
  if (s.isEmpty || s == 'null' || s == 'undefined') return null;
  return s;
}

String formatWalletMoney({
  required dynamic amount,
  required dynamic currency,
  required dynamic direction,
}) {
  final cur = walletNonEmpty(currency) ?? 'CAD';
  final amt = walletNonEmpty(amount) ?? '0.00';
  final dir = walletNonEmpty(direction);
  if (dir == 'DEBIT') return '-$cur $amt';
  if (dir == 'CREDIT') return '+$cur $amt';
  return '$cur $amt';
}

String? formatWalletDateTime(dynamic iso) {
  final s = walletNonEmpty(iso);
  if (s == null) return null;
  final dt = DateTime.tryParse(s)?.toLocal();
  if (dt == null) return s;
  final y = dt.year.toString().padLeft(4, '0');
  final m = dt.month.toString().padLeft(2, '0');
  final d = dt.day.toString().padLeft(2, '0');
  final hh = dt.hour.toString().padLeft(2, '0');
  final mm = dt.minute.toString().padLeft(2, '0');
  return '$y-$m-$d $hh:$mm';
}

/// Builds optional detail rows from a wallet ledger entry map.
List<WalletDetailRow> walletEntryDetailRows(Map<String, dynamic> e) {
  final ride = e['ride'];
  final rideMap = ride is Map ? Map<String, dynamic>.from(ride) : null;

  return [
    WalletDetailRow(label: 'Type', value: walletNonEmpty(e['type'])),
    WalletDetailRow(label: 'Status', value: walletNonEmpty(e['status'])),
    WalletDetailRow(
      label: 'Amount',
      value: formatWalletMoney(
        amount: e['amount'],
        currency: e['currency'],
        direction: e['direction'],
      ),
    ),
    WalletDetailRow(label: 'Description', value: walletNonEmpty(e['description'])),
    WalletDetailRow(
      label: 'Booking ref',
      value: walletNonEmpty(rideMap?['bookingRef']),
    ),
    WalletDetailRow(
      label: 'Pickup',
      value: walletNonEmpty(rideMap?['pickupSummary']),
    ),
    WalletDetailRow(
      label: 'Dropoff',
      value: walletNonEmpty(rideMap?['dropoffSummary']),
    ),
    WalletDetailRow(
      label: 'Created',
      value: formatWalletDateTime(e['createdAt']),
    ),
    WalletDetailRow(
      label: 'Available at',
      value: formatWalletDateTime(e['availableAt']),
    ),
    WalletDetailRow(
      label: 'Payout id',
      value: walletNonEmpty(e['payoutId']),
    ),
    WalletDetailRow(
      label: 'Reference',
      value: walletNonEmpty(e['id']),
    ),
  ];
}

Future<void> showWalletTransactionSheet(
  BuildContext context,
  Map<String, dynamic> entry,
) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) {
      final rows = walletEntryDetailRows(entry);
      return SafeArea(
        child: Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            bottom: MediaQuery.viewInsetsOf(ctx).bottom + 16,
          ),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(ctx).height * 0.75,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Transaction details',
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 18,
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Close',
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.pop(ctx),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Flexible(
                  child: SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: rows,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    },
  );
}
