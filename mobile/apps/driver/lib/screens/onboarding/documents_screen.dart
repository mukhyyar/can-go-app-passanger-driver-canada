import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';

class DocumentsScreen extends StatefulWidget {
  const DocumentsScreen({super.key});

  @override
  State<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends State<DocumentsScreen> {
  bool _busy = false;

  Future<void> _pickAndUpload(String docType) async {
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
    );
    if (file == null || !mounted) return;
    final app = context.read<AppState>();
    setState(() => _busy = true);
    try {
      final bytes = await file.readAsBytes();
      if (docType == 'vehicle_registration' || docType == 'vehicle_photo') {
        await app.ensureVehicle();
      }
      await app.uploadKycBytes(
        docType: docType,
        bytes: bytes,
        filename: file.name,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Uploaded $docType')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Upload failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

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
      ),
      body: Column(
        children: [
          if (_busy) const LinearProgressIndicator(),
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
                        'Upload JPEG/PNG/PDF. Files go to private storage for Admin KYC.',
                        style: TextStyle(
                          color: GtColors.textSecondary,
                          fontSize: 13,
                        ),
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
                        'Selfie with driving license',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 10),
                      if (s.selfieUploaded)
                        _doneThumb(Icons.person)
                      else
                        _plusBox(() => _pickAndUpload('selfie')),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                GtCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Driving license',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 10),
                      if (s.licenseUploaded)
                        _doneThumb(Icons.badge_outlined)
                      else
                        _plusBox(() => _pickAndUpload('license')),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                GtCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Vehicle registration',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 10),
                      if (s.vehicleDocUploaded)
                        _doneThumb(Icons.description)
                      else
                        _plusBox(
                          () => _pickAndUpload('vehicle_registration'),
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
              onPressed: _busy
                  ? null
                  : () => context.push('/onboarding/photos'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _doneThumb(IconData icon) {
    return Container(
      width: 88,
      height: 88,
      decoration: BoxDecoration(
        color: GtColors.soft,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: GtColors.border),
      ),
      child: Icon(icon, size: 40, color: GtColors.textMuted),
    );
  }

  Widget _plusBox(VoidCallback onTap) {
    return InkWell(
      onTap: _busy ? null : onTap,
      child: Container(
        width: 88,
        height: 88,
        decoration: BoxDecoration(
          color: GtColors.bgGrey,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: GtColors.border),
        ),
        child: const Icon(Icons.add, size: 32),
      ),
    );
  }
}
