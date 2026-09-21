import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:passenger/screens/booking_confirmed_screen.dart';
import 'package:passenger/screens/waiting_screen.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });

  group('RideRequest isBooked & isCancelled status checks', () {
    test('identifies booked rides correctly via status enum', () {
      final req = RideRequest(
        id: 'ride-1',
        datetimeLabel: 'Today, 2:00 PM',
        from: 'Downtown',
        to: 'Airport',
        status: RideStatus.booked,
      );
      expect(req.isBooked, isTrue);
      expect(req.isCancelled, isFalse);
    });

    test('identifies booked rides correctly via serverStatus strings', () {
      final statuses = [
        'BOOKED',
        'EN_ROUTE',
        'DRIVER_EN_ROUTE',
        'ARRIVED',
        'DRIVER_ARRIVED',
        'TRIP_STARTED',
        'IN_PROGRESS',
        'COMPLETED',
      ];

      for (final s in statuses) {
        final req = RideRequest(
          id: 'ride-$s',
          datetimeLabel: 'Today, 2:00 PM',
          from: 'Downtown',
          to: 'Airport',
          status: RideStatus.waitingOffers,
          serverStatus: s,
        );
        expect(req.isBooked, isTrue, reason: 'serverStatus $s should be considered booked');
      }
    });

    test('identifies unbooked rides as not booked', () {
      final req = RideRequest(
        id: 'ride-open',
        datetimeLabel: 'Today, 2:00 PM',
        from: 'Downtown',
        to: 'Airport',
        status: RideStatus.waitingOffers,
        serverStatus: 'REQUESTED',
      );
      expect(req.isBooked, isFalse);
      expect(req.isCancelled, isFalse);
    });

    test('identifies cancelled rides accurately', () {
      final req1 = RideRequest(
        id: 'ride-c1',
        datetimeLabel: 'Today, 2:00 PM',
        from: 'Downtown',
        to: 'Airport',
        status: RideStatus.cancelled,
      );
      expect(req1.isCancelled, isTrue);

      final req2 = RideRequest(
        id: 'ride-c2',
        datetimeLabel: 'Today, 2:00 PM',
        from: 'Downtown',
        to: 'Airport',
        status: RideStatus.waitingOffers,
        serverStatus: 'CANCELLED_BY_PASSENGER',
      );
      expect(req2.isCancelled, isTrue);
    });
  });

  group('AppState booked ride helpers', () {
    test('isRideBooked and activeBookedRide accurately return booked ride', () {
      final state = AppState();
      final bookedRide = RideRequest(
        id: 'ride-booked-99',
        datetimeLabel: 'Today, 3:00 PM',
        from: 'Downtown',
        to: 'Airport',
        status: RideStatus.booked,
        serverStatus: 'DRIVER_EN_ROUTE',
      );
      state.repo.rides.add(bookedRide);

      expect(state.isRideBooked('ride-booked-99'), isTrue);
      expect(state.isRideBooked('ride-unknown'), isFalse);
      expect(state.activeBookedRide?.id, equals('ride-booked-99'));
    });

    test('consumeDeepLinkPath returns /ride/:id if ride is already booked', () {
      final state = AppState();
      final bookedRide = RideRequest(
        id: 'ride-booked-100',
        datetimeLabel: 'Today, 3:00 PM',
        from: 'Downtown',
        to: 'Airport',
        status: RideStatus.booked,
        serverStatus: 'BOOKED',
      );
      state.repo.rides.add(bookedRide);

      state.applyDeepLink(
        rideId: 'ride-booked-100',
        offerId: 'offer-123',
        type: 'offer',
      );

      final targetPath = state.consumeDeepLinkPath();
      expect(targetPath, equals('/ride/ride-booked-100'));
    });
  });

  group('BookingConfirmedScreen navigation', () {
    testWidgets('Tapping "View ride" button navigates to /ride/:rideId',
        (tester) async {
      final state = AppState();
      String? navigatedPath;

      final router = GoRouter(
        initialLocation: '/booking-confirmed/test-ride-123',
        routes: [
          GoRoute(
            path: '/booking-confirmed/:rideId',
            builder: (context, state) =>
                BookingConfirmedScreen(rideId: state.pathParameters['rideId']!),
          ),
          GoRoute(
            path: '/ride/:id',
            builder: (context, state) {
              navigatedPath = '/ride/${state.pathParameters['id']}';
              return const Scaffold(body: Text('Ride Detail Target'));
            },
          ),
        ],
      );

      await tester.pumpWidget(
        ChangeNotifierProvider.value(
          value: state,
          child: MaterialApp.router(
            routerConfig: router,
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Booking confirmed'), findsOneWidget);
      expect(find.text("You're booked"), findsOneWidget);
      expect(find.text('View ride'), findsOneWidget);

      await tester.tap(find.text('View ride'));
      await tester.pumpAndSettle();

      expect(navigatedPath, equals('/ride/test-ride-123'));
      expect(find.text('Ride Detail Target'), findsOneWidget);
    });
  });

  group('WaitingScreen redirect when ride is booked', () {
    testWidgets('redirects to /ride/:id if ride is already booked',
        (tester) async {
      final state = AppState();

      final bookedRide = RideRequest(
        id: 'waiting-ride-1',
        datetimeLabel: 'Today, 4:00 PM',
        from: 'Downtown',
        to: 'Airport',
        status: RideStatus.booked,
        serverStatus: 'BOOKED',
      );

      String? navigatedPath;
      final router = GoRouter(
        initialLocation: '/waiting/waiting-ride-1',
        routes: [
          GoRoute(
            path: '/waiting/:rideId',
            builder: (context, state) =>
                WaitingScreen(rideId: state.pathParameters['rideId']!),
          ),
          GoRoute(
            path: '/ride/:id',
            builder: (context, state) {
              navigatedPath = '/ride/${state.pathParameters['id']}';
              return const Scaffold(body: Text('Ride Screen Reached'));
            },
          ),
        ],
      );

      await tester.pumpWidget(
        ChangeNotifierProvider.value(
          value: state,
          child: MaterialApp.router(
            routerConfig: router,
          ),
        ),
      );

      await tester.pump(const Duration(milliseconds: 50));
      state.repo.rides.add(bookedRide);
      state.notifyListeners();

      await tester.pump();
      await tester.pump();

      expect(navigatedPath, equals('/ride/waiting-ride-1'));
      await tester.pump();
      expect(find.text('Ride Screen Reached'), findsOneWidget);
    });
  });
}

