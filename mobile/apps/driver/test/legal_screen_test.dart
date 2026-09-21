import 'package:driver/screens/auth_screen.dart';
import 'package:driver/screens/legal_screen.dart';
import 'package:driver/state/app_state.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

void main() {
  group('Driver Legal and Policies Tests', () {
    testWidgets(
        'DriverLegalScreen renders Privacy Policy and switches to Terms of Service',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: const DriverLegalScreen(initialSlug: 'privacy'),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Check title and segmented buttons
      expect(find.text('Privacy Policy'), findsWidgets);
      expect(find.text('Terms of Service'), findsOneWidget);
      expect(find.textContaining('Canadian PIPEDA Compliant'), findsOneWidget);

      // Tap on Terms of Service tab
      await tester.tap(find.text('Terms of Service'));
      await tester.pumpAndSettle();

      // Check Terms of Service content
      expect(find.text('Service Agreement'), findsWidgets);
      expect(find.textContaining('Tender Marketplace'), findsWidgets);
    });

    testWidgets('Driver AuthScreen displays interactive policy links in footer',
        (tester) async {
      tester.view.physicalSize = const Size(800, 1600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final state = AppState();

      await tester.pumpWidget(
        ChangeNotifierProvider<AppState>.value(
          value: state,
          child: const MaterialApp(
            home: AuthScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Verify that policy links are rendered in rich text
      expect(find.textContaining('CAN-RIDE Privacy Policy'), findsOneWidget);
      expect(find.textContaining('CAN-RIDE Service Agreement'), findsOneWidget);
    });
  });
}
