import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:passenger/screens/book/book_screen.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';
import 'package:gt_mock/gt_mock.dart';

void main() {
  testWidgets('BookScreen switching from delivery back to ride with full state', (tester) async {
    final state = AppState();
    state.setFrom(MockData.places.first);
    state.setTo(MockData.places.last);

    await tester.pumpWidget(
      ChangeNotifierProvider<AppState>.value(
        value: state,
        child: const MaterialApp(
          home: BookScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(state.serviceType, ServiceType.ride);

    // Tap DELIVERY
    final deliveryTab = find.text('DELIVERY');
    expect(deliveryTab, findsOneWidget);
    await tester.tap(deliveryTab);
    await tester.pumpAndSettle();
    expect(state.serviceType, ServiceType.delivery);

    // Tap RIDE
    final rideTab = find.text('RIDE');
    expect(rideTab, findsOneWidget);
    await tester.tap(rideTab);
    await tester.pumpAndSettle();
    expect(state.serviceType, ServiceType.ride);

    // Tap PER HOUR
    final perHourTab = find.text('PER HOUR');
    expect(perHourTab, findsOneWidget);
    await tester.tap(perHourTab);
    await tester.pumpAndSettle();
    expect(state.serviceType, ServiceType.perHour);
  });
}
