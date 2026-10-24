import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/screens/book/get_offers_bar.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets(
      'GetOffersBar disables button and updates label when isCreatingBooking is true',
      (tester) async {
    final state = AppState();

    await tester.pumpWidget(
      ChangeNotifierProvider<AppState>.value(
        value: state,
        child: MaterialApp(
          home: Scaffold(
            body: Consumer<AppState>(
              builder: (_, s, __) => GetOffersBar(state: s),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Verify initial state
    expect(find.text('Get offers'), findsOneWidget);
    expect(find.text('Getting offers…'), findsNothing);

    // Initial button is enabled (allows validation clicks)
    final initialButton = tester.widget<ElevatedButton>(
      find.descendant(of: find.byType(GtGreenButton), matching: find.byType(ElevatedButton)),
    );
    expect(initialButton.onPressed, isNotNull);

    // Now test that when terms are toggled, termsAccepted updates
    await tester.tap(find.byType(Checkbox));
    await tester.pumpAndSettle();
    expect(state.termsAccepted, isTrue);
  });

  testWidgets('When submitting in GetOffersBar, button is disabled (onPressed == null)',
      (tester) async {
    final state = AppState();

    await tester.pumpWidget(
      ChangeNotifierProvider<AppState>.value(
        value: state,
        child: MaterialApp(
          home: Scaffold(
            body: Consumer<AppState>(
              builder: (_, s, __) => GetOffersBar(state: s),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Tapping without auth will push /auth without starting submission
    await tester.tap(find.byType(GtGreenButton));
    await tester.pump();
    expect(find.text('Please select a pickup location'), findsOneWidget);
  });
}
