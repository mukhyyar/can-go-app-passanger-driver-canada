import 'package:flutter/material.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';

import 'offer_helpers.dart';

typedef OfferSubmitFn = Future<void> Function(OfferDraft draft);

const _optionCatalog = <(String key, String label, IconData icon)>[
  ('wifi', 'Free Wi-Fi', Icons.wifi),
  ('charger', 'Charger', Icons.power),
  ('water', 'Water', Icons.water_drop_outlined),
  ('wheelchair', 'Disabled', Icons.accessible),
  ('name_sign', 'Name sign', Icons.badge_outlined),
];

Future<bool?> showYourOfferSheet({
  required BuildContext context,
  required DriverRequest request,
  required List<DriverVehicle> vehicles,
  required OfferDraft draft,
  required OfferSubmitFn onSubmit,
  DriverOfferSummary? existingOffer,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) {
      return _YourOfferSheet(
        request: request,
        vehicles: vehicles,
        initialDraft: draft.copy(),
        onSubmit: onSubmit,
        existingOffer: existingOffer,
      );
    },
  );
}

class _YourOfferSheet extends StatefulWidget {
  const _YourOfferSheet({
    required this.request,
    required this.vehicles,
    required this.initialDraft,
    required this.onSubmit,
    this.existingOffer,
  });

  final DriverRequest request;
  final List<DriverVehicle> vehicles;
  final OfferDraft initialDraft;
  final OfferSubmitFn onSubmit;
  final DriverOfferSummary? existingOffer;

  @override
  State<_YourOfferSheet> createState() => _YourOfferSheetState();
}

class _YourOfferSheetState extends State<_YourOfferSheet> {
  late OfferDraft _draft;
  late final TextEditingController _outCtrl;
  late final TextEditingController _retCtrl;
  bool _submitting = false;
  String? _error;
  bool _preview = false;

  @override
  void initState() {
    super.initState();
    _draft = widget.initialDraft;
    if (_draft.vehicleId == null && widget.vehicles.isNotEmpty) {
      _draft.vehicleId = widget.vehicles.first.id;
    }
    for (final r in widget.request.requiredOptions) {
      _draft.selectedOptions.add(r);
    }
    if ((widget.request.signage ?? '').trim().isNotEmpty) {
      _draft.selectedOptions.add('name_sign');
    }
    final existing = widget.existingOffer;
    if (existing != null) {
      _draft.outboundPrice ??= existing.outboundPrice ?? existing.bidAmount;
      _draft.returnPrice ??= existing.returnPrice;
      _draft.validForSeconds ??= existing.validForSeconds;
      _draft.vehicleId ??= existing.vehicleId;
      _draft.selectedOptions.addAll(existing.selectedOptions);
    }
    _outCtrl = TextEditingController(
      text: _draft.outboundPrice == null
          ? ''
          : _draft.outboundPrice!.toStringAsFixed(
              (_draft.outboundPrice! % 1 == 0) ? 0 : 2,
            ),
    );
    _retCtrl = TextEditingController(
      text: _draft.returnPrice == null
          ? ''
          : _draft.returnPrice!.toStringAsFixed(
              (_draft.returnPrice! % 1 == 0) ? 0 : 2,
            ),
    );
  }

  @override
  void dispose() {
    _outCtrl.dispose();
    _retCtrl.dispose();
    super.dispose();
  }

  DriverVehicle? get _vehicle {
    final id = _draft.vehicleId;
    if (id == null) return null;
    try {
      return widget.vehicles.firstWhere((v) => v.id == id);
    } catch (_) {
      return widget.vehicles.isEmpty ? null : widget.vehicles.first;
    }
  }

  String get _currency => widget.request.currency;

  double get _commissionPct =>
      widget.request.pricing?.platformCommissionPct ??
      widget.existingOffer?.platformCommissionPct ??
      0;

  void _syncPricesFromFields() {
    _draft.outboundPrice = double.tryParse(_outCtrl.text.trim());
    if (widget.request.isRoundTrip) {
      _draft.returnPrice = double.tryParse(_retCtrl.text.trim());
    } else {
      _draft.returnPrice = null;
    }
  }

  Future<void> _pickValidity() async {
    final selected = await showModalBottomSheet<int>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: GtColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
                child: Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Limited time offer',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.pop(ctx),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
              Flexible(
                child: ListView(
                  shrinkWrap: true,
                  children: [
                    for (final opt in kOfferValidityOptions)
                      ListTile(
                        title: Text(opt.label),
                        onTap: () => Navigator.pop(ctx, opt.seconds),
                        trailing: _draft.validForSeconds == opt.seconds
                            ? const Icon(Icons.check, color: GtColors.brand)
                            : null,
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
            ],
          ),
        );
      },
    );
    if (selected != null) {
      setState(() => _draft.validForSeconds = selected);
    }
  }

  Future<void> _pickVehicle() async {
    if (widget.vehicles.isEmpty) return;
    final selected = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: [
              const ListTile(
                title: Text(
                  'Select vehicle',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
              for (final v in widget.vehicles)
                ListTile(
                  leading: const Icon(Icons.directions_car_outlined),
                  title: Text(v.name),
                  subtitle: Text('${v.plate} · ${v.vehicleClass}'),
                  trailing: _draft.vehicleId == v.id
                      ? const Icon(Icons.check, color: GtColors.brand)
                      : null,
                  onTap: () => Navigator.pop(ctx, v.id),
                ),
            ],
          ),
        );
      },
    );
    if (selected != null) setState(() => _draft.vehicleId = selected);
  }

  String? _validate() {
    _syncPricesFromFields();
    if (widget.vehicles.isEmpty) {
      return 'No eligible vehicle. Add a vehicle in settings first.';
    }
    if (_draft.vehicleId == null) return 'Select a vehicle';
    if (_draft.validForSeconds == null) return 'Select offer validity';
    final out = _draft.outboundPrice;
    if (out == null || out <= 0) return 'Enter a valid A → B price';
    if (widget.request.isRoundTrip) {
      final ret = _draft.returnPrice;
      if (ret == null || ret < 0) return 'Enter a valid B → A price';
      if (ret == 0 && out == 0) return 'Offer total must be greater than zero';
    }
    final total = out + (_draft.returnPrice ?? 0);
    final min = widget.request.pricing?.minBid;
    final max = widget.request.pricing?.maxBid;
    if (min != null && total + 0.001 < min) {
      return 'Total below minimum (${MoneyFormat.formatFlexible(min, _currency)})';
    }
    if (max != null && total - 0.001 > max) {
      return 'Total above maximum (${MoneyFormat.formatFlexible(max, _currency)})';
    }
    for (final r in widget.request.requiredOptions) {
      if (!_draft.selectedOptions.contains(r)) {
        return 'Required option missing: $r';
      }
    }
    if ((widget.request.signage ?? '').trim().isNotEmpty &&
        !_draft.selectedOptions.contains('name_sign')) {
      return 'Name sign is required for this passenger';
    }
    return null;
  }

  Future<void> _submit() async {
    final err = _validate();
    if (err != null) {
      setState(() => _error = err);
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await widget.onSubmit(_draft);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = e.toString().replaceFirst('ApiException(', '').replaceAll(RegExp(r'\)$'), '');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    final height = MediaQuery.of(context).size.height * 0.92;
    final v = _vehicle;
    final validityLabel = kOfferValidityOptions
        .where((o) => o.seconds == _draft.validForSeconds)
        .map((o) => o.label)
        .cast<String?>()
        .firstWhere((_) => true, orElse: () => null);

    if (_preview) {
      return _PreviewPane(
        request: widget.request,
        vehicle: v,
        draft: _draft,
        currency: _currency,
        commissionPct: _commissionPct,
        validityLabel: validityLabel,
        onBack: () => setState(() => _preview = false),
      );
    }

    return Container(
      height: height,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          const SizedBox(height: 8),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: GtColors.border,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 8, 0),
            child: Row(
              children: [
                const Expanded(
                  child: Text(
                    'Your offer',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                  ),
                ),
                TextButton.icon(
                  onPressed: () {
                    final err = _validate();
                    if (err != null) {
                      setState(() => _error = err);
                      return;
                    }
                    setState(() {
                      _error = null;
                      _preview = true;
                    });
                  },
                  icon: const Icon(Icons.visibility_outlined,
                      color: GtColors.brand, size: 20),
                  label: const Text(
                    'Preview',
                    style: TextStyle(
                      color: GtColors.brand,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context, false),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              padding: EdgeInsets.fromLTRB(16, 8, 16, 24 + bottom),
              children: [
                _FieldRow(
                  icon: Icons.hourglass_empty,
                  label: 'Valid for',
                  value: validityLabel ?? 'Select',
                  onTap: _pickValidity,
                ),
                const SizedBox(height: 10),
                _FieldRow(
                  icon: Icons.directions_car_filled,
                  label: v == null ? 'Select vehicle' : v.name,
                  value: v?.plate ?? '',
                  onTap: _pickVehicle,
                ),
                const SizedBox(height: 16),
                const Text(
                  'Options',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    for (final opt in _optionCatalog)
                      _OptionTile(
                        label: opt.$2,
                        icon: opt.$3,
                        selected: _draft.selectedOptions.contains(opt.$1),
                        requiredOption:
                            widget.request.requiredOptions.contains(opt.$1) ||
                                (opt.$1 == 'name_sign' &&
                                    (widget.request.signage ?? '')
                                        .trim()
                                        .isNotEmpty),
                        onTap: () {
                          setState(() {
                            if (_draft.selectedOptions.contains(opt.$1)) {
                              final required = widget.request.requiredOptions
                                      .contains(opt.$1) ||
                                  (opt.$1 == 'name_sign' &&
                                      (widget.request.signage ?? '')
                                          .trim()
                                          .isNotEmpty);
                              if (!required) {
                                _draft.selectedOptions.remove(opt.$1);
                              }
                            } else {
                              _draft.selectedOptions.add(opt.$1);
                            }
                          });
                        },
                      ),
                  ],
                ),
                const SizedBox(height: 16),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEAF7EE),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Text(
                    'A lower price usually improves selection odds. Enter an all-inclusive offer covering parking, tolls, and waiting where applicable — do not add surprise fees later.',
                    style: TextStyle(height: 1.35, fontSize: 13),
                  ),
                ),
                const SizedBox(height: 16),
                _PriceRow(
                  label: 'Price A → B',
                  currency: _currency,
                  controller: _outCtrl,
                  onChanged: (_) => setState(_syncPricesFromFields),
                ),
                if (widget.request.isRoundTrip) ...[
                  const SizedBox(height: 10),
                  _PriceRow(
                    label: 'Price B → A',
                    currency: _currency,
                    controller: _retCtrl,
                    onChanged: (_) => setState(_syncPricesFromFields),
                  ),
                ],
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 14,
                        ),
                        decoration: BoxDecoration(
                          color: GtColors.bgGrey,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          _commissionPct > 0
                              ? '${_commissionPct.toStringAsFixed(_commissionPct % 1 == 0 ? 0 : 1)}% Commission'
                              : 'Commission from fare rules',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    SizedBox(
                      width: 56,
                      height: 56,
                      child: Material(
                        color: _submitting ? GtColors.textMuted : GtColors.green,
                        borderRadius: BorderRadius.circular(14),
                        child: InkWell(
                          onTap: _submitting ? null : _submit,
                          borderRadius: BorderRadius.circular(14),
                          child: Center(
                            child: _submitting
                                ? const SizedBox(
                                    width: 22,
                                    height: 22,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2.5,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Icon(
                                    Icons.send_rounded,
                                    color: Colors.white,
                                  ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                if (widget.request.pricing != null) ...[
                  const SizedBox(height: 16),
                  _GuidanceBar(
                    currency: _currency,
                    min: widget.request.pricing!.minBid,
                    max: widget.request.pricing!.maxBid,
                    value: (_draft.outboundPrice ?? 0) +
                        (_draft.returnPrice ?? 0),
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    _error!,
                    style: const TextStyle(color: GtColors.brand, fontSize: 13),
                  ),
                ],
                if (widget.vehicles.isEmpty) ...[
                  const SizedBox(height: 12),
                  const Text(
                    'No eligible vehicles. Complete vehicle setup before offering.',
                    style: TextStyle(color: GtColors.textSecondary),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PreviewPane extends StatelessWidget {
  const _PreviewPane({
    required this.request,
    required this.vehicle,
    required this.draft,
    required this.currency,
    required this.commissionPct,
    required this.validityLabel,
    required this.onBack,
  });

  final DriverRequest request;
  final DriverVehicle? vehicle;
  final OfferDraft draft;
  final String currency;
  final double commissionPct;
  final String? validityLabel;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final total =
        (draft.outboundPrice ?? 0) + (draft.returnPrice ?? 0);
    final fee = commissionPct > 0 ? total * commissionPct / 100 : 0.0;
    final net = total - fee;

    return Container(
      height: MediaQuery.of(context).size.height * 0.85,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Passenger preview',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                ),
              ),
              TextButton(
                onPressed: onBack,
                child: const Text('Back to edit'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Read-only view of what the passenger will see before you submit.',
            style: TextStyle(color: GtColors.textSecondary, fontSize: 13),
          ),
          const SizedBox(height: 16),
          GtCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  vehicle?.name ?? 'Vehicle',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
                ),
                if (vehicle != null)
                  Text(
                    '${vehicle!.plate} · ${vehicle!.vehicleClass}',
                    style: const TextStyle(color: GtColors.textSecondary),
                  ),
                const SizedBox(height: 10),
                Text(
                  'Valid for ${validityLabel ?? '—'}',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final o in draft.selectedOptions)
                      Chip(
                        label: Text(o.replaceAll('_', ' ')),
                        visualDensity: VisualDensity.compact,
                      ),
                  ],
                ),
                const Divider(height: 24),
                Text(
                  'A → B  ${MoneyFormat.formatFlexible(draft.outboundPrice ?? 0, currency)}',
                ),
                if (request.isRoundTrip)
                  Text(
                    'B → A  ${MoneyFormat.formatFlexible(draft.returnPrice ?? 0, currency)}',
                  ),
                const SizedBox(height: 8),
                Text(
                  'Total  ${MoneyFormat.formatFlexible(total, currency)}',
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 18,
                  ),
                ),
                if (commissionPct > 0) ...[
                  const SizedBox(height: 6),
                  Text(
                    'Platform fee (~${commissionPct.toStringAsFixed(0)}%): ${MoneyFormat.formatFlexible(fee, currency)}',
                    style: const TextStyle(
                      color: GtColors.textSecondary,
                      fontSize: 13,
                    ),
                  ),
                  Text(
                    'Your estimated net: ${MoneyFormat.formatFlexible(net, currency)}',
                    style: const TextStyle(
                      color: GtColors.textSecondary,
                      fontSize: 13,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const Spacer(),
          const Text(
            'Submitting happens only from the edit sheet — Preview never sends an offer.',
            style: TextStyle(fontSize: 12, color: GtColors.textMuted),
          ),
        ],
      ),
    );
  }
}

class _FieldRow extends StatelessWidget {
  const _FieldRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: GtColors.bgGrey,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
          child: Row(
            children: [
              Icon(icon, size: 20, color: GtColors.textSecondary),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
              if (value.isNotEmpty)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    border: Border.all(color: GtColors.border),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(value, style: const TextStyle(fontSize: 12)),
                ),
              const Icon(Icons.keyboard_arrow_down),
            ],
          ),
        ),
      ),
    );
  }
}

class _OptionTile extends StatelessWidget {
  const _OptionTile({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
    this.requiredOption = false,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final bool requiredOption;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 96,
      height: 96,
      child: Material(
        color: selected ? GtColors.soft : Colors.white,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: selected ? GtColors.brand : GtColors.border,
                width: selected ? 2 : 1,
              ),
            ),
            padding: const EdgeInsets.all(8),
            child: Stack(
              children: [
                Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(icon, size: 26),
                      const SizedBox(height: 6),
                      Text(
                        label,
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 11),
                      ),
                      if (requiredOption)
                        const Text(
                          'REQUIRED',
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                            color: GtColors.brand,
                          ),
                        ),
                    ],
                  ),
                ),
                if (selected)
                  const Positioned(
                    right: 0,
                    top: 0,
                    child: Icon(Icons.check_circle,
                        size: 18, color: GtColors.brand),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PriceRow extends StatelessWidget {
  const _PriceRow({
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
        Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [DecimalTextInputFormatter()],
          onChanged: onChanged,
          decoration: InputDecoration(
            prefixText: '${MoneyFormat.symbolFor(currency)} ',
            filled: true,
            fillColor: Colors.white,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: GtColors.border),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: GtColors.border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: GtColors.brand, width: 1.5),
            ),
          ),
        ),
      ],
    );
  }
}

class _GuidanceBar extends StatelessWidget {
  const _GuidanceBar({
    required this.currency,
    required this.min,
    required this.max,
    required this.value,
  });

  final String currency;
  final double min;
  final double max;
  final double value;

  @override
  Widget build(BuildContext context) {
    final span = (max - min).abs() < 0.01 ? 1.0 : (max - min);
    final t = ((value - min) / span).clamp(0.0, 1.0);
    String band = 'Typical';
    if (value > 0) {
      if (t <= 0.33) {
        band = 'Competitive';
      } else if (t >= 0.67) {
        band = 'Above typical';
      }
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              MoneyFormat.formatFlexible(min, currency),
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
            ),
            const Spacer(),
            Text(
              MoneyFormat.formatFlexible(max, currency),
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
            ),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: SizedBox(
            height: 10,
            child: Stack(
              children: [
                Container(
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
                if (value > 0)
                  Align(
                    alignment: Alignment(-1 + 2 * t, 0),
                    child: Container(
                      width: 4,
                      height: 10,
                      color: Colors.white,
                    ),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          band,
          style: const TextStyle(
            fontSize: 12,
            color: GtColors.textSecondary,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
