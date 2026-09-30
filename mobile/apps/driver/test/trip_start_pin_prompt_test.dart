import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:driver/screens/trip_detail_screen.dart';
import 'package:driver/state/app_state.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

class MockDriverAppState extends AppState {
  String? lastPinSent;
  bool shouldFailPin = false;
  int tripStartCallCount = 0;

  @override
  Future<Map<String, dynamic>> tripStart(String rideId, {String? pin}) async {
    tripStartCallCount++;
    lastPinSent = pin;
    if (shouldFailPin) {
      throw Exception('Invalid ride PIN. Please ask the passenger for their 4-digit ride PIN.');
    }
    return {'id': rideId, 'status': 'TRIP_STARTED'};
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  DriverRequest createArrivedTrip({required String id}) {
    return driverRequestFromServer({
      'id': id,
      'fromLabel': '100 Queen St W',
      'toLabel': 'Pearson Airport',
      'pickupAt': '2026-09-28T20:30:00.000Z',
      'status': 'DRIVER_ARRIVED',
      'isRoundTrip': false,
      'adults': 1,
      'currency': 'CAD',
      'vehicleClassIds': ['Economy'],
      'priceSnapshot': {
        'distanceKm': 25,
        'durationMin': 30,
        'guidanceAmount': 50,
      },
    });
  }

  testWidgets('When driver taps "Start trip", it prompts for 4-digit PIN', (tester) async {
    final appState = MockDriverAppState();
    appState.hasSeenWelcome = true;
    appState.loaded = true;

    final trip = createArrivedTrip(id: 'ride-999');
    appState.openRequests = [trip];

    await tester.pumpWidget(
      ChangeNotifierProvider<AppState>.value(
        value: appState,
        child: const MaterialApp(
          home: TripDetailScreen(rideId: 'ride-999'),
        ),
      ),
    );

    await tester.pumpAndSettle();

    // Verify "Start trip" button is visible
    final startBtn = find.text('Start trip');
    expect(startBtn, findsOneWidget);

    // Tap "Start trip"
    await tester.tap(startBtn);
    await tester.pumpAndSettle();

    // Verify PIN sheet is displayed
    expect(find.text('Enter Ride PIN'), findsOneWidget);
    expect(find.text('Ask the passenger for their 4-digit PIN'), findsOneWidget);
    expect(find.text('Start ride'), findsOneWidget);

    // Test entering wrong PIN
    appState.shouldFailPin = true;
    final pinInput = find.byType(TextField);
    expect(pinInput, findsOneWidget);

    await tester.enterText(pinInput, '0000');
    await tester.pumpAndSettle();

    final verifyBtn = find.text('Start ride');
    await tester.tap(verifyBtn);
    await tester.pumpAndSettle();

    expect(appState.lastPinSent, equals('0000'));
    expect(
      find.text('Incorrect PIN. Please ask the passenger for their 4-digit ride PIN.'),
      findsOneWidget,
    );
    // Sheet remains open
    expect(find.text('Enter Ride PIN'), findsOneWidget);

    // Test entering correct PIN
    appState.shouldFailPin = false;
    await tester.enterText(pinInput, '4821');
    await tester.pumpAndSettle();

    expect(appState.lastPinSent, equals('4821'));
    // Sheet is now dismissed
    expect(find.text('Enter Ride PIN'), findsNothing);
  });
}
