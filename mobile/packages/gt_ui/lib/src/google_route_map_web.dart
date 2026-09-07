// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;
import 'dart:ui_web' as ui_web;

import 'package:flutter/widgets.dart';

final Set<String> _registered = <String>{};

/// Interactive map with A/B drop pins + driving route polyline.
/// Uses Leaflet + OSRM (Google Embed often omits pins/route in iframes).
Widget buildGoogleMapEmbed({
  required double fromLat,
  required double fromLng,
  double? toLat,
  double? toLng,
}) {
  final hasRoute = toLat != null && toLng != null;
  final viewType =
      'cango-route-${fromLat.toStringAsFixed(5)}-${fromLng.toStringAsFixed(5)}'
      '-${hasRoute ? '${toLat!.toStringAsFixed(5)}-${toLng!.toStringAsFixed(5)}' : 'a'}';

  if (!_registered.contains(viewType)) {
    final htmlDoc = _mapHtml(
      fromLat: fromLat,
      fromLng: fromLng,
      toLat: toLat,
      toLng: toLng,
    );
    final blob = html.Blob([htmlDoc], 'text/html');
    final blobUrl = html.Url.createObjectUrlFromBlob(blob);

    ui_web.platformViewRegistry.registerViewFactory(viewType, (int viewId) {
      final iframe = html.IFrameElement()
        ..src = blobUrl
        ..style.border = 'none'
        ..style.width = '100%'
        ..style.height = '100%'
        ..allowFullscreen = true
        ..allow = 'geolocation; fullscreen';
      return iframe;
    });
    _registered.add(viewType);
  }

  return HtmlElementView(viewType: viewType);
}

String _mapHtml({
  required double fromLat,
  required double fromLng,
  double? toLat,
  double? toLng,
}) {
  final hasRoute = toLat != null && toLng != null;
  final gmaps = hasRoute
      ? 'https://www.google.com/maps/dir/?api=1'
          '&origin=$fromLat,$fromLng'
          '&destination=$toLat,$toLng'
          '&travelmode=driving'
      : 'https://www.google.com/maps/search/?api=1&query=$fromLat,$fromLng';

  return '''
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { margin:0; height:100%; width:100%; background:#e8eef3; }
    .pin {
      width: 28px; height: 28px; border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 2px solid #fff;
      box-shadow: 0 2px 6px rgba(0,0,0,.35);
      display: flex; align-items: center; justify-content: center;
    }
    .pin span {
      transform: rotate(45deg);
      color: #fff; font: 800 12px/1 system-ui,sans-serif;
    }
    .pin-a { background: #B41B1D; }
    .pin-b { background: #1A1A1A; }
    .gmaps-link {
      position: absolute; z-index: 1000; right: 8px; bottom: 8px;
      background: #fff; color: #1A1A1A; text-decoration: none;
      font: 700 11px/1 system-ui,sans-serif;
      padding: 8px 10px; border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,.2);
      border: 1px solid #e5e5e5;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <a class="gmaps-link" href="$gmaps" target="_blank" rel="noopener">Open in Google Maps</a>
  <script>
    const from = [$fromLat, $fromLng];
    const to = ${hasRoute ? '[$toLat, $toLng]' : 'null'};
    const map = L.map('map', { zoomControl: true, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    function makePin(letter, cls) {
      return L.divIcon({
        className: '',
        html: '<div class="pin ' + cls + '"><span>' + letter + '</span></div>',
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -28]
      });
    }

    const a = L.marker(from, { icon: makePin('A', 'pin-a') })
      .addTo(map).bindPopup('A · Pickup');
    const layers = [a];

    if (to) {
      const b = L.marker(to, { icon: makePin('B', 'pin-b') })
        .addTo(map).bindPopup('B · Destination');
      layers.push(b);

      const url = 'https://router.project-osrm.org/route/v1/driving/'
        + from[1] + ',' + from[0] + ';' + to[1] + ',' + to[0]
        + '?overview=full&geometries=geojson';

      fetch(url).then(r => r.json()).then(data => {
        if (data && data.routes && data.routes[0]) {
          const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
          const line = L.polyline(coords, {
            color: '#B41B1D', weight: 5, opacity: 0.9, lineJoin: 'round'
          }).addTo(map);
          layers.push(line);
        } else {
          layers.push(L.polyline([from, to], {
            color: '#B41B1D', weight: 4, dashArray: '6 8', opacity: 0.85
          }).addTo(map));
        }
        map.fitBounds(L.featureGroup(layers).getBounds().pad(0.18));
      }).catch(() => {
        layers.push(L.polyline([from, to], {
          color: '#B41B1D', weight: 4, dashArray: '6 8', opacity: 0.85
        }).addTo(map));
        map.fitBounds(L.featureGroup(layers).getBounds().pad(0.18));
      });
    } else {
      map.setView(from, 14);
    }
  </script>
</body>
</html>
''';
}
