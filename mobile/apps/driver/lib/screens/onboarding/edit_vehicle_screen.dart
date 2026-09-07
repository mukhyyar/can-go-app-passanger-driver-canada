import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';

class EditVehicleScreen extends StatelessWidget {
  const EditVehicleScreen({super.key});

  static const _amenityIcons = <String, IconData>{
    'Free Wi-Fi': Icons.wifi,
    'Water': Icons.water_drop_outlined,
    'Charger': Icons.power,
    'Disabled': Icons.accessible,
    'Air conditioner': Icons.ac_unit,
  };

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Edit vehicle'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        actions: [
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.delete_outline, color: GtColors.red),
          ),
          IconButton(onPressed: () {}, icon: const Icon(Icons.more_vert)),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text('Default options', style: TextStyle(fontWeight: FontWeight.w700)),
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
                            color: on ? GtColors.brand : GtColors.border,
                            width: on ? 2 : 1,
                          ),
                          color: on ? GtColors.soft : Colors.white,
                        ),
                        padding: const EdgeInsets.all(8),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(_amenityIcons[key] ?? Icons.check, size: 28),
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
                const Text('Default driver', style: TextStyle(color: GtColors.textSecondary, fontSize: 13)),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.person_outline),
                  title: Text(s.defaultDriverName),
                  trailing: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.close, size: 18),
                      SizedBox(width: 8),
                      Icon(Icons.keyboard_arrow_down),
                    ],
                  ),
                ),
                const Divider(),
                GtCard(
                  onTap: () => context.push('/onboarding/photos'),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.photo_camera_outlined),
                          SizedBox(width: 8),
                          Expanded(
                            child: Text('Vehicle photos', style: TextStyle(fontWeight: FontWeight.w600)),
                          ),
                          Icon(Icons.chevron_right),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          const Icon(Icons.schedule, size: 16, color: GtColors.textMuted),
                          const SizedBox(width: 6),
                          Text(
                            'Verification: ${s.vehiclePhotoCount}',
                            style: const TextStyle(color: GtColors.textSecondary, fontSize: 13),
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
                      const Text('Autocancel offers', style: TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 8),
                      const Text(
                        'When your offer is selected by a passenger, all other offers for the rides scheduled at the same time will be canceled automatically.',
                        style: TextStyle(color: GtColors.textSecondary, fontSize: 13),
                      ),
                      const SizedBox(height: 12),
                      const Text('Extra period between rides in minutes:'),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: Text('before the ride', style: TextStyle(color: Colors.black87)),
                          ),
                          GtStepper(
                            value: s.autocancelBefore,
                            min: 0,
                            max: 120,
                            onChanged: (v) => s.setAutocancel(before: v),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: Text('after the ride', style: TextStyle(color: Colors.black87)),
                          ),
                          GtStepper(
                            value: s.autocancelAfter,
                            min: 0,
                            max: 120,
                            onChanged: (v) => s.setAutocancel(after: v),
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
              label: 'Next',
              onPressed: () => context.push('/onboarding/payment'),
            ),
          ),
        ],
      ),
    );
  }
}
