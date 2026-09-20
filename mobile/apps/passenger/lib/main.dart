import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_web_plugins/url_strategy.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/router.dart';
import 'package:passenger/services/push_service.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initGoogleMapsAndroid();
  // So /offers/:id and other deep links work on Flutter web (not only /#/...).
  usePathUrlStrategy();

  if (!kIsWeb) {
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    } catch (e) {
      debugPrint('Firebase initialization skipped / failed: $e');
    }
  }

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
    _state.syncPushToken = _push.syncToken;
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
    // IMPORTANT: Do not rebuild MaterialApp.router on every AppState notify.
    // That remounts the navigator and kicks the user off /offers back to /.
    return ChangeNotifierProvider.value(
      value: _state,
      child: MaterialApp.router(
        title: 'CAN-RIDE Passenger',
        theme: GtTheme.light(),
        debugShowCheckedModeBanner: false,
        routerConfig: _router,
        builder: (context, child) {
          return ListenableBuilder(
            listenable: _state,
            builder: (context, _) {
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
