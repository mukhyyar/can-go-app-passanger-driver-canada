import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:gt_mock/gt_mock.dart';

import 'zone_geo.dart';

/// Builds Google Maps [Polygon]s for saved operating zones.
class OperatingZonePolygons {
  OperatingZonePolygons._();

  static const fill = Color(0x66445555);
  static const stroke = Color(0xFF3A3A3A);
  static const selectedFill = Color(0x88445555);
  static const selectedStroke = Color(0xFF1A1A1A);

  static Set<Polygon> build({
    required List<OperatingZone> zones,
    String? selectedId,
  }) {
    final out = <Polygon>{};
    for (final z in zones) {
      final pts = _pointsFor(z);
      if (pts.length < 3) continue;
      final selected = z.id == selectedId;
      out.add(
        Polygon(
          polygonId: PolygonId(z.id),
          points: pts,
          fillColor: selected ? selectedFill : fill,
          strokeColor: selected ? selectedStroke : stroke,
          strokeWidth: selected ? 3 : 2,
          consumeTapEvents: true,
        ),
      );
    }
    return out;
  }

  static List<LatLng> _pointsFor(OperatingZone z) {
    if (z.coordinates.length >= 3) {
      return z.coordinates
          .map((c) => LatLng(c.latitude, c.longitude))
          .toList();
    }
    if (z.isCircle && z.center != null && z.radiusKm != null) {
      return ZoneGeo.circleToPolygon(z.center!, z.radiusKm!)
          .map((c) => LatLng(c.latitude, c.longitude))
          .toList();
    }
    return const [];
  }

  static LatLng? centroidOf(OperatingZone zone) {
    if (zone.isCircle && zone.center != null) {
      return LatLng(zone.center!.latitude, zone.center!.longitude);
    }
    if (zone.coordinates.isEmpty) return null;
    var lat = 0.0;
    var lng = 0.0;
    for (final c in zone.coordinates) {
      lat += c.latitude;
      lng += c.longitude;
    }
    final n = zone.coordinates.length;
    return LatLng(lat / n, lng / n);
  }
}
