import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import '../settings/vehicle_form_widgets.dart';

class PhotosScreen extends StatefulWidget {
  const PhotosScreen({super.key});

  @override
  State<PhotosScreen> createState() => _PhotosScreenState();
}

class _PhotosScreenState extends State<PhotosScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final s = context.read<AppState>();
      if (s.isAuthenticated) {
        await s.loadDriverVehicles();
        await s.ensureVehicle();
        await s.syncDocumentsStatus();
      }
      if (mounted) await _maybeShowRequirements();
    });
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
            const Text(
              '1. The photo is of your actual vehicle and matches specified vehicle details.',
            ),
            const SizedBox(height: 8),
            const Text('2. No company name or phone number.'),
            const SizedBox(height: 8),
            const Text(
              '3. No screenshots, ads, logos, watermarks, graphics or captions.',
            ),
            const SizedBox(height: 8),
            const Text('4. No people in the photo.'),
            const SizedBox(height: 12),
            const Text(
              '* Verification takes up to 2 days',
              style: TextStyle(color: GtColors.textSecondary, fontSize: 13),
            ),
            const Text(
              '** You can add only 6 photos',
              style: TextStyle(color: GtColors.textSecondary, fontSize: 13),
            ),
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
    final vehicleId = s.primaryVehicleId;

    void handleBack() {
      if (context.canPop()) {
        context.pop();
      } else {
        if (s.onboardedComplete) {
          context.go('/');
        } else {
          context.go('/onboarding/documents');
        }
      }
    }

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        handleBack();
      },
      child: Scaffold(
        backgroundColor: GtColors.bgGrey,
        appBar: AppBar(
          title: const Text('Vehicle photos'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: handleBack,
          ),
        ),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const VehicleSectionHeader(
                'Photos',
                subtitle: 'Up to 6 clear photos of your vehicle',
              ),
              VehiclePhotoGrid(vehicleId: vehicleId),
              const SizedBox(height: 24),
              GtGreenButton(
                label: 'Continue',
                onPressed: () {
                  if (s.onboardedComplete) {
                    context.pop();
                  } else {
                    context.push('/onboarding/payment');
                  }
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
