import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import 'logo.dart';
import 'theme.dart';

/// App role shown under the brand on the splash.
enum GtSplashRole { passenger, driver }

/// Full-screen branded splash with entrance choreography, soft atmosphere,
/// indeterminate progress, and a coordinated exit once [ready] (and a
/// minimum display time) are satisfied.
class GtSplashScreen extends StatefulWidget {
  const GtSplashScreen({
    super.key,
    required this.ready,
    required this.onFinished,
    this.role = GtSplashRole.passenger,
    this.minDisplay = const Duration(milliseconds: 2800),
    this.tagline = 'Your next adventure starts here',
  });

  /// App init finished (prefs / session restored).
  final bool ready;

  /// Called once exit animation completes — host should swap to the app.
  final VoidCallback onFinished;

  final GtSplashRole role;
  final Duration minDisplay;
  final String tagline;

  @override
  State<GtSplashScreen> createState() => _GtSplashScreenState();
}

class _GtSplashScreenState extends State<GtSplashScreen>
    with TickerProviderStateMixin {
  late final AnimationController _enter;
  late final AnimationController _pulse;
  late final AnimationController _progress;
  late final AnimationController _exit;

  late final Animation<double> _logoScale;
  late final Animation<double> _logoOpacity;
  late final Animation<double> _glowOpacity;
  late final Animation<double> _copyOpacity;
  late final Animation<Offset> _copySlide;
  late final Animation<double> _footerOpacity;
  late final Animation<double> _orbDrift;

  bool _minElapsed = false;
  bool _exitStarted = false;
  bool _finished = false;

  String get _roleLabel => switch (widget.role) {
        GtSplashRole.passenger => 'Passenger',
        GtSplashRole.driver => 'Driver',
      };

  @override
  void initState() {
    super.initState();

    _enter = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    );
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2400),
    )..repeat(reverse: true);
    _progress = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat();
    _exit = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 420),
    );

    _logoScale = TweenSequence<double>([
      TweenSequenceItem(
        tween: Tween(begin: 0.86, end: 1.05)
            .chain(CurveTween(curve: Curves.easeOutCubic)),
        weight: 70,
      ),
      TweenSequenceItem(
        tween: Tween(begin: 1.05, end: 1.0)
            .chain(CurveTween(curve: Curves.easeInOut)),
        weight: 30,
      ),
    ]).animate(_enter);

    _logoOpacity = CurvedAnimation(
      parent: _enter,
      curve: const Interval(0.0, 0.5, curve: Curves.easeOut),
    );
    _glowOpacity = CurvedAnimation(
      parent: _enter,
      curve: const Interval(0.1, 0.65, curve: Curves.easeOut),
    );
    _copyOpacity = CurvedAnimation(
      parent: _enter,
      curve: const Interval(0.4, 0.88, curve: Curves.easeOut),
    );
    _copySlide = Tween<Offset>(
      begin: const Offset(0, 0.16),
      end: Offset.zero,
    ).animate(
      CurvedAnimation(
        parent: _enter,
        curve: const Interval(0.4, 0.92, curve: Curves.easeOutCubic),
      ),
    );
    _footerOpacity = CurvedAnimation(
      parent: _enter,
      curve: const Interval(0.58, 1.0, curve: Curves.easeOut),
    );
    _orbDrift = CurvedAnimation(parent: _pulse, curve: Curves.easeInOut);

    final reduce = WidgetsBinding
            .instance.platformDispatcher.accessibilityFeatures.reduceMotion ==
        true;
    if (reduce) {
      _enter.value = 1;
      _pulse.stop();
      _progress.stop();
    } else {
      _enter.forward();
    }

    Future<void>.delayed(widget.minDisplay, () {
      if (!mounted) return;
      _minElapsed = true;
      _tryExit();
    });
  }

  @override
  void didUpdateWidget(covariant GtSplashScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.ready && !oldWidget.ready) {
      _tryExit();
    }
  }

  void _tryExit() {
    if (_exitStarted || _finished) return;
    if (!widget.ready || !_minElapsed) return;
    _exitStarted = true;
    _progress.stop();
    _exit.forward().whenComplete(() {
      if (!mounted || _finished) return;
      _finished = true;
      widget.onFinished();
    });
  }

  @override
  void dispose() {
    _enter.dispose();
    _pulse.dispose();
    _progress.dispose();
    _exit.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final exitT = CurvedAnimation(parent: _exit, curve: Curves.easeInCubic);

    return AnimatedBuilder(
      animation: Listenable.merge([_enter, _pulse, _progress, _exit]),
      builder: (context, _) {
        final glowPulse = 0.55 + (_orbDrift.value * 0.45);
        final exitOpacity = 1.0 - exitT.value;
        final exitScale = 1.0 - (exitT.value * 0.035);
        final exitLift = -18.0 * exitT.value;

        return Scaffold(
          backgroundColor: GtColors.white,
          body: Opacity(
            opacity: exitOpacity.clamp(0.0, 1.0),
            child: Transform.translate(
              offset: Offset(0, exitLift),
              child: Transform.scale(
                scale: exitScale,
                alignment: Alignment.center,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    const _SplashAtmosphere(),
                    _DriftOrbs(t: _orbDrift.value, size: size),
                    SafeArea(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 28),
                        child: Column(
                          children: [
                            const Spacer(flex: 3),
                            Transform.scale(
                              scale: _logoScale.value,
                              child: Opacity(
                                opacity: _logoOpacity.value.clamp(0.0, 1.0),
                                child: _BrandHero(glowPulse: glowPulse * _glowOpacity.value),
                              ),
                            ),
                            const SizedBox(height: 18),
                            SlideTransition(
                              position: _copySlide,
                              child: Opacity(
                                opacity: _copyOpacity.value.clamp(0.0, 1.0),
                                child: Column(
                                  children: [
                                    _RoleChip(label: _roleLabel),
                                    const SizedBox(height: 14),
                                    Text(
                                      widget.tagline,
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                        color: GtColors.textSecondary
                                            .withValues(alpha: 0.95),
                                        fontSize: 14,
                                        fontWeight: FontWeight.w500,
                                        height: 1.35,
                                        letterSpacing: 0.15,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            const Spacer(flex: 4),
                            Opacity(
                              opacity: _footerOpacity.value.clamp(0.0, 1.0),
                              child: Padding(
                                padding: const EdgeInsets.only(bottom: 28),
                                child: Column(
                                  children: [
                                    _SplashProgress(value: _progress.value),
                                    const SizedBox(height: 16),
                                    const Text(
                                      'Preparing your experience',
                                      style: TextStyle(
                                        color: GtColors.textMuted,
                                        fontSize: 12.5,
                                        fontWeight: FontWeight.w500,
                                        letterSpacing: 0.25,
                                      ),
                                    ),
                                    const SizedBox(height: 10),
                                    Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: [
                                        Icon(
                                          Icons.lock_outline_rounded,
                                          size: 13,
                                          color: GtColors.textMuted
                                              .withValues(alpha: 0.85),
                                        ),
                                        const SizedBox(width: 5),
                                        Text(
                                          'Secure · Global · On-demand',
                                          style: TextStyle(
                                            color: GtColors.textMuted
                                                .withValues(alpha: 0.9),
                                            fontSize: 11.5,
                                            fontWeight: FontWeight.w500,
                                            letterSpacing: 0.35,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Logo + soft brand glow — sized box so layout never collapses.
class _BrandHero extends StatelessWidget {
  const _BrandHero({required this.glowPulse});

  final double glowPulse;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 220,
      height: 220,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Opacity(
            opacity: (glowPulse * 0.95).clamp(0.0, 1.0),
            child: Container(
              width: 210,
              height: 210,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    GtColors.brand.withValues(alpha: 0.2),
                    GtColors.soft.withValues(alpha: 0.45),
                    GtColors.white.withValues(alpha: 0),
                  ],
                  stops: const [0.0, 0.42, 1.0],
                ),
              ),
            ),
          ),
          Image.asset(
            CanGoLogo.assetPath,
            package: CanGoLogo.assetPackage,
            height: 168,
            fit: BoxFit.contain,
            filterQuality: FilterQuality.high,
            gaplessPlayback: true,
            errorBuilder: (context, error, stack) {
              return const Text(
                'CAN-GO',
                style: TextStyle(
                  color: GtColors.brand,
                  fontSize: 36,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.2,
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

/// Soft brand wash — white canvas with blush wash and a faint diagonal veil.
class _SplashAtmosphere extends StatelessWidget {
  const _SplashAtmosphere();

  @override
  Widget build(BuildContext context) {
    return const Stack(
      fit: StackFit.expand,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Color(0xFFF8EAEA),
                Color(0xFFFFFFFF),
                Color(0xFFFFFFFF),
                Color(0xFFF8EAEA),
              ],
              stops: [0.0, 0.28, 0.72, 1.0],
            ),
          ),
        ),
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment(-1.1, -0.8),
              end: Alignment(1.0, 0.9),
              colors: [
                Color(0x12B41B1D),
                Color(0x00000000),
                Color(0x0AB41B1D),
              ],
              stops: [0.0, 0.45, 1.0],
            ),
          ),
        ),
        CustomPaint(painter: _SoftDotsPainter()),
      ],
    );
  }
}

class _SoftDotsPainter extends CustomPainter {
  const _SoftDotsPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0x09B41B1D)
      ..style = PaintingStyle.fill;
    const step = 28.0;
    for (var y = 0.0; y < size.height; y += step) {
      for (var x = 0.0; x < size.width; x += step) {
        final ox = ((y / step).floor().isEven) ? step * 0.5 : 0.0;
        canvas.drawCircle(Offset(x + ox, y), 1.1, paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _DriftOrbs extends StatelessWidget {
  const _DriftOrbs({required this.t, required this.size});

  final double t;
  final Size size;

  @override
  Widget build(BuildContext context) {
    final dx = (t - 0.5) * 18;
    final dy = math.sin(t * math.pi) * 12;

    return Stack(
      children: [
        Positioned(
          top: size.height * 0.06 + dy,
          left: -size.width * 0.2 + dx,
          child: _Orb(
            diameter: size.width * 0.64,
            color: GtColors.brand.withValues(alpha: 0.07),
          ),
        ),
        Positioned(
          bottom: size.height * 0.05 - dy,
          right: -size.width * 0.24 - dx,
          child: _Orb(
            diameter: size.width * 0.72,
            color: GtColors.soft.withValues(alpha: 0.95),
          ),
        ),
        Positioned(
          top: size.height * 0.4,
          right: size.width * 0.1 + dx * 0.5,
          child: _Orb(
            diameter: 88,
            color: GtColors.brand.withValues(alpha: 0.05),
          ),
        ),
      ],
    );
  }
}

class _Orb extends StatelessWidget {
  const _Orb({required this.diameter, required this.color});

  final double diameter;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: diameter,
      height: diameter,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color,
      ),
    );
  }
}

class _RoleChip extends StatelessWidget {
  const _RoleChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color: GtColors.soft,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: GtColors.brand.withValues(alpha: 0.16),
        ),
      ),
      child: Text(
        label.toUpperCase(),
        style: const TextStyle(
          color: GtColors.brand,
          fontSize: 11,
          fontWeight: FontWeight.w800,
          letterSpacing: 1.4,
        ),
      ),
    );
  }
}

/// Slim sliding brand progress bar (indeterminate).
class _SplashProgress extends StatelessWidget {
  const _SplashProgress({required this.value});

  final double value;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 148,
      height: 3,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(99),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final track = constraints.maxWidth;
            final barW = track * 0.4;
            final travel = math.max(0.0, track - barW);
            final t = Curves.easeInOut.transform(value);
            final left = (t <= 0.5 ? t * 2 : (1 - (t - 0.5) * 2)) * travel;
            return Stack(
              fit: StackFit.expand,
              children: [
                ColoredBox(color: GtColors.brand.withValues(alpha: 0.12)),
                Positioned(
                  left: left,
                  width: barW,
                  top: 0,
                  bottom: 0,
                  child: const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          Color(0x00B41B1D),
                          GtColors.brand,
                          Color(0x00B41B1D),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// Host helper: shows [GtSplashScreen] until init + min time, then [child].
class GtSplashGate extends StatefulWidget {
  const GtSplashGate({
    super.key,
    required this.ready,
    required this.child,
    this.role = GtSplashRole.passenger,
    this.minDisplay = const Duration(milliseconds: 2800),
    this.tagline = 'Your next adventure starts here',
  });

  final bool ready;
  final Widget child;
  final GtSplashRole role;
  final Duration minDisplay;
  final String tagline;

  @override
  State<GtSplashGate> createState() => _GtSplashGateState();
}

class _GtSplashGateState extends State<GtSplashGate> {
  bool _done = false;

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 380),
      switchInCurve: Curves.easeOutCubic,
      switchOutCurve: Curves.easeInCubic,
      child: _done
          ? KeyedSubtree(
              key: const ValueKey('app'),
              child: widget.child,
            )
          : KeyedSubtree(
              key: const ValueKey('splash'),
              child: GtSplashScreen(
                ready: widget.ready,
                role: widget.role,
                minDisplay: widget.minDisplay,
                tagline: widget.tagline,
                onFinished: () {
                  SchedulerBinding.instance.addPostFrameCallback((_) {
                    if (mounted) setState(() => _done = true);
                  });
                },
              ),
            ),
    );
  }
}
