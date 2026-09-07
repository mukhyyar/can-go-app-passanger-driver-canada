import 'package:flutter/material.dart';
import 'theme.dart';

Widget buildGoogleMapEmbed({
  required double fromLat,
  required double fromLng,
  double? toLat,
  double? toLng,
}) {
  final hasRoute = toLat != null && toLng != null;
  return ColoredBox(
    color: GtColors.soft,
    child: Center(
      child: Text(
        hasRoute
            ? 'Route map A→B\n$fromLat,$fromLng → $toLat,$toLng'
            : 'Pickup map\n$fromLat,$fromLng',
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 11, color: GtColors.textSecondary),
      ),
    ),
  );
}
