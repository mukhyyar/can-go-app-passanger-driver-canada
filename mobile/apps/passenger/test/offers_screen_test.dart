import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:passenger/screens/offer_detail_screen.dart';
import 'package:passenger/screens/offers_screen.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

class TestAppState extends AppState {
  TestAppState({required this.testOffers});
  final List<Offer> testOffers;

  @override
  List<Offer> offersFor(String rideId) => testOffers;

  @override
  Future<Offer?> fetchOffer(String rideId, String offerId) async {
    return testOffers.firstWhere((o) => o.id == offerId, orElse: () => testOffers.first);
  }

  @override
  Future<RideRequest?> refreshRide(String rideId) async => RideRequest(
        id: rideId,
        datetimeLabel: 'Today, 2:00 PM',
        from: 'Toronto Pearson Airport',
        to: 'Downtown Toronto',
        status: RideStatus.chooseOffer,
        offerCount: testOffers.length,
      );

  @override
  RideRequest? rideById(String id) => RideRequest(
        id: id,
        datetimeLabel: 'Today, 2:00 PM',
        from: 'Toronto Pearson Airport',
        to: 'Downtown Toronto',
        status: RideStatus.chooseOffer,
        offerCount: testOffers.length,
        isRoundTrip: true,
        returnLabel: 'Tomorrow at 10:00 AM',
      );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });

  group('Offers Screens Stability Tests', () {
    testWidgets('OffersScreen renders safely with unknown vehicleClass and null imageUrl', (tester) async {
      final offer = Offer(
        id: 'offer-unknown',
        vehicleBrand: 'Honda',
        vehicleModel: 'Civic',
        vehicleClass: 'non_existent_class',
        price: 50.0,
        currency: 'CAD',
        rating: 4.5,
        ratingCount: 5,
        rides: 10,
        options: const [],
        languages: const ['EN'],
        carrierId: 'c1',
        passengers: 4,
        imageUrl: null,
        images: const [],
      );

      final app = TestAppState(testOffers: [offer]);

      Object? caughtError;
      FlutterError.onError = (details) {
        caughtError = details.exception;
      };

      await tester.pumpWidget(
        ChangeNotifierProvider<AppState>.value(
          value: app,
          child: const MaterialApp(
            home: OffersScreen(rideId: 'ride-1'),
          ),
        ),
      );

      expect(caughtError, isNull, reason: 'OffersScreen must not crash when asset is null');
      expect(find.byType(OffersScreen), findsOneWidget);
      expect(find.text('DETAILS'), findsOneWidget);
    });

    testWidgets('OfferDetailScreen renders safely when pending realtime event is present', (tester) async {
      final offer = Offer(
        id: 'offer-1',
        vehicleBrand: 'Toyota',
        vehicleModel: 'Camry',
        vehicleClass: 'sedan',
        price: 60.0,
        currency: 'CAD',
        rating: 4.9,
        ratingCount: 20,
        rides: 100,
        options: const ['Wi-Fi'],
        languages: const ['EN'],
        carrierId: 'c1',
        passengers: 4,
        imageUrl: null,
        images: const [],
      );

      final app = TestAppState(testOffers: [offer]);
      app.pendingOfferEventType = 'offer.updated';
      app.pendingOfferEventRideId = 'ride-1';
      app.pendingOfferEventOfferId = 'offer-1';

      Object? caughtError;
      FlutterError.onError = (details) {
        caughtError = details.exception;
      };

      await tester.pumpWidget(
        ChangeNotifierProvider<AppState>.value(
          value: app,
          child: const MaterialApp(
            home: OfferDetailScreen(rideId: 'ride-1', offerId: 'offer-1'),
          ),
        ),
      );

      expect(caughtError, isNull, reason: 'OfferDetailScreen must not call notifyListeners during build phase');
      expect(find.byType(OfferDetailScreen), findsOneWidget);
    });
  });
}
