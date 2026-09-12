import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Centralized CAN-RIDE brand colors.
class GtBrandColors {
  /// Pure black for the `CAN` segment.
  static const canText = Color(0xFF000000);

  /// Dominant brand red (`#E50000`).
  static const rideRed = Color(0xFFE50000);
}

/// Typography tokens for text fallbacks (headers use writing.png image).
class GtBrandTypography {
  static const fontFamily = 'Montserrat';
  static const fontWeight = FontWeight.w900;
  static const letterSpacing = 0.0;
  static const height = 1.0;

  static TextStyle wordmark({double fontSize = 24}) {
    return GoogleFonts.montserrat(
      fontWeight: fontWeight,
      fontSize: fontSize,
      letterSpacing: letterSpacing,
      height: height,
    );
  }
}
