import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';

class EditVehicleScreen extends StatefulWidget {
  const EditVehicleScreen({super.key});

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

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final s = context.read<AppState>();
      if (s.isAuthenticated) {
        await s.loadDriverVehicles();
      }
      if (mounted) setState(() => _loading = false);
    });
  }

  DriverVehicle? _current(AppState s) {
    for (final v in s.vehicles) {
      if (v.id == s.primaryVehicleId) return v;
    }
    return s.vehicles.isNotEmpty ? s.vehicles.first : null;
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final vehicle = _current(s);
    final settingsMode = s.onboardedComplete;

    return Scaffold(
      appBar: AppBar(
        title: Text(settingsMode ? 'Edit vehicle' : 'Edit vehicle'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
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
              : Column(
                  children: [
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.all(16),
                        children: [
                          GtCard(
                            child: Row(
                              children: [
                                Container(
                                  width: 72,
                                  height: 72,
                                  decoration: BoxDecoration(
                                    color: GtColors.soft,
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: const Icon(
                                    Icons.directions_car,
                                    color: GtColors.brand,
                                    size: 36,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        vehicle.name,
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w700,
                                          fontSize: 16,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        [
                                          if (vehicle.year != null)
                                            '${vehicle.year}',
                                          if (vehicle.color.isNotEmpty)
                                            vehicle.color,
                                          vehicle.vehicleClass,
                                        ].where((e) => e.isNotEmpty).join(' · '),
                                        style: const TextStyle(
                                          color: GtColors.textSecondary,
                                          fontSize: 13,
                                        ),
                                      ),
                                      const SizedBox(height: 6),
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 8,
                                          vertical: 2,
                                        ),
                                        decoration: BoxDecoration(
                                          border: Border.all(
                                            color: GtColors.border,
                                          ),
                                          borderRadius:
                                              BorderRadius.circular(6),
                                        ),
                                        child: Text(
                                          vehicle.plate,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                          const Text(
                            'Default options',
                            style: TextStyle(fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 12),
                          GridView.count(
                            crossAxisCount: 3,
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            mainAxisSpacing: 10,
                            crossAxisSpacing: 10,
                            childAspectRatio: 1.05,
                            children: s.amenities.keys.map((key) {
                              final on = s.amenities[key] ?? false;
                              return InkWell(
                                onTap: () => s.toggleAmenity(key),
                                borderRadius: BorderRadius.circular(10),
                                child: Container(
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
                                        style: const TextStyle(fontSize: 12),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            }).toList(),
                          ),
                          const SizedBox(height: 20),
                          const Text(
                            'Default driver',
                            style: TextStyle(
                              color: GtColors.textSecondary,
                              fontSize: 13,
                            ),
                          ),
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: const Icon(Icons.person_outline),
                            title: Text(
                              s.fullName.isNotEmpty
                                  ? s.fullName
                                  : s.defaultDriverName,
                            ),
                          ),
                          const Divider(),
                          GtCard(
                            onTap: () =>
                                context.push('/onboarding/photos'),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Row(
                                  children: [
                                    Icon(Icons.photo_camera_outlined),
                                    SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                        'Vehicle photos',
                                        style: TextStyle(
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ),
                                    Icon(Icons.chevron_right),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Row(
                                  children: [
                                    const Icon(
                                      Icons.schedule,
                                      size: 16,
                                      color: GtColors.textMuted,
                                    ),
                                    const SizedBox(width: 6),
                                    Text(
                                      s.vehiclePhotoCount == 0
                                          ? 'Vehicle photos are required'
                                          : 'Photos uploaded: ${s.vehiclePhotoCount}',
                                      style: const TextStyle(
                                        color: GtColors.textSecondary,
                                        fontSize: 13,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
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
                                  'When your offer is selected by a passenger, other overlapping offers can be canceled automatically.',
                                  style: TextStyle(
                                    color: GtColors.textSecondary,
                                    fontSize: 13,
                                  ),
                                ),
                                const SizedBox(height: 12),
                                const Text(
                                  'Extra period between rides in minutes:',
                                ),
                                const SizedBox(height: 10),
                                Row(
                                  children: [
                                    const Expanded(
                                      child: Text('before the ride'),
                                    ),
                                    GtStepper(
                                      value: s.autocancelBefore,
                                      min: 0,
                                      max: 120,
                                      onChanged: (v) =>
                                          s.setAutocancel(before: v),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 10),
                                Row(
                                  children: [
                                    const Expanded(
                                      child: Text('after the ride'),
                                    ),
                                    GtStepper(
                                      value: s.autocancelAfter,
                                      min: 0,
                                      max: 120,
                                      onChanged: (v) =>
                                          s.setAutocancel(after: v),
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
                        label: settingsMode ? 'Save' : 'Next',
                        onPressed: () async {
                          final id = s.primaryVehicleId ?? vehicle.id;
                          if (s.isAuthenticated) {
                            try {
                              await s.updateDriverVehicle(id);
                            } catch (_) {}
                          }
                          if (!context.mounted) return;
                          if (settingsMode) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Vehicle updated'),
                              ),
                            );
                            context.pop();
                          } else {
                            context.push('/onboarding/payment');
                          }
                        },
                      ),
                    ),
                  ],
                ),
    );
  }
}
