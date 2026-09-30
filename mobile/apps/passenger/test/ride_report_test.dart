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

  group('Passenger Ride Reporting Tests', () {
    testWidgets('Tapping Report an issue opens report sheet with predefined options and submits',
        (tester) async {
      tester.view.physicalSize = const Size(800, 2000);
      addTearDown(() => tester.view.resetPhysicalSize());
      List<String>? reportedReasons;
      String? reportedDetails;

      final mockHttpClient = MockClient((request) async {
        if (request.url.path.endsWith('/reports')) {
          final body = jsonDecode(request.body) as Map<String, dynamic>;
          reportedReasons = (body['reasons'] as List?)?.cast<String>();
          reportedDetails = body['details']?.toString();
          return http.Response(
            jsonEncode({'ok': true, 'caseId': 'case-123'}),
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
        if (request.url.path.contains('/rating')) {
          return http.Response(
            jsonEncode([{'fromUserId': 'passenger-user-1', 'stars': 5}]),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.contains('/auth/me')) {
          return http.Response(
            jsonEncode({'id': 'passenger-user-1', 'email': 'passenger@example.com'}),
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
              'id': 'ride-report-test',
              'pickupAt': '2026-10-01T10:00:00.000Z',
              'fromLabel': 'Union Station',
              'toLabel': 'Pearson Terminal 1',
              'status': 'COMPLETED',
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
      final appState = AppState(session: session);
      addTearDown(appState.dispose);
      await tester.pump(const Duration(milliseconds: 100));
      appState.isAuthenticated = true;
      appState.me = {'id': 'passenger-user-1'};

      final ride = RideRequest(
        id: 'ride-report-test',
        datetimeLabel: 'Today, 10:00 AM',
        from: 'Union Station',
        to: 'Pearson Terminal 1',
        status: RideStatus.past,
        serverStatus: 'COMPLETED',
      );
      appState.repo.rides.clear();
      appState.repo.rides.add(ride);

      await tester.pumpWidget(
        MaterialApp(
          home: ChangeNotifierProvider<AppState>.value(
            value: appState,
            child: const RideDetailScreen(rideId: 'ride-report-test'),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Scroll to and tap "Report an issue" button
      await tester.scrollUntilVisible(
        find.text('Report an issue'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Report an issue'));
      await tester.pumpAndSettle();

      // Report bottom sheet is visible
      expect(find.text('Report this ride'), findsOneWidget);
      expect(find.text('Select what went wrong:'), findsOneWidget);
      expect(find.text('Dangerous / Reckless driving'), findsOneWidget);
      expect(find.text('Distracted driving / Phone use'), findsOneWidget);

      // Select predefined reason
      await tester.tap(find.text('Dangerous / Reckless driving'));
      await tester.pumpAndSettle();

      // Enter additional details
      await tester.enterText(
        find.widgetWithText(TextField, 'Additional details or context (optional)'),
        'Driver was constantly speeding and tailgating.',
      );
      await tester.pumpAndSettle();

      // Submit
      await tester.ensureVisible(find.text('Submit report'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Submit report'));
      await tester.pumpAndSettle();

      expect(reportedReasons, contains('Dangerous / Reckless driving'));
      expect(reportedDetails, 'Driver was constantly speeding and tailgating.');
      expect(
        find.text('Report submitted. Admin notified & support chat enabled.'),
        findsOneWidget,
      );
      expect(find.text('Open Chat'), findsOneWidget);
    });
  });
}
