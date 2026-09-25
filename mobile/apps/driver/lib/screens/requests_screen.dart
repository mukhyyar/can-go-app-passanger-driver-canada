import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../offer/offer_helpers.dart';
import '../state/app_state.dart';
import 'brand_chrome.dart';

class RequestsScreen extends StatefulWidget {
  const RequestsScreen({super.key});

  @override
  State<RequestsScreen> createState() => _RequestsScreenState();
}

class _RequestsScreenState extends State<RequestsScreen>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late final TabController _tabs;
  final _scroll = ScrollController();
  Timer? _poll;
  String? _shownAlert;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _tabs = TabController(length: 2, vsync: this);
    _tabs.addListener(() {
      if (mounted) setState(() {});
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final app = context.read<AppState>();
      app.refreshOpenRequests();
      app.startMarketplaceRealtime();
      _maybeShowAlert(app);
    });
    // Fallback if socket is down — keep dashboard fresh without manual refresh.
    _poll = Timer.periodic(const Duration(seconds: 5), (_) {
      if (!mounted) return;
      context.read<AppState>().refreshOpenRequests();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      context.read<AppState>().onAppResumed();
    }
  }

  @override
  void dispose() {
    _poll?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    _tabs.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _maybeShowAlert(AppState app) {
    final alert = app.pendingRequestAlert;
    if (alert == null || alert.isEmpty || alert == _shownAlert) return;
    _shownAlert = alert;
    final rideId = app.pendingRequestRideId;
    final alertType = app.pendingAlertType;
    final alertStatus = app.pendingAlertStatus;
    app.clearPendingRequestAlert();
    final messenger = ScaffoldMessenger.of(context);
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: GtColors.brand,
        content: Text(alert),
        action: rideId == null
            ? null
            : SnackBarAction(
                label: 'Open',
                textColor: Colors.white,
                onPressed: () {
                  if (!mounted) return;
                  context.push(
                    AppState.rideDeepLinkPath(
                      rideId: rideId,
                      type: alertType,
                      status: alertStatus,
                    ),
                  );
                },
              ),
        duration: const Duration(seconds: 6),
      ),
    );
  }

  Future<void> _openRequest(DriverRequest req) async {
    final s = context.read<AppState>();
    if (s.isProfileOnHold) {
      await showDialog<void>(
        context: context,
        builder: (_) => AlertDialog(
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: const Text('Profile On Hold'),
          content: const Text(
            'Your driver profile is currently on hold while your documents are under review by our admin team. You cannot submit offers to passengers until verified.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('OK', style: TextStyle(color: GtColors.brand)),
            ),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: GtColors.brand),
              onPressed: () {
                Navigator.pop(context);
                context.push('/onboarding/documents');
              },
              child: const Text('View Documents'),
            ),
          ],
        ),
      );
      return;
    }
    if (!s.isActivated) {
      await showDialog<void>(
        context: context,
        builder: (_) => AlertDialog(
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          content: const Text(
            'You will be able to offer your price after activation. Please, fill in your profile and contact us: partner@can-go.ca',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('OK', style: TextStyle(color: GtColors.brand)),
            ),
          ],
        ),
      );
      return;
    }
    if (!mounted) return;
    context.push('/request/${req.id}');
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _maybeShowAlert(s);
    });
    final all = s.isAuthenticated ? s.openRequests : s.repo.newRequests;
    final newReqs = all.where((r) => !r.hasOffer).toList();
    final offers = s.isAuthenticated
        ? s.openRequests.where((r) => r.hasOffer).toList()
        : s.repo.myOffers;

    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      floatingActionButton: FloatingActionButton(
        backgroundColor: GtColors.brand,
        onPressed: () {
          if (_scroll.hasClients) {
            _scroll.animateTo(
              0,
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOut,
            );
          }
        },
        child: const Icon(Icons.arrow_upward, color: Colors.white),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: DriverBrandHeader(
                subtitle: s.hasExpiredDocuments
                    ? 'Documents expired — account disabled'
                    : (s.hasReuploadRequest
                        ? 'Document re-upload requested'
                        : (s.isProfileOnHold
                            ? 'Profile on hold — review in progress'
                            : (s.isActivated ? null : 'Complete activation to offer prices'))),
              ),
            ),
            if (s.hasExpiredDocuments)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                child: InkWell(
                  onTap: () => context.push('/onboarding/documents'),
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      border: Border.all(color: Colors.red.shade200),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.error_outline, color: Colors.red.shade800, size: 20),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Documents expired. Tap to re-upload and re-activate.',
                            style: TextStyle(
                              color: Colors.red.shade900,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        Icon(Icons.chevron_right, color: Colors.red.shade800, size: 18),
                      ],
                    ),
                  ),
                ),
              )
            else if (s.hasReuploadRequest)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                child: InkWell(
                  onTap: () => context.push('/onboarding/documents'),
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: Colors.amber.shade50,
                      border: Border.all(color: Colors.amber.shade300),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.assignment_late_outlined, color: Colors.amber.shade900, size: 20),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Document review: Re-upload requested. Tap to view and re-upload.',
                            style: TextStyle(
                              color: Colors.amber.shade900,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        Icon(Icons.chevron_right, color: Colors.amber.shade900, size: 18),
                      ],
                    ),
                  ),
                ),
              )
            else if (s.isProfileOnHold)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                child: InkWell(
                  onTap: () => context.push('/onboarding/documents'),
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: Colors.amber.shade50,
                      border: Border.all(color: Colors.amber.shade300),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.pause_circle_outline, color: Colors.amber.shade900, size: 20),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Profile on hold: Document under review. Offers are paused until verified.',
                            style: TextStyle(
                              color: Colors.amber.shade900,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        Icon(Icons.chevron_right, color: Colors.amber.shade900, size: 18),
                      ],
                    ),
                  ),
                ),
              ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: [
                  DriverStatChip(
                    icon: Icons.alt_route,
                    label: 'New',
                    value: '${newReqs.length}',
                  ),
                  const SizedBox(width: 8),
                  DriverStatChip(
                    icon: Icons.local_offer_outlined,
                    label: 'My offers',
                    value: '${offers.length}',
                  ),
                  const SizedBox(width: 8),
                  DriverStatChip(
                    icon: Icons.verified_outlined,
                    label: 'Status',
                    value: s.hasExpiredDocuments
                        ? 'Disabled'
                        : (s.hasReuploadRequest
                            ? 'Action req.'
                            : (s.drivingEnabled ? 'On' : 'Off')),
                    valueColor: s.hasExpiredDocuments
                        ? Colors.red.shade700
                        : (s.hasReuploadRequest
                            ? Colors.amber.shade900
                            : (s.drivingEnabled
                                ? GtColors.green
                                : GtColors.textMuted)),
                    onTap: (!s.isActivated || s.hasExpiredDocuments || s.hasReuploadRequest)
                        ? null
                        : () async {
                            try {
                              await s.setDrivingMode(!s.drivingEnabled);
                            } catch (e) {
                              if (!context.mounted) return;
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(
                                    e.toString().replaceFirst(
                                          'ApiException: ',
                                          '',
                                        ),
                                  ),
                                ),
                              );
                            }
                          },
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: GtColors.border),
                ),
                child: Row(
                  children: [
                    _Segment(
                      label: 'New',
                      selected: _tabs.index == 0,
                      onTap: () => _tabs.animateTo(0),
                    ),
                    _Segment(
                      label: 'With my offers',
                      selected: _tabs.index == 1,
                      onTap: () => _tabs.animateTo(1),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: TabBarView(
                controller: _tabs,
                children: [
                  _list(newReqs, empty: 'No new requests right now'),
                  _list(offers, empty: 'No offers yet', showPrice: true),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _list(
    List<DriverRequest> items, {
    required String empty,
    bool showPrice = false,
  }) {
    if (items.isEmpty) {
      return RefreshIndicator(
        color: GtColors.brand,
        onRefresh: () => context.read<AppState>().refreshOpenRequests(),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            SizedBox(
              height: MediaQuery.sizeOf(context).height * 0.45,
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 72,
                        height: 72,
                        decoration: BoxDecoration(
                          color: GtColors.soft,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: GtColors.brand.withValues(alpha: 0.16),
                          ),
                        ),
                        child: const Icon(
                          Icons.inbox_outlined,
                          color: GtColors.brand,
                          size: 32,
                        ),
                      ),
                      const SizedBox(height: 14),
                      Text(
                        empty,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: GtColors.textSecondary,
                          fontWeight: FontWeight.w600,
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
    return RefreshIndicator(
      color: GtColors.brand,
      onRefresh: () => context.read<AppState>().refreshOpenRequests(),
      child: ListView.builder(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 80),
        itemCount: items.length,
        itemBuilder: (_, i) => _RequestCard(
          request: items[i],
          showPrice: showPrice,
          onOffer: () => _openRequest(items[i]),
          onOpen: () => _openRequest(items[i]),
        ),
      ),
    );
  }
}

class _Segment extends StatelessWidget {
  const _Segment({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(10),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              color: selected ? GtColors.brand : Colors.transparent,
              borderRadius: BorderRadius.circular(10),
            ),
            alignment: Alignment.center,
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: selected ? Colors.white : GtColors.textSecondary,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _RequestCard extends StatelessWidget {
  const _RequestCard({
    required this.request,
    required this.onOffer,
    required this.onOpen,
    this.showPrice = false,
  });

  final DriverRequest request;
  final VoidCallback onOffer;
  final VoidCallback onOpen;
  final bool showPrice;

  @override
  Widget build(BuildContext context) {
    final isReturn = request.isRoundTrip;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: GtCard(
        onTap: onOpen,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Header: datetime + return date + TTL pill ────────────────
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        request.datetimeLabel,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                        ),
                      ),
                      if (isReturn) ...[
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFFF3CD),
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(
                                color: const Color(0xFFE6B800), width: 0.8),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.swap_vert_rounded,
                                  size: 13, color: Color(0xFF8A6900)),
                              const SizedBox(width: 4),
                              Text(
                                request.returnDatetimeLabel != null
                                    ? 'Return: ${request.returnDatetimeLabel!}'
                                    : 'Return trip',
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: Color(0xFF6B5000),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: GtColors.soft,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: GtColors.brand.withValues(alpha: 0.14),
                    ),
                  ),
                  child: Text(
                    request.ttlLabel,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: GtColors.brand,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              'Ride #${request.displayId}',
              style:
                  const TextStyle(color: GtColors.textMuted, fontSize: 11),
            ),

            // ── Flight badge ─────────────────────────────────────────────
            if (request.flightWait != null) ...[
              const SizedBox(height: 6),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: GtColors.soft,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.flight,
                        size: 14, color: GtColors.brand),
                    const SizedBox(width: 4),
                    Text(request.flightWait!,
                        style: const TextStyle(fontSize: 12)),
                  ],
                ),
              ),
            ],

            const SizedBox(height: 14),

            // ── Route A → B ──────────────────────────────────────────────
            _RouteSegment(
              from: request.from,
              to: request.to,
              isReturn: isReturn,
            ),

            const SizedBox(height: 10),

            // ── Separate Chips: Return trip, Distance, Duration ──────────
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                if (isReturn)
                  _MetaChip(
                    icon: Icons.swap_vert_rounded,
                    label: request.returnDatetimeLabel != null
                        ? 'Return: ${request.returnDatetimeLabel!}'
                        : 'Return trip',
                    isAmber: true,
                  ),
                if (request.distance.isNotEmpty && request.distance != '—')
                  _MetaChip(
                    icon: Icons.straighten_rounded,
                    label: isReturn
                        ? (request.distance.contains('×')
                            ? request.distance
                            : '${request.distance} × 2')
                        : request.distance,
                  ),
                if (request.duration.isNotEmpty && request.duration != '—')
                  _MetaChip(
                    icon: Icons.schedule_rounded,
                    label: isReturn
                        ? (request.duration.contains('×')
                            ? request.duration
                            : '${request.duration} × 2')
                        : request.duration,
                  ),
              ],
            ),

            const SizedBox(height: 12),

            // ── Vehicle chips ─────────────────────────────────────────────
            GtVehicleChips(
              types: request.vehicleClassIds,
              rawNeed: request.vehicleNeed,
              passengers: request.passengers,
            ),

            const SizedBox(height: 12),

            // ── Price or offer button ─────────────────────────────────────
            if (showPrice && request.offerPrice != null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                    horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: GtColors.soft,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: GtColors.brand.withValues(alpha: 0.16),
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Your offer: ${MoneyFormat.formatFlexible(request.offerPrice!, request.currency)}',
                      style: const TextStyle(
                        color: GtColors.brand,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Text(
                      'Customer: ${MoneyFormat.formatFlexible(request.offerPrice! * 1.44, request.currency)}',
                      style: const TextStyle(
                        color: GtColors.textSecondary,
                        fontWeight: FontWeight.w600,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              )
            else if ((request.status ?? '').toUpperCase() == 'COMPLETED')
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                    horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: const Color(0xFFEAF7EE),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: GtColors.green.withValues(alpha: 0.2),
                  ),
                ),
                alignment: Alignment.center,
                child: const Text(
                  'Completed',
                  style: TextStyle(
                    color: GtColors.green,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              )
            else if ((request.status ?? '').toUpperCase().contains('CANCEL'))
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                    horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: const Color(0xFFFDE8E8),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: GtColors.red.withValues(alpha: 0.2),
                  ),
                ),
                alignment: Alignment.center,
                child: const Text(
                  'Cancelled',
                  style: TextStyle(
                    color: GtColors.red,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              )
            else
              GtGreenButton(label: 'Offer price', onPressed: onOffer),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Route segment widget (used for both outbound A→B and return B→A)
// ─────────────────────────────────────────────────────────────────────────────

class _RouteSegment extends StatelessWidget {
  const _RouteSegment({
    required this.from,
    required this.to,
    required this.isReturn,
  });

  final String from;
  final String to;
  final bool isReturn;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ── Left column: A dot, line with up-down arrows if return, B dot ──
        SizedBox(
          width: 28,
          child: Column(
            children: [
              // Origin dot A
              Container(
                width: 26,
                height: 26,
                decoration: const BoxDecoration(
                  color: GtColors.text,
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: const Text(
                  'A',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
              ),
              // Connector top line
              Container(
                width: 2,
                height: 6,
                color: isReturn ? const Color(0xFFE6A800) : GtColors.border,
              ),
              // Arrow indicator: 2 arrows up-down for return, single down arrow for one-way
              Container(
                width: 20,
                height: 20,
                decoration: BoxDecoration(
                  color: isReturn
                      ? const Color(0xFFFFF3CD)
                      : const Color(0xFFF2F2F7),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: isReturn
                        ? const Color(0xFFE6B800)
                        : GtColors.border,
                    width: 0.8,
                  ),
                ),
                alignment: Alignment.center,
                child: Icon(
                  isReturn
                      ? Icons.swap_vert_rounded
                      : Icons.arrow_downward_rounded,
                  size: 13,
                  color: isReturn
                      ? const Color(0xFF8A6900)
                      : GtColors.textMuted,
                ),
              ),
              // Connector bottom line
              Container(
                width: 2,
                height: 6,
                color: isReturn ? const Color(0xFFE6A800) : GtColors.border,
              ),
              // Destination dot B
              Container(
                width: 26,
                height: 26,
                decoration: const BoxDecoration(
                  color: GtColors.brand,
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: const Text(
                  'B',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 10),
        // ── Right column: addresses ───────────────────────────────────
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 3),
                child: Text(
                  from,
                  style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w500,
                    height: 1.3,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Padding(
                padding: const EdgeInsets.only(top: 3),
                child: Text(
                  to,
                  style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w500,
                    height: 1.3,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({
    required this.icon,
    required this.label,
    this.isAmber = false,
  });

  final IconData icon;
  final String label;
  final bool isAmber;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: isAmber ? const Color(0xFFFFF3CD) : const Color(0xFFF2F2F7),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isAmber ? const Color(0xFFE6B800) : GtColors.border,
          width: 0.8,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 13,
            color: isAmber ? const Color(0xFF8A6900) : GtColors.textSecondary,
          ),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: isAmber ? FontWeight.w700 : FontWeight.w600,
              color: isAmber ? const Color(0xFF6B5000) : GtColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}
