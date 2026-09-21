import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/screens/offer_detail_screen.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

final kTransparentImage = Uint8List.fromList(<int>[
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D,
  0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42,
  0x60, 0x82,
]);

class _TestHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) => _MockHttpClient();
}

class _MockHttpClient extends Fake implements HttpClient {
  @override
  Future<HttpClientRequest> getUrl(Uri url) async => _MockHttpClientRequest();
}

class _MockHttpClientRequest extends Fake implements HttpClientRequest {
  @override
  final HttpHeaders headers = _MockHttpHeaders();

  @override
  Future<HttpClientResponse> close() async => _MockHttpClientResponse();
}

class _MockHttpHeaders extends Fake implements HttpHeaders {
  @override
  void add(String name, Object value, {bool preserveHeaderCase = false}) {}
  @override
  void set(String name, Object value, {bool preserveHeaderCase = false}) {}
}

class _MockHttpClientResponse extends Fake implements HttpClientResponse {
  @override
  int get statusCode => 200;

  @override
  int get contentLength => kTransparentImage.length;

  @override
  HttpClientResponseCompressionState get compressionState =>
      HttpClientResponseCompressionState.notCompressed;

  @override
  StreamSubscription<List<int>> listen(void Function(List<int> event)? onData,
      {Function? onError, void Function()? onDone, bool? cancelOnError}) {
    return Stream<List<int>>.fromIterable([kTransparentImage]).listen(
      onData,
      onError: onError,
      onDone: onDone,
      cancelOnError: cancelOnError,
    );
  }
}

class _TestAppState extends AppState {
  _TestAppState({required this.stubOffer});

  final Offer stubOffer;

  @override
  bool get isAuthenticated => true;

  @override
  Future<RideRequest?> refreshRide(String rideId) async => null;

  @override
  Future<Offer?> fetchOffer(String rideId, String offerId) async => stubOffer;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    HttpOverrides.global = _TestHttpOverrides();
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });

  group('Vehicle Images in Offers and Notifications', () {
    test('Offer model extracts all images and uses first as primary', () {
      const offer = Offer(
        id: 'offer-xyz',
        vehicleBrand: 'Toyota',
        vehicleModel: 'Camry',
        vehicleClass: 'comfort',
        price: 45.0,
        currency: 'CAD',
        rating: 4.9,
        ratingCount: 20,
        rides: 100,
        options: ['AC', 'WiFi'],
        languages: ['EN', 'FR'],
        carrierId: 'driver-1',
        passengers: 4,
        images: [
          OfferImage(id: 'p1', url: 'https://cdn.example.com/vehicles/car-front.jpg'),
          OfferImage(id: 'p2', url: 'https://cdn.example.com/vehicles/car-side.jpg'),
          OfferImage(id: 'p3', url: 'https://cdn.example.com/vehicles/car-interior.jpg'),
        ],
      );

      expect(offer.images.length, 3);
      expect(offer.imageUrls.length, 3);
      expect(offer.imageUrls[0], 'https://cdn.example.com/vehicles/car-front.jpg');
      expect(offer.imageUrls[1], 'https://cdn.example.com/vehicles/car-side.jpg');
      expect(offer.imageUrls[2], 'https://cdn.example.com/vehicles/car-interior.jpg');
    });

    testWidgets('GtNotificationCard displays first vehicle image thumbnail and badge',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: GtNotificationCard(
              title: 'New offer available',
              body: 'CA\$45.00 — Toyota Camry',
              createdAt: DateTime.now(),
              unread: true,
              imageUrl: 'https://cdn.example.com/vehicles/car-front.jpg',
            ),
          ),
        ),
      );

      expect(find.text('New offer available'), findsOneWidget);
      expect(find.text('CA\$45.00 — Toyota Camry'), findsOneWidget);
      // GtNotificationCard has an image container
      expect(find.byType(GtNotificationCard), findsOneWidget);
    });

    testWidgets(
        'OfferDetailScreen displays hero carousel with photo count badge and vehicle photos gallery in description',
        (tester) async {
      const stubOffer = Offer(
        id: 'offer-abc',
        vehicleBrand: 'Tesla',
        vehicleModel: 'Model 3',
        vehicleClass: 'premium',
        price: 65.0,
        currency: 'CAD',
        rating: 5.0,
        ratingCount: 15,
        rides: 80,
        options: ['Water', 'Child seat'],
        languages: ['EN'],
        carrierId: 'driver-2',
        passengers: 4,
        images: [
          OfferImage(id: 'img1', url: 'https://cdn.example.com/v1.jpg'),
          OfferImage(id: 'img2', url: 'https://cdn.example.com/v2.jpg'),
          OfferImage(id: 'img3', url: 'https://cdn.example.com/v3.jpg'),
        ],
      );

      final state = _TestAppState(stubOffer: stubOffer);

      await tester.pumpWidget(
        ChangeNotifierProvider<AppState>.value(
          value: state,
          child: const MaterialApp(
            home: OfferDetailScreen(
              rideId: 'ride-123',
              offerId: 'offer-abc',
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Vehicle name
      expect(find.text('Tesla Model 3'), findsOneWidget);

      // Hero photo counter badge (shows "1 / 3")
      expect(find.text('1 / 3'), findsOneWidget);

      // Dedicated "Vehicle photos" section in description
      expect(find.text('Vehicle photos'), findsOneWidget);
      expect(find.text('3 photos'), findsOneWidget);
      expect(find.text('Primary'), findsOneWidget);
    });
  });
}
