import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

class OnboardingSlide {
  const OnboardingSlide({
    required this.badge,
    required this.tagline,
    required this.description,
    required this.assetPath,
    required this.packageAssetPath,
    required this.highlights,
    required this.fallbackIcon,
    this.imageAlignment = Alignment.center,
  });

  final String badge;
  final String tagline;
  final String description;
  final String assetPath;
  final String packageAssetPath;
  final List<String> highlights;
  final IconData fallbackIcon;
  final Alignment imageAlignment;
}

const List<OnboardingSlide> _kSlides = [
  OnboardingSlide(
    badge: 'FAST & CONVENIENT',
    tagline: 'Request a Ride in Seconds',
    description:
        'Set your pickup and destination to connect with nearby professional drivers ready to pick you up in minutes.',
    assetPath: 'assets/onboarding/slide1.jpg',
    packageAssetPath: 'packages/gt_ui/assets/onboarding/slide1.jpg',
    highlights: ['Instant Pickup', 'Live Driver ETA', 'Verified Drivers'],
    fallbackIcon: Icons.local_taxi_rounded,
    imageAlignment: Alignment.topCenter,
  ),
  OnboardingSlide(
    badge: 'TRANSPARENT PRICING',
    tagline: 'Choose Your Fare & Driver',
    description:
        'Receive instant competitive offers with upfront pricing in CAD. Select the vehicle class and driver that suits you best.',
    assetPath: 'assets/onboarding/slide2.jpg',
    packageAssetPath: 'packages/gt_ui/assets/onboarding/slide2.jpg',
    highlights: ['Upfront CAD Fares', 'Multiple Car Classes', 'No Hidden Fees'],
    fallbackIcon: Icons.request_quote_rounded,
    imageAlignment: Alignment.center,
  ),
  OnboardingSlide(
    badge: 'SAFETY & PEACE OF MIND',
    tagline: 'Safe Journeys, Every Mile',
    description:
        'Track your driver live on the interactive map, communicate securely via in-app chat, and pay effortlessly with digital wallet or card.',
    assetPath: 'assets/onboarding/slide3.jpg',
    packageAssetPath: 'packages/gt_ui/assets/onboarding/slide3.jpg',
    highlights: ['Live GPS Tracking', 'Secure In-App Chat', 'Cashless Payments'],
    fallbackIcon: Icons.shield_rounded,
    imageAlignment: Alignment.center,
  ),
];

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _controller = PageController();
  int _page = 0;

  Future<void> _finish() async {
    await context.read<AppState>().setOnboarded(true);
    if (mounted) context.go('/');
  }

  void _next() {
    if (_page >= _kSlides.length - 1) {
      _finish();
    } else {
      _controller.nextPage(
        duration: const Duration(milliseconds: 380),
        curve: Curves.easeOutCubic,
      );
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isLast = _page >= _kSlides.length - 1;

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // 1. Full-Screen PageView with background imagery & scrims
          PageView.builder(
            controller: _controller,
            itemCount: _kSlides.length,
            physics: const BouncingScrollPhysics(),
            onPageChanged: (i) => setState(() => _page = i),
            itemBuilder: (context, index) {
              final slide = _kSlides[index];
              return _FullScreenSlideView(slide: slide);
            },
          ),

          // 2. Fixed Top Navigation Bar with Glassmorphic Brand & Skip Button
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                child: Row(
                  children: [
                    if (_page > 0)
                      ClipRRect(
                        borderRadius: BorderRadius.circular(99),
                        child: BackdropFilter(
                          filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
                          child: Container(
                            width: 42,
                            height: 42,
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: 0.35),
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.22),
                              ),
                            ),
                            child: IconButton(
                              onPressed: () => _controller.previousPage(
                                duration: const Duration(milliseconds: 320),
                                curve: Curves.easeOutCubic,
                              ),
                              icon: const Icon(
                                Icons.arrow_back_ios_new_rounded,
                                size: 18,
                                color: Colors.white,
                              ),
                              tooltip: 'Back',
                              padding: EdgeInsets.zero,
                            ),
                          ),
                        ),
                      )
                    else
                      ClipRRect(
                        borderRadius: BorderRadius.circular(20),
                        child: BackdropFilter(
                          filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 6,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: 0.35),
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.22),
                              ),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  width: 26,
                                  height: 26,
                                  decoration: BoxDecoration(
                                    color: GtColors.brand,
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: const Center(
                                    child: Icon(
                                      Icons.local_taxi_rounded,
                                      color: Colors.white,
                                      size: 16,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                const Text(
                                  'CAN-RIDE',
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: 0.8,
                                    color: Colors.white,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    const Spacer(),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(20),
                      child: BackdropFilter(
                        filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
                        child: Container(
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.35),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: Colors.white.withValues(alpha: 0.22),
                            ),
                          ),
                          child: Material(
                            color: Colors.transparent,
                            child: InkWell(
                              onTap: _finish,
                              borderRadius: BorderRadius.circular(20),
                              child: const Padding(
                                padding: EdgeInsets.symmetric(
                                  horizontal: 16,
                                  vertical: 8,
                                ),
                                child: Text(
                                  'Skip',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w600,
                                    fontSize: 14,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // 3. Fixed Bottom Controls (Page Indicators & Action Button)
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 0, 24, 20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Smooth Animated Dot Indicators
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: List.generate(_kSlides.length, (i) {
                        final active = i == _page;
                        return AnimatedContainer(
                          duration: const Duration(milliseconds: 300),
                          curve: Curves.easeOutCubic,
                          width: active ? 32 : 8,
                          height: 8,
                          margin: const EdgeInsets.symmetric(horizontal: 4),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(99),
                            color: active
                                ? GtColors.brand
                                : Colors.white.withValues(alpha: 0.35),
                          ),
                        );
                      }),
                    ),
                    const SizedBox(height: 20),

                    // Primary CTA Button
                    SizedBox(
                      width: double.infinity,
                      height: 56,
                      child: ElevatedButton(
                        onPressed: _next,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: GtColors.brand,
                          foregroundColor: Colors.white,
                          elevation: 6,
                          shadowColor: GtColors.brand.withValues(alpha: 0.5),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              isLast ? 'Get Started' : 'Continue',
                              style: const TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.3,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Icon(
                              isLast
                                  ? Icons.check_circle_rounded
                                  : Icons.arrow_forward_rounded,
                              size: 20,
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),

                    // Discreet subtitle
                    Text(
                      'Premier Canadian Rideshare & Taxi Marketplace',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        color: Colors.white.withValues(alpha: 0.75),
                        shadows: const [
                          Shadow(
                            color: Colors.black54,
                            blurRadius: 4,
                          ),
                        ],
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

class _FullScreenSlideView extends StatelessWidget {
  const _FullScreenSlideView({required this.slide});

  final OnboardingSlide slide;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        // 1. Full-Screen Background Image
        Image.asset(
          slide.assetPath,
          fit: BoxFit.cover,
          alignment: slide.imageAlignment,
          errorBuilder: (context, error, stackTrace) {
            return Image.asset(
              slide.packageAssetPath,
              fit: BoxFit.cover,
              alignment: slide.imageAlignment,
              errorBuilder: (context, error, stackTrace) {
                return _FallbackIllustration(slide: slide);
              },
            );
          },
        ),

        // 2. Cinematic Gradient Scrim (Vignette top + deep contrast bottom)
        Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.black.withValues(alpha: 0.65),
                Colors.black.withValues(alpha: 0.12),
                Colors.black.withValues(alpha: 0.35),
                Colors.black.withValues(alpha: 0.82),
                Colors.black.withValues(alpha: 0.95),
              ],
              stops: const [0.0, 0.22, 0.50, 0.74, 1.0],
            ),
          ),
        ),

        // 3. Slide Content positioned above bottom controls
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                // Category Chip
                ClipRRect(
                  borderRadius: BorderRadius.circular(20),
                  child: BackdropFilter(
                    filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.16),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.28),
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            slide.fallbackIcon,
                            size: 14,
                            color: Colors.white,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            slide.badge,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 1.1,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                // Tagline / Headline
                Text(
                  slide.tagline,
                  style: const TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                    letterSpacing: -0.6,
                    height: 1.15,
                    shadows: [
                      Shadow(
                        color: Colors.black87,
                        blurRadius: 14,
                        offset: Offset(0, 3),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),

                // Description
                Text(
                  slide.description,
                  style: TextStyle(
                    fontSize: 15,
                    height: 1.45,
                    fontWeight: FontWeight.w400,
                    color: Colors.white.withValues(alpha: 0.92),
                    shadows: const [
                      Shadow(
                        color: Colors.black87,
                        blurRadius: 8,
                        offset: Offset(0, 2),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Highlight Pills Row
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: slide.highlights.map((h) {
                    return ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: BackdropFilter(
                        filter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.14),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                              color: Colors.white.withValues(alpha: 0.22),
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(
                                Icons.check_circle_rounded,
                                size: 13,
                                color: GtColors.brand,
                              ),
                              const SizedBox(width: 6),
                              Text(
                                h,
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.white,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),

                // Spacing reserved for bottom indicators & action button
                const SizedBox(height: 140),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _FallbackIllustration extends StatelessWidget {
  const _FallbackIllustration({required this.slide});

  final OnboardingSlide slide;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            GtColors.soft,
            GtColors.brand.withValues(alpha: 0.2),
            Colors.black,
          ],
        ),
      ),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              slide.fallbackIcon,
              size: 80,
              color: GtColors.brand,
            ),
            const SizedBox(height: 14),
            Text(
              slide.tagline,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
