// ignore_for_file: avoid_web_libraries_in_flutter, deprecated_member_use
import 'dart:async';
import 'dart:convert';
import 'dart:html' as html;
import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'dart:ui_web' as ui_web;

import 'package:flutter/gestures.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';

import 'map_picker.dart';

JSAny? _toJsArg(Object? arg) {
  if (arg == null) return null;
  if (arg is JSAny) return arg;
  if (arg is num) return arg.toJS;
  if (arg is String) return arg.toJS;
  if (arg is bool) return arg.toJS;
  return arg.jsify();
}

JSObject? _jsGetObj(JSObject? target, Object prop) {
  if (target == null) return null;
  final key = prop is num ? prop.toJS : '$prop'.toJS;
  return target.getProperty<JSObject?>(key);
}

Object? _jsGetDart(JSObject? target, Object prop) {
  if (target == null) return null;
  final key = prop is num ? prop.toJS : '$prop'.toJS;
  return target.getProperty<JSAny?>(key)?.dartify();
}

JSAny? _jsCall(JSObject target, String method, [List<Object?> args = const []]) {
  return target.callMethodVarArgs<JSAny?>(
    method.toJS,
    args.map(_toJsArg).toList(),
  );
}

JSObject _jsNew(JSObject parent, String ctorName, [List<Object?> args = const []]) {
  final ctor = parent.getProperty<JSFunction>(ctorName.toJS);
  return ctor.callAsConstructorVarArgs<JSObject>(
    args.map(_toJsArg).toList(),
  );
}

final Set<String> _registered = <String>{};
Completer<void>? _mapsJsReady;
int _pickerSeq = 0;

final Map<String, JSObject> _mapsById = <String, JSObject>{};
final Map<String, void Function(double, double)> _centerHandlers =
    <String, void Function(double, double)>{};
final Map<String, ValueChanged<bool>> _movingHandlers =
    <String, ValueChanged<bool>>{};

const _apiBase = String.fromEnvironment(
  'CANGO_API_BASE',
  defaultValue: 'http://127.0.0.1:4000/api',
);

const _browserKeyDefine = String.fromEnvironment(
  'GOOGLE_MAPS_BROWSER_API_KEY',
  defaultValue: '',
);

String get _normalizedApiBase {
  final api = _apiBase.endsWith('/')
      ? _apiBase.substring(0, _apiBase.length - 1)
      : _apiBase;
  return api;
}

void _emitCenter(String pickerId, double lat, double lng) {
  final cb = _centerHandlers[pickerId];
  if (cb == null) return;
  SchedulerBinding.instance.scheduleFrameCallback((_) => cb(lat, lng));
  SchedulerBinding.instance.ensureVisualUpdate();
}

void _emitMoving(String pickerId, bool moving) {
  final cb = _movingHandlers[pickerId];
  if (cb == null) return;
  SchedulerBinding.instance.scheduleFrameCallback((_) => cb(moving));
  SchedulerBinding.instance.ensureVisualUpdate();
}

(double, double)? _readJsCenter(String pickerId) {
  final map = _mapsById[pickerId];
  if (map == null) return null;
  try {
    final center = _jsCall(map, 'getCenter') as JSObject?;
    if (center == null) return null;
    final lat = _jsCall(center, 'lat')?.dartify();
    final lng = _jsCall(center, 'lng')?.dartify();
    if (lat is num && lng is num) {
      return (lat.toDouble(), lng.toDouble());
    }
  } catch (_) {}
  return null;
}

void _panBy(String pickerId, double dx, double dy) {
  final map = _mapsById[pickerId];
  if (map == null) return;
  try {
    _jsCall(map, 'panBy', [dx, dy]);
  } catch (_) {}
}

void _nudgeZoom(String pickerId, double scrollDy) {
  final map = _mapsById[pickerId];
  if (map == null) return;
  try {
    final z = _jsCall(map, 'getZoom')?.dartify();
    if (z is! num) return;
    final next = (z.toDouble() + (scrollDy > 0 ? -0.6 : 0.6)).clamp(3.0, 20.0);
    _jsCall(map, 'setZoom', [next]);
  } catch (_) {}
}

/// Browser Geocoder (works with HTTP-referrer keys). Falls back to null.
Future<String?> reverseGeocodeLatLng(double lat, double lng) async {
  try {
    final google = _jsGetObj(globalContext, 'google');
    if (google == null) return null;
    final maps = _jsGetObj(google, 'maps');
    if (maps == null) return null;

    final geocoder = _jsNew(maps, 'Geocoder');
    final completer = Completer<String?>();
    final cb = ((JSAny? results, JSAny? status) {
      try {
        final statusStr = status?.dartify()?.toString();
        if (statusStr != 'OK' || results == null) {
          if (!completer.isCompleted) completer.complete(null);
          return;
        }
        final resultsObj = results as JSObject;
        final len = _jsGetDart(resultsObj, 'length');
        if (len is! num || len < 1) {
          if (!completer.isCompleted) completer.complete(null);
          return;
        }
        final first = _jsGetObj(resultsObj, 0);
        final addr = _jsGetDart(first, 'formatted_address');
        if (!completer.isCompleted) {
          completer.complete(
            addr is String && addr.trim().isNotEmpty ? addr.trim() : null,
          );
        }
      } catch (_) {
        if (!completer.isCompleted) completer.complete(null);
      }
    }).toJS;

    _jsCall(geocoder, 'geocode', [
      {
        'location': {'lat': lat, 'lng': lng},
      },
      cb,
    ]);

    return await completer.future.timeout(
      const Duration(seconds: 8),
      onTimeout: () => null,
    );
  } catch (_) {
    return null;
  }
}

Widget buildMapPicker({
  required double initialLat,
  required double initialLng,
  required double initialZoom,
  GtMapPickerController? controller,
  void Function(double lat, double lng)? onCenterChanged,
  ValueChanged<bool>? onMovingChanged,
}) {
  return _WebMapPicker(
    initialLat: initialLat,
    initialLng: initialLng,
    initialZoom: initialZoom,
    controller: controller,
    onCenterChanged: onCenterChanged,
    onMovingChanged: onMovingChanged,
  );
}

class _WebMapPicker extends StatefulWidget {
  const _WebMapPicker({
    required this.initialLat,
    required this.initialLng,
    required this.initialZoom,
    this.controller,
    this.onCenterChanged,
    this.onMovingChanged,
  });

  final double initialLat;
  final double initialLng;
  final double initialZoom;
  final GtMapPickerController? controller;
  final void Function(double lat, double lng)? onCenterChanged;
  final ValueChanged<bool>? onMovingChanged;

  @override
  State<_WebMapPicker> createState() => _WebMapPickerState();
}

class _WebMapPickerState extends State<_WebMapPicker> {
  late final String _pickerId;
  late final String _viewType;
  bool _moving = false;
  int? _activePointer;
  DateTime? _lastCenterEmit;

  @override
  void initState() {
    super.initState();
    _pickerId = 'pick-${++_pickerSeq}';
    _viewType = 'cango-map-pick-$_pickerId';
    _syncHandlers();
    _registerView();
    _bindController();
  }

  void _syncHandlers() {
    final onCenter = widget.onCenterChanged;
    final onMoving = widget.onMovingChanged;
    if (onCenter != null) {
      _centerHandlers[_pickerId] = onCenter;
    } else {
      _centerHandlers.remove(_pickerId);
    }
    if (onMoving != null) {
      _movingHandlers[_pickerId] = (moving) {
        if (_moving == moving) return;
        _moving = moving;
        onMoving(moving);
      };
    } else {
      _movingHandlers.remove(_pickerId);
    }
  }

  void _bindController() {
    widget.controller?.bind(
      animateTo: _animateTo,
      readCenter: () => _readJsCenter(_pickerId),
      onDispose: () => _mapsById.remove(_pickerId),
    );
  }

  @override
  void didUpdateWidget(covariant _WebMapPicker oldWidget) {
    super.didUpdateWidget(oldWidget);
    _syncHandlers();
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller?.unbind();
      _bindController();
    }
  }

  @override
  void dispose() {
    widget.controller?.unbind();
    _mapsById.remove(_pickerId);
    _centerHandlers.remove(_pickerId);
    _movingHandlers.remove(_pickerId);
    super.dispose();
  }

  void _animateTo(double lat, double lng) {
    final map = _mapsById[_pickerId];
    if (map == null) return;
    final google = _jsGetObj(globalContext, 'google');
    if (google == null) return;
    final maps = _jsGetObj(google, 'maps');
    if (maps == null) return;
    final latLng = _jsNew(maps, 'LatLng', [lat, lng]);
    _jsCall(map, 'panTo', [latLng]);
    _jsCall(map, 'setZoom', [widget.initialZoom]);
    // Report after pan settles.
    Future<void>.delayed(const Duration(milliseconds: 320), () {
      final c = _readJsCenter(_pickerId);
      if (c != null) _emitCenter(_pickerId, c.$1, c.$2);
      _emitMoving(_pickerId, false);
    });
  }

  void _reportCenter() {
    final c = _readJsCenter(_pickerId);
    if (c == null) return;
    _emitCenter(_pickerId, c.$1, c.$2);
  }

  void _registerView() {
    if (_registered.contains(_viewType)) return;

    ui_web.platformViewRegistry.registerViewFactory(_viewType, (int viewId) {
      final host = html.DivElement()
        ..style.width = '100%'
        ..style.height = '100%'
        ..style.border = 'none'
        ..style.position = 'relative'
        ..style.backgroundColor = '#e8eef3'
        // Flutter Listener owns gestures — map is visual-only.
        ..style.pointerEvents = 'none';

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
        ..style.backgroundColor = '#FDEAEA'
        ..style.pointerEvents = 'none';

      final mapDiv = html.DivElement()
        ..style.width = '100%'
        ..style.height = '100%'
        ..style.pointerEvents = 'none';

      host.append(mapDiv);
      host.append(msg);

      unawaited(
        _mountPickerMap(
          mapDiv: mapDiv,
          msg: msg,
          pickerId: _pickerId,
          initialLat: widget.initialLat,
          initialLng: widget.initialLng,
          initialZoom: widget.initialZoom,
        ),
      );

      return host;
    });
    _registered.add(_viewType);
  }

  @override
  Widget build(BuildContext context) {
    _syncHandlers();
    // Flutter owns pan/zoom so HtmlElementView under glass-pane still moves.
    return Listener(
      behavior: HitTestBehavior.opaque,
      onPointerDown: (e) {
        _activePointer ??= e.pointer;
        if (_activePointer == e.pointer) {
          _emitMoving(_pickerId, true);
        }
      },
      onPointerMove: (e) {
        if (_activePointer != e.pointer) return;
        if (e.delta == Offset.zero) return;
        _panBy(_pickerId, -e.delta.dx, -e.delta.dy);
        _emitMoving(_pickerId, true);
        final now = DateTime.now();
        if (_lastCenterEmit == null ||
            now.difference(_lastCenterEmit!) >
                const Duration(milliseconds: 220)) {
          _lastCenterEmit = now;
          _reportCenter();
        }
      },
      onPointerUp: (e) {
        if (_activePointer != e.pointer) return;
        _activePointer = null;
        _emitMoving(_pickerId, false);
        _reportCenter();
      },
      onPointerCancel: (e) {
        if (_activePointer != e.pointer) return;
        _activePointer = null;
        _emitMoving(_pickerId, false);
        _reportCenter();
      },
      onPointerSignal: (signal) {
        if (signal is PointerScrollEvent) {
          _nudgeZoom(_pickerId, signal.scrollDelta.dy);
          _emitMoving(_pickerId, true);
          // Settle label after zoom.
          Future<void>.delayed(const Duration(milliseconds: 200), () {
            _emitMoving(_pickerId, false);
            _reportCenter();
          });
        }
      },
      child: IgnorePointer(
        child: HtmlElementView(viewType: _viewType),
      ),
    );
  }
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
  final google = _jsGetObj(globalContext, 'google');
  if (google != null) {
    final maps = _jsGetObj(google, 'maps');
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
    final g = _jsGetObj(globalContext, 'google');
    if (g != null && _jsGetObj(g, 'maps') != null) {
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

Future<void> _mountPickerMap({
  required html.DivElement mapDiv,
  required html.DivElement msg,
  required String pickerId,
  required double initialLat,
  required double initialLng,
  required double initialZoom,
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

  final google = _jsGetObj(globalContext, 'google');
  final maps = _jsGetObj(google, 'maps');
  if (maps == null) return;

  final map = _jsNew(
    maps,
    'Map',
    [
      mapDiv,
      {
        'center': {'lat': initialLat, 'lng': initialLng},
        'zoom': initialZoom,
        'mapTypeControl': false,
        'streetViewControl': false,
        'fullscreenControl': false,
        'zoomControl': false,
        'clickableIcons': false,
        // Flutter Listener drives pan/zoom.
        'gestureHandling': 'none',
        'draggable': false,
        'keyboardShortcuts': false,
        'disableDoubleClickZoom': true,
      },
    ],
  );

  _mapsById[pickerId] = map;

  // Initial center once map is ready.
  final c = _readJsCenter(pickerId);
  if (c != null) _emitCenter(pickerId, c.$1, c.$2);
}
