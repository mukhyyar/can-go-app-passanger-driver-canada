import 'package:flutter/material.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';

import 'offer_helpers.dart';
import 'price_range_heatmap_bar.dart';

const kOfferOptionCatalog = <(String key, String label, IconData icon)>[
  ('wifi', 'Free Wi-Fi', Icons.wifi),
  ('charger', 'Charger', Icons.power),
  ('water', 'Water', Icons.water_drop_outlined),
  ('wheelchair', 'Disabled', Icons.accessible),
  ('name_sign', 'Name sign', Icons.badge_outlined),
];

/// Full offer form embedded on the request detail screen (no popup).
class InlineOfferForm extends StatefulWidget {
  const InlineOfferForm({
    super.key,
    required this.request,
    required this.vehicles,
    required this.draft,
    required this.outCtrl,
    required this.retCtrl,
    required this.submitting,
    required this.onChanged,
    required this.onSubmit,
    this.existingOffer,
    this.error,
  });

  final DriverRequest request;
  final List<DriverVehicle> vehicles;
  final OfferDraft draft;
  final TextEditingController outCtrl;
  final TextEditingController retCtrl;
  final bool submitting;
  final VoidCallback onChanged;
  final Future<void> Function() onSubmit;
  final DriverOfferSummary? existingOffer;
  final String? error;

  @override
  State<InlineOfferForm> createState() => _InlineOfferFormState();
}

class _InlineOfferFormState extends State<InlineOfferForm> {
  @override
  void initState() {
    super.initState();
    widget.outCtrl.addListener(_onPriceChanged);
    widget.retCtrl.addListener(_onPriceChanged);
  }

  @override
  void didUpdateWidget(InlineOfferForm oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.outCtrl != widget.outCtrl) {
      oldWidget.outCtrl.removeListener(_onPriceChanged);
      widget.outCtrl.addListener(_onPriceChanged);
    }
    if (oldWidget.retCtrl != widget.retCtrl) {
      oldWidget.retCtrl.removeListener(_onPriceChanged);
      widget.retCtrl.addListener(_onPriceChanged);
    }
  }

  @override
  void dispose() {
    widget.outCtrl.removeListener(_onPriceChanged);
    widget.retCtrl.removeListener(_onPriceChanged);
    super.dispose();
  }

  void _onPriceChanged() {
    if (mounted) setState(() {});
  }

  DriverVehicle? get _vehicle {
    final id = widget.draft.vehicleId;
    if (id == null) {
      return widget.vehicles.isEmpty ? null : widget.vehicles.first;
    }
    try {
      return widget.vehicles.firstWhere((v) => v.id == id);
    } catch (_) {
      return widget.vehicles.isEmpty ? null : widget.vehicles.first;
    }
  }

  String get _currency => widget.request.currency;


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
                        trailing: widget.draft.validForSeconds == opt.seconds
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
      widget.draft.validForSeconds = selected;
      widget.onChanged();
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
                Builder(
                  builder: (_) {
                    final isApproved = v.isActive &&
                        v.approvalStatus.toUpperCase() == 'APPROVED' &&
                        v.inspectionStatus.toUpperCase() == 'APPROVED';
                    final badge = !v.isActive
                        ? 'Inactive'
                        : (v.approvalStatus.toUpperCase() != 'APPROVED'
                            ? 'Approval: ${v.approvalStatus}'
                            : (v.inspectionStatus.toUpperCase() != 'APPROVED'
                                ? 'Inspection: ${v.inspectionStatus}'
                                : null));
                    return ListTile(
                      leading: Icon(
                        Icons.directions_car_outlined,
                        color: isApproved ? null : Colors.grey,
                      ),
                      title: Row(
                        children: [
                          Expanded(
                            child: Text(
                              v.name,
                              style: TextStyle(
                                color: isApproved ? Colors.black87 : Colors.grey.shade600,
                              ),
                            ),
                          ),
                          if (badge != null)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.amber.shade50,
                                borderRadius: BorderRadius.circular(4),
                                border: Border.all(color: Colors.amber.shade300),
                              ),
                              child: Text(
                                badge,
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.amber.shade900,
                                ),
                              ),
                            ),
                        ],
                      ),
                      subtitle: Text('${v.plate} · ${v.vehicleClass}'),
                      trailing: widget.draft.vehicleId == v.id
                          ? const Icon(Icons.check, color: GtColors.brand)
                          : null,
                      onTap: isApproved ? () => Navigator.pop(ctx, v.id) : null,
                    );
                  },
                ),
            ],
          ),
        );
      },
    );
    if (selected != null) {
      widget.draft.vehicleId = selected;
      widget.onChanged();
    }
  }

  void _toggleOption(String key) {
    final required = widget.request.requiredOptions.contains(key) ||
        (key == 'name_sign' &&
            (widget.request.signage ?? '').trim().isNotEmpty);
    if (widget.draft.selectedOptions.contains(key)) {
      if (!required) widget.draft.selectedOptions.remove(key);
    } else {
      widget.draft.selectedOptions.add(key);
    }
    widget.onChanged();
  }

  @override
  Widget build(BuildContext context) {
    final v = _vehicle;
    final validityLabel = kOfferValidityOptions
        .where((o) => o.seconds == widget.draft.validForSeconds)
        .map((o) => o.label)
        .cast<String?>()
        .firstWhere((_) => true, orElse: () => null);
    final isEdit = widget.existingOffer != null &&
        (widget.existingOffer!.isActive);

    // Ensure required options stay selected.
    for (final r in widget.request.requiredOptions) {
      widget.draft.selectedOptions.add(r);
    }
    if ((widget.request.signage ?? '').trim().isNotEmpty) {
      widget.draft.selectedOptions.add('name_sign');
    }

    final resolvedPricing = PriceRangeHeatmapBar.resolvePricing(
      pricing: widget.request.pricing,
      distanceStr: widget.request.distance,
      isRoundTrip: widget.request.isRoundTrip,
    );

    final isRoundTrip = widget.request.isRoundTrip;
    final legMin = isRoundTrip
        ? ((resolvedPricing.minBid / 2) * 100).roundToDouble() / 100.0
        : null;
    final legGuidance = isRoundTrip
        ? ((resolvedPricing.guidanceAmount / 2) * 100).roundToDouble() / 100.0
        : null;
    final legMax = isRoundTrip
        ? ((resolvedPricing.maxBid / 2) * 100).roundToDouble() / 100.0
        : null;

    final outVal = double.tryParse(widget.outCtrl.text.trim());
    final retVal = double.tryParse(widget.retCtrl.text.trim());
    final double? currentPrice;
    if (isRoundTrip) {
      currentPrice = (outVal != null || retVal != null)
          ? ((outVal ?? 0.0) + (retVal ?? 0.0))
          : null;
    } else {
      currentPrice = outVal;
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: GtColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            isEdit ? 'Edit your offer' : 'Your offer',
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 12),
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
              for (final opt in kOfferOptionCatalog)
                _OptionTile(
                  label: opt.$2,
                  icon: opt.$3,
                  selected: widget.draft.selectedOptions.contains(opt.$1),
                  requiredOption:
                      widget.request.requiredOptions.contains(opt.$1) ||
                          (opt.$1 == 'name_sign' &&
                              (widget.request.signage ?? '')
                                  .trim()
                                  .isNotEmpty),
                  onTap: () => _toggleOption(opt.$1),
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
            controller: widget.outCtrl,
            onChanged: (_) => widget.onChanged(),
            legMin: legMin,
            legGuidance: legGuidance,
            legMax: legMax,
          ),
          if (isRoundTrip) ...[
            const SizedBox(height: 12),
            _PriceRow(
              label: 'Price B → A',
              currency: _currency,
              controller: widget.retCtrl,
              onChanged: (_) => widget.onChanged(),
              legMin: legMin,
              legGuidance: legGuidance,
              legMax: legMax,
            ),
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: GtColors.soft,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: GtColors.brand.withValues(alpha: 0.2),
                ),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Total offer (A → B + B → A)',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: GtColors.text,
                    ),
                  ),
                  Text(
                    MoneyFormat.formatFlexible(currentPrice ?? 0, _currency),
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: GtColors.brand,
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 14),
          PriceRangeHeatmapBar(
            minBid: resolvedPricing.minBid,
            maxBid: resolvedPricing.maxBid,
            guidanceAmount: resolvedPricing.guidanceAmount,
            currency: _currency,
            currentPrice: currentPrice,
            isRoundTrip: widget.request.isRoundTrip,
          ),
          const SizedBox(height: 16),
          GtGreenButton(
            label:
                isEdit ? 'Review updated offer' : 'Continue to offer customer',
            onPressed: widget.submitting ? null : () => widget.onSubmit(),
          ),
          if (widget.error != null) ...[
            const SizedBox(height: 12),
            Text(
              widget.error!,
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
    this.legMin,
    this.legGuidance,
    this.legMax,
  });

  final String label;
  final String currency;
  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final double? legMin;
  final double? legGuidance;
  final double? legMax;

  @override
  Widget build(BuildContext context) {
    final hasLegRange =
        legMin != null && legGuidance != null && legMax != null;
    final recStr = hasLegRange
        ? (legGuidance! % 1 == 0
            ? legGuidance!.toStringAsFixed(0)
            : legGuidance!.toStringAsFixed(2))
        : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
            if (hasLegRange)
              GestureDetector(
                onTap: () {
                  controller.text = recStr!;
                  controller.selection = TextSelection.collapsed(
                    offset: controller.text.length,
                  );
                  onChanged(controller.text);
                },
                child: Text(
                  'Recommended: ${MoneyFormat.formatFlexible(legGuidance!, currency)}',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: GtColors.brand,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [DecimalTextInputFormatter()],
          onChanged: onChanged,
          decoration: InputDecoration(
            prefixText: '${MoneyFormat.symbolFor(currency)} ',
            hintText: recStr,
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
        if (hasLegRange) ...[
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Min: ${MoneyFormat.formatFlexible(legMin!, currency)}',
                style: const TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w600,
                  color: GtColors.textSecondary,
                ),
              ),
              Text(
                'Recommended: ${MoneyFormat.formatFlexible(legGuidance!, currency)}',
                style: const TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w600,
                  color: GtColors.textSecondary,
                ),
              ),
              Text(
                'Max: ${MoneyFormat.formatFlexible(legMax!, currency)}',
                style: const TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w600,
                  color: GtColors.textSecondary,
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}
