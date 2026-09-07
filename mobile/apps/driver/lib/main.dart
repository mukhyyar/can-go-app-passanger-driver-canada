import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import 'router.dart';
import 'state/app_state.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const DriverApp());
}

class DriverApp extends StatefulWidget {
  const DriverApp({super.key, this.appState});

  /// Optional preloaded state (tests). When null, state loads on start.
  final AppState? appState;

  @override
  State<DriverApp> createState() => _DriverAppState();
}

class _DriverAppState extends State<DriverApp> {
  late final AppState _state;
  late final GoRouter _router;

  @override
  void initState() {
    super.initState();
    _state = widget.appState ?? AppState();
    _router = createRouter(_state);
    if (widget.appState == null || !_state.loaded) {
      _state.load();
    }
  }

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider.value(
      value: _state,
      child: ListenableBuilder(
        listenable: _state,
        builder: (context, _) {
          return MaterialApp.router(
            title: 'CAN-GO Driver',
            debugShowCheckedModeBanner: false,
            theme: GtTheme.light(),
            routerConfig: _router,
            builder: (context, child) {
              return GtSplashGate(
                ready: _state.loaded,
                role: GtSplashRole.driver,
                minDisplay: const Duration(milliseconds: 3200),
                tagline: 'Drive. Earn. Explore with CAN-GO',
                child: child ?? const SizedBox.shrink(),
              );
            },
          );
        },
      ),
    );
  }
}
