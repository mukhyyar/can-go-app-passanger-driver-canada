import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AppState extends ChangeNotifier {
  AppState();

  final MockRepository repo = MockRepository.instance;
  final CanGoSession api = CanGoSession();

  static const _kOnboarded = 'driver_onboarded';
  static const _kOperatingZones = 'driver_operating_zones';
  static const _kBaseLat = 'driver_base_lat';
  static const _kBaseLng = 'driver_base_lng';
  static const _kBaseLocation = 'driver_base_location';

  bool loaded = false;
  bool onboardedComplete = false;
  bool isAuthenticated = false;
  bool isActivated = false;
  Map<String, dynamic>? me;

  bool isIndividual = true;
  String fullName = '';
  String legalName = '';
  String registrationNumber = '';
  String taxpayerId = '';
  String address = '';
  String baseLocation = '';
  double baseLatitude = 43.8341;
  double baseLongitude = -79.5373;
  List<OperatingZone> operatingZones = [];
  bool hasReferral = false;
  String referralCode = '';
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
  String outpaymentCurrency = 'USD';
  String bankCountry = 'Canada';

  bool selfieUploaded = false;
  bool licenseUploaded = false;
  bool vehicleDocUploaded = false;
  int vehiclePhotoCount = 0;
  bool photoRequirementsSeen = false;
  String? primaryVehicleId;

  List<DriverRequest> openRequests = [];

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
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
        await syncDocumentsStatus();
        if (isActivated) {
          await refreshOpenRequests();
        }
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

  Future<void> verifyOtp({
    required String challengeId,
    required String code,
  }) async {
    await api.auth.verifyOtp(challengeId: challengeId, code: code);
    isAuthenticated = true;
    await refreshMe();
    notifyListeners();
  }

  Future<void> login({
    required String email,
    required String password,
  }) async {
    await api.auth.login(email: email, password: password);
    isAuthenticated = true;
    await refreshMe();
    if (isActivated) await refreshOpenRequests();
    notifyListeners();
  }

  Future<void> refreshMe() async {
    me = await api.auth.me();
    final driver = me?['driver'] as Map<String, dynamic>?;
    if (driver != null) {
      isActivated = driver['isActivated'] == true;
      repo.driver.isActivated = isActivated;
      final name = driver['fullName'] as String?;
      if (name != null && name.isNotEmpty) {
        fullName = name;
        repo.driver.fullName = name;
        defaultDriverName = name;
      }
    }
  }

  Future<void> syncDocumentsStatus() async {
    if (!isAuthenticated) return;
    try {
      final status = await api.driver.documentsStatus();
      isActivated = status['isActivated'] == true;
      repo.driver.isActivated = isActivated;
      final checklist = status['checklist'];
      if (checklist is Map) {
        final required = checklist['required'];
        if (required is List) {
          for (final row in required.whereType<Map>()) {
            final type = row['docType'] as String?;
            final approved = row['approved'] == true;
            // Treat presence of any upload via documents list below.
            if (type == 'selfie' && approved) selfieUploaded = true;
            if (type == 'license' && approved) licenseUploaded = true;
            if (type == 'vehicle_registration' && approved) {
              vehicleDocUploaded = true;
            }
          }
        }
        final photos = checklist['vehiclePhotosApproved'];
        if (photos is num) {
          vehiclePhotoCount = photos.toInt().clamp(0, 6);
        }
      }
      final docs = status['documents'];
      if (docs is List) {
        vehiclePhotoCount = 0;
        for (final d in docs.whereType<Map>()) {
          final type = d['docType'] as String?;
          if (type == 'selfie') selfieUploaded = true;
          if (type == 'license') licenseUploaded = true;
          if (type == 'vehicle_registration') vehicleDocUploaded = true;
          if (type == 'vehicle_photo') {
            vehiclePhotoCount = (vehiclePhotoCount + 1).clamp(0, 6);
          }
        }
      }
      notifyListeners();
    } catch (e) {
      debugPrint('syncDocumentsStatus: $e');
    }
  }

  Future<void> uploadKycBytes({
    required String docType,
    required Uint8List bytes,
    required String filename,
    String? vehicleId,
  }) async {
    await api.driver.uploadDocument(
      docType: docType,
      bytes: bytes,
      filename: filename,
      vehicleId: vehicleId ?? primaryVehicleId,
    );
    if (docType == 'selfie') selfieUploaded = true;
    if (docType == 'license') licenseUploaded = true;
    if (docType == 'vehicle_registration') vehicleDocUploaded = true;
    if (docType == 'vehicle_photo') {
      vehiclePhotoCount = (vehiclePhotoCount + 1).clamp(0, 6);
    }
    notifyListeners();
  }

  Future<void> ensureVehicle() async {
    if (primaryVehicleId != null) return;
    final v = await api.driver.createVehicle(
      name: 'Primary',
      plate: 'TEMP-${DateTime.now().millisecondsSinceEpoch % 100000}',
      vehicleClass: 'sedan',
    );
    primaryVehicleId = v['id'] as String?;
  }

  Future<void> refreshOpenRequests() async {
    if (!isAuthenticated || !isActivated) return;
    try {
      final list = await api.driver.openRequests();
      openRequests = list
          .whereType<Map>()
          .map((e) => driverRequestFromServer(Map<String, dynamic>.from(e)))
          .toList();
      notifyListeners();
    } catch (e) {
      debugPrint('refreshOpenRequests: $e');
    }
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

  Future<void> setOnboarded(bool value) async {
    onboardedComplete = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kOnboarded, value);
    notifyListeners();
  }

  /// Activation is server-side only (Admin KYC). Kept for UI compatibility.
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
    if (registrationNumber != null) this.registrationNumber = registrationNumber;
    if (taxpayerId != null) this.taxpayerId = taxpayerId;
    if (address != null) this.address = address;
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

  Future<void> saveOperatingZones(List<OperatingZone> zones) async {
    operatingZones = List<OperatingZone>.from(zones);
    repo.driver.operatingZones = List<OperatingZone>.from(zones);
    final prefs = await SharedPreferences.getInstance();
    final payload = jsonEncode(zones.map((z) => z.toJson()).toList());
    await prefs.setString(_kOperatingZones, payload);

    if (isAuthenticated) {
      for (final z in zones) {
        try {
          await api.driver.createZone(
            name: z.name,
            zoneType: z.isCircle ? 'circle' : 'polygon',
            geoJson: _zoneToGeoJson(z),
            radiusKm: z.radiusKm,
          );
        } catch (e) {
          debugPrint('save zone ${z.name}: $e');
        }
      }
    }
    notifyListeners();
  }

  bool get profileValidEnough =>
      fullName.trim().isNotEmpty && acceptedTerms;

  void toggleLanguage(String language) {
    if (selectedLanguages.contains(language)) {
      selectedLanguages.remove(language);
    } else if (selectedLanguages.length < 6) {
      selectedLanguages.add(language);
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
  }) {
    if (billingPeriod != null) this.billingPeriod = billingPeriod;
    if (outpaymentCurrency != null) this.outpaymentCurrency = outpaymentCurrency;
    if (bankCountry != null) this.bankCountry = bankCountry;
    notifyListeners();
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

  void markPhotoRequirementsSeen() {
    photoRequirementsSeen = true;
    notifyListeners();
  }

  Future<void> completeOnboarding() async {
    await setOnboarded(true);
  }

  Future<void> signOut() async {
    await api.auth.logout();
    await api.clear();
    isAuthenticated = false;
    isActivated = false;
    me = null;
    await setOnboarded(false);
    acceptedTerms = false;
    selectedLanguages.clear();
    notifyListeners();
  }

  Future<void> submitOffer(String requestId, double price) async {
    if (isAuthenticated) {
      await api.driver.createOffer(requestId, bidAmount: price);
      await refreshOpenRequests();
      return;
    }
    repo.submitDriverOffer(requestId, price);
    notifyListeners();
  }
}
