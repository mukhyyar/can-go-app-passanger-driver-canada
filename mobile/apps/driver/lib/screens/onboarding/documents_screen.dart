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
  final Map<String, String?> _previewUrls = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final s = context.read<AppState>();
      if (s.isAuthenticated) await s.syncDocumentsStatus();
      if (mounted) await _loadPreviews();
    });
  }

  Future<void> _loadPreviews() async {
    final s = context.read<AppState>();
    for (final slot in const ['selfie', 'license', 'vehicle_registration']) {
      final doc = s.documentForType(slot);
      final id = doc?['id']?.toString();
      if (id == null) continue;
      try {
        final url = await s.fetchDocumentPreviewUrl(id);
        if (mounted) setState(() => _previewUrls[id] = url);
      } catch (_) {}
    }
  }

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
      if (docType == 'vehicle_registration') {
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

  Future<void> _deleteDoc(Map<String, dynamic> doc) async {
    final id = doc['id']?.toString();
    if (id == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete document?'),
        content: const Text('You can upload a new file after deleting.'),
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
      _previewUrls.remove(id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Document removed')),
        );
      }
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

  void _openPreview(String url, String title) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => Scaffold(
          backgroundColor: Colors.black,
          appBar: AppBar(
            backgroundColor: Colors.black,
            foregroundColor: Colors.white,
            title: Text(title),
          ),
          body: Center(
            child: InteractiveViewer(
              child: Image.network(url, fit: BoxFit.contain),
            ),
          ),
        ),
      ),
    );
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
                        'Required documents for activation',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                      SizedBox(height: 6),
                      Text(
                        'Tap a photo to preview full screen. Replace or delete before admin approval.',
                        style: TextStyle(
                          color: GtColors.textSecondary,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                _DocSlot(
                  title: 'Selfie with driving license',
                  doc: s.documentForType('selfie'),
                  previewUrl: _previewUrls[s.documentForType('selfie')?['id']],
                  busy: _busy,
                  onUpload: () => _pickAndUpload('selfie'),
                  onReplace: () => _pickAndUpload('selfie'),
                  onDelete: (doc) => _deleteDoc(doc),
                  onPreview: _openPreview,
                  isLocked: s.documentForType('selfie') != null &&
                      s.isDocumentLocked(s.documentForType('selfie')!),
                ),
                const SizedBox(height: 12),
                _DocSlot(
                  title: 'Driving license',
                  doc: s.documentForType('license'),
                  previewUrl: _previewUrls[s.documentForType('license')?['id']],
                  busy: _busy,
                  onUpload: () => _pickAndUpload('license'),
                  onReplace: () => _pickAndUpload('license'),
                  onDelete: (doc) => _deleteDoc(doc),
                  onPreview: _openPreview,
                  isLocked: s.documentForType('license') != null &&
                      s.isDocumentLocked(s.documentForType('license')!),
                ),
                const SizedBox(height: 12),
                _DocSlot(
                  title: 'Vehicle registration',
                  doc: s.documentForType('vehicle_registration'),
                  previewUrl:
                      _previewUrls[s.documentForType('vehicle_registration')?['id']],
                  busy: _busy,
                  onUpload: () => _pickAndUpload('vehicle_registration'),
                  onReplace: () => _pickAndUpload('vehicle_registration'),
                  onDelete: (doc) => _deleteDoc(doc),
                  onPreview: _openPreview,
                  isLocked: s.documentForType('vehicle_registration') != null &&
                      s.isDocumentLocked(s.documentForType('vehicle_registration')!),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: GtGreenButton(
              label: 'Next',
              onPressed: _busy ? null : () => context.push('/onboarding/photos'),
            ),
          ),
        ],
      ),
    );
  }
}

class _DocSlot extends StatelessWidget {
  const _DocSlot({
    required this.title,
    required this.doc,
    required this.previewUrl,
    required this.busy,
    required this.onUpload,
    required this.onReplace,
    required this.onDelete,
    required this.onPreview,
    required this.isLocked,
  });

  final String title;
  final Map<String, dynamic>? doc;
  final String? previewUrl;
  final bool busy;
  final VoidCallback onUpload;
  final VoidCallback onReplace;
  final void Function(Map<String, dynamic> doc) onDelete;
  final void Function(String url, String title) onPreview;
  final bool isLocked;

  @override
  Widget build(BuildContext context) {
    final hasDoc = doc != null;
    final status = doc?['status']?.toString().toUpperCase() ?? '';
    final statusColor = status == 'APPROVED'
        ? GtColors.brand
        : status == 'REJECTED' || status == 'NEEDS_RESUBMISSION'
            ? Colors.orange.shade800
            : GtColors.textSecondary;

    return GtCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
              if (hasDoc)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: GtColors.soft,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    status.isEmpty ? 'Uploaded' : status.replaceAll('_', ' '),
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: statusColor,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              InkWell(
                onTap: previewUrl != null && !busy
                    ? () => onPreview(previewUrl!, title)
                    : (hasDoc ? null : (busy ? null : onUpload)),
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  width: 96,
                  height: 96,
                  decoration: BoxDecoration(
                    color: GtColors.bgGrey,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: GtColors.border),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: previewUrl != null
                      ? Image.network(
                          previewUrl!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => const Icon(
                            Icons.broken_image_outlined,
                            size: 36,
                            color: GtColors.textMuted,
                          ),
                        )
                      : Icon(
                          hasDoc ? Icons.description_outlined : Icons.add,
                          size: 36,
                          color: GtColors.textMuted,
                        ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (isLocked)
                      const Text(
                        'Approved — locked by admin',
                        style: TextStyle(
                          fontSize: 12,
                          color: GtColors.textSecondary,
                        ),
                      )
                    else if (hasDoc) ...[
                      OutlinedButton.icon(
                        onPressed: busy ? null : onReplace,
                        icon: const Icon(Icons.swap_horiz, size: 18),
                        label: const Text('Replace'),
                      ),
                      const SizedBox(height: 6),
                      TextButton.icon(
                        onPressed: busy ? null : () => onDelete(doc!),
                        icon: const Icon(Icons.delete_outline, size: 18),
                        label: const Text('Delete'),
                        style: TextButton.styleFrom(
                          foregroundColor: Colors.red.shade700,
                        ),
                      ),
                    ] else
                      FilledButton.icon(
                        onPressed: busy ? null : onUpload,
                        style: FilledButton.styleFrom(
                          backgroundColor: GtColors.brand,
                        ),
                        icon: const Icon(Icons.upload_outlined, size: 18),
                        label: const Text('Upload'),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
