import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:passenger/screens/book/trip_essentials.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('AppState setReturnEnabled initializes returnDateTime properly', () {
    final state = AppState();
    expect(state.returnEnabled, isFalse);
    expect(state.returnDateTime, isNull);

    state.setReturnEnabled(true);
    expect(state.returnEnabled, isTrue);
    expect(state.returnDateTime, isNotNull);
    expect(state.returnDateTime!.isAfter(state.effectivePickupDateTime), isTrue);

    state.setReturnEnabled(false);
    expect(state.returnEnabled, isFalse);
    expect(state.returnDateTime, isNull);
  });

  testWidgets('TripEssentials shows return trip schedule row when switch is enabled',
      (tester) async {
    final state = AppState();
    state.setFrom(MockData.places.first);
    state.setTo(MockData.places.last);

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

    // Switch should be visible and off
    expect(find.text('Add return trip'), findsOneWidget);
    expect(find.byIcon(Icons.swap_vert_rounded), findsNothing);

    // Turn return trip on
    state.setReturnEnabled(true);
    await tester.pumpAndSettle();

    // Now return trip row should be visible with up/down arrows icon
    expect(find.byIcon(Icons.swap_vert_rounded), findsOneWidget);
    expect(find.textContaining('Return ·'), findsOneWidget);
    expect(find.text('Tap to schedule return'), findsOneWidget);

    // Turn return trip off
    state.setReturnEnabled(false);
    await tester.pumpAndSettle();

    expect(find.byIcon(Icons.swap_vert_rounded), findsNothing);
  });
}
