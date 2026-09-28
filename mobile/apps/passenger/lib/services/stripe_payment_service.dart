import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart' show ThemeMode;
import 'package:flutter_stripe/flutter_stripe.dart';

/// Stripe PaymentSheet helper for passenger booking charges.
class StripePaymentService {
  StripePaymentService._();

  static const _dartDefinePk = String.fromEnvironment(
    'CANGO_STRIPE_PK',
    defaultValue: '',
  );

  static String? _configuredKey;

  /// Prefer API-provided key; fall back to `--dart-define=CANGO_STRIPE_PK=…`.
  static String? resolvePublishableKey(String? fromApi) {
    final api = fromApi?.trim() ?? '';
    if (api.isNotEmpty) return api;
    final defined = _dartDefinePk.trim();
    if (defined.isNotEmpty) return defined;
    return null;
  }

  static Future<void> ensureConfigured(String publishableKey) async {
    final key = publishableKey.trim();
    if (key.isEmpty) {
      throw StateError(
        'Stripe publishable key missing. Set STRIPE_PUBLISHABLE_KEY on the API '
        'or pass --dart-define=CANGO_STRIPE_PK=pk_…',
      );
    }
    if (_configuredKey == key) return;
    Stripe.publishableKey = key;
    if (!kIsWeb) {
      await Stripe.instance.applySettings();
    }
    _configuredKey = key;
  }

  /// Presents Stripe PaymentSheet (card + available wallets). Throws on cancel/error.
  static Future<void> presentPaymentSheet({
    required String clientSecret,
    required String publishableKey,
    required String currency,
    String merchantDisplayName = 'CAN-RIDE',
    String merchantCountryCode = 'CA',
  }) async {
    await ensureConfigured(publishableKey);

    final currencyCode = currency.trim().toUpperCase();
    final isTest = publishableKey.startsWith('pk_test');

    await Stripe.instance.initPaymentSheet(
      paymentSheetParameters: SetupPaymentSheetParameters(
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: merchantDisplayName,
        style: ThemeMode.system,
        googlePay: PaymentSheetGooglePay(
          merchantCountryCode: merchantCountryCode,
          currencyCode: currencyCode,
          testEnv: isTest,
        ),
        applePay: PaymentSheetApplePay(
          merchantCountryCode: merchantCountryCode,
        ),
      ),
    );

    await Stripe.instance.presentPaymentSheet();
  }

  static bool isUserCancelled(Object error) {
    if (error is StripeException) {
      return error.error.code == FailureCode.Canceled;
    }
    final msg = error.toString().toLowerCase();
    return msg.contains('canceled') || msg.contains('cancelled');
  }
}
