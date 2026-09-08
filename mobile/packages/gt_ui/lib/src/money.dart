/// Formats a monetary amount with a display prefix derived from an ISO code
/// or existing display symbol (e.g. `CAD` / `CA$` → `CA$4,353`).
String formatMoney(num amount, String currencyCode) {
  final prefix = currencyDisplayPrefix(currencyCode);
  final abs = amount.abs();
  final whole = abs.truncateToDouble() == abs;
  final formatted = whole
      ? _withThousands(abs.round())
      : '${_withThousands(abs.floor())}.${((abs - abs.floor()) * 100).round().toString().padLeft(2, '0')}';
  final signed = amount < 0 ? '-$prefix$formatted' : '$prefix$formatted';
  return signed;
}

/// Display prefix for a currency code or symbol.
String currencyDisplayPrefix(String currencyCode) {
  final raw = currencyCode.trim();
  if (raw.isEmpty) return 'US\$';
  final upper = raw.toUpperCase();
  final letters = upper.replaceAll(RegExp(r'[^A-Z]'), '');
  switch (letters) {
    case 'CAD':
      return 'CA\$';
    case 'USD':
    case 'US':
      return 'US\$';
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    case 'AED':
      return 'AED ';
    default:
      if (raw.contains('\$') || raw.contains('€') || raw.contains('£')) {
        return raw.endsWith(' ') ? raw : raw;
      }
      if (letters.length == 3) return '$letters ';
      return raw;
  }
}

String _withThousands(int n) {
  final s = n.toString();
  final buf = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) buf.write(',');
    buf.write(s[i]);
  }
  return buf.toString();
}
