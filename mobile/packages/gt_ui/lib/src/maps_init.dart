import 'package:flutter/foundation.dart';
import 'package:google_maps_flutter_android/google_maps_flutter_android.dart';
import 'package:google_maps_flutter_platform_interface/google_maps_flutter_platform_interface.dart';

/// Configures Google Maps SDK on Android for reliable rendering, gestures,
/// and hybrid composition (resolving black screen / tile rendering issues).
Future<void> initGoogleMapsAndroid() async {
  if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
  try {
    final GoogleMapsFlutterPlatform mapsImplementation =
        GoogleMapsFlutterPlatform.instance;
    if (mapsImplementation is GoogleMapsFlutterAndroid) {
      // Enable Hybrid Composition so the native map renders directly into the Android view
      // hierarchy. This fixes blank/black map issues inside ClipRRect, Stack, and scrollables.
      mapsImplementation.useAndroidViewSurface = true;
      try {
        await mapsImplementation.initializeWithRenderer(AndroidMapRenderer.latest);
      } catch (_) {
        try {
          // ignore: deprecated_member_use
          await mapsImplementation.initializeWithRenderer(AndroidMapRenderer.legacy);
        } catch (_) {}
      }
    }
  } catch (e) {
    debugPrint('Google Maps Android initialization notice: $e');
  }
}
