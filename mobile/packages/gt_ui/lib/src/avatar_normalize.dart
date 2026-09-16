import 'dart:typed_data';

import 'package:image/image.dart' as img;

/// Max edge length for profile avatars after crop.
const int kAvatarMaxDimension = 1024;

/// JPEG quality for normalized profile avatars (~85%).
const int kAvatarJpegQuality = 85;

/// Normalize cropped avatar bytes for upload + optimistic MemoryImage.
///
/// - Decodes raster image (EXIF orientation applied by `image` package bake)
/// - Strips metadata by re-encoding
/// - Resizes so longest edge ≤ [kAvatarMaxDimension]
/// - Encodes JPEG at [kAvatarJpegQuality]
Uint8List normalizeAvatarBytes(Uint8List input) {
  final decoded = img.decodeImage(input);
  if (decoded == null) {
    throw const FormatException('UNSUPPORTED_IMAGE');
  }

  // bakeOrientation corrects EXIF rotation into pixel data.
  var image = img.bakeOrientation(decoded);

  final longest = image.width > image.height ? image.width : image.height;
  if (longest > kAvatarMaxDimension) {
    if (image.width >= image.height) {
      image = img.copyResize(
        image,
        width: kAvatarMaxDimension,
        interpolation: img.Interpolation.average,
      );
    } else {
      image = img.copyResize(
        image,
        height: kAvatarMaxDimension,
        interpolation: img.Interpolation.average,
      );
    }
  }

  final encoded = img.encodeJpg(image, quality: kAvatarJpegQuality);
  return Uint8List.fromList(encoded);
}
