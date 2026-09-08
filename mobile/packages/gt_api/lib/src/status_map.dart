import 'package:gt_mock/gt_mock.dart';

/// Maps server RideStatus strings to Flutter UX [RideStatus].
RideStatus mapServerRideStatus(String? status) {
  switch ((status ?? '').toUpperCase()) {
    case 'WAITING_FOR_OFFERS':
      return RideStatus.waitingOffers;
    case 'OFFER_SELECTION':
      return RideStatus.chooseOffer;
    case 'PAYMENT_PENDING':
      return RideStatus.paymentPending;
    case 'BOOKED':
    case 'EN_ROUTE':
    case 'DRIVER_EN_ROUTE':
    case 'ARRIVED':
    case 'DRIVER_ARRIVED':
    case 'TRIP_STARTED':
    case 'IN_PROGRESS':
      return RideStatus.booked;
    case 'COMPLETED':
      return RideStatus.past;
    case 'PASSENGER_CANCELLED':
    case 'DRIVER_CANCELLED':
    case 'ADMIN_CANCELLED':
    case 'EXPIRED':
    case 'NO_SHOW':
    case 'PAYMENT_FAILED':
      return RideStatus.cancelled;
    default:
      return RideStatus.waitingOffers;
  }
}

String friendlyRideStatus(String? serverStatus) {
  switch ((serverStatus ?? '').toUpperCase()) {
    case 'WAITING_FOR_OFFERS':
      return 'Waiting for offers';
    case 'OFFER_SELECTION':
      return 'Choose an offer';
    case 'PAYMENT_PENDING':
      return 'Payment pending';
    case 'BOOKED':
      return 'Booked';
    case 'DRIVER_EN_ROUTE':
      return 'Driver en route';
    case 'DRIVER_ARRIVED':
      return 'Driver arrived';
    case 'TRIP_STARTED':
    case 'IN_PROGRESS':
      return 'In progress';
    case 'COMPLETED':
      return 'Completed';
    case 'EXPIRED':
      return 'Expired';
    case 'NO_SHOW':
      return 'No-show';
    case 'PAYMENT_FAILED':
      return 'Payment failed';
    default:
      if ((serverStatus ?? '').contains('CANCEL')) return 'Cancelled';
      return serverStatus ?? 'Unknown';
  }
}

RideRequest rideFromServer(Map<String, dynamic> json) {
  final snap = json['priceSnapshot'];
  String? distance;
  String? duration;
  if (snap is Map) {
    final km = snap['distanceKm'];
    final mins = snap['durationMin'];
    if (km != null) distance = '${km} km';
    if (mins != null) {
      final m = (mins as num).round();
      duration = m >= 60 ? '~ ${m ~/ 60} h ${m % 60} min' : '~ $m min';
    }
  }
  final offers = json['offers'];
  final offerCount = offers is List ? offers.length : (json['offerCount'] as int? ?? 0);
  final pickup = json['pickupAt']?.toString();
  return RideRequest(
    id: json['id'] as String,
    datetimeLabel: pickup ?? '',
    from: json['fromLabel'] as String? ?? '',
    to: json['toLabel'] as String?,
    distance: distance,
    duration: duration,
    status: mapServerRideStatus(json['status'] as String?),
    offerCount: offerCount,
    selectedOfferId: json['selectedOfferId'] as String?,
    serverStatus: json['status'] as String?,
  );
}

Offer offerFromServer(Map<String, dynamic> json) {
  final snap = json['priceSnapshot'];
  double price = 0;
  String currency = json['currency'] as String? ?? 'USD';
  if (json['bidAmount'] != null) {
    price = (json['bidAmount'] as num).toDouble();
  } else if (snap is Map && snap['passengerTotal'] != null) {
    price = (snap['passengerTotal'] as num).toDouble();
  }
  final driver = json['driver'];
  final name = driver is Map ? (driver['fullName'] as String? ?? 'Driver') : 'Driver';
  return Offer(
    id: json['id'] as String,
    vehicleBrand: name,
    vehicleModel: '',
    vehicleClass: snap is Map ? (snap['vehicleClass'] as String? ?? 'sedan') : 'sedan',
    price: price,
    currency: currency == 'USD' ? '\$' : currency,
    rating: 5,
    ratingCount: 0,
    rides: 0,
    options: const [],
    languages: const ['English'],
    carrierId: driver is Map ? (driver['id'] as String? ?? '') : '',
    passengers: 3,
  );
}

DriverRequest driverRequestFromServer(Map<String, dynamic> json) {
  final snap = json['priceSnapshot'];
  String distance = '—';
  String duration = '—';
  if (snap is Map) {
    final km = snap['distanceKm'];
    final mins = snap['durationMin'];
    if (km != null) distance = '${km} km';
    if (mins != null) {
      final m = (mins as num).round();
      duration = m >= 60 ? '~ ${m ~/ 60} h ${m % 60} min' : '~ $m min';
    }
  }
  final classes = json['vehicleClassIds'];
  final vehicleNeed = classes is List && classes.isNotEmpty
      ? classes.first.toString()
      : 'sedan';
  final offers = json['offers'];
  final hasOffer = offers is List && offers.isNotEmpty;
  double? offerPrice;
  if (hasOffer && offers.first is Map) {
    final bid = (offers.first as Map)['bidAmount'];
    if (bid is num) offerPrice = bid.toDouble();
  }
  return DriverRequest(
    id: json['id'] as String,
    datetimeLabel: json['pickupAt']?.toString() ?? '',
    from: json['fromLabel'] as String? ?? '',
    to: json['toLabel'] as String? ?? '',
    distance: distance,
    duration: duration,
    vehicleNeed: vehicleNeed,
    passengers: (json['adults'] as num?)?.toInt() ?? 1,
    hasOffer: hasOffer,
    offerPrice: offerPrice,
  );
}
