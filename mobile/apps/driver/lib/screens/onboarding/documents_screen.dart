import 'dart:typed_data';

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
  final Map<String, Uint8List> _previewBytes = {};
  final Set<String> _previewFailed = {};

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
      final id = app.documentForType(docType)?['id']?.toString();
      if (id != null && mounted) {
        app.rememberDocumentPreview(id, bytes);
        setState(() {
          _previewBytes[id] = bytes;
          _previewFailed.remove(id);
        });
      }
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
      _previewBytes.remove(id);
      _previewFailed.remove(id);
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

  void _openPreview(Uint8List bytes, String title) {
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

  void _handleBack() {
    if (context.canPop()) {
      context.pop();
    } else {
      final s = context.read<AppState>();
      if (s.onboardedComplete) {
        context.go('/');
      } else {
        context.go('/onboarding/zone');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        _handleBack();
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Documents'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: _handleBack,
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
                  previewBytes: _previewBytes[s.documentForType('selfie')?['id']],
                  previewFailed: _previewFailed
                      .contains(s.documentForType('selfie')?['id']?.toString()),
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
                  previewBytes: _previewBytes[s.documentForType('license')?['id']],
                  previewFailed: _previewFailed
                      .contains(s.documentForType('license')?['id']?.toString()),
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
                  previewBytes: _previewBytes[
                      s.documentForType('vehicle_registration')?['id']],
                  previewFailed: _previewFailed.contains(
                      s.documentForType('vehicle_registration')?['id']
                          ?.toString()),
                  busy: _busy,
                  onUpload: () => _pickAndUpload('vehicle_registration'),
                  onReplace: () => _pickAndUpload('vehicle_registration'),
                  onDelete: (doc) => _deleteDoc(doc),
                  onPreview: _openPreview,
                  isLocked: s.documentForType('vehicle_registration') != null &&
                      s.isDocumentLocked(
                          s.documentForType('vehicle_registration')!),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: GtGreenButton(
              label: 'Save',
              onPressed: _busy
                  ? null
                  : () {
                      if (context.canPop()) {
                        context.pop();
                      } else {
                        context.go('/');
                      }
                    },
            ),
          ),
        ],
      ),
    ),
  );
}
}

class _DocSlot extends StatelessWidget {
  const _DocSlot({
    required this.title,
    required this.doc,
    required this.previewBytes,
    required this.previewFailed,
    required this.busy,
    required this.onUpload,
    required this.onReplace,
    required this.onDelete,
    required this.onPreview,
    required this.isLocked,
  });

  final String title;
  final Map<String, dynamic>? doc;
  final Uint8List? previewBytes;
  final bool previewFailed;
  final bool busy;
  final VoidCallback onUpload;
  final VoidCallback onReplace;
  final void Function(Map<String, dynamic> doc) onDelete;
  final void Function(Uint8List bytes, String title) onPreview;
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
                onTap: previewBytes != null && !busy
                    ? () => onPreview(previewBytes!, title)
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
                  child: previewBytes != null
                      ? Image.memory(
                          previewBytes!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => const Icon(
                            Icons.broken_image_outlined,
                            size: 36,
                            color: GtColors.textMuted,
                          ),
                        )
                      : hasDoc
                          ? (previewFailed
                              ? const Icon(
                                  Icons.broken_image_outlined,
                                  size: 36,
                                  color: GtColors.textMuted,
                                )
                              : const Center(
                                  child: SizedBox(
                                    width: 22,
                                    height: 22,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  ),
                                ))
                          : const Icon(
                              Icons.add,
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
