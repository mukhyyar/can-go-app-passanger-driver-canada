import 'package:driver/payment/wallet_transaction_detail.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('formatWalletMoney', () {
    test('earning credit uses entry currency', () {
      expect(
        formatWalletMoney(
          amount: '42.50',
          currency: 'USD',
          direction: 'CREDIT',
        ),
        '+USD 42.50',
      );
    });

    test('payout debit is signed from direction', () {
      expect(
        formatWalletMoney(
          amount: '10.00',
          currency: 'CAD',
          direction: 'DEBIT',
        ),
        '-CAD 10.00',
      );
    });
  });

  group('walletEntryDetailRows', () {
    test('ride-linked earning shows booking and places', () {
      final rows = walletEntryDetailRows({
        'type': 'EARNING',
        'status': 'POSTED',
        'amount': '25.00',
        'currency': 'CAD',
        'direction': 'CREDIT',
        'description': 'Trip completed',
        'createdAt': '2026-03-01T12:00:00.000Z',
        'ride': {
          'bookingRef': 'BK-1',
          'pickupSummary': 'Airport Terminal 1 with a very long pickup description that should wrap',
          'dropoffSummary': 'Downtown hotel lobby near the convention centre',
        },
      });
      final labels = rows
          .where((r) => r.value != null && r.value!.trim().isNotEmpty)
          .map((r) => r.label)
          .toSet();
      expect(labels.contains('Type'), isTrue);
      expect(labels.contains('Booking ref'), isTrue);
      expect(labels.contains('Pickup'), isTrue);
      expect(labels.contains('Dropoff'), isTrue);
      expect(labels.contains('Payout id'), isFalse);
    });

    test('payout without ride omits ride fields', () {
      final rows = walletEntryDetailRows({
        'type': 'PAYOUT',
        'status': 'POSTED',
        'amount': '100.00',
        'currency': 'CAD',
        'direction': 'DEBIT',
        'payoutId': 'po_1',
        'id': 'le_1',
      });
      final visible = rows.where((r) {
        final v = r.value?.trim();
        return v != null && v.isNotEmpty;
      }).toList();
      expect(visible.any((r) => r.label == 'Payout id'), isTrue);
      expect(visible.any((r) => r.label == 'Pickup'), isFalse);
      expect(visible.any((r) => r.label == 'Booking ref'), isFalse);
    });

    test('missing optional fields do not render garbage', () {
      final rows = walletEntryDetailRows({
        'type': 'ADJUSTMENT',
        'amount': '1.00',
        'currency': 'EUR',
        'direction': 'CREDIT',
        'description': null,
        'ride': null,
      });
      for (final r in rows) {
        final v = r.value;
        if (v != null) {
          expect(v.contains('null'), isFalse);
          expect(v.contains('undefined'), isFalse);
        }
      }
    });
  });

  testWidgets('transaction sheet is scrollable with SafeArea close', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) {
            return Scaffold(
              body: TextButton(
                onPressed: () => showWalletTransactionSheet(context, {
                  'type': 'EARNING',
                  'status': 'POSTED',
                  'amount': '12.00',
                  'currency': 'CAD',
                  'direction': 'CREDIT',
                  'description': 'x' * 200,
                  'ride': {
                    'pickupSummary': 'A' * 120,
                    'dropoffSummary': 'B' * 120,
                  },
                }),
                child: const Text('open'),
              ),
            );
          },
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(find.text('Transaction details'), findsOneWidget);
    expect(find.byTooltip('Close'), findsOneWidget);
    expect(find.byType(SingleChildScrollView), findsWidgets);
  });
}
