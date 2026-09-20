import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:driver/main.dart';
import 'package:driver/state/app_state.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Driver app loads welcome screen on fresh install', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final state = AppState();
    state.loaded = true;
    await tester.pumpWidget(DriverApp(appState: state));
    await tester.pumpAndSettle();
    expect(find.text('CAN-RIDE DRIVER'), findsOneWidget);
    expect(find.text('Drive & Earn on Your Terms'), findsOneWidget);
  });

  testWidgets('Driver app navigates to auth if welcome already seen', (tester) async {
    SharedPreferences.setMockInitialValues({'driver_has_seen_welcome': true});
    final state = AppState();
    state.hasSeenWelcome = true;
    state.loaded = true;
    await tester.pumpWidget(DriverApp(appState: state));
    await tester.pumpAndSettle();
    expect(find.text('Driver sign in'), findsOneWidget);
  });
}
