import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../state/app_state.dart';
import '../utils/error_utils.dart';
import 'driver_cancellation_sheet.dart';

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

  Timer? _waitCountdownTimer;
  DateTime? _arrivedTimestamp;
  bool _contactAttemptMade = false;
  double? _driverDistanceMeters;
  Position? _currentPosition;

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
    _waitCountdownTimer?.cancel();
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
      if ((detail.status ?? '').toUpperCase() == 'DRIVER_ARRIVED') {
        _startWaitingTimer();
      } else {
        _waitCountdownTimer?.cancel();
        _waitCountdownTimer = null;
      }
      _maybeShowRating();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = cleanErrorMessage(e);
      });
    }
  }

  void _maybeShowRating() {
    if (_ratingPromptShown || _alreadyRated || !mounted) return;
    final isCompleted = _serverStatus.toUpperCase() == 'COMPLETED' ||
        (_ride?.status ?? '').toUpperCase() == 'COMPLETED';
    if (!isCompleted) return;
    _ratingPromptShown = true;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      final s = context.read<AppState>();
      if (!_alreadyRated) {
        try {
          final myRating = await s.myRideRating(widget.rideId);
          if (!mounted) return;
          if (myRating != null) {
            setState(() {
              _alreadyRated = true;
              final stars = myRating['stars'];
              _myRatingStars = stars is int ? stars : int.tryParse('$stars');
            });
            return;
          }
        } catch (_) {}
      }
      if (mounted && !_alreadyRated) {
        await _showRatingSheet();
      }
    });
  }

  Future<void> _showRatingSheet() async {
    if (_alreadyRated) return;
    var stars = 5;
    final commentCtrl = TextEditingController();
    final selectedSuggestions = <String>{};
    final submitted = await showGtSheet<bool>(
      context: context,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          12,
          20,
          20 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: StatefulBuilder(
          builder: (ctx, setLocal) => SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: GtColors.border,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Rate your passenger',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Help keep our community safe and respectful.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: GtColors.textSecondary,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(5, (i) {
                    final filled = i < stars;
                    return IconButton(
                      icon: Icon(
                        filled ? Icons.star : Icons.star_border,
                        color: GtColors.warn,
                        size: 36,
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
                const SizedBox(height: 14),
                TextField(
                  controller: commentCtrl,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    hintText: 'Optional comment',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 16),
                GtGreenButton(
                  label: 'Submit rating',
                  onPressed: () => Navigator.pop(ctx, true),
                ),
                TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: const Text('Later'),
                ),
              ],
            ),
          ),
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
        final displayMsg =
            cleanErrorMessage(e, fallback: 'Could not submit rating');
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(displayMsg)),
        );
      }
    }
  }

  Future<void> _showReportSheet() async {
    final r = _ride;
    if (r == null) return;
    final app = context.read<AppState>();

    final submitted = await showGtReportBottomSheet(
      context: context,
      target: ReportTarget.passenger,
      onSubmit: (reasons, details) async {
        await app.reportRide(
          r.id,
          reasons: reasons,
          details: details,
        );
      },
    );

    if (submitted == true && mounted) {
      await app.refreshMyRides();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Report submitted. Admin notified.'),
          backgroundColor: GtColors.brand,
        ),
      );
      setState(() {});
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

  bool get _canCancel {
    return _serverStatus == 'BOOKED' ||
        _serverStatus == 'DRIVER_EN_ROUTE' ||
        _serverStatus == 'DRIVER_ARRIVED' ||
        _serverStatus == 'TRIP_STARTED' ||
        _serverStatus == 'IN_PROGRESS';
  }

  bool get _isInProgress {
    return _serverStatus == 'TRIP_STARTED' || _serverStatus == 'IN_PROGRESS';
  }

  void _showEmergencySafetySheet() {
    final r = _ride;
    final s = context.read<AppState>();
    final primaryVeh = s.vehicles.isNotEmpty ? s.vehicles.first : null;
    final info = EmergencyTripInfo(
      rideId: r?.shortId ?? widget.rideId,
      vehiclePlate: primaryVeh?.plate,
      vehicleModel: primaryVeh != null
          ? '${primaryVeh.make} ${primaryVeh.model}'.trim()
          : null,
      passengerName: r?.passengerName,
      driverName: s.fullName.isNotEmpty ? s.fullName : null,
      pickupAddress: r?.from,
      dropoffAddress: r?.to,
    );

    EmergencySafetySheet.show(
      context,
      tripInfo: info,
      isDriver: true,
      onStopTripForSafety: _canCancel ? _confirmCancel : null,
      onContactSupport: () {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Support contact: partner@can-go.ca')),
        );
      },
    );
  }

  Future<void> _confirmCancel() async {
    final result = await showModalBottomSheet<Map<String, String>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => DriverCancellationSheet(
        isInProgress: _isInProgress,
      ),
    );
    if (!mounted || result == null) return;
    setState(() => _acting = true);
    try {
      await context.read<AppState>().cancelRide(
            widget.rideId,
            reasonCode: result['reasonCode'],
            reasonDetails: result['reasonDetails'],
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _isInProgress ? 'Trip stopped for safety' : 'Ride cancelled',
            ),
          ),
        );
        await _load();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Could not cancel ride: ${cleanErrorMessage(e)}'),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _acting = false);
      }
    }
  }

  Future<void> _primaryAction() async {
    if (_acting || _ride == null) return;
    final s = context.read<AppState>();

    if (_serverStatus == 'DRIVER_ARRIVED') {
      await _promptStartPin(s);
      return;
    }

    setState(() => _acting = true);
    try {
      switch (_serverStatus) {
        case 'BOOKED':
          await s.tripGoEnRoute(widget.rideId);
        case 'DRIVER_EN_ROUTE':
          await s.tripArrived(widget.rideId);
          _arrivedTimestamp = DateTime.now();
          _startWaitingTimer();
        case 'TRIP_STARTED':
        case 'IN_PROGRESS':
          await s.tripComplete(widget.rideId);
      }
      if (!mounted) return;
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Action failed: ${cleanErrorMessage(e)}')),
        );
      }
    } finally {
      if (mounted) setState(() => _acting = false);
    }
  }

  Future<void> _promptStartPin(AppState s) async {
    final started = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => _StartPinSheet(
        rideId: widget.rideId,
        appState: s,
      ),
    );

    if (started == true && mounted) {
      await _load();
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

  bool get _isTerminal {
    final r = _ride;
    final statusUpper = _serverStatus.toUpperCase();
    final rStatusUpper = (r?.status ?? '').toUpperCase();
    final isCompleted = statusUpper == 'COMPLETED' || rStatusUpper == 'COMPLETED';
    return isCompleted ||
        statusUpper.contains('CANCEL') ||
        rStatusUpper.contains('CANCEL') ||
        statusUpper == 'NO_SHOW' ||
        rStatusUpper == 'NO_SHOW' ||
        statusUpper == 'EXPIRED' ||
        rStatusUpper == 'EXPIRED' ||
        statusUpper == 'PAYMENT_FAILED' ||
        rStatusUpper == 'PAYMENT_FAILED' ||
        r?.isChatLocked == true;
  }

  void _onBack() {
    if (_isTerminal) {
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
    final statusUpper = _serverStatus.toUpperCase();
    final rStatusUpper = (r?.status ?? '').toUpperCase();
    final isCompleted = statusUpper == 'COMPLETED' || rStatusUpper == 'COMPLETED';
    if (isCompleted && !_alreadyRated && !_ratingPromptShown) {
      _maybeShowRating();
    }
    final isTerminal = _isTerminal;

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
          actions: [
            if (r != null && _isActiveTrip)
              IconButton(
                icon: const Icon(Icons.shield_outlined, color: Colors.red),
                tooltip: 'Emergency & Safety (911)',
                onPressed: _showEmergencySafetySheet,
              ),
            if (r != null)
              IconButton(
                icon: const Icon(Icons.flag_outlined),
                tooltip: 'Report trip',
                onPressed: _showReportSheet,
              ),
          ],
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
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
                            children: [
                              if (r.originalDriverId != null &&
                                  (r.status == 'WAITING_FOR_OFFERS' ||
                                      (r.status ?? '').contains('CANCEL'))) ...[
                                Container(
                                  margin: const EdgeInsets.only(bottom: 12),
                                  padding: const EdgeInsets.all(14),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFFEF2F2),
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(color: const Color(0xFFFCA5A5)),
                                  ),
                                  child: const Row(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Icon(
                                        Icons.warning_amber_rounded,
                                        color: Color(0xFFDC2626),
                                        size: 24,
                                      ),
                                      SizedBox(width: 10),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              'Ride Unassigned: Provider Failed to Arrive',
                                              style: TextStyle(
                                                fontWeight: FontWeight.w700,
                                                fontSize: 14,
                                                color: Color(0xFF991B1B),
                                              ),
                                            ),
                                            SizedBox(height: 4),
                                            Text(
                                              'You were unassigned from this ride because you did not arrive at the scheduled pickup. Your account has been flagged for compliance review.',
                                              style: TextStyle(
                                                fontSize: 12,
                                                color: Color(0xFF7F1D1D),
                                                height: 1.3,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                              if (isCompleted)
                                _buildLostItemCard(r),
                              if (isCompleted && (r.tipAmount ?? 0) > 0)
                                Container(
                                  margin: const EdgeInsets.only(bottom: 12),
                                  padding: const EdgeInsets.all(14),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFE8F5E9),
                                    borderRadius: BorderRadius.circular(14),
                                    border: Border.all(
                                      color: const Color(0xFFA5D6A7),
                                    ),
                                  ),
                                  child: Row(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const Icon(
                                        Icons.volunteer_activism_rounded,
                                        color: Color(0xFF2E7D32),
                                        size: 24,
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              'Passenger tipped you ${r.currency} ${r.tipAmount!.toStringAsFixed(2)}!',
                                              style: const TextStyle(
                                                color: Color(0xFF1B5E20),
                                                fontWeight: FontWeight.w800,
                                                fontSize: 15,
                                              ),
                                            ),
                                            const SizedBox(height: 3),
                                            const Text(
                                              '100% of tips go directly to you. Processed securely via Stripe.',
                                              style: TextStyle(
                                                color: Color(0xFF2E7D32),
                                                fontSize: 12,
                                                fontWeight: FontWeight.w500,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              if (r.isOverdueBooking)
                                Container(
                                  margin: const EdgeInsets.only(bottom: 12),
                                  padding: const EdgeInsets.all(14),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFFEF3C7),
                                    borderRadius: BorderRadius.circular(14),
                                    border: Border.all(
                                      color: const Color(0xFFFCD34D),
                                    ),
                                  ),
                                  child: Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      const Icon(
                                        Icons.warning_amber_rounded,
                                        color: Color(0xFFD97706),
                                        size: 24,
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              (r.status == 'TRIP_STARTED' || r.status == 'IN_PROGRESS')
                                                  ? 'Trip stalled or delayed'
                                                  : 'Scheduled pickup time has passed',
                                              style: const TextStyle(
                                                color: Color(0xFF92400E),
                                                fontWeight: FontWeight.w800,
                                                fontSize: 14,
                                              ),
                                            ),
                                            const SizedBox(height: 3),
                                            Text(
                                              (r.status == 'TRIP_STARTED' || r.status == 'IN_PROGRESS')
                                                  ? 'This trip appears delayed or stopped. Why are you not moving? If you are having trouble or cannot complete this trip, please cancel it so the passenger can be fully refunded.'
                                                  : 'This trip has not started. Are you moving or facing an issue? Please update status, or cancel if unable to proceed so the passenger can be refunded.',
                                              style: const TextStyle(
                                                color: Color(0xFF78350F),
                                                fontSize: 12,
                                                fontWeight: FontWeight.w500,
                                                height: 1.3,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              if (_serverStatus == 'DRIVER_ARRIVED') ...[
                                _buildWaitingForPassengerCard(r),
                                const SizedBox(height: 12),
                              ],
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
                                              color: r.isOverdueBooking
                                                  ? const Color(0xFFFEF3C7)
                                                  : GtColors.soft,
                                              borderRadius:
                                                  BorderRadius.circular(12),
                                              border: r.isOverdueBooking
                                                  ? Border.all(
                                                      color: const Color(
                                                          0xFFFCD34D))
                                                  : null,
                                            ),
                                            child: Text(
                                              r.isOverdueBooking
                                                  ? 'Overdue · Not started'
                                                  : friendlyRideStatus(r.status),
                                              textAlign: TextAlign.end,
                                              style: TextStyle(
                                                fontSize: 12,
                                                fontWeight: FontWeight.w700,
                                                color: r.isOverdueBooking
                                                    ? const Color(0xFFD97706)
                                                    : GtColors.brand,
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
                                      const SizedBox(height: 14),
                                      const Divider(height: 1),
                                      const SizedBox(height: 14),
                                      Row(
                                        mainAxisAlignment:
                                            MainAxisAlignment.spaceBetween,
                                        children: [
                                          const Text(
                                            'Ride fare',
                                            style: TextStyle(
                                              fontSize: 14,
                                              color: GtColors.textSecondary,
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                          Text(
                                            '${r.currency} ${r.offerPrice!.toStringAsFixed(2)}',
                                            style: const TextStyle(
                                              fontSize: 14,
                                              fontWeight: FontWeight.w700,
                                              color: GtColors.text,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ],
                                    if (r.driverEarning != null &&
                                        r.offerPrice != null) ...[
                                      const SizedBox(height: 4),
                                      Row(
                                        mainAxisAlignment:
                                            MainAxisAlignment.spaceBetween,
                                        children: [
                                          const Text(
                                            'Marketplace fee (20%)',
                                            style: TextStyle(
                                              fontSize: 14,
                                              color: GtColors.textSecondary,
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                          Text(
                                            '-${r.currency} ${(r.offerPrice! - (r.driverEarning! - (r.tipAmount ?? 0))).clamp(0.0, double.infinity).toStringAsFixed(2)}',
                                            style: const TextStyle(
                                              fontSize: 14,
                                              fontWeight: FontWeight.w700,
                                              color: Colors.red,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ],
                                    if ((r.tipAmount ?? 0) > 0) ...[
                                      const SizedBox(height: 4),
                                      Row(
                                        mainAxisAlignment:
                                            MainAxisAlignment.spaceBetween,
                                        children: [
                                          const Text(
                                            'Passenger tip (Stripe)',
                                            style: TextStyle(
                                              fontSize: 14,
                                              fontWeight: FontWeight.w600,
                                              color: Color(0xFF2E7D32),
                                            ),
                                          ),
                                          Text(
                                            '+${r.currency} ${r.tipAmount!.toStringAsFixed(2)}',
                                            style: const TextStyle(
                                              fontSize: 14,
                                              fontWeight: FontWeight.w700,
                                              color: Color(0xFF2E7D32),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ],
                                    if (r.driverEarning != null) ...[
                                      const SizedBox(height: 10),
                                      const Divider(height: 1),
                                      const SizedBox(height: 10),
                                      Row(
                                        mainAxisAlignment:
                                            MainAxisAlignment.spaceBetween,
                                        children: [
                                          const Text(
                                            'Total earning',
                                            style: TextStyle(
                                              fontSize: 15,
                                              fontWeight: FontWeight.w800,
                                            ),
                                          ),
                                          Text(
                                            '${r.currency} ${r.driverEarning!.toStringAsFixed(2)}',
                                            style: const TextStyle(
                                              fontSize: 18,
                                              fontWeight: FontWeight.w800,
                                              color: GtColors.brand,
                                            ),
                                          ),
                                        ],
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
                                    if (!isTerminal &&
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
                                        if (!isTerminal &&
                                            (r.signage ?? '')
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
                              if (!isTerminal && (r.comment ?? '').trim().isNotEmpty) ...[
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
                                        onPressed: () {
                                          setState(() => _contactAttemptMade = true);
                                          context
                                              .read<AppState>()
                                              .recordContactAttempt(r.id, method: 'CHAT');
                                          context.push('/chat/${r.id}');
                                        },
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
                                if (_serverStatus == 'DRIVER_ARRIVED') ...[
                                  const SizedBox(height: 8),
                                  _buildNoShowButton(r),
                                ],
                                const SizedBox(height: 8),
                                OutlinedButton.icon(
                                  onPressed: _showReportSheet,
                                  icon: const Icon(Icons.flag_outlined, size: 18),
                                  label: const Text('Report an issue'),
                                ),
                                if (_canCancel) ...[
                                  const SizedBox(height: 8),
                                  OutlinedButton(
                                    onPressed: _acting ? null : _confirmCancel,
                                    style: OutlinedButton.styleFrom(
                                      side: const BorderSide(color: GtColors.brand),
                                    ),
                                    child: Text(
                                      _isInProgress ? 'Stop Trip for Safety' : 'Cancel ride',
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Center(
                                    child: InkWell(
                                      onTap: () => showDriverCancellationPolicyDialog(context),
                                      child: const Padding(
                                        padding: EdgeInsets.symmetric(
                                          vertical: 4,
                                          horizontal: 8,
                                        ),
                                        child: Text(
                                          'View cancellation policy',
                                          style: TextStyle(
                                            fontSize: 12,
                                            color: GtColors.textSecondary,
                                            decoration: TextDecoration.underline,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                                if (_isActiveTrip) ...[
                                  const SizedBox(height: 8),
                                  TextButton.icon(
                                    onPressed: _showEmergencySafetySheet,
                                    icon: const Icon(Icons.shield_outlined,
                                        color: Colors.red, size: 18),
                                    label: const Text(
                                      'Emergency & Safety (911)',
                                      style: TextStyle(
                                        color: Colors.red,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                ],
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
                            decoration: BoxDecoration(
                              color: Colors.white,
                              border: const Border(
                                top: BorderSide(color: GtColors.border, width: 1.2),
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.06),
                                  blurRadius: 8,
                                  offset: const Offset(0, -3),
                                ),
                              ],
                            ),
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
                                  const SizedBox(height: 10),
                                  OutlinedButton.icon(
                                    onPressed: _showReportSheet,
                                    icon: const Icon(Icons.flag_outlined, size: 18),
                                    label: const Text('Report an issue'),
                                  ),
                                  if (r.hasReportedRide || r.hasActiveSupport) ...[
                                    const SizedBox(height: 8),
                                    OutlinedButton.icon(
                                      onPressed: () => context.push('/chat/${r.id}'),
                                      icon: const Icon(Icons.support_agent_outlined, size: 18),
                                      style: OutlinedButton.styleFrom(
                                        foregroundColor: GtColors.brand,
                                        side: const BorderSide(color: GtColors.brand),
                                      ),
                                      label: const Text('Chat with Support'),
                                    ),
                                  ],
                                  const SizedBox(height: 12),
                                  GtGreenButton(
                                    label: 'Back to main screen',
                                    onPressed: _onBack,
                                  ),
                                ] else ...[
                                  GtGreenButton(
                                    label: 'Rate passenger',
                                    onPressed: _showRatingSheet,
                                  ),
                                  const SizedBox(height: 8),
                                  OutlinedButton.icon(
                                    onPressed: _showReportSheet,
                                    icon: const Icon(Icons.flag_outlined, size: 18),
                                    label: const Text('Report an issue'),
                                  ),
                                  if (r.hasReportedRide || r.hasActiveSupport) ...[
                                    const SizedBox(height: 8),
                                    OutlinedButton.icon(
                                      onPressed: () => context.push('/chat/${r.id}'),
                                      icon: const Icon(Icons.support_agent_outlined, size: 18),
                                      style: OutlinedButton.styleFrom(
                                        foregroundColor: GtColors.brand,
                                        side: const BorderSide(color: GtColors.brand),
                                      ),
                                      label: const Text('Chat with Support'),
                                    ),
                                  ],
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

  void _openFullScreenPhoto({
    Uint8List? bytes,
    String? url,
    String? title,
  }) {
    if (bytes == null && (url == null || url.trim().isEmpty)) return;
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (previewCtx) => Scaffold(
          backgroundColor: Colors.black,
          appBar: AppBar(
            backgroundColor: Colors.black,
            foregroundColor: Colors.white,
            elevation: 0,
            title: Text(
              title ?? 'Photo Preview',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
            actions: [
              IconButton(
                icon: const Icon(Icons.close, color: Colors.white),
                onPressed: () => Navigator.of(previewCtx).pop(),
              ),
            ],
          ),
          body: Center(
            child: InteractiveViewer(
              minScale: 0.8,
              maxScale: 4.0,
              child: bytes != null
                  ? Image.memory(
                      bytes,
                      fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) => const Center(
                        child: Icon(
                          Icons.broken_image_outlined,
                          size: 64,
                          color: Colors.white54,
                        ),
                      ),
                    )
                  : Image.network(
                      resolveOfferImageUrl(url!),
                      fit: BoxFit.contain,
                      loadingBuilder: (ctx, child, progress) {
                        if (progress == null) return child;
                        return const Center(
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        );
                      },
                      errorBuilder: (_, __, ___) => const Center(
                        child: Icon(
                          Icons.broken_image_outlined,
                          size: 64,
                          color: Colors.white54,
                        ),
                      ),
                    ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildPhotoThumbnail(String? photoUrl, {String? label}) {
    if (photoUrl == null || photoUrl.trim().isEmpty) return const SizedBox.shrink();
    final trimmed = photoUrl.trim();

    Uint8List? imageBytes;
    if (trimmed.startsWith('data:image')) {
      final comma = trimmed.indexOf(',');
      if (comma != -1) {
        final cleanBase64 = trimmed
            .substring(comma + 1)
            .replaceAll(RegExp(r'\s+'), '');
        try {
          imageBytes = base64Decode(cleanBase64);
        } catch (e) {
          debugPrint('Error decoding base64 image: $e');
        }
      }
    } else if (trimmed.startsWith('/9j/') || trimmed.startsWith('iVBORw')) {
      try {
        final cleanBase64 = trimmed.replaceAll(RegExp(r'\s+'), '');
        imageBytes = base64Decode(cleanBase64);
      } catch (_) {}
    }

    Widget contentWidget;
    if (imageBytes != null) {
      contentWidget = Image.memory(
        imageBytes,
        fit: BoxFit.contain,
        errorBuilder: (_, __, ___) => Container(
          color: const Color(0xFF1E293B),
          child: const Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.broken_image_outlined, color: Colors.white54, size: 36),
                SizedBox(height: 6),
                Text(
                  'Invalid photo format',
                  style: TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ],
            ),
          ),
        ),
      );
    } else if (trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('/')) {
      final resolvedUrl = resolveOfferImageUrl(trimmed);
      contentWidget = Image.network(
        resolvedUrl,
        fit: BoxFit.contain,
        loadingBuilder: (ctx, child, progress) {
          if (progress == null) return child;
          return const Center(
            child: SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: GtColors.brand,
              ),
            ),
          );
        },
        errorBuilder: (_, __, ___) => Container(
          color: const Color(0xFF1E293B),
          child: const Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.broken_image_outlined, color: Colors.white54, size: 36),
                SizedBox(height: 6),
                Text(
                  'Unable to load photo',
                  style: TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ],
            ),
          ),
        ),
      );
    } else {
      contentWidget = Container(
        color: const Color(0xFF1E293B),
        child: const Center(
          child: Icon(Icons.broken_image_outlined, color: Colors.white54, size: 36),
        ),
      );
    }

    return Container(
      margin: const EdgeInsets.only(top: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (label != null) ...[
            Text(
              label,
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 11.5,
                color: Colors.black54,
              ),
            ),
            const SizedBox(height: 4),
          ],
          InkWell(
            onTap: () => _openFullScreenPhoto(
              bytes: imageBytes,
              url: (imageBytes == null && !trimmed.startsWith('data:image')) ? trimmed : null,
              title: label?.replaceAll(':', '').trim() ?? 'Photo Preview',
            ),
            borderRadius: BorderRadius.circular(8),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Container(
                width: double.infinity,
                height: 180,
                color: const Color(0xFF0F172A),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Center(child: contentWidget),
                    Positioned(
                      bottom: 8,
                      right: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.65),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: Colors.white24, width: 0.8),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.zoom_in, color: Colors.white, size: 14),
                            SizedBox(width: 4),
                            Text(
                              'Tap to zoom',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 11,
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
          ),
        ],
      ),
    );
  }

  Widget _buildLostItemCard(DriverRequest r) {
    final lost = r.lostItem;
    final status = (lost?.status ?? (r.hasLostItemRequest ? 'REPORTED' : ''))
        .toUpperCase();

    if (status.isEmpty) {
      return Container(
        margin: const EdgeInsets.only(bottom: 14),
        decoration: BoxDecoration(
          color: const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFCBD5E1), width: 1.2),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
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
                      color: GtColors.brand.withValues(alpha: 0.12),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.inventory_2_outlined,
                        color: GtColors.brand, size: 22),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Text(
                          'Lost & Found',
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 15,
                            color: Color(0xFF1E293B),
                          ),
                        ),
                        SizedBox(height: 3),
                        Text(
                          'Did you find an item left behind in your vehicle, or do you want to report vehicle check?',
                          style: TextStyle(
                            fontSize: 12.5,
                            color: Color(0xFF64748B),
                            height: 1.35,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: _acting ? null : () => _showFoundDialog(r),
                      icon: const Icon(Icons.add_a_photo_outlined, size: 18),
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
                      icon: const Icon(Icons.search_off, size: 18),
                      label: const Text('Item not in vehicle'),
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
            ],
          ),
        ),
      );
    }

    final isReported = status == 'REPORTED';
    final isFound = status == 'FOUND';
    final isNotFound = status == 'NOT_FOUND';
    final isReturned = status == 'RETURNED';
    final hasChips = (lost?.contactPhone != null &&
            lost!.contactPhone!.trim().isNotEmpty) ||
        !_isTerminal;

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
          'You confirmed locating the item in your vehicle. Coordinate return pickup location and handover.';
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
            color: Colors.black.withValues(alpha: 0.04),
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
                    color: iconColor.withValues(alpha: 0.12),
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
                lost!.itemDescription!.trim().isNotEmpty &&
                !lost.itemDescription!.trim().startsWith('Type:') &&
                lost.itemDescription!.trim() != 'LOST_ITEM') ...[
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: borderColor.withValues(alpha: 0.7)),
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
                      lost.itemDescription!.trim(),
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
            if (lost?.photoUrl != null && lost!.photoUrl!.trim().isNotEmpty)
              _buildPhotoThumbnail(lost.photoUrl, label: 'Found Item Photo:'),
            if (lost?.handoverPhotoUrl != null &&
                lost!.handoverPhotoUrl!.trim().isNotEmpty)
              _buildPhotoThumbnail(lost.handoverPhotoUrl,
                  label: 'Handover Proof Photo:'),
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
                  border: Border.all(color: borderColor.withValues(alpha: 0.7)),
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
            if (isFound || isReturned) ...[
              const SizedBox(height: 10),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: borderColor.withValues(alpha: 0.7)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.location_on_outlined,
                        color: GtColors.brand, size: 20),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Customer Pickup Location:',
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 11.5,
                              color: Colors.black54,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            (lost?.pickupLocation != null &&
                                    lost!.pickupLocation!.trim().isNotEmpty)
                                ? lost.pickupLocation!
                                : 'Waiting for customer to provide pickup location in chat.',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: (lost?.pickupLocation != null &&
                                      lost!.pickupLocation!.trim().isNotEmpty)
                                  ? Colors.black87
                                  : Colors.black45,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (lost?.pickupLocation != null &&
                        lost!.pickupLocation!.trim().isNotEmpty)
                      IconButton(
                        icon: const Icon(Icons.navigation_outlined,
                            size: 18, color: GtColors.brand),
                        onPressed: () => launchUrl(
                          Uri.parse(
                            'https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(lost.pickupLocation!)}',
                          ),
                          mode: LaunchMode.externalApplication,
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFFF0FDF4),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xFF86EFAC)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.payments_outlined,
                        color: Color(0xFF16A34A), size: 20),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Standard Return Fee: CAD \$${(lost?.returnFeeAmount ?? 20.0).toStringAsFixed(2)}',
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 13,
                              color: Color(0xFF15803D),
                            ),
                          ),
                          Text(
                            isReturned
                                ? '✓ Return fee credited to your driver wallet via Stripe.'
                                : (lost?.returnFeePaid == true
                                    ? '✓ Paid by customer via Stripe. Credited to your wallet.'
                                    : 'Return fee compensated to you via Stripe upon return handover.'),
                            style: const TextStyle(
                              fontSize: 11.5,
                              color: Color(0xFF166534),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
            if (hasChips) ...[
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
                  if (!_isTerminal)
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
                      icon: const Icon(Icons.add_a_photo_outlined, size: 18),
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
                      label: const Text('Item not in vehicle'),
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
                label: const Text('Hand Over Item (\$20 Return Fee)'),
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
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: _acting ? null : () => _showFoundDialog(r),
                  icon: const Icon(Icons.search, size: 16),
                  label: const Text('Found item later? Report here'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF334155),
                    side: const BorderSide(color: Color(0xFFCBD5E1)),
                    padding: const EdgeInsets.symmetric(
                      vertical: 11,
                      horizontal: 14,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
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
    String? photoBase64;
    Uint8List? previewBytes;

    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) {
          Future<void> pickPhoto(ImageSource source) async {
            try {
              final picker = ImagePicker();
              final file = await picker.pickImage(
                source: source,
                imageQuality: 80,
                maxWidth: 1024,
              );
              if (file == null) return;
              final bytes = await file.readAsBytes();
              setModalState(() {
                previewBytes = bytes;
                photoBase64 = 'data:image/jpeg;base64,${base64Encode(bytes)}';
              });
            } catch (e) {
              debugPrint('Error picking image: $e');
            }
          }

          return Padding(
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
                        'Report Found Item',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'Let the passenger know you found an item in your vehicle. Attach a photo and description to help identify it.',
                    style: TextStyle(
                        fontSize: 13, color: GtColors.textSecondary, height: 1.35),
                  ),
                  const SizedBox(height: 14),
                  if (previewBytes != null) ...[
                    Stack(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.memory(
                            previewBytes!,
                            height: 150,
                            width: double.infinity,
                            fit: BoxFit.cover,
                          ),
                        ),
                        Positioned(
                          top: 6,
                          right: 6,
                          child: CircleAvatar(
                            radius: 14,
                            backgroundColor: Colors.black54,
                            child: IconButton(
                              padding: EdgeInsets.zero,
                              iconSize: 16,
                              icon: const Icon(Icons.close, color: Colors.white),
                              onPressed: () {
                                setModalState(() {
                                  previewBytes = null;
                                  photoBase64 = null;
                                });
                              },
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                  ] else ...[
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () => pickPhoto(ImageSource.camera),
                            icon: const Icon(Icons.camera_alt_outlined, size: 18),
                            label: const Text('Take Photo'),
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () => pickPhoto(ImageSource.gallery),
                            icon: const Icon(Icons.photo_library_outlined, size: 18),
                            label: const Text('Choose Photo'),
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                  ],
                  TextField(
                    controller: noteCtrl,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      labelText: 'Item description / note for passenger',
                      hintText: 'e.g. Found black wallet on rear right seat floor',
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
          );
        },
      ),
    );

    if (ok == true && mounted) {
      setState(() => _acting = true);
      try {
        await _app?.respondToLostItem(
          rideId: r.id,
          action: 'FOUND',
          note: noteCtrl.text.trim().isEmpty ? null : noteCtrl.text.trim(),
          photoUrl: photoBase64,
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
            SnackBar(content: Text('Error updating inquiry: ${cleanErrorMessage(e)}')),
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
            SnackBar(content: Text('Error updating inquiry: ${cleanErrorMessage(e)}')),
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
    String? handoverPhotoBase64;
    Uint8List? handoverPreviewBytes;

    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) {
          Future<void> pickPhoto(ImageSource source) async {
            try {
              final picker = ImagePicker();
              final file = await picker.pickImage(
                source: source,
                imageQuality: 80,
                maxWidth: 1024,
              );
              if (file == null) return;
              final bytes = await file.readAsBytes();
              setModalState(() {
                handoverPreviewBytes = bytes;
                handoverPhotoBase64 = 'data:image/jpeg;base64,${base64Encode(bytes)}';
              });
            } catch (e) {
              debugPrint('Error picking image: $e');
            }
          }

          return Padding(
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
                        'Hand Over Item',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'Upload a picture handing over the item as proof of return. A standard return fee of \$20.00 CAD will be credited to your driver wallet.',
                    style: TextStyle(
                        fontSize: 13, color: GtColors.textSecondary, height: 1.35),
                  ),
                  const SizedBox(height: 14),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF0FDF4),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: const Color(0xFF86EFAC)),
                    ),
                    child: Row(
                      children: const [
                        Icon(Icons.payments_outlined, color: Color(0xFF16A34A), size: 22),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Return Fee: CAD \$20.00 will be credited to your wallet via Stripe.',
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 12.5,
                              color: Color(0xFF14532D),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  const Text(
                    'Handover Picture Proof (Required):',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                      color: Colors.black87,
                    ),
                  ),
                  const SizedBox(height: 6),
                  if (handoverPreviewBytes != null) ...[
                    Stack(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.memory(
                            handoverPreviewBytes!,
                            height: 150,
                            width: double.infinity,
                            fit: BoxFit.cover,
                          ),
                        ),
                        Positioned(
                          top: 6,
                          right: 6,
                          child: CircleAvatar(
                            radius: 14,
                            backgroundColor: Colors.black54,
                            child: IconButton(
                              padding: EdgeInsets.zero,
                              iconSize: 16,
                              icon: const Icon(Icons.close, color: Colors.white),
                              onPressed: () {
                                setModalState(() {
                                  handoverPreviewBytes = null;
                                  handoverPhotoBase64 = null;
                                });
                              },
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                  ] else ...[
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () => pickPhoto(ImageSource.camera),
                            icon: const Icon(Icons.camera_alt_outlined, size: 18),
                            label: const Text('Take Picture'),
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () => pickPhoto(ImageSource.gallery),
                            icon: const Icon(Icons.photo_library_outlined, size: 18),
                            label: const Text('Choose Picture'),
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                  ],
                  TextField(
                    controller: noteCtrl,
                    maxLines: 2,
                    decoration: const InputDecoration(
                      labelText: 'Handover note (optional)',
                      hintText: 'e.g. Handed to customer at airport terminal',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 18),
                  GtGreenButton(
                    label: 'Confirm Handover & Settle Fee',
                    onPressed: () {
                      if (handoverPhotoBase64 == null) {
                        ScaffoldMessenger.of(ctx).showSnackBar(
                          const SnackBar(
                            content: Text('Please upload a picture as handover proof.'),
                          ),
                        );
                        return;
                      }
                      Navigator.pop(ctx, true);
                    },
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
          );
        },
      ),
    );

    if (ok == true && mounted) {
      setState(() => _acting = true);
      try {
        await _app?.markLostItemReturned(
          rideId: r.id,
          note: noteCtrl.text.trim().isEmpty ? null : noteCtrl.text.trim(),
          handoverPhotoUrl: handoverPhotoBase64,
        );
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                  'Item handed over! \$20.00 return fee has been credited to your wallet.'),
            ),
          );
          await _load();
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error completing return: ${cleanErrorMessage(e)}')),
          );
        }
      } finally {
        if (mounted) setState(() => _acting = false);
      }
    }
    noteCtrl.dispose();
  }

  void _startWaitingTimer() {
    _arrivedTimestamp ??= DateTime.now();
    _checkDriverProximity();
    _waitCountdownTimer?.cancel();
    _waitCountdownTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {});
    });
  }

  Future<void> _checkDriverProximity() async {
    final r = _ride;
    if (r?.fromLat == null || r?.fromLng == null) return;
    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 4),
        ),
      );
      if (!mounted) return;
      final distMeters = Geolocator.distanceBetween(
        pos.latitude,
        pos.longitude,
        r!.fromLat!,
        r.fromLng!,
      );
      setState(() {
        _currentPosition = pos;
        _driverDistanceMeters = distMeters;
      });
    } catch (_) {
      try {
        final last = await Geolocator.getLastKnownPosition();
        if (last != null && mounted && r != null) {
          final distMeters = Geolocator.distanceBetween(
            last.latitude,
            last.longitude,
            r.fromLat!,
            r.fromLng!,
          );
          setState(() {
            _currentPosition = last;
            _driverDistanceMeters = distMeters;
          });
        }
      } catch (_) {}
    }
  }

  WaitingCategoryInfo _getWaitingCategoryInfo(DriverRequest r) {
    if (r.flight != null && r.flight!.trim().isNotEmpty) {
      return const WaitingCategoryInfo(
        category: 'Flight Tracking',
        badgeLabel: '✈️ Flight tracking (60 min wait · Delay tracked up to 7h)',
        allowedMinutes: 60,
      );
    }
    final from = r.from.toLowerCase();
    final isAirportOrPort = RegExp(
      r'(airport|aeroport|airfield|aerodrome|terminal|cruise|port\b|harbour|harbor|dock|pier|ferry)',
      caseSensitive: false,
    ).hasMatch(from);
    if (isAirportOrPort) {
      return const WaitingCategoryInfo(
        category: 'Airports and Cruise Ports',
        badgeLabel: '✈️ Airports and cruise ports (60 min wait)',
        allowedMinutes: 60,
      );
    }
    final isTrainStation = RegExp(
      r'(station|train|railway|rail|gare\b|amtrak|via rail|subway|metro)',
      caseSensitive: false,
    ).hasMatch(from);
    if (isTrainStation) {
      return const WaitingCategoryInfo(
        category: 'Train Stations',
        badgeLabel: '🚆 Train stations (30 min wait)',
        allowedMinutes: 30,
      );
    }
    if (r.pickupWaitMin != null && r.pickupWaitMin! <= 5) {
      return WaitingCategoryInfo(
        category: 'Urgent Transfers',
        badgeLabel: '⚡ Urgent transfers (${r.pickupWaitMin} min wait)',
        allowedMinutes: r.pickupWaitMin!,
      );
    }
    final mins = r.pickupWaitMin ?? 15;
    return WaitingCategoryInfo(
      category: 'Other Places',
      badgeLabel: '🕒 Other places ($mins min wait)',
      allowedMinutes: mins,
    );
  }

  Duration _calculateRemainingWait(DriverRequest r) {
    final info = _getWaitingCategoryInfo(r);
    final allowedMin = info.allowedMinutes;
    final scheduledPickup = r.pickupAt;
    final arrived = _arrivedTimestamp ?? DateTime.now();
    final effectiveStart =
        (scheduledPickup != null && scheduledPickup.isAfter(arrived))
            ? scheduledPickup
            : arrived;
    final waitEndTime = effectiveStart.add(Duration(minutes: allowedMin));
    final diff = waitEndTime.difference(DateTime.now());
    return diff.isNegative ? Duration.zero : diff;
  }

  Widget _buildWaitingForPassengerCard(DriverRequest r) {
    final waitInfo = _getWaitingCategoryInfo(r);
    final remaining = _calculateRemainingWait(r);
    final isTimerDone = remaining == Duration.zero;

    final isAtPickup = (_driverDistanceMeters != null && _driverDistanceMeters! <= 500) ||
        r.fromLat == null;
    const isArrived = true;
    final isContactDone = _contactAttemptMade;

    final minutesStr = remaining.inMinutes.toString().padLeft(2, '0');
    final secondsStr = (remaining.inSeconds % 60).toString().padLeft(2, '0');

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isTimerDone ? GtColors.brand : Colors.amber.shade400,
          width: 1.5,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                isTimerDone ? Icons.check_circle : Icons.hourglass_top_rounded,
                color: isTimerDone ? GtColors.brand : Colors.amber.shade800,
                size: 22,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  isTimerDone
                      ? 'Waiting Period Complete'
                      : 'Waiting for Passenger',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: isTimerDone
                      ? GtColors.brand.withValues(alpha: 0.1)
                      : Colors.amber.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  isTimerDone ? 'COMPLETED' : '$minutesStr:$secondsStr',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                    color: isTimerDone ? GtColors.brand : Colors.amber.shade900,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.grey.shade100,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    waitInfo.badgeLabel,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Colors.grey.shade800,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          const Text(
            'Section 9 No-Show Checkpoints:',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: Colors.black54,
            ),
          ),
          const SizedBox(height: 8),
          _buildCheckItem(
            label: isAtPickup
                ? 'Reached pickup location (${_driverDistanceMeters != null ? "${_driverDistanceMeters!.round()}m away" : "verified"})'
                : 'Move closer to pickup location (${_driverDistanceMeters != null ? "${_driverDistanceMeters!.round()}m away, limit 500m" : "GPS check pending"})',
            isComplete: isAtPickup,
            onActionTap: _checkDriverProximity,
            actionLabel: 'Check GPS',
          ),
          const SizedBox(height: 6),
          _buildCheckItem(
            label: 'Driver marked Arrived',
            isComplete: isArrived,
          ),
          const SizedBox(height: 6),
          _buildCheckItem(
            label: isContactDone
                ? 'Reasonable contact attempt verified'
                : 'Attempt contact with passenger',
            isComplete: isContactDone,
            actionLabel: _isTerminal ? null : 'Chat with passenger',
            onActionTap: _isTerminal
                ? null
                : () {
                    setState(() => _contactAttemptMade = true);
                    context.read<AppState>().recordContactAttempt(r.id, method: 'CHAT');
                    context.push('/chat/${r.id}');
                  },
          ),
          const SizedBox(height: 6),
          _buildCheckItem(
            label: isTimerDone
                ? 'Required waiting period elapsed (${waitInfo.allowedMinutes} min)'
                : 'Waiting period in progress ($minutesStr:$secondsStr remaining)',
            isComplete: isTimerDone,
          ),
        ],
      ),
    );
  }

  Widget _buildCheckItem({
    required String label,
    required bool isComplete,
    String? actionLabel,
    VoidCallback? onActionTap,
  }) {
    return Row(
      children: [
        Icon(
          isComplete ? Icons.check_circle : Icons.radio_button_unchecked,
          size: 18,
          color: isComplete ? GtColors.brand : Colors.grey.shade400,
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12.5,
              color: isComplete ? Colors.black87 : Colors.black54,
              fontWeight: isComplete ? FontWeight.w600 : FontWeight.normal,
            ),
          ),
        ),
        if (!isComplete && actionLabel != null && onActionTap != null)
          TextButton(
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            onPressed: onActionTap,
            child: Text(
              actionLabel,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: GtColors.brand,
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildNoShowButton(DriverRequest r) {
    final remaining = _calculateRemainingWait(r);
    final isTimerDone = remaining == Duration.zero;
    final isAtPickup = (_driverDistanceMeters != null && _driverDistanceMeters! <= 500) ||
        r.fromLat == null;
    final isContactDone = _contactAttemptMade;
    final canDeclareNoShow = isTimerDone && isAtPickup && isContactDone;

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        OutlinedButton.icon(
          onPressed: canDeclareNoShow && !_acting ? _promptPassengerNoShow : null,
          style: OutlinedButton.styleFrom(
            foregroundColor: canDeclareNoShow ? Colors.amber.shade900 : Colors.grey.shade500,
            side: BorderSide(
              color: canDeclareNoShow ? Colors.amber.shade800 : Colors.grey.shade300,
            ),
            padding: const EdgeInsets.symmetric(vertical: 12),
          ),
          icon: Icon(
            canDeclareNoShow ? Icons.person_off_outlined : Icons.lock_outline,
            size: 18,
          ),
          label: Text(
            canDeclareNoShow
                ? 'Declare Passenger No-Show'
                : 'Passenger No-Show (Locked)',
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
        if (!canDeclareNoShow)
          Padding(
            padding: const EdgeInsets.only(top: 4, bottom: 2),
            child: Text(
              !isTimerDone
                  ? 'Waiting timer must elapse before declaring No-Show'
                  : !isContactDone
                      ? 'Please attempt to contact passenger (Chat / Call) first'
                      : 'Must be within 500m of pickup location to declare No-Show',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 11,
                color: Colors.grey.shade600,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
      ],
    );
  }

  Future<void> _promptPassengerNoShow() async {
    final r = _ride;
    if (r == null) return;
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => _PassengerNoShowSheet(
        ride: r,
        currentPosition: _currentPosition,
        distanceMeters: _driverDistanceMeters,
        arrivedTimestamp: _arrivedTimestamp,
        contactAttemptMade: _contactAttemptMade,
      ),
    );

    if (confirmed == true && mounted) {
      setState(() => _acting = true);
      try {
        await context.read<AppState>().tripNoShow(
              widget.rideId,
              lat: _currentPosition?.latitude,
              lng: _currentPosition?.longitude,
              contactMethod: _contactAttemptMade ? 'CHAT' : null,
            );
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Passenger marked No-Show. Compensation has been credited to your wallet.',
              ),
              backgroundColor: GtColors.brand,
            ),
          );
          await _load();
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('No-Show failed: ${cleanErrorMessage(e)}'),
              backgroundColor: Colors.red,
            ),
          );
        }
      } finally {
        if (mounted) setState(() => _acting = false);
      }
    }
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

class _StartPinSheet extends StatefulWidget {
  const _StartPinSheet({
    required this.rideId,
    required this.appState,
  });

  final String rideId;
  final AppState appState;

  @override
  State<_StartPinSheet> createState() => _StartPinSheetState();
}

class _StartPinSheetState extends State<_StartPinSheet> {
  final TextEditingController _pinController = TextEditingController();
  GtOtpStatus _status = GtOtpStatus.idle;
  String? _errorMsg;
  bool _submitting = false;

  @override
  void dispose() {
    _pinController.dispose();
    super.dispose();
  }

  Future<void> _submitPin(String pin) async {
    if (_submitting || pin.trim().length != 4) return;
    setState(() {
      _submitting = true;
      _errorMsg = null;
      _status = GtOtpStatus.idle;
    });

    try {
      await widget.appState.tripStart(widget.rideId, pin: pin.trim());
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      final msg = cleanErrorMessage(e);
      final lowerMsg = msg.toLowerCase();
      // If the trip is already started or in progress, pop the sheet to refresh screen
      if (lowerMsg.contains('already in progress') ||
          lowerMsg.contains('in_progress') ||
          lowerMsg.contains('trip_started') ||
          lowerMsg.contains('trip is already')) {
        Navigator.of(context).pop(true);
        return;
      }
      setState(() {
        _submitting = false;
        _status = GtOtpStatus.error;
        _errorMsg = msg.contains('Invalid ride PIN')
            ? 'Incorrect PIN. Please ask the passenger for their 4-digit ride PIN.'
            : msg;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Container(
      padding: EdgeInsets.fromLTRB(24, 20, 24, bottomInset + 24),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: GtColors.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: GtColors.soft,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.pin_outlined,
                  color: GtColors.brand,
                  size: 24,
                ),
              ),
              const SizedBox(width: 14),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Enter Ride PIN',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: GtColors.text,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Ask the passenger for their 4-digit PIN',
                      style: TextStyle(
                        fontSize: 13,
                        color: GtColors.textSecondary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close, color: GtColors.textMuted),
                onPressed: () => Navigator.of(context).pop(false),
              ),
            ],
          ),
          const SizedBox(height: 24),
          GtOtpInput(
            length: 4,
            controller: _pinController,
            autofocus: true,
            status: _status,
            enabled: !_submitting,
            onChanged: (val) {
              if (_errorMsg != null) {
                setState(() {
                  _errorMsg = null;
                  _status = GtOtpStatus.idle;
                });
              }
            },
            onCompleted: (val) => _submitPin(val),
          ),
          if (_errorMsg != null) ...[
            const SizedBox(height: 12),
            Text(
              _errorMsg!,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: GtColors.brand,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          const SizedBox(height: 24),
          GtGreenButton(
            label: _submitting ? 'Verifying...' : 'Start ride',
            onPressed: _submitting
                ? null
                : () => _submitPin(_pinController.text),
          ),
        ],
      ),
    );
  }
}

class WaitingCategoryInfo {
  const WaitingCategoryInfo({
    required this.category,
    required this.badgeLabel,
    required this.allowedMinutes,
  });

  final String category;
  final String badgeLabel;
  final int allowedMinutes;
}

class _PassengerNoShowSheet extends StatelessWidget {
  const _PassengerNoShowSheet({
    required this.ride,
    this.currentPosition,
    this.distanceMeters,
    this.arrivedTimestamp,
    this.contactAttemptMade = false,
  });

  final DriverRequest ride;
  final Position? currentPosition;
  final double? distanceMeters;
  final DateTime? arrivedTimestamp;
  final bool contactAttemptMade;

  @override
  Widget build(BuildContext context) {
    final distStr = distanceMeters != null
        ? '${distanceMeters!.round()} meters from pickup'
        : 'GPS proximity verified';

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(
        20,
        16,
        20,
        20 + MediaQuery.paddingOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.amber.shade100,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.person_off_outlined,
                  color: Colors.amber.shade900,
                  size: 26,
                ),
              ),
              const SizedBox(width: 14),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Declare Passenger No-Show',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Section 9 Compliance Verification',
                      style: TextStyle(fontSize: 13, color: Colors.black54),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.grey.shade50,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.grey.shade200),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Captured Evidence:',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                ),
                const SizedBox(height: 8),
                _evidenceRow(Icons.pin_drop_outlined, 'Location', distStr),
                _evidenceRow(
                  Icons.timer_outlined,
                  'Arrival',
                  arrivedTimestamp != null
                      ? '${arrivedTimestamp!.hour.toString().padLeft(2, '0')}:${arrivedTimestamp!.minute.toString().padLeft(2, '0')}'
                      : 'Recorded',
                ),
                _evidenceRow(
                  Icons.chat_outlined,
                  'Contact',
                  contactAttemptMade ? 'Attempted via Chat / Call' : 'Recorded',
                ),
                _evidenceRow(
                  Icons.hourglass_bottom_outlined,
                  'Waiting Time',
                  'Full required period elapsed',
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.blue.shade50,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.blue.shade100),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline, size: 20, color: Colors.blue.shade800),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'The passenger will not receive a refund. Your provider compensation will be credited directly to your wallet.',
                    style: TextStyle(
                      fontSize: 12.5,
                      color: Colors.blue.shade900,
                      height: 1.35,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('Back'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.amber.shade800,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  onPressed: () => Navigator.of(context).pop(true),
                  child: const Text(
                    'Confirm No-Show',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _evidenceRow(IconData icon, String label, String val) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Icon(icon, size: 16, color: Colors.black54),
          const SizedBox(width: 8),
          Text(
            '$label: ',
            style: const TextStyle(fontSize: 12.5, color: Colors.black54),
          ),
          Expanded(
            child: Text(
              val,
              style: const TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: Colors.black87,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
