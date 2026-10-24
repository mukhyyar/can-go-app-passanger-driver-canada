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
    expect(find.text('Intercity Travel, Your Way'), findsOneWidget);
    expect(find.text('INTERCITY TRAVEL'), findsOneWidget);
    expect(find.text('Continue'), findsOneWidget);

    // Advance to slide 2
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    expect(find.text('Airport Transfers, Without the Stress'), findsOneWidget);
    expect(find.text('AIRPORT TRANSFERS'), findsOneWidget);
    expect(find.text('Reliable Pickups'), findsOneWidget);

    // Advance to slide 3
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    expect(find.text('Fast & Reliable Parcel Delivery'), findsOneWidget);
    expect(find.text('PARCEL DELIVERY'), findsOneWidget);
    expect(find.text('Get Started'), findsOneWidget);
  });
}
