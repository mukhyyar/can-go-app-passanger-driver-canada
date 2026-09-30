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

  testWidgets('PaymentScreen displays Pay in full and removes cash payment option',
      (tester) async {
    final mockHttpClient = MockClient((request) async {
      final path = request.url.path;
      if (path.contains('/payments/quote')) {
        return http.Response(
          jsonEncode({
            'paymentQuote': {
              'totalAmount': 72.0,
              'onlineAmount': 72.0,
              'cashAmount': 0.0,
              'totalCurrency': 'CAD',
              'currency': 'CAD',
              'paymentMode': 'FULL',
              'partialEnabled': false,
              'onlinePct': 100,
            },
            'paymentMethods': ['CARD'],
            'cancellationPolicy':
                'The ride is not refundable in case of cancellation.',
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (path.contains('/rides/')) {
        return http.Response(
          jsonEncode({
            'id': 'ride-test-1',
            'status': 'WAITING_FOR_OFFERS',
            'fromLabel': 'Downtown',
            'toLabel': 'Airport',
            'pickupAt': '2026-09-28T20:00:00.000Z',
            'currency': 'CAD',
            'offers': [
              {
                'id': 'offer-test-1',
                'bidAmount': 60.0,
                'price': 72.0,
                'status': 'ACTIVE',
                'driver': {
                  'fullName': 'Driver One',
                  'vehicleModel': 'Toyota Camry',
                },
              }
            ],
          }),
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
            rideId: 'ride-test-1',
            offerId: 'offer-test-1',
          ),
        ),
      ),
    );

    // Let the async quote load settle
    await tester.pumpAndSettle();

    // Verify 'Pay in full' is displayed
    expect(find.text('Pay in full'), findsOneWidget);

    // Verify 'Part now, rest in cash' is NOT displayed
    expect(find.text('Part now, rest in cash'), findsNothing);
    expect(find.textContaining('is paid in cash to the driver'), findsNothing);
  });
}
