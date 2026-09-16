import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:image/image.dart' as img;

void main() {
  Uint8List tinyJpeg() {
    final image = img.Image(width: 32, height: 32);
    img.fill(image, color: img.ColorRgb8(200, 40, 40));
    return Uint8List.fromList(img.encodeJpg(image, quality: 90));
  }

  test('normalizeAvatarBytes encodes jpeg and respects max dimension', () {
    final big = img.Image(width: 2048, height: 1024);
    img.fill(big, color: img.ColorRgb8(10, 20, 30));
    final input = Uint8List.fromList(img.encodeJpg(big, quality: 95));
    final out = normalizeAvatarBytes(input);
    final decoded = img.decodeImage(out)!;
    expect(decoded.width, lessThanOrEqualTo(kAvatarMaxDimension));
    expect(decoded.height, lessThanOrEqualTo(kAvatarMaxDimension));
    expect(out.length, lessThan(input.length));
  });

  testWidgets('GtProfileAvatar shows initials when bytes are null',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: GtProfileAvatar(size: 48, initials: 'AB'),
        ),
      ),
    );
    expect(find.text('AB'), findsOneWidget);
    expect(find.byType(Image), findsNothing);
  });

  testWidgets('GtProfileAvatar shows MemoryImage when bytes present',
      (tester) async {
    final bytes = tinyJpeg();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: GtProfileAvatar(size: 48, bytes: bytes, initials: 'AB'),
        ),
      ),
    );
    await tester.pump();
    expect(find.byType(Image), findsOneWidget);
    expect(find.text('AB'), findsNothing);
  });

  testWidgets('GtProfileAvatar keeps image under loading overlay',
      (tester) async {
    final bytes = tinyJpeg();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: GtProfileAvatar(
            size: 48,
            bytes: bytes,
            initials: 'AB',
            loading: true,
          ),
        ),
      ),
    );
    await tester.pump();
    expect(find.byType(Image), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
}
