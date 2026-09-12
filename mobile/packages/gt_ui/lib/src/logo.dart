import 'package:flutter/material.dart';

import 'theme.dart';

/// Compact maple-leaf mark (`assets/can-ride-mark.png`) for headers and chrome.
class CanGoLogo extends StatelessWidget {
  const CanGoLogo({
    super.key,
    this.size = 64,
    this.fit = BoxFit.contain,
  });

  /// Height of the logo image (width follows asset aspect).
  final double size;
  final BoxFit fit;

  static const assetPath = 'assets/can-ride-mark.png';
  static const lockupAssetPath = 'assets/can-ride-logo.png';
  static const writingAssetPath = 'assets/can-ride-writing.png';
  static const assetPackage = 'gt_ui';

  /// Native aspect of `can-ride-writing.png` (836×163).
  static const writingAspectRatio = 836 / 163;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'CAN-RIDE',
      child: Image.asset(
        assetPath,
        package: assetPackage,
        height: size,
        width: size,
        fit: fit,
        filterQuality: FilterQuality.high,
      ),
    );
  }
}

/// CAN-RIDE wordmark from `writing.png` — always scaled proportionally (never stretched).
class CanRideWordmark extends StatelessWidget {
  const CanRideWordmark({
    super.key,
    this.fontSize,
    this.alignment = Alignment.centerLeft,
    this.textAlign = TextAlign.left,
    this.compact = false,
    this.subtitle,
    this.maxWidth,
  });

  /// Target image height; width is derived from the asset aspect ratio.
  final double? fontSize;

  final AlignmentGeometry alignment;
  final TextAlign textAlign;
  final bool compact;

  /// Optional non-branded subtitle under the wordmark.
  final String? subtitle;

  /// Caps width; height scales down with the same aspect ratio.
  final double? maxWidth;

  double get _targetHeight => fontSize ?? (compact ? 20.0 : 24.0);

  @override
  Widget build(BuildContext context) {
    var height = _targetHeight;
    var width = height * CanGoLogo.writingAspectRatio;

    if (maxWidth != null && width > maxWidth!) {
      width = maxWidth!;
      height = width / CanGoLogo.writingAspectRatio;
    }

    final mark = SizedBox(
      width: width,
      height: height,
      child: Image.asset(
        CanGoLogo.writingAssetPath,
        package: CanGoLogo.assetPackage,
        width: width,
        height: height,
        fit: BoxFit.contain,
        alignment: alignment.resolve(Directionality.of(context)),
        filterQuality: FilterQuality.high,
        gaplessPlayback: true,
      ),
    );

    final column = Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: _crossAxisFor(textAlign),
      children: [
        mark,
        if (subtitle != null && subtitle!.isNotEmpty) ...[
          SizedBox(height: compact ? 1 : 2),
          Text(
            subtitle!,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: compact ? 11 : 12,
              fontWeight: FontWeight.w500,
              height: 1.2,
              color: GtColors.textSecondary.withValues(alpha: 0.95),
            ),
          ),
        ],
      ],
    );

    return Semantics(
      label: subtitle == null || subtitle!.isEmpty
          ? 'CAN-RIDE'
          : 'CAN-RIDE, $subtitle',
      child: column,
    );
  }

  static CrossAxisAlignment _crossAxisFor(TextAlign align) {
    switch (align) {
      case TextAlign.center:
        return CrossAxisAlignment.center;
      case TextAlign.right:
      case TextAlign.end:
        return CrossAxisAlignment.end;
      default:
        return CrossAxisAlignment.start;
    }
  }
}

/// @nodoc Deprecated alias — prefer [CanRideWordmark].
@Deprecated('Use CanRideWordmark')
typedef CanGoWordmark = CanRideWordmark;

/// Header chrome: maple mark + proportional writing wordmark + trailing.
class CanRideHeaderLockup extends StatelessWidget {
  const CanRideHeaderLockup({
    super.key,
    this.subtitle,
    this.markSize = 44,
    this.wordmarkSize,
    this.showMark = true,
    this.trailing,
    this.compact = false,
  });

  final String? subtitle;
  final double markSize;

  /// Wordmark height. Defaults to ~55% of [markSize] so it balances the leaf.
  final double? wordmarkSize;
  final bool showMark;
  final Widget? trailing;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final wordH = wordmarkSize ?? (markSize * (compact ? 0.50 : 0.55));

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        if (showMark) ...[
          CanGoLogo(size: markSize),
          SizedBox(width: compact ? 8 : 10),
        ],
        Flexible(
          child: LayoutBuilder(
            builder: (context, constraints) {
              return Align(
                alignment: Alignment.centerLeft,
                child: CanRideWordmark(
                  fontSize: wordH,
                  compact: compact,
                  subtitle: subtitle,
                  maxWidth: constraints.maxWidth.isFinite
                      ? constraints.maxWidth
                      : null,
                  alignment: Alignment.centerLeft,
                ),
              );
            },
          ),
        ),
        if (trailing != null) ...[
          const SizedBox(width: 8),
          trailing!,
        ],
      ],
    );
  }
}

/// Brand hero for splash / onboarding: mark + wordmark image + optional tagline.
class CanRideBrandHero extends StatelessWidget {
  const CanRideBrandHero({
    super.key,
    this.markSize = 88,
    this.wordmarkSize = 36,
    this.tagline,
    this.glow,
  });

  final double markSize;
  final double wordmarkSize;
  final String? tagline;
  final Widget? glow;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (glow != null)
          Stack(
            alignment: Alignment.center,
            children: [
              glow!,
              CanGoLogo(size: markSize),
            ],
          )
        else
          CanGoLogo(size: markSize),
        const SizedBox(height: 16),
        CanRideWordmark(
          fontSize: wordmarkSize,
          textAlign: TextAlign.center,
          alignment: Alignment.center,
          maxWidth: 280,
        ),
        if (tagline != null && tagline!.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text(
            tagline!,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              height: 1.3,
              color: GtColors.textSecondary.withValues(alpha: 0.9),
            ),
          ),
        ],
      ],
    );
  }
}

/// Prefer [CanRideBrandHero]. Kept for call-site compat.
class CanGoBrandMark extends StatelessWidget {
  const CanGoBrandMark({
    super.key,
    this.logoSize = 160,
    this.showTagline = false,
    this.tagline = 'Your marketplace for every ride',
  });

  final double logoSize;
  final bool showTagline;
  final String tagline;

  @override
  Widget build(BuildContext context) {
    final markSize = (logoSize * 0.55).clamp(48.0, 120.0);
    final wordSize = (logoSize * 0.22).clamp(20.0, 40.0);
    return CanRideBrandHero(
      markSize: markSize,
      wordmarkSize: wordSize,
      tagline: showTagline ? tagline : null,
    );
  }
}
