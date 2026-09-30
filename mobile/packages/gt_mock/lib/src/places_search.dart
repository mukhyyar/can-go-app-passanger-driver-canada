import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;

import 'api_base.dart';
import 'models.dart';

/// Live place search via Nest `/api/maps/places` (Google when MAPS_PROVIDER=google).
class PlacesSearch {
  PlacesSearch._();

  static final _client = http.Client();
  static final _rng = Random();

  static Uri _maps(String path, [Map<String, String>? query]) {
    return Uri.parse('${normalizedApiBaseUrl()}$path')
        .replace(queryParameters: query);
  }

  /// UUID-like session token for Google Places Autocomplete billing sessions.
  static String newSessionToken() {
    String hex(int bytes) {
      final buf = StringBuffer();
      for (var i = 0; i < bytes; i++) {
        buf.write(_rng.nextInt(256).toRadixString(16).padLeft(2, '0'));
      }
      return buf.toString();
    }

    return '${hex(4)}-${hex(2)}-${hex(2)}-${hex(2)}-${hex(6)}';
  }

  /// Search addresses, airports, hotels, cities (autocomplete predictions).
  /// Rows may lack coords until [details] is called with the same [sessionToken].
  static Future<List<Place>> search(
    String query, {
    int limit = 12,
    double? lat,
    double? lng,
    String? sessionToken,
  }) async {
    final q = query.trim();
    if (q.isEmpty) return const [];

    final params = <String, String>{
      'q': q,
      'limit': '$limit',
    };
    if (lat != null && lng != null) {
      params['lat'] = '$lat';
      params['lng'] = '$lng';
    }
    if (sessionToken != null && sessionToken.isNotEmpty) {
      params['sessionToken'] = sessionToken;
    }

    final uri = _maps('/maps/places', params);

    final res = await _client.get(
      uri,
      headers: const {'Accept': 'application/json'},
    );
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('Place search failed (${res.statusCode})');
    }

    final body = jsonDecode(res.body);
    if (body is! List) return const [];

    final out = <Place>[];
    for (final item in body) {
      if (item is! Map) continue;
      final label = '${item['label'] ?? ''}'.trim();
      if (label.isEmpty) continue;
      final placeId = item['placeId']?.toString();
      final latVal = (item['lat'] as num?)?.toDouble() ?? 0;
      final lngVal = (item['lng'] as num?)?.toDouble() ?? 0;
      // Autocomplete rows may have placeId without coords.
      if ((latVal == 0 && lngVal == 0) &&
          (placeId == null || placeId.isEmpty)) {
        continue;
      }
      final id = '${item['id'] ?? placeId ?? 'geo-$latVal-$lngVal'}';
      final subtitle = item['subtitle']?.toString();
      out.add(
        Place(
          id: id,
          label: label,
          subtitle: subtitle != null && subtitle.isNotEmpty ? subtitle : '',
          lat: latVal,
          lng: lngVal,
          placeId: placeId != null && placeId.isNotEmpty ? placeId : null,
        ),
      );
    }
    return out;
  }

  /// Resolve lat/lng for a selected Google place (same session as search).
  static Future<Place?> details(
    String placeId, {
    String? sessionToken,
    String? label,
    String? subtitle,
  }) async {
    final id = placeId.trim();
    if (id.isEmpty) return null;

    final params = <String, String>{'placeId': id};
    if (sessionToken != null && sessionToken.isNotEmpty) {
      params['sessionToken'] = sessionToken;
    }
    if (label != null && label.trim().isNotEmpty) {
      params['label'] = label.trim();
    }

    try {
      final uri = _maps('/maps/place-details', params);
      final res = await _client.get(
        uri,
        headers: const {'Accept': 'application/json'},
      );
      if (res.statusCode >= 200 && res.statusCode < 300) {
        final body = jsonDecode(res.body);
        if (body is Map) {
          final lat = (body['lat'] as num?)?.toDouble();
          final lng = (body['lng'] as num?)?.toDouble();
          if (lat != null && lng != null && (lat != 0 || lng != 0)) {
            final resolvedLabel = (label != null && label.trim().isNotEmpty)
                ? label.trim()
                : '${body['label'] ?? ''}'.trim();
            final resolvedSubtitle =
                (subtitle != null && subtitle.trim().isNotEmpty)
                    ? subtitle.trim()
                    : '${body['subtitle'] ?? ''}'.trim();
            final resolvedPlaceId = body['placeId']?.toString() ?? id;
            return Place(
              id: '${body['id'] ?? 'gplace-$resolvedPlaceId'}',
              label: resolvedLabel.isNotEmpty ? resolvedLabel : id,
              subtitle: resolvedSubtitle,
              lat: lat,
              lng: lng,
              placeId: resolvedPlaceId,
            );
          }
        }
      }
    } catch (_) {
      // Fall through to geocode fallback
    }

    // Fallback: Geocode the address/place query
    final query = (subtitle != null && subtitle.trim().isNotEmpty)
        ? '${label ?? id}, ${subtitle.trim()}'
        : (label ?? id);
    if (query.trim().isNotEmpty) {
      try {
        final geos = await geocode(query);
        if (geos.isNotEmpty && geos.first.hasCoords) {
          final g = geos.first;
          return Place(
            id: g.id,
            label: label?.trim().isNotEmpty == true ? label!.trim() : g.label,
            subtitle: subtitle?.trim().isNotEmpty == true
                ? subtitle!.trim()
                : g.subtitle,
            lat: g.lat,
            lng: g.lng,
            placeId: g.placeId ?? id,
          );
        }
      } catch (_) {
        // Fall through
      }
    }

    return null;
  }

  /// Geocode full street address or search query directly.
  static Future<List<Place>> geocode(String query) async {
    final q = query.trim();
    if (q.isEmpty) return const [];
    try {
      final uri = _maps('/maps/geocode', {'q': q});
      final res = await _client.get(
        uri,
        headers: const {'Accept': 'application/json'},
      );
      if (res.statusCode < 200 || res.statusCode >= 300) return const [];
      final body = jsonDecode(res.body);
      if (body is! List) return const [];
      final out = <Place>[];
      for (final item in body) {
        if (item is! Map) continue;
        final rawLabel = '${item['label'] ?? ''}'.trim();
        if (rawLabel.isEmpty) continue;
        final latVal = (item['lat'] as num?)?.toDouble() ?? 0;
        final lngVal = (item['lng'] as num?)?.toDouble() ?? 0;
        if (latVal == 0 && lngVal == 0) continue;
        final placeId = item['placeId']?.toString();
        final parts = rawLabel.split(',');
        final title = parts.first.trim();
        final sub =
            parts.length > 1 ? parts.sublist(1).join(',').trim() : '';
        out.add(
          Place(
            id: placeId != null && placeId.isNotEmpty
                ? 'gplace-$placeId'
                : 'geo-$latVal-$lngVal',
            label: title,
            subtitle: sub,
            lat: latVal,
            lng: lngVal,
            placeId: placeId,
          ),
        );
      }
      return out;
    } catch (_) {
      return const [];
    }
  }

  /// Reverse-geocode lat/lng into a Place (for current location / map pick).
  static Future<Place?> reverse(double lat, double lng) async {
    final uri = _maps('/maps/reverse', {
      'lat': '$lat',
      'lng': '$lng',
    });
    try {
      final res = await _client
          .get(uri, headers: const {'Accept': 'application/json'})
          .timeout(const Duration(seconds: 12));
      if (res.statusCode < 200 || res.statusCode >= 300) return null;
      final raw = res.body.trim();
      if (raw.isEmpty || raw == 'null') return null;
      final body = jsonDecode(raw);
      if (body is! Map) return null;
      final label = '${body['label'] ?? ''}'.trim();
      if (label.isEmpty) return null;
      return Place(
        id: 'geo-$lat-$lng',
        label: label,
        lat: lat,
        lng: lng,
      );
    } catch (_) {
      return null;
    }
  }
}
