import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:passenger/state/app_state.dart';

/// Push / deep-link helper.
///
/// Web: no FCM — optional query deep links only.
/// Mobile: stub that documents FCM wiring; register token when provided.
///
/// To enable real FCM later:
/// 1. Add `firebase_core` + `firebase_messaging` to passenger pubspec
/// 2. Configure platform Firebase apps
/// 3. Call [PushService.start] from main after Firebase.initializeApp
class PushService with WidgetsBindingObserver {
  PushService(this.app);

  final AppState app;
  bool _started = false;

  /// Start lifecycle observers and optional token registration.
  Future<void> start({String? fcmToken}) async {
    if (_started) return;
    _started = true;
    WidgetsBinding.instance.addObserver(this);

    if (kIsWeb) {
      // Web: deep links come from go_router URL / query params.
      return;
    }

    if (fcmToken != null && fcmToken.length >= 10) {
      await app.registerPushTokenIfAvailable(
        token: fcmToken,
        platform: defaultTargetPlatform.name,
      );
    }
  }

  void stop() {
    if (!_started) return;
    WidgetsBinding.instance.removeObserver(this);
    _started = false;
  }

  /// Handle a notification / deep-link payload with rideId (+ optional offerId).
  void handleOfferDeepLink({
    required String rideId,
    String? offerId,
  }) {
    app.applyDeepLink(rideId: rideId, offerId: offerId);
    app.refreshRide(rideId);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      app.onAppResumed();
    }
  }
}
