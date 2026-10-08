import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_ui/gt_ui.dart';

void main() {
  test('ReportSuggestionsData returns appropriate suggestions for passenger and driver', () {
    final driverSuggestions = ReportSuggestionsData.suggestionsFor(
      target: ReportTarget.driver,
    );
    final passengerSuggestions = ReportSuggestionsData.suggestionsFor(
      target: ReportTarget.passenger,
    );

    expect(driverSuggestions.isNotEmpty, isTrue);
    expect(passengerSuggestions.isNotEmpty, isTrue);

    expect(
      driverSuggestions,
      contains('Dangerous / Reckless driving'),
    );
    expect(
      driverSuggestions,
      contains('Distracted driving / Phone use'),
    );
    expect(
      driverSuggestions,
      contains('Wrong vehicle or license plate'),
    );

    expect(
      passengerSuggestions,
      contains('Can\'t find the rider'),
    );
    expect(
      passengerSuggestions,
      contains('Nowhere to stop'),
    );
    expect(
      passengerSuggestions,
      contains('Too many riders'),
    );
  });

  testWidgets('GtReportSuggestions renders predefined chips and handles toggling',
      (tester) async {
    final selected = <String>{};
    String? lastToggled;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) {
              return GtReportSuggestions(
                target: ReportTarget.driver,
                selectedSuggestions: selected,
                onToggle: (s) {
                  setState(() {
                    lastToggled = s;
                    if (selected.contains(s)) {
                      selected.remove(s);
                    } else {
                      selected.add(s);
                    }
                  });
                },
              );
            },
          ),
        ),
      ),
    );

    expect(find.text('Select what went wrong:'), findsOneWidget);
    expect(find.text('Dangerous / Reckless driving'), findsOneWidget);

    // Tap chip to select
    await tester.tap(find.text('Dangerous / Reckless driving'));
    await tester.pumpAndSettle();

    expect(lastToggled, 'Dangerous / Reckless driving');
    expect(selected.contains('Dangerous / Reckless driving'), isTrue);

    // Tap chip again to unselect
    await tester.tap(find.text('Dangerous / Reckless driving'));
    await tester.pumpAndSettle();

    expect(selected.contains('Dangerous / Reckless driving'), isFalse);
  });

  testWidgets('showGtReportBottomSheet presents dialog and submits selections for driver target',
      (tester) async {
    List<String>? submittedReasons;
    String? submittedDetails;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => ElevatedButton(
              onPressed: () {
                showGtReportBottomSheet(
                  context: context,
                  target: ReportTarget.driver,
                  onSubmit: (reasons, details) async {
                    submittedReasons = reasons;
                    submittedDetails = details;
                  },
                );
              },
              child: const Text('Open Report'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open Report'));
    await tester.pumpAndSettle();

    expect(find.text('Report this ride'), findsOneWidget);
    expect(find.text('Select what went wrong:'), findsOneWidget);
    expect(find.text('Dangerous / Reckless driving'), findsOneWidget);

    // Select chip
    await tester.tap(find.text('Dangerous / Reckless driving'));
    await tester.pumpAndSettle();

    // Enter optional details
    await tester.enterText(
      find.byType(TextField),
      'Driver was driving way too fast.',
    );
    await tester.pumpAndSettle();

    // Submit report
    await tester.ensureVisible(find.text('Submit report'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Submit report'));
    await tester.pumpAndSettle();

    expect(submittedReasons, contains('Dangerous / Reckless driving'));
    expect(submittedDetails, 'Driver was driving way too fast.');
  });

  testWidgets('showGtReportBottomSheet auto-submits on chip tap for passenger target',
      (tester) async {
    List<String>? submittedReasons;
    String? submittedDetails;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => ElevatedButton(
              onPressed: () {
                showGtReportBottomSheet(
                  context: context,
                  target: ReportTarget.passenger,
                  onSubmit: (reasons, details) async {
                    submittedReasons = reasons;
                    submittedDetails = details;
                  },
                );
              },
              child: const Text('Open Report'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open Report'));
    await tester.pumpAndSettle();

    expect(find.text('Something wrong? Choose an issue:'), findsOneWidget);
    expect(find.text("Can't find the rider"), findsOneWidget);

    // Tapping chip auto-submits
    await tester.tap(find.text("Can't find the rider"));
    await tester.pumpAndSettle();

    expect(submittedReasons, contains("Can't find the rider"));
    expect(submittedDetails, '');
  });
}

