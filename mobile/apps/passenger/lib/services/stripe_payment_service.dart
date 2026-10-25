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

  static const _dartDefineMerchantId = String.fromEnvironment(
    'CANGO_STRIPE_MERCHANT_ID',
    defaultValue: '',
  );

  static const String appUrlScheme = 'canride';
  static const String returnUrl = 'canride://safepay';

  static String? _configuredKey;
  static String? _configuredMerchantId;

  /// Prefer API-provided key; fall back to `--dart-define=CANGO_STRIPE_PK=…`.
  static String? resolvePublishableKey(String? fromApi) {
    final api = fromApi?.trim() ?? '';
    if (api.isNotEmpty) return api;
    final defined = _dartDefinePk.trim();
    if (defined.isNotEmpty) return defined;
    return null;
  }

  /// Resolve Apple Merchant Identifier (if configured).
  static String? resolveMerchantIdentifier(String? fromApi) {
    final api = fromApi?.trim() ?? '';
    if (api.isNotEmpty) return api;
    final defined = _dartDefineMerchantId.trim();
    if (defined.isNotEmpty) return defined;
    return null;
  }

  static Future<void> ensureConfigured(
    String publishableKey, {
    String? merchantIdentifier,
  }) async {
    final key = publishableKey.trim();
    if (key.isEmpty) {
      throw StateError(
        'Stripe publishable key missing. Set STRIPE_PUBLISHABLE_KEY on the API '
        'or pass --dart-define=CANGO_STRIPE_PK=pk_…',
      );
    }

    final resolvedMerchantId = resolveMerchantIdentifier(merchantIdentifier);

    if (_configuredKey == key && _configuredMerchantId == resolvedMerchantId) {
      return;
    }

    Stripe.publishableKey = key;
    Stripe.urlScheme = appUrlScheme;
    if (resolvedMerchantId != null && resolvedMerchantId.isNotEmpty) {
      Stripe.merchantIdentifier = resolvedMerchantId;
    }

    if (!kIsWeb) {
      await Stripe.instance.applySettings();
    }
    _configuredKey = key;
    _configuredMerchantId = resolvedMerchantId;
  }

  /// Presents Stripe PaymentSheet (card + available wallets). Throws on cancel/error.
  static Future<void> presentPaymentSheet({
    required String clientSecret,
    required String publishableKey,
    required String currency,
    String? merchantIdentifier,
    String merchantDisplayName = 'CAN-RIDE',
    String merchantCountryCode = 'CA',
  }) async {
    final resolvedMerchantId = resolveMerchantIdentifier(merchantIdentifier);
    await ensureConfigured(
      publishableKey,
      merchantIdentifier: resolvedMerchantId,
    );

    final currencyCode = currency.trim().toUpperCase();
    final isTest = publishableKey.startsWith('pk_test');

    // Only configure Apple Pay if a merchant identifier is explicitly provided and valid.
    // Otherwise, passing PaymentSheetApplePay without merchantIdentifier throws
    // ApplePayUtilsError.missingMerchantId on iOS and prevents the payment sheet from opening.
    final PaymentSheetApplePay? applePayConfig;
    if (defaultTargetPlatform == TargetPlatform.iOS &&
        resolvedMerchantId != null &&
        resolvedMerchantId.isNotEmpty) {
      applePayConfig = PaymentSheetApplePay(
        merchantCountryCode: merchantCountryCode,
      );
    } else {
      applePayConfig = null;
    }

    final PaymentSheetGooglePay? googlePayConfig;
    if (defaultTargetPlatform == TargetPlatform.android) {
      googlePayConfig = PaymentSheetGooglePay(
        merchantCountryCode: merchantCountryCode,
        currencyCode: currencyCode,
        testEnv: isTest,
      );
    } else {
      googlePayConfig = null;
    }

    await Stripe.instance.initPaymentSheet(
      paymentSheetParameters: SetupPaymentSheetParameters(
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: merchantDisplayName,
        style: ThemeMode.system,
        returnURL: returnUrl,
        googlePay: googlePayConfig,
        applePay: applePayConfig,
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

