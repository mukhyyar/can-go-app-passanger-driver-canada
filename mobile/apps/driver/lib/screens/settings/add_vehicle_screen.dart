import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import '../../utils/error_utils.dart';
import 'vehicle_form_widgets.dart';

class AddVehicleScreen extends StatefulWidget {
  const AddVehicleScreen({super.key});

  @override
  State<AddVehicleScreen> createState() => _AddVehicleScreenState();
}

class _AddVehicleScreenState extends State<AddVehicleScreen> {
  final _make = TextEditingController();
  final _model = TextEditingController();
  final _plate = TextEditingController();
  final _color = TextEditingController();
  final _year = TextEditingController();
  int _seats = 4;
  int _luggage = 2;
  String _class = 'economy';
  bool _saving = false;
  String? _error;
  String? _makeError;
  String? _modelError;
  String? _plateError;
  String? _yearError;

  /// Once create succeeds, never create again — document/photo stage uses this id.
  String? _createdVehicleId;
  bool _photoStage = false;

  @override
  void dispose() {
    _make.dispose();
    _model.dispose();
    _plate.dispose();
    _color.dispose();
    _year.dispose();
    super.dispose();
  }

  bool _validate() {
    final make = _make.text.trim();
    final model = _model.text.trim();
    final plate = _plate.text.trim();
    final yearText = _year.text.trim();
    String? makeErr;
    String? modelErr;
    String? plateErr;
    String? yearErr;
    if (make.isEmpty) makeErr = 'Make is required';
    if (model.isEmpty) modelErr = 'Model is required';
    if (plate.isEmpty) plateErr = 'License plate is required';
    if (yearText.isNotEmpty) {
      final y = int.tryParse(yearText);
      final now = DateTime.now().year;
      if (y == null || y < 1980 || y > now + 1) {
        yearErr = 'Enter a valid year';
      }
    }
    if (!kVehicleClasses.contains(_class)) {
      setState(() => _error = 'Select a valid vehicle class');
      return false;
    }
    setState(() {
      _makeError = makeErr;
      _modelError = modelErr;
      _plateError = plateErr;
      _yearError = yearErr;
      _error = null;
    });
    return makeErr == null && modelErr == null && plateErr == null && yearErr == null;
  }

  Future<void> _create() async {
    if (_createdVehicleId != null) {
      setState(() => _photoStage = true);
      return;
    }
    if (!_validate() || _saving) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final s = context.read<AppState>();
      final make = _make.text.trim();
      final model = _model.text.trim();
      final created = await s.createDriverVehicle(
        name: '$make $model'.trim(),
        make: make,
        model: model,
        plate: _plate.text.trim().toUpperCase(),
        vehicleClass: _class,
        color: _color.text.trim(),
        year: int.tryParse(_year.text.trim()),
        passengerSeats: _seats,
        luggagePlaces: _luggage,
        isDefault: s.vehicles.isEmpty,
      );
      if (!mounted) return;
      if (created == null || created.id.isEmpty) {
        setState(() => _error = 'Vehicle was created but ID was missing');
        return;
      }
      setState(() {
        _createdVehicleId = created.id;
        _photoStage = true;
      });
    } catch (e) {
      if (mounted) {
        setState(() => _error = cleanErrorMessage(e));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _finish() {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Vehicle added successfully')),
    );
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/settings/vehicles');
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      appBar: AppBar(
        title: Text(_photoStage ? 'Vehicle documents & photos' : 'Create vehicle'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            if (_photoStage && _createdVehicleId != null) {
              _finish();
              return;
            }
            if (context.canPop()) {
              context.pop();
            } else {
              context.go('/settings/vehicles');
            }
          },
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: EdgeInsets.fromLTRB(16, 12, 16, 16 + bottomInset),
                children: [
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(
                        _error!,
                        style: const TextStyle(color: GtColors.red),
                      ),
                    ),
                  if (!_photoStage) ...[
                    const VehicleSectionHeader(
                      'Vehicle class',
                      subtitle: 'Choose the closest match for your vehicle',
                    ),
                    VehicleClassPicker(
                      value: _class,
                      onChanged: (v) => setState(() {
                        _class = v;
                        _seats = defaultSeatsForClass(v);
                      }),
                    ),
                    const SizedBox(height: 20),
                    const VehicleSectionHeader('Identity'),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _make,
                            decoration: vehicleFieldDecoration(
                              'Make (e.g. Toyota)',
                              errorText: _makeError,
                            ),
                            textCapitalization: TextCapitalization.words,
                            onChanged: (_) {
                              if (_makeError != null) {
                                setState(() => _makeError = null);
                              }
                            },
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextField(
                            controller: _model,
                            decoration: vehicleFieldDecoration(
                              'Model (e.g. Camry)',
                              errorText: _modelError,
                            ),
                            textCapitalization: TextCapitalization.words,
                            onChanged: (_) {
                              if (_modelError != null) {
                                setState(() => _modelError = null);
                              }
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _plate,
                      decoration: vehicleFieldDecoration(
                        'License plate',
                        errorText: _plateError,
                      ),
                      textCapitalization: TextCapitalization.characters,
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
                        if (_plateError != null) {
                          setState(() => _plateError = null);
                        }
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
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextField(
                            controller: _color,
                            decoration: vehicleFieldDecoration('Color'),
                            textCapitalization: TextCapitalization.words,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    const VehicleSectionHeader('Capacity'),
                    VehicleCapacityStepper(
                      label: 'Passenger seats',
                      value: _seats,
                      min: 1,
                      max: 30,
                      onChanged: (v) => setState(() => _seats = v),
                    ),
                    const SizedBox(height: 10),
                    VehicleCapacityStepper(
                      label: 'Luggage places',
                      value: _luggage,
                      min: 0,
                      max: 20,
                      onChanged: (v) => setState(() => _luggage = v),
                    ),
                  ] else ...[
                    const VehicleSectionHeader(
                      'Regulatory status',
                      subtitle: 'Initial status for this newly registered vehicle',
                    ),
                    const Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        VehicleRegulatoryBadge(label: 'Inspection', status: 'PENDING'),
                        VehicleRegulatoryBadge(label: 'Approval', status: 'PENDING'),
                      ],
                    ),
                    const SizedBox(height: 20),
                    const VehicleSectionHeader(
                      'Vehicle documents',
                      subtitle: 'Upload registration and insurance for this vehicle',
                    ),
                    VehicleDocumentSlot(
                      vehicleId: _createdVehicleId!,
                      docType: 'vehicle_registration',
                      title: 'Vehicle registration',
                    ),
                    VehicleDocumentSlot(
                      vehicleId: _createdVehicleId!,
                      docType: 'insurance',
                      title: 'Vehicle insurance',
                      requiresExpiry: true,
                    ),
                    const SizedBox(height: 20),
                    const VehicleSectionHeader(
                      'Photos',
                      subtitle:
                          'Optional now — you can add up to 6 photos. Skip anytime.',
                    ),
                    VehiclePhotoGrid(vehicleId: _createdVehicleId),
                  ],
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: _photoStage
                  ? Column(
                      children: [
                        GtGreenButton(
                          label: 'Done',
                          onPressed: _saving ? null : _finish,
                        ),
                        TextButton(
                          onPressed: _saving ? null : _finish,
                          child: const Text('Skip for now'),
                        ),
                      ],
                    )
                  : GtGreenButton(
                      label: _saving ? 'Creating…' : 'Create vehicle',
                      onPressed: _saving ? null : _create,
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
