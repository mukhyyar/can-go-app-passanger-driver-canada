import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:passenger/screens/onboarding_screen.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('OnboardingScreen displays slides and transitions properly',
      (tester) async {
    final state = AppState();
    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: const MaterialApp(
          home: OnboardingScreen(),
        ),
      ),
    );

    // Initial slide 1
    expect(find.text('CAN-RIDE'), findsOneWidget);
    expect(find.text('Skip'), findsOneWidget);
    expect(find.text('Request a Ride in Seconds'), findsOneWidget);
    expect(find.text('FAST & CONVENIENT'), findsOneWidget);
    expect(find.text('Continue'), findsOneWidget);

    // Advance to slide 2
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    expect(find.text('Choose Your Fare & Driver'), findsOneWidget);
    expect(find.text('TRANSPARENT PRICING'), findsOneWidget);
    expect(find.text('Upfront CAD Fares'), findsOneWidget);

    // Advance to slide 3
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    expect(find.text('Safe Journeys, Every Mile'), findsOneWidget);
    expect(find.text('SAFETY & PEACE OF MIND'), findsOneWidget);
    expect(find.text('Get Started'), findsOneWidget);
  });
}
