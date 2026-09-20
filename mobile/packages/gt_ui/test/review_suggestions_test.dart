import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_ui/gt_ui.dart';

void main() {
  test('ReviewSuggestionsData returns appropriate suggestions per star', () {
    for (var s = 1; s <= 5; s++) {
      final driverSuggestions = ReviewSuggestionsData.suggestionsFor(
        target: ReviewTarget.driver,
        stars: s,
      );
      final passengerSuggestions = ReviewSuggestionsData.suggestionsFor(
        target: ReviewTarget.passenger,
        stars: s,
      );

      expect(driverSuggestions.isNotEmpty, isTrue);
      expect(passengerSuggestions.isNotEmpty, isTrue);
    }

    expect(
      ReviewSuggestionsData.suggestionsFor(
        target: ReviewTarget.driver,
        stars: 5,
      ),
      contains('Clean vehicle'),
    );
    expect(
      ReviewSuggestionsData.suggestionsFor(
        target: ReviewTarget.driver,
        stars: 1,
      ),
      contains('Unsafe driving'),
    );

    expect(
      ReviewSuggestionsData.suggestionsFor(
        target: ReviewTarget.passenger,
        stars: 5,
      ),
      contains('Ready at pickup'),
    );
    expect(
      ReviewSuggestionsData.suggestionsFor(
        target: ReviewTarget.passenger,
        stars: 1,
      ),
      contains('Excessive wait time'),
    );
  });

  testWidgets('GtReviewSuggestions renders chips and handles toggling',
      (tester) async {
    final selected = <String>{};
    String? toggled;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) {
              return GtReviewSuggestions(
                target: ReviewTarget.driver,
                stars: 5,
                selectedSuggestions: selected,
                onToggle: (s) {
                  setState(() {
                    toggled = s;
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

    expect(find.text('What went well?'), findsOneWidget);
    expect(find.text('Clean vehicle'), findsOneWidget);

    // Tap chip to select
    await tester.tap(find.text('Clean vehicle'));
    await tester.pumpAndSettle();

    expect(toggled, 'Clean vehicle');
    expect(selected.contains('Clean vehicle'), isTrue);

    // Tap chip again to unselect
    await tester.tap(find.text('Clean vehicle'));
    await tester.pumpAndSettle();

    expect(selected.contains('Clean vehicle'), isFalse);
  });
}
