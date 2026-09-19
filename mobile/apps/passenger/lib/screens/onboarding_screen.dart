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
  });

  final String badge;
  final String tagline;
  final String description;
  final String assetPath;
  final String packageAssetPath;
  final List<String> highlights;
  final IconData fallbackIcon;
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
      backgroundColor: GtColors.white,
      body: SafeArea(
        child: Column(
          children: [
            // Top App Bar with Brand and Skip
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              child: Row(
                children: [
                  if (_page > 0)
                    IconButton(
                      onPressed: () => _controller.previousPage(
                        duration: const Duration(milliseconds: 320),
                        curve: Curves.easeOutCubic,
                      ),
                      icon: const Icon(
                        Icons.arrow_back_ios_new_rounded,
                        size: 20,
                        color: GtColors.text,
                      ),
                      tooltip: 'Back',
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
                    )
                  else
                    Row(
                      children: [
                        Container(
                          width: 34,
                          height: 34,
                          decoration: BoxDecoration(
                            color: GtColors.brand,
                            borderRadius: BorderRadius.circular(10),
                            boxShadow: [
                              BoxShadow(
                                color: GtColors.brand.withValues(alpha: 0.3),
                                blurRadius: 8,
                                offset: const Offset(0, 3),
                              ),
                            ],
                          ),
                          child: const Center(
                            child: Icon(
                              Icons.local_taxi_rounded,
                              color: Colors.white,
                              size: 20,
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        const Text(
                          'CAN-RIDE',
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 0.8,
                            color: GtColors.text,
                          ),
                        ),
                      ],
                    ),
                  const Spacer(),
                  TextButton(
                    onPressed: _finish,
                    style: TextButton.styleFrom(
                      foregroundColor: GtColors.textSecondary,
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(20),
                      ),
                    ),
                    child: const Text(
                      'Skip',
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                        color: GtColors.textSecondary,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Main Carousel Slider
            Expanded(
              child: PageView.builder(
                controller: _controller,
                itemCount: _kSlides.length,
                physics: const BouncingScrollPhysics(),
                onPageChanged: (i) => setState(() => _page = i),
                itemBuilder: (context, index) {
                  final slide = _kSlides[index];
                  return _SlideView(slide: slide);
                },
              ),
            ),

            // Bottom Navigation Area
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Animated Page Dot Indicators
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
                              : GtColors.brand.withValues(alpha: 0.2),
                        ),
                      );
                    }),
                  ),
                  const SizedBox(height: 24),

                  // Primary CTA Button
                  SizedBox(
                    width: double.infinity,
                    height: 56,
                    child: ElevatedButton(
                      onPressed: _next,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: GtColors.brand,
                        foregroundColor: Colors.white,
                        elevation: 2,
                        shadowColor: GtColors.brand.withValues(alpha: 0.4),
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
                  const SizedBox(height: 12),

                  // Subtle info text
                  Text(
                    'Premier Canadian Rideshare & Taxi Marketplace',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      color: GtColors.textSecondary.withValues(alpha: 0.8),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SlideView extends StatelessWidget {
  const _SlideView({required this.slide});

  final OnboardingSlide slide;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: IntrinsicHeight(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 8),

                  // Image Illustration Card
                  Expanded(
                    flex: 6,
                    child: Container(
                      width: double.infinity,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(26),
                        color: GtColors.soft.withValues(alpha: 0.4),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.06),
                            blurRadius: 18,
                            offset: const Offset(0, 8),
                          ),
                        ],
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(26),
                        child: Image.asset(
                          slide.assetPath,
                          fit: BoxFit.cover,
                          errorBuilder: (context, error, stackTrace) {
                            return Image.asset(
                              slide.packageAssetPath,
                              fit: BoxFit.cover,
                              errorBuilder: (context, error, stackTrace) {
                                return _FallbackIllustration(slide: slide);
                              },
                            );
                          },
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Badge Chip
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: GtColors.brand.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: GtColors.brand.withValues(alpha: 0.15),
                      ),
                    ),
                    child: Text(
                      slide.badge,
                      style: const TextStyle(
                        color: GtColors.brand,
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.0,
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),

                  // Tagline / Headline
                  Text(
                    slide.tagline,
                    style: const TextStyle(
                      fontSize: 27,
                      fontWeight: FontWeight.w900,
                      color: GtColors.text,
                      letterSpacing: -0.4,
                      height: 1.2,
                    ),
                  ),
                  const SizedBox(height: 10),

                  // Description
                  Text(
                    slide.description,
                    style: TextStyle(
                      fontSize: 14,
                      height: 1.45,
                      fontWeight: FontWeight.w400,
                      color: GtColors.textSecondary.withValues(alpha: 0.95),
                    ),
                  ),
                  const SizedBox(height: 14),

                  // Feature Highlight Chips
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: slide.highlights.map((h) {
                      return Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: GtColors.bgGrey,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: GtColors.border.withValues(alpha: 0.7),
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
                            const SizedBox(width: 5),
                            Text(
                              h,
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: GtColors.text,
                              ),
                            ),
                          ],
                        ),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 12),
                ],
              ),
            ),
          ),
        );
      },
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
            GtColors.brand.withValues(alpha: 0.12),
            GtColors.bgGrey,
          ],
        ),
      ),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              slide.fallbackIcon,
              size: 72,
              color: GtColors.brand,
            ),
            const SizedBox(height: 12),
            Text(
              slide.tagline,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: GtColors.text,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
