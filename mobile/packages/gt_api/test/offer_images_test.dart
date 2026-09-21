import 'package:flutter_test/flutter_test.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';

void main() {
  group('Offer vehicle images parsing', () {
    test('extracts multiple vehicle images from presentation.images', () {
      final json = {
        'id': 'offer-101',
        'bidAmount': 50,
        'currency': 'CAD',
        'presentation': {
          'imageUrl': '/rides/r1/offers/offer-101/photos/photo-1/content',
          'images': [
            {'id': 'photo-1', 'url': '/rides/r1/offers/offer-101/photos/photo-1/content'},
            {'id': 'photo-2', 'url': '/rides/r1/offers/offer-101/photos/photo-2/content'},
            {'id': 'photo-3', 'url': '/rides/r1/offers/offer-101/photos/photo-3/content'},
          ],
          'brand': 'Toyota',
          'model': 'Camry',
          'vehicleClass': 'comfort',
        },
      };

      final offer = offerFromServer(json);
      expect(offer.id, 'offer-101');
      expect(offer.images.length, 3);
      expect(offer.imageUrl, '/rides/r1/offers/offer-101/photos/photo-1/content');
      expect(offer.imageUrls, [
        '/rides/r1/offers/offer-101/photos/photo-1/content',
        '/rides/r1/offers/offer-101/photos/photo-2/content',
        '/rides/r1/offers/offer-101/photos/photo-3/content',
      ]);
    });

    test('extracts vehicle images from top-level vehicleImages list of strings', () {
      final json = {
        'id': 'offer-102',
        'bidAmount': 60,
        'currency': 'CAD',
        'vehicleImages': [
          'https://s3.example.com/vehicles/v1/front.jpg',
          'https://s3.example.com/vehicles/v1/back.jpg',
        ],
        'vehicle': {
          'name': 'Honda Civic',
          'vehicleClass': 'sedan',
        },
      };

      final offer = offerFromServer(json);
      expect(offer.id, 'offer-102');
      expect(offer.images.length, 2);
      expect(offer.imageUrl, 'https://s3.example.com/vehicles/v1/front.jpg');
      expect(offer.imageUrls.first, 'https://s3.example.com/vehicles/v1/front.jpg');
      expect(offer.imageUrls.last, 'https://s3.example.com/vehicles/v1/back.jpg');
    });

    test('offerFromServerOrMinimal preserves images list and primary imageUrl', () {
      final json = {
        'id': 'offer-minimal',
        'bidAmount': 40,
        'presentation': {
          'images': [
            {'id': 'img-1', 'url': 'https://example.com/img1.png'},
            {'id': 'img-2', 'url': 'https://example.com/img2.png'},
          ],
        },
      };

      final offer = offerFromServerOrMinimal(json);
      expect(offer.images.length, 2);
      expect(offer.imageUrl, 'https://example.com/img1.png');
      expect(offer.imageUrls, [
        'https://example.com/img1.png',
        'https://example.com/img2.png',
      ]);
    });
  });
}
