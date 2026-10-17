import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:passenger/screens/book/trip_essentials.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('Selecting pickup time updates the label and pickupNow flag',
      (tester) async {
    final state = AppState();

    await tester.pumpWidget(
      ChangeNotifierProvider<AppState>.value(
        value: state,
        child: MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: Consumer<AppState>(
                builder: (_, s, __) => TripEssentials(state: s),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Pickup · Now'), findsOneWidget);
    expect(state.pickupNow, isTrue);

    // Tap to schedule via text/calendar
    await tester.tap(find.text('Tap to schedule'));
    await tester.pumpAndSettle();

    // Date picker should be open. Confirm date (OK button)
    expect(find.text('OK'), findsOneWidget);
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();

    // Time picker should be open. Confirm time (OK button)
    expect(find.text('OK'), findsOneWidget);
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();

    expect(state.pickupNow, isFalse);
    expect(find.text('Pickup · Now'), findsNothing);
    expect(find.text('Tap to change time'), findsOneWidget);

    // Now tap the 'Now' pill to revert back to Now
    await tester.tap(find.text('Now'));
    await tester.pumpAndSettle();

    expect(state.pickupNow, isTrue);
    expect(find.text('Pickup · Now'), findsOneWidget);
    expect(find.text('Tap to schedule'), findsOneWidget);
  });

  testWidgets('Tapping Now pill when pickupNow is true opens date/time picker',
      (tester) async {
    final state = AppState();

    await tester.pumpWidget(
      ChangeNotifierProvider<AppState>.value(
        value: state,
        child: MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: Consumer<AppState>(
                builder: (_, s, __) => TripEssentials(state: s),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(state.pickupNow, isTrue);

    // Tap Now pill
    await tester.tap(find.text('Now'));
    await tester.pumpAndSettle();

    // Date picker should open
    expect(find.text('OK'), findsOneWidget);
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();

    // Time picker should open
    expect(find.text('OK'), findsOneWidget);
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();

    expect(state.pickupNow, isFalse);
    expect(find.text('Pickup · Now'), findsNothing);
    expect(find.text('Tap to change time'), findsOneWidget);
  });
}
