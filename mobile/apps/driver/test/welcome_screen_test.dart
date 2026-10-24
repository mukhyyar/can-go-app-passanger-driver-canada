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
    expect(find.text('Intercity Travel & Airport Rides, Made Easy'), findsOneWidget);
    expect(find.text('INTERCITY & AIRPORT'), findsOneWidget);
    expect(find.text('Continue'), findsOneWidget);

    // Advance to slide 2
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    expect(find.text('Fast & Reliable Parcel Delivery'), findsOneWidget);
    expect(find.text('PARCEL DELIVERY'), findsOneWidget);
    expect(find.text('Safe Deliveries'), findsOneWidget);

    // Advance to slide 3
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    expect(find.text('Fast, Hassle-Free Payouts'), findsOneWidget);
    expect(find.text('FAST PAYOUTS'), findsOneWidget);
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
