import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import '../../utils/error_utils.dart';

final kVehicleClasses = List<String>.unmodifiable(
  MockData.vehicleClasses.map((v) => v.id),
);

int defaultSeatsForClass(String vehicleClass) {
  final key = vehicleClass.toLowerCase().trim();
  switch (key) {
    case 'suv_xl':
      return 7;
    case 'suv':
      return 6;
    case 'van':
    case 'minivan':
    case 'minivan (xxl)':
      return 7;
    case 'minibus':
    case 'mini bus':
    case 'bus':
      return 16;
    case 'sedan':
    case 'economy':
    case 'comfort':
    case 'premium':
    case 'business':
    case 'vip':
    default:
      return 4;
  }
}

String vehicleClassAsset(String vehicleClass) {
  final asset = MockData.vehicleImageAsset(vehicleClass);
  if (asset != null && asset.isNotEmpty) {
    return 'packages/gt_ui/$asset';
  }
  return 'packages/gt_ui/assets/vehicles/premium.png';
}

InputDecoration vehicleFieldDecoration(String label, {String? errorText}) =>
    InputDecoration(
      labelText: label,
      errorText: errorText,
      filled: true,
      fillColor: GtColors.bgGrey,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: GtColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: GtColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: GtColors.brand, width: 1.5),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    );

class VehicleSectionHeader extends StatelessWidget {
  const VehicleSectionHeader(this.title, {super.key, this.subtitle});

  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10, top: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(
              subtitle!,
              style: const TextStyle(
                color: GtColors.textSecondary,
                fontSize: 13,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class VehicleClassPicker extends StatelessWidget {
  const VehicleClassPicker({
    super.key,
    required this.value,
    required this.onChanged,
  });

  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final classes = MockData.vehicleClasses;
    return SizedBox(
      height: 118,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: classes.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, i) {
          final vc = classes[i];
          final isLuxury = vc.id == 'premium' || vc.id == 'suv';
          final selected = vc.id == value || (value == 'sedan' && vc.id == 'economy');
          return Semantics(
            button: true,
            selected: selected,
            label: 'Vehicle class ${vc.name}',
            child: InkWell(
              onTap: () => onChanged(vc.id),
              borderRadius: BorderRadius.circular(14),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                width: 100,
                decoration: BoxDecoration(
                  color: isLuxury ? null : (selected ? GtColors.soft : Colors.white),
                  gradient: isLuxury
                      ? const LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [
                            Color(0xFFFFFBEA), // luminous pale gold highlight
                            Color(0xFFFDE68A), // warm metallic amber gold
                            Color(0xFFF59E0B), // deep golden amber
                            Color(0xFFD97706), // rich gold base
                          ],
                          stops: [0.0, 0.35, 0.70, 1.0],
                        )
                      : null,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: isLuxury
                        ? (selected ? const Color(0xFFB45309) : const Color(0xFFF59E0B))
                        : (selected ? GtColors.brand : GtColors.border),
                    width: isLuxury
                        ? (selected ? 2.0 : 1.4)
                        : (selected ? 2 : 1),
                  ),
                  boxShadow: isLuxury
                      ? [
                          BoxShadow(
                            color: const Color(0x38D97706),
                            blurRadius: 8,
                            offset: const Offset(0, 3),
                            spreadRadius: selected ? 1 : 0,
                          ),
                          if (selected)
                            const BoxShadow(
                              color: Color(0x30F59E0B),
                              blurRadius: 12,
                              offset: Offset(0, 1),
                            ),
                        ]
                      : null,
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(13),
                  child: Stack(
                    children: [
                      if (isLuxury)
                        Positioned.fill(
                          child: IgnorePointer(
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: const Alignment(-1.2, -1.2),
                                  end: const Alignment(1.2, 1.2),
                                  colors: [
                                    Colors.white.withValues(alpha: 0.0),
                                    Colors.white.withValues(alpha: 0.0),
                                    Colors.white.withValues(alpha: 0.42),
                                    Colors.white.withValues(alpha: 0.12),
                                    Colors.white.withValues(alpha: 0.0),
                                  ],
                                  stops: const [0.0, 0.30, 0.46, 0.58, 1.0],
                                ),
                              ),
                            ),
                          ),
                        ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(6, 8, 6, 8),
                        child: Column(
                          children: [
                            Expanded(
                              child: Image.asset(
                                vehicleClassAsset(vc.id),
                                fit: BoxFit.contain,
                                errorBuilder: (_, __, ___) => Icon(
                                  Icons.directions_car,
                                  color: isLuxury
                                      ? const Color(0xFF78350F)
                                      : GtColors.brand,
                                ),
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              vc.name,
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: isLuxury
                                    ? FontWeight.w800
                                    : (selected ? FontWeight.w700 : FontWeight.w500),
                                color: isLuxury
                                    ? const Color(0xFF2E1704)
                                    : (selected ? GtColors.brand : Colors.black87),
                                letterSpacing: isLuxury ? -0.2 : 0,
                              ),
                              textAlign: TextAlign.center,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                      if (isLuxury)
                        Positioned(
                          top: 4,
                          left: 4,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 4,
                              vertical: 1.5,
                            ),
                            decoration: BoxDecoration(
                              gradient: const LinearGradient(
                                colors: [
                                  Color(0xFF2E1704),
                                  Color(0xFF451A03),
                                ],
                              ),
                              borderRadius: BorderRadius.circular(4),
                              boxShadow: const [
                                BoxShadow(
                                  color: Color(0x25000000),
                                  blurRadius: 2,
                                  offset: Offset(0, 1),
                                ),
                              ],
                            ),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  Icons.star,
                                  size: 7.5,
                                  color: Color(0xFFFDE68A),
                                ),
                                SizedBox(width: 2),
                                Text(
                                  'LUXE',
                                  style: TextStyle(
                                    color: Color(0xFFFFFBE8),
                                    fontSize: 8,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 0.3,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      if (selected)
                        Positioned(
                          top: 4,
                          right: 4,
                          child: Icon(
                            Icons.check_circle,
                            size: 16,
                            color: isLuxury
                                ? const Color(0xFFB45309)
                                : GtColors.brand,
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class VehicleCapacityStepper extends StatelessWidget {
  const VehicleCapacityStepper({
    super.key,
    required this.label,
    required this.value,
    required this.min,
    required this.max,
    required this.onChanged,
  });

  final String label;
  final int value;
  final int min;
  final int max;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: GtColors.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          GtStepper(
            value: value,
            min: min,
            max: max,
            onChanged: onChanged,
          ),
        ],
      ),
    );
  }
}

class VehiclePhotoGrid extends StatefulWidget {
  const VehiclePhotoGrid({
    super.key,
    required this.vehicleId,
    this.maxPhotos = 6,
    this.enabled = true,
  });

  final String? vehicleId;
  final int maxPhotos;
  final bool enabled;

  @override
  State<VehiclePhotoGrid> createState() => _VehiclePhotoGridState();
}

class _VehiclePhotoGridState extends State<VehiclePhotoGrid> {
  final Map<String, Uint8List> _bytes = {};
  final Set<String> _failed = {};
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _hydrate());
  }

  @override
  void didUpdateWidget(covariant VehiclePhotoGrid oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.vehicleId != widget.vehicleId) {
      _hydrate();
    }
  }

  Future<void> _hydrate() async {
    final s = context.read<AppState>();
    if (s.isAuthenticated) {
      await s.syncDocumentsStatus();
    }
    if (!mounted) return;
    final docs = s.vehiclePhotosForVehicle(widget.vehicleId);
    for (final doc in docs) {
      final id = doc['id']?.toString();
      if (id == null) continue;
      final cached = s.cachedDocumentPreview(id);
      if (cached != null) {
        if (mounted) setState(() => _bytes[id] = cached);
        continue;
      }
      if (_failed.contains(id)) continue;
      try {
        final bytes = await s.fetchDocumentPreviewBytes(id);
        if (!mounted) return;
        setState(() {
          if (bytes != null) {
            _bytes[id] = bytes;
            _failed.remove(id);
          } else {
            _failed.add(id);
          }
        });
      } catch (_) {
        if (mounted) setState(() => _failed.add(id));
      }
    }
  }

  Future<void> _pick(ImageSource source) async {
    if (!widget.enabled || widget.vehicleId == null || _busy) return;
    final s = context.read<AppState>();
    final current = s.vehiclePhotosForVehicle(widget.vehicleId).length;
    if (current >= widget.maxPhotos) {
      setState(() => _error = 'Maximum ${widget.maxPhotos} photos allowed');
      return;
    }
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: source,
      imageQuality: 85,
      maxWidth: 1920,
      maxHeight: 1920,
    );
    if (file == null || !mounted) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final bytes = await file.readAsBytes();
      if (!mounted) return;
      await s.uploadKycBytes(
        docType: 'vehicle_photo',
        bytes: bytes,
        filename: file.name,
        vehicleId: widget.vehicleId,
      );
      if (!mounted) return;
      await _hydrate();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = cleanErrorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete(String documentId) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete photo?'),
        content: const Text('Remove this vehicle photo?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await context.read<AppState>().deleteDocument(documentId);
      if (!mounted) return;
      setState(() {
        _bytes.remove(documentId);
        _failed.remove(documentId);
      });
      await _hydrate();
    } catch (e) {
      if (mounted) {
        setState(() => _error = cleanErrorMessage(e));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _showSourceSheet() async {
    await showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Gallery'),
              onTap: () {
                Navigator.pop(ctx);
                _pick(ImageSource.gallery);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Camera'),
              onTap: () {
                Navigator.pop(ctx);
                _pick(ImageSource.camera);
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
    final docs = s.vehiclePhotosForVehicle(widget.vehicleId);
    final canAdd = widget.enabled &&
        widget.vehicleId != null &&
        docs.length < widget.maxPhotos &&
        !_busy;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(_error!, style: const TextStyle(color: GtColors.red)),
          ),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: docs.length + (canAdd || docs.isEmpty ? 1 : 0),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 3,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
          ),
          itemBuilder: (context, i) {
            if (i >= docs.length) {
              return Semantics(
                button: true,
                label: 'Add vehicle photo',
                child: InkWell(
                  onTap: canAdd ? _showSourceSheet : null,
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    decoration: BoxDecoration(
                      color: GtColors.bgGrey,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: GtColors.border),
                    ),
                    child: const Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.add_a_photo_outlined, color: GtColors.brand),
                        SizedBox(height: 6),
                        Text('Add photo', style: TextStyle(fontSize: 12)),
                      ],
                    ),
                  ),
                ),
              );
            }
            final doc = docs[i];
            final id = doc['id']?.toString() ?? '';
            final locked = s.isDocumentLocked(doc);
            final bytes = _bytes[id] ?? s.cachedDocumentPreview(id);
            return Semantics(
              label: 'Vehicle photo ${i + 1}',
              child: Stack(
                fit: StackFit.expand,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: bytes != null
                        ? Image.memory(bytes, fit: BoxFit.cover)
                        : Container(
                            color: GtColors.bgGrey,
                            child: Icon(
                              _failed.contains(id)
                                  ? Icons.broken_image_outlined
                                  : Icons.image_outlined,
                              color: GtColors.textMuted,
                            ),
                          ),
                  ),
                  if (!locked && widget.enabled)
                    Positioned(
                      top: 4,
                      right: 4,
                      child: Material(
                        color: Colors.black54,
                        shape: const CircleBorder(),
                        child: InkWell(
                          customBorder: const CircleBorder(),
                          onTap: _busy ? null : () => _delete(id),
                          child: const Padding(
                            padding: EdgeInsets.all(4),
                            child: Icon(
                              Icons.close,
                              size: 16,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            );
          },
        ),
        if (docs.isEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text(
              'Add clear photos of your actual vehicle (max 6).',
              style: TextStyle(color: GtColors.textSecondary, fontSize: 13),
            ),
          ),
      ],
    );
  }
}

class VehiclePrimaryThumb extends StatefulWidget {
  const VehiclePrimaryThumb({
    super.key,
    required this.vehicleId,
    required this.vehicleClass,
    this.size = 72,
  });

  final String vehicleId;
  final String vehicleClass;
  final double size;

  @override
  State<VehiclePrimaryThumb> createState() => _VehiclePrimaryThumbState();
}

class _VehiclePrimaryThumbState extends State<VehiclePrimaryThumb> {
  Uint8List? _bytes;
  bool _loading = true;
  int _gen = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void didUpdateWidget(covariant VehiclePrimaryThumb oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.vehicleId != widget.vehicleId) {
      _load();
    }
  }

  Future<void> _load() async {
    final gen = ++_gen;
    final s = context.read<AppState>();
    final primary = s.primaryVehiclePhoto(widget.vehicleId);
    final id = primary?['id']?.toString();
    if (id == null) {
      if (mounted && gen == _gen) {
        setState(() {
          _bytes = null;
          _loading = false;
        });
      }
      return;
    }
    final cached = s.cachedDocumentPreview(id);
    if (cached != null) {
      if (mounted && gen == _gen) {
        setState(() {
          _bytes = cached;
          _loading = false;
        });
      }
      return;
    }
    if (mounted) setState(() => _loading = true);
    try {
      final bytes = await s.fetchDocumentPreviewBytes(id);
      if (!mounted || gen != _gen) return;
      setState(() {
        _bytes = bytes;
        _loading = false;
      });
    } catch (_) {
      if (!mounted || gen != _gen) return;
      setState(() {
        _bytes = null;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(
        width: widget.size,
        height: widget.size,
        child: _loading
            ? Container(
                color: GtColors.soft,
                child: const Center(
                  child: SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              )
            : _bytes != null
                ? Image.memory(_bytes!, fit: BoxFit.cover)
                : Container(
                    color: GtColors.soft,
                    padding: const EdgeInsets.all(8),
                    child: Image.asset(
                      vehicleClassAsset(widget.vehicleClass),
                      fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) => const Icon(
                        Icons.directions_car,
                        color: GtColors.brand,
                      ),
                    ),
                  ),
      ),
    );
  }
}

class VehicleRegulatoryBadge extends StatelessWidget {
  const VehicleRegulatoryBadge({
    super.key,
    required this.label,
    required this.status,
  });

  final String label;
  final String status;

  @override
  Widget build(BuildContext context) {
    final st = status.trim().toUpperCase();
    Color bg;
    Color fg;
    Border? border;

    switch (st) {
      case 'APPROVED':
        bg = Colors.green.shade50;
        fg = Colors.green.shade800;
        break;
      case 'REJECTED':
      case 'FAILED':
      case 'EXPIRED':
        bg = Colors.red.shade50;
        fg = Colors.red.shade800;
        border = Border.all(color: Colors.red.shade300);
        break;
      case 'PENDING':
      case 'IN_REVIEW':
      case 'NEEDS_RESUBMISSION':
      default:
        bg = Colors.amber.shade50;
        fg = Colors.amber.shade900;
        border = Border.all(color: Colors.amber.shade300);
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        border: border,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '$label: ',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: fg,
            ),
          ),
          Text(
            st.replaceAll('_', ' '),
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }
}

class VehicleDocumentSlot extends StatefulWidget {
  const VehicleDocumentSlot({
    super.key,
    required this.vehicleId,
    required this.docType,
    required this.title,
    this.requiresExpiry = false,
  });

  final String vehicleId;
  final String docType;
  final String title;
  final bool requiresExpiry;

  @override
  State<VehicleDocumentSlot> createState() => _VehicleDocumentSlotState();
}

class _VehicleDocumentSlotState extends State<VehicleDocumentSlot> {
  Uint8List? _previewBytes;
  bool _previewFailed = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadPreview());
  }

  @override
  void didUpdateWidget(covariant VehicleDocumentSlot oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.vehicleId != widget.vehicleId || oldWidget.docType != widget.docType) {
      _loadPreview();
    }
  }

  Future<void> _loadPreview() async {
    final s = context.read<AppState>();
    final doc = s.vehicleDocumentForType(widget.vehicleId, widget.docType);
    final id = doc?['id']?.toString();
    if (id == null) {
      if (mounted) setState(() => _previewBytes = null);
      return;
    }
    final cached = s.cachedDocumentPreview(id);
    if (cached != null) {
      if (mounted) setState(() => _previewBytes = cached);
      return;
    }
    try {
      final bytes = await s.fetchDocumentPreviewBytes(id);
      if (!mounted) return;
      setState(() {
        if (bytes != null) {
          _previewBytes = bytes;
          _previewFailed = false;
        } else {
          _previewFailed = true;
        }
      });
    } catch (_) {
      if (mounted) setState(() => _previewFailed = true);
    }
  }

  Future<void> _pickAndUpload() async {
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
    );
    if (file == null || !mounted) return;

    String? expiresAt;
    if (widget.requiresExpiry || widget.docType == 'insurance') {
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

    final s = context.read<AppState>();
    setState(() => _busy = true);
    try {
      final bytes = await file.readAsBytes();
      final existingDoc = s.vehicleDocumentForType(widget.vehicleId, widget.docType);
      final existingId = existingDoc?['id']?.toString();
      final isReupload = s.isDocumentReuploadRequested(existingDoc);

      if (isReupload && existingId != null) {
        await s.reuploadKycBytes(
          docType: widget.docType,
          documentId: existingId,
          bytes: bytes,
          filename: file.name,
          vehicleId: widget.vehicleId,
          expiresAt: expiresAt,
        );
      } else {
        await s.uploadKycBytes(
          docType: widget.docType,
          bytes: bytes,
          filename: file.name,
          vehicleId: widget.vehicleId,
          expiresAt: expiresAt,
        );
      }
      final newDoc = s.vehicleDocumentForType(widget.vehicleId, widget.docType);
      final id = newDoc?['id']?.toString() ?? existingId;
      if (id != null && mounted) {
        s.rememberDocumentPreview(id, bytes);
        setState(() {
          _previewBytes = bytes;
          _previewFailed = false;
        });
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${widget.title} uploaded')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(cleanErrorMessage(e))),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _openPreview(Uint8List bytes) {
    showDialog<void>(
      context: context,
      builder: (ctx) => Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      widget.title,
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(ctx),
                  ),
                ],
              ),
            ),
            InteractiveViewer(
              maxScale: 4,
              child: Image.memory(bytes, fit: BoxFit.contain),
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final doc = s.vehicleDocumentForType(widget.vehicleId, widget.docType);
    final hasDoc = doc != null;
    final status = doc?['status']?.toString().toUpperCase() ?? '';
    final isLocked = hasDoc && s.isDocumentLocked(doc);
    final isUnderReview = hasDoc && s.isDocumentUnderReview(doc);
    final isExpired = hasDoc && s.isDocumentExpired(doc);
    final isNeedsResubmission = hasDoc && s.isDocumentReuploadRequested(doc);
    final feedback = s.documentFeedback(doc);
    final expStr = doc?['expiresAt']?.toString();
    String? expiryFormatted;
    if (expStr != null && expStr.isNotEmpty) {
      final dt = DateTime.tryParse(expStr);
      if (dt != null) {
        expiryFormatted = '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
      }
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isNeedsResubmission || isExpired ? Colors.red.shade300 : GtColors.border,
        ),
      ),
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
                      widget.title,
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                    ),
                    if (expiryFormatted != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        isExpired ? 'Expired: $expiryFormatted' : 'Expires: $expiryFormatted',
                        style: TextStyle(
                          fontSize: 12,
                          color: isExpired ? Colors.red.shade700 : GtColors.textSecondary,
                          fontWeight: isExpired ? FontWeight.w600 : FontWeight.normal,
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
                            : (isUnderReview || status == 'PENDING'
                                ? Colors.amber.shade50
                                : (status == 'APPROVED'
                                    ? Colors.green.shade50
                                    : (status == 'REJECTED'
                                        ? Colors.red.shade50
                                        : GtColors.soft)))),
                    border: (isNeedsResubmission || status == 'REJECTED' || isExpired)
                        ? Border.all(color: isNeedsResubmission ? Colors.amber.shade300 : Colors.red.shade300)
                        : null,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    isExpired
                        ? 'EXPIRED'
                        : (isNeedsResubmission
                            ? 'Re-upload requested'
                            : (isUnderReview || status == 'PENDING'
                                ? 'Under review'
                                : (status == 'APPROVED' ? 'Approved' : status))),
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: isExpired || status == 'REJECTED'
                          ? Colors.red.shade800
                          : (isNeedsResubmission || isUnderReview || status == 'PENDING'
                              ? Colors.amber.shade900
                              : Colors.green.shade800),
                    ),
                  ),
                )
              else
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: GtColors.soft,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    'Missing',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: GtColors.textSecondary),
                  ),
                ),
            ],
          ),
          if (feedback != null && feedback.isNotEmpty) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.amber.shade50,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: Colors.amber.shade200),
              ),
              child: Row(
                children: [
                  Icon(Icons.info_outline, size: 14, color: Colors.amber.shade900),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      feedback,
                      style: TextStyle(fontSize: 11.5, color: Colors.amber.shade900, fontWeight: FontWeight.w500),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              InkWell(
                onTap: _previewBytes != null && !_busy
                    ? () => _openPreview(_previewBytes!)
                    : (hasDoc || isUnderReview ? null : (_busy ? null : _pickAndUpload)),
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: GtColors.bgGrey,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: GtColors.border),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: _previewBytes != null
                      ? Image.memory(
                          _previewBytes!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => const Icon(Icons.broken_image_outlined, size: 32, color: GtColors.textMuted),
                        )
                      : hasDoc
                          ? (_previewFailed
                              ? const Icon(Icons.broken_image_outlined, size: 32, color: GtColors.textMuted)
                              : const Center(
                                  child: SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(strokeWidth: 2),
                                  ),
                                ))
                          : const Icon(Icons.add, size: 32, color: GtColors.textMuted),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (isLocked) ...[
                      const Text(
                        'Approved — locked by admin',
                        style: TextStyle(fontSize: 12, color: GtColors.textSecondary),
                      ),
                      const SizedBox(height: 6),
                      OutlinedButton.icon(
                        onPressed: _busy ? null : _pickAndUpload,
                        icon: const Icon(Icons.refresh_rounded, size: 16),
                        label: const Text('Resubmit document', style: TextStyle(fontSize: 12)),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: GtColors.brand,
                          side: const BorderSide(color: GtColors.brand),
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                        ),
                      ),
                    ] else ...[
                      FilledButton.icon(
                        onPressed: _busy ? null : _pickAndUpload,
                        icon: Icon(hasDoc ? Icons.replay : Icons.upload_file, size: 16),
                        label: Text(
                          _busy ? 'Uploading…' : (hasDoc ? 'Replace document' : 'Upload document'),
                          style: const TextStyle(fontSize: 12),
                        ),
                        style: FilledButton.styleFrom(
                          backgroundColor: GtColors.brand,
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                        ),
                      ),
                    ],
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
