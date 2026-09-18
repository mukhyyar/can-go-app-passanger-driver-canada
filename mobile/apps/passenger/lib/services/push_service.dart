import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:passenger/state/app_state.dart';

/// Top-level FCM background handler (must be a top-level or static function).
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

/// Push / deep-link helper.
///
/// Web: no FCM — optional query deep links only.
/// Mobile: Firebase Messaging token registration + notification open handling.
class PushService with WidgetsBindingObserver {
  PushService(this.app);

  final AppState app;
  bool _started = false;
  bool _listening = false;
  bool _tokenSyncedForSession = false;
  StreamSubscription<String>? _tokenRefreshSub;
  StreamSubscription<RemoteMessage>? _foregroundSub;
  StreamSubscription<RemoteMessage>? _openedSub;

  /// Start lifecycle observers and FCM wiring.
  Future<void> start() async {
    if (_started) return;
    _started = true;
    WidgetsBinding.instance.addObserver(this);
    _ensureAuthListener();

    if (kIsWeb || Firebase.apps.isEmpty) return;

    try {
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );

      _tokenRefreshSub = messaging.onTokenRefresh.listen((token) {
        unawaited(_registerToken(token));
      });

      _foregroundSub = FirebaseMessaging.onMessage.listen(_handleMessage);
      _openedSub = FirebaseMessaging.onMessageOpenedApp.listen(_handleMessage);

      final initial = await messaging.getInitialMessage();
      if (initial != null) {
        _handleMessage(initial);
      }

      await syncToken();
    } catch (e) {
      debugPrint('PushService.start: $e');
    }
  }

  void _ensureAuthListener() {
    if (_listening) return;
    _listening = true;
    app.addListener(_onAppChanged);
  }

  void _onAppChanged() {
    if (!app.isAuthenticated) {
      _tokenSyncedForSession = false;
      return;
    }
    if (_tokenSyncedForSession) return;
    if (!app.ready) return;
    unawaited(syncToken());
  }

  bool _syncing = false;

  /// Fetch current FCM token and POST to backend when authenticated.
  Future<void> syncToken() async {
    if (kIsWeb || Firebase.apps.isEmpty || !app.isAuthenticated || _syncing) {
      return;
    }
    _syncing = true;
    try {
      if (defaultTargetPlatform == TargetPlatform.iOS) {
        final apnsToken = await FirebaseMessaging.instance.getAPNSToken();
        if (apnsToken == null) {
          // On iOS Simulator or before APNs handshake on device, APNs token is null.
          // Calling getToken() without APNs throws [firebase_messaging/apns-token-not-set].
          _tokenSyncedForSession = true;
          return;
        }
      }

      final token = await FirebaseMessaging.instance.getToken();
      if (token != null && token.length >= 10) {
        await _registerToken(token);
        _tokenSyncedForSession = true;
      }
    } catch (e) {
      _tokenSyncedForSession = true;
      debugPrint('PushService.syncToken: $e');
    } finally {
      _syncing = false;
    }
  }

  Future<void> _registerToken(String token) async {
    await app.registerPushTokenIfAvailable(
      token: token,
      platform: defaultTargetPlatform.name,
    );
  }

  void _handleMessage(RemoteMessage message) {
    final data = message.data;
    final rideId = data['rideId']?.toString();
    if (rideId == null || rideId.isEmpty) return;
    handleOfferDeepLink(
      rideId: rideId,
      offerId: data['offerId']?.toString(),
      type: data['type']?.toString(),
    );
  }

  void stop() {
    if (!_started && !_listening) return;
    if (_listening) {
      app.removeListener(_onAppChanged);
      _listening = false;
    }
    if (_started) {
      WidgetsBinding.instance.removeObserver(this);
    }
    unawaited(_tokenRefreshSub?.cancel());
    unawaited(_foregroundSub?.cancel());
    unawaited(_openedSub?.cancel());
    _tokenRefreshSub = null;
    _foregroundSub = null;
    _openedSub = null;
    _started = false;
    _tokenSyncedForSession = false;
  }

  /// Handle a notification / deep-link payload with rideId (+ optional offerId).
  void handleOfferDeepLink({
    required String rideId,
    String? offerId,
    String? type,
  }) {
    app.applyDeepLink(rideId: rideId, offerId: offerId, type: type);
    app.refreshRide(rideId);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      app.onAppResumed();
      unawaited(syncToken());
    }
  }
}
