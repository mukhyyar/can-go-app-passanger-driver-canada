import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

class RideDetailScreen extends StatefulWidget {
  const RideDetailScreen({super.key, required this.rideId});

  final String rideId;

  @override
  State<RideDetailScreen> createState() => _RideDetailScreenState();
}

class _RideDetailScreenState extends State<RideDetailScreen> {
  bool _loading = true;
  Map<String, dynamic>? _paymentStatus;
  bool _ratingPromptShown = false;
  bool _alreadyRated = false;
  int? _myRatingStars;
  bool _actionBusy = false;
  Map<String, dynamic>? _tracking;
  Timer? _trackingPoll;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _trackingPoll?.cancel();
    super.dispose();
  }

  void _ensureTrackingPoll() {
    _trackingPoll?.cancel();
    if (!_isLiveTrackStatus(_serverStatus)) return;
    unawaited(_refreshTracking());
    _trackingPoll = Timer.periodic(const Duration(seconds: 5), (_) {
      if (mounted) unawaited(_refreshTracking());
    });
  }

  bool _isLiveTrackStatus(String status) {
    const live = {
      'DRIVER_EN_ROUTE',
      'DRIVER_ARRIVED',
      'TRIP_STARTED',
      'IN_PROGRESS',
    };
    return live.contains(status);
  }

  Future<void> _refreshTracking() async {
    try {
      final app = context.read<AppState>();
      final t = await app.getRideTracking(widget.rideId);
      if (mounted) setState(() => _tracking = t);
      await app.refreshRide(widget.rideId);
      if (!_isLiveTrackStatus(_serverStatus)) {
        _trackingPoll?.cancel();
        _trackingPoll = null;
      }
    } catch (_) {}
  }

  Future<void> _load() async {
    final app = context.read<AppState>();
    await app.refreshRide(widget.rideId);
    Map<String, dynamic>? payment;
    Map<String, dynamic>? myRating;
    try {
      payment = await app.getPaymentStatus(widget.rideId);
    } catch (_) {}
    try {
      final ride = app.rideById(widget.rideId);
      final isCompleted =
          (ride?.serverStatus ?? '').toUpperCase() == 'COMPLETED' ||
              ride?.status == RideStatus.past;
      if (isCompleted) {
        myRating = await app.myRideRating(widget.rideId);
      }
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _paymentStatus = payment;
      _loading = false;
      if (myRating != null) {
        _alreadyRated = true;
        final s = myRating['stars'];
        _myRatingStars = s is int ? s : int.tryParse('$s');
      }
    });
    _ensureTrackingPoll();
    _maybeShowRating();
  }


  void _maybeShowRating() {
    if (_ratingPromptShown || _alreadyRated || !mounted) return;
    final ride = context.read<AppState>().rideById(widget.rideId);
    final isCompleted =
        (ride?.serverStatus ?? '').toUpperCase() == 'COMPLETED' ||
            ride?.status == RideStatus.past;
    if (!isCompleted) return;
    _ratingPromptShown = true;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      final app = context.read<AppState>();
      if (!_alreadyRated) {
        try {
          final myRating = await app.myRideRating(widget.rideId);
          if (!mounted) return;
          if (myRating != null) {
            setState(() {
              _alreadyRated = true;
              final s = myRating['stars'];
              _myRatingStars = s is int ? s : int.tryParse('$s');
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

  String get _serverStatus {
    final ride = context.read<AppState>().rideById(widget.rideId);
    return (ride?.serverStatus ?? '').toUpperCase();
  }

  bool get _canChat {
    final ride = context.read<AppState>().rideById(widget.rideId);
    if (ride?.hasReportedRide == true ||
        ride?.hasLostItemRequest == true ||
        ride?.hasActiveSupport == true) {
      return true;
    }
    const allowed = {
      'BOOKED',
      'DRIVER_EN_ROUTE',
      'DRIVER_ARRIVED',
      'TRIP_STARTED',
      'IN_PROGRESS',
    };
    return allowed.contains(_serverStatus);
  }

  bool get _canCancel {
    const allowed = {
      'BOOKED',
      'DRIVER_EN_ROUTE',
      'DRIVER_ARRIVED',
      'WAITING_FOR_OFFERS',
      'OFFER_SELECTION',
      'PAYMENT_PENDING',
    };
    return allowed.contains(_serverStatus);
  }

  bool get _canEdit {
    return _serverStatus == 'WAITING_FOR_OFFERS' ||
        _serverStatus == 'OFFER_SELECTION';
  }

  bool get _isOngoing {
    const ongoing = {
      'DRIVER_EN_ROUTE',
      'DRIVER_ARRIVED',
      'TRIP_STARTED',
      'IN_PROGRESS',
    };
    return ongoing.contains(_serverStatus);
  }

  Future<void> _confirmCancel() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel ride?'),
        content: const Text(
          'Are you sure you want to cancel this ride? Cancellation fees may apply.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep ride'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Cancel ride'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _actionBusy = true);
    try {
      await context.read<AppState>().cancelRide(widget.rideId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Ride cancelled')),
        );
        await _load();
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not cancel ride')),
        );
      }
    } finally {
      if (mounted) setState(() => _actionBusy = false);
    }
  }

  Future<void> _showRatingSheet() async {
    if (_alreadyRated) return;
    var overall = 5;
    var communication = 5;
    var driver = 5;
    var vehicle = 5;
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
          builder: (ctx, setLocal) {
            Widget starRow({
              required String label,
              required int value,
              required ValueChanged<int> onChanged,
              double iconSize = 28,
            }) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        label,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                        ),
                      ),
                    ),
                    ...List.generate(5, (i) {
                      final filled = i < value;
                      return IconButton(
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(
                          minWidth: 36,
                          minHeight: 36,
                        ),
                        icon: Icon(
                          filled ? Icons.star : Icons.star_border,
                          color: GtColors.warn,
                          size: iconSize,
                        ),
                        onPressed: () => onChanged(i + 1),
                      );
                    }),
                  ],
                ),
              );
            }

            return SingleChildScrollView(
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
                    'Rate your trip',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Help others by rating communication, driver, and vehicle.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: GtColors.textSecondary,
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Overall',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(5, (i) {
                      final filled = i < overall;
                      return IconButton(
                        icon: Icon(
                          filled ? Icons.star : Icons.star_border,
                          color: GtColors.warn,
                          size: 36,
                        ),
                        onPressed: () => setLocal(() {
                          final newOverall = i + 1;
                          if (overall != newOverall) {
                            overall = newOverall;
                            selectedSuggestions.clear();
                            commentCtrl.clear();
                          }
                        }),
                      );
                    }),
                  ),
                  const Divider(height: 24),
                  starRow(
                    label: 'Communication',
                    value: communication,
                    onChanged: (v) => setLocal(() => communication = v),
                  ),
                  starRow(
                    label: 'Driver',
                    value: driver,
                    onChanged: (v) => setLocal(() => driver = v),
                  ),
                  starRow(
                    label: 'Vehicle',
                    value: vehicle,
                    onChanged: (v) => setLocal(() => vehicle = v),
                  ),
                  const SizedBox(height: 12),
                  GtReviewSuggestions(
                    target: ReviewTarget.driver,
                    stars: overall,
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
                      hintText: 'How was your experience? (optional)',
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
            );
          },
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
            stars: overall,
            communicationStars: communication,
            driverStars: driver,
            vehicleStars: vehicle,
            comment: commentText,
          );

      if (mounted) {
        setState(() {
          _alreadyRated = true;
          _myRatingStars = overall;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Thanks for your feedback')),
        );
        final currentRide = context.read<AppState>().rideById(widget.rideId);
        if ((currentRide?.tipAmount ?? 0) <= 0) {
          Future.delayed(const Duration(milliseconds: 400), () {
            if (mounted) _showTipSheet();
          });
        }
      }
    } catch (e) {
      if (!mounted) return;
      final msg = e.toString().toLowerCase();
      if (msg.contains('already rated')) {
        setState(() {
          _alreadyRated = true;
          _myRatingStars ??= overall;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('You already rated this ride')),
        );
      } else {
        String displayMsg = 'Could not submit rating';
        if (e is ApiException && e.message.trim().isNotEmpty) {
          displayMsg = e.message.trim();
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(displayMsg)),
        );
      }
    }
  }

  Future<void> _showReportSheet() async {
    final app = context.read<AppState>();
    final ride = app.rideById(widget.rideId);
    if (ride == null) return;

    final submitted = await showGtReportBottomSheet(
      context: context,
      target: ReportTarget.driver,
      onSubmit: (reasons, details) async {
        await app.reportRide(
          ride.id,
          reasons: reasons,
          details: details,
        );
      },
    );

    if (submitted == true && mounted) {
      await app.refreshRide(widget.rideId);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text(
            'Report submitted. Admin notified & support chat enabled.',
          ),
          backgroundColor: GtColors.brand,
          action: SnackBarAction(
            label: 'Open Chat',
            textColor: Colors.white,
            onPressed: () => context.push('/ride/${widget.rideId}/chat'),
          ),
        ),
      );
      setState(() {});
    }
  }

  Future<void> _showShareSheet(RideRequest ride) async {
    final app = context.read<AppState>();
    setState(() => _actionBusy = true);

    String? shareUrl = ride.shareUrl;

    try {
      if (shareUrl == null || shareUrl.isEmpty) {
        final res = await app.createRideShareLink(ride.id);
        shareUrl = res['shareUrl']?.toString();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to generate share link: $e')),
        );
      }
      if (mounted) setState(() => _actionBusy = false);
      return;
    } finally {
      if (mounted) setState(() => _actionBusy = false);
    }

    if (!mounted || shareUrl == null) return;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) {
          return Container(
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            ),
            padding: EdgeInsets.fromLTRB(
              20,
              12,
              20,
              24 + MediaQuery.viewInsetsOf(ctx).bottom,
            ),
            child: SingleChildScrollView(
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
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: GtColors.brand.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(
                          Icons.share_location_rounded,
                          color: GtColors.brand,
                          size: 26,
                        ),
                      ),
                      const SizedBox(width: 14),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Share trip with friend',
                              style: TextStyle(
                                fontSize: 19,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            SizedBox(height: 2),
                            Text(
                              'Friends follow your ride live on the web',
                              style: TextStyle(
                                fontSize: 13,
                                color: GtColors.textSecondary,
                              ),
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
                      color: const Color(0xFFF9FAFB),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: GtColors.border),
                    ),
                    child: const Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(Icons.shield_outlined, size: 16, color: GtColors.brand),
                            SizedBox(width: 6),
                            Text(
                              'What your friend will see:',
                              style: TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700,
                                color: GtColors.text,
                              ),
                            ),
                          ],
                        ),
                        SizedBox(height: 8),
                        Text(
                          '• Live vehicle GPS location on map & real-time ETA\n'
                          '• Driver name, rating, vehicle make/model & license plate\n'
                          '• Pickup point and destination addresses',
                          style: TextStyle(
                            fontSize: 12,
                            color: GtColors.textSecondary,
                            height: 1.45,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (shareUrl != null) ...[
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: GtColors.bgGrey,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: GtColors.border),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              shareUrl!,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                                color: GtColors.text,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          TextButton.icon(
                            onPressed: () {
                              Clipboard.setData(ClipboardData(text: shareUrl!));
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text('Trip share link copied to clipboard!'),
                                  backgroundColor: GtColors.brand,
                                ),
                              );
                            },
                            icon: const Icon(Icons.copy_rounded, size: 16),
                            label: const Text('Copy'),
                            style: TextButton.styleFrom(
                              foregroundColor: GtColors.brand,
                              padding: const EdgeInsets.symmetric(horizontal: 8),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    GtGreenButton(
                      label: 'Copy & Share link',
                      icon: Icons.share_rounded,
                      onPressed: () {
                        Clipboard.setData(ClipboardData(text: 'Follow my CAN-RIDE trip live: $shareUrl'));
                        Navigator.pop(ctx);
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Tracking link copied! Share with your friend via SMS or chat.'),
                            backgroundColor: GtColors.brand,
                          ),
                        );
                      },
                    ),
                    const SizedBox(height: 10),
                    TextButton(
                      onPressed: () async {
                        try {
                          await app.revokeRideShareLink(ride.id);
                          setLocal(() {
                            shareUrl = null;
                          });
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Live trip share link revoked.'),
                              ),
                            );
                          }
                        } catch (e) {
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('Could not revoke link: $e')),
                            );
                          }
                        }
                      },
                      child: const Text(
                        'Stop sharing this trip',
                        style: TextStyle(
                          color: Colors.red,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ] else ...[
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 12),
                      child: Text(
                        'Sharing is currently stopped for this ride.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 13,
                          color: GtColors.textSecondary,
                        ),
                      ),
                    ),
                    GtGreenButton(
                      label: 'Generate new share link',
                      onPressed: () async {
                        try {
                          final res = await app.createRideShareLink(ride.id);
                          setLocal(() {
                            shareUrl = res['shareUrl']?.toString();
                          });
                        } catch (e) {
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('Error: $e')),
                            );
                          }
                        }
                      },
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _showTipSheet() async {
    final ride = context.read<AppState>().rideById(widget.rideId);
    final currency = ride?.currency ?? 'CAD';
    var selectedPreset = 5.0;
    var isCustom = false;
    final customCtrl = TextEditingController();

    final submitted = await showGtSheet<double>(
      context: context,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          12,
          20,
          20 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: StatefulBuilder(
          builder: (ctx, setLocal) {
            Widget tipChip({required double amount, required String label}) {
              final isSelected = !isCustom && (selectedPreset - amount).abs() < 0.01;
              return Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () => setLocal(() {
                      isCustom = false;
                      selectedPreset = amount;
                      customCtrl.clear();
                    }),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      decoration: BoxDecoration(
                        color: isSelected ? GtColors.brand : GtColors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: isSelected ? GtColors.brand : GtColors.border,
                          width: isSelected ? 2 : 1,
                        ),
                      ),
                      child: Text(
                        label,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: isSelected ? Colors.white : GtColors.text,
                        ),
                      ),
                    ),
                  ),
                ),
              );
            }

            final currentAmount = isCustom
                ? (double.tryParse(customCtrl.text.replaceAll(RegExp(r'[^0-9.]'), '')) ?? 0.0)
                : selectedPreset;

            return SingleChildScrollView(
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
                    'Tip your driver',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    '100% of your tip goes to your driver. Thank you for your support!',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: GtColors.textSecondary,
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      tipChip(amount: 2.0, label: '\$2'),
                      tipChip(amount: 5.0, label: '\$5'),
                      tipChip(amount: 10.0, label: '\$10'),
                      tipChip(amount: 15.0, label: '\$15'),
                    ],
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: customCtrl,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: InputDecoration(
                      prefixText: '\$ ',
                      hintText: 'Other custom amount',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    ),
                    onChanged: (val) {
                      setLocal(() {
                        isCustom = val.trim().isNotEmpty;
                      });
                    },
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: GtColors.bgGrey,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.lock_outline, size: 16, color: GtColors.textSecondary),
                        SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            'Payment processed securely through Stripe',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 12,
                              color: GtColors.textSecondary,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  GtGreenButton(
                    label: currentAmount > 0
                        ? 'Pay CA\$${currentAmount.toStringAsFixed(2)} tip'
                        : 'Select tip amount',
                    onPressed: currentAmount >= 0.50
                        ? () => Navigator.pop(ctx, currentAmount)
                        : null,
                  ),
                  TextButton(
                    onPressed: () => Navigator.pop(ctx, null),
                    child: const Text('No thanks'),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
    customCtrl.dispose();

    if (submitted == null || submitted < 0.50 || !mounted) return;

    setState(() => _actionBusy = true);
    try {
      final app = context.read<AppState>();
      await app.tipRide(widget.rideId, amount: submitted, paymentMethod: 'CARD');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Thank you! Tip of $currency ${submitted.toStringAsFixed(2)} sent to driver.',
            ),
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to process tip: $e')),
      );
    } finally {
      if (mounted) setState(() => _actionBusy = false);
    }
  }

  Future<void> _submitChangeRequest({
    required String type,
    String? proposedPickupAt,
    String? note,
    String? flightNumber,
    String? contactPhone,
  }) async {
    setState(() => _actionBusy = true);
    try {
      await context.read<AppState>().createChangeRequest(
            widget.rideId,
            type: type,
            proposedPickupAt: proposedPickupAt,
            note: note,
            flightNumber: flightNumber,
            contactPhone: contactPhone,
          );
      if (mounted) {
        await context.read<AppState>().refreshRide(widget.rideId);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              type == 'LOST_ITEM'
                  ? 'Driver notified to check vehicle for lost items'
                  : 'Help request submitted. Admin notified & support chat enabled.',
            ),
            action: type == 'LOST_ITEM'
                ? null
                : SnackBarAction(
                    label: 'Open Chat',
                    textColor: Colors.white,
                    onPressed: () =>
                        context.push('/ride/${widget.rideId}/chat'),
                  ),
          ),
        );
        setState(() {});
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not submit request')),
        );
      }
    } finally {
      if (mounted) setState(() => _actionBusy = false);
    }
  }

  Future<void> _showFlightDelayForm() async {
    final flightCtrl = TextEditingController();
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
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Report flight delay',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: flightCtrl,
              decoration: const InputDecoration(
                labelText: 'Flight number',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: noteCtrl,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Details (optional)',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            GtGreenButton(
              label: 'Submit',
              onPressed: () => Navigator.pop(ctx, true),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
    if (ok == true) {
      await _submitChangeRequest(
        type: 'FLIGHT_DELAY',
        flightNumber: flightCtrl.text.trim().isEmpty
            ? null
            : flightCtrl.text.trim(),
        note: noteCtrl.text.trim().isEmpty ? null : noteCtrl.text.trim(),
      );
    }
    flightCtrl.dispose();
    noteCtrl.dispose();
  }

  Future<void> _showRescheduleForm() async {
    DateTime picked = DateTime.now().add(const Duration(hours: 2));
    final noteCtrl = TextEditingController();
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(ctx).viewInsets.bottom,
            left: 20,
            right: 20,
            top: 20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Request reschedule',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(_formatPickup(picked)),
                trailing: const Icon(Icons.calendar_today),
                onTap: () async {
                  final date = await showDatePicker(
                    context: ctx,
                    initialDate: picked,
                    firstDate: DateTime.now(),
                    lastDate: DateTime.now().add(const Duration(days: 365)),
                  );
                  if (date == null) return;
                  if (!ctx.mounted) return;
                  final time = await showTimePicker(
                    context: ctx,
                    initialTime: TimeOfDay.fromDateTime(picked),
                  );
                  if (time == null) return;
                  setLocal(() {
                    picked = DateTime(
                      date.year,
                      date.month,
                      date.day,
                      time.hour,
                      time.minute,
                    );
                  });
                },
              ),
              const SizedBox(height: 8),
              TextField(
                controller: noteCtrl,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Note (optional)',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              GtGreenButton(
                label: 'Submit',
                onPressed: () => Navigator.pop(ctx, true),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
    if (ok == true) {
      await _submitChangeRequest(
        type: 'RESCHEDULE',
        proposedPickupAt: picked.toUtc().toIso8601String(),
        note: noteCtrl.text.trim().isEmpty ? null : noteCtrl.text.trim(),
      );
    }
    noteCtrl.dispose();
  }

  Future<void> _showHelpForm(String type, String title) async {
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
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              title,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: noteCtrl,
              maxLines: 4,
              decoration: const InputDecoration(
                hintText: 'Describe the issue',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            GtGreenButton(
              label: 'Submit',
              onPressed: () => Navigator.pop(ctx, true),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
    if (ok == true) {
      await _submitChangeRequest(
        type: type,
        note: noteCtrl.text.trim().isEmpty ? null : noteCtrl.text.trim(),
      );
    }
    noteCtrl.dispose();
  }

  Future<void> _showLostItemSheet() async {
    final app = context.read<AppState>();
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
                  Icon(Icons.search, color: GtColors.brand, size: 24),
                  SizedBox(width: 8),
                  Text(
                    'Find lost item',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFF0FDF4),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xFFBBF7D0)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: const [
                    Icon(Icons.lock_outline, color: Color(0xFF16A34A), size: 20),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'To protect your privacy, you don\'t need to describe personal items. We will notify your driver to inspect their vehicle. Please keep checking your notifications for updates if driver found something.',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: Color(0xFF166534),
                          height: 1.35,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: noteCtrl,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: 'Location in vehicle (optional)',
                  hintText: 'e.g. Back seat, trunk, door pocket',
                  helperText: 'Do not name personal items to protect privacy',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              GtGreenButton(
                label: 'Notify driver',
                onPressed: () {
                  Navigator.pop(ctx, true);
                },
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );

    if (ok == true) {
      await _submitChangeRequest(
        type: 'LOST_ITEM',
        note: noteCtrl.text.trim().isEmpty ? null : noteCtrl.text.trim(),
      );
      if (mounted) {
        await app.refreshRide(widget.rideId);
        setState(() {});
      }
    }
    noteCtrl.dispose();
  }

  Future<void> _showConfirmReceivedDialog(RideRequest r) async {
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
                    'Confirm Item Received',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              const Text(
                'Confirm that your driver has safely returned your lost item. This will close the lost item case.',
                style: TextStyle(
                  fontSize: 13,
                  color: GtColors.textSecondary,
                  height: 1.35,
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: noteCtrl,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: 'Note (optional)',
                  hintText: 'e.g. Received my item back in good condition',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 18),
              GtGreenButton(
                label: 'Confirm item received',
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
      setState(() => _actionBusy = true);
      try {
        await context.read<AppState>().markLostItemReturned(
              r.id,
              note: noteCtrl.text.trim().isEmpty ? null : noteCtrl.text.trim(),
            );
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Item marked as received! Inquiry resolved.'),
            ),
          );
          await context.read<AppState>().refreshRide(r.id);
          setState(() {});
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Could not update case: $e')),
          );
        }
      } finally {
        if (mounted) setState(() => _actionBusy = false);
      }
    }
    noteCtrl.dispose();
  }

  Widget _buildPhotoThumbnail(String? photoUrl, {String? label}) {
    if (photoUrl == null || photoUrl.trim().isEmpty) return const SizedBox.shrink();
    final trimmed = photoUrl.trim();
    Widget imgWidget;
    if (trimmed.startsWith('data:image')) {
      final comma = trimmed.indexOf(',');
      if (comma != -1) {
        try {
          final bytes = base64Decode(trimmed.substring(comma + 1));
          imgWidget = Image.memory(bytes, height: 140, width: double.infinity, fit: BoxFit.cover);
        } catch (_) {
          imgWidget = const SizedBox.shrink();
        }
      } else {
        imgWidget = const SizedBox.shrink();
      }
    } else {
      imgWidget = Image.network(
        trimmed,
        height: 140,
        width: double.infinity,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => Container(
          height: 140,
          color: Colors.grey.shade100,
          child: const Center(
            child: Icon(Icons.broken_image, color: Colors.grey),
          ),
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
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: imgWidget,
          ),
        ],
      ),
    );
  }

  Future<void> _showSetPickupLocationDialog(RideRequest r) async {
    final current = r.lostItem?.pickupLocation ?? r.to ?? '';
    final ctrl = TextEditingController(text: current);

    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
          16,
          16,
          16,
          16 + MediaQuery.viewInsetsOf(ctx).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.pin_drop, color: GtColors.brand),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'Set Pickup / Return Location',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 8),
            const Text(
              'Specify an address or landmark where you can safely meet your driver to retrieve your item.',
              style: TextStyle(fontSize: 13, color: Colors.black54),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: ctrl,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Meeting Address or Place',
                hintText: 'e.g. 123 Main St, or Calgary Airport Terminal',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.location_on_outlined),
              ),
              maxLines: 2,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                if (r.to != null && r.to!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: OutlinedButton(
                      onPressed: () => ctrl.text = r.to!,
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        textStyle: const TextStyle(fontSize: 11),
                      ),
                      child: const Text('Use Drop-off'),
                    ),
                  ),
                if (r.from.isNotEmpty)
                  OutlinedButton(
                    onPressed: () => ctrl.text = r.from,
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      textStyle: const TextStyle(fontSize: 11),
                    ),
                    child: const Text('Use Pickup'),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () {
                if (ctrl.text.trim().isEmpty) return;
                Navigator.pop(ctx, true);
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: GtColors.brand,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: const Text('Save Pickup Location'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );

    if (ok == true && mounted && ctrl.text.trim().isNotEmpty) {
      setState(() => _actionBusy = true);
      try {
        await context
            .read<AppState>()
            .setLostItemPickupLocation(r.id, location: ctrl.text.trim());
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Pickup location updated for driver'),
            ),
          );
          await context.read<AppState>().refreshRide(r.id);
          setState(() {});
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Could not update pickup location: $e')),
          );
        }
      } finally {
        if (mounted) setState(() => _actionBusy = false);
      }
    }
    ctrl.dispose();
  }

  Future<void> _payLostItemReturnFee(RideRequest r) async {
    final feeAmount = r.lostItem?.returnFeeAmount ?? 20.0;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Pay Item Return Fee'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'A standard return fee of \$${feeAmount.toStringAsFixed(2)} CAD applies to compensate your driver for their time and travel to return your lost property.',
              style: const TextStyle(fontSize: 13.5, height: 1.4),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(Icons.payment, color: Color(0xFF6366F1), size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Charged via Stripe: \$${feeAmount.toStringAsFixed(2)} CAD\n100% credited to driver wallet',
                      style: const TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF334155),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF16A34A),
              foregroundColor: Colors.white,
            ),
            child: Text('Pay \$${feeAmount.toStringAsFixed(2)} via Stripe'),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      setState(() => _actionBusy = true);
      try {
        await context.read<AppState>().payLostItemReturnFee(r.id);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Return fee paid successfully via Stripe!'),
            ),
          );
          await context.read<AppState>().refreshRide(r.id);
          setState(() {});
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Could not process payment: $e')),
          );
        }
      } finally {
        if (mounted) setState(() => _actionBusy = false);
      }
    }
  }

  Widget _buildPassengerLostItemCard(RideRequest r) {
    final lost = r.lostItem;
    final status = (lost?.status ?? (r.hasLostItemRequest ? 'REPORTED' : ''))
        .toUpperCase();

    final isReported = status == 'REPORTED';
    final isFound = status == 'FOUND';
    final isNotFound = status == 'NOT_FOUND';
    final isReturned = status == 'RETURNED';
    final feeAmount = lost?.returnFeeAmount ?? 20.0;
    final feePaid = lost?.returnFeePaid ?? false;

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
      subtitle =
          'You confirmed receiving your lost item. This inquiry is resolved.';
    } else if (isFound) {
      bgColor = const Color(0xFFF0FDF4);
      borderColor = const Color(0xFF86EFAC);
      primaryTextColor = const Color(0xFF14532D);
      secondaryTextColor = const Color(0xFF166534);
      headerIcon = Icons.task_alt;
      iconColor = const Color(0xFF15803D);
      title = 'Great news! Item found';
      subtitle =
          'Your driver confirmed finding your item in their vehicle. Please arrange pickup or drop-off.';
    } else if (isNotFound) {
      bgColor = const Color(0xFFFFFBEB);
      borderColor = const Color(0xFFFDE68A);
      primaryTextColor = const Color(0xFF92400E);
      secondaryTextColor = const Color(0xFFB45309);
      headerIcon = Icons.search_off;
      iconColor = const Color(0xFFD97706);
      title = 'Item Not Located in Vehicle';
      subtitle =
          'Your driver inspected their vehicle and did not locate the reported item.';
    } else {
      bgColor = const Color(0xFFEFF6FF);
      borderColor = const Color(0xFFBFDBFE);
      primaryTextColor = const Color(0xFF1E3A8A);
      secondaryTextColor = const Color(0xFF1E40AF);
      headerIcon = Icons.search;
      iconColor = const Color(0xFF1D4ED8);
      title = 'Lost item inquiry active';
      subtitle =
          'The driver has been notified to check their vehicle. You will receive an update here as soon as they inspect it.';
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: borderColor, width: 1.2),
      ),
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
                        fontSize: 14.5,
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
          if (lost?.driverNote != null &&
              lost!.driverNote!.trim().isNotEmpty &&
              (isFound || isNotFound || isReturned)) ...[
            const SizedBox(height: 10),
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
                    'Driver Note:',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 11.5,
                      color: Colors.black54,
                    ),
                  ),
                  const SizedBox(height: 2),
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
          if (lost?.photoUrl != null && lost!.photoUrl!.isNotEmpty)
            _buildPhotoThumbnail(lost.photoUrl, label: 'Driver Photo of Found Item:'),
          if (lost?.handoverPhotoUrl != null && lost!.handoverPhotoUrl!.isNotEmpty)
            _buildPhotoThumbnail(lost.handoverPhotoUrl, label: 'Handover Photo Proof:'),
          if (isFound || isReported) ...[
            if (lost?.pickupLocation != null && lost!.pickupLocation!.trim().isNotEmpty) ...[
              Container(
                margin: const EdgeInsets.only(top: 10),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: borderColor.withOpacity(0.6)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.location_on, size: 18, color: GtColors.brand),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Your Pickup / Return Location:',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: Colors.black54,
                            ),
                          ),
                          Text(
                            lost.pickupLocation!,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: Colors.black87,
                            ),
                          ),
                        ],
                      ),
                    ),
                    TextButton(
                      onPressed: _actionBusy ? null : () => _showSetPickupLocationDialog(r),
                      child: const Text('Change', style: TextStyle(fontSize: 12)),
                    ),
                  ],
                ),
              ),
            ] else ...[
              Container(
                margin: const EdgeInsets.only(top: 10),
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: _actionBusy ? null : () => _showSetPickupLocationDialog(r),
                  icon: const Icon(Icons.add_location_alt_outlined, size: 16),
                  label: const Text('Set Meeting / Pickup Location for Driver'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: GtColors.brand,
                    side: const BorderSide(color: GtColors.brand),
                    padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
                  ),
                ),
              ),
            ],
          ],
          if (isFound || isReturned) ...[
            if (feePaid)
              Container(
                margin: const EdgeInsets.only(top: 10),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFFF0FDF4),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xFF86EFAC)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.check_circle, size: 18, color: Color(0xFF16A34A)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Return Fee Paid (\$${feeAmount.toStringAsFixed(2)} CAD via Stripe)\nDriver credited for return trip.',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF15803D),
                        ),
                      ),
                    ),
                  ],
                ),
              )
            else
              Container(
                margin: const EdgeInsets.only(top: 10),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xFFCBD5E1)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.payment, size: 18, color: Color(0xFF4F46E5)),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Item Return Fee: \$${feeAmount.toStringAsFixed(2)} CAD',
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF1E293B),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Uber-style returned item fee to compensate your driver for their time and travel to return your item.',
                      style: TextStyle(fontSize: 11.5, color: Colors.black54),
                    ),
                    const SizedBox(height: 8),
                    ElevatedButton.icon(
                      onPressed: _actionBusy ? null : () => _payLostItemReturnFee(r),
                      icon: const Icon(Icons.lock_outline, size: 15),
                      label: Text('Pay \$${feeAmount.toStringAsFixed(2)} CAD via Stripe'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF4F46E5),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        elevation: 0,
                      ),
                    ),
                  ],
                ),
              ),
          ],
          if (isFound) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => context.push('/chat/${r.id}'),
                    icon: const Icon(Icons.chat_outlined, size: 16),
                    label: const Text('Chat with Driver'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: GtColors.brand,
                      side: const BorderSide(color: GtColors.brand),
                      padding: const EdgeInsets.symmetric(vertical: 10),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _actionBusy
                        ? null
                        : () => _showConfirmReceivedDialog(r),
                    icon: const Icon(Icons.check, size: 16),
                    label: const Text('Item Received'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF16A34A),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      elevation: 0,
                    ),
                  ),
                ),
              ],
            ),
          ] else if (isReported) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                ActionChip(
                  avatar: const Icon(Icons.chat_outlined,
                      size: 15, color: GtColors.brand),
                  label: const Text(
                    'Chat with Driver',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: GtColors.brand,
                    ),
                  ),
                  backgroundColor: Colors.white,
                  side: const BorderSide(color: Color(0xFFBFDBFE)),
                  onPressed: () => context.push('/chat/${r.id}'),
                ),
              ],
            ),
          ] else if (isNotFound) ...[
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: _actionBusy
                    ? null
                    : () => _showHelpForm(
                          'CURRENT_RIDE_HELP',
                          'Lost item assistance',
                        ),
                icon: const Icon(Icons.support_agent, size: 16),
                label: const Text('Contact support for help'),
                style: TextButton.styleFrom(
                  foregroundColor: const Color(0xFFB45309),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  double _num(dynamic v) => (v is num) ? v.toDouble() : 0;

  Color _bannerColor(String status) {
    switch (status) {
      case 'DRIVER_EN_ROUTE':
      case 'DRIVER_ARRIVED':
        return GtColors.green;
      case 'TRIP_STARTED':
      case 'IN_PROGRESS':
        return GtColors.greenDark;
      case 'COMPLETED':
        return GtColors.textSecondary;
      case 'PASSENGER_CANCELLED':
      case 'DRIVER_CANCELLED':
      case 'ADMIN_CANCELLED':
        return GtColors.brand;
      default:
        return GtColors.brand;
    }
  }

  @override
  Widget build(BuildContext context) {
    // Subscribe only to the ride + offer data for this specific ride.
    // This prevents unrelated AppState changes (avatar load, notification
    // badge count, etc.) from triggering a rebuild of the entire screen
    // — which would force the Google Maps PlatformView to re-evaluate.
    final (ride, offer) = context
        .select<AppState, (RideRequest?, Offer?)>((s) {
      final r = s.rideById(widget.rideId);
      final oId = r?.selectedOfferId;
      return (r, oId != null ? s.offerByIds(widget.rideId, oId) : null);
    });
    final status = (ride?.serverStatus ?? '').toUpperCase();
    final isCompleted = status == 'COMPLETED' || ride?.status == RideStatus.past;
    if (isCompleted && !_alreadyRated && !_ratingPromptShown) {
      _maybeShowRating();
    }
    final statusLabel = friendlyRideStatus(ride?.serverStatus);

    final currency = _paymentStatus?['onlineCurrency']?.toString() ??
        _paymentStatus?['totalCurrency']?.toString() ??
        offer?.currency ??
        ride?.currency ??
        'CAD';
    final total = _num(
      _paymentStatus?['totalAmount'] ?? offer?.price,
    );
    final breakdown = offer?.priceBreakdown;
    final breakdownPayment = _paymentStatus?['priceBreakdown'];
    final rideFare = breakdown != null && breakdown.ridePrice > 0
        ? breakdown.ridePrice
        : (breakdownPayment is Map && _num(breakdownPayment['ridePrice']) > 0
            ? _num(breakdownPayment['ridePrice'])
            : (total > 0 ? (((total / 1.2) * 100).roundToDouble() / 100.0) : 0.0));
    final platformFee = breakdown != null && breakdown.platformFee > 0
        ? breakdown.platformFee
        : (breakdownPayment is Map && _num(breakdownPayment['platformFee']) > 0
            ? _num(breakdownPayment['platformFee'])
            : (((rideFare * 0.2) * 100).roundToDouble() / 100.0));

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        final app = context.read<AppState>();
        app.setShellTab(1);
        while (Navigator.of(context, rootNavigator: true).canPop()) {
          Navigator.of(context, rootNavigator: true).pop();
        }
        GoRouter.of(context).go('/');
      },
      child: Scaffold(
        backgroundColor: GtColors.bgGrey,
        appBar: AppBar(
          title: Text(ride != null ? 'Ride #${ride.displayId}' : 'Ride'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () {
              final app = context.read<AppState>();
              app.setShellTab(1);
              while (Navigator.of(context, rootNavigator: true).canPop()) {
                Navigator.of(context, rootNavigator: true).pop();
              }
              GoRouter.of(context).go('/');
            },
          ),
          actions: [
            if (ride != null) ...[
              IconButton(
                icon: const Icon(Icons.share_outlined),
                tooltip: 'Share trip with friend',
                onPressed: _actionBusy ? null : () => _showShareSheet(ride),
              ),
              IconButton(
                icon: const Icon(Icons.flag_outlined),
                tooltip: 'Report ride',
                onPressed: _actionBusy ? null : _showReportSheet,
              ),
            ],
          ],
        ),
        body: _loading
          ? const Center(
              child: CircularProgressIndicator(color: GtColors.brand),
            )
          : ride == null
              ? const Center(child: Text('Ride not found'))
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                      decoration: BoxDecoration(
                        color: _bannerColor(status),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        statusLabel,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                        ),
                      ),
                    ),
                    if (_isLiveTrackStatus(status)) ...[
                      const SizedBox(height: 12),
                      _Section(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                const Text(
                                  'Live tracking',
                                  style: TextStyle(fontWeight: FontWeight.w800),
                                ),
                                const Spacer(),
                                if (_tracking?['eta'] is Map)
                                  Text(
                                    'ETA ~${(_tracking!['eta'] as Map)['minutes']} min',
                                    style: const TextStyle(
                                      color: GtColors.brand,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Builder(
                              builder: (_) {
                                final live = _tracking?['live'];
                                final pickup = _tracking?['pickup'];
                                final dropoff = _tracking?['dropoff'];
                                final eta = _tracking?['eta'];
                                if (live is! Map || pickup is! Map) {
                                  return const Text(
                                    'Waiting for driver location…',
                                    style: TextStyle(
                                      color: GtColors.textSecondary,
                                    ),
                                  );
                                }
                                final toDrop =
                                    eta is Map &&
                                    eta['target']?.toString() == 'DROPOFF' &&
                                    dropoff is Map;
                                final toLat = toDrop
                                    ? (dropoff['lat'] as num?)?.toDouble()
                                    : (pickup['lat'] as num?)?.toDouble();
                                final toLng = toDrop
                                    ? (dropoff['lng'] as num?)?.toDouble()
                                    : (pickup['lng'] as num?)?.toDouble();
                                // Fixed-height SizedBox prevents the ListView
                                // from remeasuring the PlatformView on every
                                // scroll frame.
                                return SizedBox(
                                  height: 200,
                                  child: GtGoogleRouteMap(
                                    fromLat:
                                        (live['lat'] as num).toDouble(),
                                    fromLng:
                                        (live['lng'] as num).toDouble(),
                                    fromLabel: 'Driver',
                                    toLat: toLat,
                                    toLng: toLng,
                                    toLabel: toDrop ? 'Dropoff' : 'Pickup',
                                    distanceLabel: eta is Map
                                        ? '${eta['distanceKm']} km'
                                        : null,
                                    height: 200,
                                    canExpand: false,
                                    interactive: false,
                                  ),
                                );
                              },
                            ),
                          ],
                        ),
                      ),
                    ],
                    if (status == 'BOOKED' ||
                        status == 'DRIVER_EN_ROUTE' ||
                        status == 'DRIVER_ARRIVED') ...[
                      const SizedBox(height: 16),
                      _buildPinCard(
                        ride.startPin ??
                            (1000 + (ride.id.hashCode.abs() % 9000)).toString(),
                      ),
                    ],
                    const SizedBox(height: 16),
                    _Section(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (ride.hasReturnTrip) ...[
                            Container(
                              margin: const EdgeInsets.only(bottom: 12),
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 6),
                              decoration: BoxDecoration(
                                color: const Color(0xFFFFF3CD),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(
                                    color: const Color(0xFFE6B800), width: 0.8),
                              ),
                              child: Row(
                                children: [
                                  const Icon(Icons.swap_vert_rounded,
                                      size: 15, color: Color(0xFF8A6900)),
                                  const SizedBox(width: 6),
                                  Expanded(
                                    child: Text(
                                      ride.returnLabel != null &&
                                              ride.returnLabel!.isNotEmpty
                                          ? 'Return: ${ride.returnLabel!}'
                                          : 'Return trip (Round trip)',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 12.5,
                                        color: Color(0xFF6B5000),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                          GtRouteRow(
                            from: ride.from,
                            to: ride.to ?? '',
                            distance: ride.distance,
                            duration: ride.duration,
                            timeBadge: ride.timeBadge,
                            isRoundTrip: ride.hasReturnTrip,
                            returnLabel: ride.returnLabel,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            ride.datetimeLabel,
                            style: const TextStyle(
                              color: GtColors.textMuted,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (offer != null) ...[
                      const SizedBox(height: 12),
                      _Section(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Your driver',
                              style: TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 15,
                              ),
                            ),
                            const SizedBox(height: 12),
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if (offer.imageUrl != null)
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(10),
                                    child: AuthNetworkImage(
                                      url: offer.imageUrl!,
                                      width: 72,
                                      height: 72,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, __, ___) =>
                                          const Icon(
                                        Icons.directions_car,
                                        size: 48,
                                        color: GtColors.textMuted,
                                      ),
                                    ),
                                  )
                                else
                                  Container(
                                    width: 72,
                                    height: 72,
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                      color: GtColors.bgGrey,
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: const Icon(
                                      Icons.directions_car,
                                      size: 40,
                                      color: GtColors.textMuted,
                                    ),
                                  ),
                                const SizedBox(width: 14),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      if ((offer.driverName ?? '')
                                          .trim()
                                          .isNotEmpty)
                                        Text(
                                          offer.driverName!.trim(),
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w800,
                                            fontSize: 17,
                                          ),
                                        )
                                      else
                                        Text(
                                          offer.displayName,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w800,
                                            fontSize: 17,
                                          ),
                                        ),
                                      const SizedBox(height: 4),
                                      Row(
                                        children: [
                                          const Icon(
                                            Icons.star,
                                            size: 16,
                                            color: GtColors.warn,
                                          ),
                                          Text(
                                            ' ${offer.rating.toStringAsFixed(1)}'
                                            '${offer.ratingCount > 0 ? ' (${offer.ratingCount})' : ''}',
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                        ],
                                      ),
                                      if ((offer.driverName ?? '')
                                          .trim()
                                          .isNotEmpty) ...[
                                        const SizedBox(height: 6),
                                        Text(
                                          offer.displayName,
                                          style: const TextStyle(
                                            color: GtColors.textSecondary,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ],
                                      Text(
                                        [
                                          offer.vehicleClass,
                                          if ((offer.color ?? '')
                                              .trim()
                                              .isNotEmpty)
                                            offer.color!.trim(),
                                        ].join(' · '),
                                        style: const TextStyle(
                                          color: GtColors.textSecondary,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                            if (offer.plate != null &&
                                offer.plate!.trim().isNotEmpty) ...[
                              const SizedBox(height: 14),
                              Container(
                                width: double.infinity,
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                  vertical: 12,
                                ),
                                decoration: BoxDecoration(
                                  color: GtColors.bgGrey,
                                  borderRadius: BorderRadius.circular(10),
                                  border:
                                      Border.all(color: GtColors.border),
                                ),
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    const Text(
                                      'License plate',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: GtColors.textMuted,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      offer.plate!.trim().toUpperCase(),
                                      style: const TextStyle(
                                        fontSize: 20,
                                        fontWeight: FontWeight.w900,
                                        letterSpacing: 1.2,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                            if (offer.languages.isNotEmpty) ...[
                              const SizedBox(height: 12),
                              Text(
                                'Languages: ${offer.languages.join(', ')}',
                                style: const TextStyle(
                                  color: GtColors.textSecondary,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                            const SizedBox(height: 12),
                            Text(
                              formatMoney(offer.price, offer.currency),
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 18,
                                color: GtColors.brand,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    if (isCompleted && total > 0) ...[
                      const SizedBox(height: 12),
                      _Section(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Payment summary',
                              style: TextStyle(fontWeight: FontWeight.w800),
                            ),
                            const SizedBox(height: 8),
                            if (rideFare > 0 && platformFee > 0) ...[
                              _row('Ride fare', formatMoney(rideFare, currency)),
                              _row('Platform fee', formatMoney(platformFee, currency)),
                            ],
                            if ((ride.tipAmount ?? 0) > 0)
                              _row('Tip (to driver)', formatMoney(ride.tipAmount!, currency)),
                            _row('Total paid', formatMoney(total + (ride.tipAmount ?? 0), currency)),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 20),
                    if (_canChat) ...[
                      GtGreenButton(
                        label: 'Chat with driver',
                        fullWidth: true,
                        onPressed: _actionBusy
                            ? null
                            : () => context.push(
                                  '/ride/${widget.rideId}/chat',
                                ),
                      ),
                    ],
                    if (_canEdit) ...[
                      const SizedBox(height: 10),
                      OutlinedButton(
                        onPressed: _actionBusy
                            ? null
                            : () => context.push('/edit-ride/${widget.rideId}'),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(double.infinity, 48),
                        ),
                        child: const Text('Edit ride'),
                      ),
                    ],
                    if (_canCancel) ...[
                      const SizedBox(height: 10),
                      OutlinedButton(
                        onPressed: _actionBusy ? null : _confirmCancel,
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(double.infinity, 48),
                          side: const BorderSide(color: GtColors.brand),
                        ),
                        child: const Text('Cancel ride'),
                      ),
                    ],
                    if (_isOngoing || _serverStatus == 'BOOKED') ...[
                      const SizedBox(height: 10),
                      OutlinedButton(
                        onPressed: _actionBusy
                            ? null
                            : () => _showHelpForm(
                                  'CURRENT_RIDE_HELP',
                                  'Help with this ride',
                                ),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(double.infinity, 48),
                        ),
                        child: const Text('Help with this ride'),
                      ),
                      const SizedBox(height: 10),
                      OutlinedButton.icon(
                        onPressed: _actionBusy ? null : () => _showShareSheet(ride),
                        icon: const Icon(Icons.share_outlined, size: 18),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(double.infinity, 48),
                        ),
                        label: const Text('Share trip with friend'),
                      ),
                      const SizedBox(height: 10),
                      OutlinedButton.icon(
                        onPressed: _actionBusy ? null : _showReportSheet,
                        icon: const Icon(Icons.flag_outlined, size: 18),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(double.infinity, 48),
                        ),
                        label: const Text('Report an issue'),
                      ),
                    ],
                    if (isCompleted) ...[
                      const SizedBox(height: 10),
                      if ((ride.tipAmount ?? 0) > 0)
                        Container(
                          margin: const EdgeInsets.only(bottom: 6),
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                          decoration: BoxDecoration(
                            color: GtColors.brand.withOpacity(0.08),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: GtColors.brand.withOpacity(0.3)),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.favorite, color: GtColors.brand, size: 24),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'You tipped \$${ride.tipAmount!.toStringAsFixed(2)} $currency',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 15,
                                        color: GtColors.brand,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    const Text(
                                      '100% of your tip goes to your driver.',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: GtColors.textSecondary,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        )
                      else ...[
                        GtGreenButton(
                          label: 'Tip driver',
                          fullWidth: true,
                          onPressed: _actionBusy ? null : _showTipSheet,
                        ),
                        const SizedBox(height: 10),
                      ],
                      if (ride.hasLostItemRequest || ride.lostItem != null)
                        _buildPassengerLostItemCard(ride)
                      else
                        OutlinedButton.icon(
                          onPressed: _actionBusy ? null : _showLostItemSheet,
                          icon: const Icon(Icons.search, size: 18),
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size(double.infinity, 48),
                          ),
                          label: const Text('Find lost item'),
                        ),
                      const SizedBox(height: 10),
                      OutlinedButton(
                        onPressed: _actionBusy
                            ? null
                            : () => _showHelpForm(
                                  'BILLING_HELP',
                                  'Help with billing',
                                ),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(double.infinity, 48),
                        ),
                        child: const Text('Help with billing'),
                      ),
                      const SizedBox(height: 10),
                      OutlinedButton(
                        onPressed: _actionBusy
                            ? null
                            : () => _showHelpForm(
                                  'REFUND_REQUEST',
                                  'Request refund',
                                ),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(double.infinity, 48),
                        ),
                        child: const Text('Request refund'),
                      ),
                      const SizedBox(height: 10),
                      if (_alreadyRated)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Text(
                            _myRatingStars != null
                                ? 'You rated ★$_myRatingStars'
                                : 'You already rated this ride',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              color: GtColors.brand,
                            ),
                          ),
                        )
                      else
                        TextButton(
                          onPressed: _showRatingSheet,
                          child: const Text('Rate this ride'),
                        ),
                      const SizedBox(height: 10),
                      OutlinedButton.icon(
                        onPressed: _actionBusy ? null : () => _showShareSheet(ride),
                        icon: const Icon(Icons.share_outlined, size: 18),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(double.infinity, 48),
                        ),
                        label: const Text('Share trip with friend'),
                      ),
                      const SizedBox(height: 10),
                      OutlinedButton.icon(
                        onPressed: _actionBusy ? null : _showReportSheet,
                        icon: const Icon(Icons.flag_outlined, size: 18),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(double.infinity, 48),
                        ),
                        label: const Text('Report an issue'),
                      ),
                      if (ride.hasReportedRide == true ||
                          ride.hasActiveSupport == true) ...[
                        const SizedBox(height: 10),
                        OutlinedButton.icon(
                          onPressed: _actionBusy
                              ? null
                              : () => context.push('/ride/${widget.rideId}/chat'),
                          icon: const Icon(Icons.support_agent_outlined, size: 18),
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size(double.infinity, 48),
                            foregroundColor: GtColors.brand,
                            side: const BorderSide(color: GtColors.brand),
                          ),
                          label: const Text('Chat with Support'),
                        ),
                      ],
                    ],
                    if (status == 'BOOKED' ||
                        status == 'DRIVER_EN_ROUTE' ||
                        status == 'DRIVER_ARRIVED') ...[
                      const SizedBox(height: 10),
                      OutlinedButton(
                        onPressed:
                            _actionBusy ? null : _showFlightDelayForm,
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(double.infinity, 48),
                        ),
                        child: const Text('Report flight delay'),
                      ),
                      const SizedBox(height: 10),
                      OutlinedButton(
                        onPressed: _actionBusy ? null : _showRescheduleForm,
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(double.infinity, 48),
                        ),
                        child: const Text('Request reschedule'),
                      ),
                    ],
                    const SizedBox(height: 24),
                  ],
                ),
      ),
    );
  }

  String _formatPickup(DateTime d) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec',
    ];
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    final day = days[d.weekday - 1];
    final hour = d.hour % 12 == 0 ? 12 : d.hour % 12;
    final ampm = d.hour >= 12 ? 'PM' : 'AM';
    final min = d.minute.toString().padLeft(2, '0');
    return '$day ${d.day} ${months[d.month - 1]}, $hour:$min $ampm';
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(color: GtColors.textSecondary),
          ),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }

  Widget _buildPinCard(String pin) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: GtColors.brand.withValues(alpha: 0.35), width: 1.5),
        boxShadow: [
          BoxShadow(
            color: GtColors.brand.withValues(alpha: 0.08),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: const [
              Icon(Icons.shield_outlined, size: 18, color: GtColors.brand),
              SizedBox(width: 8),
              Text(
                'RIDE START PIN',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: GtColors.brand,
                  letterSpacing: 1.2,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: pin.split('').map((d) {
              return Container(
                margin: const EdgeInsets.symmetric(horizontal: 6),
                width: 46,
                height: 54,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: GtColors.bgGrey,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: GtColors.border, width: 1.5),
                ),
                child: Text(
                  d,
                  style: const TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w900,
                    color: GtColors.text,
                  ),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 12),
          const Text(
            'Share this PIN with your driver to start your ride',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13,
              color: GtColors.textSecondary,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: GtColors.border),
      ),
      child: child,
    );
  }
}
