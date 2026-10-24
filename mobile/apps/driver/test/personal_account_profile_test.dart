import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:driver/screens/onboarding/profile_screen.dart';
import 'package:driver/state/app_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('ProfileScreen is strictly personal without Legal entity options',
      (tester) async {
    final state = AppState();
    state.fullName = 'Jane Doe';
    state.taxpayerId = '123-456-789';

    await tester.pumpWidget(
      ChangeNotifierProvider<AppState>.value(
        value: state,
        child: const MaterialApp(
          home: ProfileScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Verify Personal legal name field is present
    expect(find.text('Full legal name'), findsOneWidget);
    expect(find.text('Taxpayer identification number'), findsOneWidget);

    // Verify Business / Legal entity account options and fields do NOT exist
    expect(find.text('Individual'), findsNothing);
    expect(find.text('Legal entity'), findsNothing);
    expect(find.text('Private person / sole driver'), findsNothing);
    expect(find.text('Company or sole proprietor'), findsNothing);
    expect(find.text('Business / legal name'), findsNothing);
    expect(find.text('Registration / company number'), findsNothing);
    expect(find.text("Contact person's full name"), findsNothing);
  });

  test('AppState carrierProfileSummary reflects Personal account', () {
    final state = AppState();
    state.isActivated = true;
    expect(state.carrierProfileSummary, contains('Personal · Verified'));

    state.isActivated = false;
    state.approvalStatus = 'PENDING';
    expect(state.carrierProfileSummary, contains('Personal · pending'));

    // Verify isIndividual cannot be toggled to false
    state.setIndividual(false);
    expect(state.isIndividual, isTrue);
  });
}
