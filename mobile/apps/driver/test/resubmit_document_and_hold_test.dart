import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:driver/offer/offer_helpers.dart';
import 'package:driver/screens/onboarding/documents_screen.dart';
import 'package:driver/screens/request_detail_screen.dart';
import 'package:driver/screens/requests_screen.dart';
import 'package:driver/state/app_state.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('Document Resubmission and Profile Hold State', () {
    test('AppState flags profile on hold when a required document is PENDING', () {
      final state = AppState();
      state.approvalStatus = 'APPROVED';
      state.isActivated = true;
      expect(state.canSubmitOffers, isTrue);
      expect(state.isProfileOnHold, isFalse);

      // Add an approved document
      state.documents = [
        {'id': 'd1', 'docType': 'license', 'status': 'APPROVED'},
      ];
      expect(state.canSubmitOffers, isTrue);
      expect(state.isProfileOnHold, isFalse);

      // Resubmit required document -> status becomes PENDING
      state.documents = [
        {'id': 'd1-v2', 'docType': 'license', 'status': 'PENDING'},
      ];
      expect(state.hasPendingDocuments, isTrue);
      expect(state.hasPendingRequiredDocuments, isTrue);
      expect(state.isProfileOnHold, isTrue);
      expect(state.canSubmitOffers, isFalse);
      expect(state.profileHoldReason, contains('on hold while your documents are under review'));
    });

    test('AppState does not hold approved+active driver for optional PENDING docs', () {
      final state = AppState();
      state.approvalStatus = 'APPROVED';
      state.isActivated = true;
      state.documents = [
        {'id': 'd1', 'docType': 'selfie', 'status': 'APPROVED'},
        {'id': 'd2', 'docType': 'license', 'status': 'APPROVED'},
        {'id': 'd3', 'docType': 'vehicle_registration', 'status': 'APPROVED'},
        {'id': 'd4', 'docType': 'insurance', 'status': 'PENDING'},
        {'id': 'd5', 'docType': 'vehicle_photo', 'status': 'PENDING'},
      ];
      expect(state.hasPendingDocuments, isTrue);
      expect(state.hasPendingRequiredDocuments, isFalse);
      expect(state.isProfileOnHold, isFalse);
      expect(state.canSubmitOffers, isTrue);
      expect(state.areDocumentsUnderReview, isFalse);
    });

    test('AppState treats only PENDING docs as under review, not APPROVED', () {
      final state = AppState();
      state.approvalStatus = 'APPROVED';
      state.isActivated = true;
      state.documents = [
        {'id': 'd1', 'docType': 'selfie', 'status': 'APPROVED'},
        {'id': 'd2', 'docType': 'license', 'status': 'APPROVED'},
        {'id': 'd3', 'docType': 'vehicle_registration', 'status': 'APPROVED'},
        {'id': 'd4', 'docType': 'insurance', 'status': 'APPROVED'},
      ];
      expect(state.isDocumentUnderReview(state.documentForType('license')), isFalse);
      expect(state.areDocumentsUnderReview, isFalse);
      expect(state.isProfileOnHold, isFalse);
      expect(state.canSubmitOffers, isTrue);
    });

    test('AppState flags profile on hold when approvalStatus is IN_REVIEW', () {
      final state = AppState();
      state.approvalStatus = 'IN_REVIEW';
      state.isActivated = false;
      state.documents = [
        {'id': 'd1', 'docType': 'license', 'status': 'APPROVED'},
      ];
      expect(state.isProfileOnHold, isTrue);
      expect(state.canSubmitOffers, isFalse);
    });

    test('submitOfferDraft throws when profile is on hold', () async {
      final state = AppState();
      state.approvalStatus = 'IN_REVIEW';
      state.isActivated = false;
      state.documents = [
        {'id': 'd1', 'docType': 'license', 'status': 'PENDING'},
      ];

      // Pretend authenticated so it executes the canSubmitOffers check
      state.isAuthenticated = true;
      expect(state.isAuthenticated, isTrue);

      final draft = OfferDraft(outboundPrice: 50);
      expect(
        () => state.submitOfferDraft('req-1', draft),
        throwsA(
          predicate((e) =>
              e.toString().contains('on hold while your documents are under review')),
        ),
      );
    });
  });

  group('DocumentsScreen Resubmit UI', () {
    testWidgets(
        'Approved document displays Resubmit document button and tapping shows confirmation dialog',
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
        {
          'id': 'doc-lic-1',
          'docType': 'license',
          'status': 'APPROVED',
          'lifecycleStatus': 'CURRENT',
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
        ChangeNotifierProvider<AppState>.value(
          value: appState,
          child: MaterialApp.router(
            routerConfig: router,
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Driving license slot shows approved text and Resubmit document button
      expect(find.text('Approved — locked by admin'), findsOneWidget);
      final resubmitBtn = find.text('Resubmit document');
      expect(resubmitBtn, findsOneWidget);

      // Tap Resubmit document
      await tester.tap(resubmitBtn);
      await tester.pumpAndSettle();

      // Dialog opens explaining consequences
      expect(find.text('Resubmit Driving license?'), findsOneWidget);
      expect(
        find.text(
          'Resubmitting this document will put your driver profile ON HOLD for admin review.\n\nWhile on hold, you will not be able to submit price offers to passengers until verified and approved.\n\nDo you want to proceed?',
        ),
        findsOneWidget,
      );
      expect(find.text('Cancel'), findsOneWidget);
      expect(find.text('Proceed & Resubmit'), findsOneWidget);

      // Dismiss dialog
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(find.text('Resubmit Driving license?'), findsNothing);
    });

    testWidgets('DocumentsScreen displays On Hold banner when document is resubmitted/pending',
        (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final appState = AppState();
      appState.hasSeenWelcome = true;
      appState.loaded = true;
      appState.approvalStatus = 'IN_REVIEW';
      appState.isActivated = false;
      appState.documents = [
        {'id': 'd1', 'docType': 'selfie', 'status': 'APPROVED'},
        {'id': 'd2', 'docType': 'license', 'status': 'PENDING'},
        {'id': 'd3', 'docType': 'vehicle_registration', 'status': 'APPROVED'},
        {'id': 'd4', 'docType': 'insurance', 'status': 'APPROVED'},
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
        ChangeNotifierProvider<AppState>.value(
          value: appState,
          child: MaterialApp.router(
            routerConfig: router,
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Top banner shows profile on hold
      expect(find.text('Profile on hold — documents under review'), findsOneWidget);
      expect(
        find.text(
          'A resubmitted document is currently under review by our admin team. Submitting offers to passengers is paused until verified.',
        ),
        findsOneWidget,
      );
    });
  });

  group('RequestsScreen and RequestDetailScreen On Hold UI', () {
    testWidgets('RequestsScreen shows on hold banner and blocks tapping requests',
        (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final appState = AppState();
      appState.hasSeenWelcome = true;
      appState.loaded = true;
      appState.approvalStatus = 'IN_REVIEW';
      appState.isActivated = false;
      appState.documents = [
        {'id': 'd1', 'docType': 'license', 'status': 'PENDING'},
      ];

      final router = GoRouter(
        initialLocation: '/',
        routes: [
          GoRoute(
            path: '/',
            builder: (_, __) => const RequestsScreen(),
          ),
          GoRoute(
            path: '/onboarding/documents',
            builder: (_, __) => const DocumentsScreen(),
          ),
        ],
      );

      await tester.pumpWidget(
        ChangeNotifierProvider<AppState>.value(
          value: appState,
          child: MaterialApp.router(
            routerConfig: router,
          ),
        ),
      );
      await tester.pumpAndSettle();

      // On-hold banner is shown
      expect(
        find.text(
          'Profile on hold: Document under review. Offers are paused until verified.',
        ),
        findsOneWidget,
      );

      // Tapping on a request card shows the Profile On Hold dialog
      final cardFinder = find.byType(GtCard);
      if (cardFinder.evaluate().isNotEmpty) {
        await tester.tap(cardFinder.first);
        await tester.pumpAndSettle();

        expect(find.text('Profile On Hold'), findsOneWidget);
        expect(
          find.text(
            'Your driver profile is currently on hold while your documents are under review by our admin team. You cannot submit offers to passengers until verified.',
          ),
          findsOneWidget,
        );
      }
    });

    testWidgets('RequestDetailScreen shows Profile On Hold notice and hides InlineOfferForm',
        (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final appState = AppState();
      appState.hasSeenWelcome = true;
      appState.loaded = true;
      appState.approvalStatus = 'IN_REVIEW';
      appState.isActivated = false;
      appState.documents = [
        {'id': 'd1', 'docType': 'license', 'status': 'PENDING'},
      ];

      final reqId = appState.repo.newRequests.first.id;

      final router = GoRouter(
        initialLocation: '/request/$reqId',
        routes: [
          GoRoute(
            path: '/request/:id',
            builder: (_, state) => RequestDetailScreen(
              requestId: state.pathParameters['id']!,
            ),
          ),
          GoRoute(
            path: '/onboarding/documents',
            builder: (_, __) => const DocumentsScreen(),
          ),
        ],
      );

      await tester.pumpWidget(
        ChangeNotifierProvider<AppState>.value(
          value: appState,
          child: MaterialApp.router(
            routerConfig: router,
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Offer form is replaced by Profile On Hold notice
      expect(find.text('Profile On Hold — Review in Progress'), findsOneWidget);
      expect(find.text('View Documents Status'), findsOneWidget);
      expect(find.text('Submit offer'), findsNothing);
    });
  });
}
