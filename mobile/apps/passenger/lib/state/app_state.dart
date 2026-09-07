import 'package:flutter/foundation.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum ServiceType { ride, perHour, delivery, carRental, experiences }

class AppState extends ChangeNotifier {
  AppState() {
    _loadOnboarded();
  }

  final MockRepository repo = MockRepository.instance;

  static const _onboardedKey = 'passenger_onboarded';

  bool onboarded = false;
  bool ready = false;
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

  Future<void> _loadOnboarded() async {
    final prefs = await SharedPreferences.getInstance();
    onboarded = prefs.getBool(_onboardedKey) ?? false;
    ready = true;
    notifyListeners();
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
      return repo.offersFor(rideId).firstWhere((o) => o.id == offerId);
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
    } else if (serviceType == ServiceType.experiences ||
        serviceType == ServiceType.carRental) {
      // single location
    } else if (to != null) {
      toLabel = to!.label;
    }

    if (returnEnabled && returnDateTime != null) {
      returnLabel = _formatDate(returnDateTime!);
    }

    final req = repo.createRequest(
      from: fromLabel,
      to: toLabel,
      timeBadge: timeBadge,
      returnLabel: returnLabel,
    );
    notifyListeners();
    return req;
  }

  String _formatDate(DateTime d) => formatDateTimeLabel(d);

  void selectOffer(String rideId, String offerId) {
    repo.selectOffer(rideId, offerId);
    notifyListeners();
  }

  void setShellTab(int index) {
    shellTabIndex = index;
    notifyListeners();
  }

  void refresh() => notifyListeners();
}
