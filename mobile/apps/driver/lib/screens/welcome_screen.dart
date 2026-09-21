import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';

class DriverWelcomeSlide {
  const DriverWelcomeSlide({
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

const List<DriverWelcomeSlide> _kDriverSlides = [
  DriverWelcomeSlide(
    badge: 'DRIVE & EARN',
    tagline: 'Drive & Earn on Your Terms',
    description:
        'Set your own schedule with complete freedom. Accept local trips or long-distance intercity rides across Canada whenever you are ready.',
    assetPath: 'assets/onboarding/slide1.jpg',
    packageAssetPath: 'packages/gt_ui/assets/onboarding/driver_slide1.jpg',
    highlights: ['Flexible Hours', 'Higher Earnings', 'Local & Long-Distance'],
    fallbackIcon: Icons.drive_eta_rounded,
    imageAlignment: Alignment.center,
  ),
  DriverWelcomeSlide(
    badge: 'BID YOUR PRICE',
    tagline: 'Review Requests & Name Your Fare',
    description:
        'Browse incoming passenger requests in real time. Submit your own competitive ride offers and choose the customers you want to drive.',
    assetPath: 'assets/onboarding/slide2.jpg',
    packageAssetPath: 'packages/gt_ui/assets/onboarding/driver_slide2.jpg',
    highlights: ['Live Request Feed', 'Custom Fare Bidding', 'Direct Matching'],
    fallbackIcon: Icons.price_check_rounded,
    imageAlignment: Alignment.center,
  ),
  DriverWelcomeSlide(
    badge: 'SECURE & TRANSPARENT',
    tagline: 'Fast CAD Payouts & In-App Safety',
    description:
        'Track your daily earnings transparently in Canadian Dollars. Enjoy instant payouts, direct in-app messaging with riders, and 24/7 dedicated support.',
    assetPath: 'assets/onboarding/slide3.jpg',
    packageAssetPath: 'packages/gt_ui/assets/onboarding/driver_slide3.jpg',
    highlights: ['Direct CAD Deposits', 'Transparent Platform Fees', 'In-App Secure Chat'],
    fallbackIcon: Icons.account_balance_wallet_rounded,
    imageAlignment: Alignment.topCenter,
  ),
];

class DriverWelcomeScreen extends StatefulWidget {
  const DriverWelcomeScreen({super.key});

  @override
  State<DriverWelcomeScreen> createState() => _DriverWelcomeScreenState();
}

class _DriverWelcomeScreenState extends State<DriverWelcomeScreen> {
  final _controller = PageController();
  int _page = 0;

  Future<void> _finish() async {
    HapticFeedback.lightImpact();
    await context.read<AppState>().setHasSeenWelcome(true);
    if (!mounted) return;
    try {
      final state = context.read<AppState>();
      if (state.isAuthenticated) {
        context.go(state.onboardedComplete ? '/' : '/onboarding/profile');
      } else {
        context.go('/auth');
      }
    } catch (_) {}
  }

  void _next() {
    HapticFeedback.selectionClick();
    if (_page >= _kDriverSlides.length - 1) {
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
    final isLast = _page >= _kDriverSlides.length - 1;

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // 1. Full-Screen PageView with background imagery & scrims
          PageView.builder(
            controller: _controller,
            itemCount: _kDriverSlides.length,
            physics: const BouncingScrollPhysics(),
            onPageChanged: (i) => setState(() => _page = i),
            itemBuilder: (context, index) {
              final slide = _kDriverSlides[index];
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
                                      Icons.drive_eta_rounded,
                                      color: Colors.white,
                                      size: 16,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                const Text(
                                  'CAN-RIDE DRIVER',
                                  style: TextStyle(
                                    fontSize: 14,
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
                      children: List.generate(_kDriverSlides.length, (i) {
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
                      'Canada’s Fair Marketplace for Professional Drivers',
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

  final DriverWelcomeSlide slide;

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
                    return Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.45),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.2),
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.check_circle_rounded,
                            size: 13,
                            color: GtColors.brand,
                          ),
                          const SizedBox(width: 5),
                          Text(
                            h,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                ),

                // Generous bottom spacing for the fixed indicators + CTA button
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

  final DriverWelcomeSlide slide;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF1E222B),
            Color(0xFF14171E),
            Color(0xFF0B0D11),
          ],
        ),
      ),
      child: Center(
        child: Container(
          width: 140,
          height: 140,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: GtColors.brand.withValues(alpha: 0.15),
            border: Border.all(
              color: GtColors.brand.withValues(alpha: 0.35),
              width: 2,
            ),
          ),
          child: Icon(
            slide.fallbackIcon,
            size: 64,
            color: GtColors.brand,
          ),
        ),
      ),
    );
  }
}
