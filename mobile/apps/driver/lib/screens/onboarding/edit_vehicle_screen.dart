import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import '../settings/vehicle_form_widgets.dart';

class EditVehicleScreen extends StatefulWidget {
  const EditVehicleScreen({super.key, this.vehicleId});

  final String? vehicleId;

  @override
  State<EditVehicleScreen> createState() => _EditVehicleScreenState();
}

class _EditVehicleScreenState extends State<EditVehicleScreen> {
  static const _amenityIcons = <String, IconData>{
    'Free Wi-Fi': Icons.wifi,
    'Water': Icons.water_drop_outlined,
    'Charger': Icons.power,
    'Disabled': Icons.accessible,
    'Air conditioner': Icons.ac_unit,
  };

  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _nameError;
  String? _plateError;
  String? _yearError;

  final _name = TextEditingController();
  final _plate = TextEditingController();
  final _color = TextEditingController();
  final _year = TextEditingController();
  String _class = 'sedan';
  int _seats = 4;
  int _luggage = 2;
  int _before = 10;
  int _after = 10;
  final Map<String, bool> _amenities = {};
  DateTime? _loadedUpdatedAt;
  String? _boundVehicleId;
  String? _targetVehicleId;
  bool _dirty = false;

  @override
  void initState() {
    super.initState();
    _targetVehicleId = widget.vehicleId;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final s = context.read<AppState>();
      if (_targetVehicleId != null && _targetVehicleId!.isNotEmpty) {
        s.primaryVehicleId = _targetVehicleId;
      }
      if (s.isAuthenticated) {
        await s.loadDriverVehicles();
        await s.syncDocumentsStatus();
      }
      if (mounted) {
        _bindFromState();
        setState(() => _loading = false);
      }
    });
  }

  @override
  void didUpdateWidget(EditVehicleScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.vehicleId != oldWidget.vehicleId) {
      _targetVehicleId = widget.vehicleId;
      final s = context.read<AppState>();
      if (_targetVehicleId != null && _targetVehicleId!.isNotEmpty) {
        s.primaryVehicleId = _targetVehicleId;
      }
      _bindFromState();
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _plate.dispose();
    _color.dispose();
    _year.dispose();
    super.dispose();
  }

  DriverVehicle? _current(AppState s) {
    final targetId = _targetVehicleId ?? s.primaryVehicleId;
    if (targetId != null) {
      for (final v in s.vehicles) {
        if (v.id == targetId) return v;
      }
    }
    return s.vehicles.isNotEmpty ? s.vehicles.first : null;
  }

  void _bindFromState() {
    final s = context.read<AppState>();
    final vehicle = _current(s);
    if (vehicle == null) return;
    _boundVehicleId = vehicle.id;
    _name.text = vehicle.name;
    _plate.text = vehicle.plate;
    _color.text = vehicle.color;
    _year.text = vehicle.year?.toString() ?? '';
    _class = kVehicleClasses.contains(vehicle.vehicleClass)
        ? vehicle.vehicleClass
        : 'sedan';
    _seats = vehicle.passengerSeats ?? 4;
    _luggage = vehicle.luggagePlaces ?? 2;
    _before = vehicle.autocancelBefore;
    _after = vehicle.autocancelAfter;
    _amenities
      ..clear()
      ..addAll({
        for (final e in s.amenities.entries)
          e.key: vehicle.amenities[e.key] == true || e.value,
      });
    for (final key in s.amenities.keys) {
      _amenities.putIfAbsent(key, () => false);
    }
    _loadedUpdatedAt = vehicle.updatedAt;
    _dirty = false;
  }

  void _markDirty() {
    if (!_dirty) setState(() => _dirty = true);
  }

  bool _validate() {
    final name = _name.text.trim();
    final plate = _plate.text.trim();
    final yearText = _year.text.trim();
    String? nameErr;
    String? plateErr;
    String? yearErr;
    if (name.isEmpty) nameErr = 'Brand/model is required';
    if (plate.isEmpty) plateErr = 'License plate is required';
    if (yearText.isNotEmpty) {
      final y = int.tryParse(yearText);
      final now = DateTime.now().year;
      if (y == null || y < 1980 || y > now + 1) {
        yearErr = 'Enter a valid year';
      }
    }
    setState(() {
      _nameError = nameErr;
      _plateError = plateErr;
      _yearError = yearErr;
      _error = null;
    });
    return nameErr == null && plateErr == null && yearErr == null;
  }

  Future<bool> _confirmLeave() async {
    if (!_dirty) return true;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Discard changes?'),
        content: const Text('You have unsaved vehicle changes.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Stay'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Discard'),
          ),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _save(AppState s, DriverVehicle vehicle) async {
    if (!_dirty || _saving) return;
    if (!_validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      for (final e in _amenities.entries) {
        s.amenities[e.key] = e.value;
      }
      s.setAutocancel(before: _before, after: _after);
      await s.updateDriverVehicle(
        vehicle.id,
        patch: {
          'name': _name.text.trim(),
          'plate': _plate.text.trim().toUpperCase(),
          'vehicleClass': _class,
          'color': _color.text.trim(),
          'year': int.tryParse(_year.text.trim()),
          'passengerSeats': _seats,
          'luggagePlaces': _luggage,
        },
        expectedUpdatedAt: _loadedUpdatedAt,
      );
      if (!mounted) return;
      _bindFromState();
      setState(() => _dirty = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Vehicle updated')),
      );
    } catch (e) {
      final msg = e.toString();
      if (mounted) {
        setState(() {
          if (msg.contains('VEHICLE_STALE') ||
              msg.contains('Vehicle information changed') ||
              msg.contains('409')) {
            _error =
                'Vehicle information changed. Refresh and review before saving.';
          } else {
            _error = msg.replaceFirst('Exception: ', '');
          }
        });
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final vehicle = _current(s);
    final settingsMode = s.onboardedComplete;
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    if (!_loading &&
        vehicle != null &&
        vehicle.id != _boundVehicleId) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(_bindFromState);
      });
    }

    return PopScope(
      canPop: !_dirty,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _confirmLeave() && context.mounted) {
          context.pop();
        }
      },
      child: Scaffold(
        backgroundColor: GtColors.bgGrey,
        appBar: AppBar(
          title: const Text('Edit vehicle'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () async {
              if (await _confirmLeave() && context.mounted) context.pop();
            },
          ),
          actions: [
            if (vehicle != null)
              IconButton(
                onPressed: () async {
                  final ok = await showDialog<bool>(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      title: const Text('Delete vehicle?'),
                      content: Text(
                        'Remove ${vehicle.name} (${vehicle.plate})?',
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          child: const Text('Cancel'),
                        ),
                        TextButton(
                          onPressed: () => Navigator.pop(ctx, true),
                          child: const Text('Delete'),
                        ),
                      ],
                    ),
                  );
                  if (ok == true && context.mounted) {
                    await s.deleteDriverVehicle(vehicle.id);
                    if (context.mounted) context.pop();
                  }
                },
                icon: const Icon(Icons.delete_outline, color: GtColors.red),
              ),
          ],
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : vehicle == null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text(
                            'No vehicles added yet',
                            style: TextStyle(fontWeight: FontWeight.w600),
                          ),
                          const SizedBox(height: 16),
                          GtGreenButton(
                            label: 'Add vehicle',
                            onPressed: () =>
                                context.push('/settings/vehicles/add'),
                          ),
                        ],
                      ),
                    ),
                  )
                : SafeArea(
                    child: Column(
                      children: [
                        Expanded(
                          child: ListView(
                            padding: EdgeInsets.fromLTRB(
                              16,
                              12,
                              16,
                              16 + bottomInset,
                            ),
                            children: [
                              if (_error != null)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 12),
                                  child: Text(
                                    _error!,
                                    style: const TextStyle(color: GtColors.red),
                                  ),
                                ),
                              GtCard(
                                child: Row(
                                  children: [
                                    VehiclePrimaryThumb(
                                      vehicleId: vehicle.id,
                                      vehicleClass: _class,
                                      size: 88,
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            _name.text.isEmpty
                                                ? vehicle.name
                                                : _name.text,
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w700,
                                              fontSize: 16,
                                            ),
                                          ),
                                          const SizedBox(height: 6),
                                          Wrap(
                                            spacing: 6,
                                            runSpacing: 6,
                                            children: [
                                              _Chip(
                                                _plate.text.isEmpty
                                                    ? vehicle.plate
                                                    : _plate.text,
                                              ),
                                              if (vehicle.isDefault)
                                                const _Chip('Default'),
                                              _Chip(
                                                vehicle.isActive
                                                    ? 'Active'
                                                    : 'Inactive',
                                              ),
                                            ],
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 16),
                              const VehicleSectionHeader('Details'),
                              VehicleClassPicker(
                                value: _class,
                                onChanged: (v) {
                                  setState(() => _class = v);
                                  _markDirty();
                                },
                              ),
                              const SizedBox(height: 12),
                              TextField(
                                controller: _name,
                                decoration: vehicleFieldDecoration(
                                  'Brand, model',
                                  errorText: _nameError,
                                ),
                                onChanged: (_) => _markDirty(),
                              ),
                              const SizedBox(height: 12),
                              TextField(
                                controller: _plate,
                                decoration: vehicleFieldDecoration(
                                  'License plate',
                                  errorText: _plateError,
                                ),
                                textCapitalization:
                                    TextCapitalization.characters,
                                inputFormatters: [
                                  FilteringTextInputFormatter.allow(
                                    RegExp(r'[A-Za-z0-9\- ]'),
                                  ),
                                ],
                                onChanged: (v) {
                                  final upper = v.toUpperCase();
                                  if (v != upper) {
                                    _plate.value = TextEditingValue(
                                      text: upper,
                                      selection: TextSelection.collapsed(
                                        offset: upper.length,
                                      ),
                                    );
                                  }
                                  _markDirty();
                                },
                              ),
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  Expanded(
                                    child: TextField(
                                      controller: _year,
                                      decoration: vehicleFieldDecoration(
                                        'Year',
                                        errorText: _yearError,
                                      ),
                                      keyboardType: TextInputType.number,
                                      inputFormatters: [
                                        FilteringTextInputFormatter.digitsOnly,
                                        LengthLimitingTextInputFormatter(4),
                                      ],
                                      onChanged: (_) => _markDirty(),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: TextField(
                                      controller: _color,
                                      decoration:
                                          vehicleFieldDecoration('Color'),
                                      onChanged: (_) => _markDirty(),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              VehicleCapacityStepper(
                                label: 'Passenger seats',
                                value: _seats,
                                min: 1,
                                max: 20,
                                onChanged: (v) {
                                  setState(() => _seats = v);
                                  _markDirty();
                                },
                              ),
                              const SizedBox(height: 10),
                              VehicleCapacityStepper(
                                label: 'Luggage places',
                                value: _luggage,
                                min: 0,
                                max: 20,
                                onChanged: (v) {
                                  setState(() => _luggage = v);
                                  _markDirty();
                                },
                              ),
                              const SizedBox(height: 20),
                              const VehicleSectionHeader(
                                'Photos',
                                subtitle: 'Up to 6 photos of this vehicle',
                              ),
                              VehiclePhotoGrid(vehicleId: vehicle.id),
                              const SizedBox(height: 20),
                              const VehicleSectionHeader('Amenities'),
                              GridView.count(
                                crossAxisCount: 3,
                                shrinkWrap: true,
                                physics: const NeverScrollableScrollPhysics(),
                                mainAxisSpacing: 10,
                                crossAxisSpacing: 10,
                                childAspectRatio: 1.05,
                                children: _amenities.keys.map((key) {
                                  final on = _amenities[key] ?? false;
                                  return InkWell(
                                    onTap: () {
                                      setState(
                                        () => _amenities[key] = !on,
                                      );
                                      _markDirty();
                                    },
                                    borderRadius: BorderRadius.circular(10),
                                    child: AnimatedContainer(
                                      duration:
                                          const Duration(milliseconds: 160),
                                      decoration: BoxDecoration(
                                        borderRadius: BorderRadius.circular(10),
                                        border: Border.all(
                                          color: on
                                              ? GtColors.brand
                                              : GtColors.border,
                                          width: on ? 2 : 1,
                                        ),
                                        color:
                                            on ? GtColors.soft : Colors.white,
                                      ),
                                      padding: const EdgeInsets.all(8),
                                      child: Column(
                                        mainAxisAlignment:
                                            MainAxisAlignment.center,
                                        children: [
                                          Icon(
                                            _amenityIcons[key] ?? Icons.check,
                                            size: 28,
                                          ),
                                          const SizedBox(height: 6),
                                          Text(
                                            key,
                                            textAlign: TextAlign.center,
                                            style:
                                                const TextStyle(fontSize: 12),
                                          ),
                                        ],
                                      ),
                                    ),
                                  );
                                }).toList(),
                              ),
                              const SizedBox(height: 20),
                              const VehicleSectionHeader('Booking rules'),
                              GtCard(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text(
                                      'Autocancel offers',
                                      style: TextStyle(
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                    const Text(
                                      'When your offer is selected, overlapping offers can cancel automatically.',
                                      style: TextStyle(
                                        color: GtColors.textSecondary,
                                        fontSize: 13,
                                      ),
                                    ),
                                    const SizedBox(height: 12),
                                    Row(
                                      children: [
                                        const Expanded(
                                          child: Text('Minutes before'),
                                        ),
                                        GtStepper(
                                          value: _before,
                                          min: 0,
                                          max: 120,
                                          onChanged: (v) {
                                            setState(() => _before = v);
                                            _markDirty();
                                          },
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 10),
                                    Row(
                                      children: [
                                        const Expanded(
                                          child: Text('Minutes after'),
                                        ),
                                        GtStepper(
                                          value: _after,
                                          min: 0,
                                          max: 120,
                                          onChanged: (v) {
                                            setState(() => _after = v);
                                            _markDirty();
                                          },
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                          child: GtGreenButton(
                            label: _saving
                                ? 'Saving…'
                                : (settingsMode ? 'Save' : 'Next'),
                            onPressed: _saving || (settingsMode && !_dirty)
                                ? null
                                : () async {
                                    if (settingsMode) {
                                      await _save(s, vehicle);
                                    } else {
                                      if (_dirty) {
                                        await _save(s, vehicle);
                                        if (!mounted || _error != null) return;
                                      }
                                      if (context.mounted) {
                                        context.push('/onboarding/payment');
                                      }
                                    }
                                  },
                          ),
                        ),
                      ],
                    ),
                  ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip(this.label);
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        border: Border.all(color: GtColors.border),
        borderRadius: BorderRadius.circular(6),
        color: Colors.white,
      ),
      child: Text(
        label,
        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
      ),
    );
  }
}
