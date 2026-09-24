import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import 'vehicle_form_widgets.dart';

class VehiclesListScreen extends StatefulWidget {
  const VehiclesListScreen({super.key});

  @override
  State<VehiclesListScreen> createState() => _VehiclesListScreenState();
}

class _VehiclesListScreenState extends State<VehiclesListScreen> {
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _reload());
  }

  Future<void> _reload() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await context.read<AppState>().loadDriverVehicles();
    } catch (e) {
      _error = e.toString();
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final vehicles = s.vehicles;

    return Scaffold(
      backgroundColor: GtColors.bgGrey,
      appBar: AppBar(
        title: const Text('Vehicles'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.canPop() ? context.pop() : context.go('/'),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? _EmptyState(
                        title: "We couldn't load your vehicles.",
                        actionLabel: 'Retry',
                        onAction: _reload,
                      )
                    : vehicles.isEmpty
                        ? const _EmptyState(
                            title: 'No vehicles added yet',
                            actionLabel: 'Add vehicle',
                            route: '/settings/vehicles/add',
                          )
                        : RefreshIndicator(
                            onRefresh: _reload,
                            child: ListView.separated(
                              padding: const EdgeInsets.all(16),
                              itemCount: vehicles.length,
                              separatorBuilder: (_, __) =>
                                  const SizedBox(height: 10),
                              itemBuilder: (_, i) {
                                final v = vehicles[i];
                                return _VehicleCard(
                                  vehicle: v,
                                  onTap: () async {
                                    s.primaryVehicleId = v.id;
                                    for (final key in s.amenities.keys.toList()) {
                                      s.amenities[key] =
                                          v.amenities[key] == true;
                                    }
                                    s.setAutocancel(
                                      before: v.autocancelBefore,
                                      after: v.autocancelAfter,
                                    );
                                    await context.push(
                                      '/onboarding/edit-vehicle?id=${v.id}',
                                      extra: v.id,
                                    );
                                    if (mounted) await _reload();
                                  },
                                  onDelete: () async {
                                    final ok = await showDialog<bool>(
                                      context: context,
                                      builder: (ctx) => AlertDialog(
                                        title: const Text('Delete vehicle?'),
                                        content: Text(
                                          'Remove ${v.name} (${v.plate}) from your account? This cannot be undone.',
                                        ),
                                        actions: [
                                          TextButton(
                                            onPressed: () =>
                                                Navigator.pop(ctx, false),
                                            child: const Text('Cancel'),
                                          ),
                                          TextButton(
                                            onPressed: () =>
                                                Navigator.pop(ctx, true),
                                            child: const Text('Delete'),
                                          ),
                                        ],
                                      ),
                                    );
                                    if (ok == true) {
                                      await s.deleteDriverVehicle(v.id);
                                      if (mounted) await _reload();
                                    }
                                  },
                                );
                              },
                            ),
                          ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: GtGreenButton(
              label: 'Add vehicle',
              onPressed: () async {
                await context.push('/settings/vehicles/add');
                if (mounted) await _reload();
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _VehicleCard extends StatelessWidget {
  const _VehicleCard({
    required this.vehicle,
    required this.onTap,
    required this.onDelete,
  });

  final DriverVehicle vehicle;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return GtCard(
      onTap: onTap,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: GtColors.soft,
              borderRadius: BorderRadius.circular(10),
            ),
            child: VehiclePrimaryThumb(
              vehicleId: vehicle.id,
              vehicleClass: vehicle.vehicleClass,
              size: 64,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        vehicle.name,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 16,
                        ),
                      ),
                    ),
                    if (vehicle.isDefault)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          border: Border.all(color: GtColors.border),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Text(
                          'Default',
                          style: TextStyle(fontSize: 11),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  [
                    if (vehicle.year != null) '${vehicle.year}',
                    if (vehicle.color.isNotEmpty) vehicle.color,
                    vehicle.vehicleClass,
                  ].where((e) => e.isNotEmpty).join(' · '),
                  style: const TextStyle(
                    color: GtColors.textSecondary,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 6),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    border: Border.all(color: GtColors.border),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    vehicle.plate,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  vehicle.isActive ? 'Active' : 'Inactive',
                  style: TextStyle(
                    fontSize: 12,
                    color: vehicle.isActive
                        ? GtColors.textSecondary
                        : GtColors.red,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: onDelete,
            icon: const Icon(Icons.delete_outline, color: GtColors.red),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.title,
    required this.actionLabel,
    this.onAction,
    this.route,
  });

  final String title;
  final String actionLabel;
  final VoidCallback? onAction;
  final String? route;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.directions_car_outlined,
                size: 48, color: GtColors.textMuted),
            const SizedBox(height: 12),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 16),
            GtGreenButton(
              label: actionLabel,
              onPressed: onAction ??
                  () {
                    if (route != null) context.push(route!);
                  },
            ),
          ],
        ),
      ),
    );
  }
}
