import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';

class PhotosScreen extends StatefulWidget {
  const PhotosScreen({super.key});

  @override
  State<PhotosScreen> createState() => _PhotosScreenState();
}

class _PhotosScreenState extends State<PhotosScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _maybeShowRequirements());
  }

  Future<void> _maybeShowRequirements() async {
    final s = context.read<AppState>();
    if (s.photoRequirementsSeen) return;
    await showGtSheet(
      context: context,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Photo requirements',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 8),
            const Text('1. The photo is of your actual vehicle and matches specified vehicle details.'),
            const SizedBox(height: 8),
            const Text('2. No company name or phone number.'),
            const SizedBox(height: 8),
            const Text('3. No screenshots, ads, logos, watermarks, graphics or captions.'),
            const SizedBox(height: 8),
            const Text('4. No people in the photo.'),
            const SizedBox(height: 12),
            const Text('* Verification takes up to 2 days', style: TextStyle(color: GtColors.textSecondary, fontSize: 13)),
            const Text('** You can add only 6 photos', style: TextStyle(color: GtColors.textSecondary, fontSize: 13)),
            const Text('*** The car number will be blurred', style: TextStyle(color: GtColors.textSecondary, fontSize: 13)),
            const SizedBox(height: 16),
            GtGreenButton(
              label: 'I understand',
              onPressed: () {
                s.markPhotoRequirementsSeen();
                Navigator.pop(context);
              },
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final vehicle = s.repo.driver.vehicleName;
    final plate = s.repo.driver.plate;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Vehicle photos'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        actions: [
          TextButton(
            onPressed: () => context.push('/onboarding/edit-vehicle'),
            child: const Text(
              'Done',
              style: TextStyle(color: GtColors.orange, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(vehicle, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: GtColors.bgGrey,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(plate, style: const TextStyle(fontWeight: FontWeight.w600)),
            ),
            const SizedBox(height: 24),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                ...List.generate(
                  s.vehiclePhotoCount,
                  (_) => Container(
                    width: 100,
                    height: 100,
                    decoration: BoxDecoration(
                      color: GtColors.soft,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: GtColors.border),
                    ),
                    child: const Icon(Icons.directions_car, size: 36, color: GtColors.textMuted),
                  ),
                ),
                if (s.vehiclePhotoCount < 6)
                  InkWell(
                    onTap: s.markVehiclePhotoAdded,
                    child: Container(
                      width: 100,
                      height: 100,
                      decoration: BoxDecoration(
                        color: GtColors.bgGrey,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(Icons.add_a_photo_outlined, size: 32),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
