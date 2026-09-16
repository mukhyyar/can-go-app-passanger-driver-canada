// ignore: avoid_web_libraries_in_flutter
import 'dart:async';
import 'dart:convert';
import 'dart:html' as html;
import 'dart:js_util' as js_util;
import 'dart:math' as math;
import 'dart:ui_web' as ui_web;

import 'package:flutter/widgets.dart';
import 'route_path.dart';

final Set<String> _registered = <String>{};
Completer<void>? _mapsJsReady;

const _apiBase = String.fromEnvironment(
  'CANGO_API_BASE',
  defaultValue: 'http://127.0.0.1:4000/api',
);

const _browserKeyDefine = String.fromEnvironment(
  'GOOGLE_MAPS_BROWSER_API_KEY',
  defaultValue: '',
);

const _carAnimMinMs = 6000;
const _carAnimMaxMs = 18000;
const _carAnimMetersPerSec = 80.0;
const _carAssetUrl = 'assets/packages/gt_ui/assets/can-ride-car.png';

int _carAnimMsFor(double totalMeters) {
  return (totalMeters / _carAnimMetersPerSec * 1000)
      .round()
      .clamp(_carAnimMinMs, _carAnimMaxMs);
}

String get _normalizedApiBase {
  final api = _apiBase.endsWith('/')
      ? _apiBase.substring(0, _apiBase.length - 1)
      : _apiBase;
  return api;
}

/// Google Maps JS preview mounted in the **host page** (not srcdoc iframe).
///
/// Website-restricted keys require a real HTTP referrer like
/// `http://127.0.0.1:5050/*`. `iframe.srcdoc` sends `about:srcdoc` and fails.
Widget buildGoogleMapEmbed({
  required double fromLat,
  required double fromLng,
  double? toLat,
  double? toLng,
}) {
  final hasRoute = toLat != null && toLng != null;
  final viewType =
      'cango-gmaps-${fromLat.toStringAsFixed(5)}-${fromLng.toStringAsFixed(5)}'
      '-${hasRoute ? '${toLat.toStringAsFixed(5)}-${toLng.toStringAsFixed(5)}' : 'a'}'
      '-${_registered.length}';

  if (!_registered.contains(viewType)) {
    ui_web.platformViewRegistry.registerViewFactory(viewType, (int viewId) {
      final host = html.DivElement()
        ..style.width = '100%'
        ..style.height = '100%'
        ..style.border = 'none'
        ..style.position = 'relative'
        ..style.backgroundColor = '#e8eef3';

      final msg = html.DivElement()
        ..text = 'Loading Google Maps…'
        ..style.position = 'absolute'
        ..style.top = '0'
        ..style.left = '0'
        ..style.right = '0'
        ..style.bottom = '0'
        ..style.display = 'flex'
        ..style.alignItems = 'center'
        ..style.justifyContent = 'center'
        ..style.padding = '16px'
        ..style.textAlign = 'center'
        ..style.font = '600 13px/1.4 system-ui, sans-serif'
        ..style.color = '#5C5C5C'
        ..style.backgroundColor = '#FDEAEA';

      final mapDiv = html.DivElement()
        ..style.width = '100%'
        ..style.height = '100%';

      host.append(mapDiv);
      host.append(msg);

      unawaited(
        _mountMap(
          host: host,
          mapDiv: mapDiv,
          msg: msg,
          fromLat: fromLat,
          fromLng: fromLng,
          toLat: toLat,
          toLng: toLng,
        ),
      );

      return host;
    });
    _registered.add(viewType);
  }

  return HtmlElementView(viewType: viewType);
}

Future<String?> _resolveApiKey() async {
  if (_browserKeyDefine.isNotEmpty) return _browserKeyDefine;
  try {
    final res = await html.HttpRequest.request(
      '$_normalizedApiBase/maps/browser-config',
      method: 'GET',
    );
    final data = jsonDecode(res.responseText ?? '{}');
    if (data is Map && data['apiKey'] is String) {
      final key = (data['apiKey'] as String).trim();
      if (key.isNotEmpty) return key;
    }
  } catch (_) {}
  return null;
}

Future<void> _ensureMapsJs(String apiKey) async {
  final google = js_util.getProperty(html.window, 'google');
  if (google != null) {
    final maps = js_util.getProperty(google, 'maps');
    if (maps != null) return;
  }

  if (_mapsJsReady != null) {
    await _mapsJsReady!.future;
    return;
  }

  final ready = Completer<void>();
  _mapsJsReady = ready;

  final existing = html.document.querySelector('script[data-cango-gmaps="1"]');
  if (existing != null) {
    existing.onLoad.listen((_) {
      if (!ready.isCompleted) ready.complete();
    });
    existing.onError.listen((_) {
      if (!ready.isCompleted) {
        ready.completeError(StateError('Maps JS failed'));
      }
    });
    // Already loaded?
    final g = js_util.getProperty(html.window, 'google');
    if (g != null && js_util.getProperty(g, 'maps') != null) {
      if (!ready.isCompleted) ready.complete();
    }
    await ready.future;
    return;
  }

  final script = html.ScriptElement()
    ..async = true
    ..src =
        'https://maps.googleapis.com/maps/api/js?key=${Uri.encodeComponent(apiKey)}'
    ..setAttribute('data-cango-gmaps', '1');
  script.onLoad.listen((_) {
    if (!ready.isCompleted) ready.complete();
  });
  script.onError.listen((_) {
    _mapsJsReady = null;
    if (!ready.isCompleted) {
      ready.completeError(StateError('Maps JS failed to load'));
    }
  });
  html.document.head!.append(script);
  await ready.future;
}

Future<html.ImageElement?> _loadCarImage() async {
  final completer = Completer<html.ImageElement?>();
  final img = html.ImageElement()..src = _carAssetUrl;
  img.onLoad.listen((_) {
    if (!completer.isCompleted) completer.complete(img);
  });
  img.onError.listen((_) {
    if (!completer.isCompleted) completer.complete(null);
  });
  return completer.future;
}

/// Rotates the nose-up car while preserving the trimmed 336×742 aspect.
/// Returns `(dataUrl, canvasSize)` so the marker can anchor at center.
(String, int)? _rotatedCarDataUrl(html.ImageElement img, double bearingDeg) {
  try {
    final displayH = kCanRideCarMarkerHeight;
    final displayW = kCanRideCarMarkerWidth;
    // Square canvas large enough for any heading (diagonal of the car box).
    final canvasSize =
        math.sqrt(displayW * displayW + displayH * displayH).ceil();
    final canvas = html.CanvasElement(width: canvasSize, height: canvasSize);
    final ctx = canvas.context2D;
    ctx.clearRect(0, 0, canvasSize, canvasSize);
    ctx.translate(canvasSize / 2, canvasSize / 2);
    ctx.rotate(bearingDeg * math.pi / 180);
    ctx.drawImageScaled(
      img,
      -displayW / 2,
      -displayH / 2,
      displayW,
      displayH,
    );
    return (canvas.toDataUrl('image/png'), canvasSize);
  } catch (_) {
    return null;
  }
}

Object _carImageIcon(Object maps, String dataUrl, int canvasSize) {
  final half = canvasSize / 2;
  return js_util.jsify({
    'url': dataUrl,
    'scaledSize': js_util.callConstructor(
      js_util.getProperty(maps, 'Size'),
      [canvasSize, canvasSize],
    ),
    'anchor': js_util.callConstructor(
      js_util.getProperty(maps, 'Point'),
      [half, half],
    ),
  });
}

Object _carSymbolIcon(Object maps, double bearingDeg) {
  // Simple top-down car path (nose points "up" / north at rotation 0).
  const path =
      'M -6,-14 L 6,-14 Q 8,-14 8,-12 L 8,10 Q 8,14 0,14 Q -8,14 -8,10 L -8,-12 Q -8,-14 -6,-14 Z'
      ' M -5,-8 L 5,-8 L 5,-2 L -5,-2 Z';
  return js_util.jsify({
    'path': path,
    'fillColor': '#E50000',
    'fillOpacity': 1,
    'strokeColor': '#8B0000',
    'strokeWeight': 1.5,
    'scale': 1.35,
    'rotation': bearingDeg,
    'anchor': js_util.callConstructor(
      js_util.getProperty(maps, 'Point'),
      [0, 0],
    ),
  });
}

Future<void> _mountMap({
  required html.DivElement host,
  required html.DivElement mapDiv,
  required html.DivElement msg,
  required double fromLat,
  required double fromLng,
  double? toLat,
  double? toLng,
}) async {
  void showError(String text) {
    msg.text = text;
    msg.style.display = 'flex';
  }

  final apiKey = await _resolveApiKey();
  if (apiKey == null) {
    showError(
      'Set GOOGLE_MAPS_BROWSER_API_KEY (browser key with Maps JavaScript API)',
    );
    return;
  }

  try {
    await _ensureMapsJs(apiKey);
  } catch (_) {
    showError(
      'Failed to load Google Maps JS. Check browser key + Maps JavaScript API + billing.',
    );
    return;
  }

  msg.style.display = 'none';

  final google = js_util.getProperty(html.window, 'google');
  final maps = js_util.getProperty(google, 'maps');
  final from = js_util.jsify({'lat': fromLat, 'lng': fromLng});

  final map = js_util.callConstructor(
    js_util.getProperty(maps, 'Map'),
    [
      mapDiv,
      js_util.jsify({
        'center': {'lat': fromLat, 'lng': fromLng},
        'zoom': 13,
        'mapTypeControl': false,
        'streetViewControl': false,
        'fullscreenControl': false,
      }),
    ],
  );

  final bounds = js_util.callConstructor(
    js_util.getProperty(maps, 'LatLngBounds'),
    [],
  );
  js_util.callMethod(bounds, 'extend', [from]);

  js_util.callConstructor(
    js_util.getProperty(maps, 'Marker'),
    [
      js_util.jsify({
        'position': {'lat': fromLat, 'lng': fromLng},
        'map': map,
        'label': 'A',
      }),
    ],
  );

  if (toLat == null || toLng == null) return;

  final to = js_util.jsify({'lat': toLat, 'lng': toLng});
  js_util.callMethod(bounds, 'extend', [to]);
  js_util.callConstructor(
    js_util.getProperty(maps, 'Marker'),
    [
      js_util.jsify({
        'position': {'lat': toLat, 'lng': toLng},
        'map': map,
        'label': 'B',
      }),
    ],
  );

  List<RouteLatLng> routePoints = [
    RouteLatLng(fromLat, fromLng),
    RouteLatLng(toLat, toLng),
  ];

  try {
    final res = await html.HttpRequest.request(
      '$_normalizedApiBase/maps/route',
      method: 'POST',
      sendData: jsonEncode({
        'fromLat': fromLat,
        'fromLng': fromLng,
        'toLat': toLat,
        'toLng': toLng,
      }),
      requestHeaders: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    );
    final data = jsonDecode(res.responseText ?? '{}');
    List<Map<String, double>>? path;
    if (data is Map) {
      final geometry = data['geometry'];
      if (geometry is Map && geometry['coordinates'] is List) {
        path = (geometry['coordinates'] as List)
            .whereType<List>()
            .where((c) => c.length >= 2)
            .map(
              (c) => {
                'lat': (c[1] as num).toDouble(),
                'lng': (c[0] as num).toDouble(),
              },
            )
            .toList();
      } else if (data['overviewPolyline'] is String) {
        path = _decodePolyline(data['overviewPolyline'] as String)
            .map((p) => {'lat': p.$1, 'lng': p.$2})
            .toList();
      }
    }
    if (path != null && path.isNotEmpty) {
      js_util.callConstructor(
        js_util.getProperty(maps, 'Polyline'),
        [
          js_util.jsify({
            'path': path,
            'geodesic': true,
            'strokeColor': '#E50000',
            'strokeOpacity': 0.9,
            'strokeWeight': 5,
            'map': map,
          }),
        ],
      );
      for (final p in path) {
        js_util.callMethod(bounds, 'extend', [js_util.jsify(p)]);
      }
      routePoints = path
          .map((p) => RouteLatLng(p['lat']!, p['lng']!))
          .toList();
    } else {
      js_util.callConstructor(
        js_util.getProperty(maps, 'Polyline'),
        [
          js_util.jsify({
            'path': [
              {'lat': fromLat, 'lng': fromLng},
              {'lat': toLat, 'lng': toLng},
            ],
            'geodesic': true,
            'strokeColor': '#E50000',
            'strokeOpacity': 0.9,
            'strokeWeight': 5,
            'map': map,
          }),
        ],
      );
    }
  } catch (_) {
    js_util.callConstructor(
      js_util.getProperty(maps, 'Polyline'),
      [
        js_util.jsify({
          'path': [
            {'lat': fromLat, 'lng': fromLng},
            {'lat': toLat, 'lng': toLng},
          ],
          'geodesic': true,
          'strokeColor': '#E50000',
          'strokeOpacity': 0.9,
          'strokeWeight': 5,
          'map': map,
        }),
      ],
    );
  }

  js_util.callMethod(map, 'fitBounds', [bounds, 48]);

  final sampler = RoutePathSampler(routePoints);
  if (sampler.isEmpty) return;

  final carAnimMs = _carAnimMsFor(sampler.totalMeters);
  final carImg = await _loadCarImage();
  final first = sampler.sample(0);

  Object icon;
  final rotated =
      carImg != null ? _rotatedCarDataUrl(carImg, first.bearingDeg) : null;
  if (rotated != null) {
    icon = _carImageIcon(maps, rotated.$1, rotated.$2);
  } else {
    icon = _carSymbolIcon(maps, first.bearingDeg);
  }

  final carMarker = js_util.callConstructor(
    js_util.getProperty(maps, 'Marker'),
    [
      js_util.jsify({
        'position': {'lat': first.lat, 'lng': first.lng},
        'map': map,
        'icon': icon,
        'zIndex': 999,
        'optimized': false,
      }),
    ],
  );

  var cancelled = false;

  final startMs = html.window.performance.now();
  var lastBearing = first.bearingDeg;

  void tick(num _) {
    if (cancelled || host.isConnected != true) {
      cancelled = true;
      return;
    }
    final elapsed = html.window.performance.now() - startMs;
    final t = (elapsed % carAnimMs) / carAnimMs;
    final sample = sampler.sample(t);
    js_util.callMethod(
      carMarker,
      'setPosition',
      [
        js_util.jsify({'lat': sample.lat, 'lng': sample.lng}),
      ],
    );

    // Update rotation when heading changes meaningfully.
    var delta = (sample.bearingDeg - lastBearing).abs();
    if (delta > 180) delta = 360 - delta;
    if (delta > 3) {
      lastBearing = sample.bearingDeg;
      if (carImg != null) {
        final rotated = _rotatedCarDataUrl(carImg, sample.bearingDeg);
        if (rotated != null) {
          js_util.callMethod(
            carMarker,
            'setIcon',
            [_carImageIcon(maps, rotated.$1, rotated.$2)],
          );
        }
      } else {
        js_util.callMethod(
          carMarker,
          'setIcon',
          [_carSymbolIcon(maps, sample.bearingDeg)],
        );
      }
    }

    html.window.requestAnimationFrame(tick);
  }

  html.window.requestAnimationFrame(tick);
}

List<(double, double)> _decodePolyline(String encoded) {
  final coords = <(double, double)>[];
  var index = 0;
  var lat = 0;
  var lng = 0;
  while (index < encoded.length) {
    var result = 0;
    var shift = 0;
    int b;
    do {
      b = encoded.codeUnitAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) != 0 ? ~(result >> 1) : (result >> 1);
    result = 0;
    shift = 0;
    do {
      b = encoded.codeUnitAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += (result & 1) != 0 ? ~(result >> 1) : (result >> 1);
    coords.add((lat / 1e5, lng / 1e5));
  }
  return coords;
}
