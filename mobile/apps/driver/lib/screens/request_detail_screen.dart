import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../offer/inline_offer_form.dart';
import '../offer/offer_helpers.dart';
import '../state/app_state.dart';
import 'offer_review_screen.dart';

class RequestDetailScreen extends StatefulWidget {
  const RequestDetailScreen({super.key, required this.requestId});

  final String requestId;

  @override
  State<RequestDetailScreen> createState() => _RequestDetailScreenState();
}

class _RequestDetailScreenState extends State<RequestDetailScreen> {
  DriverRequest? _request;
  List<DriverVehicle> _vehicles = [];
  bool _loading = true;
  String? _error;
  bool _submitting = false;
  bool _withdrawing = false;
  String? _offerError;
  bool _mapFullscreen = false;
  int _selectedRouteIndex = 0;
  List<GtRouteOption> _availableRoutes = const [];
  late OfferDraft _draft;
  final _outCtrl = TextEditingController();
  final _retCtrl = TextEditingController();
  final NoteTranslationService _translator = PassthroughNoteTranslation();
  String? _translatedNote;
  bool _translating = false;

  @override
  void initState() {
    super.initState();
    _draft = OfferDraft();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _outCtrl.dispose();
    _retCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final s = context.read<AppState>();
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final detail = await s.loadRequestDetail(widget.requestId);
      final vehicles = await s.loadDriverVehicles();
      if (!mounted) return;
      setState(() {
        _request = detail;
        _vehicles = vehicles;
        _loading = false;
        if (_draft.vehicleId == null && vehicles.isNotEmpty) {
          _draft.vehicleId = s.primaryVehicleId ?? vehicles.first.id;
        }
        for (final r in detail.requiredOptions) {
          _draft.selectedOptions.add(r);
        }
        if ((detail.signage ?? '').trim().isNotEmpty) {
          _draft.selectedOptions.add('name_sign');
        }
        final existing = detail.myOffer;
        if (existing != null) {
          _draft.outboundPrice =
              existing.outboundPrice ?? existing.bidAmount;
          _draft.returnPrice = existing.returnPrice;
          _draft.validForSeconds = existing.validForSeconds;
          _draft.vehicleId = existing.vehicleId ?? _draft.vehicleId;
          _draft.selectedOptions = {...existing.selectedOptions};
          for (final r in detail.requiredOptions) {
            _draft.selectedOptions.add(r);
          }
          if ((detail.signage ?? '').trim().isNotEmpty) {
            _draft.selectedOptions.add('name_sign');
          }
          _outCtrl.text = (_draft.outboundPrice ?? 0).toStringAsFixed(0);
          if (detail.isRoundTrip && _draft.returnPrice != null) {
            _retCtrl.text = _draft.returnPrice!.toStringAsFixed(0);
          }
        }
        final saved = s.offerDraftFor(widget.requestId);
        if (saved != null && existing == null) {
          _draft = saved.copy();
          if (_draft.outboundPrice != null) {
            _outCtrl.text = _draft.outboundPrice!.toStringAsFixed(
              _draft.outboundPrice! % 1 == 0 ? 0 : 2,
            );
          }
          if (_draft.returnPrice != null) {
            _retCtrl.text = _draft.returnPrice!.toStringAsFixed(
              _draft.returnPrice! % 1 == 0 ? 0 : 2,
            );
          }
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  void _persistDraft() {
    final s = context.read<AppState>();
    _draft.outboundPrice = double.tryParse(_outCtrl.text.trim());
    if (_request?.isRoundTrip == true) {
      _draft.returnPrice = double.tryParse(_retCtrl.text.trim());
    } else {
      _draft.returnPrice = null;
    }
    s.saveOfferDraft(widget.requestId, _draft);
  }

  String? _validate() {
    _persistDraft();
    if (_vehicles.isEmpty) {
      return 'No eligible vehicle. Add a vehicle in settings first.';
    }
    if (_draft.vehicleId == null) return 'Select a vehicle';
    if (_draft.validForSeconds == null) return 'Select offer validity';
    final out = _draft.outboundPrice;
    if (out == null || out <= 0) return 'Enter a valid A → B price';
    final req = _request;
    if (req != null && req.isRoundTrip) {
      final ret = _draft.returnPrice;
      if (ret == null || ret < 0) return 'Enter a valid B → A price';
    }
    if (req != null &&
        req.pricing != null &&
        req.pricing!.minBid > 0 &&
        req.pricing!.maxBid > req.pricing!.minBid) {
      final total = _draft.totalPrice;
      if (total < req.pricing!.minBid - 0.001) {
        return 'Offer cannot be lower than minimum eligible ${MoneyFormat.formatFlexible(req.pricing!.minBid, req.currency)}';
      }
      if (total > req.pricing!.maxBid + 0.001) {
        return 'Offer cannot exceed maximum eligible ${MoneyFormat.formatFlexible(req.pricing!.maxBid, req.currency)}';
      }
    }
    for (final r in req?.requiredOptions ?? const <String>[]) {
      if (!_draft.selectedOptions.contains(r)) {
        return 'Required option missing: $r';
      }
    }
    if ((req?.signage ?? '').trim().isNotEmpty &&
        !_draft.selectedOptions.contains('name_sign')) {
      return 'Name sign is required for this passenger';
    }
    return null;
  }

  Future<void> _onSkip() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Skip this request?'),
        content: const Text(
          'It will be removed from your queue. The passenger request stays open for other drivers.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Skip', style: TextStyle(color: GtColors.brand)),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    final s = context.read<AppState>();
    try {
      final nextId = await s.skipRequest(widget.requestId);
      if (!mounted) return;
      if (nextId != null) {
        context.go('/request/$nextId');
      } else {
        context.go('/');
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Request skipped')),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not skip: $e')),
      );
    }
  }

  Future<void> _submitOffer() async {
    final req = _request;
    if (req == null || _submitting) return;
    final err = _validate();
    if (err != null) {
      setState(() => _offerError = err);
      return;
    }
    setState(() {
      _offerError = null;
      _submitting = true;
    });
    try {
      final vehicle =
          _vehicles.where((v) => v.id == _draft.vehicleId).firstOrNull ??
              (_vehicles.isNotEmpty ? _vehicles.first : null);
      final submitted = await Navigator.of(context).push<bool>(
        MaterialPageRoute(
          builder: (_) => OfferReviewScreen(
            request: req,
            draft: _draft,
            vehicle: vehicle,
          ),
        ),
      );
      if (submitted == true) {
        await _load();
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _translate() async {
    final note = _request?.comment;
    if (note == null || note.isEmpty) return;
    setState(() => _translating = true);
    final result = await _translator.translate(note);
    if (!mounted) return;
    setState(() {
      _translating = false;
      _translatedNote = result;
    });
    if (result == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Translation service is not configured yet'),
        ),
      );
    }
  }

  Future<void> _withdraw() async {
    final offer = _request?.myOffer;
    if (offer == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Withdraw this offer?'),
        content: const Text(
          'The passenger will no longer see this offer. You can submit a new one while the request is open.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep offer'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text(
              'Withdraw',
              style: TextStyle(color: GtColors.brand),
            ),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _withdrawing = true);
    try {
      await context.read<AppState>().withdrawOffer(offer.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Offer withdrawn')),
      );
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$e')),
      );
    } finally {
      if (mounted) setState(() => _withdrawing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }
    if (_error != null || _request == null) {
      return Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.go('/'),
          ),
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _error ?? 'Request unavailable',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                GtGreenButton(
                    label: 'Back to requests', onPressed: () => context.go('/')),
              ],
            ),
          ),
        ),
      );
    }

    final req = _request!;
    final age = driverRequestAgeLabel(req);
    final currency = req.currency;
    final hasActiveOffer = req.hasOffer && req.myOffer != null;

    final selectedRoute = (_selectedRouteIndex >= 0 &&
            _selectedRouteIndex < _availableRoutes.length)
        ? _availableRoutes[_selectedRouteIndex]
        : null;
    final currentDistanceLabel = selectedRoute != null
        ? '${selectedRoute.distanceKm} km · ${selectedRoute.durationMin} min'
        : '${req.distance} · ${req.duration}';

    if (_mapFullscreen && req.fromLat != null && req.fromLng != null) {
      return Scaffold(
        body: SafeArea(
          child: SizedBox.expand(
            child: GtGoogleRouteMap(
              fromLat: req.fromLat!,
              fromLng: req.fromLng!,
              fromLabel: req.from,
              toLat: req.toLat,
              toLng: req.toLng,
              toLabel: req.to,
              distanceLabel: currentDistanceLabel,
              height: MediaQuery.of(context).size.height,
              canExpand: false,
              interactive: true,
              bundleId: 'com.canride.driver',
              initialRouteIndex: _selectedRouteIndex,
              enableRouteSelection: true,
              onRoutesLoaded: (routes) {
                if (mounted && _availableRoutes.length != routes.length) {
                  setState(() => _availableRoutes = routes);
                }
              },
              onRouteSelected: (route) {
                final idx = _availableRoutes.indexWhere((r) => r.id == route.id);
                if (mounted && idx >= 0 && idx != _selectedRouteIndex) {
                  setState(() => _selectedRouteIndex = idx);
                }
              },
              onBack: () => setState(() => _mapFullscreen = false),
            ),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 4, 12, 4),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () {
                      _persistDraft();
                      context.go('/');
                    },
                    icon: const Icon(Icons.chevron_left, size: 32),
                  ),
                  Expanded(
                    child: Column(
                      children: [
                        Text(
                          req.displayId,
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 16,
                          ),
                        ),
                        if (age.isNotEmpty)
                          Text(
                            age,
                            style: const TextStyle(
                              color: GtColors.textSecondary,
                              fontSize: 12,
                            ),
                          ),
                      ],
                    ),
                  ),
                  if (req.myOffer == null)
                    Material(
                      color: GtColors.brand,
                      borderRadius: BorderRadius.circular(10),
                      child: InkWell(
                        onTap: _onSkip,
                        borderRadius: BorderRadius.circular(10),
                        child: const Padding(
                          padding:
                              EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          child: Row(
                            children: [
                              Text(
                                'Skip',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              SizedBox(width: 4),
                              Icon(Icons.skip_next, color: Colors.white, size: 18),
                            ],
                          ),
                        ),
                      ),
                    )
                  else
                    const SizedBox(width: 48),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                children: [
                  _TripSchedule(request: req),
                  const SizedBox(height: 14),
                  _RouteBlock(request: req),
                  const SizedBox(height: 16),
                  const Text(
                    'Passenger information',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _Chip(label: 'Adults × ${req.passengers}'),
                      ..._childSeatChips(req),
                      if ((req.flight ?? '').trim().isNotEmpty)
                        _Chip(
                          label: 'Flight ${req.flight!.trim()}',
                          icon: Icons.flight,
                        ),
                      if ((req.returnFlight ?? '').trim().isNotEmpty)
                        _Chip(
                          label: 'Return flight ${req.returnFlight!.trim()}',
                          icon: Icons.flight_land,
                        ),
                      if ((req.signage ?? '').trim().isNotEmpty)
                        _Chip(
                          label: 'Name sign: ${req.signage!.trim()}',
                          icon: Icons.badge_outlined,
                        ),
                      for (final o in req.requiredOptions)
                        if (o != 'name_sign')
                          _Chip(label: o.replaceAll('_', ' ')),
                    ],
                  ),
                  if ((req.comment ?? '').trim().isNotEmpty) ...[
                    const SizedBox(height: 14),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: GtColors.border),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(_translatedNote ?? req.comment!),
                          const SizedBox(height: 8),
                          TextButton.icon(
                            onPressed: _translating ? null : _translate,
                            icon: _translating
                                ? const SizedBox(
                                    width: 14,
                                    height: 14,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Icon(
                                    Icons.translate,
                                    color: GtColors.brand,
                                    size: 18,
                                  ),
                            label: const Text(
                              'Translate',
                              style: TextStyle(
                                color: GtColors.brand,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  const Text(
                    'Transport types',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final c in (req.vehicleClassIds.isEmpty
                          ? req.vehicleNeed.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty)
                          : req.vehicleClassIds))
                        _Chip(
                          label: GtVehicleChips.formatLabel(c),
                          icon: GtVehicleChips.vehicleIcon(c),
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  if (req.fromLat != null && req.fromLng != null)
                    // Fixed-height SizedBox prevents ListView from remeasuring
                    // the PlatformView on every scroll frame.
                    SizedBox(
                      height: 220,
                      child: GtGoogleRouteMap(
                        fromLat: req.fromLat!,
                        fromLng: req.fromLng!,
                        fromLabel: req.from,
                        toLat: req.toLat,
                        toLng: req.toLng,
                        toLabel: req.to,
                        distanceLabel: currentDistanceLabel,
                        height: 220,
                        canExpand: false,
                        interactive: false,
                        expandedHeight: 390,
                        bundleId: 'com.canride.driver',
                        initialRouteIndex: _selectedRouteIndex,
                        enableRouteSelection: true,
                        onRoutesLoaded: (routes) {
                          if (mounted && _availableRoutes.length != routes.length) {
                            setState(() => _availableRoutes = routes);
                          }
                        },
                        onRouteSelected: (route) {
                          final idx =
                              _availableRoutes.indexWhere((r) => r.id == route.id);
                          if (mounted && idx >= 0 && idx != _selectedRouteIndex) {
                            setState(() => _selectedRouteIndex = idx);
                          }
                        },
                        onFullscreen: () =>
                            setState(() => _mapFullscreen = true),
                      ),
                    )
                  else
                    Container(
                      height: 120,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: GtColors.bgGrey,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: GtColors.border),
                      ),
                      child: const Text(
                        'Pickup coordinates unavailable',
                        style: TextStyle(color: GtColors.textSecondary),
                      ),
                    ),
                  if (hasActiveOffer) ...[
                    const SizedBox(height: 16),
                    Builder(
                      builder: (_) {
                        final myOffer = req.myOffer!;
                        final offered = myOffer.bidAmount;
                        final ridePrice = ((offered * 1.20) * 100).roundToDouble() / 100.0;
                        final fee = ((ridePrice * 0.20) * 100).roundToDouble() / 100.0;
                        final totalCust = ((ridePrice + fee) * 100).roundToDouble() / 100.0;

                        return Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: const Color(0xFFC8E6C9),
                              width: 1.5,
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 4,
                                    ),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFFEAF7EE),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: const Text(
                                      'OFFER ACTIVE',
                                      style: TextStyle(
                                        color: GtColors.green,
                                        fontWeight: FontWeight.w800,
                                        fontSize: 11,
                                      ),
                                    ),
                                  ),
                                  const Spacer(),
                                  Text(
                                    myOffer.status,
                                    style: const TextStyle(
                                      color: GtColors.textSecondary,
                                      fontWeight: FontWeight.w600,
                                      fontSize: 12,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              _offerCostRow('Your offered fare', offered, currency),
                              const SizedBox(height: 4),
                              _offerCostRow('Platform fee (paid by passenger)', fee, currency),
                              const Padding(
                                padding: EdgeInsets.symmetric(vertical: 6),
                                child: Divider(height: 1),
                              ),
                              _offerCostRow('Total for customer', totalCust, currency, isTotal: true),
                            ],
                          ),
                        );
                      },
                    ),
                  ],
                  const SizedBox(height: 16),
                  InlineOfferForm(
                    request: req,
                    vehicles: _vehicles,
                    draft: _draft,
                    outCtrl: _outCtrl,
                    retCtrl: _retCtrl,
                    submitting: _submitting,
                    existingOffer: req.myOffer,
                    error: _offerError,
                    onChanged: () {
                      _persistDraft();
                      setState(() => _offerError = null);
                    },
                    onSubmit: _submitOffer,
                  ),
                  if (req.myOffer != null) ...[
                    const SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: OutlinedButton.icon(
                        onPressed: (_submitting || _withdrawing) ? null : _withdraw,
                        icon: _withdrawing
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: GtColors.brand,
                                ),
                              )
                            : const Icon(Icons.delete_outline, size: 18),
                        label: Text(
                          _withdrawing ? 'Withdrawing…' : 'Withdraw offer',
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: GtColors.brand,
                          side: const BorderSide(color: GtColors.brand, width: 1.5),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
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
    if (infant > 0) out.add(_Chip(label: 'Infant carrier × $infant'));
    if (convertible > 0) {
      out.add(_Chip(label: 'Convertible seat × $convertible'));
    }
    if (booster > 0) out.add(_Chip(label: 'Booster seat × $booster'));
    return out;
  }

  Widget _offerCostRow(
    String label,
    double amount,
    String currency, {
    bool isTotal = false,
  }) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: isTotal ? 15 : 13,
            fontWeight: isTotal ? FontWeight.w800 : FontWeight.w500,
            color: isTotal ? GtColors.text : GtColors.textSecondary,
          ),
        ),
        Text(
          MoneyFormat.formatFlexible(amount, currency),
          style: TextStyle(
            fontSize: isTotal ? 16 : 13,
            fontWeight: isTotal ? FontWeight.w800 : FontWeight.w700,
            color: isTotal ? GtColors.brand : GtColors.text,
          ),
        ),
      ],
    );
  }
}

class _TripSchedule extends StatelessWidget {
  const _TripSchedule({required this.request});
  final DriverRequest request;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                request.datetimeLabel,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
            if (request.flightWait != null)
              _WaitChip(label: request.flightWait!, emphasize: true),
            if (request.pickupWaitMin != null && request.flightWait == null)
              _WaitChip(label: '${request.pickupWaitMin} min'),
          ],
        ),
        if (request.isRoundTrip) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: const Color(0xFFFFF3CD),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: const Color(0xFFE6B800), width: 0.8),
            ),
            child: Row(
              children: [
                const Icon(Icons.swap_vert_rounded,
                    size: 16, color: Color(0xFF8A6900)),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    request.returnDatetimeLabel != null
                        ? 'Return: ${request.returnDatetimeLabel!}'
                        : 'Return trip (Round trip)',
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 12.5,
                      color: Color(0xFF6B5000),
                    ),
                  ),
                ),
                if (request.returnWaitMin != null)
                  _WaitChip(label: '${request.returnWaitMin} min'),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _WaitChip extends StatelessWidget {
  const _WaitChip({required this.label, this.emphasize = false});
  final String label;
  final bool emphasize;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: emphasize ? const Color(0xFFE8F1FB) : GtColors.bgGrey,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: GtColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (emphasize) ...[
            const Icon(Icons.flight, size: 14, color: Color(0xFF2F6FED)),
            const SizedBox(width: 4),
          ],
          Text(label, style: const TextStyle(fontSize: 12)),
          const SizedBox(width: 2),
          const Icon(Icons.info_outline, size: 14, color: GtColors.textMuted),
        ],
      ),
    );
  }
}

class _RouteBlock extends StatelessWidget {
  const _RouteBlock({required this.request});
  final DriverRequest request;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _Marker(letter: 'A', color: Colors.black),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                request.from,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  height: 1.3,
                ),
              ),
            ),
          ],
        ),
        Padding(
          padding: const EdgeInsets.only(left: 1, top: 4, bottom: 4),
          child: Row(
            children: [
              Container(
                width: 20,
                height: 20,
                decoration: BoxDecoration(
                  color: request.isRoundTrip
                      ? const Color(0xFFFFF3CD)
                      : const Color(0xFFF2F2F7),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: request.isRoundTrip
                        ? const Color(0xFFE6B800)
                        : GtColors.border,
                    width: 0.8,
                  ),
                ),
                alignment: Alignment.center,
                child: Icon(
                  request.isRoundTrip
                      ? Icons.swap_vert_rounded
                      : Icons.arrow_downward_rounded,
                  size: 13,
                  color: request.isRoundTrip
                      ? const Color(0xFF8A6900)
                      : GtColors.textMuted,
                ),
              ),
              if (request.isRoundTrip) ...[
                const SizedBox(width: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF3CD),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                        color: const Color(0xFFE6B800), width: 0.8),
                  ),
                  child: const Text(
                    'Return trip',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF6B5000),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _Marker(letter: 'B', color: Colors.black),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                request.to,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  height: 1.3,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        // Separate chips for Distance and Duration
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            if (request.isRoundTrip)
              _Chip(
                label: request.returnDatetimeLabel != null
                    ? 'Return: ${request.returnDatetimeLabel!}'
                    : 'Return trip',
                icon: Icons.swap_vert_rounded,
                backgroundColor: const Color(0xFFFFF3CD),
                textColor: const Color(0xFF6B5000),
                borderColor: const Color(0xFFE6B800),
              ),
            if (request.distance.isNotEmpty && request.distance != '—')
              _Chip(
                label: request.isRoundTrip
                    ? (request.distance.contains('×')
                        ? request.distance
                        : '${request.distance} × 2')
                    : request.distance,
                icon: Icons.straighten_rounded,
              ),
            if (request.duration.isNotEmpty && request.duration != '—')
              _Chip(
                label: request.isRoundTrip
                    ? (request.duration.contains('×')
                        ? request.duration
                        : '${request.duration} × 2')
                    : request.duration,
                icon: Icons.schedule_rounded,
              ),
          ],
        ),
      ],
    );
  }
}

class _Marker extends StatelessWidget {
  const _Marker({required this.letter, required this.color});
  final String letter;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 22,
      height: 22,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      child: Text(
        letter,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 12,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    this.icon,
    this.backgroundColor,
    this.textColor,
    this.borderColor,
  });
  final String label;
  final IconData? icon;
  final Color? backgroundColor;
  final Color? textColor;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: backgroundColor ?? Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: borderColor ?? GtColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 15, color: textColor ?? GtColors.textSecondary),
            const SizedBox(width: 6),
          ],
          Text(
            label,
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: textColor ?? GtColors.text,
            ),
          ),
        ],
      ),
    );
  }
}
