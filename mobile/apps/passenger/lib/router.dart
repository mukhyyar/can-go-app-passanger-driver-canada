import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:passenger/screens/account_screen.dart';
import 'package:passenger/screens/auth_screen.dart';
import 'package:passenger/screens/booking_confirmed_screen.dart';
import 'package:passenger/screens/edit_ride_screen.dart';
import 'package:passenger/screens/legal_screen.dart';
import 'package:passenger/screens/location_screen.dart';
import 'package:passenger/screens/map_pick_screen.dart';
import 'package:passenger/screens/notifications_screen.dart';
import 'package:passenger/screens/offer_detail_screen.dart';
import 'package:passenger/screens/offers_screen.dart';
import 'package:passenger/screens/onboarding_screen.dart';
import 'package:passenger/screens/payment_screen.dart';
import 'package:passenger/screens/ride_chat_screen.dart';
import 'package:passenger/screens/ride_detail_screen.dart';
import 'package:passenger/screens/shell.dart';
import 'package:passenger/screens/waiting_screen.dart';
import 'package:passenger/state/app_state.dart';

GoRouter createRouter(AppState state) {
  return GoRouter(
    // Keep browser deep links (e.g. /offers/:id) — do not force '/'.
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
          loc == '/notifications' ||
          loc.startsWith('/payment') ||
          loc.startsWith('/booking-confirmed') ||
          loc.startsWith('/ride/') ||
          loc.startsWith('/edit-ride/');
      if (!state.isAuthenticated && needsAuth) return '/auth';

      if (!state.onboarded && loc != '/onboarding' && !loc.startsWith('/legal')) {
        return '/onboarding';
      }
      if (state.onboarded && loc == '/onboarding') return '/';

      // Consume pending FCM / deep-link once authenticated.
      if (state.isAuthenticated &&
          state.pendingDeepLinkRideId != null &&
          !loc.startsWith('/offers') &&
          !loc.startsWith('/offer/') &&
          !loc.startsWith('/payment') &&
          !loc.startsWith('/booking-confirmed')) {
        final path = state.consumeDeepLinkPath();
        if (path != null) return path;
      }

      // If a ride is already booked, redirect away from booking/waiting screens to the ride screen.
      if (loc.startsWith('/waiting/') ||
          loc.startsWith('/offers/') ||
          loc.startsWith('/offer/')) {
        final segments = loc.split('/');
        if (segments.length >= 3) {
          final rideId = segments[2];
          if (state.isRideBooked(rideId)) {
            return '/ride/$rideId';
          }
        }
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
        builder: (_, state) => ScaffoldMessenger(
          child: PaymentScreen(
            rideId: state.pathParameters['rideId']!,
            offerId: state.pathParameters['offerId']!,
          ),
        ),
      ),
      GoRoute(
        path: '/booking-confirmed/:rideId',
        builder: (_, state) => BookingConfirmedScreen(
          rideId: state.pathParameters['rideId']!,
        ),
      ),
      GoRoute(
        path: '/ride/:rideId/chat',
        builder: (_, state) => RideChatScreen(
          rideId: state.pathParameters['rideId']!,
        ),
      ),
      GoRoute(
        path: '/ride/:rideId',
        builder: (_, state) => RideDetailScreen(
          rideId: state.pathParameters['rideId']!,
        ),
      ),
      GoRoute(
        path: '/edit-ride/:rideId',
        builder: (_, state) => EditRideScreen(
          rideId: state.pathParameters['rideId']!,
        ),
      ),
      GoRoute(
        path: '/account',
        builder: (_, __) => const AccountScreen(),
      ),
      GoRoute(
        path: '/notifications',
        builder: (_, __) => const NotificationsScreen(),
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
      GoRoute(
        path: '/legal/:slug',
        builder: (_, state) => LegalScreen(
          initialSlug: state.pathParameters['slug'] ?? 'privacy',
        ),
      ),
      GoRoute(
        path: '/legal',
        builder: (_, __) => const LegalScreen(initialSlug: 'privacy'),
      ),
    ],
  );
}
