import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

/// Centralized repository of official CAN-RIDE policy and legal web URLs.
/// All apps must use these methods to direct users to the official published webpages.
class GtPolicyUrls {
  GtPolicyUrls._();

  static const String webBase = 'https://www.can-rides.ca';
  static const String privacyPolicy = '$webBase/privacy';
  static const String termsOfService = '$webBase/terms';
  static const String cancellationPolicy = '$webBase/terms';
  static const String support = '$webBase/support';
  static const String faq = '$webBase/faq';

  /// Launches an external webpage using the system default browser.
  static Future<bool> openUrl(String url) async {
    final uri = Uri.parse(url);
    try {
      return await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (e) {
      debugPrint('Failed to launch policy URL ($url): $e');
      return false;
    }
  }

  /// Opens the official CAN-RIDE Privacy Policy webpage in the browser.
  static Future<bool> openPrivacy() => openUrl(privacyPolicy);

  /// Opens the official CAN-RIDE Terms of Service & Service Agreement webpage in the browser.
  static Future<bool> openTerms() => openUrl(termsOfService);

  /// Opens the official CAN-RIDE Cancellation & Refund Policy webpage in the browser.
  static Future<bool> openCancellation() => openUrl(cancellationPolicy);

  /// Opens the webpage corresponding to a slug (e.g. 'terms', 'privacy').
  static Future<bool> openSlug(String slug) {
    if (slug.toLowerCase().trim() == 'terms') {
      return openTerms();
    }
    return openPrivacy();
  }
}
