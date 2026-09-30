import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:passenger/screens/ride_detail_screen.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });

  group('Ride Live Share with Friend Tests (Passenger)', () {
    testWidgets(
      'Tapping Share trip with friend generates link, opens sheet, and allows revoking',
      (tester) async {
        tester.view.physicalSize = const Size(800, 1400);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(() => tester.view.resetPhysicalSize());

        bool createLinkCalled = false;
        bool revokeLinkCalled = false;

        final mockHttpClient = MockClient((request) async {
          if (request.url.path.contains('/rides/ride-share-test/share-link')) {
            if (request.method == 'POST') {
              createLinkCalled = true;
              return http.Response(
                jsonEncode({
                  'rideId': 'ride-share-test',
                  'shareToken': 'token-live-xyz-789',
                  'shareUrl': 'https://can-ride.ca/track/token-live-xyz-789',
                  'expiresAt': '2026-10-03T12:00:00.000Z',
                }),
                200,
                headers: {'content-type': 'application/json'},
              );
            }
            if (request.method == 'DELETE') {
              revokeLinkCalled = true;
              return http.Response(
                jsonEncode({'success': true, 'revoked': true}),
                200,
                headers: {'content-type': 'application/json'},
              );
            }
          }

          if (request.url.path.contains('/auth/me')) {
            return http.Response(
              jsonEncode({'id': 'passenger-user-1', 'email': 'passenger@example.com'}),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          if (request.url.path.contains('/payment-status')) {
            return http.Response(
              jsonEncode({'status': 'PAID'}),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          if (request.url.path.contains('/tracking')) {
            return http.Response(
              jsonEncode({}),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          if (request.url.path.contains('/rides/')) {
            return http.Response(
              jsonEncode({
                'id': 'ride-share-test',
                'pickupAt': '2026-10-01T10:00:00.000Z',
                'fromLabel': '100 King St W, Toronto',
                'toLabel': 'Pearson Airport Terminal 1',
                'status': 'BOOKED',
                'offers': [],
              }),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response('{"ok": true}', 200, headers: {'content-type': 'application/json'});
        });

        final session = CanGoSession(client: ApiClient(httpClient: mockHttpClient));
        final appState = AppState(session: session);
        addTearDown(appState.dispose);
        await tester.pump(const Duration(milliseconds: 100));
        appState.isAuthenticated = true;
        appState.me = {'id': 'passenger-user-1'};

        final ride = RideRequest(
          id: 'ride-share-test',
          datetimeLabel: 'Today, 10:00 AM',
          from: '100 King St W, Toronto',
          to: 'Pearson Airport Terminal 1',
          status: RideStatus.booked,
          serverStatus: 'BOOKED',
        );
        appState.repo.rides.clear();
        appState.repo.rides.add(ride);

        await tester.pumpWidget(
          MaterialApp(
            home: ChangeNotifierProvider<AppState>.value(
              value: appState,
              child: const RideDetailScreen(rideId: 'ride-share-test'),
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Verify "Share trip with friend" button is present
        final shareBtnFinder = find.text('Share trip with friend');
        expect(shareBtnFinder, findsWidgets);

        // Tap the first share button
        await tester.ensureVisible(shareBtnFinder.first);
        await tester.pumpAndSettle();
        await tester.tap(shareBtnFinder.first);
        await tester.pumpAndSettle();

        // Verify POST share-link was called
        expect(createLinkCalled, isTrue);

        // Verify bottom sheet content
        expect(find.text('Friends follow your ride live on the web'), findsOneWidget);
        expect(find.text('What your friend will see:'), findsOneWidget);
        expect(find.text('https://can-ride.ca/track/token-live-xyz-789'), findsOneWidget);
        expect(find.text('Copy & Share link'), findsOneWidget);
        expect(find.text('Stop sharing this trip'), findsOneWidget);

        // Tap "Stop sharing this trip"
        await tester.tap(find.text('Stop sharing this trip'));
        await tester.pumpAndSettle();

        // Verify DELETE share-link was called
        expect(revokeLinkCalled, isTrue);
        expect(find.text('Sharing is currently stopped for this ride.'), findsOneWidget);
        expect(find.text('Generate new share link'), findsOneWidget);
      },
    );
  });
}
