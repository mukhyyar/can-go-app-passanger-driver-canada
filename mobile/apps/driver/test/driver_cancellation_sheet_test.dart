import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:driver/screens/driver_cancellation_sheet.dart';
import 'package:gt_ui/gt_ui.dart';

void main() {
  testWidgets('DriverCancellationSheet renders all 6 structured reasons and warning banner',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    Map<String, String>? result;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (ctx) => ElevatedButton(
              onPressed: () async {
                result = await showModalBottomSheet<Map<String, String>>(
                  context: ctx,
                  isScrollControlled: true,
                  builder: (_) => const DriverCancellationSheet(),
                );
              },
              child: const Text('Open Sheet'),
            ),
          ),
        ),
      ),
    );

    // Open the sheet
    await tester.tap(find.text('Open Sheet'));
    await tester.pumpAndSettle();

    // Verify Title & Safety Banners
    expect(find.text('Refuse / Cancel Trip'), findsOneWidget);
    expect(find.text('For emergencies, call 911 immediately'), findsOneWidget);
    expect(
      find.text('CAN-RIDE Support should not be represented as an emergency-response service.'),
      findsOneWidget,
    );
    expect(
      find.textContaining('Safety overrides completion of a Booking'),
      findsOneWidget,
    );

    // Verify Driver Cancellation Policy Card is present before ride cancel
    expect(find.text('Driver Cancellation Policy'), findsOneWidget);
    expect(find.text('100% Passenger Refund'), findsOneWidget);
    expect(find.text('Zero Payout (\$0.00 CAD)'), findsOneWidget);
    expect(find.text('Safety Concerns Protected'), findsOneWidget);
    expect(find.text('Repeated Unjustified Cancels'), findsOneWidget);
    expect(find.text('Full Policy'), findsOneWidget);

    // Verify all Section 15 safety reasons are present
    expect(find.text('Immediate Safety Threat'), findsOneWidget);
    expect(find.text('Unlawful Activity'), findsOneWidget);
    expect(find.text('Dangerous Passenger Conduct'), findsOneWidget);
    expect(find.text('Unsafe Vehicle Condition'), findsOneWidget);
    expect(find.text('Emergency'), findsOneWidget);
    expect(find.text('Legal Restriction'), findsOneWidget);
    expect(find.text('Weather or Road Conditions'), findsOneWidget);
    expect(find.text('Other'), findsOneWidget);

    // Verify "Justified" badges exist on justified safety reasons
    expect(find.text('Justified'), findsNWidgets(7));

    // Dismiss using "Keep Ride"
    await tester.tap(find.byKey(const Key('keep_ride_button')));
    await tester.pumpAndSettle();

    expect(find.text('Refuse / Cancel Trip'), findsNothing);
    expect(result, isNull);
  });

  testWidgets('DriverCancellationSheet enforces mandatory details on "Other" reason',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    Map<String, String>? result;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (ctx) => ElevatedButton(
              onPressed: () async {
                result = await showModalBottomSheet<Map<String, String>>(
                  context: ctx,
                  isScrollControlled: true,
                  builder: (_) => const DriverCancellationSheet(),
                );
              },
              child: const Text('Open Sheet'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open Sheet'));
    await tester.pumpAndSettle();

    // Select "Other"
    await tester.tap(find.byKey(const Key('reason_OTHER')));
    await tester.pumpAndSettle();

    // Details field should appear
    expect(find.byKey(const Key('cancellation_details_input')), findsOneWidget);

    // Attempt to confirm without entering details
    await tester.tap(find.byKey(const Key('confirm_cancel_button')));
    await tester.pumpAndSettle();

    expect(
      find.text('Please provide more details (minimum 5 characters).'),
      findsOneWidget,
    );
    expect(result, isNull);

    // Enter valid details
    await tester.enterText(
      find.byKey(const Key('cancellation_details_input')),
      'Sudden family obligation',
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('confirm_cancel_button')));
    await tester.pumpAndSettle();

    // Sheet dismissed with result
    expect(result, isNotNull);
    expect(result!['reasonCode'], equals('OTHER'));
    expect(result!['reasonDetails'], equals('Sudden family obligation'));
  });

  testWidgets('DriverCancellationSheet cancels cleanly with a standard reason',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    Map<String, String>? result;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (ctx) => ElevatedButton(
              onPressed: () async {
                result = await showModalBottomSheet<Map<String, String>>(
                  context: ctx,
                  isScrollControlled: true,
                  builder: (_) => const DriverCancellationSheet(),
                );
              },
              child: const Text('Open Sheet'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open Sheet'));
    await tester.pumpAndSettle();

    // Select Vehicle Breakdown
    await tester.tap(find.byKey(const Key('reason_VEHICLE_BREAKDOWN')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('confirm_cancel_button')));
    await tester.pumpAndSettle();

    expect(result, isNotNull);
    expect(result!['reasonCode'], equals('VEHICLE_BREAKDOWN'));
    expect(result!['reasonDetails'], isNull);
  });

  testWidgets('renders emergency banner cleanly on standard mobile screen without overflow', (tester) async {
    tester.view.physicalSize = const Size(360, 780);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    await tester.pumpWidget(
      MaterialApp(
        theme: GtTheme.light(),
        home: Scaffold(
          body: Builder(
            builder: (ctx) => ElevatedButton(
              onPressed: () => showModalBottomSheet(
                context: ctx,
                isScrollControlled: true,
                builder: (_) => const DriverCancellationSheet(),
              ),
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();

    final textRect = tester.getRect(find.text('For emergencies, call 911 immediately'));
    expect(textRect.width, greaterThan(150.0));

    expect(find.widgetWithText(ElevatedButton, '911'), findsOneWidget);
    expect(
      find.text('CAN-RIDE Support should not be represented as an emergency-response service.'),
      findsOneWidget,
    );
  });

  testWidgets('tapping Full Policy opens detailed Driver Cancellation Policy dialog', (tester) async {
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    await tester.pumpWidget(
      MaterialApp(
        theme: GtTheme.light(),
        home: Scaffold(
          body: Builder(
            builder: (ctx) => ElevatedButton(
              onPressed: () => showModalBottomSheet(
                context: ctx,
                isScrollControlled: true,
                builder: (_) => const DriverCancellationSheet(),
              ),
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();

    // Tap "Full Policy"
    expect(find.text('Full Policy'), findsOneWidget);
    await tester.tap(find.text('Full Policy'));
    await tester.pumpAndSettle();

    // Verify dialog content
    expect(find.text('1. Passenger Refund & Earnings Forfeiture'), findsOneWidget);
    expect(find.text('2. Section 15 Safety & Protection Rights'), findsOneWidget);
    expect(find.text('3. Unjustified Cancellations & Penalties'), findsOneWidget);
    expect(find.text('4. Passenger No-Show Procedure'), findsOneWidget);
    expect(find.text('Understood'), findsOneWidget);

    // Close dialog
    await tester.tap(find.text('Understood'));
    await tester.pumpAndSettle();

    expect(find.text('1. Passenger Refund & Earnings Forfeiture'), findsNothing);
  });
}
