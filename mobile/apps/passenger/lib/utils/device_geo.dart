import 'device_geo_stub.dart'
    if (dart.library.html) 'device_geo_web.dart'
    if (dart.library.io) 'device_geo_io.dart' as impl;

/// One-shot device coordinates (web geolocation or native GPS).
Future<(double, double)?> readDeviceCoords() => impl.readDeviceCoords();
