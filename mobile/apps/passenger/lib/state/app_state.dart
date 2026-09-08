import 'package:flutter/foundation.dart';
import 'package:gt_api/gt_api.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum ServiceType { ride, perHour, delivery, carRental, experiences }

class AppState extends ChangeNotifier {
  AppState() {
    _bootstrap();
  }

  final MockRepository repo = MockRepository.instance;
  final CanGoSession api = CanGoSession();

  static const _onboardedKey = 'passenger_onboarded';

  bool onboarded = false;
  bool ready = false;
  bool isAuthenticated = false;
  Map<String, dynamic>? me;
  final Map<String, List<Offer>> _serverOffers = {};
  final Map<String, String> _serverRideStatus = {};

  int shellTabIndex = 0;

  ServiceType serviceType = ServiceType.ride;
  Place? from;
  Place? to;
  /// Multi-select vehicle classes on Book (ride).
  Set<String> vehicleClassIds = {MockData.vehicleClasses.first.id};
  int adults = 2;
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
  String currency = 'US\$';
  String distanceUnit = 'km';
  bool notificationsEnabled = true;

  /// Short code for menu rows (e.g. USD instead of US$).
  String get currencyCode {
    switch (currency) {
      case 'US\$':
        return 'USD';
      case 'CAD\$':
        return 'CAD';
      case 'EUR€':
        return 'EUR';
      case 'GBP£':
        return 'GBP';
      case 'AED':
        return 'AED';
      default:
        return currency.replaceAll(RegExp(r'[^\w]'), '');
    }
  }

  int get completedRideCount =>
      repo.rides.where((r) => r.status == RideStatus.past).length;

  Future<void> _bootstrap() async {
    final prefs = await SharedPreferences.getInstance();
    onboarded = prefs.getBool(_onboardedKey) ?? false;
    isAuthenticated = await api.isAuthenticated();
    if (isAuthenticated) {
      try {
        me = await api.auth.me();
        await refreshRidesFromServer();
      } catch (_) {
        isAuthenticated = false;
        await api.clear();
      }
    }
    ready = true;
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
      role: 'PASSENGER',
      fullName: fullName,
    );
  }

  Future<void> verifyOtp({
    required String challengeId,
    required String code,
  }) async {
    await api.auth.verifyOtp(challengeId: challengeId, code: code);
    me = await api.auth.me();
    isAuthenticated = true;
    await setOnboarded(true);
    await refreshRidesFromServer();
    notifyListeners();
  }

  Future<void> login({
    required String email,
    required String password,
  }) async {
    await api.auth.login(email: email, password: password);
    me = await api.auth.me();
    isAuthenticated = true;
    await setOnboarded(true);
    await refreshRidesFromServer();
    notifyListeners();
  }

  Future<void> refreshRidesFromServer() async {
    if (!isAuthenticated) return;
    try {
      final list = await api.marketplace.listRides();
      repo.rides
        ..clear()
        ..addAll(
          list
              .whereType<Map>()
              .map((e) => rideFromServer(Map<String, dynamic>.from(e))),
        );
      for (final r in list.whereType<Map>()) {
        final id = r['id'] as String?;
        final status = r['status'] as String?;
        if (id != null && status != null) _serverRideStatus[id] = status;
        final offers = r['offers'];
        if (id != null && offers is List) {
          _serverOffers[id] = offers
              .whereType<Map>()
              .map((o) => offerFromServer(Map<String, dynamic>.from(o)))
              .toList();
        }
      }
      notifyListeners();
    } catch (e) {
      debugPrint('refreshRidesFromServer: $e');
    }
  }

  Future<void> setOnboarded(bool value) async {
    onboarded = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_onboardedKey, value);
    notifyListeners();
  }

  void setServiceType(ServiceType type) {
    serviceType = type;
    if (type == ServiceType.perHour &&
        perHourDurationMinutes == null &&
        !perHourHasEnd) {
      perHourDurationMinutes = 60;
      _syncRideEndsFromDuration();
    }
    notifyListeners();
  }

  void setFrom(Place? place) {
    from = place;
    notifyListeners();
  }

  void setTo(Place? place) {
    to = place;
    notifyListeners();
  }

  void swapRoute() {
    final tmp = from;
    from = to;
    to = tmp;
    notifyListeners();
  }

  void setVehicleClass(String id) {
    vehicleClassIds = {id};
    notifyListeners();
  }

  void toggleVehicleClass(String id) {
    if (vehicleClassIds.contains(id)) {
      if (vehicleClassIds.length <= 1) return; // keep at least one
      vehicleClassIds = {...vehicleClassIds}..remove(id);
    } else {
      vehicleClassIds = {...vehicleClassIds, id};
    }
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
    notifyListeners();
  }

  void setLanguage(String value) {
    language = value;
    notifyListeners();
  }

  void setCurrency(String value) {
    currency = value;
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

  void logoutSim() {
    // Prototype: clear local draft only
    from = null;
    to = null;
    comment = '';
    promoEnabled = false;
    promoCode = '';
    termsAccepted = false;
    notifyListeners();
  }

  void deleteAccountSim() {
    repo.passenger.fullName = '';
    repo.passenger.email = '';
    repo.passenger.phone = '';
    logoutSim();
  }

  RideRequest? rideById(String id) {
    try {
      return repo.rides.firstWhere((r) => r.id == id);
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
      ServiceType.carRental => 'CAR_RENTAL',
      ServiceType.experiences => 'EXPERIENCES',
      _ => 'RIDE',
    };
    final needsDropoff =
        serviceType == ServiceType.ride || serviceType == ServiceType.delivery;
    final isPerHour = serviceType == ServiceType.perHour;
    final hours = isPerHour
        ? ((perHourDurationMinutes ?? 60) / 60).clamp(1, 24).toDouble()
        : null;
    double? days;
    if (serviceType == ServiceType.carRental) {
      if (returnEnabled && returnDateTime != null) {
        final start = pickupNow ? DateTime.now() : pickupDateTime;
        final diff = returnDateTime!.difference(start).inHours;
        days = (diff / 24).ceil().clamp(1, 90).toDouble();
      } else {
        days = 1.0;
      }
    }
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
      hours: hours,
      days: days,
    );

    final created = await api.marketplace.createRide(
      serviceType: service,
      fromLabel: fromLabel,
      toLabel: toLabel,
      fromLat: pickup.lat,
      fromLng: pickup.lng,
      toLat: needsDropoff ? dropoff.lat : null,
      toLng: needsDropoff ? dropoff.lng : null,
      pickupAt: pickupAt,
      vehicleClassIds: vehicleClassIds.toList(),
      adults: adults,
      flight: flight.isEmpty ? null : flight,
      signage: signage.isEmpty ? null : signage,
      comment: comment.isEmpty ? null : comment,
      promoCode: promoEnabled && promoCode.isNotEmpty ? promoCode : null,
      hours: hours,
      days: days,
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
      timeBadge: timeBadge,
      status: ride.status,
      offerCount: ride.offerCount,
      returnLabel: returnLabel,
      selectedOfferId: ride.selectedOfferId,
      serverStatus: ride.serverStatus,
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
    notifyListeners();
    return local;
  }

  String _formatDate(DateTime d) => formatDateTimeLabel(d);

  List<Offer> offersFor(String rideId) {
    final cached = _serverOffers[rideId];
    if (cached != null && cached.isNotEmpty) return cached;
    return repo.offersFor(rideId);
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

  Future<void> paySelectedOffer(String rideId) async {
    await api.marketplace.createPaymentIntent(rideId);
    await refreshRidesFromServer();
    notifyListeners();
  }

  void setShellTab(int index) {
    shellTabIndex = index;
    notifyListeners();
  }

  void refresh() => notifyListeners();
}
