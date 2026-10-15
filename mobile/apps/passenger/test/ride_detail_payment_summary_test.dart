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

  AppState createMockAppState({
    required String rideId,
    required String offerId,
  }) {
    final mockHttpClient = MockClient((request) async {
      if (request.url.path.endsWith('/payment-status')) {
        return http.Response(
          jsonEncode({
            'status': 'PAID',
            'totalAmount': 240.0,
            'onlineCurrency': 'CAD',
            'priceBreakdown': {
              'ridePrice': 200.0,
              'platformFee': 40.0,
              'marketplaceFee': 40.0,
              'taxes': 0.0,
              'total': 240.0,
              'currency': 'CAD',
            },
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (request.url.path.contains('/rating')) {
        return http.Response(
          jsonEncode([
            {'fromUserId': 'passenger-user-1', 'stars': 5}
          ]),
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
      if (request.url.path.contains('/rides/$rideId')) {
        return http.Response(
          jsonEncode({
            'id': rideId,
            'pickupAt': '2026-10-14T15:00:00.000Z',
            'fromLabel': '100 King St W',
            'toLabel': 'Pearson Terminal 1',
            'status': 'COMPLETED',
            'selectedOfferId': offerId,
            'currency': 'CAD',
            'offers': [
              {
                'id': offerId,
                'status': 'ACCEPTED',
                'currency': 'CAD',
                'bidAmount': 200,
                'driver': {
                  'fullName': 'John Driver',
                },
                'vehicle': {
                  'brand': 'Toyota',
                  'model': 'Highlander',
                  'plate': '0SS52',
                  'vehicleClass': 'suv',
                },
                'presentation': {
                  'brand': 'Toyota',
                  'model': 'Highlander',
                  'plate': '0SS52',
                  'vehicleClass': 'suv',
                  'languages': ['EN'],
                  'priceBreakdown': {
                    'ridePrice': 200.0,
                    'platformFee': 40.0,
                    'marketplaceFee': 40.0,
                    'taxes': 0.0,
                    'total': 240.0,
                    'currency': 'CAD',
                  },
                  'rating': {
                    'overall': 5.0,
                    'count': 2,
                  },
                },
              },
            ],
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response(
        jsonEncode({}),
        200,
        headers: {'content-type': 'application/json'},
      );
    });

    final session = CanGoSession(client: ApiClient(httpClient: mockHttpClient));
    final app = AppState(session: session);
    app.isAuthenticated = true;
    app.me = {'id': 'passenger-user-1'};
    return app;
  }

  testWidgets(
    r'Passenger ride detail displays Ride fare $200, Marketplace fee $40, Total paid $240',
    (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 2.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      const rideId = '64070141';
      const offerId = 'offer-toyota-1';
      final appState = createMockAppState(
        rideId: rideId,
        offerId: offerId,
      );
      addTearDown(appState.dispose);

      final ride = RideRequest(
        id: rideId,
        datetimeLabel: 'Today, 2:00 PM',
        from: '100 King St W',
        to: 'Pearson Terminal 1',
        status: RideStatus.past,
        serverStatus: 'COMPLETED',
        selectedOfferId: offerId,
        currency: 'CAD',
      );

      appState.repo.rides.clear();
      appState.repo.rides.add(ride);

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

      // Verify driver info card shows vehicle details, license plate, and driver ride fare CA$200
      expect(find.text('Toyota Highlander'), findsOneWidget);
      expect(find.text('0SS52'), findsOneWidget);
      expect(find.text('Languages: EN'), findsOneWidget);
      expect(find.text('CA\$200'), findsNWidgets(2)); // Driver card fare ($200) and Payment summary Ride fare ($200)

      // Verify Payment summary card:
      // Ride fare: CA$200
      // Marketplace fee: CA$40
      // Total paid: CA$240
      expect(find.text('Payment summary'), findsOneWidget);
      expect(find.text('Ride fare'), findsOneWidget);
      expect(find.text('Marketplace fee'), findsOneWidget);
      expect(find.text('CA\$40'), findsOneWidget);
      expect(find.text('Total paid'), findsOneWidget);
      expect(find.text('CA\$240'), findsOneWidget);
    },
  );

  testWidgets(
    r'Passenger ride detail normalizes legacy response (160 + 40 == 200) into Ride fare $200, Marketplace fee $40, Total paid $240',
    (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 2.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      const rideId = 'legacy-64070141';
      const offerId = 'legacy-offer-1';

      final mockHttpClient = MockClient((request) async {
        if (request.url.path.endsWith('/payment-status')) {
          return http.Response(
            jsonEncode({
              'status': 'PAID',
              'totalAmount': 200.0,
              'onlineCurrency': 'CAD',
              'priceBreakdown': {
                'ridePrice': 160.0,
                'platformFee': 40.0,
                'marketplaceFee': 40.0,
                'taxes': 0.0,
                'total': 200.0,
                'currency': 'CAD',
              },
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.contains('/rating')) {
          return http.Response(
            jsonEncode([
              {'fromUserId': 'passenger-user-1', 'stars': 5}
            ]),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.contains('/rides/$rideId')) {
          return http.Response(
            jsonEncode({
              'id': rideId,
              'pickupAt': '2026-10-14T15:00:00.000Z',
              'fromLabel': '100 King St W',
              'toLabel': 'Pearson Terminal 1',
              'status': 'COMPLETED',
              'selectedOfferId': offerId,
              'currency': 'CAD',
              'offers': [
                {
                  'id': offerId,
                  'status': 'ACCEPTED',
                  'currency': 'CAD',
                  'bidAmount': 200,
                  'driver': {
                    'fullName': 'John Driver',
                  },
                  'vehicle': {
                    'brand': 'Toyota',
                    'model': 'Highlander',
                    'plate': '0SS52',
                    'vehicleClass': 'suv',
                  },
                  'presentation': {
                    'brand': 'Toyota',
                    'model': 'Highlander',
                    'plate': '0SS52',
                    'vehicleClass': 'suv',
                    'languages': ['EN'],
                    'priceBreakdown': {
                      'ridePrice': 160.0,
                      'platformFee': 40.0,
                      'marketplaceFee': 40.0,
                      'taxes': 0.0,
                      'total': 200.0,
                      'currency': 'CAD',
                    },
                    'rating': {
                      'overall': 5.0,
                      'count': 2,
                    },
                  },
                },
              ],
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          jsonEncode({}),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final session = CanGoSession(client: ApiClient(httpClient: mockHttpClient));
      final appState = AppState(session: session);
      appState.isAuthenticated = true;
      appState.me = {'id': 'passenger-user-1'};
      addTearDown(appState.dispose);

      final ride = RideRequest(
        id: rideId,
        datetimeLabel: 'Today, 2:00 PM',
        from: '100 King St W',
        to: 'Pearson Terminal 1',
        status: RideStatus.past,
        serverStatus: 'COMPLETED',
        selectedOfferId: offerId,
        currency: 'CAD',
      );

      appState.repo.rides.clear();
      appState.repo.rides.add(ride);

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

      // Verify normalization:
      expect(find.text('Toyota Highlander'), findsOneWidget);
      expect(find.text('0SS52'), findsOneWidget);
      expect(find.text('CA\$200'), findsNWidgets(2)); // Driver card fare ($200) and Payment summary Ride fare ($200)

      expect(find.text('Payment summary'), findsOneWidget);
      expect(find.text('Ride fare'), findsOneWidget);
      expect(find.text('Marketplace fee'), findsOneWidget);
      expect(find.text('CA\$40'), findsOneWidget);
      expect(find.text('Total paid'), findsOneWidget);
      expect(find.text('CA\$240'), findsOneWidget);
    },
  );
}
