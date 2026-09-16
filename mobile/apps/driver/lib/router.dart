import 'package:go_router/go_router.dart';

import 'screens/auth_screen.dart';
import 'screens/chat_detail_screen.dart';
import 'screens/chats_screen.dart';
import 'screens/instructions_screen.dart';
import 'screens/notifications_screen.dart';
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
import 'state/app_state.dart';

GoRouter createRouter(AppState appState) {
  return GoRouter(
    initialLocation: '/',
    refreshListenable: appState,
    redirect: (context, state) {
      if (!appState.loaded) return null;
      final loc = state.matchedLocation;
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
        builder: (_, __) => const EditVehicleScreen(),
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
    ],
  );
}
