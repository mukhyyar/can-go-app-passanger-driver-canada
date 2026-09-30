import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:driver/screens/request_detail_screen.dart';
import 'package:driver/screens/trip_detail_screen.dart';
import 'package:driver/state/app_state.dart';

class MockPaymentUpdateAppState extends AppState {
  DriverRequest? mockDetail;
  bool refreshMyRidesCalled = false;
  bool refreshOpenRequestsCalled = false;

  @override
  bool get canSubmitOffers => true;

  @override
  Future<DriverRequest> loadRequestDetail(String requestId) async {
    return mockDetail ??
        DriverRequest(
          id: requestId,
          datetimeLabel: 'Today, 15:00',
          from: 'Downtown Calgary',
          to: 'Airport',
          distance: '20 km',
          duration: '25 min',
          vehicleNeed: 'Sedan',
          passengers: 2,
        );
  }

  @override
  Future<List<DriverVehicle>> loadDriverVehicles() async {
    return [
      const DriverVehicle(
        id: 'v1',
        name: 'Camry',
        plate: 'ABC1234',
        vehicleClass: 'Sedan',
      ),
    ];
  }

  @override
  Future<void> refreshMyRides() async {
    refreshMyRidesCalled = true;
  }

  @override
  Future<void> refreshOpenRequests({bool fromPush = false}) async {
    refreshOpenRequestsCalled = true;
  }

  @override
  void subscribeRide(String rideId) {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets(
      'When passenger completes payment and ride is BOOKED with driver accepted, RequestDetailScreen redirects to TripDetailScreen and does not show offer screen',
      (tester) async {
    tester.view.physicalSize = const Size(800, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final appState = MockPaymentUpdateAppState();
    appState.hasSeenWelcome = true;
    appState.loaded = true;

    final bookedRequest = DriverRequest(
      id: 'p536nqws',
      datetimeLabel: 'Today, 15:00',
      from: 'Downtown Calgary',
      to: 'Calgary Airport',
      distance: '20 km',
      duration: '25 min',
      vehicleNeed: 'Sedan',
      passengers: 2,
      status: 'BOOKED',
      myOffer: const DriverOfferSummary(
        id: 'offer-1',
        status: 'SELECTED',
        bidAmount: 58,
        currency: 'CAD',
      ),
    );

    appState.mockDetail = bookedRequest;
    appState.myRides = [bookedRequest];

    String? currentPath;

    final router = GoRouter(
      initialLocation: '/request/${bookedRequest.id}',
      routes: [
        GoRoute(
          path: '/',
          builder: (_, __) => const Scaffold(body: Text('Dashboard Screen')),
        ),
        GoRoute(
          path: '/request/:id',
          builder: (_, state) {
            currentPath = '/request/${state.pathParameters['id']}';
            return RequestDetailScreen(requestId: state.pathParameters['id']!);
          },
        ),
        GoRoute(
          path: '/trip/:rideId',
          builder: (_, state) {
            currentPath = '/trip/${state.pathParameters['rideId']}';
            return Scaffold(
              body: Text('Trip Detail Screen ${state.pathParameters['rideId']}'),
            );
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

    // Verify it redirects to Trip Detail Screen and does NOT show the offer buttons
    expect(currentPath, equals('/trip/p536nqws'));
    expect(find.text('Trip Detail Screen p536nqws'), findsOneWidget);
    expect(find.text('Review updated offer'), findsNothing);
    expect(find.text('Withdraw offer'), findsNothing);
  });

  testWidgets(
      'When ride status is PAYMENT_PENDING with driver offer selected, displays payment pending card and hides offer editing/withdraw buttons',
      (tester) async {
    tester.view.physicalSize = const Size(800, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final appState = MockPaymentUpdateAppState();
    appState.hasSeenWelcome = true;
    appState.loaded = true;

    final pendingRequest = DriverRequest(
      id: 'p536nqws',
      datetimeLabel: 'Today, 15:00',
      from: 'Downtown Calgary',
      to: 'Calgary Airport',
      distance: '20 km',
      duration: '25 min',
      vehicleNeed: 'Sedan',
      passengers: 2,
      status: 'PAYMENT_PENDING',
      myOffer: const DriverOfferSummary(
        id: 'offer-1',
        status: 'SELECTED',
        bidAmount: 58,
        currency: 'CAD',
      ),
    );

    appState.mockDetail = pendingRequest;

    final router = GoRouter(
      initialLocation: '/request/${pendingRequest.id}',
      routes: [
        GoRoute(
          path: '/request/:id',
          builder: (_, state) =>
              RequestDetailScreen(requestId: state.pathParameters['id']!),
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

    // Pump frames to render pending state
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('Offer Accepted — Payment Pending'), findsOneWidget);
    expect(
      find.text(
        'The passenger has selected your offer and is completing payment. This screen will update automatically as soon as payment is confirmed.',
      ),
      findsOneWidget,
    );
    expect(find.text('Review updated offer'), findsNothing);
    expect(find.text('Withdraw offer'), findsNothing);
  });

  testWidgets(
      'When ride is BOOKED by another driver, displays not available card and hides offer controls',
      (tester) async {
    tester.view.physicalSize = const Size(800, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final appState = MockPaymentUpdateAppState();
    appState.hasSeenWelcome = true;
    appState.loaded = true;

    final bookedByOther = DriverRequest(
      id: 'p536nqws',
      datetimeLabel: 'Today, 15:00',
      from: 'Downtown Calgary',
      to: 'Calgary Airport',
      distance: '20 km',
      duration: '25 min',
      vehicleNeed: 'Sedan',
      passengers: 2,
      status: 'BOOKED',
      myOffer: const DriverOfferSummary(
        id: 'offer-1',
        status: 'REJECTED',
        bidAmount: 58,
        currency: 'CAD',
      ),
    );

    appState.mockDetail = bookedByOther;

    final router = GoRouter(
      initialLocation: '/request/${bookedByOther.id}',
      routes: [
        GoRoute(
          path: '/',
          builder: (_, __) => const Scaffold(body: Text('Dashboard Screen')),
        ),
        GoRoute(
          path: '/request/:id',
          builder: (_, state) =>
              RequestDetailScreen(requestId: state.pathParameters['id']!),
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

    expect(find.text('Ride No Longer Available'), findsOneWidget);
    expect(
      find.text(
        'Another offer was selected and booked by the passenger for this ride.',
      ),
      findsOneWidget,
    );
    expect(find.text('Back to Dashboard'), findsOneWidget);
    expect(find.text('Review updated offer'), findsNothing);
    expect(find.text('Withdraw offer'), findsNothing);
  });
}
