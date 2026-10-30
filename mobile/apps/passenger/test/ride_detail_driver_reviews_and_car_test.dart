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

  testWidgets(
    'RideDetailScreen displays Show reviews button and opens reviews bottom sheet',
    (tester) async {
      tester.view.physicalSize = const Size(800, 1600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      const rideId = 'ride-rev-101';
      const offerId = 'offer-rev-202';

      final mockHttpClient = MockClient((request) async {
        if (request.url.path.contains('/offers/$offerId/reviews')) {
          return http.Response(
            jsonEncode({
              'reviews': [
                {
                  'stars': 5,
                  'communicationStars': 5,
                  'driverStars': 5,
                  'vehicleStars': 5,
                  'text': 'Punctual and very polite driver!',
                  'createdAt': '2026-10-30T12:00:00.000Z',
                }
              ]
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/payment-status')) {
          return http.Response(
            jsonEncode({'status': 'PAID', 'totalAmount': 70.0, 'onlineCurrency': 'CAD'}),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.contains('/rating')) {
          return http.Response(jsonEncode([]), 200, headers: {'content-type': 'application/json'});
        }
        if (request.url.path.contains('/rides/$rideId')) {
          return http.Response(
            jsonEncode({
              'id': rideId,
              'pickupAt': '2026-10-30T15:00:00.000Z',
              'fromLabel': 'Union Station',
              'toLabel': 'Pearson Airport',
              'status': 'BOOKED',
              'selectedOfferId': offerId,
              'currency': 'CAD',
              'offers': [
                {
                  'id': offerId,
                  'status': 'ACTIVE',
                  'currency': 'CAD',
                  'bidAmount': 60,
                  'driver': {'fullName': 'Mirza Asadullah Baig'},
                  'vehicle': {
                    'name': 'Primary',
                    'plate': 'TEMP-1345',
                    'vehicleClass': 'sedan',
                  },
                  'presentation': {
                    'vehicleDisplayName': 'Primary',
                    'vehicleClass': 'sedan',
                    'plate': 'TEMP-1345',
                    'rating': {'overall': 5.0, 'count': 1},
                    'imageUrl': null,
                    'images': [],
                    'languages': ['EN', 'HI', 'UR'],
                  },
                }
              ],
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{}', 200, headers: {'content-type': 'application/json'});
      });

      final session = CanGoSession(client: ApiClient(httpClient: mockHttpClient));
      final appState = AppState(session: session);
      addTearDown(appState.dispose);

      appState.isAuthenticated = true;
      appState.me = {'id': 'user-pass-1'};

      await appState.refreshRide(rideId);

      await tester.pumpWidget(
        MaterialApp(
          home: ChangeNotifierProvider<AppState>.value(
            value: appState,
            child: const RideDetailScreen(rideId: rideId),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Verify Driver details rendered
      expect(find.text('Your driver'), findsOneWidget);
      expect(find.text('Mirza Asadullah Baig'), findsOneWidget);
      expect(find.text(' 5.0 (1)'), findsOneWidget);

      // Verify "Primary" database keyword is sanitized to "Sedan"
      expect(find.text('Primary'), findsNothing);
      expect(find.text('Sedan'), findsAtLeastNWidgets(1));

      // Verify fallback vehicle badge renders SEDAN
      expect(find.text('SEDAN'), findsOneWidget);

      // Verify "Show reviews" button is present and interactive
      expect(find.text('Show reviews'), findsOneWidget);
      await tester.tap(find.text('Show reviews'));
      await tester.pumpAndSettle();

      // Verify reviews bottomsheet opens and shows driver review content
      expect(find.textContaining('Driver Reviews · 5.0 (1)'), findsOneWidget);
      expect(find.text('Punctual and very polite driver!'), findsOneWidget);
      expect(find.textContaining('Comm ★5'), findsOneWidget);
      expect(find.textContaining('Driver ★5'), findsOneWidget);
      expect(find.textContaining('Vehicle ★5'), findsOneWidget);
    },
  );

  testWidgets(
    'RideDetailScreen displays vehicle photos link and badge when images exist',
    (tester) async {
      tester.view.physicalSize = const Size(800, 1600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      const rideId = 'ride-photos-102';
      const offerId = 'offer-photos-203';

      final mockHttpClient = MockClient((request) async {
        if (request.url.path.endsWith('/payment-status')) {
          return http.Response(
            jsonEncode({'status': 'PAID', 'totalAmount': 70.0, 'onlineCurrency': 'CAD'}),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.contains('/rating')) {
          return http.Response(jsonEncode([]), 200, headers: {'content-type': 'application/json'});
        }
        if (request.url.path.contains('/rides/$rideId')) {
          return http.Response(
            jsonEncode({
              'id': rideId,
              'pickupAt': '2026-10-30T15:00:00.000Z',
              'fromLabel': 'Union Station',
              'toLabel': 'Pearson Airport',
              'status': 'BOOKED',
              'selectedOfferId': offerId,
              'currency': 'CAD',
              'offers': [
                {
                  'id': offerId,
                  'status': 'ACTIVE',
                  'currency': 'CAD',
                  'bidAmount': 60,
                  'driver': {'fullName': 'Mirza Asadullah Baig'},
                  'vehicle': {
                    'name': 'Toyota Camry',
                    'plate': 'CAR-555',
                    'vehicleClass': 'sedan',
                  },
                  'presentation': {
                    'vehicleDisplayName': 'Toyota Camry',
                    'vehicleClass': 'sedan',
                    'plate': 'CAR-555',
                    'rating': {'overall': 4.9, 'count': 10},
                    'imageUrl': 'https://example.com/car1.jpg',
                    'images': [
                      {'id': 'img1', 'url': 'https://example.com/car1.jpg'},
                      {'id': 'img2', 'url': 'https://example.com/car2.jpg'},
                    ],
                    'languages': ['EN'],
                  },
                }
              ],
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{}', 200, headers: {'content-type': 'application/json'});
      });

      final session = CanGoSession(client: ApiClient(httpClient: mockHttpClient));
      final appState = AppState(session: session);
      addTearDown(appState.dispose);

      appState.isAuthenticated = true;
      appState.me = {'id': 'user-pass-1'};

      await appState.refreshRide(rideId);

      await tester.pumpWidget(
        MaterialApp(
          home: ChangeNotifierProvider<AppState>.value(
            value: appState,
            child: const RideDetailScreen(rideId: rideId),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Verify multiple photos indicator badge is displayed
      expect(find.text('View all vehicle photos (2)'), findsOneWidget);
    },
  );
}

