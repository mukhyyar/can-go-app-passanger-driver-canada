import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:passenger/screens/book/vehicle_preferences.dart';
import 'package:passenger/state/app_state.dart';

void main() {
  testWidgets('VehiclePreferences displays single info icon on each vehicle type with seating capacity tooltip', (tester) async {
    final appState = AppState();

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: VehiclePreferences(
              state: appState,
              showFromPrice: true,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Verify each vehicle class name is present
    for (final vc in MockData.vehicleClasses) {
      expect(find.text(vc.name), findsOneWidget);
    }

    // Verify exactly 1 tooltip widget exists for each vehicle class card
    final tooltips = find.byType(Tooltip);
    expect(tooltips, findsNWidgets(MockData.vehicleClasses.length));

    // Verify each vehicle class card has an info icon inside its tooltip
    final tooltipIcons = find.descendant(
      of: find.byType(Tooltip),
      matching: find.byIcon(Icons.info_outline),
    );
    expect(tooltipIcons, findsNWidgets(MockData.vehicleClasses.length));

    // Verify tooltip message contains seating capacity for Economy
    final economyTooltip = tester.widget<Tooltip>(tooltips.first);
    expect(economyTooltip.message, contains('Economy Capacity:'));
    expect(economyTooltip.message, contains('4 passenger seats'));
    expect(economyTooltip.message, contains('2 standard bags'));
  });
}
