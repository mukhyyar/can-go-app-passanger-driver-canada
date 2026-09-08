import 'package:gt_mock/gt_mock.dart';

/// Convert a backend OperatingZone row into the Flutter [OperatingZone] model.
OperatingZone operatingZoneFromServer(Map<String, dynamic> json) {
  final id = json['id'] as String? ?? '';
  final name = json['name'] as String? ?? 'Operating Zone';
  final zoneType = (json['zoneType'] as String? ?? 'polygon').toLowerCase();
  final geo = json['geoJson'];
  final geoMap = geo is Map ? Map<String, dynamic>.from(geo) : <String, dynamic>{};
  final radiusRaw = json['radiusKm'] ?? geoMap['radiusKm'];
  final radiusKm = radiusRaw is num ? radiusRaw.toDouble() : null;

  if (zoneType == 'circle') {
    final centerRaw = geoMap['center'];
    GeoPoint? center;
    if (centerRaw is List && centerRaw.length >= 2) {
      final lng = (centerRaw[0] as num).toDouble();
      final lat = (centerRaw[1] as num).toDouble();
      center = GeoPoint(latitude: lat, longitude: lng);
    }
    return OperatingZone(
      id: id,
      name: name,
      type: OperatingZoneType.circle,
      center: center,
      radiusKm: radiusKm,
      coordinates: const [],
    );
  }

  // Polygon GeoJSON: coordinates[0] = ring of [lng, lat]
  List<GeoPoint> coordinates = [];
  dynamic coords = geoMap['coordinates'];
  if (geoMap['type'] == 'Feature') {
    final geometry = geoMap['geometry'];
    if (geometry is Map) {
      coords = geometry['coordinates'];
    }
  }
  if (coords is List && coords.isNotEmpty) {
    final ring = coords.first;
    if (ring is List) {
      coordinates = ring
          .whereType<List>()
          .where((p) => p.length >= 2)
          .map(
            (p) => GeoPoint(
              latitude: (p[1] as num).toDouble(),
              longitude: (p[0] as num).toDouble(),
            ),
          )
          .toList();
      // Drop closing duplicate point if present.
      if (coordinates.length > 1 &&
          coordinates.first.latitude == coordinates.last.latitude &&
          coordinates.first.longitude == coordinates.last.longitude) {
        coordinates = coordinates.sublist(0, coordinates.length - 1);
      }
    }
  }

  return OperatingZone(
    id: id,
    name: name,
    type: OperatingZoneType.polygon,
    coordinates: coordinates,
    radiusKm: radiusKm,
  );
}

/// ISO-ish language catalog for carrier profile (code → label).
const kDriverLanguages = <String, String>{
  'EN': 'English',
  'DE': 'Deutsch',
  'FR': 'Français',
  'IT': 'Italiano',
  'ES': 'Español',
  'PT': 'Português',
  'NL': 'Nederlands',
  'RU': 'Русский',
  'ZH': '简体中文',
  'AR': 'العربية',
  'TR': 'Türkçe',
  'UR': 'اردو',
  'UK': 'Українська',
  'HI': 'हिन्दी',
};
