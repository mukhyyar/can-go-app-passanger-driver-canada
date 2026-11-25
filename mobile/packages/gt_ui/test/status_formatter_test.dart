import 'package:flutter_test/flutter_test.dart';
import 'package:gt_ui/gt_ui.dart';

void main() {
  group('formatStatus tests', () {
    test('formats DRIVER_NOT_ELIGIBLE to Driver Not Eligible', () {
      expect(formatStatus('DRIVER_NOT_ELIGIBLE'), 'Driver Not Eligible');
      expect(formatStatus('driver_not_eligible'), 'Driver Not Eligible');
      expect(formatStatus('Driver_not_eligible'), 'Driver Not Eligible');
    });

    test('formats wallet and withdrawal error codes properly', () {
      expect(formatStatus('PAYOUT_METHOD_REQUIRED'), 'Payout Method Required');
      expect(
          formatStatus('PAYOUT_METHOD_NOT_VERIFIED'), 'Payout Method Not Verified');
      expect(formatStatus('INSUFFICIENT_FUNDS'), 'Insufficient Funds');
      expect(
          formatStatus('BELOW_MINIMUM_WITHDRAWAL'), 'Below Minimum Withdrawal');
      expect(
          formatStatus('ABOVE_MAXIMUM_WITHDRAWAL'), 'Above Maximum Withdrawal');
      expect(formatStatus('DAILY_LIMIT_EXCEEDED'), 'Daily Limit Exceeded');
      expect(
          formatStatus('PAYOUT_ALREADY_PROCESSING'), 'Payout Already Processing');
      expect(formatStatus('IDEMPOTENCY_CONFLICT'), 'Idempotency Conflict');
      expect(
          formatStatus('IDEMPOTENCY_KEY_REQUIRED'), 'Idempotency Key Required');
      expect(formatStatus('CURRENCY_MISMATCH'), 'Currency Mismatch');
      expect(formatStatus('INVALID_AMOUNT'), 'Invalid Amount');
    });

    test('formats account and KYC statuses with acronyms preserved', () {
      expect(formatStatus('PENDING_KYC'), 'Pending KYC');
      expect(formatStatus('REQUIREMENTS_DUE'), 'Requirements Due');
      expect(formatStatus('UNDER_REVIEW'), 'Under Review');
      expect(formatStatus('OPEN_DISPUTES'), 'Open Disputes');
      expect(formatStatus('NOT_ACTIVATED'), 'Not Activated');
      expect(formatStatus('SUSPENDED'), 'Suspended');
      expect(formatStatus('ACTIVE'), 'Active');
    });

    test('formats payout and transaction statuses', () {
      expect(formatStatus('PENDING'), 'Pending');
      expect(formatStatus('PROCESSING'), 'Processing');
      expect(formatStatus('POSTED'), 'Posted');
      expect(formatStatus('SUCCEEDED'), 'Succeeded');
      expect(formatStatus('FAILED'), 'Failed');
      expect(formatStatus('EARNING'), 'Earning');
      expect(formatStatus('PAYOUT'), 'Payout');
      expect(formatStatus('DEBIT'), 'Debit');
      expect(formatStatus('CREDIT'), 'Credit');
    });

    test('formats arbitrary snake_case and kebab-case enums to Title Case', () {
      expect(
          formatStatus('CUSTOM_PAYOUT_SUB_CODE'), 'Custom Payout Sub Code');
      expect(formatStatus('some-arbitrary-state'), 'Some Arbitrary State');
      expect('DRIVER_NOT_ELIGIBLE'.toFormattedStatus, 'Driver Not Eligible');
    });

    test('handles null and empty input safely', () {
      expect(formatStatus(null), '');
      expect(formatStatus(''), '');
      expect(formatStatus('   '), '');
    });
  });
}
