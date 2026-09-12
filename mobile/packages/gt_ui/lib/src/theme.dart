import 'package:flutter/material.dart';

/// CAN-RIDE palette with readable contrast:
/// white surfaces, black body text, red for highlights / CTAs only.
class GtColors {
  /// Logo primary red `#E50000`
  static const brand = Color(0xFFE50000);
  static const brandDark = Color(0xFFB40000);
  static const white = Color(0xFFFFFFFF);
  static const soft = Color(0xFFFDEAEA);

  /// Alias for accent call-sites.
  static const orange = brand;

  /// Success / positive (not brand accent).
  static const green = Color(0xFF1B7A45);
  static const greenDark = Color(0xFF165F36);

  static const bg = white;
  static const bgGrey = Color(0xFFF7F7F8);
  static const border = Color(0xFFE6E6E6);

  /// Body / UI text — black, not red.
  static const text = Color(0xFF1A1A1A);
  static const textSecondary = Color(0xFF5C5C5C);
  static const textMuted = Color(0xFF9E9E9E);

  static const red = brand;
  static const warn = Color(0xFFB86E00);
  static const star = Color(0xFFF5A623);
}

class GtTheme {
  static ThemeData light() {
    final base = ThemeData(
      useMaterial3: true,
      fontFamily: 'Roboto',
      colorScheme: const ColorScheme.light(
        primary: GtColors.brand,
        onPrimary: GtColors.white,
        secondary: GtColors.brand,
        onSecondary: GtColors.white,
        surface: GtColors.white,
        onSurface: GtColors.text,
        error: GtColors.brand,
        onError: GtColors.white,
      ),
      scaffoldBackgroundColor: GtColors.bg,
      appBarTheme: const AppBarTheme(
        backgroundColor: GtColors.white,
        foregroundColor: GtColors.text,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          color: GtColors.text,
          fontSize: 18,
          fontWeight: FontWeight.w600,
        ),
        iconTheme: IconThemeData(color: GtColors.text),
      ),
      dividerColor: GtColors.border,
      textTheme: const TextTheme(
        bodyLarge: TextStyle(color: GtColors.text),
        bodyMedium: TextStyle(color: GtColors.text),
        bodySmall: TextStyle(color: GtColors.textSecondary),
        titleLarge: TextStyle(color: GtColors.text, fontWeight: FontWeight.w700),
        titleMedium: TextStyle(color: GtColors.text, fontWeight: FontWeight.w600),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((s) {
          return GtColors.white;
        }),
        trackColor: WidgetStateProperty.resolveWith((s) {
          return s.contains(WidgetState.selected)
              ? GtColors.brand
              : GtColors.border;
        }),
        trackOutlineColor: WidgetStateProperty.resolveWith((s) {
          return s.contains(WidgetState.selected)
              ? GtColors.brand
              : GtColors.border;
        }),
      ),
    );
    return base.copyWith(
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: GtColors.brand,
          foregroundColor: GtColors.white,
          minimumSize: const Size.fromHeight(48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
          elevation: 0,
        ),
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: GtColors.brand,
        foregroundColor: GtColors.white,
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: GtColors.brand,
      ),
      checkboxTheme: CheckboxThemeData(
        fillColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? GtColors.brand : GtColors.white,
        ),
        checkColor: const WidgetStatePropertyAll(GtColors.white),
        side: const BorderSide(color: GtColors.border, width: 1.5),
      ),
    );
  }
}
