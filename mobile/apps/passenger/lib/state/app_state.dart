import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/services/ride_realtime.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum ServiceType { ride, perHour, delivery }

class AppState extends ChangeNotifier {
  AppState({CanGoSession? session}) : api = session ?? CanGoSession() {
    _bootstrap();
  }

  final MockRepository repo = MockRepository.instance;
  final CanGoSession api;
  RideRealtime? _realtime;
  Timer? _openRidePoll;

  /// Banner when a new offer arrives while the user is elsewhere in the app.
  String? pendingOfferAlert;
  String? pendingOfferRideId;

  /// Live offer detail events (update / withdraw) for an open offer screen.
  String? pendingOfferEventType; // offer.updated | offer.withdrawn
  String? pendingOfferEventRideId;
  String? pendingOfferEventOfferId;
  String? pendingOfferEventSupersededId;

  /// In-app alert when a booked ride status changes (en route, completed, etc.).
  String? pendingRideStatusAlert;
  String? pendingRideStatusRideId;

  static const _onboardedKey = 'passenger_onboarded';
  static const _placeHistoryPrefix = 'passenger_place_history_';
  static const _maxPlaceHistory = 12;

  bool onboarded = false;
  bool ready = false;
  bool isAuthenticated = false;

  /// Wired from [PushService] so token sync runs after login / bootstrap.
  Future<void> Function()? syncPushToken;
  Map<String, dynamic>? me;
  List<Place> placeSearchHistory = const [];
  final Map<String, List<Offer>> _serverOffers = {};
  final Map<String, String> _serverRideStatus = {};

  int shellTabIndex = 0;

  ServiceType serviceType = ServiceType.ride;
  Place? from;
  Place? to;
  /// Multi-select vehicle classes on Book (ride).
  /// All classes checked to maximize driver offers.
  Set<String> vehicleClassIds =
      MockData.vehicleClasses.map((v) => v.id).toSet();
  int adults = 1;
  ChildSeats childSeats = const ChildSeats();
  String flight = '';
  String signage = '';
  bool returnEnabled = false;
  DateTime? returnDateTime;
  String returnFlight = '';
  String comment = '';
  bool promoEnabled = false;
  String promoCode = '';
  bool termsAccepted = false;
  DateTime pickupDateTime = DateTime.now();
  bool pickupNow = true;
  /// Selected duration pill for PER HOUR (30, 60, 120, 180). Null if custom end.
  int? perHourDurationMinutes;
  DateTime? rideEndsDateTime;
  bool perHourHasEnd = false;
  String locationField = 'from'; // from | to

  String language = 'English';
  String currency = 'CAD';
  String distanceUnit = 'km';
  bool notificationsEnabled = true;

  /// Short code for menu rows (CAD only).
  String get currencyCode => 'CAD';

  int get completedRideCount =>
      repo.rides.where((r) => r.status == RideStatus.past).length;

  String get _placeHistoryUserKey {
    final id = me?['id']?.toString();
    if (id != null && id.isNotEmpty) return id;
    return 'guest';
  }

  String get _placeHistoryPrefsKey =>
      '$_placeHistoryPrefix$_placeHistoryUserKey';

  Future<void> _bootstrap() async {
    final prefs = await SharedPreferences.getInstance();
    onboarded = prefs.getBool(_onboardedKey) ?? false;
    // Never show hardcoded demo rides in the passenger app.
    repo.rides.clear();
    isAuthenticated = await api.isAuthenticated();
    if (isAuthenticated) {
      try {
        me = await api.auth.me();
        await _syncLocalProfileFromMe();
        await refreshRidesFromServer();
        await startRideRealtime();
        _syncOpenRidePolling();
        await syncPushToken?.call();
        unawaited(refreshUnreadNotificationCount());
      } catch (_) {
        isAuthenticated = false;
        me = null;
        _clearLocalProfile();
        await api.clear();
        stopRideRealtime();
        _stopOpenRidePolling();
      }
    } else {
      me = null;
      _clearLocalProfile();
      stopRideRealtime();
      _stopOpenRidePolling();
    }
    await _loadPlaceSearchHistory();
    ready = true;
    notifyListeners();
  }

  Future<void> _loadPlaceSearchHistory() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_placeHistoryPrefsKey);
    if (raw == null || raw.isEmpty) {
      placeSearchHistory = const [];
      return;
    }
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) {
        placeSearchHistory = const [];
        return;
      }
      placeSearchHistory = decoded
          .whereType<Map>()
          .map((e) {
            final pid = e['placeId']?.toString();
            return Place(
              id: e['id']?.toString() ?? '',
              label: e['label']?.toString() ?? '',
              subtitle: e['subtitle']?.toString() ?? '',
              lat: (e['lat'] as num?)?.toDouble() ?? 0,
              lng: (e['lng'] as num?)?.toDouble() ?? 0,
              placeId: pid != null && pid.isNotEmpty ? pid : null,
            );
          })
          .where((p) => p.label.trim().isNotEmpty)
          .toList();
    } catch (_) {
      placeSearchHistory = const [];
    }
  }

  Future<void> addPlaceToSearchHistory(Place place) async {
    final label = place.label.trim();
    if (label.isEmpty) return;

    final next = <Place>[
      place,
      ...placeSearchHistory.where((p) {
        if (place.id.isNotEmpty && p.id == place.id) return false;
        return p.label.trim().toLowerCase() != label.toLowerCase();
      }),
    ];
    if (next.length > _maxPlaceHistory) {
      placeSearchHistory = next.sublist(0, _maxPlaceHistory);
    } else {
      placeSearchHistory = next;
    }
    notifyListeners();

    final prefs = await SharedPreferences.getInstance();
    final encoded = jsonEncode(
      placeSearchHistory
          .map(
            (p) => {
              'id': p.id,
              'label': p.label,
              'subtitle': p.subtitle,
              'lat': p.lat,
              'lng': p.lng,
              if (p.placeId != null && p.placeId!.isNotEmpty)
                'placeId': p.placeId,
            },
          )
          .toList(),
    );
    await prefs.setString(_placeHistoryPrefsKey, encoded);
  }

  Future<Map<String, dynamic>> register({
    required String email,
    required String password,
    required String phoneE164,
    String? fullName,
  }) {
    return api.auth.register(
      email: email,
      password: password,
      phoneE164: phoneE164,
      role: 'PASSENGER',
      fullName: fullName,
    );
  }

  Future<Map<String, dynamic>> sendPhoneOtp(
    String phoneE164, {
    String purpose = 'login',
  }) {
    return api.auth.sendOtp(phoneE164: phoneE164, purpose: purpose);
  }

  Future<OAuthConfig> loadOAuthConfig() => api.auth.oauthConfig();

  Future<OAuthResult> oauthGoogle({
    String? idToken,
    String? email,
    String? fullName,
  }) async {
    final result = await api.auth.oauthGoogle(
      idToken: idToken,
      email: email,
      fullName: fullName,
      role: 'PASSENGER',
    );
    if (!result.requiresPhoneLink) await _afterAuth();
    return result;
  }

  Future<OAuthResult> oauthApple({
    String? idToken,
    String? email,
    String? fullName,
  }) async {
    final result = await api.auth.oauthApple(
      idToken: idToken,
      email: email,
      fullName: fullName,
      role: 'PASSENGER',
    );
    if (!result.requiresPhoneLink) await _afterAuth();
    return result;
  }

  Future<Map<String, dynamic>> linkOAuthPhone({
    required String linkToken,
    required String phoneE164,
  }) {
    return api.auth.linkOAuthPhone(
      linkToken: linkToken,
      phoneE164: phoneE164,
    );
  }

  Future<void> verifyOtp({
    required String challengeId,
    required String code,
  }) async {
    await api.auth.verifyOtp(
      challengeId: challengeId,
      code: code,
      role: 'PASSENGER',
    );
    await _afterAuth();
  }

  Future<void> login({
    required String email,
    required String password,
  }) async {
    await api.auth.login(
      email: email,
      password: password,
      role: 'PASSENGER',
    );
    await _afterAuth();
  }

  Future<void> _afterAuth() async {
    me = await api.auth.me();
    isAuthenticated = true;
    await _syncLocalProfileFromMe();
    await setOnboarded(true);
    await refreshRidesFromServer();
    await startRideRealtime();
    _syncOpenRidePolling();
    await _loadPlaceSearchHistory();
    await syncPushToken?.call();
    unawaited(refreshUnreadNotificationCount());
    notifyListeners();
  }

  Future<void> _syncLocalProfileFromMe() async {
    final m = me;
    if (m == null) {
      _clearLocalProfile();
      return;
    }
    final passenger = m['passenger'];
    final nestedName =
        passenger is Map ? passenger['fullName']?.toString().trim() : null;
    final topName = m['fullName']?.toString().trim();
    repo.passenger.fullName = (topName != null && topName.isNotEmpty)
        ? topName
        : (nestedName ?? '');
    repo.passenger.email = m['email']?.toString() ?? '';
    repo.passenger.phone = m['phoneE164']?.toString() ??
        m['phone']?.toString() ??
        '';
    await _applyAvatarMetaFromMe(m);
  }

  void _clearLocalProfile() {
    repo.passenger.fullName = '';
    repo.passenger.email = '';
    repo.passenger.phone = '';
    clearAvatarState();
    unreadNotificationCount = 0;
  }

  /// Legacy signed URL from `/auth/me` — not used for rendering.
  String? get avatarUrl => _avatarUrl;
  String? _avatarUrl;

  Uint8List? avatarBytes;
  String? avatarStorageKey;
  String? avatarVersion;
  bool avatarLoading = false;
  bool avatarUploading = false;
  int _avatarLoadGen = 0;
  String? _avatarOwnerUserId;

  bool get hasAvatar =>
      (avatarStorageKey != null && avatarStorageKey!.isNotEmpty) ||
      (avatarBytes != null && avatarBytes!.isNotEmpty);

  void clearAvatarState() {
    _avatarLoadGen++;
    avatarBytes = null;
    avatarStorageKey = null;
    avatarVersion = null;
    avatarLoading = false;
    avatarUploading = false;
    _avatarUrl = null;
    _avatarOwnerUserId = null;
  }

  static const _avatarCacheMaxBytes = 400000;

  String _avatarCacheKey(String userId) => 'avatar_bytes_$userId';
  String _avatarCacheVerKey(String userId) => 'avatar_ver_$userId';

  Future<void> _persistAvatarCache({
    required String userId,
    required String version,
    required Uint8List bytes,
  }) async {
    if (bytes.length > _avatarCacheMaxBytes) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_avatarCacheKey(userId), base64Encode(bytes));
      await prefs.setString(_avatarCacheVerKey(userId), version);
    } catch (e) {
      debugPrint('avatar cache write: $e');
    }
  }

  Future<Uint8List?> _readAvatarCache({
    required String userId,
    required String version,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final ver = prefs.getString(_avatarCacheVerKey(userId));
      if (ver == null || ver != version) return null;
      final raw = prefs.getString(_avatarCacheKey(userId));
      if (raw == null || raw.isEmpty) return null;
      return base64Decode(raw);
    } catch (e) {
      debugPrint('avatar cache read: $e');
      return null;
    }
  }

  Future<void> _clearAvatarCache(String? userId) async {
    if (userId == null || userId.isEmpty) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_avatarCacheKey(userId));
      await prefs.remove(_avatarCacheVerKey(userId));
    } catch (_) {}
  }

  Future<void> _applyAvatarMetaFromMe(Map<String, dynamic> m) async {
    final userId = m['id']?.toString() ?? m['user']?['id']?.toString();
    if (_avatarOwnerUserId != null &&
        userId != null &&
        userId != _avatarOwnerUserId) {
      clearAvatarState();
    }
    _avatarOwnerUserId = userId;

    final key = _extractAvatarStorageKey(m);
    final version = _extractAvatarVersion(m) ?? key;
    _avatarUrl = _extractAvatarUrl(m);

    final keyChanged = key != avatarStorageKey || version != avatarVersion;
    avatarStorageKey = key;
    avatarVersion = version;

    if (key == null || key.isEmpty) {
      avatarBytes = null;
      avatarLoading = false;
      if (userId != null) await _clearAvatarCache(userId);
      return;
    }

    // Instant restore after logout/reinstall session — then refresh from API.
    if (avatarBytes == null && userId != null && version != null) {
      final cached = await _readAvatarCache(userId: userId, version: version);
      if (cached != null && cached.isNotEmpty) {
        avatarBytes = cached;
        notifyListeners();
      }
    }

    if (keyChanged || avatarBytes == null) {
      await loadAvatar(force: avatarBytes == null);
    } else {
      unawaited(loadAvatar(force: true));
    }
  }

  static String? _extractAvatarUrl(Map<String, dynamic> m) {
    final passenger = m['passenger'];
    if (passenger is Map) {
      final url = passenger['avatarUrl']?.toString();
      if (url != null && url.isNotEmpty) return rewriteMediaUrl(url);
    }
    final top = m['avatarUrl']?.toString();
    if (top != null && top.isNotEmpty) return rewriteMediaUrl(top);
    return null;
  }

  static String? _extractAvatarStorageKey(Map<String, dynamic> m) {
    final top = m['avatarStorageKey']?.toString();
    if (top != null && top.isNotEmpty) return top;
    final passenger = m['passenger'];
    if (passenger is Map) {
      final k = passenger['avatarStorageKey']?.toString();
      if (k != null && k.isNotEmpty) return k;
    }
    final driver = m['driver'];
    if (driver is Map) {
      final k = driver['avatarStorageKey']?.toString();
      if (k != null && k.isNotEmpty) return k;
    }
    return null;
  }

  static String? _extractAvatarVersion(Map<String, dynamic> m) {
    final top = m['avatarVersion']?.toString();
    if (top != null && top.isNotEmpty) return top;
    return _extractAvatarStorageKey(m);
  }

  Future<void> loadAvatar({bool force = false}) async {
    if (!isAuthenticated) return;
    final key = avatarStorageKey;
    final version = avatarVersion ?? key;
    if (key == null || key.isEmpty) {
      avatarBytes = null;
      avatarLoading = false;
      notifyListeners();
      return;
    }
    if (!force && avatarBytes != null && avatarVersion == version) {
      return;
    }

    final gen = ++_avatarLoadGen;
    avatarLoading = true;
    notifyListeners();
    try {
      final bytes = await api.auth.getAvatarBytes();
      if (gen != _avatarLoadGen) return; // stale
      if (avatarUploading) return; // don't clobber optimistic upload
      avatarBytes = bytes;
      avatarLoading = false;
      final owner = _avatarOwnerUserId;
      if (owner != null && version != null) {
        unawaited(
          _persistAvatarCache(userId: owner, version: version, bytes: bytes),
        );
      }
      notifyListeners();
    } catch (e) {
      debugPrint('loadAvatar failed: $e');
      if (gen != _avatarLoadGen) return;
      avatarLoading = false;
      // Keep existing bytes (incl. disk cache) if any; otherwise stay on initials.
      notifyListeners();
    }
  }

  /// Upload normalized avatar bytes. Optimistic preview with rollback on failure.
  Future<void> uploadAvatar(Uint8List bytes, {String filename = 'avatar.jpg'}) async {
    if (!isAuthenticated) {
      throw StateError('Not authenticated');
    }
    final prevBytes = avatarBytes;
    final prevKey = avatarStorageKey;
    final prevVersion = avatarVersion;
    final prevUrl = _avatarUrl;

    _avatarLoadGen++; // invalidate in-flight loads
    avatarUploading = true;
    avatarBytes = bytes;
    notifyListeners();

    try {
      final res = await api.auth.uploadAvatar(bytes: bytes, filename: filename);
      final key = res['avatarStorageKey']?.toString() ??
          res['avatarVersion']?.toString();
      final version = res['avatarVersion']?.toString() ?? key;
      final url = res['avatarUrl']?.toString();
      avatarStorageKey = (key != null && key.isNotEmpty) ? key : avatarStorageKey;
      avatarVersion = (version != null && version.isNotEmpty) ? version : avatarStorageKey;
      if (url != null && url.isNotEmpty) {
        _avatarUrl = rewriteMediaUrl(url);
      }
      final owner = _avatarOwnerUserId ?? me?['id']?.toString();
      if (owner != null && avatarVersion != null) {
        unawaited(
          _persistAvatarCache(
            userId: owner,
            version: avatarVersion!,
            bytes: bytes,
          ),
        );
      }
      // Keep optimistic bytes (exact uploaded payload).
      avatarUploading = false;
      notifyListeners();
    } catch (e) {
      avatarBytes = prevBytes;
      avatarStorageKey = prevKey;
      avatarVersion = prevVersion;
      _avatarUrl = prevUrl;
      avatarUploading = false;
      notifyListeners();
      rethrow;
    }
  }

  Future<void> removeAvatar() async {
    if (!isAuthenticated) return;
    final prevBytes = avatarBytes;
    final prevKey = avatarStorageKey;
    final prevVersion = avatarVersion;
    final prevUrl = _avatarUrl;
    final owner = _avatarOwnerUserId;

    _avatarLoadGen++;
    avatarUploading = true;
    avatarBytes = null;
    avatarStorageKey = null;
    avatarVersion = null;
    _avatarUrl = null;
    notifyListeners();

    try {
      await api.auth.deleteAvatar();
      await _clearAvatarCache(owner);
      avatarUploading = false;
      notifyListeners();
    } catch (e) {
      avatarBytes = prevBytes;
      avatarStorageKey = prevKey;
      avatarVersion = prevVersion;
      _avatarUrl = prevUrl;
      avatarUploading = false;
      notifyListeners();
      rethrow;
    }
  }

  int unreadNotificationCount = 0;

  Future<List<Map<String, dynamic>>> listNotifications({int limit = 50}) async {
    if (!isAuthenticated) return const [];
    final raw = await api.notifications.list(limit: limit, appRole: 'PASSENGER');
    final items = (raw['items'] as List?) ??
        (raw['_list'] as List?) ??
        const [];
    return items
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  Future<int> refreshUnreadNotificationCount() async {
    if (!isAuthenticated) {
      unreadNotificationCount = 0;
      notifyListeners();
      return 0;
    }
    try {
      final raw = await api.notifications.unreadCount(appRole: 'PASSENGER');
      unreadNotificationCount = (raw['count'] as num?)?.toInt() ?? 0;
      notifyListeners();
      return unreadNotificationCount;
    } catch (e) {
      debugPrint('refreshUnreadNotificationCount: $e');
      return unreadNotificationCount;
    }
  }

  Future<void> markNotificationRead(String id) async {
    if (!isAuthenticated) return;
    await api.notifications.markRead(id);
    if (unreadNotificationCount > 0) {
      unreadNotificationCount--;
      notifyListeners();
    } else {
      await refreshUnreadNotificationCount();
    }
  }

  Future<void> markAllNotificationsRead() async {
    if (!isAuthenticated) return;
    await api.notifications.markAllRead();
    unreadNotificationCount = 0;
    notifyListeners();
  }

  Future<void> refreshRidesFromServer() async {
    if (!isAuthenticated) return;
    try {
      final list = await api.marketplace.listRides();
      final rides = <RideRequest>[];
      final statuses = <String, String>{};
      final offers = <String, List<Offer>>{};
      for (final raw in list.whereType<Map>()) {
        final map = Map<String, dynamic>.from(raw);
        final ride = rideFromServer(map);
        rides.add(ride);
        final id = ride.id;
        final status = map['status'] as String?;
        if (status != null) statuses[id] = status;
        offers[id] = _offersWithSelected(map);
      }
      repo.rides
        ..clear()
        ..addAll(rides);
      _serverRideStatus
        ..clear()
        ..addAll(statuses);
      _serverOffers
        ..clear()
        ..addAll(offers);
      _syncRealtimeRideRooms();
      _syncOpenRidePolling();
      notifyListeners();
    } catch (e) {
      debugPrint('refreshRidesFromServer: $e');
    }
  }

  List<Offer> _parseOffersList(dynamic raw) => parseOffersList(raw);

  List<Offer> _offersWithSelected(Map<String, dynamic> map) {
    final parsed = List<Offer>.from(_parseOffersList(map['offers']));
    final selectedRaw = map['selectedOffer'];
    if (selectedRaw is Map) {
      try {
        final selected = offerFromServerOrMinimal(
          Map<String, dynamic>.from(
            selectedRaw.map((k, v) => MapEntry(k.toString(), v)),
          ),
        );
        final idx = parsed.indexWhere((o) => o.id == selected.id);
        if (idx >= 0) {
          parsed[idx] = selected;
        } else {
          parsed.add(selected);
        }
      } catch (_) {
        // Keep parsed offers as-is.
      }
    }
    return parsed;
  }

  /// Refresh a single ride (and its offers) from GET /rides/:id.
  Future<RideRequest?> refreshRide(String rideId) async {
    if (!isAuthenticated) return rideById(rideId);
    try {
      final raw = await api.marketplace.getRide(rideId);
      // Parse offers first so a ride-mapping failure never blanks the list.
      final parsedOffers = _offersWithSelected(raw);
      _serverOffers[rideId] = parsedOffers;
      _realtime?.subscribeRide(rideId);

      RideRequest ride;
      try {
        ride = rideFromServer(raw);
      } catch (e, st) {
        debugPrint('rideFromServer failed, using fallback: $e\n$st');
        final existing = rideById(rideId);
        ride = RideRequest(
          id: rideId,
          datetimeLabel: existing?.datetimeLabel ?? '',
          from: existing?.from ?? (raw['fromLabel']?.toString() ?? ''),
          to: existing?.to ?? raw['toLabel']?.toString(),
          distance: existing?.distance,
          duration: existing?.duration,
          timeBadge: existing?.timeBadge,
          status: mapServerRideStatus(raw['status']?.toString()),
          offerCount: parsedOffers.isNotEmpty
              ? parsedOffers.length
              : (raw['offerCount'] is num
                  ? (raw['offerCount'] as num).toInt()
                  : existing?.offerCount ?? 0),
          returnLabel: existing?.returnLabel,
          isRoundTrip: existing?.isRoundTrip ?? false,
          selectedOfferId: raw['selectedOfferId']?.toString() ??
              existing?.selectedOfferId,
          serverStatus: raw['status']?.toString() ?? existing?.serverStatus,
          shortId: raw['shortId']?.toString() ?? existing?.shortId,
          createdAtLabel: existing?.createdAtLabel,
          viewCount: (raw['viewCount'] as num?)?.toInt() ?? existing?.viewCount,
          currency: raw['currency']?.toString() ?? existing?.currency ?? 'CAD',
          hasLostItemRequest: raw['hasLostItemRequest'] == true ||
              existing?.hasLostItemRequest == true,
          lostItem: raw['lostItem'] is Map
              ? LostItemDetails.fromJson(
                  Map<String, dynamic>.from(raw['lostItem'] as Map))
              : existing?.lostItem,
        );
      }

      // Keep offerCount in sync with parsed offers when possible.
      if (parsedOffers.isNotEmpty && ride.offerCount != parsedOffers.length) {
        ride = RideRequest(
          id: ride.id,
          datetimeLabel: ride.datetimeLabel,
          from: ride.from,
          to: ride.to,
          distance: ride.distance,
          duration: ride.duration,
          timeBadge: ride.timeBadge,
          status: ride.status,
          offerCount: parsedOffers.length,
          returnLabel: ride.returnLabel,
          isRoundTrip: ride.isRoundTrip,
          selectedOfferId: ride.selectedOfferId,
          serverStatus: ride.serverStatus,
          shortId: ride.shortId,
          createdAtLabel: ride.createdAtLabel,
          viewCount: ride.viewCount,
          currency: ride.currency,
          hasLostItemRequest: ride.hasLostItemRequest,
          lostItem: ride.lostItem,
        );
      }

      final idx = repo.rides.indexWhere((r) => r.id == rideId);
      if (idx >= 0) {
        repo.rides[idx] = ride;
      } else {
        repo.rides.insert(0, ride);
      }
      _serverRideStatus[rideId] =
          raw['status']?.toString() ?? ride.serverStatus ?? '';
      _syncOpenRidePolling();
      notifyListeners();
      return ride;
    } catch (e, st) {
      debugPrint('refreshRide: $e\n$st');
      return rideById(rideId);
    }
  }

  /// Unread-style badge: sum of offer counts on upcoming rides awaiting selection.
  int get unreadOfferBadge {
    return repo.rides
        .where((r) =>
            r.status == RideStatus.chooseOffer ||
            r.status == RideStatus.waitingOffers)
        .fold<int>(0, (sum, r) => sum + r.offerCount);
  }

  /// Last payment quote / intent metadata for booking-confirmed UI.
  Map<String, dynamic>? lastPaymentQuote;
  Map<String, dynamic>? lastPaymentResult;

  /// Pending deep-link target after auth / splash.
  String? pendingDeepLinkRideId;
  String? pendingDeepLinkOfferId;
  String? pendingDeepLinkType;

  void applyDeepLink({
    required String rideId,
    String? offerId,
    String? type,
  }) {
    pendingDeepLinkRideId = rideId;
    pendingDeepLinkOfferId = offerId;
    pendingDeepLinkType = type;
    notifyListeners();
  }

  /// Consumes pending deep link and returns a go_router path, or null.
  String? consumeDeepLinkPath() {
    final rideId = pendingDeepLinkRideId;
    if (rideId == null || rideId.isEmpty) return null;
    final offerId = pendingDeepLinkOfferId;
    final type = pendingDeepLinkType;
    pendingDeepLinkRideId = null;
    pendingDeepLinkOfferId = null;
    pendingDeepLinkType = null;
    if (type == 'chat') {
      return '/ride/$rideId/chat';
    }
    if (type == 'ride.booked' || type == 'booking-confirmed') {
      return '/booking-confirmed/$rideId';
    }
    if (isRideBooked(rideId)) {
      return '/ride/$rideId';
    }
    if (offerId != null && offerId.isNotEmpty) {
      return '/offers/$rideId?offerId=$offerId';
    }
    return '/offers/$rideId';
  }

  void clearPendingDeepLink() {
    pendingDeepLinkRideId = null;
    pendingDeepLinkOfferId = null;
    pendingDeepLinkType = null;
  }

  Future<Map<String, dynamic>> validateBook(String rideId, String offerId) {
    return api.marketplace.validateBook(rideId, offerId);
  }

  Future<Map<String, dynamic>> getPaymentQuote(
    String rideId,
    String offerId, {
    String? paymentMode,
    String? platform,
  }) async {
    final raw = await api.marketplace.paymentQuote(
      rideId: rideId,
      offerId: offerId,
      paymentMode: paymentMode,
      platform: platform ?? (kIsWeb ? 'web' : defaultTargetPlatform.name),
    );
    // Backend nests amounts under paymentQuote; flatten for UI.
    final nested = raw['paymentQuote'];
    final Map<String, dynamic> quote;
    if (nested is Map) {
      quote = {
        ...Map<String, dynamic>.from(nested),
        if (raw['cancellationPolicy'] != null)
          'cancellationPolicy': raw['cancellationPolicy'],
        if (raw['paymentMethods'] != null)
          'paymentMethods': raw['paymentMethods'],
        if (raw['partialEnabled'] != null)
          'partialEnabled': raw['partialEnabled'],
      };
    } else {
      quote = Map<String, dynamic>.from(raw);
    }
    // partialEnabled may only live on nested quote
    if (quote['partialEnabled'] == null && nested is Map) {
      quote['partialEnabled'] = nested['partialEnabled'];
    }
    lastPaymentQuote = quote;
    notifyListeners();
    return quote;
  }

  Future<Offer?> fetchOffer(String rideId, String offerId) async {
    if (!isAuthenticated) return offerByIds(rideId, offerId);
    try {
      final raw = await api.marketplace.getOffer(rideId, offerId);
      final offer = offerFromServer(raw);
      final list = List<Offer>.from(_serverOffers[rideId] ?? const []);
      final idx = list.indexWhere((o) => o.id == offerId);
      if (idx >= 0) {
        list[idx] = offer;
      } else {
        list.add(offer);
      }
      _serverOffers[rideId] = list;
      notifyListeners();
      return offer;
    } catch (e) {
      debugPrint('fetchOffer: $e');
      return offerByIds(rideId, offerId);
    }
  }

  Future<List<Review>> fetchOfferReviews(String offerId) async {
    try {
      final raw = await api.marketplace.listOfferReviews(offerId);
      final list = (raw['_list'] as List?) ??
          (raw['reviews'] as List?) ??
          (raw['items'] as List?) ??
          [];
      return list.whereType<Map>().map((r) {
        DateTime? created;
        final ca = r['createdAt'];
        if (ca is String) created = DateTime.tryParse(ca);
        return Review(
          stars: (r['stars'] as num?)?.toInt() ?? 0,
          text: r['text']?.toString() ?? '',
          fromLanguage: r['translatedFrom']?.toString() ??
              r['fromLanguage']?.toString(),
          createdAt: created,
        );
      }).toList();
    } catch (e) {
      debugPrint('fetchOfferReviews: $e');
      return const [];
    }
  }

  Future<Map<String, dynamic>> getPaymentStatus(String rideId) =>
      api.marketplace.paymentStatus(rideId);

  Future<void> cancelRide(String rideId) async {
    final ride = rideById(rideId);
    final status = (ride?.serverStatus ?? '').toUpperCase();
    const bookedCancel = {
      'BOOKED',
      'DRIVER_EN_ROUTE',
      'DRIVER_ARRIVED',
    };
    if (bookedCancel.contains(status)) {
      await api.marketplace.cancelBookedRide(rideId);
    } else {
      await api.marketplace.cancelRide(rideId);
    }
    await refreshRide(rideId);
    notifyListeners();
  }

  Future<Map<String, dynamic>> updateRide(
    String rideId, {
    String? fromLabel,
    String? toLabel,
    double? fromLat,
    double? fromLng,
    double? toLat,
    double? toLng,
    String? pickupAt,
    List<String>? vehicleClassIds,
    int? adults,
    Map<String, int>? childSeatsJson,
    String? flight,
    String? returnFlight,
    String? signage,
    String? comment,
    bool? isRoundTrip,
    String? returnAt,
    int? pickupWaitMin,
    int? returnWaitMin,
    double? hours,
    double? days,
  }) async {
    final updated = await api.marketplace.updateRide(
      rideId,
      fromLabel: fromLabel,
      toLabel: toLabel,
      fromLat: fromLat,
      fromLng: fromLng,
      toLat: toLat,
      toLng: toLng,
      pickupAt: pickupAt,
      vehicleClassIds: vehicleClassIds,
      adults: adults,
      childSeatsJson: childSeatsJson,
      flight: flight,
      returnFlight: returnFlight,
      signage: signage,
      comment: comment,
      isRoundTrip: isRoundTrip,
      returnAt: returnAt,
      pickupWaitMin: pickupWaitMin,
      returnWaitMin: returnWaitMin,
      hours: hours,
      days: days,
    );
    await refreshRide(rideId);
    notifyListeners();
    return updated;
  }

  Future<Map<String, dynamic>> rateRide(
    String rideId, {
    required int stars,
    int? communicationStars,
    int? driverStars,
    int? vehicleStars,
    String? comment,
  }) async {
    final res = await api.marketplace.rateRide(
      rideId,
      stars: stars,
      communicationStars: communicationStars,
      driverStars: driverStars,
      vehicleStars: vehicleStars,
      comment: comment,
    );
    await refreshRide(rideId);
    notifyListeners();
    return res;
  }

  Future<List<Map<String, dynamic>>> listRideRatings(String rideId) async {
    final raw = await api.marketplace.listRideRatings(rideId);
    return raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  /// Returns the current user's rating for [rideId], or null if not rated yet.
  Future<Map<String, dynamic>?> myRideRating(String rideId) async {
    final uid = me?['id']?.toString();
    if (uid == null || uid.isEmpty) return null;
    try {
      final list = await listRideRatings(rideId);
      for (final r in list) {
        if (r['fromUserId']?.toString() == uid) return r;
      }
    } catch (_) {}
    return null;
  }

  Future<Map<String, dynamic>> getChat(String rideId) =>
      api.marketplace.getChatThread(rideId);

  Future<Map<String, dynamic>> sendChat(String rideId, String body) =>
      api.marketplace.sendChatMessage(rideId, body);

  Future<Map<String, dynamic>> getRideContact(String rideId) =>
      api.marketplace.getRideContact(rideId);

  Future<Map<String, dynamic>> getRideTracking(String rideId) =>
      api.marketplace.getRideTracking(rideId);

  Future<Map<String, dynamic>> createChangeRequest(
    String rideId, {
    required String type,
    String? proposedPickupAt,
    String? note,
    String? flightNumber,
    String? contactPhone,
  }) async {
    final res = await api.marketplace.createChangeRequest(
      rideId,
      type: type,
      proposedPickupAt: proposedPickupAt,
      note: note,
      flightNumber: flightNumber,
      contactPhone: contactPhone,
    );
    if (type == 'LOST_ITEM') {
      final idx = repo.rides.indexWhere((r) => r.id == rideId);
      if (idx >= 0) {
        final existing = repo.rides[idx];
        repo.rides[idx] = RideRequest(
          id: existing.id,
          datetimeLabel: existing.datetimeLabel,
          from: existing.from,
          to: existing.to,
          distance: existing.distance,
          duration: existing.duration,
          timeBadge: existing.timeBadge,
          status: existing.status,
          offerCount: existing.offerCount,
          returnLabel: existing.returnLabel,
          isRoundTrip: existing.isRoundTrip,
          selectedOfferId: existing.selectedOfferId,
          serverStatus: existing.serverStatus,
          shortId: existing.shortId,
          createdAtLabel: existing.createdAtLabel,
          viewCount: existing.viewCount,
          currency: existing.currency,
          hasLostItemRequest: true,
          lostItem: LostItemDetails(
            caseId: res['id']?.toString() ?? '',
            status: 'REPORTED',
            contactPhone: contactPhone,
            itemDescription: note,
            reportedAt: DateTime.now(),
          ),
        );
        notifyListeners();
      }
    }
    return res;
  }

  Future<Map<String, dynamic>> markLostItemReturned(
    String rideId, {
    String? note,
  }) async {
    final res = await api.marketplace.markLostItemReturned(
      rideId,
      note: note,
    );
    await refreshRide(rideId);
    notifyListeners();
    return res;
  }

  Future<void> recordRideView(String rideId) async {
    if (!isAuthenticated) return;
    try {
      final res = await api.marketplace.recordRideView(rideId);
      final count = (res['viewCount'] as num?)?.toInt();
      if (count != null) {
        final idx = repo.rides.indexWhere((r) => r.id == rideId);
        if (idx >= 0) {
          final existing = repo.rides[idx];
          repo.rides[idx] = RideRequest(
            id: existing.id,
            datetimeLabel: existing.datetimeLabel,
            from: existing.from,
            to: existing.to,
            distance: existing.distance,
            duration: existing.duration,
            timeBadge: existing.timeBadge,
            status: existing.status,
            offerCount: existing.offerCount,
            returnLabel: existing.returnLabel,
            isRoundTrip: existing.isRoundTrip,
            selectedOfferId: existing.selectedOfferId,
            serverStatus: existing.serverStatus,
            shortId: existing.shortId,
            createdAtLabel: existing.createdAtLabel,
            viewCount: count,
            currency: existing.currency,
            hasLostItemRequest: existing.hasLostItemRequest,
          );
          notifyListeners();
        }
      }
    } catch (e) {
      debugPrint('recordRideView: $e');
    }
  }

  /// Select offer then create payment intent using server-quoted amounts only.
  Future<Map<String, dynamic>> pay({
    required String rideId,
    required String offerId,
    required String paymentMode,
    required String paymentMethod,
    required bool termsAccepted,
    String? idempotencyKey,
  }) async {
    await selectOffer(rideId, offerId);
    final result = await api.marketplace.createPaymentIntent(
      rideId,
      paymentMode: paymentMode,
      paymentMethod: paymentMethod,
      termsAccepted: termsAccepted,
      platform: kIsWeb ? 'web' : defaultTargetPlatform.name,
      idempotencyKey: idempotencyKey,
    );
    lastPaymentResult = result;
    await refreshRide(rideId);
    notifyListeners();
    return result;
  }

  Future<void> selectOffer(String rideId, String offerId) async {
    if (isAuthenticated) {
      final updated = await api.marketplace.selectOffer(rideId, offerId);
      final ride = rideFromServer(updated);
      final idx = repo.rides.indexWhere((r) => r.id == rideId);
      if (idx >= 0) {
        repo.rides[idx] = ride;
      } else {
        repo.rides.insert(0, ride);
      }
      _serverRideStatus[rideId] =
          updated['status'] as String? ?? 'PAYMENT_PENDING';
      notifyListeners();
      return;
    }
    repo.selectOffer(rideId, offerId);
    notifyListeners();
  }

  /// @deprecated Prefer [pay] with explicit mode/method.
  Future<void> paySelectedOffer(String rideId) async {
    await api.marketplace.createPaymentIntent(rideId);
    await refreshRidesFromServer();
    notifyListeners();
  }

  Future<void> registerPushTokenIfAvailable({
    required String token,
    required String platform,
  }) async {
    if (!isAuthenticated) return;
    try {
      await api.marketplace.registerDeviceToken(
        token: token,
        platform: platform,
        appRole: kIsWeb ? 'PASSENGER_WEB' : 'PASSENGER',
      );
    } catch (e) {
      debugPrint('registerPushTokenIfAvailable: $e');
    }
  }

  void onAppResumed() {
    if (isAuthenticated) {
      unawaited(refreshRidesFromServer());
      unawaited(startRideRealtime());
      unawaited(refreshUnreadNotificationCount());
      _syncOpenRidePolling();
    }
  }

  Future<void> startRideRealtime() async {
    if (!isAuthenticated) return;
    _realtime ??= RideRealtime(
      session: api,
      onOfferEvent: _handleOfferRealtimeEvent,
    );
    await _realtime!.connect();
    _syncRealtimeRideRooms();
  }

  void stopRideRealtime() {
    _realtime?.disconnect();
    _realtime = null;
  }

  void _handleOfferRealtimeEvent(Map<String, dynamic> payload) {
    final type = payload['type']?.toString() ?? '';
    final rideId = payload['rideId']?.toString();
    final offerId = payload['offerId']?.toString();
    final supersededOfferId = payload['supersededOfferId']?.toString();
    if (rideId == null || rideId.isEmpty) {
      unawaited(refreshRidesFromServer());
      return;
    }
    final isOfferEvent = type.isEmpty ||
        type == 'offer.created' ||
        type == 'offer.updated' ||
        type == 'offer.withdrawn' ||
        type == 'offer.reserved' ||
        type == 'offer.reservation_released';
    final isBookingEvent =
        type == 'ride.booked' || payload['status']?.toString() == 'BOOKED';
    if (type == 'offer.created') {
      pendingOfferRideId = rideId;
      pendingOfferAlert = 'New offer on your ride';
    }
    if (type == 'offer.updated') {
      pendingOfferRideId = rideId;
      pendingOfferAlert = 'Offer updated on your ride';
      pendingOfferEventType = 'offer.updated';
      pendingOfferEventRideId = rideId;
      pendingOfferEventOfferId = offerId;
      pendingOfferEventSupersededId = supersededOfferId;
    }
    if (type == 'offer.withdrawn') {
      pendingOfferRideId = rideId;
      pendingOfferAlert = 'An offer was withdrawn';
      pendingOfferEventType = 'offer.withdrawn';
      pendingOfferEventRideId = rideId;
      pendingOfferEventOfferId = offerId;
      pendingOfferEventSupersededId = null;
      // Drop withdrawn offer from local cache immediately.
      final cached = _serverOffers[rideId];
      if (cached != null && offerId != null) {
        _serverOffers[rideId] =
            cached.where((o) => o.id != offerId).toList(growable: false);
      }
    }
    if (isOfferEvent || isBookingEvent) {
      unawaited(refreshRide(rideId));
    }
    if (isBookingEvent) {
      unawaited(refreshRidesFromServer());
    }

    if (type == 'ride.status.changed') {
      final newStatus =
          payload['status']?.toString() ?? payload['to']?.toString() ?? '';
      if (newStatus.isNotEmpty) {
        pendingRideStatusRideId = rideId;
        pendingRideStatusAlert = _rideStatusAlertMessage(newStatus);
        unawaited(refreshRide(rideId));
        unawaited(refreshRidesFromServer());
      }
    }

    notifyListeners();
  }

  String _rideStatusAlertMessage(String status) {
    switch (status.toUpperCase()) {
      case 'BOOKED':
        return 'Your ride is confirmed';
      case 'DRIVER_EN_ROUTE':
        return 'Your driver is on the way';
      case 'DRIVER_ARRIVED':
        return 'Your driver has arrived';
      case 'TRIP_STARTED':
      case 'IN_PROGRESS':
        return 'Your trip has started';
      case 'COMPLETED':
        return 'Ride completed';
      case 'PASSENGER_CANCELLED':
      case 'DRIVER_CANCELLED':
      case 'ADMIN_CANCELLED':
        return 'Ride cancelled';
      default:
        return 'Ride status updated';
    }
  }

  void clearPendingRideStatusAlert() {
    if (pendingRideStatusAlert == null && pendingRideStatusRideId == null) {
      return;
    }
    pendingRideStatusAlert = null;
    pendingRideStatusRideId = null;
    notifyListeners();
  }

  void clearPendingOfferAlert() {
    if (pendingOfferAlert == null && pendingOfferRideId == null) return;
    pendingOfferAlert = null;
    pendingOfferRideId = null;
    notifyListeners();
  }

  void clearPendingOfferDetailEvent() {
    if (pendingOfferEventType == null) return;
    pendingOfferEventType = null;
    pendingOfferEventRideId = null;
    pendingOfferEventOfferId = null;
    pendingOfferEventSupersededId = null;
    notifyListeners();
  }

  Iterable<String> get _openOfferRideIds sync* {
    for (final r in repo.rides) {
      if (r.status == RideStatus.waitingOffers ||
          r.status == RideStatus.chooseOffer) {
        yield r.id;
      }
    }
  }

  Iterable<String> get _activeTripRideIds sync* {
    for (final r in repo.rides) {
      if (r.status == RideStatus.booked) yield r.id;
    }
  }

  Iterable<String> get _realtimeRideIds sync* {
    yield* _openOfferRideIds;
    yield* _activeTripRideIds;
  }

  void _syncRealtimeRideRooms() {
    _realtime?.syncRideSubscriptions(_realtimeRideIds);
  }

  void _syncOpenRidePolling() {
    final needsPoll = _openOfferRideIds.isNotEmpty;
    if (!needsPoll || !isAuthenticated) {
      _stopOpenRidePolling();
      return;
    }
    _openRidePoll ??= Timer.periodic(const Duration(seconds: 4), (_) {
      if (!isAuthenticated) {
        _stopOpenRidePolling();
        return;
      }
      if (_openOfferRideIds.isEmpty) {
        _stopOpenRidePolling();
        return;
      }
      unawaited(refreshRidesFromServer());
    });
  }

  void _stopOpenRidePolling() {
    _openRidePoll?.cancel();
    _openRidePoll = null;
  }

  void setShellTab(int index) {
    shellTabIndex = index;
    notifyListeners();
  }

  void refresh() => notifyListeners();

  Future<void> setOnboarded(bool value) async {
    onboarded = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_onboardedKey, value);
    notifyListeners();
  }

  void setServiceType(ServiceType type) {
    if (serviceType == type) return;
    serviceType = type;
    if (type == ServiceType.perHour &&
        perHourDurationMinutes == null &&
        !perHourHasEnd) {
      perHourDurationMinutes = 60;
      _syncRideEndsFromDuration();
    }
    notifyListeners();
  }

  List<GtRouteOption> availableRoutes = const [];
  int selectedRouteIndex = 0;

  GtRouteOption? get selectedRoute =>
      availableRoutes.isNotEmpty && selectedRouteIndex < availableRoutes.length
          ? availableRoutes[selectedRouteIndex]
          : null;

  void setAvailableRoutes(List<GtRouteOption> routes) {
    availableRoutes = routes;
    if (selectedRouteIndex >= routes.length) {
      selectedRouteIndex = 0;
    }
    notifyListeners();
  }

  void selectRoute(GtRouteOption route) {
    final idx = availableRoutes.indexWhere((r) => r.id == route.id);
    if (idx >= 0 && idx != selectedRouteIndex) {
      selectedRouteIndex = idx;
      notifyListeners();
    }
  }

  void selectRouteIndex(int index) {
    if (index >= 0 &&
        index < availableRoutes.length &&
        index != selectedRouteIndex) {
      selectedRouteIndex = index;
      notifyListeners();
    }
  }

  void setFrom(Place? place) {
    from = place;
    availableRoutes = const [];
    selectedRouteIndex = 0;
    notifyListeners();
  }

  void setTo(Place? place) {
    to = place;
    availableRoutes = const [];
    selectedRouteIndex = 0;
    notifyListeners();
  }

  void swapRoute() {
    final tmp = from;
    from = to;
    to = tmp;
    availableRoutes = const [];
    selectedRouteIndex = 0;
    notifyListeners();
  }

  void setVehicleClass(String id) {
    // All vehicle classes remain selected so drivers of any class can offer.
    vehicleClassIds = MockData.vehicleClasses.map((v) => v.id).toSet();
    notifyListeners();
  }

  void toggleVehicleClass(String id) {
    // All vehicle classes remain selected so drivers of any class can offer.
    vehicleClassIds = MockData.vehicleClasses.map((v) => v.id).toSet();
    notifyListeners();
  }

  void setAdults(int value) {
    adults = value;
    notifyListeners();
  }

  void setChildSeats(ChildSeats seats) {
    childSeats = seats;
    notifyListeners();
  }

  void setFlight(String value) {
    flight = value;
    notifyListeners();
  }

  void setSignage(String value) {
    signage = value;
    notifyListeners();
  }

  void setReturnEnabled(bool value) {
    returnEnabled = value;
    if (value && returnDateTime == null) {
      final start = effectivePickupDateTime;
      returnDateTime = start.add(const Duration(hours: 3));
    } else if (!value) {
      returnDateTime = null;
      returnFlight = '';
    }
    notifyListeners();
  }

  void setReturnDateTime(DateTime? value) {
    returnDateTime = value;
    notifyListeners();
  }

  void setReturnFlight(String value) {
    returnFlight = value;
    notifyListeners();
  }

  void setComment(String value) {
    comment = value;
    notifyListeners();
  }

  void appendCommentChip(String chip) {
    if (comment.contains(chip)) return;
    comment = comment.isEmpty ? chip : '$comment. $chip';
    notifyListeners();
  }

  void setPromoEnabled(bool value) {
    promoEnabled = value;
    notifyListeners();
  }

  void setPromoCode(String value) {
    promoCode = value;
    notifyListeners();
  }

  void setTermsAccepted(bool value) {
    termsAccepted = value;
    notifyListeners();
  }

  void setPickupNow(bool value) {
    pickupNow = value;
    if (value) pickupDateTime = DateTime.now();
    _syncRideEndsFromDuration();
    notifyListeners();
  }

  void setPickupDateTime(DateTime value) {
    pickupDateTime = value;
    pickupNow = false;
    _syncRideEndsFromDuration();
    notifyListeners();
  }

  DateTime get effectivePickupDateTime =>
      pickupNow ? DateTime.now() : pickupDateTime;

  void setPerHourDurationMinutes(int minutes) {
    perHourDurationMinutes = minutes;
    rideEndsDateTime =
        effectivePickupDateTime.add(Duration(minutes: minutes));
    notifyListeners();
  }

  void setRideEndsDateTime(DateTime value) {
    rideEndsDateTime = value;
    final diff = value.difference(effectivePickupDateTime).inMinutes;
    const options = [30, 60, 120, 180];
    perHourDurationMinutes = options.contains(diff) ? diff : null;
    notifyListeners();
  }

  void _syncRideEndsFromDuration() {
    if (perHourDurationMinutes != null) {
      rideEndsDateTime = effectivePickupDateTime
          .add(Duration(minutes: perHourDurationMinutes!));
    }
  }

  void setPerHourHasEnd(bool value) {
    perHourHasEnd = value;
    if (!value) to = null;
    notifyListeners();
  }

  String formatDateTimeLabel(DateTime d) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec',
    ];
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    final day = days[d.weekday - 1];
    final hour = d.hour % 12 == 0 ? 12 : d.hour % 12;
    final ampm = d.hour >= 12 ? 'PM' : 'AM';
    final min = d.minute.toString().padLeft(2, '0');
    return '$day ${d.day} ${months[d.month - 1]}, $hour:$min $ampm';
  }

  void setLocationField(String field) {
    locationField = field;
  }

  void applyPickedPlace(Place place) {
    if (locationField == 'to') {
      to = place;
    } else {
      from = place;
    }
    // Caller should pop navigation first; notify separately via refresh()
    // to avoid GoRouter refreshListenable cancelling the pop.
  }

  void applyPickedPlaceAndNotify(Place place) {
    applyPickedPlace(place);
    notifyListeners();
  }

  void updateProfile({String? fullName, String? email, String? phone}) {
    if (fullName != null) repo.passenger.fullName = fullName;
    if (email != null) repo.passenger.email = email;
    if (phone != null) repo.passenger.phone = phone;
    if (me != null) {
      me = {
        ...me!,
        if (fullName != null) 'fullName': fullName,
        if (email != null) 'email': email,
        if (phone != null) 'phoneE164': phone,
      };
    }
    notifyListeners();
  }

  void setLanguage(String value) {
    language = value;
    notifyListeners();
  }

  void setCurrency(String value) {
    currency = 'CAD';
    notifyListeners();
  }

  void setDistanceUnit(String value) {
    distanceUnit = value;
    notifyListeners();
  }

  void setNotificationsEnabled(bool value) {
    notificationsEnabled = value;
    notifyListeners();
  }

  Future<void> logout() async {
    final refresh = await api.client.tokens.readRefresh();
    await api.auth.logout(refreshToken: refresh);
    stopRideRealtime();
    _stopOpenRidePolling();
    from = null;
    to = null;
    comment = '';
    promoEnabled = false;
    promoCode = '';
    termsAccepted = false;
    me = null;
    isAuthenticated = false;
    unreadNotificationCount = 0;
    clearAvatarState();
    _serverOffers.clear();
    _serverRideStatus.clear();
    repo.rides.clear();
    pendingOfferAlert = null;
    pendingOfferRideId = null;
    _clearLocalProfile();
    placeSearchHistory = const [];
    notifyListeners();
    await _loadPlaceSearchHistory();
    notifyListeners();
  }

  /// Kept for older call sites; prefer [logout].
  void logoutSim() {
    logout();
  }

  void deleteAccountSim() {
    _clearLocalProfile();
    logoutSim();
  }

  RideRequest? rideById(String id) {
    try {
      return repo.rides.firstWhere((r) => r.id == id);
    } catch (_) {
      return null;
    }
  }

  bool isRideBooked(String rideId) {
    final ride = rideById(rideId);
    if (ride == null) return false;
    return ride.isBooked;
  }

  RideRequest? get activeBookedRide {
    try {
      return repo.rides.firstWhere(
        (r) => r.isBooked && (r.serverStatus ?? '').toUpperCase() != 'COMPLETED',
      );
    } catch (_) {
      return null;
    }
  }

  Offer? offerByIds(String rideId, String offerId) {
    try {
      return offersFor(rideId).firstWhere((o) => o.id == offerId);
    } catch (_) {
      return null;
    }
  }

  String formatPickupLabel() {
    return formatDateTimeLabel(effectivePickupDateTime);
  }

  String formatRideEndsLabel() {
    if (rideEndsDateTime == null) return 'Ride ends';
    return formatDateTimeLabel(rideEndsDateTime!);
  }

  String formatReturnLabel() {
    if (returnDateTime == null) return 'Select return date & time';
    return formatDateTimeLabel(returnDateTime!);
  }

  RideRequest createBookingRequest() {
    throw UnsupportedError('Use createBookingRequestAsync()');
  }

  /// Creates a ride via Nest marketplace API (server-authoritative pricing).
  Future<RideRequest> createBookingRequestAsync() async {
    final fromLabel = from?.label ?? MockData.places.first.label;
    String? toLabel;
    String? timeBadge;
    String? returnLabel;

    if (serviceType == ServiceType.perHour) {
      if (perHourHasEnd && to != null) {
        toLabel = to!.label;
      }
      final parts = <String>[formatPickupLabel()];
      if (rideEndsDateTime != null) {
        parts.add('ends ${formatRideEndsLabel()}');
      } else if (perHourDurationMinutes != null) {
        final m = perHourDurationMinutes!;
        parts.add(m < 60 ? '${m}m' : '${m ~/ 60}h');
      }
      timeBadge = parts.join(' · ');
    } else if (to != null) {
      toLabel = to!.label;
    }

    if (returnEnabled && returnDateTime != null) {
      returnLabel = _formatDate(returnDateTime!);
    }

    if (!isAuthenticated) {
      throw StateError('Sign in required to book');
    }

    final pickup = from ?? MockData.places.first;
    final dropoff = to ?? MockData.places[1];
    final service = switch (serviceType) {
      ServiceType.perHour => 'PER_HOUR',
      ServiceType.delivery => 'DELIVERY',
      ServiceType.ride => 'RIDE',
    };
    final needsDropoff =
        serviceType == ServiceType.ride || serviceType == ServiceType.delivery;
    final isPerHour = serviceType == ServiceType.perHour;
    final hours = isPerHour
        ? ((perHourDurationMinutes ?? 60) / 60).clamp(1, 24).toDouble()
        : null;
    final pickupAt = (pickupNow ? DateTime.now() : pickupDateTime)
        .toUtc()
        .toIso8601String();

    await api.marketplace.quote(
      serviceType: service,
      fromLat: pickup.lat,
      fromLng: pickup.lng,
      toLat: needsDropoff ? dropoff.lat : null,
      toLng: needsDropoff ? dropoff.lng : null,
      vehicleClass: vehicleClassIds.first,
      currency: 'CAD',
      hours: hours,
    );

    final childSeatsPayload =
        childSeats.total > 0 ? childSeats.toJson() : null;
    final isRoundTrip = returnEnabled;
    if (returnEnabled && returnDateTime == null) {
      final start = pickupNow ? DateTime.now() : pickupDateTime;
      returnDateTime = start.add(const Duration(hours: 3));
    }
    if (returnEnabled && returnDateTime != null) {
      returnLabel = _formatDate(returnDateTime!);
    }
    final returnAt = isRoundTrip && returnDateTime != null
        ? returnDateTime!.toUtc().toIso8601String()
        : null;

    final created = await api.marketplace.createRide(
      serviceType: service,
      fromLabel: fromLabel,
      toLabel: toLabel,
      fromLat: pickup.lat,
      fromLng: pickup.lng,
      toLat: needsDropoff ? dropoff.lat : null,
      toLng: needsDropoff ? dropoff.lng : null,
      currency: 'CAD',
      pickupAt: pickupAt,
      vehicleClassIds: vehicleClassIds.toList(),
      adults: adults,
      childSeatsJson: childSeatsPayload,
      flight: flight.isEmpty ? null : flight,
      signage: signage.isEmpty ? null : signage,
      comment: comment.isEmpty ? null : comment,
      isRoundTrip: isRoundTrip,
      returnAt: returnAt,
      returnFlight: returnFlight.isEmpty ? null : returnFlight,
      promoCode: promoEnabled && promoCode.isNotEmpty ? promoCode : null,
      hours: hours,
    );

    final ride = rideFromServer(created);
    if (timeBadge != null) {
      // preserve UI badge via local overlay fields on copy
    }
    final local = RideRequest(
      id: ride.id,
      datetimeLabel: ride.datetimeLabel,
      from: fromLabel,
      to: toLabel,
      distance: ride.distance,
      duration: ride.duration,
      timeBadge: timeBadge ?? ride.timeBadge,
      status: ride.status,
      offerCount: ride.offerCount,
      returnLabel: returnLabel ?? ride.returnLabel,
      isRoundTrip: isRoundTrip || ride.isRoundTrip,
      selectedOfferId: ride.selectedOfferId,
      serverStatus: ride.serverStatus,
      shortId: ride.shortId,
      createdAtLabel: ride.createdAtLabel,
      viewCount: ride.viewCount,
      currency: ride.currency,
      hasLostItemRequest: ride.hasLostItemRequest,
    );
    final idx = repo.rides.indexWhere((r) => r.id == local.id);
    if (idx >= 0) {
      repo.rides[idx] = local;
    } else {
      repo.rides.insert(0, local);
    }
    _serverRideStatus[local.id] =
        created['status'] as String? ?? 'WAITING_FOR_OFFERS';
    _serverOffers[local.id] = const [];
    unawaited(startRideRealtime());
    _realtime?.subscribeRide(local.id);
    _syncOpenRidePolling();
    notifyListeners();
    return local;
  }

  String _formatDate(DateTime d) => formatDateTimeLabel(d);

  List<Offer> offersFor(String rideId) {
    // Authenticated passengers only see real server offers (never mock bids).
    if (isAuthenticated) {
      return _serverOffers[rideId] ?? const [];
    }
    final cached = _serverOffers[rideId];
    if (cached != null) return cached;
    return repo.offersFor(rideId);
  }
}
