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
    double? initialTip,
    void Function(Map<String, dynamic> tipBody)? onTipCalled,
  }) {
    var tipAmount = initialTip;
    final mockHttpClient = MockClient((request) async {
      if (request.url.path.endsWith('/tip')) {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        onTipCalled?.call(body);
        tipAmount = (body['amount'] as num).toDouble();
        return http.Response(
          jsonEncode({
            'success': true,
            'tipAmount': tipAmount,
            'paymentStatus': 'succeeded',
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (request.url.path.endsWith('/payment-status')) {
        return http.Response(
          jsonEncode({
            'status': 'PAID',
            'totalAmount': 50.0,
            'onlineCurrency': 'CAD',
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
            'pickupAt': '2026-09-29T15:00:00.000Z',
            'fromLabel': '100 King St W',
            'toLabel': 'Pearson Terminal 1',
            'status': 'COMPLETED',
            'driverId': 'driver-123',
            'driverName': 'John Driver',
            'price': 50.0,
            'tipAmount': tipAmount,
            'offers': [],
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

  group('Ride Detail Driver Tipping Tests (Passenger)', () {
    testWidgets('Completed ride shows Tip driver button and opening sheet displays presets', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 2.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      Map<String, dynamic>? capturedTip;
      final appState = createMockAppState(
        rideId: 'ride-tip-1',
        onTipCalled: (body) => capturedTip = body,
      );
      addTearDown(appState.dispose);
      await tester.pump(const Duration(milliseconds: 100));

      final ride = RideRequest(
        id: 'ride-tip-1',
        datetimeLabel: 'Today, 3:00 PM',
        from: '100 King St W',
        to: 'Pearson Terminal 1',
        status: RideStatus.past,
        serverStatus: 'COMPLETED',
      );
      appState.isAuthenticated = true;
      appState.me = {'id': 'passenger-user-1'};
      appState.repo.rides.clear();
      appState.repo.rides.add(ride);

      await tester.pumpWidget(
        MaterialApp(
          home: ChangeNotifierProvider<AppState>.value(
            value: appState,
            child: const RideDetailScreen(rideId: 'ride-tip-1'),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Find "Tip driver" button
      final tipButton = find.text('Tip driver');
      expect(tipButton, findsOneWidget);

      // Tap "Tip driver"
      await tester.tap(tipButton);
      await tester.pumpAndSettle();

      // Modal bottomsheet appears
      expect(find.text('Tip your driver'), findsOneWidget);
      expect(
        find.text('100% of your tip goes to your driver. Thank you for your support!'),
        findsOneWidget,
      );
      expect(find.text('Payment processed securely through Stripe'), findsOneWidget);
      expect(find.text(r'$2'), findsOneWidget);
      expect(find.text(r'$5'), findsOneWidget);
      expect(find.text(r'$10'), findsOneWidget);
      expect(find.text(r'$15'), findsOneWidget);
      expect(find.text('Pay CA\$5.00 tip'), findsOneWidget);

      // Tap preset chip $10
      await tester.tap(find.text(r'$10'));
      await tester.pumpAndSettle();

      expect(find.text('Pay CA\$10.00 tip'), findsOneWidget);

      // Submit tip
      await tester.tap(find.text('Pay CA\$10.00 tip'));
      await tester.pumpAndSettle();

      // Check request was made
      expect(capturedTip, isNotNull);
      expect(capturedTip!['amount'], equals(10.0));

      // After tip succeeded, bottomsheet dismissed, "You tipped $10.00" badge is displayed
      expect(find.text('Tip your driver'), findsNothing);
      expect(find.textContaining('You tipped \$10.00'), findsOneWidget);
    });

    testWidgets('Ride already tipped displays tip badge and payment summary line item', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 2.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      final appState = createMockAppState(
        rideId: 'ride-already-tipped',
        initialTip: 5.0,
      );
      addTearDown(appState.dispose);
      await tester.pump(const Duration(milliseconds: 100));

      final ride = RideRequest(
        id: 'ride-already-tipped',
        datetimeLabel: 'Today, 2:00 PM',
        from: '100 King St W',
        to: 'Pearson Terminal 1',
        status: RideStatus.past,
        serverStatus: 'COMPLETED',
        tipAmount: 5.0,
      );
      appState.isAuthenticated = true;
      appState.me = {'id': 'passenger-user-1'};
      appState.repo.rides.clear();
      appState.repo.rides.add(ride);

      await tester.pumpWidget(
        MaterialApp(
          home: ChangeNotifierProvider<AppState>.value(
            value: appState,
            child: const RideDetailScreen(rideId: 'ride-already-tipped'),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // "Tip driver" button is NOT shown, but "You tipped $5.00" badge is shown
      expect(find.text('Tip driver'), findsNothing);
      expect(find.textContaining('You tipped \$5.00'), findsOneWidget);

      // Payment summary shows tip
      expect(find.text('Tip (to driver)'), findsOneWidget);
      expect(find.text('CA\$5'), findsOneWidget);
    });
  });
}
