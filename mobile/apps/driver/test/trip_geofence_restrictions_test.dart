import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:driver/screens/trip_detail_screen.dart';
import 'package:driver/state/app_state.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

class MockGeofenceAppState extends AppState {
  String? lastPinSent;
  double? lastLatSent;
  double? lastLngSent;
  bool forceEarlyDropoffSent = false;
  int tripStartCalls = 0;
  int tripCompleteCalls = 0;

  @override
  Future<Map<String, dynamic>> tripStart(
    String rideId, {
    String? pin,
    double? lat,
    double? lng,
  }) async {
    tripStartCalls++;
    lastPinSent = pin;
    lastLatSent = lat;
    lastLngSent = lng;
    return {'id': rideId, 'status': 'TRIP_STARTED'};
  }

  @override
  Future<Map<String, dynamic>> tripComplete(
    String rideId, {
    double? lat,
    double? lng,
    bool? forceEarlyDropoff,
    String? earlyDropoffReason,
  }) async {
    tripCompleteCalls++;
    lastLatSent = lat;
    lastLngSent = lng;
    forceEarlyDropoffSent = forceEarlyDropoff ?? false;
    return {'id': rideId, 'status': 'COMPLETED'};
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  DriverRequest createArrivedTripWithCoords({
    required String id,
    required double fromLat,
    required double fromLng,
  }) {
    return driverRequestFromServer({
      'id': id,
      'fromLabel': '100 Queen St W',
      'toLabel': 'Pearson Airport',
      'fromLat': fromLat,
      'fromLng': fromLng,
      'toLat': 43.6777,
      'toLng': -79.6248,
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

  testWidgets('Allows opening Start Trip PIN sheet when ride is in DRIVER_ARRIVED',
      (tester) async {
    final appState = MockGeofenceAppState();
    appState.hasSeenWelcome = true;
    appState.loaded = true;

    final trip = createArrivedTripWithCoords(
      id: 'ride-geo-999',
      fromLat: 43.6535,
      fromLng: -79.3839,
    );
    appState.openRequests = [trip];

    await tester.pumpWidget(
      ChangeNotifierProvider<AppState>.value(
        value: appState,
        child: const MaterialApp(
          home: TripDetailScreen(rideId: 'ride-geo-999'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final startBtn = find.text('Start trip');
    expect(startBtn, findsOneWidget);
    await tester.tap(startBtn);
    await tester.pumpAndSettle();

    // Verify PIN sheet is displayed with headers
    expect(find.text('Enter Ride PIN'), findsOneWidget);
    expect(find.text('Ask the passenger for their 4-digit PIN'), findsOneWidget);
    expect(find.text('Start ride'), findsOneWidget);

    // Close the sheet and advance timer to avoid pending timers
    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 5));
  });
}
