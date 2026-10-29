import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:image_picker_platform_interface/image_picker_platform_interface.dart';
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

  testWidgets('DocumentsScreen displays required personal document slots and not vehicle documents',
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
    expect(find.text('Vehicle registration'), findsNothing);
    expect(find.text('Vehicle insurance'), findsNothing);
  });

  testWidgets('DocumentsScreen displays status badge and locks approved document',
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
        'id': 'doc-lic-1',
        'docType': 'license',
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

    expect(find.text('Driving license'), findsOneWidget);
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
        'id': 'doc-lic-exp',
        'docType': 'license',
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

  testWidgets(
      'When all documents are uploaded and under review, all buttons are disabled and show Documents under review',
      (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final appState = AppState();
    appState.hasSeenWelcome = true;
    appState.loaded = true;
    appState.approvalStatus = 'PENDING_KYC';
    appState.documents = [
      {'id': 'd1', 'docType': 'selfie', 'status': 'PENDING'},
      {'id': 'd2', 'docType': 'license', 'status': 'PENDING'},
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

    // Top review banner
    expect(
      find.text('Your documents have been submitted and are currently under review by our admin team.'),
      findsOneWidget,
    );

    // No Replace, Delete, or Upload buttons
    expect(find.text('Replace'), findsNothing);
    expect(find.text('Delete'), findsNothing);
    expect(find.text('Upload'), findsNothing);

    // Banner title (1) + 2 slot buttons (2) + 1 bottom button (1) = 4
    expect(find.text('Documents under review'), findsNWidgets(4));

    // Verify bottom button is disabled
    final bottomButton = tester.widget<GtGreenButton>(find.byType(GtGreenButton));
    expect(bottomButton.onPressed, isNull);
    expect(bottomButton.label, 'Documents under review');
  });

  testWidgets(
      'When one document is rejected, it enables Re-upload while remaining documents stay under review',
      (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final appState = AppState();
    appState.hasSeenWelcome = true;
    appState.loaded = true;
    appState.approvalStatus = 'ACTION_REQUIRED';
    appState.documents = [
      {'id': 'd1', 'docType': 'selfie', 'status': 'PENDING'},
      {'id': 'd2', 'docType': 'license', 'status': 'REJECTED'},
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

    // Since license is REJECTED, isAllUnderReview is false
    // License slot shows REJECTED status and has active Replace/Delete buttons
    expect(find.text('REJECTED'), findsOneWidget);
    expect(find.text('Replace'), findsOneWidget);
    expect(find.text('Delete'), findsOneWidget);
  });

  testWidgets(
      'When document review requests reupload (NEEDS_RESUBMISSION), shows Re-upload requested badge, feedback message, and active Re-upload button',
      (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final appState = AppState();
    appState.hasSeenWelcome = true;
    appState.loaded = true;
    appState.approvalStatus = 'ACTION_REQUIRED';
    appState.documents = [
      {'id': 'd1', 'docType': 'selfie', 'status': 'PENDING'},
      {
        'id': 'd2',
        'docType': 'license',
        'status': 'NEEDS_RESUBMISSION',
        'resubmissionReason': 'image_unclear',
        'customerMessage': 'Please provide a clearer, sharper photo of your driving license.',
      },
    ];

    expect(appState.hasReuploadRequest, isTrue);
    expect(appState.reuploadRequestedSlotTitles, contains('Driving license'));

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

    // Top review banner shows Re-upload requested
    expect(find.text('Re-upload requested'), findsNWidgets(2)); // Top banner header + license slot badge
    expect(
      find.text('Our admin team reviewed your documents and requested a new upload for: Driving license. Please review the feedback and re-upload below.'),
      findsOneWidget,
    );

    // Feedback message displayed on Driving license slot
    expect(
      find.text('Please provide a clearer, sharper photo of your driving license.'),
      findsOneWidget,
    );

    // Active Re-upload button on license slot
    expect(find.text('Re-upload'), findsOneWidget);

    // 1 remaining document stays locked under review
    expect(find.text('Documents under review'), findsNWidgets(1));

    // Bottom button indicates re-upload requested document(s)
    final bottomButton = tester.widget<GtGreenButton>(find.byType(GtGreenButton));
    expect(bottomButton.onPressed, isNull);
    expect(bottomButton.label, 'Re-upload requested document(s)');
  });

  testWidgets(
      'When KYC is approved, does not show Documents under review banner',
      (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final appState = AppState();
    appState.hasSeenWelcome = true;
    appState.loaded = true;
    appState.approvalStatus = 'APPROVED';
    appState.isActivated = true;
    appState.documents = [
      {'id': 'd1', 'docType': 'selfie', 'status': 'APPROVED'},
      {'id': 'd2', 'docType': 'license', 'status': 'APPROVED'},
    ];

    expect(appState.areDocumentsUnderReview, isFalse);
    expect(appState.isProfileOnHold, isFalse);

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

    expect(find.text('Documents under review'), findsNothing);
    expect(find.text('Profile on hold — documents under review'), findsNothing);
    expect(
      find.text(
        'Your documents have been submitted and are currently under review by our admin team.',
      ),
      findsNothing,
    );
  });

  testWidgets(
      'DocumentsScreen shows US transit checkbox and reveals options on check',
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

    // Checkbox is present
    final checkboxFinder = find.byType(CheckboxListTile);
    expect(checkboxFinder, findsOneWidget);
    expect(
      find.text('I want to take rides that transit through the USA'),
      findsOneWidget,
    );

    // Initially unchecked, details hidden
    expect(find.text('Admissible U.S. Transit & Travel Documents'), findsNothing);
    expect(find.text('Document Description'), findsNothing);
    expect(find.text('U.S. Transit & Travel Authorization'), findsNothing);

    // Tap checkbox to opt in
    await tester.tap(checkboxFinder);
    await tester.pumpAndSettle();

    // Now instructions, text field, and slot are revealed
    expect(find.text('Admissible U.S. Transit & Travel Documents'), findsOneWidget);
    expect(find.text('Canadian Passport or NEXUS Card'), findsOneWidget);
    expect(find.text('Document Description'), findsOneWidget);
    expect(find.text('U.S. Transit & Travel Authorization'), findsOneWidget);

    // Enter a description
    await tester.enterText(find.byType(TextField), 'Canadian Passport');
    await tester.pumpAndSettle();
    expect(find.text('Canadian Passport'), findsOneWidget);
  });

  testWidgets(
      'DocumentsScreen automatically checks US transit and displays customLabel if document exists',
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
        'id': 'us-doc-1',
        'docType': 'us_transit_permit',
        'status': 'APPROVED',
        'customLabel': 'US B1/B2 Visa',
        'expiresAt': '2028-12-31T00:00:00Z',
      },
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

    // Checkbox is automatically checked and options are displayed
    expect(find.text('Admissible U.S. Transit & Travel Documents'), findsOneWidget);
    expect(find.text('Document Description'), findsOneWidget);
    expect(find.text('US B1/B2 Visa'), findsWidgets);
    expect(find.text('Type: US B1/B2 Visa'), findsOneWidget);
    expect(find.text('U.S. Transit & Travel Authorization'), findsOneWidget);
  });

  testWidgets(
      'Picking a document stages it locally without uploading, shows pending badge and Save button, and allows removing',
      (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final fakePicker = FakeImagePickerPlatform();
    ImagePickerPlatform.instance = fakePicker;

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

    // Initial state: No staged documents, bottom button is 'Save'
    expect(find.text('Selected (Pending save)'), findsNothing);
    final initialBottomButton = tester.widget<GtGreenButton>(find.byType(GtGreenButton));
    expect(initialBottomButton.label, 'Save');

    // Setup fake image to pick for selfie
    final fakeBytes = Uint8List.fromList([1, 2, 3, 4]);
    fakePicker.fileToReturn = XFile.fromData(fakeBytes, name: 'selfie.jpg');

    // Tap Upload button on the selfie slot (the first Upload button)
    final uploadButtons = find.widgetWithText(FilledButton, 'Upload');
    expect(uploadButtons, findsWidgets);
    await tester.tap(uploadButtons.first);
    await tester.pumpAndSettle();

    // Now staged!
    expect(find.text('Selected (Pending save)'), findsOneWidget);
    expect(find.text('Replace file'), findsOneWidget);
    expect(find.text('Remove file'), findsOneWidget);

    // Bottom button now shows 'Save documents (1)'
    final stagedBottomButton = tester.widget<GtGreenButton>(find.byType(GtGreenButton));
    expect(stagedBottomButton.label, 'Save documents (1)');

    // Attempt back navigation: shows discard dialog
    await tester.tap(find.byIcon(Icons.arrow_back));
    await tester.pumpAndSettle();

    expect(find.text('Discard unsaved documents?'), findsOneWidget);
    expect(find.text('Keep Editing'), findsOneWidget);
    expect(find.text('Discard & Exit'), findsOneWidget);

    // Tap Keep Editing
    await tester.tap(find.text('Keep Editing'));
    await tester.pumpAndSettle();
    expect(find.text('Discard unsaved documents?'), findsNothing);
    expect(find.text('Selected (Pending save)'), findsOneWidget);

    // Now tap Remove file to unstage
    await tester.tap(find.text('Remove file'));
    await tester.pumpAndSettle();

    // Staged doc removed, reverts to initial state
    expect(find.text('Selected (Pending save)'), findsNothing);
    expect(find.text('Remove file'), findsNothing);
    final revertedBottomButton = tester.widget<GtGreenButton>(find.byType(GtGreenButton));
    expect(revertedBottomButton.label, 'Save');
  });
}

class FakeImagePickerPlatform extends ImagePickerPlatform {
  XFile? fileToReturn;

  @override
  Future<XFile?> getImageFromSource({
    required ImageSource source,
    ImagePickerOptions options = const ImagePickerOptions(),
  }) async {
    return fileToReturn;
  }
}
