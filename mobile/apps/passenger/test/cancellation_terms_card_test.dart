import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_api/gt_api.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:passenger/screens/payment_screen.dart';
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
      'PaymentScreen displays structured Cancellation Terms card before payment',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final mockHttpClient = MockClient((request) async {
      final path = request.url.path;
      if (path.contains('/payments/quote')) {
        return http.Response(
          jsonEncode({
            'paymentQuote': {
              'totalAmount': 100.0,
              'onlineAmount': 100.0,
              'cashAmount': 0.0,
              'totalCurrency': 'CAD',
              'currency': 'CAD',
              'paymentMode': 'FULL',
              'partialEnabled': false,
              'onlinePct': 100,
            },
            'paymentMethods': ['CARD'],
            'cancellationPolicy': {
              'title': 'Cancellation Terms',
              'body':
                  'Cancellation fee and eligible refund depend on how far in advance you cancel.',
              'tiers': [
                {
                  'tierKey': 'GT_24H',
                  'name': 'More than 24 hours before pickup',
                  'windowLabel': 'More than 24 hours before pickup',
                  'refundLabel': 'Full eligible refund',
                  'passengerDisplayTerms':
                      'Cancellations made more than 24 hours before pickup receive a full eligible refund.',
                  'passengerRefundType': 'PERCENTAGE',
                  'passengerRefundValue': 100,
                  'feeTreatment': 'REFUND_TO_PASSENGER',
                },
                {
                  'tierKey': 'BETWEEN_12_24H',
                  'name': '12–24 hours before pickup',
                  'windowLabel': '12–24 hours before pickup',
                  'refundLabel': 'Partial refund',
                  'passengerDisplayTerms':
                      'Cancellations made between 12 and 24 hours before pickup receive a partial refund.',
                  'passengerRefundType': 'PERCENTAGE',
                  'passengerRefundValue': 50,
                  'feeTreatment': 'RETAIN_BY_PLATFORM',
                },
                {
                  'tierKey': 'LT_12H',
                  'name': 'Less than 12 hours before pickup',
                  'windowLabel': 'Less than 12 hours before pickup',
                  'refundLabel': 'Cancellation fee may apply',
                  'passengerDisplayTerms':
                      'Cancellations made less than 12 hours before pickup are subject to a cancellation fee.',
                  'passengerRefundType': 'PERCENTAGE',
                  'passengerRefundValue': 0,
                  'feeTreatment': 'RETAIN_BY_PLATFORM',
                },
                {
                  'tierKey': 'DRIVER_ARRIVED_NO_SHOW',
                  'name': 'Driver arrived + waiting period expired',
                  'windowLabel': 'Driver arrived + waiting period expired',
                  'refundLabel': 'May become No-Show',
                  'passengerDisplayTerms':
                      'If the driver has arrived and the waiting period has expired, this booking may be treated as a No-Show.',
                  'passengerRefundType': 'PERCENTAGE',
                  'passengerRefundValue': 0,
                  'feeTreatment': 'RETAIN_BY_PLATFORM',
                },
              ],
            },
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (path.contains('/rides/')) {
        return http.Response(
          jsonEncode({
            'id': 'ride-cancellation-test',
            'status': 'WAITING_FOR_OFFERS',
            'fromLabel': 'Downtown',
            'toLabel': 'Airport',
            'pickupAt': '2026-10-22T20:00:00.000Z',
            'currency': 'CAD',
            'offers': [
              {
                'id': 'offer-cancellation-test',
                'bidAmount': 100.0,
                'price': 100.0,
                'status': 'ACTIVE',
                'driver': {
                  'fullName': 'Driver One',
                  'vehicleModel': 'Toyota Camry',
                },
                'expiresAt':
                    DateTime.now().add(const Duration(minutes: 30)).toIso8601String(),
              },
            ],
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('{}', 200);
    });

    final session = CanGoSession(
      baseUrl: 'https://api.test',
      client: ApiClient(
        baseUrl: 'https://api.test',
        httpClient: mockHttpClient,
      ),
    );
    final app = AppState(session: session);
    app.isAuthenticated = true;

    await tester.pumpWidget(
      ChangeNotifierProvider<AppState>.value(
        value: app,
        child: const MaterialApp(
          home: PaymentScreen(
            rideId: 'ride-cancellation-test',
            offerId: 'offer-cancellation-test',
          ),
        ),
      ),
    );

    // Initial load frame
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pumpAndSettle();

    // Verify cancellation policy card and terms are displayed before payment
    expect(find.text('Cancellation Terms & Refund Policy'), findsOneWidget);
    expect(find.text('More than 24 hours before pickup'), findsOneWidget);
    expect(find.text('Full eligible refund'), findsOneWidget);
    expect(find.text('12–24 hours before pickup'), findsOneWidget);
    expect(find.text('Partial refund'), findsOneWidget);
    expect(find.text('Less than 12 hours before pickup'), findsOneWidget);
    expect(find.text('Cancellation fee may apply'), findsOneWidget);
    expect(find.text('Driver arrived + waiting period expired'), findsOneWidget);
    expect(find.text('May become No-Show'), findsOneWidget);

    // Verify checkbox is still present and links to acceptance
    expect(
      find.text('I accept the terms of service and cancellation policy'),
      findsOneWidget,
    );
  });
}
