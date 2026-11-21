import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:driver/screens/request_detail_screen.dart';
import 'package:driver/screens/requests_screen.dart';
import 'package:driver/screens/stripe_instructions_sheet.dart';
import 'package:driver/state/app_state.dart';

class MockStripeTestAppState extends AppState {
  bool launchStripeCalled = false;
  bool refreshStripeCalled = false;
  bool refreshOpenRequestsCalled = false;

  MockStripeTestAppState() {
    isAuthenticated = true;
    isActivated = true;
    approvalStatus = 'APPROVED';
    drivingEnabled = true;
    vehicles = [
      const DriverVehicle(
        id: 'v1',
        name: 'Camry',
        plate: 'ABC-1234',
        vehicleClass: 'Economy',
        approvalStatus: 'APPROVED',
        inspectionStatus: 'APPROVED',
        isActive: true,
      ),
    ];
  }

  @override
  Future<bool> launchStripeVerification() async {
    launchStripeCalled = true;
    return true;
  }

  @override
  Future<Map<String, dynamic>> refreshStripeStatus() async {
    refreshStripeCalled = true;
    return {'status': stripeAccountStatus};
  }

  @override
  Future<void> refreshOpenRequests({bool fromPush = false}) async {
    refreshOpenRequestsCalled = true;
  }

  @override
  Future<DriverRequest> loadRequestDetail(String requestId) async {
    if (requestId.contains('stripe-err')) {
      throw Exception(
        'Complete your Stripe Connect payout verification before submitting ride offers or accepting bookings.',
      );
    }
    final found = openRequests.where((r) => r.id == requestId);
    if (found.isNotEmpty) return found.first;
    throw Exception('Request not found');
  }

  @override
  Future<List<DriverVehicle>> loadDriverVehicles() async {
    return vehicles;
  }

  @override
  Future<void> refreshMyRides() async {}

  @override
  Future<void> startMarketplaceRealtime() async {}
}

const _testRide = DriverRequest(
  id: 'req-yyc-airport',
  datetimeLabel: 'Today, 14:00',
  from: '55 Masters Drive Southeast',
  to: 'Calgary International Airport (YYC)',
  distance: '25.0 km',
  duration: '~ 28 min',
  vehicleNeed: 'Economy',
  passengers: 2,
  currency: 'CAD',
  status: 'WAITING_FOR_OFFERS',
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('Option A: Stripe Payout Verification UX & Requests Access', () {
    testWidgets(
        'Homepage shows real requests and Stripe action banner when payouts unverified',
        (tester) async {
      tester.view.physicalSize = const Size(800, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final state = MockStripeTestAppState();
      state.accountStatus = {'payoutVerificationRequired': true};
      state.openRequests = [_testRide];

      expect(state.requiresStripePayouts, isTrue);

      await tester.pumpWidget(
        ChangeNotifierProvider<AppState>.value(
          value: state,
          child: const MaterialApp(
            home: RequestsScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // 1. The Stripe Action Banner is displayed prominently at the top
      expect(
        find.text('Action Required: Set Up Direct Payouts'),
        findsOneWidget,
      );
      expect(find.text('Setup required'), findsOneWidget);
      expect(find.text('Set Up Payouts'), findsOneWidget);
      expect(find.text('Check Status'), findsOneWidget);
      expect(
        find.textContaining('Connect your Canadian bank account via Stripe Express'),
        findsOneWidget,
      );

      // 2. Real requests are NOT hidden (Option A)
      expect(find.text('55 Masters Drive Southeast'), findsOneWidget);
      expect(find.text('Calgary International Airport (YYC)'), findsOneWidget);

      // 3. Tapping "Set Up Payouts" triggers launchStripeVerification
      await tester.tap(find.text('Set Up Payouts'));
      await tester.pumpAndSettle();
      expect(state.launchStripeCalled, isTrue);

      // 4. Tapping "Check Status" calls refreshStripeStatus
      await tester.tap(find.text('Check Status'));
      await tester.pumpAndSettle();
      expect(state.refreshStripeCalled, isTrue);
    });

    testWidgets(
        'RequestDetailScreen displays ride info and Stripe Bidding Gate card instead of dead-end',
        (tester) async {
      tester.view.physicalSize = const Size(800, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final state = MockStripeTestAppState();
      state.accountStatus = {'payoutVerificationRequired': true};
      state.openRequests = [_testRide];

      await tester.pumpWidget(
        ChangeNotifierProvider<AppState>.value(
          value: state,
          child: const MaterialApp(
            home: RequestDetailScreen(requestId: 'req-yyc-airport'),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      // 1. Request details are visible (no dead end)
      expect(find.text('55 Masters Drive Southeast'), findsOneWidget);
      expect(find.text('Calgary International Airport (YYC)'), findsOneWidget);

      // 2. Stripe Bidding Gate card is rendered
      expect(find.text('Direct Payouts Setup Required'), findsOneWidget);
      expect(find.text('Set Up Payouts to Submit Offer'), findsOneWidget);
      expect(
        find.textContaining('Canadian bank transit & institution number'),
        findsOneWidget,
      );

      // 3. Tapping "Set Up Payouts to Submit Offer" triggers launchStripeVerification
      await tester.tap(find.text('Set Up Payouts to Submit Offer'));
      await tester.pump();
      expect(state.launchStripeCalled, isTrue);
    });

    testWidgets(
        'RequestDetailScreen renders actionable _StripeErrorCard when API throws Stripe 403',
        (tester) async {
      tester.view.physicalSize = const Size(800, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final state = MockStripeTestAppState();
      await tester.pumpWidget(
        ChangeNotifierProvider<AppState>.value(
          value: state,
          child: MaterialApp.router(
            routerConfig: GoRouter(
              routes: [
                GoRoute(
                  path: '/',
                  builder: (_, __) => const Scaffold(body: Text('Home')),
                ),
                GoRoute(
                  path: '/request/:id',
                  builder: (_, s) =>
                      RequestDetailScreen(requestId: s.pathParameters['id']!),
                ),
              ],
              initialLocation: '/request/ride-stripe-err-403',
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      // 1. Actionable Stripe error card is rendered instead of dead-end
      expect(find.text('Stripe Payout Setup Required'), findsOneWidget);
      expect(find.text('Complete Stripe Verification'), findsOneWidget);
      expect(find.text('Check Verification Status'), findsOneWidget);
      expect(find.text('Back to requests'), findsOneWidget);
      expect(
        find.textContaining('Canadian bank transit & institution numbers'),
        findsOneWidget,
      );

      // 2. Tapping "Complete Stripe Verification" triggers launchStripeVerification
      await tester.tap(find.text('Complete Stripe Verification'));
      await tester.pump();
      expect(state.launchStripeCalled, isTrue);

      // 3. Tapping "Check Verification Status" triggers refreshStripeStatus
      await tester.tap(find.text('Check Verification Status'));
      await tester.pump();
      expect(state.refreshStripeCalled, isTrue);
    });

    testWidgets('StripeInstructionsSheet renders Canadian banking guidance',
        (tester) async {
      tester.view.physicalSize = const Size(800, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final state = MockStripeTestAppState();

      await tester.pumpWidget(
        ChangeNotifierProvider<AppState>.value(
          value: state,
          child: MaterialApp(
            home: Builder(
              builder: (ctx) => Scaffold(
                body: ElevatedButton(
                  onPressed: () => StripeInstructionsSheet.show(ctx),
                  child: const Text('Open Sheet'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Open Sheet'));
      await tester.pumpAndSettle();

      // Verify Canadian instructions are rendered
      expect(find.text('Direct Payouts (Stripe Express)'), findsOneWidget);
      expect(find.text('Canadian Bank Details'), findsOneWidget);
      expect(
        find.textContaining('Institution # (3 digits), Transit # (5 digits)'),
        findsOneWidget,
      );
      expect(find.text('Valid Photo ID'), findsOneWidget);
      expect(find.text('Bank-Grade Security'), findsOneWidget);
      expect(find.text('Set Up Direct Payouts with Stripe'), findsOneWidget);
      expect(find.text('Check Verification Status'), findsOneWidget);
    });
  });
}
