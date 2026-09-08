import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/router.dart';
import 'package:passenger/services/push_service.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const PassengerApp());
}

class PassengerApp extends StatefulWidget {
  const PassengerApp({super.key});

  @override
  State<PassengerApp> createState() => _PassengerAppState();
}

class _PassengerAppState extends State<PassengerApp> {
  late final AppState _state = AppState();
  late final GoRouter _router = createRouter(_state);
  late final PushService _push = PushService(_state);

  @override
  void initState() {
    super.initState();
    _push.start();
  }

  @override
  void dispose() {
    _push.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider.value(
      value: _state,
      child: ListenableBuilder(
        listenable: _state,
        builder: (context, _) {
          return MaterialApp.router(
            title: 'CAN-GO Passenger',
            theme: GtTheme.light(),
            debugShowCheckedModeBanner: false,
            routerConfig: _router,
            builder: (context, child) {
              return GtSplashGate(
                ready: _state.ready,
                role: GtSplashRole.passenger,
                minDisplay: const Duration(milliseconds: 3200),
                child: child ?? const SizedBox.shrink(),
              );
            },
          );
        },
      ),
    );
  }
}
