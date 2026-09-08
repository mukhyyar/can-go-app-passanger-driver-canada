import 'package:go_router/go_router.dart';
import 'package:passenger/screens/account_screen.dart';
import 'package:passenger/screens/auth_screen.dart';
import 'package:passenger/screens/booking_confirmed_screen.dart';
import 'package:passenger/screens/location_screen.dart';
import 'package:passenger/screens/map_pick_screen.dart';
import 'package:passenger/screens/offer_detail_screen.dart';
import 'package:passenger/screens/offers_screen.dart';
import 'package:passenger/screens/onboarding_screen.dart';
import 'package:passenger/screens/payment_screen.dart';
import 'package:passenger/screens/shell.dart';
import 'package:passenger/screens/waiting_screen.dart';
import 'package:passenger/state/app_state.dart';

GoRouter createRouter(AppState state) {
  return GoRouter(
    // Avoid Flutter web platform defaultRouteName clashing with go_router.
    overridePlatformDefaultLocation: true,
    initialLocation: '/',
    refreshListenable: state,
    redirect: (context, goState) {
      if (!state.ready) return null;
      final loc = goState.matchedLocation;
      final isAuth = loc == '/auth';

      // Guests may browse the app; auth is opened from gated actions.
      if (state.isAuthenticated && isAuth) return '/';

      final needsAuth = loc == '/account' ||
          loc == '/edit-field' ||
          loc.startsWith('/payment') ||
          loc.startsWith('/booking-confirmed');
      if (!state.isAuthenticated && needsAuth) return '/auth';

      if (state.isAuthenticated &&
          !state.onboarded &&
          loc != '/onboarding') {
        return '/onboarding';
      }
      if (state.onboarded && loc == '/onboarding') return '/';

      // Consume pending FCM / deep-link once authenticated.
      if (state.isAuthenticated &&
          state.pendingDeepLinkRideId != null &&
          !loc.startsWith('/offers') &&
          !loc.startsWith('/offer/')) {
        final path = state.consumeDeepLinkPath();
        if (path != null) return path;
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/',
        builder: (_, __) => const Shell(),
      ),
      GoRoute(
        path: '/auth',
        builder: (_, __) => const AuthScreen(),
      ),
      GoRoute(
        path: '/onboarding',
        builder: (_, __) => const OnboardingScreen(),
      ),
      GoRoute(
        path: '/location',
        builder: (_, __) => const LocationScreen(),
      ),
      GoRoute(
        path: '/map-pick',
        builder: (_, __) => const MapPickScreen(),
      ),
      GoRoute(
        path: '/waiting/:id',
        builder: (_, state) =>
            WaitingScreen(rideId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/offers/:id',
        builder: (_, goState) => OffersScreen(
          rideId: goState.pathParameters['id']!,
          focusOfferId: goState.uri.queryParameters['offerId'],
        ),
      ),
      GoRoute(
        path: '/offer/:rideId/:offerId',
        builder: (_, state) => OfferDetailScreen(
          rideId: state.pathParameters['rideId']!,
          offerId: state.pathParameters['offerId']!,
        ),
      ),
      GoRoute(
        path: '/payment/:rideId/:offerId',
        builder: (_, state) => PaymentScreen(
          rideId: state.pathParameters['rideId']!,
          offerId: state.pathParameters['offerId']!,
        ),
      ),
      GoRoute(
        path: '/booking-confirmed/:rideId',
        builder: (_, state) => BookingConfirmedScreen(
          rideId: state.pathParameters['rideId']!,
        ),
      ),
      GoRoute(
        path: '/account',
        builder: (_, __) => const AccountScreen(),
      ),
      GoRoute(
        path: '/edit-field',
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>? ?? {};
          return EditFieldScreen(
            title: extra['title'] as String? ?? 'Edit',
            initialValue: extra['value'] as String? ?? '',
            field: extra['field'] as String? ?? 'fullName',
          );
        },
      ),
    ],
  );
}
