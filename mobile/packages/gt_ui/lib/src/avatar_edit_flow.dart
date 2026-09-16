import 'dart:typed_data';

import 'package:crop_your_image/crop_your_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:gt_ui/src/avatar_normalize.dart';
import 'package:gt_ui/src/theme.dart';
import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart';

/// Result of the avatar edit sheet / crop flow.
sealed class GtAvatarEditResult {
  const GtAvatarEditResult();
}

class GtAvatarEditPicked extends GtAvatarEditResult {
  const GtAvatarEditPicked(this.bytes);
  final Uint8List bytes;
}

class GtAvatarEditRemoved extends GtAvatarEditResult {
  const GtAvatarEditRemoved();
}

class GtAvatarEditCancelled extends GtAvatarEditResult {
  const GtAvatarEditCancelled();
}

/// Shared camera / gallery / remove → circular crop → normalized JPEG bytes.
class GtAvatarEditFlow {
  GtAvatarEditFlow._();

  /// Opens the source sheet. Returns normalized JPEG bytes, remove, or cancel.
  ///
  /// Cancellation (picker dismiss, back without changes) is silent — returns
  /// [GtAvatarEditCancelled]. Permission / decode failures throw [GtAvatarEditException]
  /// with a user-facing [GtAvatarEditException.message].
  static Future<GtAvatarEditResult> pickAndCrop(
    BuildContext context, {
    required bool hasExistingPhoto,
  }) async {
    final source = await showModalBottomSheet<_SheetAction>(
      context: context,
      backgroundColor: GtColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: GtColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'Profile photo',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: GtColors.text,
                ),
              ),
              const SizedBox(height: 8),
              ListTile(
                leading: const Icon(Icons.photo_camera_outlined,
                    color: GtColors.brand),
                title: const Text('Camera'),
                onTap: () => Navigator.pop(ctx, _SheetAction.camera),
              ),
              ListTile(
                leading: const Icon(Icons.photo_library_outlined,
                    color: GtColors.brand),
                title: const Text('Gallery'),
                onTap: () => Navigator.pop(ctx, _SheetAction.gallery),
              ),
              if (hasExistingPhoto)
                ListTile(
                  leading: const Icon(Icons.delete_outline, color: GtColors.brand),
                  title: const Text('Remove photo'),
                  onTap: () => Navigator.pop(ctx, _SheetAction.remove),
                ),
              ListTile(
                leading: const Icon(Icons.close, color: GtColors.textSecondary),
                title: const Text('Cancel'),
                onTap: () => Navigator.pop(ctx),
              ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );

    if (source == null || !context.mounted) {
      return const GtAvatarEditCancelled();
    }

    if (source == _SheetAction.remove) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Remove photo?'),
          content: const Text(
            'Your profile will show initials instead of a photo.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              style: TextButton.styleFrom(foregroundColor: GtColors.brand),
              child: const Text('Remove'),
            ),
          ],
        ),
      );
      if (confirmed == true) return const GtAvatarEditRemoved();
      return const GtAvatarEditCancelled();
    }

    final pickerSource = source == _SheetAction.camera
        ? ImageSource.camera
        : ImageSource.gallery;

    late final XFile? file;
    try {
      file = await ImagePicker().pickImage(
        source: pickerSource,
        // Full quality for crop; we normalize after crop.
        imageQuality: 95,
        maxWidth: 4096,
      );
    } on PlatformException catch (e) {
      final msg = _permissionMessage(e, pickerSource);
      throw GtAvatarEditException(msg);
    } catch (_) {
      throw GtAvatarEditException(
        pickerSource == ImageSource.camera
            ? 'Could not open the camera. Check permissions and try again.'
            : 'Could not open the gallery. Check permissions and try again.',
      );
    }

    if (file == null) return const GtAvatarEditCancelled();
    if (!context.mounted) return const GtAvatarEditCancelled();

    final raw = await file.readAsBytes();
    if (raw.isEmpty) {
      throw const GtAvatarEditException('Selected image is empty.');
    }
    if (!context.mounted) return const GtAvatarEditCancelled();

    final cropped = await Navigator.of(context).push<Uint8List>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => _AvatarCropScreen(imageBytes: raw),
      ),
    );

    if (cropped == null || cropped.isEmpty) {
      return const GtAvatarEditCancelled();
    }
    return GtAvatarEditPicked(cropped);
  }

  static String _permissionMessage(PlatformException e, ImageSource source) {
    final code = (e.code).toLowerCase();
    final details = '${e.message ?? ''} ${e.details ?? ''}'.toLowerCase();
    final denied = code.contains('permission') ||
        details.contains('permission') ||
        details.contains('denied') ||
        code == 'camera_access_denied' ||
        code == 'photo_access_denied';
    if (denied) {
      if (source == ImageSource.camera) {
        return 'Camera permission is required. Enable it in system settings.';
      }
      return 'Photo library permission is required. Enable it in system settings.';
    }
    return source == ImageSource.camera
        ? 'Could not open the camera.'
        : 'Could not open the gallery.';
  }
}

class GtAvatarEditException implements Exception {
  const GtAvatarEditException(this.message);
  final String message;

  @override
  String toString() => message;
}

enum _SheetAction { camera, gallery, remove }

class _AvatarCropScreen extends StatefulWidget {
  const _AvatarCropScreen({required this.imageBytes});

  final Uint8List imageBytes;

  @override
  State<_AvatarCropScreen> createState() => _AvatarCropScreenState();
}

class _AvatarCropScreenState extends State<_AvatarCropScreen> {
  late final CropController _controller;
  late Uint8List _workingBytes;
  late final Uint8List _originalBytes;
  bool _busy = false;
  bool _ready = false;
  bool _dirty = false;

  @override
  void initState() {
    super.initState();
    _controller = CropController();
    _originalBytes = widget.imageBytes;
    _workingBytes = widget.imageBytes;
  }

  Future<bool> _onWillPop() async {
    if (!_dirty || _busy) return true;
    final leave = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Discard changes?'),
        content: const Text('Your crop adjustments will be lost.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep editing'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: GtColors.brand),
            child: const Text('Discard'),
          ),
        ],
      ),
    );
    return leave == true;
  }

  void _rotate(int quarterTurns) {
    if (_busy) return;
    try {
      final decoded = img.decodeImage(_workingBytes);
      if (decoded == null) {
        _showError('Could not rotate this image.');
        return;
      }
      final rotated = img.copyRotate(decoded, angle: quarterTurns * 90);
      final encoded = Uint8List.fromList(img.encodeJpg(rotated, quality: 95));
      setState(() {
        _workingBytes = encoded;
        _dirty = true;
      });
      _controller.image = encoded;
    } catch (_) {
      _showError('Could not rotate this image.');
    }
  }

  void _reset() {
    if (_busy) return;
    setState(() {
      _workingBytes = _originalBytes;
      _dirty = false;
    });
    _controller.image = _originalBytes;
  }

  void _usePhoto() {
    if (_busy || !_ready) return;
    setState(() => _busy = true);
    _controller.cropCircle();
  }

  void _onCropped(CropResult result) {
    switch (result) {
      case CropSuccess(:final croppedImage):
        try {
          final normalized = normalizeAvatarBytes(croppedImage);
          if (!mounted) return;
          Navigator.pop(context, normalized);
        } catch (_) {
          if (!mounted) return;
          setState(() => _busy = false);
          _showError('Could not process this image. Try another photo.');
        }
      case CropFailure():
        if (!mounted) return;
        setState(() => _busy = false);
        _showError('Crop failed. Adjust the photo and try again.');
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _onWillPop() && context.mounted) {
          Navigator.pop(context);
        }
      },
      child: Scaffold(
        backgroundColor: GtColors.text,
        appBar: AppBar(
          backgroundColor: GtColors.text,
          foregroundColor: Colors.white,
          title: const Text('Adjust photo'),
          leading: IconButton(
            tooltip: 'Cancel',
            onPressed: _busy
                ? null
                : () async {
                    if (await _onWillPop() && context.mounted) {
                      Navigator.pop(context);
                    }
                  },
            icon: const Icon(Icons.close),
          ),
          actions: [
            TextButton(
              onPressed: (_busy || !_ready) ? null : _usePhoto,
              child: _busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text(
                      'Use photo',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
            ),
          ],
        ),
        body: Column(
          children: [
            Expanded(
              child: Crop(
                image: _workingBytes,
                controller: _controller,
                onCropped: _onCropped,
                withCircleUi: true,
                interactive: true,
                fixCropRect: true,
                baseColor: GtColors.text,
                maskColor: Colors.black.withValues(alpha: 0.55),
                progressIndicator: const CircularProgressIndicator(
                  color: GtColors.brand,
                ),
                onStatusChanged: (status) {
                  final ready = status == CropStatus.ready;
                  if (ready != _ready && mounted) {
                    setState(() => _ready = ready);
                  }
                },
                onMoved: (_, __) {
                  if (!_dirty && mounted) setState(() => _dirty = true);
                },
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _CropAction(
                      icon: Icons.rotate_left,
                      label: 'Rotate left',
                      onPressed: _busy ? null : () => _rotate(-1),
                    ),
                    _CropAction(
                      icon: Icons.rotate_right,
                      label: 'Rotate right',
                      onPressed: _busy ? null : () => _rotate(1),
                    ),
                    _CropAction(
                      icon: Icons.refresh,
                      label: 'Reset',
                      onPressed: _busy ? null : _reset,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CropAction extends StatelessWidget {
  const _CropAction({
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      child: IconButton(
        tooltip: label,
        onPressed: onPressed,
        icon: Icon(icon, color: Colors.white),
      ),
    );
  }
}
