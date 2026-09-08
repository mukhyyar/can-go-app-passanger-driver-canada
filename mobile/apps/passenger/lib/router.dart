import 'package:go_router/go_router.dart';
import 'package:passenger/screens/account_screen.dart';
import 'package:passenger/screens/auth_screen.dart';
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
      if (!state.isAuthenticated && !isAuth && loc != '/onboarding') {
        return '/auth';
      }
      if (state.isAuthenticated && isAuth) return '/';
      if (state.isAuthenticated &&
          !state.onboarded &&
          loc != '/onboarding') {
        return '/onboarding';
      }
      if (state.onboarded && loc == '/onboarding') return '/';
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
        builder: (_, state) =>
            OffersScreen(rideId: state.pathParameters['id']!),
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
