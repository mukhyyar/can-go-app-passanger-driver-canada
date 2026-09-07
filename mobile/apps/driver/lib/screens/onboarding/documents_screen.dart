import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';

class DocumentsScreen extends StatelessWidget {
  const DocumentsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Documents'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        actions: [
          IconButton(onPressed: () {}, icon: const Icon(Icons.more_vert)),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: GtColors.bgGrey,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Add all required documents for activation',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                      SizedBox(height: 6),
                      Text(
                        'Upload files in format: JPEG, PNG, PDF. Maximum file size is 25 MB.',
                        style: TextStyle(color: GtColors.textSecondary, fontSize: 13),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                GtCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Your selfie (face photo) with your driving license',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 10),
                      if (s.selfieUploaded)
                        Container(
                          width: 88,
                          height: 88,
                          decoration: BoxDecoration(
                            color: GtColors.soft,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: GtColors.border),
                          ),
                          child: const Icon(Icons.person, size: 40, color: GtColors.textMuted),
                        )
                      else
                        _plusBox(() {}),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                GtCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Vehicle photo with Vehicle Registration Certificate and license plate legible',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 10),
                      if (s.vehicleDocUploaded)
                        Container(
                          width: 88,
                          height: 88,
                          decoration: BoxDecoration(
                            color: GtColors.soft,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const Icon(Icons.description, size: 36),
                        )
                      else
                        _plusBox(() => s.markVehicleDocUploaded()),
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
              onPressed: () => context.push('/onboarding/photos'),
            ),
          ),
        ],
      ),
    );
  }

  static Widget _plusBox(VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Container(
        width: 88,
        height: 88,
        decoration: BoxDecoration(
          color: GtColors.bgGrey,
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Icon(Icons.add, size: 36),
      ),
    );
  }
}
