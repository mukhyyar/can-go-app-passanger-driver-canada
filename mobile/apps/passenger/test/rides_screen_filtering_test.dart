import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:passenger/screens/rides_screen.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });

  group('RidesScreen Upcoming vs Past Filtering Tests', () {
    testWidgets('Cancelled and completed rides show in Past tab, open rides in Upcoming',
        (tester) async {
      final mockHttpClient = MockClient((request) async {
        return http.Response(
            jsonEncode([
              {
                'id': 'ride-open',
                'pickupAt': '2026-10-26T14:00:00.000Z',
                'fromLabel': 'Start A',
                'toLabel': 'End A',
                'status': 'WAITING_FOR_OFFERS',
                'offers': [],
              },
              {
                'id': 'ride-cancelled',
                'pickupAt': '2026-10-26T15:00:00.000Z',
                'fromLabel': 'Start B',
                'toLabel': 'End B',
                'status': 'PASSENGER_CANCELLED',
                'offers': [],
              },
              {
                'id': 'ride-completed',
                'pickupAt': '2026-10-25T13:00:00.000Z',
                'fromLabel': 'Start C',
                'toLabel': 'End C',
                'status': 'COMPLETED',
                'offers': [],
              },
            ]),
            200,
            headers: {'content-type': 'application/json'});
      });

      final session =
          CanGoSession(client: ApiClient(httpClient: mockHttpClient));
      final appState = AppState(session: session);
      addTearDown(appState.dispose);
      appState.isAuthenticated = true;

      final openRide = RideRequest(
        id: 'ride-open',
        datetimeLabel: 'Today, 2:00 PM',
        from: 'Start A',
        to: 'End A',
        status: RideStatus.waitingOffers,
        serverStatus: 'WAITING_FOR_OFFERS',
      );

      final cancelledByServerRide = RideRequest(
        id: 'ride-cancelled',
        datetimeLabel: 'Today, 3:00 PM',
        from: 'Start B',
        to: 'End B',
        status: RideStatus.waitingOffers, // e.g. not mapped locally yet
        serverStatus: 'PASSENGER_CANCELLED',
      );

      final completedRide = RideRequest(
        id: 'ride-completed',
        datetimeLabel: 'Yesterday, 1:00 PM',
        from: 'Start C',
        to: 'End C',
        status: RideStatus.past,
        serverStatus: 'COMPLETED',
      );

      await appState.refreshRidesFromServer();

      await tester.pumpWidget(
        MaterialApp(
          home: ChangeNotifierProvider<AppState>.value(
            value: appState,
            child: const RidesScreen(),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));

      // On Upcoming tab (tab 0):
      // Start A should be visible
      expect(find.text('Start A'), findsOneWidget);
      // Cancelled and completed rides should NOT be in Upcoming
      expect(find.text('Start B'), findsNothing);
      expect(find.text('Start C'), findsNothing);

      // Switch to Past tab (tab 1):
      await tester.tap(find.text('Past'));
      await tester.pumpAndSettle();

      // Start B (cancelled) and Start C (completed) should be visible in Past tab
      expect(find.text('Start B'), findsOneWidget);
      expect(find.text('Start C'), findsOneWidget);
      // Start A (open) should NOT be in Past
      expect(find.text('Start A'), findsNothing);
    });
  });
}
