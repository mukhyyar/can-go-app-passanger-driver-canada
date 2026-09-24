import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:provider/provider.dart';

import 'offer/offer_helpers.dart';
import 'screens/auth_screen.dart';
import 'screens/chat_detail_screen.dart';
import 'screens/chats_screen.dart';
import 'screens/instructions_screen.dart';
import 'screens/legal_screen.dart';
import 'screens/notifications_screen.dart';
import 'screens/offer_review_screen.dart';
import 'screens/onboarding/documents_screen.dart';
import 'screens/onboarding/edit_vehicle_screen.dart';
import 'screens/onboarding/location_screen.dart';
import 'screens/onboarding/map_screen.dart';
import 'screens/onboarding/payment_screen.dart';
import 'screens/onboarding/photos_screen.dart';
import 'screens/onboarding/profile_screen.dart';
import 'screens/onboarding/zone_screen.dart';
import 'screens/request_detail_screen.dart';
import 'screens/trip_detail_screen.dart';
import 'screens/requests_screen.dart';
import 'screens/rides_screen.dart';
import 'screens/settings/add_vehicle_screen.dart';
import 'screens/settings/vehicles_list_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/shell.dart';
import 'screens/wallet_screen.dart';
import 'screens/welcome_screen.dart';
import 'state/app_state.dart';

GoRouter createRouter(AppState appState) {
  return GoRouter(
    initialLocation: '/',
    refreshListenable: appState,
    redirect: (context, state) {
      if (!appState.loaded) return null;
      final loc = state.matchedLocation;
      final isWelcome = loc == '/welcome';

      if (!appState.hasSeenWelcome) {
        return isWelcome ? null : '/welcome';
      }
      if (isWelcome) {
        return appState.isAuthenticated
            ? (appState.onboardedComplete ? '/' : '/onboarding/profile')
            : '/auth';
      }

      final isLegal = loc.startsWith('/legal');
      if (isLegal) return null;

      final onboarding = loc.startsWith('/onboarding');
      final isAuth = loc == '/auth';
      if (!appState.isAuthenticated && !isAuth) {
        return '/auth';
      }
      if (appState.isAuthenticated && isAuth) {
        return appState.onboardedComplete ? '/' : '/onboarding/profile';
      }
      if (appState.isAuthenticated &&
          !appState.onboardedComplete &&
          !onboarding) {
        return '/onboarding/profile';
      }
      return null;
    },
    routes: [
      GoRoute(
        path: '/welcome',
        builder: (_, __) => const DriverWelcomeScreen(),
      ),
      GoRoute(
        path: '/auth',
        builder: (_, __) => const AuthScreen(),
      ),
      GoRoute(
        path: '/onboarding/profile',
        builder: (_, __) => const ProfileScreen(),
      ),
      GoRoute(
        path: '/onboarding/location',
        builder: (_, __) => const LocationScreen(),
      ),
      GoRoute(
        path: '/onboarding/map',
        builder: (_, __) => const MapScreen(),
      ),
      GoRoute(
        path: '/onboarding/zone',
        builder: (_, __) => const ZoneScreen(),
      ),
      GoRoute(
        path: '/onboarding/documents',
        builder: (_, __) => const DocumentsScreen(),
      ),
      GoRoute(
        path: '/onboarding/photos',
        builder: (_, __) => const PhotosScreen(),
      ),
      GoRoute(
        path: '/onboarding/edit-vehicle',
        builder: (context, state) {
          final id =
              state.uri.queryParameters['id'] ?? (state.extra as String?);
          return EditVehicleScreen(vehicleId: id);
        },
      ),
      GoRoute(
        path: '/onboarding/payment',
        builder: (_, __) => const PaymentScreen(),
      ),
      GoRoute(
        path: '/wallet',
        builder: (_, __) => const WalletScreen(),
      ),
      GoRoute(
        path: '/settings/vehicles',
        builder: (_, __) => const VehiclesListScreen(),
      ),
      GoRoute(
        path: '/settings/vehicles/add',
        builder: (_, __) => const AddVehicleScreen(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            DriverShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/',
                builder: (_, __) => const RequestsScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/rides',
                builder: (_, __) => const RidesScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/chats',
                builder: (_, __) => const ChatsScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/settings',
                builder: (_, __) => const SettingsScreen(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: '/request/:id',
        builder: (_, state) => RequestDetailScreen(
          requestId: state.pathParameters['id']!,
        ),
      ),
      GoRoute(
        path: '/request/:id/offer',
        builder: (context, state) {
          final reqId = state.pathParameters['id']!;
          final extra = state.extra as Map<String, dynamic>?;
          final app = context.read<AppState>();
          final req = extra?['request'] as DriverRequest? ??
              app.openRequests.firstWhere(
                (r) => r.id == reqId,
                orElse: () =>
                    app.repo.newRequests.firstWhere((r) => r.id == reqId),
              );
          final draft = extra?['draft'] as OfferDraft? ??
              app.offerDraftFor(reqId) ??
              OfferDraft();
          final vehicle = extra?['vehicle'] as DriverVehicle?;
          return OfferReviewScreen(
            request: req,
            draft: draft,
            vehicle: vehicle,
          );
        },
      ),
      GoRoute(
        path: '/trip/:rideId',
        builder: (_, state) => TripDetailScreen(
          rideId: state.pathParameters['rideId']!,
        ),
      ),
      GoRoute(
        path: '/instructions',
        builder: (_, __) => const InstructionsScreen(),
      ),
      GoRoute(
        path: '/notifications',
        builder: (_, __) => const NotificationsScreen(),
      ),
      GoRoute(
        path: '/chat/:id',
        builder: (_, state) =>
            ChatDetailScreen(threadId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/legal/:slug',
        builder: (_, state) => DriverLegalScreen(
          initialSlug: state.pathParameters['slug'] ?? 'privacy',
        ),
      ),
      GoRoute(
        path: '/legal',
        builder: (_, __) => const DriverLegalScreen(initialSlug: 'privacy'),
      ),
    ],
  );
}
