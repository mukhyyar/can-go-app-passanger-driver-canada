import 'package:flutter_test/flutter_test.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';

import 'package:driver/offer/offer_helpers.dart';

void main() {
  group('MoneyFormat', () {
    test('formats CAD without hardcoding amounts', () {
      expect(MoneyFormat.format(95, 'CAD'), 'CA\$95');
      expect(MoneyFormat.formatFlexible(12.5, 'CAD'), 'CA\$12.50');
    });
  });

  group('OfferDraft', () {
    test('copy preserves fields', () {
      final d = OfferDraft(
        vehicleId: 'v1',
        outboundPrice: 100,
        returnPrice: 80,
        validForSeconds: 3600,
        selectedOptions: {'wifi', 'name_sign'},
      );
      final c = d.copy();
      expect(c.vehicleId, 'v1');
      expect(c.outboundPrice, 100);
      expect(c.returnPrice, 80);
      expect(c.validForSeconds, 3600);
      expect(c.selectedOptions, {'wifi', 'name_sign'});
      c.selectedOptions.add('water');
      expect(d.selectedOptions.contains('water'), isFalse);
    });

    test('computes totalPrice, 20% platformFee, and customerTotal correctly', () {
      final oneWay = OfferDraft(outboundPrice: 100);
      expect(oneWay.totalPrice, 100.0);
      expect(oneWay.platformFee, 20.0);
      expect(oneWay.customerTotal, 120.0);

      final roundTrip = OfferDraft(outboundPrice: 150, returnPrice: 150);
      expect(roundTrip.totalPrice, 300.0);
      expect(roundTrip.platformFee, 60.0);
      expect(roundTrip.customerTotal, 360.0);

      final withDecimals = OfferDraft(outboundPrice: 55.50);
      expect(withDecimals.totalPrice, 55.50);
      expect(withDecimals.platformFee, 11.10);
      expect(withDecimals.customerTotal, 66.60);
    });
  });

  group('driverRequestFromServer', () {
    test('maps round-trip guidance and coords', () {
      final req = driverRequestFromServer({
        'id': 'ride_1',
        'fromLabel': 'A street',
        'toLabel': 'B street',
        'fromLat': 43.6,
        'fromLng': -79.6,
        'toLat': 43.1,
        'toLng': -79.0,
        'pickupAt': '2026-09-28T20:30:00.000Z',
        'returnAt': '2026-10-02T11:00:00.000Z',
        'isRoundTrip': true,
        'adults': 2,
        'currency': 'CAD',
        'vehicleClassIds': ['Economy'],
        'signage': 'John',
        'requiredOptions': ['name_sign'],
        'comment': 'One bag',
        'priceSnapshot': {
          'distanceKm': 254,
          'durationMin': 160,
          'guidanceAmount': 160,
          'minBid': 95,
          'maxBid': 228,
          'platformCommissionPct': 13,
          'isRoundTrip': true,
          'legs': 2,
        },
        'myOffers': [],
        'createdAt': DateTime.now()
            .subtract(const Duration(minutes: 3))
            .toIso8601String(),
      });
      expect(req.isRoundTrip, isTrue);
      expect(req.fromLat, 43.6);
      expect(req.pricing?.minBid, 95);
      expect(req.pricing?.maxBid, 228);
      expect(req.pricing?.platformCommissionPct, 13);
      expect(req.requiredOptions, contains('name_sign'));
      expect(req.comment, 'One bag');
      expect(req.distance.contains('×'), isTrue);
    });

    test('one-way does not invent return price fields', () {
      final req = driverRequestFromServer({
        'id': 'ride_2',
        'fromLabel': 'A',
        'toLabel': 'B',
        'pickupAt': '2026-09-28T20:30:00.000Z',
        'isRoundTrip': false,
        'adults': 1,
        'currency': 'CAD',
        'vehicleClassIds': ['Van'],
        'priceSnapshot': {
          'distanceKm': 36,
          'durationMin': 30,
          'guidanceAmount': 80,
          'minBid': 60,
          'maxBid': 120,
          'platformCommissionPct': 15,
        },
      });
      expect(req.isRoundTrip, isFalse);
      expect(req.returnDatetimeLabel, isNull);
    });

    test('parses Prisma Decimal strings in myOffers without wiping request', () {
      final req = driverRequestFromServer({
        'id': 'ride_decimal',
        'fromLabel': 'Beach',
        'toLabel': 'Airport',
        'pickupAt': '2026-09-28T20:30:00.000Z',
        'isRoundTrip': false,
        'adults': 2,
        'currency': 'CAD',
        'vehicleClassIds': ['Economy'],
        'myOffers': [
          {
            'id': 'offer_1',
            'status': 'ACTIVE',
            'bidAmount': '50',
            'outboundPrice': '50',
            'currency': 'CAD',
            'validForSeconds': '1800',
          },
        ],
      });
      expect(req.hasOffer, isTrue);
      expect(req.offerPrice, 50);
      expect(req.myOffer?.bidAmount, 50);
    });
  });

  group('validity options', () {
    test('matches screenshot durations', () {
      expect(kOfferValidityOptions.map((e) => e.label).toList(), [
        '30 min',
        '1 h',
        '2 h',
        '8 h',
        '12 h',
        '1 d',
        '2 d',
        '4 d',
        '6 d',
      ]);
    });
  });

  group('DriverVehicle', () {
    test('fromJson', () {
      final v = DriverVehicle.fromJson({
        'id': 'v1',
        'name': 'Honda City',
        'plate': 'BW238J',
        'vehicleClass': 'sedan',
        'amenities': {'Free Wi-Fi': true},
        'isActive': true,
      });
      expect(v.name, 'Honda City');
      expect(v.plate, 'BW238J');
      expect(v.amenities['Free Wi-Fi'], isTrue);
    });
  });
}
