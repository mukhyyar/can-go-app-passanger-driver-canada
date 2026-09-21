import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:driver/screens/trip_detail_screen.dart';
import 'package:gt_ui/gt_ui.dart';

void main() {
  testWidgets('TripTimeline active item displays white icon on red background', (tester) async {
    // Index 0: Confirmed is active
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: TripTimeline(currentIndex: 0),
        ),
      ),
    );

    // Find all Icons in TripTimeline
    final icons = tester.widgetList<Icon>(find.byType(Icon)).toList();
    expect(icons.length, equals(5));

    // First icon (Confirmed - active index 0) must have color Colors.white
    expect(icons[0].icon, equals(Icons.check_circle_outline));
    expect(icons[0].color, equals(Colors.white));

    // Remaining icons (not active, not done) should have color GtColors.textMuted
    expect(icons[1].color, equals(GtColors.textMuted));
    expect(icons[2].color, equals(GtColors.textMuted));
    expect(icons[3].color, equals(GtColors.textMuted));
    expect(icons[4].color, equals(GtColors.textMuted));
  });

  testWidgets('TripTimeline en route active item displays white car icon', (tester) async {
    // Index 1: En route is active
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: TripTimeline(currentIndex: 1),
        ),
      ),
    );

    final icons = tester.widgetList<Icon>(find.byType(Icon)).toList();
    expect(icons.length, equals(5));

    // First icon (Confirmed - done, but not active) should be GtColors.brand
    expect(icons[0].color, equals(GtColors.brand));

    // Second icon (En route - active) must be Colors.white
    expect(icons[1].icon, equals(Icons.directions_car_outlined));
    expect(icons[1].color, equals(Colors.white));

    // Remaining icons should be textMuted
    expect(icons[2].color, equals(GtColors.textMuted));
    expect(icons[3].color, equals(GtColors.textMuted));
    expect(icons[4].color, equals(GtColors.textMuted));
  });
}
