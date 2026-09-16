import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:gt_ui/src/theme.dart';

/// Circular profile avatar that never renders a blank failed image.
///
/// Priority: [bytes] MemoryImage → loading overlay on existing bytes →
/// initials/placeholder. Image errors fall back to initials.
class GtProfileAvatar extends StatelessWidget {
  const GtProfileAvatar({
    super.key,
    required this.size,
    this.bytes,
    this.initials,
    this.loading = false,
    this.onTap,
    this.semanticLabel = 'Profile photo',
    this.changeLabel = 'Change profile photo',
    this.showEditBadge = false,
  });

  final double size;
  final Uint8List? bytes;
  final String? initials;
  final bool loading;
  final VoidCallback? onTap;
  final String semanticLabel;
  final String changeLabel;
  final bool showEditBadge;

  @override
  Widget build(BuildContext context) {
    final hasBytes = bytes != null && bytes!.isNotEmpty;
    final label = onTap != null ? changeLabel : semanticLabel;

    Widget circle = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: GtColors.soft,
        shape: BoxShape.circle,
        border: Border.all(color: GtColors.brand.withValues(alpha: 0.2)),
      ),
      clipBehavior: Clip.antiAlias,
      alignment: Alignment.center,
      child: hasBytes
          ? Image.memory(
              bytes!,
              width: size,
              height: size,
              fit: BoxFit.cover,
              gaplessPlayback: true,
              errorBuilder: (_, __, ___) => _Placeholder(
                size: size,
                initials: initials,
              ),
            )
          : _Placeholder(size: size, initials: initials),
    );

    if (loading) {
      circle = Stack(
        alignment: Alignment.center,
        children: [
          circle,
          Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.35),
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: SizedBox(
              width: size * 0.36,
              height: size * 0.36,
              child: const CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white,
              ),
            ),
          ),
        ],
      );
    } else if (showEditBadge && onTap != null) {
      circle = Stack(
        clipBehavior: Clip.none,
        children: [
          circle,
          Positioned(
            right: 0,
            bottom: 0,
            child: Semantics(
              label: 'Edit photo',
              child: Container(
                width: (size * 0.32).clamp(16, 22),
                height: (size * 0.32).clamp(16, 22),
                decoration: BoxDecoration(
                  color: GtColors.brand,
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 1.5),
                ),
                child: Icon(
                  Icons.camera_alt,
                  size: (size * 0.16).clamp(8, 12),
                  color: Colors.white,
                ),
              ),
            ),
          ),
        ],
      );
    }

    final tappable = Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: Padding(
          // Comfortable tap target without enlarging the visual circle.
          padding: EdgeInsets.all(size < 48 ? (48 - size) / 2 : 0),
          child: circle,
        ),
      ),
    );

    return Semantics(
      button: onTap != null,
      label: label,
      child: Tooltip(
        message: onTap != null ? changeLabel : semanticLabel,
        child: tappable,
      ),
    );
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder({required this.size, this.initials});

  final double size;
  final String? initials;

  @override
  Widget build(BuildContext context) {
    if (initials != null && initials!.isNotEmpty) {
      return Text(
        initials!,
        style: TextStyle(
          fontSize: size * 0.34,
          fontWeight: FontWeight.w700,
          color: GtColors.brand,
        ),
      );
    }
    return Icon(
      Icons.person_outline,
      size: size * 0.48,
      color: GtColors.brand,
    );
  }
}
