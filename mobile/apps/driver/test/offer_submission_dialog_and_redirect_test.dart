import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:driver/offer/offer_helpers.dart';
import 'package:driver/screens/offer_review_screen.dart';
import 'package:driver/screens/request_detail_screen.dart';
import 'package:driver/screens/requests_screen.dart';
import 'package:driver/state/app_state.dart';

class MockOfferAppState extends AppState {
  bool submitOfferDraftCalled = false;
  String? lastSubmittedRequestId;

  @override
  bool get canSubmitOffers => true;

  @override
  Future<void> submitOfferDraft(String requestId, OfferDraft draft) async {
    submitOfferDraftCalled = true;
    lastSubmittedRequestId = requestId;
  }

  @override
  Future<DriverRequest> loadRequestDetail(String requestId) async {
    return _mockRequest;
  }

  @override
  Future<List<DriverVehicle>> loadDriverVehicles() async {
    return [_mockVehicle];
  }
}

const _mockRequest = DriverRequest(
  id: 'req-offer-test-1',
  datetimeLabel: 'Today, 14:00',
  from: 'Downtown Calgary',
  to: 'Calgary Airport',
  distance: '20.0 km',
  duration: '~ 25 min',
  vehicleNeed: 'Sedan',
  passengers: 2,
  currency: 'CAD',
);

final _mockDraft = OfferDraft(
  outboundPrice: 50,
  validForSeconds: 3600,
  vehicleId: 'v1',
);

const _mockVehicle = DriverVehicle(
  id: 'v1',
  name: 'Camry',
  plate: 'ABC1234',
  vehicleClass: 'Sedan',
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets(
      'Submitting offer shows success dialog, and tapping OK redirects to Dashboard',
      (tester) async {
    tester.view.physicalSize = const Size(800, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final appState = MockOfferAppState();
    appState.hasSeenWelcome = true;
    appState.loaded = true;

    String? currentPath;

    final router = GoRouter(
      initialLocation: '/review',
      routes: [
        GoRoute(
          path: '/',
          builder: (_, __) {
            currentPath = '/';
            return const Scaffold(body: Text('Dashboard Screen'));
          },
        ),
        GoRoute(
          path: '/review',
          builder: (_, __) => OfferReviewScreen(
            request: _mockRequest,
            draft: _mockDraft,
            vehicle: _mockVehicle,
          ),
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

    // Scroll to submit button and verify it's shown
    final submitFinder = find.text('Submit offer to customer');
    await tester.ensureVisible(submitFinder);
    expect(submitFinder, findsOneWidget);

    // Tap submit button
    await tester.tap(submitFinder);
    await tester.pumpAndSettle();

    // Verify submit was called
    expect(appState.submitOfferDraftCalled, isTrue);
    expect(appState.lastSubmittedRequestId, equals('req-offer-test-1'));

    // Verify success dialog is shown
    expect(find.text('Offer Sent'), findsOneWidget);
    expect(
      find.text('Your offer has been successfully sent to the passenger.'),
      findsOneWidget,
    );
    expect(find.text('OK'), findsOneWidget);

    // Tap "OK" button
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();

    // Verify dialog is gone and user is redirected to Dashboard
    expect(find.text('Offer Sent'), findsNothing);
    expect(currentPath, equals('/'));
    expect(find.text('Dashboard Screen'), findsOneWidget);
  });

  testWidgets(
      'Submitting offer shows success dialog, and dismissing dialog redirects to Dashboard',
      (tester) async {
    tester.view.physicalSize = const Size(800, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final appState = MockOfferAppState();
    appState.hasSeenWelcome = true;
    appState.loaded = true;

    String? currentPath;

    final router = GoRouter(
      initialLocation: '/review',
      routes: [
        GoRoute(
          path: '/',
          builder: (_, __) {
            currentPath = '/';
            return const Scaffold(body: Text('Dashboard Screen'));
          },
        ),
        GoRoute(
          path: '/review',
          builder: (_, __) => OfferReviewScreen(
            request: _mockRequest,
            draft: _mockDraft,
            vehicle: _mockVehicle,
          ),
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

    // Scroll to submit button and tap
    final submitFinder = find.text('Submit offer to customer');
    await tester.ensureVisible(submitFinder);
    await tester.tap(submitFinder);
    await tester.pumpAndSettle();

    // Verify dialog is displayed
    expect(find.text('Offer Sent'), findsOneWidget);

    // Dismiss dialog by tapping barrier (outside dialog)
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();

    // Verify dialog is dismissed and navigated to Dashboard
    expect(find.text('Offer Sent'), findsNothing);
    expect(currentPath, equals('/'));
    expect(find.text('Dashboard Screen'), findsOneWidget);
  });

  testWidgets(
      'From RequestDetailScreen, submitting offer navigates to Dashboard and not back to RequestDetailScreen',
      (tester) async {
    tester.view.physicalSize = const Size(800, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final appState = MockOfferAppState();
    appState.hasSeenWelcome = true;
    appState.loaded = true;
    appState.openRequests = [_mockRequest];
    appState.vehicles = [_mockVehicle];
    appState.saveOfferDraft(_mockRequest.id, _mockDraft);

    String? currentPath;

    final router = GoRouter(
      initialLocation: '/request/${_mockRequest.id}',
      routes: [
        GoRoute(
          path: '/',
          builder: (_, __) {
            currentPath = '/';
            return const Scaffold(body: Text('Dashboard Screen'));
          },
        ),
        GoRoute(
          path: '/request/:id',
          builder: (_, state) {
            currentPath = '/request/${state.pathParameters['id']}';
            return RequestDetailScreen(requestId: state.pathParameters['id']!);
          },
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

    // Find and tap "Continue to offer customer"
    final continueBtn = find.text('Continue to offer customer');
    await tester.ensureVisible(continueBtn);
    expect(continueBtn, findsOneWidget);
    await tester.tap(continueBtn);
    await tester.pumpAndSettle();

    // We are now on OfferReviewScreen
    final submitFinder = find.text('Submit offer to customer');
    await tester.ensureVisible(submitFinder);
    expect(submitFinder, findsOneWidget);

    // Submit offer
    await tester.tap(submitFinder);
    await tester.pumpAndSettle();

    // Verify dialog is visible
    expect(find.text('Offer Sent'), findsOneWidget);

    // Tap OK
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();

    // Verify user is redirected to Dashboard and NOT on RequestDetailScreen
    expect(currentPath, equals('/'));
    expect(find.text('Dashboard Screen'), findsOneWidget);
    expect(find.text('Review updated offer'), findsNothing);
  });
}
