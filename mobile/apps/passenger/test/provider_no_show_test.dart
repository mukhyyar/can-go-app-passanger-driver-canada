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

  group('Section 11: Provider Fails to Arrive - Models & Status Map', () {
    test(
      'rideFromServer accurately extracts originalDriver and originalDriverId',
      () {
        final json = {
          'id': 'ride-no-show-1',
          'status': 'BOOKED',
          'fromLabel': '100 King St W, Toronto',

          'toLabel': 'Toronto Pearson Airport',
          'pickupAt': DateTime.now()
              .subtract(const Duration(minutes: 40))
              .toIso8601String(),
          'isOverdue': true,
          'originalDriverId': 'driver-fail-1',
          'originalDriver': {
            'id': 'driver-fail-1',
            'fullName': 'Failed Provider John',
            'phoneE164': '+14165550199',
          },
        };

        final parsed = rideFromServer(json);

        expect(parsed.id, equals('ride-no-show-1'));
        expect(parsed.isOverdue, isTrue);
        expect(parsed.originalDriverId, equals('driver-fail-1'));
        expect(parsed.originalDriverName, equals('Failed Provider John'));
        expect(parsed.originalDriverPhone, equals('+14165550199'));
      },
    );
  });

  group('Section 11: Provider Fails to Arrive - RideDetailScreen UI', () {
    AppState createMockAppState({
      required String rideId,
      required String offerId,
      String? originalDriverName,
    }) {
      final mockHttpClient = MockClient((request) async {
        if (request.url.path.contains('/rides/$rideId')) {
          return http.Response(
            jsonEncode({
              'id': rideId,
              'status': 'BOOKED',
              'fromLabel': '100 King St W',
              'toLabel': 'Pearson Terminal 1',
              'pickupAt': DateTime.now()
                  .subtract(const Duration(minutes: 45))
                  .toIso8601String(),
              'isOverdue': true,
              'selectedOfferId': offerId,
              'currency': 'CAD',
              'originalDriverId': originalDriverName != null
                  ? 'driver-orig-1'
                  : null,
              'originalDriver': originalDriverName != null
                  ? {
                      'id': 'driver-orig-1',
                      'fullName': originalDriverName,
                      'phoneE164': '+14165550199',
                    }
                  : null,
              'offers': [
                {
                  'id': offerId,
                  'rideId': rideId,
                  'driverId': 'driver-replacement-2',
                  'bidAmount': 100.0,
                  'presentation': {
                    'driverName': 'Replacement Driver Alex',
                    'rating': 4.9,
                    'ratingCount': 25,
                    'vehicleClass': 'Sedan',
                    'color': 'Black',
                    'plate': 'CAN999',
                    'price': 120.0,
                    'currency': 'CAD',
                  },
                },
              ],
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{}',
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final session = CanGoSession(
        client: ApiClient(httpClient: mockHttpClient),
      );
      final app = AppState(session: session);
      app.isAuthenticated = true;
      app.me = {'id': 'passenger-user-1'};
      return app;
    }

    testWidgets(
      'displays overdue banner with Contact, Find Replacement, and Cancel & 100% Refund actions, plus original provider badge',
      (tester) async {
        tester.view.physicalSize = const Size(1080, 2400);
        tester.view.devicePixelRatio = 2.0;
        addTearDown(() => tester.view.resetPhysicalSize());

        const rideId = 'ride-no-show-123';
        const offerId = 'offer-replacement-1';
        final appState = createMockAppState(
          rideId: rideId,
          offerId: offerId,
          originalDriverName: 'Original Failing Driver John',
        );
        addTearDown(appState.dispose);

        final ride = RideRequest(
          id: rideId,
          datetimeLabel: 'Today, 2:00 PM',
          from: '100 King St W',
          to: 'Pearson Terminal 1',
          status: RideStatus.booked,
          serverStatus: 'BOOKED',
          selectedOfferId: offerId,
          currency: 'CAD',
          isOverdue: true,
          originalDriverId: 'driver-orig-1',
          originalDriverName: 'Original Failing Driver John',
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

        // 1. Verify overdue / failure to arrive banner
        expect(find.text('Provider delayed / Has not arrived'), findsOneWidget);
        expect(find.text('Contact Provider (Chat)'), findsOneWidget);
        expect(find.text('Find Replacement'), findsOneWidget);
        expect(find.text('Cancel & 100% Refund'), findsOneWidget);

        // 2. Verify original provider retention badge in history
        expect(
          find.text(
            'Original Provider: Original Failing Driver John (Failed to arrive · Replaced)',
          ),
          findsOneWidget,
        );
      },
    );
  });
}
