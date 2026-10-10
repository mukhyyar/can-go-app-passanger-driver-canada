import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:passenger/screens/location_screen.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Widget wrap(Widget child, AppState state) {
    return ChangeNotifierProvider<AppState>.value(
      value: state,
      child: MaterialApp(home: child),
    );
  }

  testWidgets('LocationScreen shows Current location and Choose on map',
      (tester) async {
    final state = AppState();
    await tester.pumpWidget(wrap(const LocationScreen(), state));
    await tester.pump();

    expect(find.text('Current location'), findsOneWidget);
    expect(find.text('Choose on map'), findsOneWidget);
    expect(
      find.textContaining('Search a Canadian address'),
      findsOneWidget,
    );
  });

  testWidgets('LocationScreen search field accepts typed query', (tester) async {
    final state = AppState();
    await tester.pumpWidget(wrap(const LocationScreen(), state));
    await tester.pump();

    await tester.enterText(find.byType(TextField), '35 Masters');
    await tester.pump();
    expect(find.text('35 Masters'), findsOneWidget);

    // Debounce window — should not throw; results depend on network/mock.
    await tester.pump(const Duration(milliseconds: 400));
  });

  testWidgets('LocationScreen clear resets to history empty state',
      (tester) async {
    final state = AppState();
    await tester.pumpWidget(wrap(const LocationScreen(), state));
    await tester.pump();

    await tester.enterText(find.byType(TextField), 'Calgary');
    await tester.pump();
    expect(find.byIcon(Icons.close), findsOneWidget);

    await tester.tap(find.byIcon(Icons.close));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(
      find.textContaining('Search a Canadian address'),
      findsOneWidget,
    );
  });

  testWidgets(
      'LocationScreen shows Use typed address for full unmatched query',
      (tester) async {
    final state = AppState();
    await tester.pumpWidget(wrap(const LocationScreen(), state));
    await tester.pump();

    await tester.enterText(
      find.byType(TextField),
      '35 Masters Dr SE, Calgary, AB T3M 2T7, Canada',
    );
    await tester.pump();
    // After debounce + search (may be empty/mock), typed-address row for full query.
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump(const Duration(seconds: 2));

    expect(find.text('Use typed address'), findsOneWidget);
  });
}
