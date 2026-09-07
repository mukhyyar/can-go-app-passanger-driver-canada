// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;
import 'dart:js_util' as js_util;

Future<(double, double)?> readBrowserCoords() async {
  final geo = html.window.navigator.geolocation;
  if (geo == null) return null;
  try {
    final pos = await geo.getCurrentPosition(
      enableHighAccuracy: true,
      timeout: const Duration(seconds: 10),
    );
    final coords = pos.coords;
    if (coords == null) return null;
    final lat = js_util.getProperty(coords, 'latitude');
    final lng = js_util.getProperty(coords, 'longitude');
    if (lat is! num || lng is! num) return null;
    return (lat.toDouble(), lng.toDouble());
  } catch (_) {
    return null;
  }
}
