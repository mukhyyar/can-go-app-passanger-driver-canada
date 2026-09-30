import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:passenger/screens/edit_ride_screen.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });

  group('EditRideScreen Comprehensive Tests', () {
    testWidgets(
        'Displays all fields (locations, schedule, passengers, child seats, vehicle preferences, flight, comment chips) and saves changes',
        (tester) async {
      tester.view.physicalSize = const Size(1080, 4000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      Map<String, dynamic>? updatedRidePayload;

      final mockHttpClient = MockClient((request) async {
        if (request.url.path.endsWith('/rides/ride-123') &&
            request.method == 'GET') {
          return http.Response(
            jsonEncode({
              'id': 'ride-123',
              'status': 'WAITING_FOR_OFFERS',
              'serviceType': 'RIDE',
              'fromLabel': 'WB Masters AV @ Marine DR SE, Calgary',
              'fromLat': 50.91,
              'fromLng': -113.96,
              'toLabel': 'T3M 2T5, Calgary',
              'toLat': 50.89,
              'toLng': -113.94,
              'pickupAt': '2026-10-01T10:14:00.000Z',
              'returnAt': '2026-10-01T15:00:00.000Z',
              'isRoundTrip': true,
              'vehicleClassIds': ['economy', 'comfort'],
              'adults': 2,
              'childSeatsJson': {'infant': 1, 'booster': 1},
              'flight': 'pk737',
              'returnFlight': 'pk738',
              'signage': 'Mukhyyar',
              'comment': 'I need an English-speaking driver',
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/rides/ride-123') &&
            request.method == 'PATCH') {
          updatedRidePayload =
              jsonDecode(request.body) as Map<String, dynamic>;
          return http.Response(
            jsonEncode({'id': 'ride-123', ...updatedRidePayload!}),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          jsonEncode({'ok': true}),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final session =
          CanGoSession(client: ApiClient(httpClient: mockHttpClient));
      final appState = AppState(session: session);
      addTearDown(appState.dispose);

      final router = GoRouter(
        initialLocation: '/edit-ride/ride-123',
        routes: [
          GoRoute(
            path: '/edit-ride/:id',
            builder: (context, state) => EditRideScreen(
              rideId: state.pathParameters['id']!,
            ),
          ),
          GoRoute(
            path: '/waiting/:id',
            builder: (context, state) =>
                const Scaffold(body: Text('Waiting Screen Target')),
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

      // Verify From and To labels
      expect(find.text('WB Masters AV @ Marine DR SE, Calgary'), findsOneWidget);
      expect(find.text('T3M 2T5, Calgary'), findsOneWidget);

      // Verify Passengers count
      expect(find.text('2'), findsOneWidget);

      // Verify Child seats summary
      expect(find.textContaining('Infant carrier ×1'), findsOneWidget);
      expect(find.textContaining('Booster ×1'), findsOneWidget);

      // Verify Return trip is active and showing return flight
      expect(find.text('Add return trip'), findsOneWidget);
      expect(find.text('Return pickup time'), findsOneWidget);
      expect(find.text('pk738'), findsOneWidget);

      // Verify Vehicle preferences section is displayed
      expect(find.text('Vehicle preferences'), findsOneWidget);
      expect(find.text('2 of 7 selected'), findsOneWidget);

      // Verify Flight number, Name sign, Action chips
      expect(find.text('pk737'), findsOneWidget);
      expect(find.text('Mukhyyar'), findsOneWidget);
      expect(find.widgetWithText(ActionChip, 'I need an English-speaking driver'),
          findsOneWidget);

      // Tap on action chip "I need Wi-Fi" to append to comment
      final wifiChip = find.widgetWithText(ActionChip, 'I need Wi-Fi');
      expect(wifiChip, findsOneWidget);
      await tester.tap(wifiChip);
      await tester.pumpAndSettle();

      // Comment should now have Wi-Fi appended
      expect(
        find.text('I need an English-speaking driver. I need Wi-Fi'),
        findsOneWidget,
      );

      // Toggle a vehicle class (e.g. Premium)
      final premiumCard = find.text('Premium');
      expect(premiumCard, findsOneWidget);
      await tester.tap(premiumCard);
      await tester.pumpAndSettle();
      expect(find.text('3 of 7 selected'), findsOneWidget);

      // Save changes
      final saveBtn = find.widgetWithText(FilledButton, 'Save changes');
      expect(saveBtn, findsOneWidget);
      await tester.tap(saveBtn);
      await tester.pumpAndSettle();

      // Verify payload passed to updateRide
      expect(updatedRidePayload, isNotNull);
      expect(updatedRidePayload!['vehicleClassIds'],
          containsAll(['economy', 'comfort', 'premium']));
      expect(updatedRidePayload!['adults'], 2);
      expect(updatedRidePayload!['childSeatsJson'],
          {'infant': 1, 'convertible': 0, 'booster': 1});
      expect(updatedRidePayload!['isRoundTrip'], true);
      expect(updatedRidePayload!['returnFlight'], 'pk738');
      expect(updatedRidePayload!['flight'], 'pk737');
      expect(updatedRidePayload!['signage'], 'Mukhyyar');
      expect(updatedRidePayload!['comment'],
          'I need an English-speaking driver. I need Wi-Fi');

      // Verify navigation to waiting screen
      expect(find.text('Waiting Screen Target'), findsOneWidget);
    });

    testWidgets('Editing child seats via bottom sheet updates summary label and payload',
        (tester) async {
      tester.view.physicalSize = const Size(1080, 4000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      Map<String, dynamic>? updatedRidePayload;

      final mockHttpClient = MockClient((request) async {
        if (request.url.path.endsWith('/rides/ride-456') &&
            request.method == 'GET') {
          return http.Response(
            jsonEncode({
              'id': 'ride-456',
              'status': 'WAITING_FOR_OFFERS',
              'serviceType': 'RIDE',
              'fromLabel': 'Downtown Calgary',
              'fromLat': 51.04,
              'fromLng': -114.07,
              'toLabel': 'Calgary Airport',
              'toLat': 51.12,
              'toLng': -114.01,
              'pickupAt': '2026-10-01T12:00:00.000Z',
              'vehicleClassIds': ['economy'],
              'adults': 1,
              'childSeatsJson': {},
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/rides/ride-456') &&
            request.method == 'PATCH') {
          updatedRidePayload =
              jsonDecode(request.body) as Map<String, dynamic>;
          return http.Response(
            jsonEncode({'id': 'ride-456', ...updatedRidePayload!}),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          jsonEncode({'ok': true}),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final session =
          CanGoSession(client: ApiClient(httpClient: mockHttpClient));
      final appState = AppState(session: session);
      addTearDown(appState.dispose);

      final router = GoRouter(
        initialLocation: '/edit-ride/ride-456',
        routes: [
          GoRoute(
            path: '/edit-ride/:id',
            builder: (context, state) => EditRideScreen(
              rideId: state.pathParameters['id']!,
            ),
          ),
          GoRoute(
            path: '/waiting/:id',
            builder: (context, state) =>
                const Scaffold(body: Text('Waiting Screen Target')),
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

      // Initially child seats summary is "Child seats"
      expect(find.text('Child seats'), findsOneWidget);

      // Tap Edit button to open child seats sheet
      final editBtn = find.widgetWithText(TextButton, 'Edit');
      expect(editBtn, findsOneWidget);
      await tester.ensureVisible(editBtn);
      await tester.pumpAndSettle();
      await tester.tap(editBtn);
      await tester.pumpAndSettle();

      // Inside child seats bottom sheet, tap add for Infant carrier
      final addButtons = find.descendant(
        of: find.byType(BottomSheet),
        matching: find.byIcon(Icons.add),
      );
      expect(addButtons, findsWidgets);
      await tester.tap(addButtons.first);
      await tester.pumpAndSettle();

      // Tap Done
      final doneBtn = find.text('Done');
      expect(doneBtn, findsOneWidget);
      await tester.tap(doneBtn);
      await tester.pumpAndSettle();

      // Verify summary updated
      expect(find.textContaining('Infant carrier ×1'), findsOneWidget);

      // Attempt to deselect the only vehicle class ('economy')
      final economyCard = find.text('Economy');
      expect(economyCard, findsOneWidget);
      await tester.ensureVisible(economyCard);
      await tester.pumpAndSettle();
      await tester.tap(economyCard);
      await tester.pumpAndSettle();

      // Should show warning SnackBar
      expect(
        find.text('At least one vehicle class must be selected.'),
        findsOneWidget,
      );
      // Economy should still be selected
      expect(find.text('1 of 7 selected'), findsOneWidget);

      // Save changes
      final saveBtn = find.widgetWithText(FilledButton, 'Save changes');
      await tester.ensureVisible(saveBtn);
      await tester.pumpAndSettle();
      await tester.tap(saveBtn);
      await tester.pumpAndSettle();

      expect(updatedRidePayload, isNotNull);
      expect(updatedRidePayload!['childSeatsJson'],
          {'infant': 1, 'convertible': 0, 'booster': 0});
      expect(updatedRidePayload!['vehicleClassIds'], ['economy']);
    });
  });
}
