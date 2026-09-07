import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:driver/main.dart';
import 'package:driver/state/app_state.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Driver app loads', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final state = AppState();
    await state.load();
    await tester.pumpWidget(DriverApp(appState: state));
    await tester.pumpAndSettle();
    expect(find.textContaining('carrier'), findsWidgets);
  });
}
