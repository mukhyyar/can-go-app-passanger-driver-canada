import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:driver/screens/notifications_screen.dart';
import 'package:driver/screens/requests_screen.dart';
import 'package:driver/screens/shell.dart';
import 'package:driver/state/app_state.dart';

class MockSwitchAppState extends AppState {
  bool setAvailabilityCalled = false;

  MockSwitchAppState() {
    isAuthenticated = true;
    isActivated = true;
    drivingEnabled = true;
    unreadNotificationCount = 5;
  }

  @override
  Future<void> setDrivingMode(bool enabled) async {
    if (enabled && hasExpiredDocuments) {
      throw Exception('Cannot go online: you have expired documents.');
    }
    if (enabled && isProfileOnHold) {
      throw Exception('Cannot go online: your profile is currently on hold.');
    }
    if (enabled && hasReuploadRequest) {
      throw Exception('Cannot go online: document re-upload is requested.');
    }
    if (enabled && !isActivated) {
      throw Exception('Cannot go online: complete activation to offer prices.');
    }
    setAvailabilityCalled = true;
    drivingEnabled = enabled;
    if (!drivingEnabled) {
      clearPendingRequestAlert();
      pendingChatRideId = null;
    }
    notifyListeners();
  }

  @override
  Future<void> refreshOpenRequests({bool fromPush = false}) async {}

  @override
  Future<void> refreshMyRides() async {}

  @override
  Future<void> startMarketplaceRealtime() async {}
}

Widget buildTestApp({
  required AppState appState,
  required Widget child,
}) {
  return ChangeNotifierProvider<AppState>.value(
    value: appState,
    child: MaterialApp(
      home: child,
    ),
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('AppState Online/Offline & Notification suppression tests', () {
    test('isOnline, isOffline, and unreadNotificationCount getters', () {
      final app = MockSwitchAppState();
      app.drivingEnabled = true;
      app.unreadNotificationCount = 4;

      expect(app.isOnline, isTrue);
      expect(app.isOffline, isFalse);
      expect(app.unreadNotificationCount, equals(4));

      // Go offline
      app.drivingEnabled = false;
      expect(app.isOnline, isFalse);
      expect(app.isOffline, isTrue);
      // Suppresses unread notifications count when offline!
      expect(app.unreadNotificationCount, equals(0));

      // Go back online
      app.drivingEnabled = true;
      expect(app.isOnline, isTrue);
      expect(app.isOffline, isFalse);
      expect(app.unreadNotificationCount, equals(4));
    });

    test('applyPushAlert is suppressed when offline', () {
      final app = MockSwitchAppState();
      app.drivingEnabled = false; // offline

      app.applyPushAlert(
        rideId: 'ride-123',
        title: 'New ride offer request',
        type: 'ride_request',
      );

      expect(app.pendingRequestAlert, isNull);
      expect(app.pendingRequestRideId, isNull);

      // When online, alert is received
      app.drivingEnabled = true;
      app.applyPushAlert(
        rideId: 'ride-123',
        title: 'New ride offer request',
        type: 'ride_request',
      );

      expect(app.pendingRequestAlert, equals('New ride offer request'));
      expect(app.pendingRequestRideId, equals('ride-123'));
    });

    test('setDrivingMode guards against blocked states', () async {
      final app = MockSwitchAppState();
      app.drivingEnabled = false;

      // When documents expired
      app.hasExpiredDocumentsFromServer = true;
      expect(app.hasExpiredDocuments, isTrue);
      expect(() => app.setDrivingMode(true), throwsException);
      expect(app.drivingEnabled, isFalse);

      // Clear expired documents
      app.hasExpiredDocumentsFromServer = false;
      expect(app.hasExpiredDocuments, isFalse);

      // Successfully go online
      await app.setDrivingMode(true);
      expect(app.drivingEnabled, isTrue);
    });
  });

  group('Homescreen Online/Offline Switch & Grayscale UI tests', () {
    testWidgets('Renders online state with active switch and green indicators',
        (tester) async {
      final app = MockSwitchAppState();
      app.drivingEnabled = true;

      await tester.pumpWidget(
        buildTestApp(
          appState: app,
          child: const RequestsScreen(),
        ),
      );
      await tester.pumpAndSettle();

      // Check switch bar exists
      expect(find.byKey(const ValueKey('online_offline_switch_bar')), findsOneWidget);
      expect(find.text("YOU'RE ONLINE"), findsOneWidget);
      expect(find.text('Ready to receive ride requests'), findsOneWidget);

      // Check switch widget value
      final switchFinder = find.byKey(const ValueKey('online_offline_switch'));
      expect(switchFinder, findsOneWidget);
      final switchWidget = tester.widget<Switch>(switchFinder);
      expect(switchWidget.value, isTrue);

      // Check status chip shows Online
      expect(find.text('Online'), findsOneWidget);

      // ColorFiltered with grayscale shouldn't be active
      expect(find.byType(ColorFiltered), findsNothing);
    });

    testWidgets('Tapping switch toggles to offline and renders greyish UI',
        (tester) async {
      final app = MockSwitchAppState();
      app.drivingEnabled = true;

      await tester.pumpWidget(
        buildTestApp(
          appState: app,
          child: const RequestsScreen(),
        ),
      );
      await tester.pumpAndSettle();

      // Tap on the online/offline switch bar
      await tester.tap(find.byKey(const ValueKey('online_offline_bar_tap')));
      await tester.pumpAndSettle();

      // Driver is now offline
      expect(app.drivingEnabled, isFalse);
      expect(find.text("YOU'RE OFFLINE"), findsOneWidget);
      expect(find.text('Go online to receive requests'), findsOneWidget);

      // Status chip shows Offline
      expect(find.text('Offline'), findsOneWidget);

      // Offline banner is shown
      expect(
        find.text('You are offline. Turn on the switch below to receive requests.'),
        findsOneWidget,
      );

      // Grayscale ColorFiltered is applied to upper content
      expect(find.byType(ColorFiltered), findsOneWidget);

      // Empty state shows offline instructions
      expect(
        find.text('You are offline\nSwitch on below to view live requests'),
        findsOneWidget,
      );

      // Floating snackbar was shown
      expect(
        find.text("You're now offline. Requests and alerts are paused."),
        findsOneWidget,
      );

      // Tap again to switch back online
      await tester.tap(find.byKey(const ValueKey('online_offline_bar_tap')));
      await tester.pumpAndSettle();

      expect(app.drivingEnabled, isTrue);
      expect(find.text("YOU'RE ONLINE"), findsOneWidget);
      expect(find.byType(ColorFiltered), findsNothing);
      expect(
        find.text("You're now online and ready to receive requests."),
        findsOneWidget,
      );
    });

    testWidgets('Tapping request card while offline shows warning SnackBar',
        (tester) async {
      final app = MockSwitchAppState();
      app.drivingEnabled = false; // offline
      app.openRequests = [
        DriverRequest(
          id: 'req-1',
          datetimeLabel: 'Today, 18:00',
          from: '100 King St',
          to: 'Pearson Airport',
          distance: '25 km',
          duration: '30 min',
          vehicleNeed: 'Sedan',
          passengers: 1,
        ),
      ];

      await tester.pumpWidget(
        buildTestApp(
          appState: app,
          child: const RequestsScreen(),
        ),
      );
      await tester.pumpAndSettle();

      // Tap on the request item
      await tester.tap(find.text('100 King St'));
      await tester.pumpAndSettle();

      // Warning snackbar appears
      expect(
        find.text(
          'You are offline. Turn on the switch below to go online and view requests.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('Notifications screen displays offline muted view when offline',
        (tester) async {
      final app = MockSwitchAppState();
      app.drivingEnabled = false; // offline

      await tester.pumpWidget(
        buildTestApp(
          appState: app,
          child: const NotificationsScreen(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text("You're Offline"), findsOneWidget);
      expect(
        find.text(
          'Notifications and live alerts are paused while you are offline. Go online to view notifications.',
        ),
        findsOneWidget,
      );
      expect(find.byIcon(Icons.notifications_off_outlined), findsOneWidget);
    });
    testWidgets('Floating action button is positioned above and does not overlap online/offline switch bar',
        (tester) async {
      final app = MockSwitchAppState();
      app.drivingEnabled = true;

      await tester.pumpWidget(
        buildTestApp(
          appState: app,
          child: const RequestsScreen(),
        ),
      );
      await tester.pumpAndSettle();

      final fabFinder = find.byType(FloatingActionButton);
      final switchBarFinder = find.byKey(const ValueKey('online_offline_switch_bar'));

      expect(fabFinder, findsOneWidget);
      expect(switchBarFinder, findsOneWidget);

      final fabRect = tester.getRect(fabFinder);
      final switchBarRect = tester.getRect(switchBarFinder);

      // Verify that the bottom of the FAB is strictly above the top of the switch bar
      expect(fabRect.bottom, lessThanOrEqualTo(switchBarRect.top));
    });
  });
}
