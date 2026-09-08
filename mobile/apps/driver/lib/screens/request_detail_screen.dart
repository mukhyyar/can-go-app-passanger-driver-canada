import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../offer/offer_helpers.dart';
import '../offer/your_offer_sheet.dart';
import '../state/app_state.dart';

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
  bool _mapFullscreen = false;
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
        final existing = detail.myOffer;
        if (existing != null) {
          _draft.outboundPrice =
              existing.outboundPrice ?? existing.bidAmount;
          _draft.returnPrice = existing.returnPrice;
          _draft.validForSeconds = existing.validForSeconds;
          _draft.vehicleId = existing.vehicleId ?? _draft.vehicleId;
          _draft.selectedOptions = {...existing.selectedOptions};
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

  DriverVehicle? get _selectedVehicle {
    final id = _draft.vehicleId;
    if (id == null || _vehicles.isEmpty) {
      return _vehicles.isEmpty ? null : _vehicles.first;
    }
    try {
      return _vehicles.firstWhere((v) => v.id == id);
    } catch (_) {
      return _vehicles.first;
    }
  }

  void _persistDraft() {
    final s = context.read<AppState>();
    _draft.outboundPrice = double.tryParse(_outCtrl.text.trim());
    if (_request?.isRoundTrip == true) {
      _draft.returnPrice = double.tryParse(_retCtrl.text.trim());
    }
    s.saveOfferDraft(widget.requestId, _draft);
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

  Future<void> _openOfferSheet() async {
    final req = _request;
    if (req == null) return;
    _persistDraft();
    final submitted = await showYourOfferSheet(
      context: context,
      request: req,
      vehicles: _vehicles,
      draft: _draft,
      existingOffer: req.myOffer,
      onSubmit: (draft) async {
        setState(() => _submitting = true);
        try {
          await context.read<AppState>().submitOfferDraft(req.id, draft);
          _draft = draft.copy();
        } finally {
          if (mounted) setState(() => _submitting = false);
        }
      },
    );
    if (submitted == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Offer submitted')),
      );
      await _load();
    } else {
      _persistDraft();
    }
  }

  Future<void> _quickSubmit() async {
    final req = _request;
    if (req == null) return;
    if (_submitting) return;
    _persistDraft();
    if (_draft.validForSeconds == null) {
      await _openOfferSheet();
      return;
    }
    final out = double.tryParse(_outCtrl.text.trim());
    if (out == null || out <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a valid price')),
      );
      return;
    }
    setState(() => _submitting = true);
    try {
      await context.read<AppState>().submitOfferDraft(req.id, _draft);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Offer submitted')),
      );
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$e')),
      );
      await _openOfferSheet();
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
                GtGreenButton(label: 'Back to requests', onPressed: () => context.go('/')),
              ],
            ),
          ),
        ),
      );
    }

    final req = _request!;
    final vehicle = _selectedVehicle;
    final age = driverRequestAgeLabel(req);
    final currency = req.currency;
    final commission = req.pricing?.platformCommissionPct ??
        req.myOffer?.platformCommissionPct;

    if (_mapFullscreen &&
        req.fromLat != null &&
        req.fromLng != null) {
      return Scaffold(
        body: Stack(
          children: [
            Positioned.fill(
              child: GtGoogleRouteMap(
                fromLat: req.fromLat!,
                fromLng: req.fromLng!,
                fromLabel: req.from,
                toLat: req.toLat,
                toLng: req.toLng,
                toLabel: req.to,
                distanceLabel: req.distance,
                height: MediaQuery.of(context).size.height,
              ),
            ),
            SafeArea(
              child: Align(
                alignment: Alignment.topRight,
                child: IconButton.filled(
                  style: IconButton.styleFrom(backgroundColor: Colors.white),
                  onPressed: () => setState(() => _mapFullscreen = false),
                  icon: const Icon(Icons.close, color: GtColors.text),
                ),
              ),
            ),
          ],
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
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
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
                      if ((req.signage ?? '').trim().isNotEmpty)
                        const _Chip(
                          label: 'Meeting with a name sign',
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
                    children: [
                      for (final c in (req.vehicleClassIds.isEmpty
                          ? [req.vehicleNeed]
                          : req.vehicleClassIds))
                        _Chip(label: c),
                    ],
                  ),
                  const SizedBox(height: 16),
                  if (req.fromLat != null && req.fromLng != null)
                    Stack(
                      children: [
                        GtGoogleRouteMap(
                          fromLat: req.fromLat!,
                          fromLng: req.fromLng!,
                          fromLabel: req.from,
                          toLat: req.toLat,
                          toLng: req.toLng,
                          toLabel: req.to,
                          distanceLabel: '${req.distance} · ${req.duration}',
                          height: 220,
                        ),
                        Positioned(
                          top: 10,
                          right: 10,
                          child: Material(
                            color: Colors.white,
                            shape: const CircleBorder(),
                            elevation: 1,
                            child: IconButton(
                              onPressed: () =>
                                  setState(() => _mapFullscreen = true),
                              icon: const Icon(Icons.fullscreen, size: 20),
                            ),
                          ),
                        ),
                      ],
                    )
                  else
                    const GtMockMap(),
                  if (req.hasOffer && req.myOffer != null) ...[
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEAF7EE),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Offer submitted',
                            style: TextStyle(fontWeight: FontWeight.w800),
                          ),
                          Text(
                            'Your offer: ${MoneyFormat.formatFlexible(req.myOffer!.bidAmount, currency)} · ${req.myOffer!.status}',
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              TextButton(
                                onPressed: _openOfferSheet,
                                child: const Text('Edit offer'),
                              ),
                              TextButton(
                                onPressed: _withdraw,
                                child: const Text(
                                  'Withdraw offer',
                                  style: TextStyle(color: GtColors.brand),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 120),
                ],
              ),
            ),
            _StickyOfferPanel(
              vehicle: vehicle,
              optionsSummary: _optionsSummary(),
              isRoundTrip: req.isRoundTrip,
              currency: currency,
              outCtrl: _outCtrl,
              retCtrl: _retCtrl,
              commissionPct: commission,
              guidance: req.pricing,
              submitting: _submitting,
              onEdit: _openOfferSheet,
              onSubmit: _quickSubmit,
              onPriceChanged: (_) => _persistDraft(),
            ),
          ],
        ),
      ),
    );
  }

  String _optionsSummary() {
    if (_draft.selectedOptions.isEmpty) return 'No options added';
    return _draft.selectedOptions
        .map((e) => e.replaceAll('_', ' '))
        .join(', ');
  }

  List<Widget> _childSeatChips(DriverRequest req) {
    final out = <Widget>[];
    final child = (req.childSeats['child'] as num?)?.toInt() ?? 0;
    final infant = (req.childSeats['infant'] as num?)?.toInt() ?? 0;
    final booster = (req.childSeats['booster'] as num?)?.toInt() ?? 0;
    if (child > 0) out.add(_Chip(label: 'Children × $child'));
    if (infant > 0) out.add(_Chip(label: 'Infant × $infant'));
    if (booster > 0) out.add(_Chip(label: 'Booster × $booster'));
    return out;
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
        if (request.isRoundTrip && request.returnDatetimeLabel != null) ...[
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Text.rich(
                  TextSpan(
                    children: [
                      const TextSpan(
                        text: 'Return: ',
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
                      TextSpan(text: request.returnDatetimeLabel),
                    ],
                  ),
                ),
              ),
              if (request.returnWaitMin != null)
                _WaitChip(label: '${request.returnWaitMin} min'),
            ],
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
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _Marker(letter: 'A', color: Colors.black),
            const SizedBox(width: 10),
            Expanded(child: Text(request.from)),
          ],
        ),
        Padding(
          padding: const EdgeInsets.only(left: 10, top: 6, bottom: 6),
          child: Row(
            children: [
              Icon(
                request.isRoundTrip ? Icons.swap_vert : Icons.arrow_downward,
                size: 18,
                color: GtColors.textMuted,
              ),
              const SizedBox(width: 12),
              Text(
                '${request.distance}  ·  ${request.duration}',
                style: const TextStyle(
                  color: GtColors.textSecondary,
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _Marker(letter: 'B', color: Colors.black),
            const SizedBox(width: 10),
            Expanded(child: Text(request.to)),
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
  const _Chip({required this.label, this.icon});
  final String label;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: GtColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 16),
            const SizedBox(width: 6),
          ],
          Text(label, style: const TextStyle(fontSize: 13)),
        ],
      ),
    );
  }
}

class _StickyOfferPanel extends StatelessWidget {
  const _StickyOfferPanel({
    required this.vehicle,
    required this.optionsSummary,
    required this.isRoundTrip,
    required this.currency,
    required this.outCtrl,
    required this.retCtrl,
    required this.commissionPct,
    required this.guidance,
    required this.submitting,
    required this.onEdit,
    required this.onSubmit,
    required this.onPriceChanged,
  });

  final DriverVehicle? vehicle;
  final String optionsSummary;
  final bool isRoundTrip;
  final String currency;
  final TextEditingController outCtrl;
  final TextEditingController retCtrl;
  final double? commissionPct;
  final PricingGuidance? guidance;
  final bool submitting;
  final VoidCallback onEdit;
  final VoidCallback onSubmit;
  final ValueChanged<String> onPriceChanged;

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Material(
      elevation: 12,
      color: Colors.white,
      child: Padding(
        padding: EdgeInsets.fromLTRB(14, 12, 14, 12 + bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                const Icon(Icons.circle, size: 10),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    vehicle?.name ?? 'No vehicle',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                if (vehicle != null)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      border: Border.all(color: GtColors.border),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      vehicle!.plate,
                      style: const TextStyle(fontSize: 12),
                    ),
                  ),
                const SizedBox(width: 8),
                Material(
                  color: GtColors.bgGrey,
                  shape: const CircleBorder(),
                  child: IconButton(
                    onPressed: onEdit,
                    icon: const Icon(Icons.edit_outlined, size: 18),
                  ),
                ),
              ],
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                optionsSummary,
                style: const TextStyle(
                  color: GtColors.textSecondary,
                  fontSize: 12,
                ),
              ),
            ),
            const SizedBox(height: 10),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: Column(
                    children: [
                      _MiniPriceField(
                        label: 'Price A → B',
                        currency: currency,
                        controller: outCtrl,
                        onChanged: onPriceChanged,
                      ),
                      if (isRoundTrip) ...[
                        const SizedBox(height: 8),
                        _MiniPriceField(
                          label: 'Price B → A',
                          currency: currency,
                          controller: retCtrl,
                          onChanged: onPriceChanged,
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  width: 78,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color: GtColors.bgGrey,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    commissionPct != null && commissionPct! > 0
                        ? '${commissionPct!.toStringAsFixed(commissionPct! % 1 == 0 ? 0 : 1)}%\nCommission'
                        : 'Commission',
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 11, height: 1.2),
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  width: 52,
                  height: 52,
                  child: Material(
                    color: submitting ? GtColors.textMuted : GtColors.green,
                    borderRadius: BorderRadius.circular(12),
                    child: InkWell(
                      onTap: submitting ? null : onSubmit,
                      borderRadius: BorderRadius.circular(12),
                      child: Center(
                        child: submitting
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.send_rounded,
                                color: Colors.white),
                      ),
                    ),
                  ),
                ),
              ],
            ),
            if (guidance != null) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  Text(
                    MoneyFormat.formatFlexible(guidance!.minBid, currency),
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: Container(
                        height: 8,
                        decoration: const BoxDecoration(
                          gradient: LinearGradient(
                            colors: [
                              Color(0xFF1B7A45),
                              Color(0xFFF5A623),
                              Color(0xFFB41B1D),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    MoneyFormat.formatFlexible(guidance!.maxBid, currency),
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _MiniPriceField extends StatelessWidget {
  const _MiniPriceField({
    required this.label,
    required this.currency,
    required this.controller,
    required this.onChanged,
  });

  final String label;
  final String currency;
  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [DecimalTextInputFormatter()],
          onChanged: onChanged,
          decoration: InputDecoration(
            isDense: true,
            prefixText: '${MoneyFormat.symbolFor(currency)} ',
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        ),
      ],
    );
  }
}
