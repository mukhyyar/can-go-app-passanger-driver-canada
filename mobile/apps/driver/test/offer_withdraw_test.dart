import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:driver/screens/request_detail_screen.dart';
import 'package:driver/state/app_state.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  DriverRequest createTestRequest({required String id, bool hasOffer = false}) {
    return driverRequestFromServer({
      'id': id,
      'fromLabel': '100 Queen St W',
      'toLabel': 'Toronto Pearson Airport',
      'pickupAt': '2026-09-28T20:30:00.000Z',
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
      'myOffers': hasOffer
          ? [
              {
                'id': 'offer_$id',
                'status': 'ACTIVE',
                'bidAmount': '50',
                'outboundPrice': '50',
                'currency': 'CAD',
                'validForSeconds': '1800',
              }
            ]
          : [],
    });
  }

  testWidgets('request without offer shows Skip button and does not show Withdraw offer',
      (tester) async {
    final appState = AppState();
    appState.hasSeenWelcome = true;
    appState.loaded = true;
    final req = createTestRequest(id: 'no_offer_req', hasOffer: false);
    appState.openRequests = [req];

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: appState,
        child: const MaterialApp(
          home: RequestDetailScreen(requestId: 'no_offer_req'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Skip button should exist
    expect(find.text('Skip'), findsOneWidget);
    expect(find.byIcon(Icons.skip_next), findsOneWidget);

    // Withdraw offer button should NOT exist
    expect(find.text('Withdraw offer'), findsNothing);
  });

  testWidgets('offered ride hides Skip button and shows bottom OutlinedButton for Withdraw offer',
      (tester) async {
    final appState = AppState();
    appState.hasSeenWelcome = true;
    appState.loaded = true;
    final req = createTestRequest(id: 'offered_req', hasOffer: true);
    appState.openRequests = [req];

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: appState,
        child: const MaterialApp(
          home: RequestDetailScreen(requestId: 'offered_req'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Skip button should NOT exist on offered ride
    expect(find.text('Skip'), findsNothing);
    expect(find.byIcon(Icons.skip_next), findsNothing);

    // Withdraw offer should be rendered as an OutlinedButton at the bottom
    final withdrawBtn = find.widgetWithText(OutlinedButton, 'Withdraw offer');
    await tester.scrollUntilVisible(
      withdrawBtn,
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();

    expect(withdrawBtn, findsOneWidget);

    // Tap it to verify dialog confirmation appears
    await tester.tap(withdrawBtn);
    await tester.pumpAndSettle();

    // Confirmation dialog should be displayed
    expect(find.text('Withdraw this offer?'), findsOneWidget);
    expect(find.text('Keep offer'), findsOneWidget);
    expect(find.text('Withdraw'), findsOneWidget);
  });
}
