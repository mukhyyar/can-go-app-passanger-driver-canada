import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AppState extends ChangeNotifier {
  AppState();

  final MockRepository repo = MockRepository.instance;

  static const _kOnboarded = 'driver_onboarded';
  static const _kActivated = 'driver_activated';
  static const _kOperatingZones = 'driver_operating_zones';
  static const _kBaseLat = 'driver_base_lat';
  static const _kBaseLng = 'driver_base_lng';
  static const _kBaseLocation = 'driver_base_location';

  bool loaded = false;
  bool onboardedComplete = false;
  bool isActivated = false;

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

  String defaultDriverName = 'Syed Mukhyyar Hussain Rizvi';
  int autocancelBefore = 10;
  int autocancelAfter = 10;

  String billingPeriod = '3 days';
  String outpaymentCurrency = 'USD';
  String bankCountry = 'Canada';

  bool selfieUploaded = true;
  bool vehicleDocUploaded = false;
  int vehiclePhotoCount = 0;
  bool photoRequirementsSeen = false;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    onboardedComplete = prefs.getBool(_kOnboarded) ?? false;
    isActivated = prefs.getBool(_kActivated) ?? false;
    repo.driver.isActivated = isActivated;
    fullName = repo.driver.fullName;
    defaultDriverName = repo.driver.fullName;
    baseLocation =
        prefs.getString(_kBaseLocation) ?? repo.driver.baseLocation;
    baseLatitude = prefs.getDouble(_kBaseLat) ?? repo.driver.baseLatitude;
    baseLongitude = prefs.getDouble(_kBaseLng) ?? repo.driver.baseLongitude;
    repo.driver.baseLocation = baseLocation;
    repo.driver.baseLatitude = baseLatitude;
    repo.driver.baseLongitude = baseLongitude;
    isIndividual = repo.driver.isIndividual;
    operatingZones = _decodeZones(prefs.getString(_kOperatingZones));
    repo.driver.operatingZones = List<OperatingZone>.from(operatingZones);
    loaded = true;
    notifyListeners();
  }

  List<OperatingZone> _decodeZones(String? raw) {
    if (raw == null || raw.isEmpty) return [];
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list
          .map((e) => OperatingZone.fromJson(Map<String, dynamic>.from(e as Map)))
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

  Future<void> setActivated(bool value) async {
    isActivated = value;
    repo.driver.isActivated = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kActivated, value);
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

  /// Prototype local save. Replace body with `POST /driver/operating-zones`.
  Future<void> saveOperatingZones(List<OperatingZone> zones) async {
    operatingZones = List<OperatingZone>.from(zones);
    repo.driver.operatingZones = List<OperatingZone>.from(zones);
    final prefs = await SharedPreferences.getInstance();
    final payload = jsonEncode(zones.map((z) => z.toJson()).toList());
    await prefs.setString(_kOperatingZones, payload);
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
    await setOnboarded(false);
    await setActivated(false);
    acceptedTerms = false;
    selectedLanguages.clear();
    notifyListeners();
  }

  void submitOffer(String requestId, double price) {
    repo.submitDriverOffer(requestId, price);
    notifyListeners();
  }
}
