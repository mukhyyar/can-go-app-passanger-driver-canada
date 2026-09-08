import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'theme.dart';

/// Masks an E.164 phone for display, e.g. `+1 ••• ••• 1234`.
String maskPhoneE164(String? phone) {
  final raw = (phone ?? '').trim();
  final digits = raw.replaceAll(RegExp(r'\D'), '');
  if (digits.length < 7) return 'your phone';
  final last4 = digits.substring(digits.length - 4);
  String country = '+';
  if (raw.startsWith('+') && digits.length > 10) {
    final ccLen = digits.length - 10;
    country = '+${digits.substring(0, ccLen)}';
  } else if (raw.startsWith('+')) {
    country = '+${digits.substring(0, (digits.length - 4).clamp(1, 3))}';
  }
  return '$country ••• ••• $last4';
}

enum GtOtpStatus { idle, error, success }

/// Premium 6-digit OTP input with visual cells, paste & SMS autofill support.
class GtOtpInput extends StatefulWidget {
  const GtOtpInput({
    super.key,
    this.length = 6,
    this.enabled = true,
    this.autofocus = true,
    this.status = GtOtpStatus.idle,
    this.onChanged,
    this.onCompleted,
    this.controller,
  });

  final int length;
  final bool enabled;
  final bool autofocus;
  final GtOtpStatus status;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onCompleted;
  final TextEditingController? controller;

  @override
  State<GtOtpInput> createState() => _GtOtpInputState();
}

class _GtOtpInputState extends State<GtOtpInput>
    with SingleTickerProviderStateMixin {
  late final TextEditingController _controller;
  late final bool _ownsController;
  final FocusNode _focus = FocusNode();
  late final AnimationController _shake;
  late final Animation<double> _shakeAnim;

  @override
  void initState() {
    super.initState();
    _ownsController = widget.controller == null;
    _controller = widget.controller ?? TextEditingController();
    _controller.addListener(_onText);
    _shake = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 420),
    );
    _shakeAnim = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0, end: -8), weight: 1),
      TweenSequenceItem(tween: Tween(begin: -8, end: 8), weight: 2),
      TweenSequenceItem(tween: Tween(begin: 8, end: -6), weight: 2),
      TweenSequenceItem(tween: Tween(begin: -6, end: 4), weight: 2),
      TweenSequenceItem(tween: Tween(begin: 4, end: 0), weight: 1),
    ]).animate(CurvedAnimation(parent: _shake, curve: Curves.easeOut));
    if (widget.autofocus) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && widget.enabled) _focus.requestFocus();
      });
    }
  }

  @override
  void didUpdateWidget(covariant GtOtpInput oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.status != GtOtpStatus.error &&
        widget.status == GtOtpStatus.error) {
      _shake.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.removeListener(_onText);
    if (_ownsController) _controller.dispose();
    _focus.dispose();
    _shake.dispose();
    super.dispose();
  }

  String get _digits =>
      _controller.text.replaceAll(RegExp(r'\D'), '').substring(
            0,
            _controller.text.replaceAll(RegExp(r'\D'), '').length
                .clamp(0, widget.length),
          );

  void _onText() {
    final cleaned = _controller.text.replaceAll(RegExp(r'\D'), '');
    final clipped = cleaned.length > widget.length
        ? cleaned.substring(0, widget.length)
        : cleaned;
    if (clipped != _controller.text) {
      _controller.value = TextEditingValue(
        text: clipped,
        selection: TextSelection.collapsed(offset: clipped.length),
      );
      return;
    }
    widget.onChanged?.call(clipped);
    if (clipped.length == widget.length) {
      widget.onCompleted?.call(clipped);
    }
    setState(() {});
  }

  void _tapBoxes() {
    if (!widget.enabled) return;
    _focus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final digits = _digits;
    final activeIndex = digits.length.clamp(0, widget.length - 1);

    return AnimatedBuilder(
      animation: _shakeAnim,
      builder: (context, child) {
        return Transform.translate(
          offset: Offset(_shakeAnim.value, 0),
          child: child,
        );
      },
      child: LayoutBuilder(
        builder: (context, constraints) {
          final gap = constraints.maxWidth < 340 ? 6.0 : 10.0;
          final totalGap = gap * (widget.length - 1);
          final cellW =
              ((constraints.maxWidth - totalGap) / widget.length).clamp(36.0, 56.0);
          final cellH = cellW * 1.15;

          return Semantics(
            label: 'Verification code, ${widget.length} digits',
            textField: true,
            child: Stack(
              alignment: Alignment.center,
              children: [
                Opacity(
                  opacity: 0.02,
                  child: TextField(
                    controller: _controller,
                    focusNode: _focus,
                    enabled: widget.enabled,
                    autofocus: widget.autofocus,
                    keyboardType: TextInputType.number,
                    textInputAction: TextInputAction.done,
                    autofillHints: const [AutofillHints.oneTimeCode],
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(widget.length),
                    ],
                    style: const TextStyle(color: Colors.transparent, height: 0.1),
                    cursorColor: Colors.transparent,
                    decoration: const InputDecoration(
                      border: InputBorder.none,
                      contentPadding: EdgeInsets.zero,
                      isDense: true,
                    ),
                    onTap: _tapBoxes,
                  ),
                ),
                GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: _tapBoxes,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(widget.length, (i) {
                      final filled = i < digits.length;
                      final char = filled ? digits[i] : '';
                      final isActive = widget.enabled &&
                          widget.status != GtOtpStatus.success &&
                          _focus.hasFocus &&
                          i == activeIndex &&
                          digits.length < widget.length;
                      return Padding(
                        padding: EdgeInsets.only(
                          right: i == widget.length - 1 ? 0 : gap,
                        ),
                        child: _OtpCell(
                          char: char,
                          width: cellW,
                          height: cellH,
                          active: isActive,
                          filled: filled,
                          status: widget.status,
                        ),
                      );
                    }),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _OtpCell extends StatelessWidget {
  const _OtpCell({
    required this.char,
    required this.width,
    required this.height,
    required this.active,
    required this.filled,
    required this.status,
  });

  final String char;
  final double width;
  final double height;
  final bool active;
  final bool filled;
  final GtOtpStatus status;

  @override
  Widget build(BuildContext context) {
    Color border;
    Color bg;
    switch (status) {
      case GtOtpStatus.error:
        border = GtColors.brand;
        bg = const Color(0xFFFFF5F5);
      case GtOtpStatus.success:
        border = GtColors.green;
        bg = const Color(0xFFF0FAF4);
      case GtOtpStatus.idle:
        if (active) {
          border = GtColors.brand;
          bg = GtColors.soft;
        } else if (filled) {
          border = GtColors.text.withValues(alpha: 0.35);
          bg = GtColors.white;
        } else {
          border = GtColors.border;
          bg = GtColors.bgGrey;
        }
    }

    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOut,
      width: width,
      height: height,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: border,
          width: active || status != GtOtpStatus.idle ? 2 : 1.5,
        ),
        boxShadow: active
            ? [
                BoxShadow(
                  color: GtColors.brand.withValues(alpha: 0.12),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ]
            : null,
      ),
      child: Text(
        char,
        style: TextStyle(
          fontSize: width * 0.42,
          fontWeight: FontWeight.w700,
          color: status == GtOtpStatus.success
              ? GtColors.green
              : GtColors.text,
          height: 1,
        ),
      ),
    );
  }
}

/// Friendly auth error copy — never surfaces raw Nest/stack messages.
String friendlyOtpError(Object error) {
  final raw = error.toString().toLowerCase();
  if (raw.contains('socket') ||
      raw.contains('network') ||
      raw.contains('connection') ||
      raw.contains('failed host') ||
      raw.contains('timeout')) {
    return "We couldn't verify the code.\nCheck your connection and try again.";
  }
  if (raw.contains('too many') ||
      raw.contains('throttl') ||
      raw.contains('429') ||
      raw.contains('rate')) {
    return 'Too many attempts.\nPlease wait before trying again.';
  }
  if (raw.contains('expired')) {
    return 'This verification code has expired.\nRequest a new code to continue.';
  }
  if (raw.contains('invalid') || raw.contains('otp') || raw.contains('code')) {
    return "That code doesn't look right.\nCheck the code and try again.";
  }
  return "That code doesn't look right.\nCheck the code and try again.";
}

/// Compact verification header used on OTP steps.
class GtOtpHeader extends StatelessWidget {
  const GtOtpHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.icon = Icons.phonelink_lock_rounded,
  });

  final String title;
  final String? subtitle;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: 72,
          height: 72,
          decoration: BoxDecoration(
            color: GtColors.soft,
            shape: BoxShape.circle,
            border: Border.all(color: GtColors.brand.withValues(alpha: 0.15)),
          ),
          child: Icon(icon, size: 34, color: GtColors.brand),
        ),
        const SizedBox(height: 20),
        Text(
          title,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w800,
            color: GtColors.text,
            letterSpacing: -0.3,
          ),
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 8),
          Text(
            subtitle!,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 15,
              height: 1.4,
              color: GtColors.textSecondary,
            ),
          ),
        ],
      ],
    );
  }
}
