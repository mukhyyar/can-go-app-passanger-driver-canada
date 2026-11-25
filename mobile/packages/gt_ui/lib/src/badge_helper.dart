import 'package:app_badge_plus/app_badge_plus.dart';
import 'package:flutter/foundation.dart';

class BadgeHelper {
  /// Updates the app icon badge count on iOS and supported Android launchers.
  /// Passing count <= 0 clears the badge.
  static Future<void> updateBadge(int count) async {
    if (kIsWeb) return;
    try {
      final safeCount = count < 0 ? 0 : count;
      final supported = await AppBadgePlus.isSupported();
      if (supported) {
        await AppBadgePlus.updateBadge(safeCount);
      }
    } catch (e) {
      debugPrint('BadgeHelper.updateBadge failed: $e');
    }
  }

  /// Clears the app icon badge (sets count to 0).
  static Future<void> clearBadge() => updateBadge(0);
}
