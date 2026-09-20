import 'package:flutter/services.dart';

/// Currency display helpers — never hardcodes offer amounts.
class MoneyFormat {
  static String symbolFor([String? currency]) {
    return 'CA\$';
  }

  static String format(num amount, [String currency = 'CAD', int decimals = 0]) {
    final sym = symbolFor(currency);
    return '$sym${amount.toStringAsFixed(decimals)}';
  }

  static String formatFlexible(num amount, [String currency = 'CAD']) {
    final hasCents = (amount * 100).round() % 100 != 0;
    return format(amount, currency, hasCents ? 2 : 0);
  }
}

class DecimalTextInputFormatter extends TextInputFormatter {
  DecimalTextInputFormatter({this.decimalRange = 2});

  final int decimalRange;

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final text = newValue.text.replaceAll(',', '.');
    if (text.isEmpty) return newValue.copyWith(text: '');
    if (text == '.') {
      return const TextEditingValue(
        text: '0.',
        selection: TextSelection.collapsed(offset: 2),
      );
    }
    final re = RegExp('^\\d+(\\.\\d{0,$decimalRange})?\$');
    if (!re.hasMatch(text)) return oldValue;
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

const kOfferValidityOptions = <({int seconds, String label})>[
  (seconds: 30 * 60, label: '30 min'),
  (seconds: 60 * 60, label: '1 h'),
  (seconds: 2 * 60 * 60, label: '2 h'),
  (seconds: 8 * 60 * 60, label: '8 h'),
  (seconds: 12 * 60 * 60, label: '12 h'),
  (seconds: 24 * 60 * 60, label: '1 d'),
  (seconds: 2 * 24 * 60 * 60, label: '2 d'),
  (seconds: 4 * 24 * 60 * 60, label: '4 d'),
  (seconds: 6 * 24 * 60 * 60, label: '6 d'),
];

class OfferDraft {
  OfferDraft({
    this.vehicleId,
    this.outboundPrice,
    this.returnPrice,
    this.validForSeconds,
    Set<String>? selectedOptions,
  }) : selectedOptions = selectedOptions ?? {};

  String? vehicleId;
  double? outboundPrice;
  double? returnPrice;
  int? validForSeconds;
  Set<String> selectedOptions;

  OfferDraft copy() => OfferDraft(
        vehicleId: vehicleId,
        outboundPrice: outboundPrice,
        returnPrice: returnPrice,
        validForSeconds: validForSeconds,
        selectedOptions: {...selectedOptions},
      );

  bool get hasContent =>
      vehicleId != null ||
      outboundPrice != null ||
      returnPrice != null ||
      validForSeconds != null ||
      selectedOptions.isNotEmpty;

  double get totalPrice => (outboundPrice ?? 0) + (returnPrice ?? 0);

  double get platformFee =>
      ((totalPrice * 0.20) * 100).roundToDouble() / 100.0;

  double get customerTotal =>
      ((totalPrice + platformFee) * 100).roundToDouble() / 100.0;
}

/// Translation provider abstraction — no fake translations.
abstract class NoteTranslationService {
  Future<String?> translate(String text, {String targetLocale = 'en'});
}

class PassthroughNoteTranslation implements NoteTranslationService {
  @override
  Future<String?> translate(String text, {String targetLocale = 'en'}) async {
    return null;
  }
}
