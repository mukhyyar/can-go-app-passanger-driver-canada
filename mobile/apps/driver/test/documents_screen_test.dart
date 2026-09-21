import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:driver/screens/onboarding/documents_screen.dart';
import 'package:driver/state/app_state.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('AppState tracks insuranceUploaded state correctly', () {
    final state = AppState();
    expect(state.insuranceUploaded, isFalse);

    state.markInsuranceUploaded();
    expect(state.insuranceUploaded, isTrue);
  });

  test('AppState detects expired documents accurately', () {
    final state = AppState();
    expect(state.hasExpiredDocuments, isFalse);

    final expiredDoc = {
      'id': 'doc-exp-1',
      'docType': 'license',
      'status': 'APPROVED',
      'expiresAt': '2020-01-01T00:00:00Z',
    };
    expect(state.isDocumentExpired(expiredDoc), isTrue);
    expect(state.isDocumentLocked(expiredDoc), isFalse); // Must unlock expired docs!

    state.documents = [expiredDoc];
    expect(state.hasExpiredDocuments, isTrue);

    final validDoc = {
      'id': 'doc-valid-1',
      'docType': 'insurance',
      'status': 'APPROVED',
      'expiresAt': '2030-01-01T00:00:00Z',
    };
    expect(state.isDocumentExpired(validDoc), isFalse);
    expect(state.isDocumentLocked(validDoc), isTrue);
  });

  testWidgets('DocumentsScreen displays all required document slots including Vehicle insurance',
      (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final appState = AppState();
    appState.hasSeenWelcome = true;
    appState.loaded = true;

    final router = GoRouter(
      initialLocation: '/onboarding/documents',
      routes: [
        GoRoute(
          path: '/onboarding/documents',
          builder: (_, __) => const DocumentsScreen(),
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

    expect(find.text('Required documents for activation'), findsOneWidget);
    expect(find.text('Selfie with driving license'), findsOneWidget);
    expect(find.text('Driving license'), findsOneWidget);
    expect(find.text('Vehicle registration'), findsOneWidget);
    expect(find.text('Vehicle insurance'), findsOneWidget);
  });

  testWidgets('DocumentsScreen displays status badge and locks approved insurance document',
      (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final appState = AppState();
    appState.hasSeenWelcome = true;
    appState.loaded = true;
    appState.documents = [
      {
        'id': 'doc-ins-1',
        'docType': 'insurance',
        'status': 'APPROVED',
        'lifecycleStatus': 'CURRENT',
        'expiresAt': '2030-05-15T00:00:00Z',
      }
    ];

    final router = GoRouter(
      initialLocation: '/onboarding/documents',
      routes: [
        GoRoute(
          path: '/onboarding/documents',
          builder: (_, __) => const DocumentsScreen(),
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

    expect(find.text('Vehicle insurance'), findsOneWidget);
    expect(find.text('APPROVED'), findsOneWidget);
    expect(find.text('Expires: 2030-05-15'), findsOneWidget);
    expect(find.text('Approved — locked by admin'), findsOneWidget);
  });

  testWidgets('DocumentsScreen displays EXPIRED badge, warning banner, and unlocks for Re-upload',
      (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final appState = AppState();
    appState.hasSeenWelcome = true;
    appState.loaded = true;
    appState.documents = [
      {
        'id': 'doc-ins-exp',
        'docType': 'insurance',
        'status': 'APPROVED',
        'lifecycleStatus': 'CURRENT',
        'expiresAt': '2022-01-01T00:00:00Z',
      }
    ];

    final router = GoRouter(
      initialLocation: '/onboarding/documents',
      routes: [
        GoRoute(
          path: '/onboarding/documents',
          builder: (_, __) => const DocumentsScreen(),
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

    expect(find.text('EXPIRED'), findsOneWidget);
    expect(find.text('Expired: 2022-01-01'), findsOneWidget);
    expect(
      find.text(
        'Your profile is disabled due to expired documents. Please re-upload updated documents to regain ride eligibility once verified by admin.',
      ),
      findsOneWidget,
    );
    expect(find.text('Re-upload'), findsOneWidget);
    expect(find.text('Approved — locked by admin'), findsNothing);
  });
}
