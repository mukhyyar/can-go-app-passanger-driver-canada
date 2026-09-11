import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

enum _OfferSort {
  recommended,
  lowestPrice,
  highestPrice,
  bestRated,
  newest,
  vehicleClass,
}

class OffersScreen extends StatefulWidget {
  const OffersScreen({
    super.key,
    required this.rideId,
    this.focusOfferId,
  });

  final String rideId;
  final String? focusOfferId;

  @override
  State<OffersScreen> createState() => _OffersScreenState();
}

class _OffersScreenState extends State<OffersScreen> {
  _OfferSort _sort = _OfferSort.recommended;
  bool _viewRecorded = false;
  bool _booking = false;
  bool _loading = true;
  String? _loadError;
  List<Offer> _offers = const [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  Future<void> _bootstrap() async {
    await _reload();
    if (!mounted) return;
    if (!_viewRecorded) {
      _viewRecorded = true;
      final app = context.read<AppState>();
      if (app.isAuthenticated) {
        await app.recordRideView(widget.rideId);
      }
    }
    if (!mounted) return;
    final focus = widget.focusOfferId;
    if (focus != null && focus.isNotEmpty) {
      context.push('/offer/${widget.rideId}/$focus');
    }
  }

  Future<void> _reload() async {
    final app = context.read<AppState>();
    if (!mounted) return;
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      if (!app.isAuthenticated) {
        if (!mounted) return;
        setState(() {
          _loading = false;
          _offers = const [];
          _loadError = 'Sign in to see driver offers on this ride.';
        });
        return;
      }

      final raw = await app.api.marketplace.getRide(widget.rideId);
      final parsed = parseOffersList(raw['offers']);
      await app.refreshRide(widget.rideId);
      if (!mounted) return;

      final fromState = app.offersFor(widget.rideId);
      final offers = parsed.isNotEmpty ? parsed : fromState;
      final ride = app.rideById(widget.rideId);
      final serverCount = raw['offerCount'] is num
          ? (raw['offerCount'] as num).toInt()
          : (raw['offers'] is List ? (raw['offers'] as List).length : 0);

      setState(() {
        _loading = false;
        _offers = offers;
        if (offers.isEmpty && serverCount > 0) {
          _loadError =
              'API returned $serverCount offer(s) but parsing yielded 0. Tap Retry.';
        } else if (offers.isEmpty && (ride?.offerCount ?? 0) > 0) {
          _loadError =
              'Server has ${ride!.offerCount} offer(s) but the card did not load.';
        } else {
          _loadError = null;
        }
      });
    } catch (e, st) {
      debugPrint('OffersScreen reload error: $e\n$st');
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadError = '$e';
      });
    }
  }

  List<Offer> _sorted(List<Offer> offers) {
    final list = List<Offer>.from(offers);
    switch (_sort) {
      case _OfferSort.recommended:
        list.sort((a, b) {
          final scoreA = a.rating * 10 - a.price / 1000;
          final scoreB = b.rating * 10 - b.price / 1000;
          return scoreB.compareTo(scoreA);
        });
      case _OfferSort.lowestPrice:
        list.sort((a, b) => a.price.compareTo(b.price));
      case _OfferSort.highestPrice:
        list.sort((a, b) => b.price.compareTo(a.price));
      case _OfferSort.bestRated:
        list.sort((a, b) => b.rating.compareTo(a.rating));
      case _OfferSort.newest:
        list.sort((a, b) => b.id.compareTo(a.id));
      case _OfferSort.vehicleClass:
        list.sort((a, b) => a.vehicleClass.compareTo(b.vehicleClass));
    }
    return list;
  }

  Future<void> _book(Offer offer) async {
    if (_booking) return;
    setState(() => _booking = true);
    final app = context.read<AppState>();
    try {
      await app.validateBook(widget.rideId, offer.id);
      if (!mounted) return;
      context.push('/payment/${widget.rideId}/${offer.id}');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Cannot book: $e')),
      );
    } finally {
      if (mounted) setState(() => _booking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final ride = state.rideById(widget.rideId);
    final live = state.offersFor(widget.rideId);
    final source = _offers.isNotEmpty ? _offers : live;
    final offers = _sorted(source);
    final offerCount =
        offers.isNotEmpty ? offers.length : (ride?.offerCount ?? 0);

    // Flutter web: ListView children were laying out but not painting.
    // ColoredBox + SingleChildScrollView + Column paints reliably.
    // Build offer rows imperatively — collection-if/else/for dropped cards.
    final children = <Widget>[
      if (!state.isAuthenticated)
        Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: const Color(0xFFFFF1F2),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: const Color(0xFFFECDD3)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Sign in required to load live offers.',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: () => context.push('/auth'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: GtColors.brand,
                  foregroundColor: Colors.white,
                  minimumSize: const Size.fromHeight(44),
                ),
                child: const Text('Sign in'),
              ),
            ],
          ),
        ),
      if (ride != null) ...[
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: GtColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                ride.from,
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
              ),
              if (ride.to != null) ...[
                const SizedBox(height: 6),
                Text(
                  ride.to!,
                  style:
                      const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                ),
              ],
              const SizedBox(height: 10),
              Text(
                '$offerCount offer${offerCount == 1 ? '' : 's'}'
                '${ride.viewCount != null ? ' · ${ride.viewCount} views' : ''}',
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  color: GtColors.brand,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            const Text(
              'Sort',
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: GtColors.textSecondary,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: SizedBox(
                height: 44,
                child: Material(
                  color: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                    side: const BorderSide(color: GtColors.border),
                  ),
                  child: PopupMenuButton<_OfferSort>(
                    initialValue: _sort,
                    onSelected: (v) => setState(() => _sort = v),
                    itemBuilder: (_) => const [
                      PopupMenuItem(
                        value: _OfferSort.recommended,
                        child: Text('Recommended'),
                      ),
                      PopupMenuItem(
                        value: _OfferSort.lowestPrice,
                        child: Text('Lowest price'),
                      ),
                      PopupMenuItem(
                        value: _OfferSort.highestPrice,
                        child: Text('Highest price'),
                      ),
                      PopupMenuItem(
                        value: _OfferSort.bestRated,
                        child: Text('Best rated'),
                      ),
                      PopupMenuItem(
                        value: _OfferSort.newest,
                        child: Text('Newest'),
                      ),
                      PopupMenuItem(
                        value: _OfferSort.vehicleClass,
                        child: Text('Vehicle class'),
                      ),
                    ],
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              switch (_sort) {
                                _OfferSort.recommended => 'Recommended',
                                _OfferSort.lowestPrice => 'Lowest price',
                                _OfferSort.highestPrice => 'Highest price',
                                _OfferSort.bestRated => 'Best rated',
                                _OfferSort.newest => 'Newest',
                                _OfferSort.vehicleClass => 'Vehicle class',
                              },
                              style: const TextStyle(fontSize: 14),
                            ),
                          ),
                          const Icon(Icons.arrow_drop_down),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
      ],
    ];

    if (_loading && offers.isEmpty) {
      children.add(
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 40),
          child: Center(
            child: CircularProgressIndicator(color: GtColors.brand),
          ),
        ),
      );
    } else if (offers.isEmpty) {
      children.add(
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: GtColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                _loadError != null ? 'Could not load offers' : 'No offers yet',
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                ),
              ),
              if (_loadError != null) ...[
                const SizedBox(height: 8),
                Text(
                  _loadError!,
                  style: const TextStyle(color: Color(0xFF9F1239), fontSize: 13),
                ),
              ],
              const SizedBox(height: 8),
              const Text(
                'Drivers are bidding. Tap Retry to refresh.',
                style: TextStyle(color: GtColors.textMuted, fontSize: 13),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _loading ? null : _reload,
                style: ElevatedButton.styleFrom(
                  backgroundColor: GtColors.brand,
                  foregroundColor: Colors.white,
                  minimumSize: const Size.fromHeight(44),
                ),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    } else {
      for (final offer in offers) {
        children.add(
          Container(
            width: double.infinity,
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: GtColors.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  offer.displayName,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${offer.vehicleClass} · ${offer.passengers} pax'
                  '${offer.baggage != null ? ' · ${offer.baggage} bags' : ''}',
                  style: const TextStyle(fontSize: 13, color: Colors.black54),
                ),
                if (offer.ratingCount > 0) ...[
                  const SizedBox(height: 4),
                  Text(
                    '★ ${offer.rating.toStringAsFixed(1)} (${offer.ratingCount})',
                    style: const TextStyle(fontSize: 12, color: Colors.black45),
                  ),
                ],
                const SizedBox(height: 10),
                Text(
                  offer.priceLabel,
                  style: const TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 24,
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    TextButton(
                      onPressed: () => context
                          .push('/offer/${widget.rideId}/${offer.id}'),
                      child: const Text(
                        'DETAILS',
                        style: TextStyle(
                          color: GtColors.brand,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    const Spacer(),
                    ElevatedButton(
                      onPressed: _booking ? null : () => _book(offer),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF16A34A),
                        foregroundColor: Colors.white,
                        elevation: 0,
                        minimumSize: const Size(120, 44),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      child: const Text(
                        'BOOK',
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      }
    }

    return Scaffold(
      backgroundColor: const Color(0xFFF3F4F6),
      appBar: AppBar(
        title: Text(
          ride != null ? 'Offers · #${ride.displayId}' : 'Offers',
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.canPop() ? context.pop() : context.go('/'),
        ),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _loading ? null : _reload,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      // Explicit expand — Flutter web was painting AppBar but leaving body empty
      // when ListView/unbounded scroll got zero paint extent.
      body: SizedBox.expand(
        child: ColoredBox(
          color: const Color(0xFFF3F4F6),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  '${offers.length} offer${offers.length == 1 ? '' : 's'} available',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: Colors.black87,
                  ),
                ),
                const SizedBox(height: 12),
                ...children,
              ],
            ),
          ),
        ),
      ),
    );
  }
}
