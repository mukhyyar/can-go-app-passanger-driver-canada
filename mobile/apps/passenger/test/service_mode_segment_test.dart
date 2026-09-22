import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:passenger/screens/book/service_mode_segment.dart';
import 'package:passenger/state/app_state.dart';

void main() {
  testWidgets('switching between tabs updates serviceType', (tester) async {
    final state = AppState();
    expect(state.serviceType, ServiceType.ride);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) {
              return ServiceModeSegment(state: state);
            },
          ),
        ),
      ),
    );

    // Tap DELIVERY
    await tester.tap(find.text('DELIVERY'));
    await tester.pumpAndSettle();
    expect(state.serviceType, ServiceType.delivery);

    // Tap RIDE
    await tester.tap(find.text('RIDE'));
    await tester.pumpAndSettle();
    expect(state.serviceType, ServiceType.ride);

    // Tap PER HOUR
    await tester.tap(find.text('PER HOUR'));
    await tester.pumpAndSettle();
    expect(state.serviceType, ServiceType.perHour);
  });
}
