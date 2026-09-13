import 'package:flutter/material.dart';

import 'logo.dart';
import 'theme.dart';

/// Full-bleed branded auth scaffold for passenger + driver apps.
class GtAuthShell extends StatelessWidget {
  const GtAuthShell({
    super.key,
    required this.title,
    required this.child,
    this.subtitle,
    this.onBack,
    this.footer,
    this.maxWidth = 440,
  });

  final String title;
  final String? subtitle;
  final Widget child;
  final VoidCallback? onBack;
  final Widget? footer;
  final double maxWidth;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          const _AuthAtmosphere(),
          SafeArea(
            child: Center(
              child: ConstrainedBox(
                constraints: BoxConstraints(maxWidth: maxWidth),
                child: CustomScrollView(
                  slivers: [
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
                      sliver: SliverList(
                        delegate: SliverChildListDelegate([
                          Row(
                            children: [
                              if (onBack != null)
                                IconButton(
                                  onPressed: onBack,
                                  icon: const Icon(Icons.arrow_back_rounded),
                                  color: GtColors.text,
                                )
                              else
                                const SizedBox(width: 48),
                              const Spacer(),
                            ],
                          ),
                          const SizedBox(height: 8),
                          TweenAnimationBuilder<double>(
                            tween: Tween(begin: 0, end: 1),
                            duration: const Duration(milliseconds: 520),
                            curve: Curves.easeOutCubic,
                            builder: (context, t, child) {
                              return Opacity(
                                opacity: t,
                                child: Transform.translate(
                                  offset: Offset(0, 16 * (1 - t)),
                                  child: child,
                                ),
                              );
                            },
                            child: Column(
                              children: [
                                const CanGoLogo(size: 72),
                                const SizedBox(height: 14),
                                const CanRideWordmark(
                                  fontSize: 28,
                                  alignment: Alignment.center,
                                  textAlign: TextAlign.center,
                                ),
                                const SizedBox(height: 28),
                                Text(
                                  title,
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    fontSize: 26,
                                    fontWeight: FontWeight.w800,
                                    color: GtColors.text,
                                    height: 1.15,
                                    letterSpacing: -0.4,
                                  ),
                                ),
                                if (subtitle != null) ...[
                                  const SizedBox(height: 10),
                                  Text(
                                    subtitle!,
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      fontSize: 15,
                                      height: 1.35,
                                      color: GtColors.textSecondary,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          const SizedBox(height: 28),
                          TweenAnimationBuilder<double>(
                            tween: Tween(begin: 0, end: 1),
                            duration: const Duration(milliseconds: 640),
                            curve: Curves.easeOutCubic,
                            builder: (context, t, child) {
                              return Opacity(
                                opacity: t,
                                child: Transform.translate(
                                  offset: Offset(0, 20 * (1 - t)),
                                  child: child,
                                ),
                              );
                            },
                            child: child,
                          ),
                          if (footer != null) ...[
                            const SizedBox(height: 24),
                            footer!,
                          ],
                        ]),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AuthAtmosphere extends StatelessWidget {
  const _AuthAtmosphere();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color(0xFFFFF5F5),
            Color(0xFFFFFFFF),
            Color(0xFFF7F7F8),
          ],
          stops: [0, 0.45, 1],
        ),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          Positioned(
            top: -80,
            right: -60,
            child: Container(
              width: 220,
              height: 220,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: GtColors.brand.withValues(alpha: 0.08),
              ),
            ),
          ),
          Positioned(
            bottom: 40,
            left: -40,
            child: Container(
              width: 160,
              height: 160,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: GtColors.brand.withValues(alpha: 0.05),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Primary filled CTA for auth flows.
class GtAuthPrimaryButton extends StatelessWidget {
  const GtAuthPrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.busy = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: ElevatedButton(
        onPressed: busy ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: GtColors.brand,
          foregroundColor: Colors.white,
          disabledBackgroundColor: GtColors.brand.withValues(alpha: 0.5),
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w800,
          ),
        ),
        child: busy
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2.4,
                  color: Colors.white,
                ),
              )
            : Text(label),
      ),
    );
  }
}

/// Outlined method chooser (Google / email / phone).
class GtAuthMethodButton extends StatelessWidget {
  const GtAuthMethodButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.leading,
    this.emphasized = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final Widget? leading;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: GtColors.text,
          backgroundColor: emphasized ? Colors.white : Colors.white,
          side: BorderSide(
            color: emphasized
                ? GtColors.brand.withValues(alpha: 0.35)
                : GtColors.border,
            width: emphasized ? 1.4 : 1,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          textStyle: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (leading != null) ...[
              leading!,
              const SizedBox(width: 12),
            ],
            Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
          ],
        ),
      ),
    );
  }
}

class GtAuthFieldDecoration {
  static InputDecoration of(
    String label, {
    String? hint,
    Widget? prefix,
    Widget? suffix,
  }) {
    return InputDecoration(
      labelText: label,
      hintText: hint,
      prefixIcon: prefix,
      suffixIcon: suffix,
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: GtColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: GtColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: GtColors.brand, width: 1.5),
      ),
    );
  }
}

/// Password field with show/hide eye toggle.
class GtAuthPasswordField extends StatefulWidget {
  const GtAuthPasswordField({
    super.key,
    required this.controller,
    this.label = 'Password',
    this.hint,
    this.autofillHints = const [AutofillHints.password],
    this.enabled = true,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final String label;
  final String? hint;
  final Iterable<String>? autofillHints;
  final bool enabled;
  final ValueChanged<String>? onSubmitted;

  @override
  State<GtAuthPasswordField> createState() => _GtAuthPasswordFieldState();
}

class _GtAuthPasswordFieldState extends State<GtAuthPasswordField> {
  bool _obscure = true;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: widget.controller,
      enabled: widget.enabled,
      obscureText: _obscure,
      autofillHints: widget.autofillHints,
      onSubmitted: widget.onSubmitted,
      decoration: GtAuthFieldDecoration.of(
        widget.label,
        hint: widget.hint,
        suffix: IconButton(
          tooltip: _obscure ? 'Show password' : 'Hide password',
          onPressed: () => setState(() => _obscure = !_obscure),
          icon: Icon(
            _obscure
                ? Icons.visibility_outlined
                : Icons.visibility_off_outlined,
            color: GtColors.textSecondary,
          ),
        ),
      ),
    );
  }
}

/// Remember-me row for email login.
class GtAuthRememberMe extends StatelessWidget {
  const GtAuthRememberMe({
    super.key,
    required this.value,
    required this.onChanged,
  });

  final bool value;
  final ValueChanged<bool?> onChanged;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => onChanged(!value),
      borderRadius: BorderRadius.circular(8),
      child: Row(
        children: [
          SizedBox(
            width: 24,
            height: 24,
            child: Checkbox(
              value: value,
              onChanged: onChanged,
              activeColor: GtColors.brand,
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              visualDensity: VisualDensity.compact,
            ),
          ),
          const SizedBox(width: 8),
          const Expanded(
            child: Text(
              'Remember me',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: GtColors.text,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class GtAuthErrorBanner extends StatelessWidget {
  const GtAuthErrorBanner({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    if (message.isEmpty) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF0F0),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: GtColors.brand.withValues(alpha: 0.25)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline, color: GtColors.brand, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                color: GtColors.text,
                fontSize: 13,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
