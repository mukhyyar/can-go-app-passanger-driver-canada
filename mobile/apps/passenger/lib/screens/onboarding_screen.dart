import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _controller = PageController();
  int _page = 0;

  static const _pageCount = 4;

  Future<void> _finish() async {
    await context.read<AppState>().setOnboarded(true);
    if (mounted) context.go('/');
  }

  void _next() {
    if (_page >= _pageCount - 1) {
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
    final isLast = _page >= _pageCount - 1;

    return Scaffold(
      backgroundColor: GtColors.white,
      body: Stack(
        children: [
          // Soft atmospheric wash behind slides
          Positioned.fill(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 420),
              curve: Curves.easeOutCubic,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    GtColors.soft.withValues(alpha: 0.55),
                    GtColors.white,
                    GtColors.white,
                  ],
                  stops: const [0, 0.42, 1],
                ),
              ),
            ),
          ),
          SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
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
                            size: 18,
                            color: GtColors.text,
                          ),
                        )
                      else
                        const SizedBox(width: 48),
                      Expanded(
                        child: _ProgressPills(
                          count: _pageCount,
                          index: _page,
                        ),
                      ),
                      TextButton(
                        onPressed: _finish,
                        style: TextButton.styleFrom(
                          foregroundColor: GtColors.textSecondary,
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                        ),
                        child: const Text(
                          'Skip',
                          style: TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: PageView(
                    controller: _controller,
                    onPageChanged: (i) => setState(() => _page = i),
                    children: const [
                      _PageMarketplace(),
                      _PageAvailability(),
                      _PagePhotos(),
                      _PageHospitality(),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SizedBox(
                        width: double.infinity,
                        height: 56,
                        child: ElevatedButton(
                          onPressed: _next,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: GtColors.brand,
                            foregroundColor: Colors.white,
                            elevation: 0,
                            shadowColor: GtColors.brand.withValues(alpha: 0.35),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                            ),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                isLast ? 'Get started' : 'Continue',
                                style: const TextStyle(
                                  fontSize: 17,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 0.2,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Icon(
                                isLast
                                    ? Icons.check_rounded
                                    : Icons.arrow_forward_rounded,
                                size: 20,
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text.rich(
                        TextSpan(
                          style: TextStyle(
                            color: GtColors.textSecondary.withValues(alpha: 0.9),
                            fontSize: 11,
                            height: 1.4,
                          ),
                          children: const [
                            TextSpan(
                              text: 'By continuing, you agree to the ',
                            ),
                            TextSpan(
                              text: 'Privacy Policy',
                              style: TextStyle(
                                color: GtColors.brand,
                                decoration: TextDecoration.underline,
                                decorationColor: GtColors.brand,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            TextSpan(text: ' and '),
                            TextSpan(
                              text: 'Service Agreement',
                              style: TextStyle(
                                color: GtColors.brand,
                                decoration: TextDecoration.underline,
                                decorationColor: GtColors.brand,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            TextSpan(text: '.'),
                          ],
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ProgressPills extends StatelessWidget {
  const _ProgressPills({required this.count, required this.index});

  final int count;
  final int index;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(count, (i) {
        final active = i == index;
        return AnimatedContainer(
          duration: const Duration(milliseconds: 280),
          curve: Curves.easeOutCubic,
          width: active ? 28 : 8,
          height: 8,
          margin: const EdgeInsets.symmetric(horizontal: 3),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(99),
            color: active
                ? GtColors.brand
                : GtColors.brand.withValues(alpha: 0.18),
          ),
        );
      }),
    );
  }
}

class _SlideHeader extends StatelessWidget {
  const _SlideHeader({
    required this.eyebrow,
    required this.title,
    this.subtitle,
  });

  final String eyebrow;
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: GtColors.brand.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              eyebrow.toUpperCase(),
              style: const TextStyle(
                color: GtColors.brand,
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.1,
              ),
            ),
          ),
          const SizedBox(height: 14),
          Text(
            title,
            style: const TextStyle(
              color: GtColors.text,
              fontSize: 28,
              fontWeight: FontWeight.w900,
              height: 1.15,
              letterSpacing: -0.4,
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 10),
            Text(
              subtitle!,
              style: const TextStyle(
                color: GtColors.textSecondary,
                fontSize: 15,
                height: 1.45,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _PageMarketplace extends StatelessWidget {
  const _PageMarketplace();

  static const _services = [
    (Icons.airport_shuttle_rounded, 'Transfers'),
    (Icons.route_rounded, 'Intercity'),
    (Icons.local_taxi_rounded, 'Rides'),
    (Icons.inventory_2_rounded, 'Delivery'),
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _SlideHeader(
          eyebrow: 'Welcome to CAN-GO',
          title: 'Marketplace for every journey',
          subtitle:
              'Book transfers, intercity trips, rides and delivery — all in one place.',
        ),
        const SizedBox(height: 20),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(
              children: [
                Expanded(
                  child: Container(
                    width: double.infinity,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(28),
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [
                          GtColors.soft,
                          GtColors.brand.withValues(alpha: 0.12),
                          GtColors.bgGrey,
                        ],
                      ),
                      border: Border.all(
                        color: GtColors.brand.withValues(alpha: 0.08),
                      ),
                    ),
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        Positioned(
                          top: 28,
                          right: 28,
                          child: _GlowOrb(
                            size: 72,
                            color: GtColors.brand.withValues(alpha: 0.12),
                          ),
                        ),
                        Positioned(
                          bottom: 36,
                          left: 24,
                          child: _GlowOrb(
                            size: 48,
                            color: GtColors.brand.withValues(alpha: 0.08),
                          ),
                        ),
                        const Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            CanGoBrandMark(logoSize: 120),
                            SizedBox(height: 8),
                            Text(
                              'Your next adventure starts here',
                              style: TextStyle(
                                color: GtColors.textSecondary,
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _services
                      .map(
                        (s) => _ServiceChip(icon: s.$1, label: s.$2),
                      )
                      .toList(),
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ServiceChip extends StatelessWidget {
  const _ServiceChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: GtColors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: GtColors.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 18, color: GtColors.brand),
          const SizedBox(width: 8),
          Text(
            label,
            style: const TextStyle(
              color: GtColors.text,
              fontWeight: FontWeight.w700,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }
}

class _GlowOrb extends StatelessWidget {
  const _GlowOrb({required this.size, required this.color});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color,
      ),
    );
  }
}

class _PageAvailability extends StatelessWidget {
  const _PageAvailability();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _SlideHeader(
          eyebrow: 'Availability',
          title: 'Premium cars at low prices',
          subtitle:
              'All countries. All car types. Compare trusted offers and book in seconds.',
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Row(
            children: const [
              _MiniStat(icon: Icons.public_rounded, label: 'Global'),
              SizedBox(width: 8),
              _MiniStat(icon: Icons.directions_car_filled_rounded, label: 'All classes'),
              SizedBox(width: 8),
              _MiniStat(icon: Icons.payments_outlined, label: 'Fair fares'),
            ],
          ),
        ),
        const SizedBox(height: 20),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Container(
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
              decoration: BoxDecoration(
                color: GtColors.white,
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: GtColors.border),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.06),
                    blurRadius: 24,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: Column(
                children: [
                  Row(
                    children: [
                      const Text(
                        'Top offers nearby',
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 15,
                          color: GtColors.text,
                        ),
                      ),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: GtColors.soft,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Text(
                          'Live',
                          style: TextStyle(
                            color: GtColors.brand,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Expanded(
                    child: Column(
                      children: const [
                        Expanded(
                          child: _OfferTile(
                            name: 'Mercedes-Benz S-Class',
                            price: 'US\$51',
                            rating: '4.5',
                            reviews: '10k+',
                            accent: true,
                          ),
                        ),
                        SizedBox(height: 10),
                        Expanded(
                          child: _OfferTile(
                            name: 'BMW 7 Series',
                            price: 'US\$68',
                            rating: '4.7',
                            reviews: '8.2k',
                          ),
                        ),
                        SizedBox(height: 10),
                        Expanded(
                          child: _OfferTile(
                            name: 'Audi A8 L',
                            price: 'US\$59',
                            rating: '4.6',
                            reviews: '6.1k',
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
      ],
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
        decoration: BoxDecoration(
          color: GtColors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: GtColors.border),
        ),
        child: Column(
          children: [
            Icon(icon, size: 18, color: GtColors.brand),
            const SizedBox(height: 4),
            Text(
              label,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 11,
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

class _OfferTile extends StatelessWidget {
  const _OfferTile({
    required this.name,
    required this.price,
    required this.rating,
    required this.reviews,
    this.accent = false,
  });

  final String name;
  final String price;
  final String rating;
  final String reviews;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: accent ? GtColors.soft.withValues(alpha: 0.65) : GtColors.bgGrey,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: accent
              ? GtColors.brand.withValues(alpha: 0.18)
              : Colors.transparent,
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 58,
            height: 46,
            decoration: BoxDecoration(
              color: GtColors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: GtColors.border),
            ),
            child: const Icon(
              Icons.directions_car_filled_rounded,
              color: GtColors.text,
              size: 26,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                    color: GtColors.text,
                  ),
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    const Icon(Icons.star_rounded, size: 14, color: GtColors.star),
                    const SizedBox(width: 2),
                    Text(
                      '$rating ($reviews)',
                      style: const TextStyle(
                        fontSize: 12,
                        color: GtColors.textSecondary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                price,
                style: const TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 15,
                  color: GtColors.text,
                ),
              ),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: GtColors.brand,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  'BOOK',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.4,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PagePhotos extends StatelessWidget {
  const _PagePhotos();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _SlideHeader(
          eyebrow: 'Transparency',
          title: 'See the car before you pay',
          subtitle:
              'Real photos, vehicle ratings and completed rides — no surprises.',
        ),
        const SizedBox(height: 16),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(
              children: [
                Expanded(
                  flex: 5,
                  child: Container(
                    width: double.infinity,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(24),
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [
                          const Color(0xFFE8EEF5),
                          GtColors.soft,
                          GtColors.bgGrey,
                        ],
                      ),
                      border: Border.all(color: GtColors.border),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.05),
                          blurRadius: 20,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: Stack(
                      children: [
                        const Center(
                          child: Icon(
                            Icons.airport_shuttle_rounded,
                            size: 110,
                            color: GtColors.textMuted,
                          ),
                        ),
                        Positioned(
                          top: 14,
                          left: 14,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 6,
                            ),
                            decoration: BoxDecoration(
                              color: GtColors.white.withValues(alpha: 0.92),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: GtColors.border),
                            ),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  Icons.verified_rounded,
                                  size: 14,
                                  color: GtColors.brand,
                                ),
                                SizedBox(width: 4),
                                Text(
                                  'Verified photos',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: GtColors.text,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        Positioned(
                          left: 14,
                          bottom: 14,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 8,
                            ),
                            decoration: BoxDecoration(
                              color: GtColors.text.withValues(alpha: 0.88),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  Icons.star_rounded,
                                  color: GtColors.star,
                                  size: 18,
                                ),
                                SizedBox(width: 4),
                                Text(
                                  '4.8  ·  37 rides',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w800,
                                    fontSize: 13,
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
                const SizedBox(height: 12),
                Expanded(
                  flex: 2,
                  child: Row(
                    children: const [
                      Expanded(
                        child: _PhotoThumb(
                          icon: Icons.airline_seat_recline_extra_rounded,
                          label: 'Interior',
                        ),
                      ),
                      SizedBox(width: 10),
                      Expanded(
                        child: _PhotoThumb(
                          icon: Icons.luggage_rounded,
                          label: 'Trunk',
                        ),
                      ),
                      SizedBox(width: 10),
                      Expanded(
                        child: _PhotoThumb(
                          icon: Icons.speed_rounded,
                          label: 'Dash',
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _PhotoThumb extends StatelessWidget {
  const _PhotoThumb({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: GtColors.bgGrey,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: GtColors.border),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: GtColors.textSecondary, size: 28),
          const SizedBox(height: 6),
          Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: GtColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

class _PageHospitality extends StatelessWidget {
  const _PageHospitality();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _SlideHeader(
          eyebrow: 'Trust',
          title: 'Hospitality you can measure',
          subtitle:
              'Drivers earn a hospitality score from real passenger feedback.',
        ),
        const SizedBox(height: 12),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned.fill(
                  child: Container(
                    margin: const EdgeInsets.only(top: 28),
                    padding: const EdgeInsets.fromLTRB(18, 44, 18, 18),
                    decoration: BoxDecoration(
                      color: GtColors.white,
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: GtColors.border),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.06),
                          blurRadius: 24,
                          offset: const Offset(0, 10),
                        ),
                      ],
                    ),
                    child: Column(
                      children: [
                        Row(
                          children: const [
                            Expanded(
                              child: _BigStat(
                                value: '4.8',
                                label: 'Rating\n(956)',
                              ),
                            ),
                            Expanded(
                              child: _BigStat(
                                value: '5y',
                                label: 'With\nCAN-GO',
                              ),
                            ),
                            Expanded(
                              child: _BigStat(
                                value: '1.2k',
                                label: 'Completed\nrides',
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 10,
                          ),
                          decoration: BoxDecoration(
                            color: GtColors.soft,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Row(
                            children: [
                              Icon(
                                Icons.thumb_up_alt_rounded,
                                color: GtColors.brand,
                                size: 18,
                              ),
                              SizedBox(width: 8),
                              Text(
                                'Top selection driver',
                                style: TextStyle(
                                  fontWeight: FontWeight.w800,
                                  color: GtColors.text,
                                  fontSize: 13,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                        const Expanded(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                            children: [
                              _ScoreBar(
                                icon: Icons.chat_bubble_outline_rounded,
                                label: 'Communication',
                                score: 4.9,
                              ),
                              _ScoreBar(
                                icon: Icons.directions_car_outlined,
                                label: 'Vehicle',
                                score: 4.8,
                              ),
                              _ScoreBar(
                                icon: Icons.person_outline_rounded,
                                label: 'Driver',
                                score: 4.8,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                Align(
                  alignment: Alignment.topCenter,
                  child: Container(
                    width: 72,
                    height: 72,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [GtColors.brand, GtColors.brandDark],
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: GtColors.brand.withValues(alpha: 0.35),
                          blurRadius: 16,
                          offset: const Offset(0, 6),
                        ),
                      ],
                    ),
                    child: const Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          '110%',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w900,
                            fontSize: 18,
                            height: 1,
                          ),
                        ),
                        SizedBox(height: 2),
                        Text(
                          'score',
                          style: TextStyle(
                            color: Colors.white70,
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
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
        const SizedBox(height: 8),
      ],
    );
  }
}

class _BigStat extends StatelessWidget {
  const _BigStat({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          value,
          style: const TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w900,
            color: GtColors.text,
            letterSpacing: -0.5,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 11,
            height: 1.25,
            color: GtColors.textSecondary,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}

class _ScoreBar extends StatelessWidget {
  const _ScoreBar({
    required this.icon,
    required this.label,
    required this.score,
  });

  final IconData icon;
  final String label;
  final double score;

  @override
  Widget build(BuildContext context) {
    final pct = (score / 5).clamp(0.0, 1.0);

    return Row(
      children: [
        Icon(icon, size: 18, color: GtColors.textSecondary),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      label,
                      style: const TextStyle(
                        color: GtColors.text,
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                  ),
                  Text(
                    score.toStringAsFixed(1),
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      color: GtColors.text,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              ClipRRect(
                borderRadius: BorderRadius.circular(99),
                child: LinearProgressIndicator(
                  value: pct,
                  minHeight: 6,
                  backgroundColor: GtColors.bgGrey,
                  color: GtColors.brand,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
