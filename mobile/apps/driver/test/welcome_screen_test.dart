import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:driver/screens/welcome_screen.dart';
import 'package:driver/state/app_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('DriverWelcomeScreen displays slides and transitions properly',
      (tester) async {
    final state = AppState();

    await tester.pumpWidget(
      ChangeNotifierProvider<AppState>.value(
        value: state,
        child: const MaterialApp(
          home: DriverWelcomeScreen(),
        ),
      ),
    );

    // Initial slide 1
    expect(find.text('CAN-RIDE DRIVER'), findsOneWidget);
    expect(find.text('Skip'), findsOneWidget);
    expect(find.text('Drive & Earn on Your Terms'), findsOneWidget);
    expect(find.text('DRIVE & EARN'), findsOneWidget);
    expect(find.text('Continue'), findsOneWidget);

    // Advance to slide 2
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    expect(find.text('Review Requests & Name Your Fare'), findsOneWidget);
    expect(find.text('BID YOUR PRICE'), findsOneWidget);
    expect(find.text('Live Request Feed'), findsOneWidget);

    // Advance to slide 3
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    expect(find.text('Fast CAD Payouts & In-App Safety'), findsOneWidget);
    expect(find.text('SECURE & TRANSPARENT'), findsOneWidget);
    expect(find.text('Get Started'), findsOneWidget);

    // Tap Get Started sets hasSeenWelcome to true
    await tester.tap(find.text('Get Started'));
    await tester.pumpAndSettle();

    expect(state.hasSeenWelcome, isTrue);
  });

  testWidgets('DriverWelcomeScreen Skip button marks welcome as seen',
      (tester) async {
    final state = AppState();

    await tester.pumpWidget(
      ChangeNotifierProvider<AppState>.value(
        value: state,
        child: const MaterialApp(
          home: DriverWelcomeScreen(),
        ),
      ),
    );

    expect(find.text('Skip'), findsOneWidget);
    await tester.tap(find.text('Skip'));
    await tester.pumpAndSettle();

    expect(state.hasSeenWelcome, isTrue);
  });
}
