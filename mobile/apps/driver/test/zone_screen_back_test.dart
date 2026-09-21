import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:driver/screens/onboarding/zone_screen.dart';
import 'package:driver/state/app_state.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('ZoneScreen back button navigates safely when opened standalone',
      (tester) async {
    final appState = AppState();
    appState.hasSeenWelcome = true;
    appState.loaded = true;

    final router = GoRouter(
      initialLocation: '/onboarding/zone',
      routes: [
        GoRoute(
          path: '/onboarding/location',
          builder: (_, __) => const Scaffold(body: Text('Location Screen')),
        ),
        GoRoute(
          path: '/onboarding/zone',
          builder: (_, __) => const ZoneScreen(),
        ),
      ],
    );

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: appState,
        child: MaterialApp.router(
          routerConfig: router,
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Dismiss the intro bottom sheet if present
    final okBtn = find.text('OK');
    if (okBtn.evaluate().isNotEmpty) {
      await tester.tap(okBtn);
      await tester.pumpAndSettle();
    }

    expect(find.text('Your operating zone'), findsOneWidget);

    // Press AppBar back button
    final backBtn = find.byIcon(Icons.arrow_back);
    expect(backBtn, findsOneWidget);
    await tester.tap(backBtn);
    await tester.pumpAndSettle();

    // Must navigate to Location screen instead of closing/crashing
    expect(find.text('Location Screen'), findsOneWidget);
  });

  testWidgets('ZoneScreen back button pops cleanly when pushed from location',
      (tester) async {
    final appState = AppState();
    appState.hasSeenWelcome = true;
    appState.loaded = true;

    final router = GoRouter(
      initialLocation: '/onboarding/location',
      routes: [
        GoRoute(
          path: '/onboarding/location',
          builder: (context, _) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => context.push('/onboarding/zone'),
                child: const Text('Go to Zone'),
              ),
            ),
          ),
        ),
        GoRoute(
          path: '/onboarding/zone',
          builder: (_, __) => const ZoneScreen(),
        ),
      ],
    );

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: appState,
        child: MaterialApp.router(
          routerConfig: router,
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Push to ZoneScreen
    await tester.tap(find.text('Go to Zone'));
    await tester.pumpAndSettle();

    // Dismiss intro sheet
    final okBtn = find.text('OK');
    if (okBtn.evaluate().isNotEmpty) {
      await tester.tap(okBtn);
      await tester.pumpAndSettle();
    }

    expect(find.text('Your operating zone'), findsOneWidget);

    // Tap AppBar back button
    await tester.tap(find.byIcon(Icons.arrow_back));
    await tester.pumpAndSettle();

    // Should return to Location screen
    expect(find.text('Go to Zone'), findsOneWidget);
  });
}
