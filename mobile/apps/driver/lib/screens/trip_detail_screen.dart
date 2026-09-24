import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../state/app_state.dart';

class TripDetailScreen extends StatefulWidget {
  const TripDetailScreen({super.key, required this.rideId});

  final String rideId;

  @override
  State<TripDetailScreen> createState() => _TripDetailScreenState();
}

class _TripDetailScreenState extends State<TripDetailScreen> {
  DriverRequest? _ride;
  bool _loading = true;
  bool _acting = false;
  String? _error;
  AppState? _app;
  bool _ratingPromptShown = false;
  bool _alreadyRated = false;
  int? _myRatingStars;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _app ??= context.read<AppState>();
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _app?.stopTripLocationTracking();
    super.dispose();
  }

  Future<void> _load() async {
    final s = context.read<AppState>();
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final detail = await s.loadTripDetail(widget.rideId);
      Map<String, dynamic>? myRating;
      try {
        final st = (detail.status ?? '').toUpperCase();
        if (st == 'COMPLETED') {
          myRating = await s.myRideRating(widget.rideId);
        }
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _ride = detail;
        _loading = false;
        if (myRating != null) {
          _alreadyRated = true;
          final stars = myRating['stars'];
          _myRatingStars = stars is int ? stars : int.tryParse('$stars');
        }
      });
      _syncLocationTracking(detail.status);
      _maybeShowRating();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  void _maybeShowRating() {
    if (_ratingPromptShown || _alreadyRated || !mounted) return;
    if ((_ride?.status ?? '').toUpperCase() != 'COMPLETED') return;
    _ratingPromptShown = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && !_alreadyRated) _showRatingDialog();
    });
  }

  Future<void> _showRatingDialog() async {
    if (_alreadyRated) return;
    var stars = 5;
    final commentCtrl = TextEditingController();
    final selectedSuggestions = <String>{};
    final submitted = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('Rate your passenger'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(5, (i) {
                    final filled = i < stars;
                    return IconButton(
                      icon: Icon(
                        filled ? Icons.star : Icons.star_border,
                        color: GtColors.warn,
                        size: 32,
                      ),
                      onPressed: () => setLocal(() {
                        final newStars = i + 1;
                        if (stars != newStars) {
                          stars = newStars;
                          selectedSuggestions.clear();
                          commentCtrl.clear();
                        }
                      }),
                    );
                  }),
                ),
                const SizedBox(height: 12),
                GtReviewSuggestions(
                  target: ReviewTarget.passenger,
                  stars: stars,
                  selectedSuggestions: selectedSuggestions,
                  onToggle: (s) => setLocal(() {
                    if (selectedSuggestions.contains(s)) {
                      selectedSuggestions.remove(s);
                    } else {
                      selectedSuggestions.add(s);
                    }
                    commentCtrl.text = selectedSuggestions.join(', ');
                  }),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: commentCtrl,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    hintText: 'Optional comment',
                    border: OutlineInputBorder(),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Later'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Submit'),
            ),
          ],
        ),
      ),
    );
    final rawText = commentCtrl.text.trim();
    final commentText = rawText.isNotEmpty
        ? rawText
        : (selectedSuggestions.isNotEmpty
            ? selectedSuggestions.join(', ')
            : null);
    commentCtrl.dispose();
    if (submitted != true || !mounted) return;
    try {
      await context.read<AppState>().rateRide(
            widget.rideId,
            stars: stars,
            comment: commentText,
          );

      if (mounted) {
        setState(() {
          _alreadyRated = true;
          _myRatingStars = stars;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Thanks for your feedback')),
        );
      }
    } catch (e) {
      if (!mounted) return;
      final msg = e.toString().toLowerCase();
      if (msg.contains('already rated')) {
        setState(() {
          _alreadyRated = true;
          _myRatingStars ??= stars;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('You already rated this passenger')),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not submit rating')),
        );
      }
    }
  }

  void _syncLocationTracking(String? status) {
    final s = context.read<AppState>();
    final upper = (status ?? '').toUpperCase();
    if (upper == 'DRIVER_EN_ROUTE' ||
        upper == 'DRIVER_ARRIVED' ||
        upper == 'TRIP_STARTED' ||
        upper == 'IN_PROGRESS') {
      s.startTripLocationTracking(widget.rideId);
    } else {
      s.stopTripLocationTracking();
    }
  }

  String get _serverStatus => (_ride?.status ?? '').toUpperCase();

  bool get _isActiveTrip {
    const active = {
      'BOOKED',
      'DRIVER_EN_ROUTE',
      'DRIVER_ARRIVED',
      'TRIP_STARTED',
      'IN_PROGRESS',
    };
    return active.contains(_serverStatus);
  }

  Future<void> _primaryAction() async {
    if (_acting || _ride == null) return;
    final s = context.read<AppState>();
    setState(() => _acting = true);
    try {
      switch (_serverStatus) {
        case 'BOOKED':
          await s.tripGoEnRoute(widget.rideId);
        case 'DRIVER_EN_ROUTE':
          await s.tripArrived(widget.rideId);
        case 'DRIVER_ARRIVED':
          await s.tripStart(widget.rideId);
        case 'TRIP_STARTED':
        case 'IN_PROGRESS':
          await s.tripComplete(widget.rideId);
      }
      if (!mounted) return;
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Action failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _acting = false);
    }
  }

  String? get _primaryLabel {
    switch (_serverStatus) {
      case 'BOOKED':
        return 'Go en route';
      case 'DRIVER_EN_ROUTE':
        return 'Arrived at pickup';
      case 'DRIVER_ARRIVED':
        return 'Start trip';
      case 'TRIP_STARTED':
      case 'IN_PROGRESS':
        return 'Complete trip';
      default:
        return null;
    }
  }

  Future<void> _openMaps() async {
    final r = _ride;
    if (r == null) return;

    // Heading to DROP-OFF if trip is in progress; otherwise heading to PICKUP
    final isTripInProgress = _serverStatus == 'TRIP_STARTED' ||
        _serverStatus == 'IN_PROGRESS' ||
        (r.status ?? '').toUpperCase() == 'TRIP_STARTED' ||
        (r.status ?? '').toUpperCase() == 'IN_PROGRESS';

    final destLat = (isTripInProgress && r.toLat != null)
        ? r.toLat!
        : (r.fromLat ?? r.toLat);
    final destLng = (isTripInProgress && r.toLng != null)
        ? r.toLng!
        : (r.fromLng ?? r.toLng);

    if (destLat == null || destLng == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Destination coordinates unavailable')),
        );
      }
      return;
    }

    // Retrieve driver's live GPS location
    double? currLat;
    double? currLng;
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.whileInUse ||
          perm == LocationPermission.always) {
        final pos = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
            timeLimit: Duration(seconds: 3),
          ),
        );
        currLat = pos.latitude;
        currLng = pos.longitude;
      }
    } catch (_) {}

    if (currLat == null || currLng == null) {
      try {
        final last = await Geolocator.getLastKnownPosition();
        if (last != null) {
          currLat = last.latitude;
          currLng = last.longitude;
        }
      } catch (_) {}
    }

    // 1. Android: Try native Google Maps turn-by-turn navigation intent
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      final navUri = Uri.parse(
        'google.navigation:q=$destLat,$destLng&mode=d',
      );
      try {
        if (await canLaunchUrl(navUri)) {
          final launched = await launchUrl(
            navUri,
            mode: LaunchMode.externalApplication,
          );
          if (launched) return;
        }
      } catch (_) {}
    }

    // 2. iOS: Try native Google Maps app scheme with origin & destination
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.iOS) {
      final saddr = (currLat != null && currLng != null)
          ? '$currLat,$currLng'
          : '';
      final iosMapsUri = Uri.parse(
        'comgooglemaps://?saddr=$saddr&daddr=$destLat,$destLng&directionsmode=driving',
      );
      try {
        if (await canLaunchUrl(iosMapsUri)) {
          final launched = await launchUrl(
            iosMapsUri,
            mode: LaunchMode.externalApplication,
          );
          if (launched) return;
        }
      } catch (_) {}
    }

    // 3. Universal Google Maps Directions URL (driving mode + navigate action)
    final originParam = (currLat != null && currLng != null)
        ? 'origin=$currLat,$currLng&'
        : '';
    final universalUri = Uri.parse(
      'https://www.google.com/maps/dir/?api=1&${originParam}destination=$destLat,$destLng&travelmode=driving&dir_action=navigate',
    );

    try {
      if (await canLaunchUrl(universalUri)) {
        await launchUrl(universalUri, mode: LaunchMode.externalApplication);
      } else {
        final fallbackUri = Uri.parse(
          'https://www.google.com/maps/search/?api=1&query=$destLat,$destLng',
        );
        await launchUrl(fallbackUri, mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      debugPrint('Could not launch navigation: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not open map navigation')),
        );
      }
    }
  }

  int _timelineIndex(String status) {
    switch (status.toUpperCase()) {
      case 'BOOKED':
        return 0;
      case 'DRIVER_EN_ROUTE':
        return 1;
      case 'DRIVER_ARRIVED':
        return 2;
      case 'TRIP_STARTED':
      case 'IN_PROGRESS':
        return 3;
      case 'COMPLETED':
        return 4;
      default:
        return 0;
    }
  }

  void _onBack() {
    final r = _ride;
    final isCompleted = _serverStatus.toUpperCase() == 'COMPLETED' ||
        (r?.status ?? '').toUpperCase() == 'COMPLETED';
    final isTerminal = isCompleted ||
        _serverStatus.contains('CANCEL') ||
        (r?.status ?? '').toUpperCase().contains('CANCEL') ||
        _serverStatus == 'NO_SHOW' ||
        (r?.status ?? '').toUpperCase() == 'NO_SHOW';

    if (isTerminal) {
      context.read<AppState>().refreshOpenRequests();
      context.go('/');
    } else if (context.canPop()) {
      context.pop();
    } else {
      context.go('/');
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = _ride;
    final isCompleted = _serverStatus.toUpperCase() == 'COMPLETED' ||
        (r?.status ?? '').toUpperCase() == 'COMPLETED';
    final isTerminal = isCompleted ||
        _serverStatus.contains('CANCEL') ||
        (r?.status ?? '').toUpperCase().contains('CANCEL') ||
        _serverStatus == 'NO_SHOW' ||
        (r?.status ?? '').toUpperCase() == 'NO_SHOW';

    return PopScope(
      canPop: !isTerminal,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        _onBack();
      },
      child: Scaffold(
        backgroundColor: GtColors.bgGrey,
        appBar: AppBar(
          title: Text(r != null ? 'Trip #${r.displayId}' : 'Trip'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: _onBack,
          ),
        ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_error!, textAlign: TextAlign.center),
                        const SizedBox(height: 12),
                        GtGreenButton(label: 'Retry', onPressed: _load),
                      ],
                    ),
                  ),
                )
              : r == null
                  ? const Center(child: Text('Trip not found'))
                  : Column(
                      children: [
                        Expanded(
                          child: ListView(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                            children: [
                              if (isCompleted &&
                                  (r.hasLostItemRequest || r.lostItem != null))
                                _buildLostItemCard(r),
                              GtCard(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Expanded(
                                          child: Text(
                                            r.datetimeLabel,
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w700,
                                              fontSize: 16,
                                            ),
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        Flexible(
                                          child: Container(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 10,
                                              vertical: 4,
                                            ),
                                            decoration: BoxDecoration(
                                              color: GtColors.soft,
                                              borderRadius:
                                                  BorderRadius.circular(12),
                                            ),
                                            child: Text(
                                              friendlyRideStatus(r.status),
                                              textAlign: TextAlign.end,
                                              style: const TextStyle(
                                                fontSize: 12,
                                                fontWeight: FontWeight.w700,
                                                color: GtColors.brand,
                                              ),
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                    if (r.isRoundTrip &&
                                        r.returnDatetimeLabel != null) ...[
                                      const SizedBox(height: 6),
                                      Text(
                                        'Return: ${r.returnDatetimeLabel}',
                                        style: const TextStyle(
                                          fontSize: 13,
                                          color: GtColors.textSecondary,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                    const SizedBox(height: 14),
                                    GtRouteRow(
                                      from: r.from,
                                      to: r.to,
                                      distance: r.distance,
                                      duration: r.duration,
                                      isRoundTrip: r.isRoundTrip,
                                      returnLabel: r.returnDatetimeLabel,
                                    ),
                                    const SizedBox(height: 12),
                                    GtVehicleChips(
                                      types: r.vehicleClassIds,
                                      rawNeed: r.vehicleNeed,
                                      passengers: r.passengers,
                                    ),
                                    if (r.offerPrice != null) ...[
                                      const SizedBox(height: 10),
                                      Text(
                                        '${r.currency} ${r.offerPrice!.toStringAsFixed(0)}',
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w800,
                                          color: GtColors.brand,
                                          fontSize: 18,
                                        ),
                                      ),
                                    ],
                                    if (r.driverEarning != null) ...[
                                      const SizedBox(height: 6),
                                      Text(
                                        'Your earning: ${r.currency} ${r.driverEarning!.toStringAsFixed(2)}',
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w600,
                                          fontSize: 14,
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                              const SizedBox(height: 16),
                              GtCard(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text(
                                      'Passenger',
                                      style: TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 15,
                                      ),
                                    ),
                                    const SizedBox(height: 10),
                                    if (!isCompleted &&
                                        (r.passengerName ?? '')
                                            .trim()
                                            .isNotEmpty) ...[
                                      Text(
                                        r.passengerName!.trim(),
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w800,
                                          fontSize: 17,
                                        ),
                                      ),
                                      const SizedBox(height: 10),
                                    ],
                                    Wrap(
                                      spacing: 8,
                                      runSpacing: 8,
                                      children: [
                                        _TripChip(
                                          label: 'Adults × ${r.passengers}',
                                        ),
                                        ..._childSeatChips(r),
                                        if ((r.flight ?? '')
                                            .trim()
                                            .isNotEmpty)
                                          _TripChip(
                                            label:
                                                'Flight ${r.flight!.trim()}',
                                            icon: Icons.flight,
                                          ),
                                        if ((r.returnFlight ?? '')
                                            .trim()
                                            .isNotEmpty)
                                          _TripChip(
                                            label:
                                                'Return flight ${r.returnFlight!.trim()}',
                                            icon: Icons.flight_land,
                                          ),
                                        if ((r.signage ?? '')
                                            .trim()
                                            .isNotEmpty)
                                          _TripChip(
                                            label:
                                                'Name sign: ${r.signage!.trim()}',
                                            icon: Icons.badge_outlined,
                                          ),
                                        if (r.flightWait != null)
                                          _TripChip(
                                            label:
                                                'Wait ${r.flightWait}',
                                            icon: Icons.schedule,
                                          )
                                        else if (r.pickupWaitMin != null)
                                          _TripChip(
                                            label:
                                                'Wait ${r.pickupWaitMin} min',
                                            icon: Icons.schedule,
                                          ),
                                        if (r.returnWaitMin != null)
                                          _TripChip(
                                            label:
                                                'Return wait ${r.returnWaitMin} min',
                                            icon: Icons.schedule,
                                          ),
                                        for (final o in r.requiredOptions)
                                          if (o != 'name_sign')
                                            _TripChip(
                                              label: o.replaceAll('_', ' '),
                                            ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 16),
                              const Text(
                                'Trip progress',
                                style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 15,
                                ),
                              ),
                              const SizedBox(height: 10),
                              GtCard(
                                child: TripTimeline(
                                  currentIndex: _timelineIndex(_serverStatus),
                                ),
                              ),
                              if ((r.comment ?? '').trim().isNotEmpty) ...[
                                const SizedBox(height: 16),
                                GtCard(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      const Text(
                                        'Passenger note',
                                        style: TextStyle(
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      const SizedBox(height: 6),
                                      Text(
                                        r.comment!.trim(),
                                        style: const TextStyle(
                                          color: GtColors.textSecondary,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                        if (_isActiveTrip && _primaryLabel != null)
                          Container(
                            width: double.infinity,
                            padding: EdgeInsets.fromLTRB(
                              16,
                              12,
                              16,
                              12 + MediaQuery.paddingOf(context).bottom,
                            ),
                            decoration: const BoxDecoration(
                              color: Colors.white,
                              border: Border(top: BorderSide(color: GtColors.border)),
                            ),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: OutlinedButton.icon(
                                        onPressed: _openMaps,
                                        icon: const Icon(Icons.navigation_outlined),
                                        label: const Text('Navigate'),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: OutlinedButton.icon(
                                        onPressed: () =>
                                            context.push('/chat/${r.id}'),
                                        icon: const Icon(Icons.chat_outlined),
                                        label: const Text('Chat'),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 10),
                                GtGreenButton(
                                  label: _acting ? 'Updating…' : _primaryLabel!,
                                  onPressed: _acting ? null : _primaryAction,
                                ),
                              ],
                            ),
                          )
                        else if (_serverStatus == 'COMPLETED')
                          Container(
                            width: double.infinity,
                            padding: EdgeInsets.fromLTRB(
                              16,
                              12,
                              16,
                              12 + MediaQuery.paddingOf(context).bottom,
                            ),
                            color: Colors.white,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                const Text(
                                  'Trip completed',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontWeight: FontWeight.w700,
                                    color: GtColors.brand,
                                  ),
                                ),
                                const SizedBox(height: 10),
                                if (_alreadyRated) ...[
                                  Text(
                                    _myRatingStars != null
                                        ? 'You rated passenger ★$_myRatingStars'
                                        : 'You already rated this passenger',
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                      color: GtColors.textSecondary,
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  GtGreenButton(
                                    label: 'Back to main screen',
                                    onPressed: _onBack,
                                  ),
                                ] else ...[
                                  GtGreenButton(
                                    label: 'Rate passenger',
                                    onPressed: _showRatingDialog,
                                  ),
                                  const SizedBox(height: 8),
                                  TextButton(
                                    onPressed: _onBack,
                                    child: const Text(
                                      'Back to main screen',
                                      style: TextStyle(
                                        color: GtColors.textSecondary,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                      ],
                    ),
      ),
    );
  }

  List<Widget> _childSeatChips(DriverRequest req) {
    final out = <Widget>[];
    final convertible = (req.childSeats['convertible'] as num?)?.toInt() ??
        (req.childSeats['child'] as num?)?.toInt() ??
        0;
    final infant = (req.childSeats['infant'] as num?)?.toInt() ?? 0;
    final booster = (req.childSeats['booster'] as num?)?.toInt() ?? 0;
    if (infant > 0) {
      out.add(_TripChip(label: 'Infant carrier × $infant'));
    }
    if (convertible > 0) {
      out.add(_TripChip(label: 'Convertible seat × $convertible'));
    }
    if (booster > 0) {
      out.add(_TripChip(label: 'Booster seat × $booster'));
    }
    return out;
  }

  Widget _buildLostItemCard(DriverRequest r) {
    final lost = r.lostItem;
    final status = (lost?.status ?? (r.hasLostItemRequest ? 'REPORTED' : ''))
        .toUpperCase();
    if (status.isEmpty) return const SizedBox.shrink();

    final isReported = status == 'REPORTED';
    final isFound = status == 'FOUND';
    final isNotFound = status == 'NOT_FOUND';
    final isReturned = status == 'RETURNED';

    Color bgColor;
    Color borderColor;
    Color primaryTextColor;
    Color secondaryTextColor;
    IconData headerIcon;
    Color iconColor;
    String title;
    String subtitle;

    if (isReturned) {
      bgColor = const Color(0xFFF0FDF4);
      borderColor = const Color(0xFFBBF7D0);
      primaryTextColor = const Color(0xFF166534);
      secondaryTextColor = const Color(0xFF15803D);
      headerIcon = Icons.check_circle;
      iconColor = const Color(0xFF16A34A);
      title = 'Lost Item Returned';
      subtitle = 'This item was returned to the passenger. Inquiry resolved.';
    } else if (isFound) {
      bgColor = const Color(0xFFF0FDF4);
      borderColor = const Color(0xFF86EFAC);
      primaryTextColor = const Color(0xFF14532D);
      secondaryTextColor = const Color(0xFF166534);
      headerIcon = Icons.task_alt;
      iconColor = const Color(0xFF15803D);
      title = 'Item Found — Return Pending';
      subtitle =
          'You confirmed locating the item in your vehicle. Coordinate return with the passenger.';
    } else if (isNotFound) {
      bgColor = const Color(0xFFF8FAFC);
      borderColor = const Color(0xFFE2E8F0);
      primaryTextColor = const Color(0xFF334155);
      secondaryTextColor = const Color(0xFF64748B);
      headerIcon = Icons.search_off;
      iconColor = const Color(0xFF64748B);
      title = 'Checked — Item Not Found';
      subtitle =
          'You inspected your vehicle and verified the item was not found.';
    } else {
      bgColor = const Color(0xFFFFFBEB);
      borderColor = const Color(0xFFFDE68A);
      primaryTextColor = const Color(0xFF92400E);
      secondaryTextColor = const Color(0xFFB45309);
      headerIcon = Icons.find_in_page_outlined;
      iconColor = const Color(0xFFD97706);
      title = 'Lost Item Inquiry';
      subtitle =
          'Passenger reported leaving an item in your vehicle. Please check your car interior.';
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: borderColor, width: 1.2),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: iconColor.withOpacity(0.12),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(headerIcon, color: iconColor, size: 22),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 15,
                          color: primaryTextColor,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        subtitle,
                        style: TextStyle(
                          fontSize: 12.5,
                          color: secondaryTextColor,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (lost?.itemDescription != null &&
                lost!.itemDescription!.trim().isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: borderColor.withOpacity(0.7)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Passenger Note / Description:',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 11.5,
                        color: Colors.black54,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      lost.itemDescription!,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: Colors.black87,
                      ),
                    ),
                  ],
                ),
              ),
            ],
            if (lost?.driverNote != null &&
                lost!.driverNote!.trim().isNotEmpty &&
                (isFound || isNotFound || isReturned)) ...[
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: borderColor.withOpacity(0.7)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Your Note:',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 11.5,
                        color: Colors.black54,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      lost.driverNote!,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: Colors.black87,
                      ),
                    ),
                  ],
                ),
              ),
            ],
            if ((isReported || isFound) &&
                ((lost?.contactPhone != null &&
                        lost!.contactPhone!.trim().isNotEmpty) ||
                    r.passengerName != null)) ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (lost?.contactPhone != null &&
                      lost!.contactPhone!.trim().isNotEmpty) ...[
                    ActionChip(
                      avatar: const Icon(Icons.phone,
                          size: 16, color: Color(0xFF1E40AF)),
                      label: Text(
                        'Call (${lost.contactPhone})',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF1E40AF),
                        ),
                      ),
                      backgroundColor: const Color(0xFFEFF6FF),
                      side: const BorderSide(color: Color(0xFFBFDBFE)),
                      onPressed: () =>
                          launchUrl(Uri.parse('tel:${lost.contactPhone}')),
                    ),
                    ActionChip(
                      avatar: const Icon(Icons.sms_outlined,
                          size: 16, color: Color(0xFF1E40AF)),
                      label: const Text(
                        'SMS',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF1E40AF),
                        ),
                      ),
                      backgroundColor: const Color(0xFFEFF6FF),
                      side: const BorderSide(color: Color(0xFFBFDBFE)),
                      onPressed: () =>
                          launchUrl(Uri.parse('sms:${lost.contactPhone}')),
                    ),
                  ],
                  ActionChip(
                    avatar: const Icon(Icons.chat_outlined,
                        size: 16, color: GtColors.brand),
                    label: const Text(
                      'Chat in App',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: GtColors.brand,
                      ),
                    ),
                    backgroundColor: const Color(0xFFECFDF5),
                    side: const BorderSide(color: Color(0xFFA7F3D0)),
                    onPressed: () => context.push('/chat/${r.id}'),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 14),
            if (isReported) ...[
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: _acting ? null : () => _showFoundDialog(r),
                      icon: const Icon(Icons.check_circle_outline, size: 18),
                      label: const Text('I Found It'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF16A34A),
                        foregroundColor: Colors.white,
                        elevation: 0,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _acting ? null : () => _showNotFoundDialog(r),
                      icon: const Icon(Icons.close, size: 18),
                      label: const Text('Not in Vehicle'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF64748B),
                        side: const BorderSide(color: Color(0xFFCBD5E1)),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ] else if (isFound) ...[
              ElevatedButton.icon(
                onPressed: _acting ? null : () => _showReturnDialog(r),
                icon: const Icon(Icons.handshake_outlined, size: 18),
                label: const Text('Mark as Returned to Passenger'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: GtColors.brand,
                  foregroundColor: Colors.white,
                  minimumSize: const Size(double.infinity, 44),
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              ),
            ] else if (isNotFound) ...[
              Center(
                child: TextButton.icon(
                  onPressed: _acting ? null : () => _showFoundDialog(r),
                  icon: const Icon(Icons.search, size: 16),
                  label: const Text('Found it later? Tap here to report found'),
                  style: TextButton.styleFrom(
                    foregroundColor: GtColors.brand,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _showFoundDialog(DriverRequest r) async {
    final noteCtrl = TextEditingController();
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(ctx).viewInsets.bottom,
          left: 20,
          right: 20,
          top: 20,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: const [
                  Icon(Icons.check_circle, color: Color(0xFF16A34A), size: 24),
                  SizedBox(width: 8),
                  Text(
                    'I Found the Item',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              const Text(
                'Let the passenger know you found their item. You can add an optional note with details on where it was found or how to arrange return.',
                style: TextStyle(
                    fontSize: 13, color: GtColors.textSecondary, height: 1.35),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: noteCtrl,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Note for passenger (optional)',
                  hintText: 'e.g. Found on rear right passenger floor',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 18),
              GtGreenButton(
                label: 'Confirm item found',
                onPressed: () => Navigator.pop(ctx, true),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Cancel'),
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    );

    if (ok == true && mounted) {
      setState(() => _acting = true);
      try {
        await _app?.respondToLostItem(
          rideId: r.id,
          action: 'FOUND',
          note: noteCtrl.text.trim().isEmpty ? null : noteCtrl.text.trim(),
        );
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Marked as found! Passenger has been notified.'),
            ),
          );
          await _load();
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error updating inquiry: $e')),
          );
        }
      } finally {
        if (mounted) setState(() => _acting = false);
      }
    }
    noteCtrl.dispose();
  }

  Future<void> _showNotFoundDialog(DriverRequest r) async {
    final noteCtrl = TextEditingController();
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(ctx).viewInsets.bottom,
          left: 20,
          right: 20,
          top: 20,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: const [
                  Icon(Icons.search_off, color: Color(0xFFDC2626), size: 24),
                  SizedBox(width: 8),
                  Text(
                    'Item Not in Vehicle',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              const Text(
                'Confirm that you thoroughly checked your vehicle (seats, floor, door pockets, trunk) and the reported item was not found.',
                style: TextStyle(
                    fontSize: 13, color: GtColors.textSecondary, height: 1.35),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: noteCtrl,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: 'Note (optional)',
                  hintText: 'e.g. Checked seats and trunk, nothing left behind',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 18),
              ElevatedButton(
                onPressed: () => Navigator.pop(ctx, true),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFDC2626),
                  foregroundColor: Colors.white,
                  minimumSize: const Size(double.infinity, 48),
                ),
                child: const Text('Confirm not in vehicle'),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Cancel'),
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    );

    if (ok == true && mounted) {
      setState(() => _acting = true);
      try {
        await _app?.respondToLostItem(
          rideId: r.id,
          action: 'NOT_FOUND',
          note: noteCtrl.text.trim().isEmpty ? null : noteCtrl.text.trim(),
        );
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Inquiry updated. Passenger has been notified.'),
            ),
          );
          await _load();
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error updating inquiry: $e')),
          );
        }
      } finally {
        if (mounted) setState(() => _acting = false);
      }
    }
    noteCtrl.dispose();
  }

  Future<void> _showReturnDialog(DriverRequest r) async {
    final noteCtrl = TextEditingController();
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(ctx).viewInsets.bottom,
          left: 20,
          right: 20,
          top: 20,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: const [
                  Icon(Icons.handshake_outlined,
                      color: GtColors.brand, size: 24),
                  SizedBox(width: 8),
                  Text(
                    'Mark as Returned',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              const Text(
                'Confirm that the item has been safely returned to the passenger. This will close the inquiry.',
                style: TextStyle(
                    fontSize: 13, color: GtColors.textSecondary, height: 1.35),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: noteCtrl,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: 'Delivery note (optional)',
                  hintText: 'e.g. Handed to passenger at hotel front desk',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 18),
              GtGreenButton(
                label: 'Confirm item returned',
                onPressed: () => Navigator.pop(ctx, true),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Cancel'),
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    );

    if (ok == true && mounted) {
      setState(() => _acting = true);
      try {
        await _app?.markLostItemReturned(
          rideId: r.id,
          note: noteCtrl.text.trim().isEmpty ? null : noteCtrl.text.trim(),
        );
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content:
                  Text('Item marked as returned! Lost item inquiry closed.'),
            ),
          );
          await _load();
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error closing inquiry: $e')),
          );
        }
      } finally {
        if (mounted) setState(() => _acting = false);
      }
    }
    noteCtrl.dispose();
  }
}

class _TripChip extends StatelessWidget {
  const _TripChip({required this.label, this.icon});

  final String label;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: GtColors.bgGrey,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: GtColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 14, color: GtColors.brand),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

@visibleForTesting
class TripTimeline extends StatelessWidget {
  const TripTimeline({super.key, required this.currentIndex});

  final int currentIndex;

  static const _steps = [
    ('Confirmed', Icons.check_circle_outline),
    ('En route', Icons.directions_car_outlined),
    ('Arrived', Icons.place_outlined),
    ('On trip', Icons.route_outlined),
    ('Done', Icons.flag_outlined),
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(_steps.length, (i) {
        final (label, icon) = _steps[i];
        final done = i <= currentIndex;
        final active = i == currentIndex;
        final isLast = i == _steps.length - 1;
        return IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Column(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: done
                          ? (active ? GtColors.brand : GtColors.soft)
                          : GtColors.bgGrey,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: done ? GtColors.brand : GtColors.border,
                        width: active ? 2 : 1,
                      ),
                    ),
                    child: Icon(
                      icon,
                      size: 18,
                      color: active
                          ? Colors.white
                          : (done ? GtColors.brand : GtColors.textMuted),
                    ),
                  ),
                  if (!isLast)
                    Expanded(
                      child: Container(
                        width: 2,
                        margin: const EdgeInsets.symmetric(vertical: 4),
                        color: i < currentIndex ? GtColors.brand : GtColors.border,
                      ),
                    ),
                ],
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Padding(
                  padding: EdgeInsets.only(bottom: isLast ? 0 : 18, top: 6),
                  child: Text(
                    label,
                    style: TextStyle(
                      fontWeight: active ? FontWeight.w800 : FontWeight.w600,
                      color: done ? GtColors.text : GtColors.textMuted,
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      }),
    );
  }
}
