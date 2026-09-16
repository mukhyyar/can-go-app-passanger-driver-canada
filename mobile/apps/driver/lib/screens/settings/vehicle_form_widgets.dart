import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';

const kVehicleClasses = <String>[
  'sedan',
  'suv',
  'van',
  'minibus',
  'economy',
  'comfort',
  'business',
];

String vehicleClassAsset(String vehicleClass) {
  switch (vehicleClass.toLowerCase()) {
    case 'suv':
      return 'packages/gt_ui/assets/vehicles/suv.png';
    case 'van':
      return 'packages/gt_ui/assets/vehicles/van.png';
    case 'minibus':
    case 'bus':
      return 'packages/gt_ui/assets/vehicles/minibus.png';
    case 'economy':
      return 'packages/gt_ui/assets/vehicles/economy.png';
    case 'comfort':
      return 'packages/gt_ui/assets/vehicles/comfort.png';
    case 'business':
    case 'premium':
      return 'packages/gt_ui/assets/vehicles/business.png';
    case 'vip':
      return 'packages/gt_ui/assets/vehicles/vip.png';
    default:
      return 'packages/gt_ui/assets/vehicles/can-ride-car.png';
  }
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
    return SizedBox(
      height: 112,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: kVehicleClasses.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, i) {
          final c = kVehicleClasses[i];
          final selected = c == value;
          return Semantics(
            button: true,
            selected: selected,
            label: 'Vehicle class $c',
            child: InkWell(
              onTap: () => onChanged(c),
              borderRadius: BorderRadius.circular(14),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                width: 96,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: selected ? GtColors.soft : Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: selected ? GtColors.brand : GtColors.border,
                    width: selected ? 2 : 1,
                  ),
                ),
                child: Column(
                  children: [
                    Expanded(
                      child: Image.asset(
                        vehicleClassAsset(c),
                        fit: BoxFit.contain,
                        errorBuilder: (_, __, ___) => const Icon(
                          Icons.directions_car,
                          color: GtColors.brand,
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      c[0].toUpperCase() + c.substring(1),
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight:
                            selected ? FontWeight.w700 : FontWeight.w500,
                      ),
                    ),
                  ],
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
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
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
        setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
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
