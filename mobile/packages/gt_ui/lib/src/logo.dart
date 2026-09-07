import 'package:flutter/material.dart';
import 'theme.dart';

/// Official CAN-GO logo asset (`assets/can-go-logo.png`).
class CanGoLogo extends StatelessWidget {
  const CanGoLogo({
    super.key,
    this.size = 64,
    this.fit = BoxFit.contain,
  });

  /// Height of the logo image (width follows asset aspect ~0.81).
  final double size;
  final BoxFit fit;

  static const assetPath = 'assets/can-go-logo.png';
  static const assetPackage = 'gt_ui';

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'CAN-GO',
      child: Image.asset(
        assetPath,
        package: assetPackage,
        height: size,
        fit: fit,
        filterQuality: FilterQuality.high,
      ),
    );
  }
}

/// Full brand lockup from the official PNG (leaf + CAN-GO + tagline).
class CanGoBrandMark extends StatelessWidget {
  const CanGoBrandMark({
    super.key,
    this.logoSize = 160,
    this.showTagline = false,
    this.tagline = 'Your next adventure starts here',
  });

  final double logoSize;

  /// Ignored — tagline is already in the PNG. Kept for call-site compat.
  final bool showTagline;
  final String tagline;

  @override
  Widget build(BuildContext context) {
    return CanGoLogo(size: logoSize);
  }
}
