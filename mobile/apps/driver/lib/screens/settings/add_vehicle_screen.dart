import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';

class AddVehicleScreen extends StatefulWidget {
  const AddVehicleScreen({super.key});

  @override
  State<AddVehicleScreen> createState() => _AddVehicleScreenState();
}

class _AddVehicleScreenState extends State<AddVehicleScreen> {
  final _name = TextEditingController();
  final _plate = TextEditingController();
  final _color = TextEditingController();
  final _year = TextEditingController();
  final _seats = TextEditingController(text: '4');
  final _luggage = TextEditingController(text: '2');
  String _class = 'sedan';
  bool _saving = false;
  String? _error;

  static const _classes = [
    'sedan',
    'suv',
    'van',
    'minibus',
    'economy',
    'comfort',
    'business',
  ];

  @override
  void dispose() {
    _name.dispose();
    _plate.dispose();
    _color.dispose();
    _year.dispose();
    _seats.dispose();
    _luggage.dispose();
    super.dispose();
  }

  InputDecoration _dec(String hint) => InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: GtColors.textMuted),
        border: const UnderlineInputBorder(
          borderSide: BorderSide(color: GtColors.border),
        ),
      );

  Future<void> _save() async {
    final name = _name.text.trim();
    final plate = _plate.text.trim();
    if (name.isEmpty || plate.isEmpty) {
      setState(() => _error = 'Brand/model and license plate are required');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final s = context.read<AppState>();
      final created = await s.createDriverVehicle(
        name: name,
        plate: plate,
        vehicleClass: _class,
        color: _color.text.trim(),
        year: int.tryParse(_year.text.trim()),
        passengerSeats: int.tryParse(_seats.text.trim()),
        luggagePlaces: int.tryParse(_luggage.text.trim()),
        isDefault: s.vehicles.isEmpty,
      );
      if (!mounted) return;
      if (created != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Vehicle added successfully')),
        );
        context.pop();
      }
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Create vehicle'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              children: [
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(
                      _error!,
                      style: const TextStyle(color: GtColors.red),
                    ),
                  ),
                TextField(controller: _name, decoration: _dec('Brand, model')),
                TextField(
                  controller: _year,
                  decoration: _dec('Manufacture year'),
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                ),
                TextField(controller: _color, decoration: _dec('Color')),
                TextField(
                  controller: _plate,
                  decoration: _dec('License plate'),
                  textCapitalization: TextCapitalization.characters,
                ),
                const SizedBox(height: 8),
                const Text(
                  'Transport type',
                  style: TextStyle(color: GtColors.textSecondary, fontSize: 13),
                ),
                DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    isExpanded: true,
                    value: _class,
                    items: _classes
                        .map(
                          (e) => DropdownMenuItem(
                            value: e,
                            child: Text(e[0].toUpperCase() + e.substring(1)),
                          ),
                        )
                        .toList(),
                    onChanged: (v) {
                      if (v != null) setState(() => _class = v);
                    },
                  ),
                ),
                const Divider(),
                TextField(
                  controller: _seats,
                  decoration: _dec('Number of passenger seats'),
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                ),
                TextField(
                  controller: _luggage,
                  decoration: _dec('Number of luggage places'),
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: GtGreenButton(
              label: _saving ? 'Saving…' : 'Next',
              onPressed: _saving ? null : _save,
            ),
          ),
        ],
      ),
    );
  }
}
