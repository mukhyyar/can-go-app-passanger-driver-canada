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

  testWidgets(
    'When trip becomes COMPLETED, rating bottomsheet appears with passenger rating options',
    (tester) async {
      final appState = AppState();
      appState.hasSeenWelcome = true;
      appState.loaded = true;
      final trip = createTestTrip(id: 'trip-rate-1', status: 'COMPLETED');
      appState.openRequests = [trip];

      final router = GoRouter(
        initialLocation: '/trip/trip-rate-1',
        routes: [
          GoRoute(
            path: '/trip/:rideId',
            builder: (_, state) => TripDetailScreen(
              rideId: state.pathParameters['rideId']!,
            ),
          ),
          GoRoute(
            path: '/',
            builder: (_, __) => const Scaffold(body: Text('Main Screen')),
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

      // Bottomsheet with title "Rate your passenger" must appear
      expect(find.text('Rate your passenger'), findsOneWidget);
      expect(
        find.text('Help keep our community safe and respectful.'),
        findsOneWidget,
      );
      expect(find.text('Submit rating'), findsOneWidget);
      expect(find.text('Later'), findsOneWidget);

      // Dismiss via 'Later'
      await tester.tap(find.text('Later'));
      await tester.pumpAndSettle();

      // Bottomsheet is closed
      expect(find.text('Help keep our community safe and respectful.'), findsNothing);

      // "Rate passenger" button is available on completed trip screen
      expect(find.text('Rate passenger'), findsOneWidget);

      // Tapping "Rate passenger" reopens the review bottomsheet
      await tester.tap(find.text('Rate passenger'));
      await tester.pumpAndSettle();

      expect(find.text('Rate your passenger'), findsOneWidget);
      expect(find.text('Submit rating'), findsOneWidget);
    },
  );

  testWidgets(
    'Submitting rating successfully updates state and shows thanks SnackBar',
    (tester) async {
      final appState = _MockRatingAppState();
      appState.hasSeenWelcome = true;
      appState.loaded = true;
      final trip = createTestTrip(id: 'trip-rate-2', status: 'COMPLETED');
      appState.openRequests = [trip];

      final router = GoRouter(
        initialLocation: '/trip/trip-rate-2',
        routes: [
          GoRoute(
            path: '/trip/:rideId',
            builder: (_, state) => TripDetailScreen(
              rideId: state.pathParameters['rideId']!,
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

      expect(find.text('Submit rating'), findsOneWidget);
      await tester.tap(find.text('Submit rating'));
      await tester.pumpAndSettle();

      expect(find.text('Thanks for your feedback'), findsOneWidget);
      expect(find.text('You rated passenger ★5'), findsOneWidget);
      expect(find.text('Back to main screen'), findsOneWidget);
    },
  );

  testWidgets(
    'Submitting rating with server ApiException displays server error message',
    (tester) async {
      final appState = _MockRatingAppState();
      appState.hasSeenWelcome = true;
      appState.loaded = true;
      appState.errorToThrow = ApiException(403, 'Only ride participants can rate');
      final trip = createTestTrip(id: 'trip-rate-3', status: 'COMPLETED');
      appState.openRequests = [trip];

      final router = GoRouter(
        initialLocation: '/trip/trip-rate-3',
        routes: [
          GoRoute(
            path: '/trip/:rideId',
            builder: (_, state) => TripDetailScreen(
              rideId: state.pathParameters['rideId']!,
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

      expect(find.text('Submit rating'), findsOneWidget);
      await tester.tap(find.text('Submit rating'));
      await tester.pumpAndSettle();

      expect(find.text('Only ride participants can rate'), findsOneWidget);
    },
  );
}

class _MockRatingAppState extends AppState {
  Exception? errorToThrow;

  @override
  Future<Map<String, dynamic>> rateRide(
    String rideId, {
    required int stars,
    String? comment,
  }) async {
    if (errorToThrow != null) throw errorToThrow!;
    return {'id': 'rating-mock-1', 'stars': stars};
  }

  @override
  Future<Map<String, dynamic>?> myRideRating(String rideId) async => null;
}
