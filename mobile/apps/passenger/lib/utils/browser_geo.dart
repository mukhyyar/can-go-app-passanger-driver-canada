import 'browser_geo_stub.dart'
    if (dart.library.html) 'browser_geo_web.dart' as impl;

Future<(double, double)?> readBrowserCoords() => impl.readBrowserCoords();
