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
    expect(economyTooltip.message, contains('Up to 4 passenger seats'));
    expect(economyTooltip.message, contains('2 standard bags'));

    // Verify tooltips for Minivan (XXL), SUV (XL), and Mini bus
    final allTooltipMessages = tooltips.evaluate().map((el) => (el.widget as Tooltip).message ?? '').toList();
    expect(allTooltipMessages.any((m) => m.contains('Minivan (XXL) Capacity:') && m.contains('Up to 7 - 8 passenger seats')), isTrue);
    expect(allTooltipMessages.any((m) => m.contains('SUV (XL) Capacity:') && m.contains('Up to 7 - 8 passenger seats')), isTrue);
    expect(allTooltipMessages.any((m) => m.contains('Mini bus Capacity:') && m.contains('Up to 12 - 25 passenger seats')), isTrue);

    // Verify Premium and Black SUV are at the end of the vehicle classes list
    final vehicleIds = MockData.vehicleClasses.map((v) => v.id).toList();
    expect(vehicleIds.sublist(vehicleIds.length - 2), ['premium', 'suv']);

    // Verify LUXE badges are shown for premium and suv (2 luxury badges)
    expect(find.text('LUXE'), findsNWidgets(2));
  });

  testWidgets('VehiclePreferences luxury vehicles have gold gradient decoration', (tester) async {
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

    // Verify AnimatedContainers with gradient decoration exist for luxury vehicles
    final animatedContainers = tester.widgetList<AnimatedContainer>(
      find.byType(AnimatedContainer),
    );
    final luxuryContainers = animatedContainers.where((c) {
      final decor = c.decoration as BoxDecoration?;
      return decor?.gradient != null;
    }).toList();

    expect(luxuryContainers.length, 2);
  });
}
