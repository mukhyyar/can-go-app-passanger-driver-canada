import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import '../../utils/error_utils.dart';

class DocumentsScreen extends StatefulWidget {
  const DocumentsScreen({super.key});

  @override
  State<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _StagedDoc {
  final String docType;
  final Uint8List bytes;
  final String filename;
  final String? expiresAt;
  final String? customLabel;
  final bool isResubmission;

  const _StagedDoc({
    required this.docType,
    required this.bytes,
    required this.filename,
    this.expiresAt,
    this.customLabel,
    this.isResubmission = false,
  });
}

class _DocumentsScreenState extends State<DocumentsScreen> {
  bool _busy = false;
  bool _submitted = false;
  final Map<String, _StagedDoc> _stagedDocs = {};
  final Map<String, Uint8List> _previewBytes = {};
  final Set<String> _previewFailed = {};
  late final TextEditingController _usDocDescController;
  bool _optInUsTransit = false;
  bool _initializedUsTransit = false;

  @override
  void initState() {
    super.initState();
    _usDocDescController = TextEditingController();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final s = context.read<AppState>();
      if (s.isAuthenticated) await s.syncDocumentsStatus();
      if (mounted) await _loadPreviews();
    });
  }

  @override
  void dispose() {
    _usDocDescController.dispose();
    super.dispose();
  }

  Future<void> _loadPreviews() async {
    final s = context.read<AppState>();
    for (final slot in const ['selfie', 'license', 'us_transit_permit']) {
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

  Future<void> _confirmAndResubmit(String docType, String docTitle) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('Resubmit $docTitle?'),
        content: const Text(
          'Resubmitting this document will put your driver profile ON HOLD for admin review.\n\nWhile on hold, you will not be able to submit price offers to passengers until verified and approved.\n\nDo you want to proceed?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: GtColors.brand),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Proceed & Resubmit'),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      await _pickDocument(docType, isResubmission: true);
    }
  }

  Future<void> _pickDocument(String docType, {bool isResubmission = false}) async {
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

    try {
      final bytes = await file.readAsBytes();
      if (!mounted) return;
      final customLabel = docType == 'us_transit_permit'
          ? (_usDocDescController.text.trim().isNotEmpty
              ? _usDocDescController.text.trim()
              : null)
          : null;

      setState(() {
        _stagedDocs[docType] = _StagedDoc(
          docType: docType,
          bytes: bytes,
          filename: file.name,
          expiresAt: expiresAt,
          customLabel: customLabel,
          isResubmission: isResubmission,
        );
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Document selected. Tap "Save documents (${_stagedDocs.length})" at the bottom to upload.',
          ),
        ),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to read selected file: ${cleanErrorMessage(e)}')),
        );
      }
    }
  }

  Future<void> _saveAllStaged() async {
    if (_stagedDocs.isEmpty) return;
    final app = context.read<AppState>();
    setState(() => _busy = true);
    try {
      final docKeys = _stagedDocs.keys.toList();
      for (final key in docKeys) {
        final staged = _stagedDocs[key]!;
        final existingDoc = app.documentForType(staged.docType);
        final existingId = existingDoc?['id']?.toString();
        final isReupload = app.isDocumentReuploadRequested(existingDoc);
        final customLabel = staged.docType == 'us_transit_permit'
            ? (_usDocDescController.text.trim().isNotEmpty
                ? _usDocDescController.text.trim()
                : staged.customLabel)
            : staged.customLabel;

        if (isReupload && existingId != null) {
          await app.reuploadKycBytes(
            docType: staged.docType,
            documentId: existingId,
            bytes: staged.bytes,
            filename: staged.filename,
            expiresAt: staged.expiresAt,
            customLabel: customLabel,
          );
        } else {
          await app.uploadKycBytes(
            docType: staged.docType,
            bytes: staged.bytes,
            filename: staged.filename,
            expiresAt: staged.expiresAt,
            customLabel: customLabel,
          );
        }

        final id = app.documentForType(staged.docType)?['id']?.toString() ?? existingId;
        if (id != null && mounted) {
          app.rememberDocumentPreview(id, staged.bytes);
          setState(() {
            _previewBytes[id] = staged.bytes;
            _previewFailed.remove(id);
          });
        }
        _stagedDocs.remove(key);
      }

      setState(() => _submitted = true);
      await app.syncDocumentsStatus();
      if (!mounted) return;
      await _loadPreviews();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Documents uploaded and submitted for review.'),
        ),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Upload failed: ${cleanErrorMessage(e)}')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _deleteDoc(Map<String, dynamic> doc) async {
    final id = doc['id']?.toString();
    final docType = doc['docType']?.toString();
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
      if (docType != null) {
        _stagedDocs.remove(docType);
      }
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
          SnackBar(content: Text('Delete failed: ${cleanErrorMessage(e)}')),
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

  Future<void> _handleBack() async {
    if (_stagedDocs.isNotEmpty) {
      final shouldDiscard = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Discard unsaved documents?'),
          content: const Text(
            'You have selected documents that have not been uploaded yet. Leaving will discard them.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Keep Editing'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              style: TextButton.styleFrom(foregroundColor: Colors.red),
              child: const Text('Discard & Exit'),
            ),
          ],
        ),
      );
      if (shouldDiscard != true || !mounted) return;
      setState(() => _stagedDocs.clear());
    }

    if (!mounted) return;
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
    if (!_initializedUsTransit) {
      final existingUsDoc = s.documentForType('us_transit_permit');
      if (existingUsDoc != null) {
        _optInUsTransit = true;
        final label = existingUsDoc['customLabel']?.toString();
        if (label != null && label.isNotEmpty && _usDocDescController.text.isEmpty) {
          _usDocDescController.text = label;
        }
      }
      _initializedUsTransit = true;
    }
    // Sticky local submit flag must not keep the under-review banner after KYC approval.
    if (_submitted && s.approvalStatus.toUpperCase() == 'APPROVED') {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _submitted) setState(() => _submitted = false);
      });
    }
    final hasApprovedDoc = s.documents.any(
      (d) => (d['status']?.toString().toUpperCase() ?? '') == 'APPROVED',
    );
    final isAllUnderReview =
        (s.areDocumentsUnderReview || _submitted) &&
        s.approvalStatus.toUpperCase() != 'APPROVED' &&
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
                ] else if (hasApprovedDoc && s.isProfileOnHold) ...[
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
                          Icons.pause_circle_outline,
                          color: Colors.amber.shade900,
                          size: 24,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Profile on hold — documents under review',
                                style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 14,
                                  color: Colors.amber.shade900,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                'A resubmitted document is currently under review by our admin team. Submitting offers to passengers is paused until verified.',
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
                        _stagedDocs.isNotEmpty
                            ? 'You have ${_stagedDocs.length} unsaved document(s). Tap "Save documents" below to upload them.'
                            : isAllUnderReview
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
                  stagedDoc: _stagedDocs['selfie'],
                  onRemoveStaged: () => setState(() => _stagedDocs.remove('selfie')),
                  previewBytes: _previewBytes[s.documentForType('selfie')?['id']],
                  previewFailed: _previewFailed
                      .contains(s.documentForType('selfie')?['id']?.toString()),
                  busy: _busy,
                  onUpload: () => _pickDocument('selfie'),
                  onReplace: () => _pickDocument('selfie'),
                  onResubmit: () => _confirmAndResubmit('selfie', 'Selfie with driving license'),
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
                  stagedDoc: _stagedDocs['license'],
                  onRemoveStaged: () => setState(() => _stagedDocs.remove('license')),
                  previewBytes: _previewBytes[s.documentForType('license')?['id']],
                  previewFailed: _previewFailed
                      .contains(s.documentForType('license')?['id']?.toString()),
                  busy: _busy,
                  onUpload: () => _pickDocument('license'),
                  onReplace: () => _pickDocument('license'),
                  onResubmit: () => _confirmAndResubmit('license', 'Driving license'),
                  onDelete: (doc) => _deleteDoc(doc),
                  onPreview: _openPreview,
                  isLocked: s.documentForType('license') != null &&
                      s.isDocumentLocked(s.documentForType('license')!),
                  isUnderReview: isSlotUnderReview(s.documentForType('license')),
                  feedback: s.documentFeedback(s.documentForType('license')),
                ),
                const SizedBox(height: 16),
                _buildUsTransitSection(s, isSlotUnderReview),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: _stagedDocs.isNotEmpty
                ? GtGreenButton(
                    label: _busy
                        ? 'Uploading...'
                        : 'Save documents (${_stagedDocs.length})',
                    onPressed: _busy ? null : _saveAllStaged,
                  )
                : isAllUnderReview
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
                                      if (!context.mounted) return;
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        const SnackBar(
                                          content: Text('Documents submitted for review'),
                                        ),
                                      );
                                    } else {
                                      if (!context.mounted) return;
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

  Widget _buildUsTransitSection(
    AppState s,
    bool Function(Map<String, dynamic>?) isSlotUnderReview,
  ) {
    final transitDoc = s.documentForType('us_transit_permit');
    final hasDoc = transitDoc != null;
    final isLocked = hasDoc && s.isDocumentLocked(transitDoc);

    return GtCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            title: const Text(
              'I want to take rides that transit through the USA',
              style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
            ),
            subtitle: const Text(
              'Required for faster cross-provincial routes (e.g. Toronto ↔ Western Canada) passing through U.S. highways.',
              style: TextStyle(fontSize: 12, color: GtColors.textSecondary),
            ),
            value: _optInUsTransit,
            onChanged: isLocked
                ? null
                : (val) {
                    setState(() {
                      _optInUsTransit = val ?? false;
                      if (!_optInUsTransit) {
                        _stagedDocs.remove('us_transit_permit');
                      }
                    });
                  },
          ),
          if (_optInUsTransit) ...[
            const Divider(height: 20),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.info_outline, size: 16, color: GtColors.brand),
                      SizedBox(width: 8),
                      Text(
                        'Admissible U.S. Transit & Travel Documents',
                        style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  _buildBulletItem('Canadian Passport or NEXUS Card'),
                  _buildBulletItem('U.S. Passport or U.S. Lawful Permanent Resident Card (Green Card)'),
                  _buildBulletItem('Foreign Passport with approved U.S. B1/B2 Visitor Visa or ESTA'),
                  _buildBulletItem('Canadian PR Card + Foreign Passport with valid U.S. Visa'),
                  const SizedBox(height: 6),
                  const Text(
                    'Note: All passengers booked on routes crossing into the U.S. must also possess valid travel documentation.',
                    style: TextStyle(fontSize: 11, fontStyle: FontStyle.italic, color: GtColors.textSecondary),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _usDocDescController,
              decoration: const InputDecoration(
                labelText: 'Document Description',
                hintText: 'e.g., Canadian Passport, US B1/B2 Visa, NEXUS',
                helperText: 'State your document type (e.g. Canadian/US Passport, Visa, NEXUS)',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
            const SizedBox(height: 14),
            _DocSlot(
              title: 'U.S. Transit & Travel Authorization',
              doc: transitDoc,
              stagedDoc: _stagedDocs['us_transit_permit'],
              onRemoveStaged: () => setState(() => _stagedDocs.remove('us_transit_permit')),
              previewBytes: _previewBytes[transitDoc?['id']],
              previewFailed: _previewFailed
                  .contains(transitDoc?['id']?.toString()),
              busy: _busy,
              onUpload: () => _pickDocument('us_transit_permit'),
              onReplace: () => _pickDocument('us_transit_permit'),
              onResubmit: () => _confirmAndResubmit(
                'us_transit_permit',
                'U.S. Transit Document',
              ),
              onDelete: (doc) => _deleteDoc(doc),
              onPreview: _openPreview,
              isLocked: isLocked,
              isUnderReview: isSlotUnderReview(transitDoc),
              feedback: s.documentFeedback(transitDoc),
            ),
          ],
        ],
      ),
    );
  }

  static Widget _buildBulletItem(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '• ',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: GtColors.brand),
          ),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(fontSize: 12, color: GtColors.text),
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
    required this.previewBytes,
    required this.previewFailed,
    required this.busy,
    required this.onUpload,
    required this.onReplace,
    required this.onDelete,
    required this.onPreview,
    required this.isLocked,
    this.onResubmit,
    this.isUnderReview = false,
    this.feedback,
    this.stagedDoc,
    this.onRemoveStaged,
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
  final VoidCallback? onResubmit;
  final bool isUnderReview;
  final String? feedback;
  final _StagedDoc? stagedDoc;
  final VoidCallback? onRemoveStaged;

  @override
  Widget build(BuildContext context) {
    final hasStaged = stagedDoc != null;
    final hasDoc = doc != null;
    final s = context.watch<AppState>();
    final isExpired = s.isDocumentExpired(doc);
    final isExpiring = s.isDocumentExpiringSoon(doc);
    final expiresAtStr = stagedDoc?.expiresAt ?? doc?['expiresAt']?.toString();
    final expiryFormatted = expiresAtStr != null && expiresAtStr.length >= 10
        ? expiresAtStr.substring(0, 10)
        : null;

    final status = doc?['status']?.toString().toUpperCase() ?? '';
    final isNeedsResubmission = status == 'NEEDS_RESUBMISSION';
    final isRejected = status == 'REJECTED' || isNeedsResubmission;
    final slotUnderReview = isUnderReview && !isExpired && !isRejected;

    final statusColor = hasStaged
        ? Colors.amber.shade900
        : isExpired
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

    final customLabel = stagedDoc?.customLabel ?? doc?['customLabel']?.toString();

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
                    if (customLabel != null && customLabel.trim().isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        'Type: $customLabel',
                        style: const TextStyle(
                          fontSize: 12,
                          color: GtColors.textSecondary,
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    ],
                    if (expiryFormatted != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        hasStaged
                            ? 'Expires: $expiryFormatted'
                            : isExpired
                                ? 'Expired: $expiryFormatted'
                                : 'Expires: $expiryFormatted',
                        style: TextStyle(
                          fontSize: 12,
                          color: hasStaged
                              ? GtColors.textSecondary
                              : isExpired
                                  ? Colors.red.shade700
                                  : isExpiring
                                      ? Colors.orange.shade800
                                      : GtColors.textSecondary,
                          fontWeight:
                              (!hasStaged && isExpired) ? FontWeight.w600 : FontWeight.normal,
                        ),
                      ),
                    ],
                    if (!hasStaged &&
                        isRejected &&
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
              if (hasStaged)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.amber.shade50,
                    border: Border.all(color: Colors.amber.shade300),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    'Selected (Pending save)',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: Colors.amber.shade900,
                    ),
                  ),
                )
              else if (hasDoc)
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
                onTap: hasStaged
                    ? () => onPreview(stagedDoc!.bytes, title)
                    : previewBytes != null && !busy
                        ? () => onPreview(previewBytes!, title)
                        : (hasDoc || slotUnderReview ? null : (busy ? null : onUpload)),
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  width: 96,
                  height: 96,
                  decoration: BoxDecoration(
                    color: GtColors.bgGrey,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: hasStaged ? Colors.amber.shade400 : GtColors.border,
                      width: hasStaged ? 1.5 : 1.0,
                    ),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (hasStaged)
                        Image.memory(
                          stagedDoc!.bytes,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => const Icon(
                            Icons.broken_image_outlined,
                            size: 36,
                            color: GtColors.textMuted,
                          ),
                        )
                      else if (previewBytes != null)
                        Image.memory(
                          previewBytes!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => const Icon(
                            Icons.broken_image_outlined,
                            size: 36,
                            color: GtColors.textMuted,
                          ),
                        )
                      else if (hasDoc)
                        (previewFailed
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
                      else
                        const Icon(
                          Icons.add,
                          size: 36,
                          color: GtColors.textMuted,
                        ),
                      if (hasStaged || previewBytes != null)
                        Positioned(
                          right: 4,
                          bottom: 4,
                          child: Container(
                            padding: const EdgeInsets.all(2),
                            decoration: BoxDecoration(
                              color: Colors.black54,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Icon(
                              Icons.zoom_in,
                              size: 16,
                              color: Colors.white,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (hasStaged) ...[
                      OutlinedButton.icon(
                        onPressed: busy ? null : onReplace,
                        icon: const Icon(Icons.swap_horiz, size: 18),
                        label: const Text('Replace file'),
                      ),
                      const SizedBox(height: 6),
                      TextButton.icon(
                        onPressed: busy ? null : onRemoveStaged,
                        icon: const Icon(Icons.close, size: 18),
                        label: const Text('Remove file'),
                        style: TextButton.styleFrom(
                          foregroundColor: Colors.red.shade700,
                        ),
                      ),
                    ]
                    else if (isLocked) ...[
                      const Text(
                        'Approved — locked by admin',
                        style: TextStyle(
                          fontSize: 12,
                          color: GtColors.textSecondary,
                        ),
                      ),
                      if (onResubmit != null) ...[
                        const SizedBox(height: 6),
                        OutlinedButton.icon(
                          onPressed: busy ? null : onResubmit,
                          icon: const Icon(Icons.refresh_rounded, size: 16),
                          label: const Text(
                            'Resubmit document',
                            style: TextStyle(fontSize: 12),
                          ),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: GtColors.brand,
                            side: const BorderSide(color: GtColors.brand),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 8),
                          ),
                        ),
                      ],
                    ]
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
