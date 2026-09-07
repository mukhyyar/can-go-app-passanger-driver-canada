import 'dart:convert';

import 'package:http/http.dart' as http;

import 'models.dart';

/// Live place autocomplete via Photon (OpenStreetMap) — no API key required.
class PlacesSearch {
  PlacesSearch._();

  static const _endpoint = 'https://photon.komoot.io/api/';
  static final _client = http.Client();

  /// Search worldwide addresses, airports, hotels, cities, etc.
  static Future<List<Place>> search(String query, {int limit = 12}) async {
    final q = query.trim();
    if (q.isEmpty) return const [];

    final uri = Uri.parse(_endpoint).replace(queryParameters: {
      'q': q,
      'limit': '$limit',
      'lang': 'en',
    });

    final res = await _client.get(
      uri,
      headers: const {
        'Accept': 'application/json',
      },
    );
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('Place search failed (${res.statusCode})');
    }

    final body = jsonDecode(res.body);
    if (body is! Map<String, dynamic>) return const [];
    final features = body['features'];
    if (features is! List) return const [];

    final out = <Place>[];
    for (final f in features) {
      if (f is! Map) continue;
      final props = f['properties'];
      final geom = f['geometry'];
      if (props is! Map || geom is! Map) continue;

      final coords = geom['coordinates'];
      if (coords is! List || coords.length < 2) continue;
      final lng = (coords[0] as num).toDouble();
      final lat = (coords[1] as num).toDouble();

      final label = _labelFrom(props);
      if (label.isEmpty) continue;

      final osmType = '${props['osm_type'] ?? ''}';
      final osmId = '${props['osm_id'] ?? ''}';
      final id = osmId.isNotEmpty ? 'osm-$osmType$osmId' : 'geo-$lat-$lng';

      out.add(
        Place(
          id: id,
          label: label,
          subtitle: _subtitleFrom(props),
          lat: lat,
          lng: lng,
        ),
      );
    }
    return out;
  }

  /// Reverse-geocode lat/lng into a Place (for current location).
  static Future<Place?> reverse(double lat, double lng) async {
    final uri = Uri.parse('https://photon.komoot.io/reverse').replace(
      queryParameters: {
        'lat': '$lat',
        'lon': '$lng',
        'lang': 'en',
      },
    );
    final res = await _client.get(uri, headers: const {'Accept': 'application/json'});
    if (res.statusCode < 200 || res.statusCode >= 300) return null;
    final body = jsonDecode(res.body);
    if (body is! Map<String, dynamic>) return null;
    final features = body['features'];
    if (features is! List || features.isEmpty) {
      return Place(
        id: 'geo-$lat-$lng',
        label: '${lat.toStringAsFixed(5)}, ${lng.toStringAsFixed(5)}',
        lat: lat,
        lng: lng,
      );
    }
    final f = features.first;
    if (f is! Map) return null;
    final props = f['properties'];
    if (props is! Map) return null;
    final osmType = '${props['osm_type'] ?? ''}';
    final osmId = '${props['osm_id'] ?? ''}';
    return Place(
      id: osmId.isNotEmpty ? 'osm-$osmType$osmId' : 'geo-$lat-$lng',
      label: _labelFrom(props).isEmpty
          ? '${lat.toStringAsFixed(5)}, ${lng.toStringAsFixed(5)}'
          : _labelFrom(props),
      subtitle: _subtitleFrom(props),
      lat: lat,
      lng: lng,
    );
  }

  static String _labelFrom(Map props) {
    final name = '${props['name'] ?? ''}'.trim();
    final street = _street(props);
    final locality = _locality(props);
    final country = '${props['country'] ?? ''}'.trim();

    final parts = <String>[];
    if (name.isNotEmpty && name != street) {
      parts.add(name);
    }
    if (street.isNotEmpty) parts.add(street);
    if (locality.isNotEmpty) parts.add(locality);
    if (country.isNotEmpty) parts.add(country);

    if (parts.isEmpty) {
      return name.isNotEmpty ? name : street;
    }
    // Deduplicate consecutive identical parts
    final deduped = <String>[];
    for (final p in parts) {
      if (deduped.isEmpty || deduped.last.toLowerCase() != p.toLowerCase()) {
        deduped.add(p);
      }
    }
    return deduped.join(', ');
  }

  static String _subtitleFrom(Map props) {
    final type = '${props['type'] ?? props['osm_value'] ?? ''}'.trim();
    final city = '${props['city'] ?? props['town'] ?? props['village'] ?? ''}'.trim();
    final country = '${props['country'] ?? ''}'.trim();
    final bits = <String>[];
    if (type.isNotEmpty) bits.add(type.replaceAll('_', ' '));
    if (city.isNotEmpty) bits.add(city);
    if (country.isNotEmpty && !bits.contains(country)) bits.add(country);
    return bits.join(' · ');
  }

  static String _street(Map props) {
    final hn = '${props['housenumber'] ?? ''}'.trim();
    final st = '${props['street'] ?? ''}'.trim();
    if (st.isEmpty) return '';
    return hn.isEmpty ? st : '$hn $st';
  }

  static String _locality(Map props) {
    final city =
        '${props['city'] ?? props['town'] ?? props['village'] ?? props['municipality'] ?? ''}'
            .trim();
    final state = '${props['state'] ?? ''}'.trim();
    final postcode = '${props['postcode'] ?? ''}'.trim();
    final bits = <String>[];
    if (postcode.isNotEmpty) bits.add(postcode);
    if (city.isNotEmpty) bits.add(city);
    if (state.isNotEmpty && state != city) bits.add(state);
    return bits.join(' ');
  }
}
