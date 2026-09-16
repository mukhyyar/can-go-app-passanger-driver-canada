import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:image_picker/image_picker.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';

class PhotosScreen extends StatefulWidget {
  const PhotosScreen({super.key});

  @override
  State<PhotosScreen> createState() => _PhotosScreenState();
}

class _PhotosScreenState extends State<PhotosScreen> {
  final Map<String, Uint8List> _previewBytes = {};
  final Set<String> _previewFailed = {};
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final s = context.read<AppState>();
      if (s.isAuthenticated) {
        await s.loadDriverVehicles();
        await s.syncDocumentsStatus();
      }
      if (mounted) {
        await _loadPreviews();
        await _maybeShowRequirements();
      }
    });
  }

  Future<void> _loadPreviews() async {
    final s = context.read<AppState>();
    for (final doc in s.vehiclePhotoDocuments) {
      final id = doc['id']?.toString();
      if (id == null) continue;
      final cached = s.cachedDocumentPreview(id);
      if (cached != null) {
        if (mounted) setState(() => _previewBytes[id] = cached);
        continue;
      }
      if (_previewBytes.containsKey(id) || _previewFailed.contains(id)) continue;
      try {
        final bytes = await s.fetchDocumentPreviewBytes(id);
        if (!mounted) return;
        setState(() {
          if (bytes != null) {
            _previewBytes[id] = bytes;
            _previewFailed.remove(id);
          } else {
            _previewFailed.add(id);
          }
        });
      } catch (_) {
        if (mounted) setState(() => _previewFailed.add(id));
      }
    }
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

  Future<void> _addPhoto() async {
    final s = context.read<AppState>();
    if (s.vehiclePhotoCount >= 6) return;
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
    );
    if (file == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await s.ensureVehicle();
      final bytes = await file.readAsBytes();
      await s.uploadKycBytes(
        docType: 'vehicle_photo',
        bytes: bytes,
        filename: file.name,
      );
      for (final doc in s.vehiclePhotoDocuments) {
        final id = doc['id']?.toString();
        if (id != null && !_previewBytes.containsKey(id)) {
          s.rememberDocumentPreview(id, bytes);
          _previewBytes[id] = bytes;
          _previewFailed.remove(id);
          break;
        }
      }
      if (mounted) {
        setState(() {});
        await _loadPreviews();
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

  Future<void> _deletePhoto(Map<String, dynamic> doc) async {
    final id = doc['id']?.toString();
    if (id == null) return;
    if (context.read<AppState>().isDocumentLocked(doc)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Approved photos cannot be deleted')),
      );
      return;
    }
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete photo?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: GtColors.brand),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await context.read<AppState>().deleteDocument(id);
      _previewBytes.remove(id);
      _previewFailed.remove(id);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Delete failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _openPreview(Uint8List bytes) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => Scaffold(
          backgroundColor: Colors.black,
          appBar: AppBar(
            backgroundColor: Colors.black,
            foregroundColor: Colors.white,
            title: const Text('Vehicle photo'),
          ),
          body: Center(
            child: InteractiveViewer(
              child: Image.memory(
                bytes,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => const Icon(
                  Icons.broken_image_outlined,
                  size: 64,
                  color: Colors.white54,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    DriverVehicle? current;
    for (final v in s.vehicles) {
      if (v.id == s.primaryVehicleId) {
        current = v;
        break;
      }
    }
    current ??= s.vehicles.isNotEmpty ? s.vehicles.first : null;
    final vehicle = current?.name.isNotEmpty == true
        ? current!.name
        : (s.repo.driver.vehicleName.isNotEmpty
            ? s.repo.driver.vehicleName
            : 'Your vehicle');
    final plate = current?.plate.isNotEmpty == true
        ? current!.plate
        : (s.repo.driver.plate.isNotEmpty ? s.repo.driver.plate : '—');
    final photos = s.vehiclePhotoDocuments;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Vehicle photos'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        actions: [
          TextButton(
            onPressed: () {
              if (s.onboardedComplete) {
                context.pop();
              } else {
                context.push('/onboarding/edit-vehicle');
              }
            },
            child: const Text(
              'Done',
              style: TextStyle(
                color: GtColors.brand,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          if (_busy) const LinearProgressIndicator(),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(
                  vehicle,
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: GtColors.bgGrey,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    plate,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '${photos.length} of 6 photos · tap to preview',
                  style: const TextStyle(
                    color: GtColors.textSecondary,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 20),
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                  ),
                  itemCount: photos.length + (photos.length < 6 ? 1 : 0),
                  itemBuilder: (_, i) {
                    if (i >= photos.length) {
                      return InkWell(
                        onTap: _busy ? null : _addPhoto,
                        borderRadius: BorderRadius.circular(8),
                        child: Container(
                          decoration: BoxDecoration(
                            color: GtColors.bgGrey,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: GtColors.border),
                          ),
                          child: const Icon(Icons.add_a_photo_outlined, size: 32),
                        ),
                      );
                    }
                    final doc = photos[i];
                    final id = doc['id']?.toString() ?? '';
                    final bytes = _previewBytes[id];
                    final failed = _previewFailed.contains(id);
                    final locked = s.isDocumentLocked(doc);
                    return Stack(
                      fit: StackFit.expand,
                      children: [
                        InkWell(
                          onTap: bytes != null ? () => _openPreview(bytes) : null,
                          borderRadius: BorderRadius.circular(8),
                          child: Container(
                            decoration: BoxDecoration(
                              color: GtColors.soft,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: GtColors.border),
                            ),
                            clipBehavior: Clip.antiAlias,
                            child: bytes != null
                                ? Image.memory(
                                    bytes,
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, __, ___) => const Icon(
                                      Icons.broken_image_outlined,
                                    ),
                                  )
                                : Center(
                                    child: failed
                                        ? const Icon(
                                            Icons.broken_image_outlined,
                                          )
                                        : const CircularProgressIndicator(
                                            strokeWidth: 2,
                                          ),
                                  ),
                          ),
                        ),
                        if (!locked)
                          Positioned(
                            top: 4,
                            right: 4,
                            child: Material(
                              color: Colors.black54,
                              shape: const CircleBorder(),
                              child: InkWell(
                                customBorder: const CircleBorder(),
                                onTap: _busy ? null : () => _deletePhoto(doc),
                                child: const Padding(
                                  padding: EdgeInsets.all(4),
                                  child: Icon(Icons.close, size: 16, color: Colors.white),
                                ),
                              ),
                            ),
                          ),
                      ],
                    );
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
