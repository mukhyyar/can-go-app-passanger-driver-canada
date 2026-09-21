import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:driver/screens/trip_detail_screen.dart';
import 'package:driver/state/app_state.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  DriverRequest createTestTrip({required String id, required String status}) {
    return driverRequestFromServer({
      'id': id,
      'fromLabel': '100 Queen St W',
      'toLabel': 'Pearson Airport',
      'pickupAt': '2026-09-28T20:30:00.000Z',
      'status': status,
      'isRoundTrip': false,
      'adults': 1,
      'currency': 'CAD',
      'vehicleClassIds': ['Economy'],
      'priceSnapshot': {
        'distanceKm': 25,
        'durationMin': 30,
        'guidanceAmount': 50,
        'minBid': 30,
        'maxBid': 80,
        'platformCommissionPct': 15,
      },
    });
  }

  testWidgets('When trip is COMPLETED, AppBar back button navigates directly to main screen',
      (tester) async {
    final appState = AppState();
    appState.hasSeenWelcome = true;
    appState.loaded = true;
    final trip = createTestTrip(id: '12345', status: 'COMPLETED');
    appState.openRequests = [trip];

    final router = GoRouter(
      initialLocation: '/intermediate',
      routes: [
        GoRoute(
          path: '/',
          builder: (_, __) => const Scaffold(body: Text('Main Screen (Requests)')),
        ),
        GoRoute(
          path: '/intermediate',
          builder: (_, __) => const Scaffold(body: Text('Intermediate Screen')),
        ),
        GoRoute(
          path: '/trip/:rideId',
          builder: (_, state) => TripDetailScreen(
            rideId: state.pathParameters['rideId']!,
          ),
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

    expect(find.text('Intermediate Screen'), findsOneWidget);

    // Push trip on top of intermediate screen
    router.push('/trip/12345');
    await tester.pumpAndSettle();

    // Rating dialog pops up automatically on completed ride
    if (find.text('Later').evaluate().isNotEmpty) {
      await tester.tap(find.text('Later'));
      await tester.pumpAndSettle();
    }

    expect(find.text('Trip #12345'), findsOneWidget);
    expect(find.text('Trip completed'), findsOneWidget);

    // PopScope should have canPop false when completed
    final popScopeFinder = find.byWidgetPredicate((w) => w is PopScope);
    expect(popScopeFinder, findsOneWidget);
    final popScopeWidget = tester.widget<PopScope>(popScopeFinder);
    expect(popScopeWidget.canPop, isFalse);

    // Tap the AppBar back button
    final backBtn = find.byIcon(Icons.arrow_back);
    expect(backBtn, findsOneWidget);
    await tester.tap(backBtn);
    await tester.pumpAndSettle();

    // Must navigate directly to Main Screen, bypassing Intermediate Screen
    expect(find.text('Main Screen (Requests)'), findsOneWidget);
    expect(find.text('Intermediate Screen'), findsNothing);
  });

  testWidgets('When trip is COMPLETED, bottom "Back to main screen" button also goes to main screen',
      (tester) async {
    final appState = AppState();
    appState.hasSeenWelcome = true;
    appState.loaded = true;
    final trip = createTestTrip(id: '54321', status: 'COMPLETED');
    appState.openRequests = [trip];

    final router = GoRouter(
      initialLocation: '/other',
      routes: [
        GoRoute(
          path: '/',
          builder: (_, __) => const Scaffold(body: Text('Main Screen (Requests)')),
        ),
        GoRoute(
          path: '/other',
          builder: (_, __) => const Scaffold(body: Text('Other Screen')),
        ),
        GoRoute(
          path: '/trip/:rideId',
          builder: (_, state) => TripDetailScreen(
            rideId: state.pathParameters['rideId']!,
          ),
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

    router.push('/trip/54321');
    await tester.pumpAndSettle();

    // Dismiss rating dialog if shown
    if (find.text('Later').evaluate().isNotEmpty) {
      await tester.tap(find.text('Later'));
      await tester.pumpAndSettle();
    }

    // Verify "Back to main screen" button exists
    final backToMainBtn = find.text('Back to main screen');
    expect(backToMainBtn, findsOneWidget);

    await tester.tap(backToMainBtn);
    await tester.pumpAndSettle();

    expect(find.text('Main Screen (Requests)'), findsOneWidget);
    expect(find.text('Other Screen'), findsNothing);
  });

  testWidgets('When trip is active (IN_PROGRESS), PopScope canPop is true and pops to previous screen',
      (tester) async {
    final appState = AppState();
    appState.hasSeenWelcome = true;
    appState.loaded = true;
    final trip = createTestTrip(id: '99999', status: 'IN_PROGRESS');
    appState.openRequests = [trip];

    final router = GoRouter(
      initialLocation: '/rides',
      routes: [
        GoRoute(
          path: '/',
          builder: (_, __) => const Scaffold(body: Text('Main Screen')),
        ),
        GoRoute(
          path: '/rides',
          builder: (_, __) => const Scaffold(body: Text('My Rides Screen')),
        ),
        GoRoute(
          path: '/trip/:rideId',
          builder: (_, state) => TripDetailScreen(
            rideId: state.pathParameters['rideId']!,
          ),
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

    router.push('/trip/99999');
    await tester.pumpAndSettle();

    expect(find.text('Trip #99999'), findsOneWidget);

    // Active trip allows pop
    final popScopeFinder = find.byWidgetPredicate((w) => w is PopScope);
    expect(popScopeFinder, findsOneWidget);
    final popScopeWidget = tester.widget<PopScope>(popScopeFinder);
    expect(popScopeWidget.canPop, isTrue);

    // Tapping back pops back to My Rides Screen
    final backBtn = find.byIcon(Icons.arrow_back);
    await tester.tap(backBtn);
    await tester.pumpAndSettle();

    expect(find.text('My Rides Screen'), findsOneWidget);
  });
}
