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
  bool _submitted = false;
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
    for (final slot in const ['selfie', 'license', 'vehicle_registration', 'insurance']) {
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

    String? expiresAt;
    if (docType != 'selfie') {
      final now = DateTime.now();
      final pickedDate = await showDatePicker(
        context: context,
        initialDate: now.add(const Duration(days: 365)),
        firstDate: now.subtract(const Duration(days: 365)),
        lastDate: now.add(const Duration(days: 365 * 10)),
        helpText: 'Select document expiry date',
      );
      if (pickedDate == null || !mounted) return;
      expiresAt =
          '${pickedDate.year.toString().padLeft(4, '0')}-${pickedDate.month.toString().padLeft(2, '0')}-${pickedDate.day.toString().padLeft(2, '0')}';
    }

    final app = context.read<AppState>();
    setState(() => _busy = true);
    try {
      final bytes = await file.readAsBytes();
      if (docType == 'vehicle_registration' || docType == 'insurance') {
        await app.ensureVehicle();
      }
      final existingDoc = app.documentForType(docType);
      final existingId = existingDoc?['id']?.toString();
      final isReupload = app.isDocumentReuploadRequested(existingDoc);

      if (isReupload && existingId != null) {
        await app.reuploadKycBytes(
          docType: docType,
          documentId: existingId,
          bytes: bytes,
          filename: file.name,
          expiresAt: expiresAt,
        );
      } else {
        await app.uploadKycBytes(
          docType: docType,
          bytes: bytes,
          filename: file.name,
          expiresAt: expiresAt,
        );
      }
      final id = app.documentForType(docType)?['id']?.toString() ?? existingId;
      if (id != null && mounted) {
        app.rememberDocumentPreview(id, bytes);
        setState(() {
          _previewBytes[id] = bytes;
          _previewFailed.remove(id);
          _submitted = false;
        });
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(isReupload ? 'Re-uploaded $docType' : 'Uploaded $docType')),
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
    final isAllUnderReview =
        (s.areDocumentsUnderReview || _submitted) &&
        !s.hasReuploadRequest &&
        !s.hasExpiredDocuments;

    bool isSlotUnderReview(Map<String, dynamic>? doc) {
      if (doc == null) return false;
      if (s.isDocumentExpired(doc)) return false;
      final st = doc['status']?.toString().toUpperCase() ?? '';
      if (st == 'REJECTED' || st == 'NEEDS_RESUBMISSION') return false;
      if (isAllUnderReview) return true;
      if (st == 'PENDING') return true;
      final appStatus = s.approvalStatus.toUpperCase();
      if (appStatus == 'ACTION_REQUIRED' || appStatus == 'IN_REVIEW') {
        return true;
      }
      return false;
    }

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
                if (s.hasReuploadRequest) ...[
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.amber.shade50,
                      border: Border.all(color: Colors.amber.shade300),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.assignment_late_outlined,
                          color: Colors.amber.shade900,
                          size: 24,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Re-upload requested',
                                style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 14,
                                  color: Colors.amber.shade900,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                s.reuploadRequestedSlotTitles.isNotEmpty
                                    ? 'Our admin team reviewed your documents and requested a new upload for: ${s.reuploadRequestedSlotTitles.join(', ')}. Please review the feedback and re-upload below.'
                                    : 'Our admin team reviewed your documents and requested a new upload. Please review the feedback and re-upload below.',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Colors.amber.shade900,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                ] else if (isAllUnderReview) ...[
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF0FDF4),
                      border: Border.all(color: const Color(0xFFBBF7D0)),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.hourglass_top_rounded, color: GtColors.brand),
                        SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Documents under review',
                                style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 14,
                                  color: GtColors.text,
                                ),
                              ),
                              SizedBox(height: 2),
                              Text(
                                'Your documents have been submitted and are currently under review by our admin team.',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: GtColors.textSecondary,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                ] else if (s.hasExpiredDocuments) ...[
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      border: Border.all(color: Colors.red.shade200),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.warning_amber_rounded, color: Colors.red.shade800),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            'Your profile is disabled due to expired documents. Please re-upload updated documents to regain ride eligibility once verified by admin.',
                            style: TextStyle(
                              color: Colors.red.shade900,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: GtColors.bgGrey,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Required documents for activation',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        isAllUnderReview
                            ? 'Tap a photo to preview full screen. All documents are currently locked under review.'
                            : s.hasReuploadRequest
                                ? 'Please re-upload the requested document(s) with clear, legible photos.'
                                : 'Tap a photo to preview full screen. Upload all required documents to submit.',
                        style: const TextStyle(
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
                  isUnderReview: isSlotUnderReview(s.documentForType('selfie')),
                  feedback: s.documentFeedback(s.documentForType('selfie')),
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
                  isUnderReview: isSlotUnderReview(s.documentForType('license')),
                  feedback: s.documentFeedback(s.documentForType('license')),
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
                  isUnderReview: isSlotUnderReview(
                      s.documentForType('vehicle_registration')),
                  feedback: s.documentFeedback(s.documentForType('vehicle_registration')),
                ),
                const SizedBox(height: 12),
                _DocSlot(
                  title: 'Vehicle insurance',
                  doc: s.documentForType('insurance'),
                  previewBytes:
                      _previewBytes[s.documentForType('insurance')?['id']],
                  previewFailed: _previewFailed
                      .contains(s.documentForType('insurance')?['id']?.toString()),
                  busy: _busy,
                  onUpload: () => _pickAndUpload('insurance'),
                  onReplace: () => _pickAndUpload('insurance'),
                  onDelete: (doc) => _deleteDoc(doc),
                  onPreview: _openPreview,
                  isLocked: s.documentForType('insurance') != null &&
                      s.isDocumentLocked(s.documentForType('insurance')!),
                  isUnderReview: isSlotUnderReview(s.documentForType('insurance')),
                  feedback: s.documentFeedback(s.documentForType('insurance')),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: isAllUnderReview
                ? const GtGreenButton(
                    label: 'Documents under review',
                    onPressed: null,
                  )
                : s.hasReuploadRequest
                    ? const GtGreenButton(
                        label: 'Re-upload requested document(s)',
                        onPressed: null,
                      )
                    : GtGreenButton(
                        label: s.hasAllRequiredDocuments ? 'Submit documents' : 'Save',
                        onPressed: _busy
                            ? null
                            : () async {
                                if (s.hasAllRequiredDocuments) {
                                  setState(() => _submitted = true);
                                  await s.syncDocumentsStatus();
                                  if (mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(
                                        content: Text('Documents submitted for review'),
                                      ),
                                    );
                                  }
                                } else {
                                  if (context.canPop()) {
                                    context.pop();
                                  } else {
                                    context.go('/');
                                  }
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
    this.isUnderReview = false,
    this.feedback,
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
  final bool isUnderReview;
  final String? feedback;

  @override
  Widget build(BuildContext context) {
    final hasDoc = doc != null;
    final s = context.watch<AppState>();
    final isExpired = s.isDocumentExpired(doc);
    final isExpiring = s.isDocumentExpiringSoon(doc);
    final expiresAtStr = doc?['expiresAt']?.toString();
    final expiryFormatted = expiresAtStr != null && expiresAtStr.length >= 10
        ? expiresAtStr.substring(0, 10)
        : null;

    final status = doc?['status']?.toString().toUpperCase() ?? '';
    final isNeedsResubmission = status == 'NEEDS_RESUBMISSION';
    final isRejected = status == 'REJECTED' || isNeedsResubmission;
    final slotUnderReview = isUnderReview && !isExpired && !isRejected;

    final statusColor = isExpired
        ? Colors.red.shade700
        : status == 'APPROVED'
            ? GtColors.brand
            : isNeedsResubmission
                ? Colors.amber.shade900
                : isRejected
                    ? Colors.orange.shade800
                    : slotUnderReview || status == 'PENDING'
                        ? Colors.amber.shade900
                        : GtColors.textSecondary;

    return GtCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    if (expiryFormatted != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        isExpired
                            ? 'Expired: $expiryFormatted'
                            : 'Expires: $expiryFormatted',
                        style: TextStyle(
                          fontSize: 12,
                          color: isExpired
                              ? Colors.red.shade700
                              : isExpiring
                                  ? Colors.orange.shade800
                                  : GtColors.textSecondary,
                          fontWeight:
                              isExpired ? FontWeight.w600 : FontWeight.normal,
                        ),
                      ),
                    ],
                    if (isRejected &&
                        feedback != null &&
                        feedback!.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 5),
                        decoration: BoxDecoration(
                          color: Colors.amber.shade50,
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: Colors.amber.shade200),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(
                              Icons.info_outline,
                              size: 14,
                              color: Colors.amber.shade900,
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                feedback!,
                                style: TextStyle(
                                  fontSize: 11.5,
                                  color: Colors.amber.shade900,
                                  fontWeight: FontWeight.w500,
                                  height: 1.25,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (hasDoc)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: isExpired
                        ? Colors.red.shade50
                        : (isNeedsResubmission
                            ? Colors.amber.shade50
                            : (slotUnderReview || status == 'PENDING'
                                ? Colors.amber.shade50
                                : (status == 'APPROVED'
                                    ? Colors.green.shade50
                                    : (status == 'REJECTED'
                                        ? Colors.red.shade50
                                        : GtColors.soft)))),
                    border: (isNeedsResubmission || status == 'REJECTED')
                        ? Border.all(
                            color: isNeedsResubmission
                                ? Colors.amber.shade300
                                : Colors.red.shade300,
                          )
                        : null,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    isExpired
                        ? 'EXPIRED'
                        : (isNeedsResubmission
                            ? 'Re-upload requested'
                            : (slotUnderReview || status == 'PENDING'
                                ? 'Under review'
                                : (status.isEmpty
                                    ? 'Uploaded'
                                    : (status == 'REJECTED'
                                        ? 'REJECTED'
                                        : status.replaceAll('_', ' '))))),
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
                    : (hasDoc || slotUnderReview ? null : (busy ? null : onUpload)),
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
                    else if (slotUnderReview)
                      OutlinedButton.icon(
                        onPressed: null,
                        icon: const Icon(Icons.hourglass_top_rounded, size: 16),
                        label: const Text(
                          'Documents under review',
                          style: TextStyle(fontSize: 12),
                          overflow: TextOverflow.ellipsis,
                        ),
                        style: OutlinedButton.styleFrom(
                          disabledForegroundColor: GtColors.textSecondary,
                          side: const BorderSide(color: GtColors.border),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 10),
                        ),
                      )
                    else if (hasDoc) ...[
                      OutlinedButton.icon(
                        onPressed: busy ? null : onReplace,
                        icon: Icon(
                          (isNeedsResubmission || isExpired)
                              ? Icons.refresh_rounded
                              : Icons.swap_horiz,
                          size: 18,
                        ),
                        label: Text(
                          (isNeedsResubmission || isExpired)
                              ? 'Re-upload'
                              : 'Replace',
                        ),
                        style: (isExpired || isNeedsResubmission)
                            ? OutlinedButton.styleFrom(
                                foregroundColor: isNeedsResubmission
                                    ? Colors.amber.shade900
                                    : Colors.red.shade700,
                                side: BorderSide(
                                  color: isNeedsResubmission
                                      ? Colors.amber.shade400
                                      : Colors.red.shade400,
                                ),
                              )
                            : null,
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
