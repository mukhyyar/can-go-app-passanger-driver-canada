import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_ui/gt_ui.dart';

void main() {
  group('formatServiceType', () {
    test('formats known service types to human-readable strings', () {
      expect(formatServiceType('PER_HOUR'), 'Per Hour');
      expect(formatServiceType('per_hour'), 'Per Hour');
      expect(formatServiceType('DELIVERY'), 'Delivery');
      expect(formatServiceType('delivery'), 'Delivery');
      expect(formatServiceType('RIDE'), 'Ride');
      expect(formatServiceType('ride'), 'Ride');
      expect(formatServiceType('CAR_RENTAL'), 'Car Rental');
      expect(formatServiceType('EXPERIENCES'), 'Experiences');
    });

    test('defaults null or empty or unknown to Ride', () {
      expect(formatServiceType(null), 'Ride');
      expect(formatServiceType(''), 'Ride');
      expect(formatServiceType('   '), 'Ride');
      expect(formatServiceType('UNKNOWN'), 'Ride');
    });

    test('formatStatus includes service types', () {
      expect(formatStatus('PER_HOUR'), 'Per Hour');
      expect(formatStatus('DELIVERY'), 'Delivery');
      expect(formatStatus('RIDE'), 'Ride');
    });
  });

  group('ServiceTypeBadge widget', () {
    testWidgets('renders Per Hour badge with clock icon', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: ServiceTypeBadge(serviceType: 'PER_HOUR'),
          ),
        ),
      );

      expect(find.text('Per Hour'), findsOneWidget);
      expect(find.byIcon(Icons.schedule_rounded), findsOneWidget);
    });

    testWidgets('renders Delivery badge with parcel/package icon', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: ServiceTypeBadge(serviceType: 'DELIVERY'),
          ),
        ),
      );

      expect(find.text('Delivery'), findsOneWidget);
      expect(find.byIcon(Icons.inventory_2_outlined), findsOneWidget);
    });

    testWidgets('renders Ride badge with car icon', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: ServiceTypeBadge(serviceType: 'RIDE'),
          ),
        ),
      );

      expect(find.text('Ride'), findsOneWidget);
      expect(find.byIcon(Icons.directions_car_rounded), findsOneWidget);
    });

    testWidgets('renders compact Ride badge by default when serviceType is null', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: ServiceTypeBadge(serviceType: null, compact: true),
          ),
        ),
      );

      expect(find.text('Ride'), findsOneWidget);
      expect(find.byIcon(Icons.directions_car_rounded), findsOneWidget);
    });
  });
}
