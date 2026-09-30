import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:passenger/screens/book/extras_panel.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets(
    'ExtrasPanel is always expanded in a styled container without expandable accordion',
    (tester) async {
      final state = AppState();
      state.setServiceType(ServiceType.ride);

      await tester.pumpWidget(
        ChangeNotifierProvider<AppState>.value(
          value: state,
          child: MaterialApp(
            home: Scaffold(
              body: SingleChildScrollView(
                child: Consumer<AppState>(
                  builder: (_, s, __) => ExtrasPanel(state: s),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // "Extras optional" header is visible
      expect(find.textContaining('Extras'), findsOneWidget);
      expect(find.textContaining('optional'), findsOneWidget);

      // No dropdown chevron icon exists
      expect(find.byIcon(Icons.keyboard_arrow_down), findsNothing);

      // All fields are immediately visible without tapping to expand
      expect(find.text('Arrival flight number'), findsOneWidget);
      expect(find.text("Name on a sign the driver'll hold"), findsOneWidget);
      expect(
        find.text('Comment: Luggage, special needs or tasks for the driver'),
        findsOneWidget,
      );
      expect(find.text('I need Wi-Fi'), findsOneWidget);
      expect(find.text('I need an English-speaking driver'), findsOneWidget);
      expect(find.text('I have a promo code'), findsOneWidget);

      // Entering comment works immediately
      await tester.tap(find.text('I need Wi-Fi'));
      await tester.pumpAndSettle();
      expect(state.comment, contains('I need Wi-Fi'));

      // Toggling promo code switch reveals promo input
      expect(find.text('Enter promo code'), findsNothing);
      state.setPromoEnabled(true);
      await tester.pumpAndSettle();
      expect(find.text('Enter promo code'), findsOneWidget);
    },
  );
}
