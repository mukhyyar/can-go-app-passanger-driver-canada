import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:provider/provider.dart';
import 'package:driver/offer/offer_helpers.dart';
import 'package:driver/screens/offer_review_screen.dart';
import 'package:driver/state/app_state.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('OfferReviewScreen displays 20% marketplace fee deducted and YOU WILL RECEIVE', (tester) async {
    final state = AppState();
    const req = DriverRequest(
      id: 'ride-123',
      datetimeLabel: 'Fri 30 Oct, 07:31',
      from: 'Mahogany Peoples Pharmacy',
      to: 'Calgary International Airport',
      distance: '26.32 km',
      duration: '~ 53 min',
      vehicleNeed: 'sedan',
      passengers: 1,
      currency: 'CAD',
    );
    final draft = OfferDraft(
      outboundPrice: 50,
      validForSeconds: 12 * 3600,
    );
    const vehicle = DriverVehicle(
      id: 'v1',
      name: 'City',
      plate: 'ANZ892',
      vehicleClass: 'sedan',
    );

    await tester.pumpWidget(
      ChangeNotifierProvider<AppState>.value(
        value: state,
        child: MaterialApp(
          home: OfferReviewScreen(
            request: req,
            draft: draft,
            vehicle: vehicle,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Verify Cost breakdown Card
    expect(find.text('Cost breakdown'), findsOneWidget);
    expect(find.text('Your offered fare'), findsOneWidget);
    expect(find.text('CA\$50'), findsOneWidget);

    // Verify 20% marketplace fee deducted (-CA$10, NOT CA$12)
    expect(find.text('Marketplace fee (20%)'), findsOneWidget);
    expect(find.text('-CA\$10'), findsOneWidget);
    expect(find.text('Deducted from your offer'), findsOneWidget);
    expect(find.text('CA\$12'), findsNothing);

    // Verify "YOU WILL RECEIVE" with CA$40 (NOT "Total customer fare" or CA$72)
    expect(find.text('YOU WILL RECEIVE'), findsOneWidget);
    expect(find.text('CA\$40'), findsOneWidget);
    expect(find.text('Total customer fare'), findsNothing);
    expect(find.text('CUSTOMER WILL PAY'), findsNothing);
    expect(find.text('CA\$72'), findsNothing);
  });
}
