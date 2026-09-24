import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../offer/offer_helpers.dart';
import '../payment/payment_details_rules.dart';
import '../services/marketplace_realtime.dart';
import 'driver_settings_mappers.dart';

class AppState extends ChangeNotifier {
  AppState();

  final MockRepository repo = MockRepository.instance;
  final CanGoSession api = CanGoSession();
  MarketplaceRealtime? _realtime;

  /// Latest inbound request alert for in-app banner (cleared by UI).
  String? pendingRequestAlert;
  String? pendingRequestRideId;
  /// Push/alert type e.g. `ride.status`, `ride_request`, `chat`.
  String? pendingAlertType;
  /// Ride status when [pendingAlertType] is `ride.status`.
  String? pendingAlertStatus;

  /// Pending chat deep-link from push (`/chat/:rideId`).
  String? pendingChatRideId;

  static const _kOnboarded = 'driver_onboarded';
  static const _kHasSeenWelcome = 'driver_has_seen_welcome';
  static const _kOperatingZones = 'driver_operating_zones';
  static const _kBaseLat = 'driver_base_lat';
  static const _kBaseLng = 'driver_base_lng';
  static const _kBaseLocation = 'driver_base_location';
  static const _kZonesMigrated = 'driver_zones_migrated';

  bool loaded = false;
  bool hasSeenWelcome = false;
  bool onboardedComplete = false;
  bool isAuthenticated = false;

  /// Wired from [PushService] so token sync runs after login / load.
  Future<void> Function()? syncPushToken;
  bool isActivated = false;
  bool drivingEnabled = false;
  String approvalStatus = 'PENDING_KYC';
  Map<String, dynamic>? me;
  Map<String, dynamic>? driverProfile;
  Map<String, dynamic>? accountStatus;
  Map<String, dynamic>? paymentDetails;

  String? authUserId;
  bool profileSaving = false;
  bool settingsRefreshing = false;
  String? settingsError;

  int settingsZoneCount = 0;
  int settingsVehicleCount = 0;
  String documentsAttentionLabel = '';
  String paymentSummaryLabel = '';

  bool isIndividual = true;
  String fullName = '';
  String legalName = '';
  String registrationNumber = '';
  String taxpayerId = '';
  String address = '';
  String postalCode = '';
  String email = '';
  String phoneE164 = '';
  String baseLocation = '';
  double baseLatitude = 43.8341;
  double baseLongitude = -79.5373;
  List<OperatingZone> operatingZones = [];
  bool hasReferral = false;
  String referralCode = '';
  bool referralImmutable = false;
  bool acceptedTerms = false;

  final List<String> selectedLanguages = [];

  final Map<String, bool> amenities = {
    'Free Wi-Fi': false,
    'Water': false,
    'Charger': false,
    'Disabled': false,
    'Air conditioner': false,
  };

  String defaultDriverName = 'Driver';
  int autocancelBefore = 10;
  int autocancelAfter = 10;

  String billingPeriod = '3 days';
  String outpaymentCurrency = 'CAD';
  String bankCountry = 'Canada';
  String paymentStatus = 'NOT_CONFIGURED';
  String payoutMethod = 'bank_transfer';
  String accountHolderName = '';
  String accountMask = '';
  String? paymentPeriod;
  num? commissionPct;
  String? paymentReviewNote;
  String? paymentReviewedAt;

  String? stripeAccountId;
  String stripeAccountStatus = 'UNLINKED';
  bool stripeChargesEnabled = false;
  bool stripePayoutsEnabled = false;

  /// Bumped on each successful hydrate so screens can ignore stale GETs while editing.
  int paymentDetailsGeneration = 0;
  bool paymentDetailsLoaded = false;

  bool selfieUploaded = false;
  bool licenseUploaded = false;
  bool vehicleDocUploaded = false;
  bool insuranceUploaded = false;
  bool hasExpiredDocumentsFromServer = false;
  int vehiclePhotoCount = 0;
  bool photoRequirementsSeen = false;
  String? primaryVehicleId;
  List<Map<String, dynamic>> documents = [];

  List<DriverRequest> openRequests = [];
  List<DriverRequest> myRides = [];
  final Map<String, OfferDraft> _offerDrafts = {};
  List<DriverVehicle> vehicles = [];
  bool offerSubmitting = false;

  String _prefsKey(String base) =>
      authUserId == null || authUserId!.isEmpty ? base : '${base}_$authUserId';

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    hasSeenWelcome = prefs.getBool(_kHasSeenWelcome) ?? false;
    onboardedComplete = prefs.getBool(_kOnboarded) ?? false;
    baseLocation =
        prefs.getString(_kBaseLocation) ?? repo.driver.baseLocation;
    baseLatitude = prefs.getDouble(_kBaseLat) ?? repo.driver.baseLatitude;
    baseLongitude = prefs.getDouble(_kBaseLng) ?? repo.driver.baseLongitude;
    repo.driver.baseLocation = baseLocation;
    repo.driver.baseLatitude = baseLatitude;
    repo.driver.baseLongitude = baseLongitude;
    operatingZones = _decodeZones(prefs.getString(_kOperatingZones));
    repo.driver.operatingZones = List<OperatingZone>.from(operatingZones);

    isAuthenticated = await api.isAuthenticated();
    if (isAuthenticated) {
      try {
        await refreshMe();
        await refreshDriverSettings(force: true);
        if (isActivated) {
          await refreshOpenRequests();
          await refreshMyRides();
          await startMarketplaceRealtime();
        }
        await syncPushToken?.call();
      } catch (_) {
        isAuthenticated = false;
        await api.clear();
      }
    }

    loaded = true;
    notifyListeners();
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
      role: 'DRIVER',
      fullName: fullName,
    );
  }

  Future<Map<String, dynamic>> sendPhoneOtp(
    String phoneE164, {
    String purpose = 'verify_phone',
  }) {
    return api.auth.sendOtp(phoneE164: phoneE164, purpose: purpose);
  }

  Future<void> verifyOtp({
    required String challengeId,
    required String code,
  }) async {
    await api.auth.verifyOtp(
      challengeId: challengeId,
      code: code,
      role: 'DRIVER',
    );
    isAuthenticated = true;
    await refreshMe();
    await refreshDriverSettings(force: true);
    if (isActivated) {
      await refreshOpenRequests();
      await refreshMyRides();
      await startMarketplaceRealtime();
    }
    await syncPushToken?.call();
    notifyListeners();
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
      role: 'DRIVER',
    );
    if (!result.requiresPhoneLink) {
      isAuthenticated = true;
      await refreshMe();
      await refreshDriverSettings(force: true);
      if (isActivated) {
        await refreshOpenRequests();
        await refreshMyRides();
        await startMarketplaceRealtime();
      }
      await syncPushToken?.call();
      notifyListeners();
    }
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

  Future<void> login({
    required String email,
    required String password,
  }) async {
    await api.auth.login(
      email: email,
      password: password,
      role: 'DRIVER',
    );
    isAuthenticated = true;
    await refreshMe();
    await refreshDriverSettings(force: true);
    if (isActivated) {
      await refreshOpenRequests();
      await refreshMyRides();
      await startMarketplaceRealtime();
    }
    await syncPushToken?.call();
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
        appRole: 'DRIVER',
      );
    } catch (e) {
      debugPrint('registerPushTokenIfAvailable: $e');
    }
  }

  void applyPushAlert({
    required String rideId,
    String? title,
    String? type,
    String? status,
  }) {
    if (type == 'chat') {
      pendingChatRideId = rideId;
      pendingRequestAlert = title ?? 'New message';
      pendingAlertType = 'chat';
      pendingAlertStatus = null;
      notifyListeners();
      return;
    }
    pendingRequestRideId = rideId;
    pendingAlertType = type;
    pendingAlertStatus = status;
    if (type == 'ride.status') {
      pendingRequestAlert = title ?? 'Trip updated';
    } else {
      pendingRequestAlert = title ?? 'New ride request';
    }
    notifyListeners();
  }

  /// Deep-link path for a ride alert (trip vs open request vs chat).
  static String rideDeepLinkPath({
    required String rideId,
    String? type,
    String? status,
  }) {
    if (type == 'chat') return '/chat/$rideId';
    if (_isTripLifecycleType(type, status)) return '/trip/$rideId';
    return '/request/$rideId';
  }

  static bool _isTripLifecycleType(String? type, String? status) {
    final t = (type ?? '').toLowerCase();
    if (t == 'ride.status' || t == 'ride_status') return true;
    const tripStatuses = {
      'BOOKED',
      'DRIVER_EN_ROUTE',
      'DRIVER_ARRIVED',
      'TRIP_STARTED',
      'IN_PROGRESS',
      'COMPLETED',
      'NO_SHOW',
      'PASSENGER_CANCELLED',
      'DRIVER_CANCELLED',
      'ADMIN_CANCELLED',
    };
    final st = (status ?? '').toUpperCase();
    return tripStatuses.contains(st);
  }

  String? consumeChatDeepLinkPath() {
    final rideId = pendingChatRideId;
    if (rideId == null || rideId.isEmpty) return null;
    pendingChatRideId = null;
    return '/chat/$rideId';
  }

  Future<Map<String, dynamic>> getChat(String rideId) =>
      api.marketplace.getChatThread(rideId);

  Future<Map<String, dynamic>> sendChat(String rideId, String body) =>
      api.marketplace.sendChatMessage(rideId, body);

  Future<Map<String, dynamic>> getRideContact(String rideId) =>
      api.marketplace.getRideContact(rideId);

  Future<Map<String, dynamic>> rateRide(
    String rideId, {
    required int stars,
    String? comment,
  }) =>
      api.marketplace.rateRide(rideId, stars: stars, comment: comment);

  Future<List<Map<String, dynamic>>> listRideRatings(String rideId) async {
    final raw = await api.marketplace.listRideRatings(rideId);
    return raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  Future<Map<String, dynamic>?> myRideRating(String rideId) async {
    final uid = me?['id']?.toString() ?? authUserId;
    if (uid == null || uid.isEmpty) return null;
    try {
      final list = await listRideRatings(rideId);
      for (final r in list) {
        if (r['fromUserId']?.toString() == uid) return r;
      }
    } catch (_) {}
    return null;
  }

  static const chatAllowedStatuses = {
    'BOOKED',
    'DRIVER_EN_ROUTE',
    'DRIVER_ARRIVED',
    'TRIP_STARTED',
    'IN_PROGRESS',
  };

  List<DriverRequest> get chatableRides {
    return myRides.where((r) {
      final status = (r.status ?? '').toUpperCase();
      return chatAllowedStatuses.contains(status);
    }).toList();
  }

  Future<void> refreshMe() async {
    me = await api.auth.me();
    authUserId = me?['id']?.toString() ?? me?['user']?['id']?.toString();
    final driver = me?['driver'] as Map<String, dynamic>?;
    if (driver != null) {
      isActivated = driver['isActivated'] == true;
      repo.driver.isActivated = isActivated;
      drivingEnabled = driver['drivingEnabled'] == true;
      final status = driver['approvalStatus']?.toString();
      if (status != null && status.isNotEmpty) {
        approvalStatus = status;
      }
      final name = driver['fullName'] as String?;
      if (name != null && name.isNotEmpty) {
        fullName = name;
        repo.driver.fullName = name;
        defaultDriverName = name;
      }
      await _syncOnboardedFromServer(hasDocuments: false);
      if (isActivated) {
        unawaited(startMarketplaceRealtime());
      } else {
        stopMarketplaceRealtime();
      }
    }
    if (me != null) {
      await _applyAvatarMetaFromMe(me!);
    } else {
      clearAvatarState();
    }
    unawaited(refreshUnreadNotificationCount());
  }

  Future<void> setDrivingMode(bool enabled) async {
    if (enabled && hasExpiredDocuments) {
      throw Exception(
        'Cannot go online: you have expired documents. Please re-upload updated documents.',
      );
    }
    final res = await api.driver.setAvailability(enabled: enabled);
    drivingEnabled = res['enabled'] == true;
    notifyListeners();
  }

  /// Legacy signed URL from `/auth/me` — not used for rendering.
  String? avatarUrl;
  Uint8List? avatarBytes;
  String? avatarStorageKey;
  String? avatarVersion;
  bool avatarLoading = false;
  bool avatarUploading = false;
  int _avatarLoadGen = 0;
  String? _avatarOwnerUserId;
  int unreadNotificationCount = 0;

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
    avatarUrl = null;
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
    final url = _extractAvatarUrl(m);
    avatarUrl = url;

    final keyChanged = key != avatarStorageKey || version != avatarVersion;
    avatarStorageKey = key;
    avatarVersion = version;

    if (key == null || key.isEmpty) {
      avatarBytes = null;
      avatarLoading = false;
      if (userId != null) await _clearAvatarCache(userId);
      return;
    }

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
    final driver = m['driver'];
    if (driver is Map) {
      final url = driver['avatarUrl']?.toString();
      if (url != null && url.isNotEmpty) return rewriteMediaUrl(url);
    }
    final top = m['avatarUrl']?.toString();
    if (top != null && top.isNotEmpty) return rewriteMediaUrl(top);
    return null;
  }

  static String? _extractAvatarStorageKey(Map<String, dynamic> m) {
    final top = m['avatarStorageKey']?.toString();
    if (top != null && top.isNotEmpty) return top;
    final driver = m['driver'];
    if (driver is Map) {
      final k = driver['avatarStorageKey']?.toString();
      if (k != null && k.isNotEmpty) return k;
    }
    final passenger = m['passenger'];
    if (passenger is Map) {
      final k = passenger['avatarStorageKey']?.toString();
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
      if (gen != _avatarLoadGen) return;
      if (avatarUploading) return;
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
      notifyListeners();
    }
  }

  Future<void> uploadAvatar(Uint8List bytes, {String filename = 'avatar.jpg'}) async {
    if (!isAuthenticated) {
      throw StateError('Not authenticated');
    }
    final prevBytes = avatarBytes;
    final prevKey = avatarStorageKey;
    final prevVersion = avatarVersion;
    final prevUrl = avatarUrl;

    _avatarLoadGen++;
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
      avatarVersion =
          (version != null && version.isNotEmpty) ? version : avatarStorageKey;
      if (url != null && url.isNotEmpty) {
        avatarUrl = rewriteMediaUrl(url);
      }
      final owner = _avatarOwnerUserId ?? authUserId ?? me?['id']?.toString();
      if (owner != null && avatarVersion != null) {
        unawaited(
          _persistAvatarCache(
            userId: owner,
            version: avatarVersion!,
            bytes: bytes,
          ),
        );
      }
      avatarUploading = false;
      notifyListeners();
    } catch (e) {
      avatarBytes = prevBytes;
      avatarStorageKey = prevKey;
      avatarVersion = prevVersion;
      avatarUrl = prevUrl;
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
    final prevUrl = avatarUrl;
    final owner = _avatarOwnerUserId;

    _avatarLoadGen++;
    avatarUploading = true;
    avatarBytes = null;
    avatarStorageKey = null;
    avatarVersion = null;
    avatarUrl = null;
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
      avatarUrl = prevUrl;
      avatarUploading = false;
      notifyListeners();
      rethrow;
    }
  }

  Future<List<Map<String, dynamic>>> listNotifications({int limit = 50}) async {
    if (!isAuthenticated) return const [];
    final raw = await api.notifications.list(limit: limit, appRole: 'DRIVER');
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
      final raw = await api.notifications.unreadCount(appRole: 'DRIVER');
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

  /// Load profile, zones, vehicles, documents, payment from backend.
  Future<void> refreshDriverSettings({bool force = false}) async {
    if (!isAuthenticated) return;
    if (settingsRefreshing && !force) return;
    settingsRefreshing = true;
    settingsError = null;
    notifyListeners();
    try {
      await Future.wait([
        loadDriverProfile(),
        syncDocumentsStatus(),
        loadOperatingZones(),
        loadDriverVehicles(),
        loadPaymentDetails().catchError((_) => null),
        loadWallet().catchError((_) => <String, dynamic>{}),
      ]);
      if (accountStatus != null) {
        final label = accountStatus!['label']?.toString();
        if (label != null && label.isNotEmpty) {
          // partnerStatusLabel getter prefers accountStatus
        }
      }
    } catch (e) {
      settingsError = e.toString();
      debugPrint('refreshDriverSettings: $e');
    } finally {
      settingsRefreshing = false;
      notifyListeners();
    }
  }

  Future<void> loadDriverProfile() async {
    if (!isAuthenticated) return;
    final profile = await api.driver.me();
    driverProfile = profile;
    accountStatus = profile['accountStatus'] is Map
        ? Map<String, dynamic>.from(profile['accountStatus'] as Map)
        : null;

    isIndividual = profile['isIndividual'] != false;
    fullName = profile['fullName'] as String? ?? fullName;
    legalName = profile['legalName'] as String? ?? '';
    registrationNumber = profile['registrationNumber'] as String? ?? '';
    taxpayerId = profile['taxpayerId'] as String? ?? '';
    address = profile['address'] as String? ??
        profile['addressLine1'] as String? ??
        '';
    postalCode = profile['postalCode'] as String? ?? '';
    email = profile['email'] as String? ?? '';
    phoneE164 = profile['phoneE164'] as String? ?? '';
    baseLocation = profile['baseLocation'] as String? ?? baseLocation;
    final lat = profile['baseLatitude'];
    final lng = profile['baseLongitude'];
    if (lat is num) baseLatitude = lat.toDouble();
    if (lng is num) baseLongitude = lng.toDouble();
    referralCode = profile['referralCode'] as String? ?? '';
    referralImmutable = profile['referralImmutable'] == true;
    hasReferral = referralCode.isNotEmpty;
    isActivated = profile['isActivated'] == true;
    approvalStatus =
        profile['approvalStatus']?.toString() ?? approvalStatus;

    selectedLanguages
      ..clear()
      ..addAll(
        (profile['languages'] as List?)
                ?.whereType<String>()
                .map((e) => e.toUpperCase()) ??
            const [],
      );

    final summaries = profile['summaries'];
    if (summaries is Map) {
      settingsZoneCount = (summaries['zoneCount'] as num?)?.toInt() ?? 0;
      settingsVehicleCount =
          (summaries['vehicleCount'] as num?)?.toInt() ?? 0;
    }

    repo.driver.fullName = fullName;
    repo.driver.legalName = legalName;
    repo.driver.isIndividual = isIndividual;
    repo.driver.baseLocation = baseLocation;
    repo.driver.baseLatitude = baseLatitude;
    repo.driver.baseLongitude = baseLongitude;
    defaultDriverName = fullName.isEmpty ? defaultDriverName : fullName;
    await _persistBaseLocation();
    notifyListeners();
  }

  Future<void> saveDriverProfile() async {
    if (!isAuthenticated) return;
    profileSaving = true;
    notifyListeners();
    try {
      final addressLine1 = address.trim();
      await api.driver.updateMe({
        'fullName': fullName.trim(),
        'legalName': legalName.trim(),
        'isIndividual': isIndividual,
        'registrationNumber': registrationNumber.trim(),
        'taxpayerId': taxpayerId.trim(),
        'addressLine1': addressLine1,
        'postalCode': postalCode.trim(),
        'baseLocation': baseLocation.trim(),
        'baseLatitude': baseLatitude,
        'baseLongitude': baseLongitude,
        'languages': selectedLanguages.map((e) => e.toUpperCase()).toList(),
        if (hasReferral && referralCode.trim().isNotEmpty && !referralImmutable)
          'referralCode': referralCode.trim(),
      });
      if (hasReferral &&
          referralCode.trim().isNotEmpty &&
          !referralImmutable) {
        try {
          await api.auth.redeemReferral(referralCode.trim());
        } catch (_) {
          // Redeem is best-effort; profile already stores the code.
        }
      }
      await loadDriverProfile();
    } finally {
      profileSaving = false;
      notifyListeners();
    }
  }

  Future<Map<String, dynamic>?> loadPaymentDetails({
    bool force = false,
  }) async {
    if (!isAuthenticated) return null;
    try {
      final data = await api.driver.paymentDetails();
      applyPaymentDetailsFromServer(data);
      return data;
    } catch (e) {
      debugPrint('loadPaymentDetails failed');
      rethrow;
    }
  }

  /// Apply server payment-details into AppState. Never forges status locally.
  void applyPaymentDetailsFromServer(Map<String, dynamic> data) {
    final parsed = parsePaymentDetailsResponse(data);
    paymentDetails = Map<String, dynamic>.from(data);
    billingPeriod = parsed['billingPeriod'] as String;
    outpaymentCurrency = parsed['outpaymentCurrency'] as String;
    bankCountry = parsed['bankCountry'] as String;
    payoutMethod = parsed['payoutMethod'] as String;
    accountHolderName = parsed['accountHolderName'] as String;
    accountMask = parsed['accountMask'] as String;
    paymentPeriod = parsed['paymentPeriod'] as String?;
    paymentStatus = parsed['status'] as String;
    commissionPct = parsed['commissionPct'] is num
        ? parsed['commissionPct'] as num
        : num.tryParse('${parsed['commissionPct'] ?? ''}');
    paymentReviewNote = parsed['reviewNote'] as String?;
    paymentReviewedAt = parsed['reviewedAt'] as String?;
    stripeAccountId = data['stripeAccountId'] as String?;
    stripeAccountStatus = (data['stripeAccountStatus'] as String?) ?? 'UNLINKED';
    stripeChargesEnabled = data['stripeChargesEnabled'] == true;
    stripePayoutsEnabled = data['stripePayoutsEnabled'] == true;
    paymentDetailsLoaded = true;
    paymentDetailsGeneration++;
    paymentSummaryLabel =
        '$outpaymentCurrency · ${paymentStatus == 'NOT_CONFIGURED' ? 'Not configured' : paymentStatus.toLowerCase().replaceAll('_', ' ')}';
    notifyListeners();
  }

  Future<String> getStripeOnboardingUrl({
    String? returnUrl,
    String? refreshUrl,
  }) async {
    if (!isAuthenticated) throw StateError('Not authenticated');
    final res = await api.driver.stripeOnboarding(
      returnUrl: returnUrl,
      refreshUrl: refreshUrl,
    );
    final url = res['url'] as String? ?? '';
    if (res['accountId'] != null) {
      stripeAccountId = res['accountId'] as String;
    }
    if (res['status'] != null) {
      stripeAccountStatus = res['status'] as String;
    }
    notifyListeners();
    return url;
  }

  Future<Map<String, dynamic>> refreshStripeStatus() async {
    if (!isAuthenticated) throw StateError('Not authenticated');
    final res = await api.driver.stripeStatus();
    stripeAccountStatus = (res['status'] as String?) ?? stripeAccountStatus;
    stripeChargesEnabled = res['chargesEnabled'] == true;
    stripePayoutsEnabled = res['payoutsEnabled'] == true;
    if (res['accountId'] != null) {
      stripeAccountId = res['accountId'] as String;
    }
    notifyListeners();
    return res;
  }

  Future<String> getStripeDashboardUrl() async {
    if (!isAuthenticated) throw StateError('Not authenticated');
    final res = await api.driver.stripeDashboardLink();
    return res['url'] as String? ?? '';
  }

  Future<Map<String, dynamic>> savePaymentDetails({
    required Map<String, dynamic> editablePatch,
  }) async {
    if (!isAuthenticated) {
      throw StateError('Not authenticated');
    }
    // Strip any accidental server-controlled keys before PATCH.
    final body = <String, dynamic>{};
    for (final key in kEditablePaymentPatchKeys) {
      if (editablePatch.containsKey(key)) {
        body[key] = editablePatch[key];
      }
    }
    for (final forbidden in kServerControlledPaymentKeys) {
      body.remove(forbidden);
    }
    final result = await api.driver.updatePaymentDetails(body);
    applyPaymentDetailsFromServer(Map<String, dynamic>.from(result));
    await loadDriverProfile();
    return result;
  }

  Map<String, dynamic>? walletSummary;
  String walletSummaryLabel = '';

  Future<Map<String, dynamic>> loadWallet() async {
    if (!isAuthenticated) {
      throw StateError('Not authenticated');
    }
    try {
      final data = await api.driver.wallet();
      walletSummary = data;
      final cur = data['currency']?.toString() ?? 'CAD';
      final balance = data['balance']?.toString();
      final avail = data['available']?.toString() ?? '0.00';
      final pending = data['pending']?.toString() ?? '0.00';
      // Prefer server balance (available + pending); fall back to sum.
      final total = (balance != null && balance.isNotEmpty)
          ? balance
          : _sumMoneyStrings(avail, pending);
      walletSummaryLabel = '$cur $total';
      notifyListeners();
      return data;
    } on ApiException catch (e) {
      if (e.statusCode == 401) {
        final stillAuthed = await api.isAuthenticated();
        if (!stillAuthed) {
          isAuthenticated = false;
          notifyListeners();
        }
      }
      rethrow;
    }
  }

  static String _sumMoneyStrings(String a, String b) {
    final x = double.tryParse(a) ?? 0;
    final y = double.tryParse(b) ?? 0;
    return (x + y).toStringAsFixed(2);
  }

  Future<List<Map<String, dynamic>>> loadWalletEntries({String? cursor}) async {
    if (!isAuthenticated) return [];
    final data = await api.driver.walletEntries(cursor: cursor, limit: 40);
    final items = data['items'];
    if (items is! List) return [];
    return items
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  Future<Map<String, dynamic>> withdrawWallet({
    required String amount,
    required String idempotencyKey,
    String? currency,
  }) async {
    final result = await api.driver.withdrawWallet(
      amount: amount,
      currency: currency ?? 'CAD',
      idempotencyKey: idempotencyKey,
    );
    await loadWallet();
    return result;
  }

  // Prefer [savePaymentDetails] with an editable PATCH from the Payment screen.
  // completeOnboarding no longer auto-PATCHes payment (avoids empty/forged payloads).

  /// Existing drivers must not re-enter onboarding after logout/login.
  Future<void> _syncOnboardedFromServer({required bool hasDocuments}) async {
    final status = approvalStatus.toUpperCase();
    final serverDone = isActivated ||
        hasDocuments ||
        (status.isNotEmpty && status != 'PENDING_KYC');
    if (serverDone && !onboardedComplete) {
      onboardedComplete = true;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_kOnboarded, true);
    }
  }

  Future<void> syncDocumentsStatus() async {
    if (!isAuthenticated) return;
    try {
      final status = await api.driver.documentsStatus();
      isActivated = status['isActivated'] == true;
      repo.driver.isActivated = isActivated;
      final nextStatus = status['approvalStatus']?.toString();
      if (nextStatus != null && nextStatus.isNotEmpty) {
        approvalStatus = nextStatus;
      }
      selfieUploaded = false;
      licenseUploaded = false;
      vehicleDocUploaded = false;
      insuranceUploaded = false;
      hasExpiredDocumentsFromServer = status['hasExpiredDocuments'] == true;
      vehiclePhotoCount = 0;
      documents = [];

      final checklist = status['checklist'];
      if (checklist is Map) {
        final photos = checklist['vehiclePhotosApproved'];
        if (photos is num) {
          vehiclePhotoCount = photos.toInt().clamp(0, 6);
        }
      }
      var hasDocuments = false;
      var attention = 0;
      final docs = status['documents'];
      if (docs is List) {
        hasDocuments = docs.isNotEmpty;
        for (final d in docs.whereType<Map>()) {
          final map = Map<String, dynamic>.from(d);
          documents.add(map);
          final type = map['docType'] as String?;
          final docStatus = (map['status'] as String?)?.toUpperCase() ?? '';
          if (type == 'selfie') selfieUploaded = true;
          if (type == 'license') licenseUploaded = true;
          if (type == 'vehicle_registration') vehicleDocUploaded = true;
          if (type == 'insurance') insuranceUploaded = true;
          if (type == 'vehicle_photo') {
            vehiclePhotoCount = (vehiclePhotoCount + 1).clamp(0, 6);
          }
          if (docStatus == 'REJECTED' || docStatus == 'NEEDS_RESUBMISSION') {
            attention++;
          }
        }
      }
      documentsAttentionLabel = attention > 0
          ? '$attention document${attention == 1 ? '' : 's'} require attention'
          : (hasDocuments ? 'Documents on file' : 'No documents uploaded');
      await _syncOnboardedFromServer(hasDocuments: hasDocuments);
      notifyListeners();
    } catch (e) {
      debugPrint('syncDocumentsStatus: $e');
    }
  }

  Map<String, dynamic>? documentForType(String docType) {
    for (final d in documents) {
      if (d['docType']?.toString() == docType) return d;
    }
    return null;
  }

  List<Map<String, dynamic>> get vehiclePhotoDocuments {
    return documents
        .where((d) => d['docType']?.toString() == 'vehicle_photo')
        .toList();
  }

  /// Active vehicle photos for [vehicleId], ordered createdAt ASC then id ASC.
  List<Map<String, dynamic>> vehiclePhotosForVehicle(String? vehicleId) {
    final list = vehiclePhotoDocuments.where((d) {
      if (vehicleId == null || vehicleId.isEmpty) return true;
      return d['vehicleId']?.toString() == vehicleId;
    }).toList();
    list.sort((a, b) {
      final aCreated = a['createdAt']?.toString() ?? '';
      final bCreated = b['createdAt']?.toString() ?? '';
      final byCreated = aCreated.compareTo(bCreated);
      if (byCreated != 0) return byCreated;
      return (a['id']?.toString() ?? '').compareTo(b['id']?.toString() ?? '');
    });
    return list;
  }

  /// Cover/primary photo — first by stable ordering (createdAt ASC, id ASC).
  Map<String, dynamic>? primaryVehiclePhoto(String? vehicleId) {
    final list = vehiclePhotosForVehicle(vehicleId);
    return list.isEmpty ? null : list.first;
  }

  bool isDocumentExpired(Map<String, dynamic>? doc) {
    if (doc == null) return false;
    final expStr = doc['expiresAt']?.toString();
    if (expStr == null || expStr.isEmpty) return false;
    final dt = DateTime.tryParse(expStr);
    if (dt == null) return false;
    return dt.isBefore(DateTime.now());
  }

  bool isDocumentExpiringSoon(Map<String, dynamic>? doc, {int days = 30}) {
    if (doc == null) return false;
    final expStr = doc['expiresAt']?.toString();
    if (expStr == null || expStr.isEmpty) return false;
    final dt = DateTime.tryParse(expStr);
    if (dt == null) return false;
    final now = DateTime.now();
    return dt.isAfter(now) && dt.isBefore(now.add(Duration(days: days)));
  }

  bool get hasExpiredDocuments {
    if (hasExpiredDocumentsFromServer) return true;
    for (final slot in const ['selfie', 'license', 'vehicle_registration', 'insurance']) {
      final doc = documentForType(slot);
      if (isDocumentExpired(doc)) return true;
    }
    return false;
  }

  bool get hasAllRequiredDocuments {
    for (final slot in const ['selfie', 'license', 'vehicle_registration', 'insurance']) {
      if (documentForType(slot) == null) return false;
    }
    return true;
  }

  bool isDocumentUnderReview(Map<String, dynamic>? doc) {
    if (doc == null) return false;
    if (isDocumentExpired(doc)) return false;
    final st = doc['status']?.toString().toUpperCase() ?? '';
    if (st == 'REJECTED' || st == 'NEEDS_RESUBMISSION') return false;
    return true;
  }

  bool isDocumentReuploadRequested(Map<String, dynamic>? doc) {
    if (doc == null) return false;
    final st = doc['status']?.toString().toUpperCase() ?? '';
    return st == 'NEEDS_RESUBMISSION' || st == 'REJECTED';
  }

  bool get hasReuploadRequest {
    for (final slot in const [
      'selfie',
      'license',
      'vehicle_registration',
      'insurance',
    ]) {
      final doc = documentForType(slot);
      if (isDocumentReuploadRequested(doc)) return true;
    }
    for (final doc in documents) {
      if (isDocumentReuploadRequested(doc)) return true;
    }
    return false;
  }

  List<String> get reuploadRequestedSlotTitles {
    const titles = {
      'selfie': 'Selfie with driving license',
      'license': 'Driving license',
      'vehicle_registration': 'Vehicle registration',
      'insurance': 'Vehicle insurance',
    };
    final list = <String>[];
    for (final slot in const [
      'selfie',
      'license',
      'vehicle_registration',
      'insurance',
    ]) {
      final doc = documentForType(slot);
      if (isDocumentReuploadRequested(doc)) {
        list.add(titles[slot] ?? slot);
      }
    }
    return list;
  }

  String? documentFeedback(Map<String, dynamic>? doc) {
    if (doc == null) return null;
    final customMsg = doc['customerMessage']?.toString().trim();
    if (customMsg != null && customMsg.isNotEmpty) return customMsg;
    final resub = doc['resubmissionReason']?.toString().trim();
    if (resub != null && resub.isNotEmpty) {
      return formatResubmissionReason(resub);
    }
    final rej = doc['rejectionReason']?.toString().trim();
    if (rej != null && rej.isNotEmpty) {
      return formatResubmissionReason(rej);
    }
    final note = doc['adminNote']?.toString().trim();
    if (note != null && note.isNotEmpty) return note;
    return null;
  }

  static String formatResubmissionReason(String? rawReason) {
    if (rawReason == null || rawReason.trim().isEmpty) {
      return 'Please upload a clearer, updated document.';
    }
    final key = rawReason.trim().toLowerCase();
    switch (key) {
      case 'image_unclear':
        return 'Image is unclear or blurry — please provide a clear, readable photo.';
      case 'document_cropped':
        return 'Document is cropped — please ensure all four corners and edges are fully visible.';
      case 'information_unreadable':
        return 'Information is unreadable — please ensure all text and numbers are clearly legible.';
      case 'document_expired':
      case 'expired_document':
        return 'Document has expired — please upload a valid, current document.';
      case 'wrong_document':
      case 'invalid_documents':
      case 'invalid_licence':
        return 'Wrong document type — please upload the exact requested document.';
      case 'details_mismatch':
      case 'information_mismatch':
      case 'identity_mismatch':
        return 'Details mismatch — document information does not match your profile.';
      case 'fraud_suspicion':
      case 'fraud_concern':
        return 'Verification failed — please upload an authentic, official document.';
      default:
        if (key.contains('_')) {
          return key
              .split('_')
              .map((w) => w.isNotEmpty
                  ? '${w[0].toUpperCase()}${w.substring(1)}'
                  : '')
              .join(' ');
        }
        return rawReason;
    }
  }

  bool get areDocumentsUnderReview {
    if (!hasAllRequiredDocuments) return false;
    if (hasExpiredDocuments) return false;
    if (hasReuploadRequest) return false;
    for (final slot in const ['selfie', 'license', 'vehicle_registration', 'insurance']) {
      final doc = documentForType(slot);
      if (!isDocumentUnderReview(doc)) return false;
    }
    return true;
  }

  bool isDocumentLocked(Map<String, dynamic> doc) {
    // If expired or reupload requested, unlock so driver can re-upload even if previously approved
    if (isDocumentExpired(doc) || isDocumentReuploadRequested(doc)) return false;
    return (doc['status']?.toString().toUpperCase() ?? '') == 'APPROVED';
  }

  /// In-memory document thumbnails (survive screen pop/push within session).
  final Map<String, Uint8List> documentPreviewCache = {};

  Future<String?> fetchDocumentPreviewUrl(String documentId) async {
    if (!isAuthenticated) return null;
    final data = await api.driver.getDocument(documentId);
    return rewriteMediaUrl(data['url']?.toString());
  }

  Uint8List? cachedDocumentPreview(String documentId) =>
      documentPreviewCache[documentId];

  void rememberDocumentPreview(String documentId, Uint8List bytes) {
    if (documentId.isEmpty || bytes.isEmpty) return;
    documentPreviewCache[documentId] = bytes;
  }

  void forgetDocumentPreview(String documentId) {
    documentPreviewCache.remove(documentId);
  }

  Future<Uint8List?> _downloadSignedDocument(String documentId) async {
    final data = await api.driver.getDocument(documentId);
    final raw = data['url']?.toString();
    if (raw == null || raw.isEmpty) return null;
    final candidates = <String>{raw};
    final rewritten = rewriteMediaUrl(raw);
    if (rewritten != null &&
        rewritten.isNotEmpty &&
        rewritten != raw) {
      candidates.add(rewritten);
    }
    for (final url in candidates) {
      try {
        final res = await http.get(Uri.parse(url));
        if (res.statusCode >= 200 &&
            res.statusCode < 300 &&
            res.bodyBytes.isNotEmpty) {
          return res.bodyBytes;
        }
      } catch (e) {
        debugPrint('signed document download failed: $e');
      }
    }
    return null;
  }

  /// Load preview bytes: memory → API /content → signed URL.
  Future<Uint8List?> fetchDocumentPreviewBytes(String documentId) async {
    if (!isAuthenticated || documentId.isEmpty) return null;

    final mem = documentPreviewCache[documentId];
    if (mem != null && mem.isNotEmpty) return mem;

    try {
      final bytes = await api.driver.getDocumentContent(documentId);
      if (bytes.isNotEmpty) {
        rememberDocumentPreview(documentId, bytes);
        return bytes;
      }
    } catch (e) {
      debugPrint('fetchDocumentPreviewBytes content: $e');
    }

    try {
      final bytes = await _downloadSignedDocument(documentId);
      if (bytes != null && bytes.isNotEmpty) {
        rememberDocumentPreview(documentId, bytes);
        return bytes;
      }
    } catch (e) {
      debugPrint('fetchDocumentPreviewBytes signed: $e');
    }
    return null;
  }

  Future<void> deleteDocument(String documentId) async {
    await api.driver.deleteDocument(documentId);
    forgetDocumentPreview(documentId);
    await syncDocumentsStatus();
    notifyListeners();
  }

  Future<void> uploadKycBytes({
    required String docType,
    required Uint8List bytes,
    required String filename,
    String? vehicleId,
    String? expiresAt,
  }) async {
    final resolvedVehicleId = vehicleId ?? primaryVehicleId;
    if (docType == 'vehicle_photo' &&
        (resolvedVehicleId == null || resolvedVehicleId.isEmpty)) {
      throw Exception('vehicleId is required for vehicle photos');
    }
    await api.driver.uploadDocument(
      docType: docType,
      bytes: bytes,
      filename: filename,
      vehicleId: resolvedVehicleId,
      expiresAt: expiresAt,
    );
    if (docType == 'selfie') selfieUploaded = true;
    if (docType == 'license') licenseUploaded = true;
    if (docType == 'vehicle_registration') vehicleDocUploaded = true;
    if (docType == 'insurance') insuranceUploaded = true;
    if (docType == 'vehicle_photo') {
      vehiclePhotoCount = (vehiclePhotoCount + 1).clamp(0, 6);
    }
    await syncDocumentsStatus();
    // Cache against the synced document id so reopen shows the image.
    if (docType == 'vehicle_photo') {
      for (final doc in vehiclePhotosForVehicle(resolvedVehicleId)) {
        final id = doc['id']?.toString();
        if (id != null && !documentPreviewCache.containsKey(id)) {
          rememberDocumentPreview(id, bytes);
          break;
        }
      }
    } else {
      final id = documentForType(docType)?['id']?.toString();
      if (id != null) rememberDocumentPreview(id, bytes);
    }
    notifyListeners();
  }

  Future<void> reuploadKycBytes({
    required String docType,
    required String documentId,
    required Uint8List bytes,
    required String filename,
    String? vehicleId,
    String? expiresAt,
  }) async {
    try {
      await api.driver.reuploadDocument(
        documentId: documentId,
        bytes: bytes,
        filename: filename,
        expiresAt: expiresAt,
      );
    } catch (e) {
      debugPrint('reuploadDocument endpoint fallback to uploadDocument: $e');
      final resolvedVehicleId = vehicleId ?? primaryVehicleId;
      await api.driver.uploadDocument(
        docType: docType,
        bytes: bytes,
        filename: filename,
        vehicleId: resolvedVehicleId,
        expiresAt: expiresAt,
      );
    }
    if (docType == 'selfie') selfieUploaded = true;
    if (docType == 'license') licenseUploaded = true;
    if (docType == 'vehicle_registration') vehicleDocUploaded = true;
    if (docType == 'insurance') insuranceUploaded = true;
    await syncDocumentsStatus();
    final id = documentForType(docType)?['id']?.toString() ?? documentId;
    rememberDocumentPreview(id, bytes);
    notifyListeners();
  }

  Future<void> ensureVehicle() async {
    if (primaryVehicleId != null) return;
    final existing = await loadDriverVehicles();
    if (existing.isNotEmpty) {
      primaryVehicleId = existing.first.id;
      return;
    }
    final v = await api.driver.createVehicle(
      name: 'Primary',
      plate: 'TEMP-${DateTime.now().millisecondsSinceEpoch % 100000}',
      vehicleClass: 'sedan',
      isDefault: true,
    );
    primaryVehicleId = v['id'] as String?;
    await loadDriverVehicles();
  }

  Future<void> refreshOpenRequests({bool fromPush = false}) async {
    if (!isAuthenticated || !isActivated) return;
    try {
      final previousIds = openRequests.map((r) => r.id).toSet();
      final list = await api.driver.openRequests();
      final parsed = <DriverRequest>[];
      for (final item in list) {
        try {
          final map = item is Map
              ? Map<String, dynamic>.from(item)
              : null;
          if (map == null || map.isEmpty) continue;
          parsed.add(driverRequestFromServer(map));
        } catch (e) {
          // One bad row must not wipe the whole dashboard.
          debugPrint('refreshOpenRequests skip row: $e');
        }
      }
      openRequests = parsed;
      if (fromPush || previousIds.isNotEmpty) {
        DriverRequest? newest;
        for (final r in openRequests) {
          if (!previousIds.contains(r.id) && !r.hasOffer) {
            newest = r;
            break;
          }
        }
        if (newest != null) {
          pendingRequestRideId = newest.id;
          pendingRequestAlert =
              'New request: ${newest.from} → ${newest.to}';
          pendingAlertType = 'ride_request';
          pendingAlertStatus = null;
        }
      }
      notifyListeners();
    } catch (e) {
      debugPrint('refreshOpenRequests: $e');
    }
  }

  Future<void> refreshMyRides() async {
    if (!isAuthenticated || !isActivated) return;
    try {
      final list = await api.driver.mySchedule();
      final parsed = <DriverRequest>[];
      for (final item in list) {
        try {
          final map = item is Map
              ? Map<String, dynamic>.from(item)
              : null;
          if (map == null || map.isEmpty) continue;
          parsed.add(driverRequestFromServer(map));
        } catch (e) {
          debugPrint('refreshMyRides skip row: $e');
        }
      }
      parsed.sort((a, b) {
        final aAt = a.pickupAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        final bAt = b.pickupAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        return aAt.compareTo(bAt);
      });
      myRides = parsed;
      notifyListeners();
    } catch (e) {
      debugPrint('refreshMyRides: $e');
    }
  }

  List<DriverRequest> get scheduledRides {
    return myRides.where((r) {
      final mapped = mapServerRideStatus(r.status);
      return mapped == RideStatus.booked;
    }).toList();
  }

  List<DriverRequest> get pastRides {
    return myRides.where((r) {
      final mapped = mapServerRideStatus(r.status);
      return mapped == RideStatus.past || mapped == RideStatus.cancelled;
    }).toList()
      ..sort((a, b) {
        final aAt = a.pickupAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        final bAt = b.pickupAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        return bAt.compareTo(aAt);
      });
  }

  Future<void> startMarketplaceRealtime() async {
    if (!isAuthenticated || !isActivated) return;
    _realtime ??= MarketplaceRealtime(
      session: api,
      onNewRequest: (payload) {
        final rideId = payload['rideId']?.toString();
        final from = payload['fromLabel']?.toString();
        final to = payload['toLabel']?.toString();
        if (from != null &&
            from.isNotEmpty &&
            to != null &&
            to.isNotEmpty) {
          pendingRequestRideId = rideId;
          pendingRequestAlert = 'New request: $from → $to';
          pendingAlertType = 'ride_request';
          pendingAlertStatus = null;
          notifyListeners();
        }
        unawaited(refreshOpenRequests(fromPush: true));
      },
    );
    await _realtime!.connect();
  }

  void stopMarketplaceRealtime() {
    _realtime?.disconnect();
    _realtime = null;
  }

  void clearPendingRequestAlert() {
    if (pendingRequestAlert == null &&
        pendingRequestRideId == null &&
        pendingAlertType == null &&
        pendingAlertStatus == null) {
      return;
    }
    pendingRequestAlert = null;
    pendingRequestRideId = null;
    pendingAlertType = null;
    pendingAlertStatus = null;
    notifyListeners();
  }

  /// Called when app returns to foreground.
  Future<void> onAppResumed() async {
    if (!isAuthenticated || !isActivated) return;
    await refreshOpenRequests();
    await refreshMyRides();
    await startMarketplaceRealtime();
    unawaited(refreshUnreadNotificationCount());
  }

  List<OperatingZone> _decodeZones(String? raw) {
    if (raw == null || raw.isEmpty) return [];
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list
          .map((e) =>
              OperatingZone.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> setHasSeenWelcome(bool value) async {
    hasSeenWelcome = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kHasSeenWelcome, value);
    notifyListeners();
  }

  Future<void> setOnboarded(bool value) async {
    onboardedComplete = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kOnboarded, value);
    notifyListeners();
  }

  Future<void> setActivated(bool value) async {
    await refreshMe();
    notifyListeners();
  }

  void setIndividual(bool value) {
    isIndividual = value;
    repo.driver.isIndividual = value;
    notifyListeners();
  }

  void updateProfile({
    String? fullName,
    String? legalName,
    String? registrationNumber,
    String? taxpayerId,
    String? address,
    String? postalCode,
    String? baseLocation,
    double? baseLatitude,
    double? baseLongitude,
    bool? hasReferral,
    String? referralCode,
    bool? acceptedTerms,
  }) {
    if (fullName != null) {
      this.fullName = fullName;
      repo.driver.fullName = fullName;
      defaultDriverName = fullName.isEmpty ? defaultDriverName : fullName;
    }
    if (legalName != null) {
      this.legalName = legalName;
      repo.driver.legalName = legalName;
    }
    if (registrationNumber != null) {
      this.registrationNumber = registrationNumber;
    }
    if (taxpayerId != null) this.taxpayerId = taxpayerId;
    if (address != null) this.address = address;
    if (postalCode != null) this.postalCode = postalCode;
    if (baseLocation != null) {
      this.baseLocation = baseLocation;
      repo.driver.baseLocation = baseLocation;
    }
    if (baseLatitude != null) {
      this.baseLatitude = baseLatitude;
      repo.driver.baseLatitude = baseLatitude;
    }
    if (baseLongitude != null) {
      this.baseLongitude = baseLongitude;
      repo.driver.baseLongitude = baseLongitude;
    }
    if (hasReferral != null) this.hasReferral = hasReferral;
    if (referralCode != null) this.referralCode = referralCode;
    if (acceptedTerms != null) this.acceptedTerms = acceptedTerms;
    notifyListeners();
    if (baseLocation != null || baseLatitude != null || baseLongitude != null) {
      _persistBaseLocation();
    }
  }

  Future<void> _persistBaseLocation() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefsKey(_kBaseLocation), baseLocation);
    await prefs.setDouble(_prefsKey(_kBaseLat), baseLatitude);
    await prefs.setDouble(_prefsKey(_kBaseLng), baseLongitude);
    // Legacy unscoped keys for migration compatibility.
    await prefs.setString(_kBaseLocation, baseLocation);
    await prefs.setDouble(_kBaseLat, baseLatitude);
    await prefs.setDouble(_kBaseLng, baseLongitude);
  }

  Map<String, dynamic> _zoneToGeoJson(OperatingZone z) {
    if (z.isCircle && z.center != null && z.radiusKm != null) {
      return {
        'center': [z.center!.longitude, z.center!.latitude],
        'radiusKm': z.radiusKm,
      };
    }
    final ring = z.coordinates
        .map((c) => [c.longitude, c.latitude])
        .toList();
    if (ring.isNotEmpty &&
        (ring.first[0] != ring.last[0] || ring.first[1] != ring.last[1])) {
      ring.add(List<double>.from(ring.first));
    }
    return {
      'type': 'Polygon',
      'coordinates': [ring],
    };
  }

  Future<void> loadOperatingZones() async {
    if (!isAuthenticated) return;
    try {
      final list = await api.driver.listZones();
      final serverZones = list
          .whereType<Map>()
          .map((e) => operatingZoneFromServer(Map<String, dynamic>.from(e)))
          .toList();

      if (serverZones.isEmpty) {
        await _maybeMigrateLocalZones();
        final again = await api.driver.listZones();
        operatingZones = again
            .whereType<Map>()
            .map((e) => operatingZoneFromServer(Map<String, dynamic>.from(e)))
            .toList();
      } else {
        operatingZones = serverZones;
      }

      settingsZoneCount = operatingZones.length;
      repo.driver.operatingZones = List<OperatingZone>.from(operatingZones);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        _prefsKey(_kOperatingZones),
        jsonEncode(operatingZones.map((z) => z.toJson()).toList()),
      );
      notifyListeners();
    } catch (e) {
      debugPrint('loadOperatingZones: $e');
    }
  }

  Future<void> _maybeMigrateLocalZones() async {
    final prefs = await SharedPreferences.getInstance();
    final migrated = prefs.getBool(_prefsKey(_kZonesMigrated)) ?? false;
    if (migrated) return;

    var local = _decodeZones(prefs.getString(_prefsKey(_kOperatingZones)));
    if (local.isEmpty) {
      local = _decodeZones(prefs.getString(_kOperatingZones));
    }
    if (local.isEmpty) {
      await prefs.setBool(_prefsKey(_kZonesMigrated), true);
      return;
    }

    for (final z in local) {
      try {
        await api.driver.createZone(
          name: z.name,
          zoneType: z.isCircle ? 'circle' : 'polygon',
          geoJson: _zoneToGeoJson(z),
          radiusKm: z.radiusKm,
        );
      } catch (e) {
        debugPrint('migrate zone ${z.name}: $e');
      }
    }
    await prefs.setBool(_prefsKey(_kZonesMigrated), true);
  }

  /// Persist zones to backend (create/update/delete) then refresh local cache.
  Future<void> saveOperatingZones(List<OperatingZone> zones) async {
    if (!isAuthenticated) {
      operatingZones = List<OperatingZone>.from(zones);
      repo.driver.operatingZones = List<OperatingZone>.from(zones);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        _prefsKey(_kOperatingZones),
        jsonEncode(zones.map((z) => z.toJson()).toList()),
      );
      notifyListeners();
      return;
    }

    // Also persist base location with profile when zones save.
    try {
      await api.driver.updateMe({
        'baseLocation': baseLocation.trim(),
        'baseLatitude': baseLatitude,
        'baseLongitude': baseLongitude,
      });
    } catch (e) {
      debugPrint('save base with zones: $e');
    }

    final existing = await api.driver.listZones();
    final existingIds = existing
        .whereType<Map>()
        .map((e) => e['id']?.toString())
        .whereType<String>()
        .toSet();
    final keepIds = <String>{};

    final saved = <OperatingZone>[];
    for (final z in zones) {
      try {
        final isServerId = existingIds.contains(z.id);
        final Map<String, dynamic> row;
        if (isServerId) {
          row = await api.driver.updateZone(
            id: z.id,
            name: z.name,
            zoneType: z.isCircle ? 'circle' : 'polygon',
            geoJson: _zoneToGeoJson(z),
            radiusKm: z.radiusKm,
          );
        } else {
          row = await api.driver.createZone(
            name: z.name,
            zoneType: z.isCircle ? 'circle' : 'polygon',
            geoJson: _zoneToGeoJson(z),
            radiusKm: z.radiusKm,
          );
        }
        final mapped = operatingZoneFromServer(row);
        keepIds.add(mapped.id);
        saved.add(mapped);
      } catch (e) {
        debugPrint('save zone ${z.name}: $e');
        saved.add(z);
      }
    }

    for (final id in existingIds) {
      if (!keepIds.contains(id)) {
        try {
          await api.driver.deleteZone(id);
        } catch (e) {
          debugPrint('delete zone $id: $e');
        }
      }
    }

    operatingZones = saved;
    settingsZoneCount = operatingZones.length;
    repo.driver.operatingZones = List<OperatingZone>.from(operatingZones);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _prefsKey(_kOperatingZones),
      jsonEncode(operatingZones.map((z) => z.toJson()).toList()),
    );
    await prefs.setBool(_prefsKey(_kZonesMigrated), true);
    notifyListeners();
  }

  bool get profileValidEnough =>
      fullName.trim().isNotEmpty && acceptedTerms;

  void toggleLanguage(String language) {
    final code = language.toUpperCase();
    if (selectedLanguages.contains(code)) {
      selectedLanguages.remove(code);
    } else if (selectedLanguages.length < 6) {
      selectedLanguages.add(code);
    }
    notifyListeners();
  }

  void toggleAmenity(String key) {
    amenities[key] = !(amenities[key] ?? false);
    notifyListeners();
  }

  void setAutocancel({int? before, int? after}) {
    if (before != null) autocancelBefore = before.clamp(0, 120);
    if (after != null) autocancelAfter = after.clamp(0, 120);
    notifyListeners();
  }

  void setPayment({
    String? billingPeriod,
    String? outpaymentCurrency,
    String? bankCountry,
    String? payoutMethod,
    String? accountHolderName,
    String? accountMask,
  }) {
    if (billingPeriod != null) this.billingPeriod = billingPeriod;
    if (outpaymentCurrency != null) {
      this.outpaymentCurrency = outpaymentCurrency;
    }
    if (bankCountry != null) this.bankCountry = bankCountry;
    if (payoutMethod != null) this.payoutMethod = payoutMethod;
    if (accountHolderName != null) this.accountHolderName = accountHolderName;
    if (accountMask != null) this.accountMask = accountMask;
    notifyListeners();
  }

  void _resetPaymentState() {
    paymentDetails = null;
    billingPeriod = '3 days';
    outpaymentCurrency = 'CAD';
    bankCountry = 'Canada';
    paymentStatus = 'NOT_CONFIGURED';
    payoutMethod = 'bank_transfer';
    accountHolderName = '';
    accountMask = '';
    paymentPeriod = null;
    commissionPct = null;
    paymentReviewNote = null;
    paymentReviewedAt = null;
    paymentDetailsLoaded = false;
    paymentDetailsGeneration = 0;
    paymentSummaryLabel = '';
  }

  void markVehiclePhotoAdded() {
    if (vehiclePhotoCount < 6) {
      vehiclePhotoCount++;
      notifyListeners();
    }
  }

  void markVehicleDocUploaded() {
    vehicleDocUploaded = true;
    notifyListeners();
  }

  void markInsuranceUploaded() {
    insuranceUploaded = true;
    notifyListeners();
  }

  void markPhotoRequirementsSeen() {
    photoRequirementsSeen = true;
    notifyListeners();
  }

  Future<void> completeOnboarding() async {
    if (isAuthenticated) {
      try {
        await saveDriverProfile();
      } catch (e) {
        debugPrint('completeOnboarding profile: $e');
      }
      // Payment details are saved explicitly from PaymentScreen before this runs.
    }
    await setOnboarded(true);
  }

  Future<void> signOut() async {
    stopTripLocationTracking();
    stopMarketplaceRealtime();
    await api.auth.logout();
    await api.clear();
    isAuthenticated = false;
    isActivated = false;
    drivingEnabled = false;
    approvalStatus = 'PENDING_KYC';
    me = null;
    driverProfile = null;
    accountStatus = null;
    paymentDetails = null;
    _resetPaymentState();
    authUserId = null;
    clearAvatarState();
    unreadNotificationCount = 0;
    documents = [];
    vehicles = [];
    openRequests = [];
    operatingZones = [];
    primaryVehicleId = null;
    acceptedTerms = false;
    pendingRequestAlert = null;
    pendingRequestRideId = null;
    pendingAlertType = null;
    pendingAlertStatus = null;
    selectedLanguages.clear();
    notifyListeners();
  }

  String get partnerStatusLabel {
    final fromServer = accountStatus?['label']?.toString();
    if (fromServer != null && fromServer.isNotEmpty) return fromServer;
    if (isActivated) return 'Activated partner';
    switch (approvalStatus.toUpperCase()) {
      case 'APPROVED':
        return 'Approved — activating';
      case 'IN_REVIEW':
        return 'KYC in review';
      case 'ACTION_REQUIRED':
        return 'Action required';
      case 'REJECTED':
        return 'KYC rejected';
      case 'SUSPENDED':
        return 'Suspended';
      default:
        return 'Pending Admin KYC';
    }
  }

  String get carrierProfileSummary {
    final type = isIndividual ? 'Individual' : 'Legal entity';
    final verified = isActivated || approvalStatus.toUpperCase() == 'APPROVED'
        ? 'Verified'
        : approvalStatus.replaceAll('_', ' ').toLowerCase();
    return '$type · $verified';
  }

  String get operatingZoneSummary {
    final n = settingsZoneCount > 0 ? settingsZoneCount : operatingZones.length;
    if (n == 0) return 'No zones configured';
    return '$n active zone${n == 1 ? '' : 's'}';
  }

  String get vehiclesSummary {
    final n = settingsVehicleCount > 0 ? settingsVehicleCount : vehicles.length;
    if (n == 0) return 'No vehicles';
    final active = vehicles.where((v) => v.isActive).length;
    return '$n vehicle${n == 1 ? '' : 's'} · $active active';
  }

  Future<void> submitOffer(String requestId, double price) async {
    await submitOfferDraft(
      requestId,
      OfferDraft(outboundPrice: price, validForSeconds: 30 * 60),
    );
  }

  OfferDraft? offerDraftFor(String requestId) => _offerDrafts[requestId];

  void saveOfferDraft(String requestId, OfferDraft draft) {
    _offerDrafts[requestId] = draft.copy();
  }

  void clearOfferDraft(String requestId) {
    _offerDrafts.remove(requestId);
  }

  Future<List<DriverVehicle>> loadDriverVehicles() async {
    if (!isAuthenticated) {
      vehicles = [
        DriverVehicle(
          id: primaryVehicleId ?? 'local-1',
          name: 'Primary',
          plate: '—',
          vehicleClass: 'sedan',
          amenities: Map<String, dynamic>.from(amenities),
        ),
      ];
      return vehicles;
    }
    try {
      final list = await api.driver.listVehicles();
      vehicles = list
          .whereType<Map>()
          .map((e) => DriverVehicle.fromJson(Map<String, dynamic>.from(e)))
          .toList();
      settingsVehicleCount = vehicles.length;
      if (vehicles.isNotEmpty) {
        final currentValid = primaryVehicleId != null &&
            vehicles.any((x) => x.id == primaryVehicleId);
        if (!currentValid) {
          final def = vehicles.where((v) => v.isDefault);
          primaryVehicleId =
              def.isNotEmpty ? def.first.id : vehicles.first.id;
        }
        final v = vehicles.firstWhere(
          (x) => x.id == primaryVehicleId,
          orElse: () => vehicles.first,
        );
        for (final key in amenities.keys.toList()) {
          amenities[key] = v.amenities[key] == true;
        }
        autocancelBefore = v.autocancelBefore;
        autocancelAfter = v.autocancelAfter;
        repo.driver.vehicleName = v.name;
        repo.driver.plate = v.plate;
      } else {
        repo.driver.vehicleName = '';
        repo.driver.plate = '';
      }
      notifyListeners();
      return vehicles;
    } catch (e) {
      debugPrint('loadDriverVehicles: $e');
      return vehicles;
    }
  }

  Future<DriverVehicle?> createDriverVehicle({
    required String name,
    required String plate,
    required String vehicleClass,
    String? color,
    int? year,
    int? passengerSeats,
    int? luggagePlaces,
    bool isDefault = false,
  }) async {
    final row = await api.driver.createVehicle(
      name: name,
      plate: plate,
      vehicleClass: vehicleClass,
      color: color,
      year: year,
      passengerSeats: passengerSeats,
      luggagePlaces: luggagePlaces,
      amenities: Map<String, dynamic>.from(amenities),
      autocancelBefore: autocancelBefore,
      autocancelAfter: autocancelAfter,
      isDefault: isDefault || vehicles.isEmpty,
    );
    final created = DriverVehicle.fromJson(row);
    primaryVehicleId = created.id;
    await loadDriverVehicles();
    return created;
  }

  Future<void> updateDriverVehicle(
    String id, {
    Map<String, dynamic>? patch,
    DateTime? expectedUpdatedAt,
  }) async {
    final body = <String, dynamic>{
      ...?patch,
      'amenities': Map<String, dynamic>.from(amenities),
      'autocancelBefore': autocancelBefore,
      'autocancelAfter': autocancelAfter,
      if (expectedUpdatedAt != null)
        'expectedUpdatedAt': expectedUpdatedAt.toUtc().toIso8601String(),
    };
    await api.driver.updateVehicle(id, body);
    await loadDriverVehicles();
  }

  Future<void> deleteDriverVehicle(String id) async {
    await api.driver.deleteVehicle(id);
    if (primaryVehicleId == id) primaryVehicleId = null;
    await loadDriverVehicles();
  }

  Future<DriverRequest> loadRequestDetail(String requestId) async {
    if (!isAuthenticated) {
      final local = [
        ...repo.newRequests,
        ...repo.myOffers,
        ...openRequests,
      ].where((r) => r.id == requestId);
      if (local.isEmpty) {
        throw Exception('Request not found');
      }
      return local.first;
    }
    final json = await api.driver.requestDetail(requestId);
    final req = driverRequestFromServer(json);
    final idx = openRequests.indexWhere((r) => r.id == requestId);
    if (idx >= 0) {
      openRequests[idx] = req;
    } else {
      openRequests = [req, ...openRequests];
    }
    final eligible = json['eligibleVehicles'];
    if (eligible is List) {
      vehicles = eligible
          .whereType<Map>()
          .map((e) => DriverVehicle.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    }
    notifyListeners();
    return req;
  }

  Future<String?> skipRequest(String requestId) async {
    if (!isAuthenticated) {
      openRequests = openRequests.where((r) => r.id != requestId).toList();
      notifyListeners();
      return openRequests.isEmpty ? null : openRequests.first.id;
    }
    final res = await api.driver.skipRequest(requestId);
    clearOfferDraft(requestId);
    await refreshOpenRequests();
    final next = res['nextRequestId'];
    return next is String ? next : null;
  }

  Future<void> submitOfferDraft(String requestId, OfferDraft draft) async {
    if (offerSubmitting) return;
    offerSubmitting = true;
    notifyListeners();
    try {
      final outbound = draft.outboundPrice;
      if (outbound == null || outbound <= 0) {
        throw Exception('Enter a valid outbound price');
      }
      final idem =
          'offer_${requestId}_${DateTime.now().millisecondsSinceEpoch}';
      if (isAuthenticated) {
        DriverOfferSummary? existing;
        for (final r in openRequests) {
          if (r.id == requestId && r.myOffer != null && r.myOffer!.isActive) {
            existing = r.myOffer;
            break;
          }
        }

        String? currency;
        for (final r in openRequests) {
          if (r.id == requestId) {
            currency = r.currency;
            break;
          }
        }

        if (existing != null) {
          await api.driver.updateOffer(
            requestId,
            existing.id,
            outboundPrice: outbound,
            returnPrice: draft.returnPrice,
            vehicleId: draft.vehicleId ?? primaryVehicleId,
            validForSeconds: draft.validForSeconds,
            selectedOptions: draft.selectedOptions.toList(),
            idempotencyKey: idem,
          );
        } else {
          if (draft.vehicleId == null && primaryVehicleId == null) {
            await ensureVehicle();
          }
          await api.driver.createOffer(
            requestId,
            outboundPrice: outbound,
            returnPrice: draft.returnPrice,
            vehicleId: draft.vehicleId ?? primaryVehicleId,
            validForSeconds: draft.validForSeconds ?? 30 * 60,
            selectedOptions: draft.selectedOptions.toList(),
            currency: currency ?? 'CAD',
            idempotencyKey: idem,
          );
        }
        clearOfferDraft(requestId);
        await refreshOpenRequests();
        return;
      }
      repo.submitDriverOffer(requestId, outbound + (draft.returnPrice ?? 0));
      clearOfferDraft(requestId);
      notifyListeners();
    } finally {
      offerSubmitting = false;
      notifyListeners();
    }
  }

  Future<void> withdrawOffer(String offerId) async {
    if (!isAuthenticated) return;
    await api.driver.withdrawOffer(offerId);
    await refreshOpenRequests();
  }

  DriverRequest? rideById(String rideId) {
    for (final r in myRides) {
      if (r.id == rideId) return r;
    }
    for (final r in openRequests) {
      if (r.id == rideId) return r;
    }
    return null;
  }

  Future<DriverRequest> loadTripDetail(String rideId) async =>
      loadRequestDetail(rideId);

  Future<Map<String, dynamic>> tripGoEnRoute(String rideId) async {
    final res = await api.driver.enRoute(rideId);
    await refreshMyRides();
    notifyListeners();
    return res;
  }

  Future<Map<String, dynamic>> tripArrived(String rideId) async {
    final res = await api.driver.arrived(rideId);
    await refreshMyRides();
    notifyListeners();
    return res;
  }

  Future<Map<String, dynamic>> tripStart(String rideId) async {
    final res = await api.driver.startTrip(rideId);
    await refreshMyRides();
    notifyListeners();
    return res;
  }

  Future<Map<String, dynamic>> tripComplete(String rideId) async {
    stopTripLocationTracking();
    final res = await api.driver.completeTrip(rideId);
    await refreshMyRides();
    notifyListeners();
    return res;
  }

  Future<void> pushTripLocation({
    required String rideId,
    required double lat,
    required double lng,
  }) async {
    if (!isAuthenticated) return;
    await api.driver.pushLocation(lat: lat, lng: lng, rideId: rideId);
  }

  Timer? _tripLocationTimer;
  String? _trackingRideId;

  void startTripLocationTracking(String rideId) {
    if (_trackingRideId == rideId && _tripLocationTimer != null) return;
    stopTripLocationTracking();
    _trackingRideId = rideId;
    unawaited(_pushCurrentLocation(rideId));
    _tripLocationTimer = Timer.periodic(const Duration(seconds: 20), (_) {
      unawaited(_pushCurrentLocation(rideId));
    });
  }

  void stopTripLocationTracking() {
    _tripLocationTimer?.cancel();
    _tripLocationTimer = null;
    _trackingRideId = null;
  }

  Future<void> _pushCurrentLocation(String rideId) async {
    try {
      double lat = baseLatitude;
      double lng = baseLongitude;
      try {
        final permission = await Geolocator.checkPermission();
        var perm = permission;
        if (perm == LocationPermission.denied) {
          perm = await Geolocator.requestPermission();
        }
        if (perm == LocationPermission.whileInUse ||
            perm == LocationPermission.always) {
          final pos = await Geolocator.getCurrentPosition(
            locationSettings: const LocationSettings(
              accuracy: LocationAccuracy.high,
              timeLimit: Duration(seconds: 8),
            ),
          );
          lat = pos.latitude;
          lng = pos.longitude;
        }
      } catch (e) {
        debugPrint('geolocator fallback to base: $e');
      }
      await pushTripLocation(rideId: rideId, lat: lat, lng: lng);
    } catch (e) {
      debugPrint('pushTripLocation: $e');
    }
  }
}
