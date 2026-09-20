import 'package:flutter/material.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';

import 'offer_helpers.dart';

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
                ListTile(
                  leading: const Icon(Icons.directions_car_outlined),
                  title: Text(v.name),
                  subtitle: Text('${v.plate} · ${v.vehicleClass}'),
                  trailing: widget.draft.vehicleId == v.id
                      ? const Icon(Icons.check, color: GtColors.brand)
                      : null,
                  onTap: () => Navigator.pop(ctx, v.id),
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
          ),
          if (widget.request.isRoundTrip) ...[
            const SizedBox(height: 10),
            _PriceRow(
              label: 'Price B → A',
              currency: _currency,
              controller: widget.retCtrl,
              onChanged: (_) => widget.onChanged(),
            ),
          ],
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
