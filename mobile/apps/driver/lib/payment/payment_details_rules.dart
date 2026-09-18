// Pure helpers for driver payout / payment-details forms.
// Never log raw accountMask values from call sites.

class PaymentOption {
  const PaymentOption({required this.value, required this.label});
  final String value;
  final String label;
}

const kSupportedPayoutMethods = <PaymentOption>[
  PaymentOption(value: 'bank_transfer', label: 'Bank transfer'),
];

const kBillingPeriodOptions = <PaymentOption>[
  PaymentOption(value: '1 day', label: '1 day'),
  PaymentOption(value: '3 days', label: '3 days'),
  PaymentOption(value: '7 days', label: '7 days'),
  PaymentOption(value: '14 days', label: '14 days'),
];

const kCurrencyOptions = <PaymentOption>[
  PaymentOption(value: 'CAD', label: 'CAD — Canadian dollar'),
];

const kBankCountryOptions = <PaymentOption>[
  PaymentOption(value: 'Canada', label: 'Canada'),
  PaymentOption(value: 'United States', label: 'United States'),
  PaymentOption(value: 'Germany', label: 'Germany'),
  PaymentOption(value: 'UAE', label: 'United Arab Emirates'),
  PaymentOption(value: 'United Kingdom', label: 'United Kingdom'),
];

const kAccountHolderMinLen = 2;
const kAccountHolderMaxLen = 80;
const kAccountMaskMaxLen = 24;

/// Editable fields allowed in PATCH /driver/me/payment-details.
const kEditablePaymentPatchKeys = <String>{
  'billingPeriod',
  'outpaymentCurrency',
  'bankCountry',
  'payoutMethod',
  'accountHolderName',
  'accountMask',
};

const kServerControlledPaymentKeys = <String>{
  'status',
  'reviewNote',
  'reviewedAt',
  'commissionPct',
  'paymentPeriod',
};

String normalizeAccountHolder(String raw) {
  return raw.trim().replaceAll(RegExp(r'\s+'), ' ');
}

/// Returns null when valid; otherwise a human-readable error.
String? validateAccountHolder(String raw) {
  final v = normalizeAccountHolder(raw);
  if (v.isEmpty) return 'Account holder name is required';
  if (v.length < kAccountHolderMinLen) {
    return 'Account holder name is too short';
  }
  if (v.length > kAccountHolderMaxLen) {
    return 'Account holder name is too long';
  }
  return null;
}

/// Digits only from an input that may already be masked.
String _digitsOnly(String s) => s.replaceAll(RegExp(r'\D'), '');

/// Canonical form `****1234`, or null if invalid.
String? normalizeAccountMask(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return null;
  if (trimmed.length > kAccountMaskMaxLen) return null;

  final digits = _digitsOnly(trimmed);
  if (digits.length != 4) return null;

  // Reject long continuous digit runs that look like full account/card numbers.
  if (RegExp(r'\d{5,}').hasMatch(trimmed.replaceAll(RegExp(r'[\s\-*•]'), ''))) {
    return null;
  }
  // If non-mask characters include many digits beyond last-4.
  if (digits.length > 4) return null;

  // Accept plain last-4 or already-masked forms that end with those 4 digits.
  final compact = trimmed.replaceAll(RegExp(r'\s'), '');
  final looksMasked = RegExp(r'^[\*•xX·\-]*\d{4}$').hasMatch(compact) ||
      RegExp(r'^\d{4}$').hasMatch(compact);
  if (!looksMasked) return null;

  return '****$digits';
}

String? validateAccountMask(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) {
    return 'Enter the last 4 digits of your account';
  }
  final digits = _digitsOnly(trimmed);
  if (digits.length > 4 || RegExp(r'\d{5,}').hasMatch(trimmed)) {
    return 'Enter only the last 4 digits — never your full account number';
  }
  if (normalizeAccountMask(trimmed) == null) {
    return 'Enter only the last 4 digits — never your full account number';
  }
  return null;
}

String labelForPayoutMethod(String? code) {
  if (code == null || code.trim().isEmpty) return 'Bank transfer';
  final c = code.trim();
  for (final o in kSupportedPayoutMethods) {
    if (o.value == c) return o.label;
  }
  // Safe fallback for unknown future values — never crash.
  return c.replaceAll('_', ' ');
}

List<PaymentOption> optionsWithLegacy(
  List<PaymentOption> allowlist,
  String? currentValue,
) {
  final v = (currentValue ?? '').trim();
  if (v.isEmpty) return allowlist;
  if (allowlist.any((o) => o.value == v)) return allowlist;
  return [
    ...allowlist,
    PaymentOption(value: v, label: '$v (legacy)'),
  ];
}

String displayPaymentPeriod(String? apiValue) {
  final v = (apiValue ?? '').trim();
  if (v.isEmpty) return '—';
  return v;
}

String? nonEmptyString(dynamic v) {
  if (v == null) return null;
  final s = v.toString().trim();
  if (s.isEmpty || s == 'null' || s == 'undefined') return null;
  return s;
}

Map<String, dynamic> buildEditablePaymentPatch({
  required String billingPeriod,
  required String outpaymentCurrency,
  required String bankCountry,
  required String payoutMethod,
  required String accountHolderName,
  required String accountMask,
}) {
  final holder = normalizeAccountHolder(accountHolderName);
  final mask = normalizeAccountMask(accountMask);
  if (mask == null) {
    throw ArgumentError('Invalid account mask');
  }
  final method = payoutMethod.trim().isEmpty ? 'bank_transfer' : payoutMethod.trim();
  return {
    'billingPeriod': billingPeriod.trim(),
    'outpaymentCurrency': outpaymentCurrency.trim().toUpperCase(),
    'bankCountry': bankCountry.trim(),
    'payoutMethod': method,
    'accountHolderName': holder,
    'accountMask': mask,
  };
}

/// Defensive parse of GET /driver/me/payment-details into a flat map of strings.
Map<String, dynamic> parsePaymentDetailsResponse(Map<String, dynamic>? data) {
  final d = data ?? const <String, dynamic>{};
  final methodRaw = nonEmptyString(d['payoutMethod']);
  return {
    'billingPeriod': nonEmptyString(d['billingPeriod']) ?? '3 days',
    'outpaymentCurrency':
        (nonEmptyString(d['outpaymentCurrency']) ?? 'CAD').toUpperCase(),
    'bankCountry': nonEmptyString(d['bankCountry']) ?? 'Canada',
    'payoutMethod': methodRaw ?? 'bank_transfer',
    'accountHolderName': nonEmptyString(d['accountHolderName']) ?? '',
    'accountMask': nonEmptyString(d['accountMask']) ?? '',
    'paymentPeriod': nonEmptyString(d['paymentPeriod']),
    'status': nonEmptyString(d['status']) ?? 'NOT_CONFIGURED',
    'commissionPct': d['commissionPct'],
    'reviewNote': nonEmptyString(d['reviewNote']),
    'reviewedAt': nonEmptyString(d['reviewedAt']),
  };
}
