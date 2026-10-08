import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:driver/screens/trip_detail_screen.dart';
import 'package:driver/state/app_state.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });

  DriverRequest createTestTrip({required String id, required String status}) {
    return driverRequestFromServer({
      'id': id,
      'fromLabel': '100 Queen St W',
      'toLabel': 'Pearson Airport',
      'pickupAt': '2026-09-28T20:30:00.000Z',
      'status': status,
      'isRoundTrip': false,
      'adults': 1,
      'currency': 'CAD',
      'vehicleClassIds': ['Economy'],
      'priceSnapshot': {
        'distanceKm': 25,
        'durationMin': 30,
        'guidanceAmount': 50,
        'minBid': 30,
        'maxBid': 80,
        'platformCommissionPct': 15,
      },
    });
  }

  testWidgets(
    'Driver can open report bottomsheet with passenger predefined options and submit',
    (tester) async {
      tester.view.physicalSize = const Size(800, 1400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      bool reportEndpointCalled = false;
      List<dynamic> submittedReasons = [];
      String? submittedDetails;

      final mockClient = MockClient((request) async {
        if (request.url.path.contains('/rides/trip-rep-1/reports') &&
            request.method == 'POST') {
          reportEndpointCalled = true;
          final body = jsonDecode(request.body) as Map<String, dynamic>;
          submittedReasons = body['reasons'] as List<dynamic>;
          submittedDetails = body['details'] as String?;
          return http.Response(
            jsonEncode({'success': true, 'caseId': 'case-123'}),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.contains('/auth/me')) {
          return http.Response(
            jsonEncode({
              'id': 'drv-1',
              'phone': '+14165551234',
              'role': 'DRIVER',
              'fullName': 'Test Driver',
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.contains('/payment-status')) {
          return http.Response(
            jsonEncode({
              'status': 'ACTIVE',
              'hasPaymentMethod': true,
              'hasCompletedTrip': true,
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{"ok": true}', 200, headers: {'content-type': 'application/json'});
      });

      final session = CanGoSession(
        client: ApiClient(
          baseUrl: 'https://test.example.com',
          httpClient: mockClient,
        ),
      );
      final appState = AppState(api: session);
      appState.hasSeenWelcome = true;
      appState.loaded = true;
      final trip = createTestTrip(id: 'trip-rep-1', status: 'TRIP_STARTED');
      appState.openRequests = [trip];

      final router = GoRouter(
        initialLocation: '/trip/trip-rep-1',
        routes: [
          GoRoute(
            path: '/trip/:rideId',
            builder: (_, state) => TripDetailScreen(
              rideId: state.pathParameters['rideId']!,
            ),
          ),
          GoRoute(
            path: '/',
            builder: (_, __) => const Scaffold(body: Text('Main Screen')),
          ),
        ],
      );

      await tester.pumpWidget(
        ChangeNotifierProvider.value(
          value: appState,
          child: MaterialApp.router(
            routerConfig: router,
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Find "Report an issue" button
      final reportBtn = find.text('Report an issue');
      expect(reportBtn, findsOneWidget);

      await tester.tap(reportBtn);
      await tester.pumpAndSettle();

      // Verify report bottomsheet with passenger predefined options
      expect(find.text('Something wrong? Choose an issue:'), findsOneWidget);
      expect(find.text('Can\'t find the rider'), findsOneWidget);
      expect(find.text('Nowhere to stop'), findsOneWidget);
      expect(find.text('Rider\'s items don\'t fit'), findsOneWidget);
      expect(find.text('Too many riders'), findsOneWidget);

      // Select predefined reason (this now auto-submits for passengers)
      await tester.tap(find.text('Rider behaviour'));
      await tester.pumpAndSettle();

      // We don't have details text field or submit button anymore for passengers.
      // After it auto-submits, the sheet should be gone.

      expect(reportEndpointCalled, isTrue);
      expect(submittedReasons, contains('Rider behaviour'));
      expect(submittedDetails == null || submittedDetails == '', isTrue);
      expect(find.textContaining('Report submitted'), findsOneWidget);
    },
  );
}
