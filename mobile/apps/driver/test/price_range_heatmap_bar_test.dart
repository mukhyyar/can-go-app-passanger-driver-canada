import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_mock/gt_mock.dart';

import 'package:driver/offer/price_range_heatmap_bar.dart';

void main() {
  group('PriceRangeHeatmapBar.resolvePricing', () {
    test('uses PricingGuidance when valid', () {
      const guidance = PricingGuidance(
        guidanceAmount: 100,
        minBid: 80,
        maxBid: 140,
        platformCommissionPct: 20,
      );

      final resolved = PriceRangeHeatmapBar.resolvePricing(pricing: guidance);
      expect(resolved.minBid, 80);
      expect(resolved.maxBid, 140);
      expect(resolved.guidanceAmount, 100);
    });

    test('computes reasonable fallback from distance string', () {
      final resolved = PriceRangeHeatmapBar.resolvePricing(
        pricing: null,
        distanceStr: '34 km',
      );
      expect(resolved.minBid > 0, isTrue);
      expect(resolved.maxBid > resolved.minBid, isTrue);
      expect(resolved.guidanceAmount > resolved.minBid, isTrue);
      expect(resolved.guidanceAmount < resolved.maxBid, isTrue);
    });

    test('doubles round trip guidance when fallback used', () {
      final oneWay = PriceRangeHeatmapBar.resolvePricing(
        pricing: null,
        distanceStr: '50 km',
        isRoundTrip: false,
      );
      final roundTrip = PriceRangeHeatmapBar.resolvePricing(
        pricing: null,
        distanceStr: '50 km',
        isRoundTrip: true,
      );
      expect(roundTrip.guidanceAmount, oneWay.guidanceAmount * 2);
      expect((roundTrip.minBid - oneWay.minBid * 2).abs() < 0.05, isTrue);
      expect((roundTrip.maxBid - oneWay.maxBid * 2).abs() < 0.05, isTrue);
    });
  });

  group('PriceRangeHeatmapBar widget', () {
    testWidgets('renders min, max, and guidance labels', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: PriceRangeHeatmapBar(
              minBid: 75,
              maxBid: 150,
              guidanceAmount: 100,
              currency: 'CAD',
              currentPrice: null,
            ),
          ),
        ),
      );

      expect(find.text('Eligible price range'), findsOneWidget);
      expect(find.text('Enter amount to see odds'), findsOneWidget);
      expect(find.text('CA\$75'), findsOneWidget);
      expect(find.text('CA\$100'), findsOneWidget);
      expect(find.text('CA\$150'), findsOneWidget);
    });

    testWidgets('shows below minimum warning when entered amount is too low',
        (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: PriceRangeHeatmapBar(
              minBid: 75,
              maxBid: 150,
              guidanceAmount: 100,
              currency: 'CAD',
              currentPrice: 50,
            ),
          ),
        ),
      );

      expect(find.text('Below minimum eligible'), findsOneWidget);
    });

    testWidgets('shows optimal odds when price is between min and guidance',
        (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: PriceRangeHeatmapBar(
              minBid: 75,
              maxBid: 150,
              guidanceAmount: 100,
              currency: 'CAD',
              currentPrice: 90,
            ),
          ),
        ),
      );

      expect(find.text('Optimal · High acceptance odds'), findsOneWidget);
    });

    testWidgets('shows moderate odds when price is between guidance and max',
        (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: PriceRangeHeatmapBar(
              minBid: 75,
              maxBid: 150,
              guidanceAmount: 100,
              currency: 'CAD',
              currentPrice: 120,
            ),
          ),
        ),
      );

      expect(find.text('Higher fare · Moderate odds'), findsOneWidget);
    });

    testWidgets('shows exceeds maximum warning when entered amount is too high',
        (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: PriceRangeHeatmapBar(
              minBid: 75,
              maxBid: 150,
              guidanceAmount: 100,
              currency: 'CAD',
              currentPrice: 180,
            ),
          ),
        ),
      );

      expect(find.text('Exceeds maximum eligible'), findsOneWidget);
    });
  });
}
