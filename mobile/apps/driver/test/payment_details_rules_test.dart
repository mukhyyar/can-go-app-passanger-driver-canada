import 'package:driver/payment/payment_details_rules.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('account holder', () {
    test('normalizes whitespace', () {
      expect(normalizeAccountHolder('  Jane   Doe  '), 'Jane Doe');
    });

    test('requires non-empty', () {
      expect(validateAccountHolder('   '), isNotNull);
      expect(validateAccountHolder(''), isNotNull);
    });

    test('allows international names', () {
      expect(validateAccountHolder('José García'), isNull);
      expect(validateAccountHolder('李雷'), isNull);
    });

    test('rejects too short / too long', () {
      expect(validateAccountHolder('A'), isNotNull);
      expect(validateAccountHolder('A' * 81), isNotNull);
    });
  });

  group('account mask', () {
    test('canonicalizes last-4', () {
      expect(normalizeAccountMask('1234'), '****1234');
      expect(normalizeAccountMask('  9876 '), '****9876');
    });

    test('accepts already masked', () {
      expect(normalizeAccountMask('****4321'), '****4321');
    });

    test('rejects full account numbers', () {
      expect(normalizeAccountMask('123456789012'), isNull);
      expect(normalizeAccountMask('4111111111111111'), isNull);
      expect(validateAccountMask('12345678'), isNotNull);
    });

    test('validate accepts last-4', () {
      expect(validateAccountMask('1234'), isNull);
    });
  });

  group('payout method', () {
    test('maps bank_transfer', () {
      expect(labelForPayoutMethod('bank_transfer'), 'Bank transfer');
    });

    test('unknown methods render safely', () {
      expect(labelForPayoutMethod('wire_swift'), 'wire swift');
      expect(labelForPayoutMethod(null), 'Bank transfer');
    });
  });

  group('parsePaymentDetailsResponse', () {
    test('hydrates holder/mask/method/paymentPeriod', () {
      final p = parsePaymentDetailsResponse({
        'accountHolderName': 'Ada Lovelace',
        'accountMask': '****1111',
        'payoutMethod': 'bank_transfer',
        'paymentPeriod': '30 working days',
        'status': 'PENDING',
        'commissionPct': 15,
        'billingPeriod': '7 days',
        'outpaymentCurrency': 'cad',
        'bankCountry': 'Canada',
      });
      expect(p['accountHolderName'], 'Ada Lovelace');
      expect(p['accountMask'], '****1111');
      expect(p['payoutMethod'], 'bank_transfer');
      expect(p['paymentPeriod'], '30 working days');
      expect(p['outpaymentCurrency'], 'CAD');
      expect(p['status'], 'PENDING');
    });

    test('legacy/null response is safe', () {
      final p = parsePaymentDetailsResponse({});
      expect(p['accountHolderName'], '');
      expect(p['accountMask'], '');
      expect(p['payoutMethod'], 'bank_transfer');
      expect(p['paymentPeriod'], isNull);
      expect(p['status'], 'NOT_CONFIGURED');
      expect(displayPaymentPeriod(p['paymentPeriod'] as String?), '—');
    });

    test('review fields null-safe', () {
      final p = parsePaymentDetailsResponse({
        'reviewNote': null,
        'reviewedAt': '',
        'status': 'VERIFIED',
      });
      expect(p['reviewNote'], isNull);
      expect(p['reviewedAt'], isNull);
    });
  });

  group('buildEditablePaymentPatch', () {
    test('contains only editable fields', () {
      final patch = buildEditablePaymentPatch(
        billingPeriod: '3 days',
        outpaymentCurrency: 'CAD',
        bankCountry: 'Canada',
        payoutMethod: 'bank_transfer',
        accountHolderName: '  Jane  Doe ',
        accountMask: '1234',
      );
      expect(patch.keys.toSet(), kEditablePaymentPatchKeys);
      for (final k in kServerControlledPaymentKeys) {
        expect(patch.containsKey(k), isFalse);
      }
      expect(patch['accountHolderName'], 'Jane Doe');
      expect(patch['accountMask'], '****1234');
    });
  });

  group('paymentPeriod display', () {
    test('never hardcodes thirty working days', () {
      expect(displayPaymentPeriod(null), '—');
      expect(displayPaymentPeriod(''), '—');
      expect(displayPaymentPeriod('14 calendar days'), '14 calendar days');
    });
  });
}
