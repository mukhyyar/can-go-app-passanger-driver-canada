import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:provider/provider.dart';

import 'router.dart';
import 'services/push_service.dart';
import 'state/app_state.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initGoogleMapsAndroid();

  if (!kIsWeb) {
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    } catch (e) {
      debugPrint('Firebase initialization skipped / failed: $e');
    }
  }

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
  late final PushService _push;

  @override
  void initState() {
    super.initState();
    _state = widget.appState ?? AppState();
    _router = createRouter(_state);
    _push = PushService(_state);
    _state.syncPushToken = _push.syncToken;
    if (widget.appState == null || !_state.loaded) {
      _state.load();
    }
    _push.start();
  }

  @override
  void dispose() {
    _state.syncPushToken = null;
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
            title: 'CAN-RIDE Driver',
            debugShowCheckedModeBanner: false,
            theme: GtTheme.light(),
            routerConfig: _router,
            builder: (context, child) {
              return GtSplashGate(
                ready: _state.loaded,
                role: GtSplashRole.driver,
                minDisplay: const Duration(milliseconds: 3200),
                tagline: 'Drive. Earn. Explore with CAN-RIDE',
                child: child ?? const SizedBox.shrink(),
              );
            },
          );
        },
      ),
    );
  }
}
