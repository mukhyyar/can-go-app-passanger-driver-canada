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
      return 'Please wait for offers';
    case 'OFFER_SELECTION':
      return 'Please choose offer and book';
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

/// Friendly copy for a local [RideStatus] (falls back when serverStatus missing).
String friendlyLocalRideStatus(RideStatus status) {
  switch (status) {
    case RideStatus.waitingOffers:
      return 'Please wait for offers';
    case RideStatus.chooseOffer:
      return 'Please choose offer and book';
    case RideStatus.paymentPending:
      return 'Payment pending';
    case RideStatus.booked:
      return 'Booked';
    case RideStatus.past:
      return 'Completed';
    case RideStatus.cancelled:
      return 'Cancelled';
  }
}

RideRequest rideFromServer(Map<String, dynamic> json) {
  final snap = json['priceSnapshot'];
  String? distance;
  String? duration;
  if (snap is Map) {
    final km = snap['distanceKm'];
    final mins = snap['durationMin'];
    if (km != null) {
      final v = km is num ? km : num.tryParse(km.toString());
      if (v != null) {
        distance = v == v.roundToDouble() ? '${v.round()} km' : '${v.toStringAsFixed(1)} km';
      }
    }
    if (mins != null) {
      final m = (mins as num).round();
      duration = m >= 60 ? '~ ${m ~/ 60} h ${m % 60} min' : '~ $m min';
    }
  }
  final offers = json['offers'];
  final offerCount =
      offers is List ? offers.length : (json['offerCount'] as int? ?? 0);

  final pickupLabel = _formatPickup(json['pickupAt']);
  final returnLabel =
      json['returnAt'] != null ? _formatPickup(json['returnAt']) : null;

  String? createdAtLabel;
  final createdRaw = json['createdAt'];
  if (createdRaw != null) {
    createdAtLabel = _formatPickup(createdRaw);
  }

  String? timeBadge;
  final pickupNow = json['pickupNow'] as bool?;
  if (pickupNow == true) {
    timeBadge = 'Pickup now';
  } else if (pickupLabel.isNotEmpty) {
    timeBadge = 'Scheduled';
  }

  return RideRequest(
    id: json['id'] as String,
    datetimeLabel: pickupLabel,
    from: json['fromLabel'] as String? ?? '',
    to: json['toLabel'] as String?,
    distance: distance,
    duration: duration,
    timeBadge: timeBadge,
    status: mapServerRideStatus(json['status'] as String?),
    offerCount: offerCount,
    returnLabel: returnLabel,
    selectedOfferId: json['selectedOfferId'] as String?,
    serverStatus: json['status'] as String?,
    shortId: json['shortId']?.toString(),
    createdAtLabel: createdAtLabel,
    viewCount: (json['viewCount'] as num?)?.toInt(),
    currency: json['currency'] as String?,
  );
}

Offer offerFromServer(Map<String, dynamic> json) {
  final presentation = json['presentation'];
  final pres = presentation is Map
      ? Map<String, dynamic>.from(presentation)
      : <String, dynamic>{};

  final snap = json['priceSnapshot'];
  final snapMap = snap is Map ? Map<String, dynamic>.from(snap) : null;

  final currencyRaw = (pres['priceBreakdown'] is Map
          ? (pres['priceBreakdown'] as Map)['currency']
          : null) ??
      json['currency'] ??
      snapMap?['currency'] ??
      'USD';
  final currency = currencyRaw.toString().toUpperCase();

  double price = _asDouble(pres['passengerTotal']);
  if (price <= 0) price = _asDouble(json['bidAmount']);
  if (price <= 0) price = _asDouble(snapMap?['passengerTotal']);

  final ratingRaw = pres['rating'];
  final ratingMap =
      ratingRaw is Map ? Map<String, dynamic>.from(ratingRaw) : null;
  final ratingBreakdown = OfferRatingBreakdown.fromJson(ratingMap);

  final amenitiesRaw = pres['amenities'];
  final options = <String>[];
  if (amenitiesRaw is List) {
    for (final a in amenitiesRaw) {
      if (a is Map && a['label'] != null) {
        options.add(a['label'].toString());
      } else if (a != null) {
        options.add(a.toString());
      }
    }
  }
  if (options.isEmpty) {
    final selected = json['selectedOptions'];
    if (selected is List) {
      options.addAll(selected.map((e) => e.toString()));
    }
  }

  final languagesRaw = pres['languages'] ?? json['languages'];
  final languages = languagesRaw is List
      ? languagesRaw.map((e) => e.toString()).toList()
      : <String>['EN'];

  final images = <OfferImage>[];
  final imagesRaw = pres['images'];
  if (imagesRaw is List) {
    for (final img in imagesRaw) {
      if (img is Map && img['url'] != null) {
        images.add(
          OfferImage(
            id: img['id']?.toString() ?? img['url'].toString(),
            url: img['url'].toString(),
          ),
        );
      }
    }
  }

  final reviews = <Review>[];
  final reviewsRaw = pres['reviews'];
  if (reviewsRaw is List) {
    for (final r in reviewsRaw) {
      if (r is! Map) continue;
      DateTime? created;
      final ca = r['createdAt'];
      if (ca is String) created = DateTime.tryParse(ca);
      reviews.add(
        Review(
          stars: _asInt(r['stars']),
          text: r['text']?.toString() ?? '',
          fromLanguage: r['translatedFrom']?.toString(),
          createdAt: created,
        ),
      );
    }
  }

  final waiting = pres['waitingTime'];
  String? waitingSummary;
  if (waiting is Map) {
    waitingSummary = waiting['summary']?.toString();
  }

  final vehicle = json['vehicle'];
  final vehicleMap =
      vehicle is Map ? Map<String, dynamic>.from(vehicle) : null;

  final brand = pres['brand']?.toString() ??
      () {
        final name = vehicleMap?['name']?.toString().trim() ?? '';
        if (name.isEmpty) return null;
        return name.split(RegExp(r'\s+')).first;
      }() ??
      (json['driver'] is Map
          ? (json['driver'] as Map)['fullName']?.toString()
          : null) ??
      'Vehicle';
  final model = pres['model']?.toString() ?? '';
  final vehicleClass = pres['vehicleClass']?.toString() ??
      vehicleMap?['vehicleClass']?.toString() ??
      snapMap?['vehicleClass']?.toString() ??
      'sedan';

  final breakdownRaw = pres['priceBreakdown'];
  final priceBreakdown = breakdownRaw is Map
      ? OfferPriceBreakdown.fromJson(Map<String, dynamic>.from(breakdownRaw))
      : null;

  final id = json['id']?.toString();
  if (id == null || id.isEmpty) {
    throw FormatException('Offer missing id');
  }

  return Offer(
    id: id,
    vehicleBrand: brand,
    vehicleModel: model,
    vehicleClass: vehicleClass,
    price: price,
    currency: currency,
    rating: ratingBreakdown.overall > 0
        ? ratingBreakdown.overall
        : _asDouble(json['rating']),
    ratingCount: ratingBreakdown.count,
    rides: ratingBreakdown.completedRides,
    options: options,
    languages: languages,
    carrierId: pres['carrierId']?.toString() ??
        (json['driver'] is Map
            ? (json['driver'] as Map)['id']?.toString() ?? ''
            : ''),
    passengers: _asInt(pres['passengers'], fallback: 3),
    yearsWithPlatform: ratingBreakdown.yearsWithPlatform > 0
        ? ratingBreakdown.yearsWithPlatform
        : 1,
    reviews: reviews,
    imageUrl: pres['imageUrl']?.toString(),
    images: images,
    year: _asIntNullable(pres['year']),
    baggage: _asIntNullable(pres['baggage']),
    status: json['status']?.toString(),
    priceBreakdown: priceBreakdown,
    ratingBreakdown: ratingBreakdown,
    waitingTimeSummary: waitingSummary,
    color: pres['color']?.toString(),
    vehicleDisplayName: pres['vehicleDisplayName']?.toString() ??
        vehicleMap?['name']?.toString(),
    plate: pres['plate']?.toString() ?? vehicleMap?['plate']?.toString(),
  );
}

double _asDouble(dynamic v) {
  if (v == null) return 0;
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v.trim()) ?? 0;
  return 0;
}

int _asInt(dynamic v, {int fallback = 0}) {
  if (v == null) return fallback;
  if (v is int) return v;
  if (v is num) return v.round();
  if (v is String) return int.tryParse(v.trim()) ?? fallback;
  return fallback;
}

int? _asIntNullable(dynamic v) {
  if (v == null) return null;
  if (v is int) return v;
  if (v is num) return v.round();
  if (v is String) return int.tryParse(v.trim());
  return null;
}

const _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const _months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sept',
  'Oct',
  'Nov',
  'Dec',
];

String _formatPickup(Object? raw) {
  if (raw == null) return '';
  final dt = DateTime.tryParse(raw.toString())?.toLocal();
  if (dt == null) return raw.toString();
  final hh = dt.hour.toString().padLeft(2, '0');
  final mm = dt.minute.toString().padLeft(2, '0');
  return '${_weekdays[dt.weekday - 1]} ${dt.day} ${_months[dt.month - 1]}, $hh:$mm';
}

String _relativeAge(DateTime? createdAt) {
  if (createdAt == null) return '';
  final diff = DateTime.now().difference(createdAt);
  if (diff.inMinutes < 1) return 'just now';
  if (diff.inMinutes < 60) {
    final m = diff.inMinutes;
    return m == 1 ? '1 minute ago' : '$m minutes ago';
  }
  if (diff.inHours < 48) {
    final h = diff.inHours;
    return h == 1 ? 'an hour ago' : '$h hours ago';
  }
  final d = diff.inDays;
  return d == 1 ? '1 day ago' : '$d days ago';
}

String _ttlFromExpiry(Object? expiresAt) {
  if (expiresAt == null) return '15 min';
  final dt = DateTime.tryParse(expiresAt.toString());
  if (dt == null) return '15 min';
  final secs = dt.difference(DateTime.now()).inSeconds;
  if (secs <= 0) return 'Expired';
  if (secs < 3600) return '${(secs / 60).ceil()} min';
  if (secs < 86400) return '${(secs / 3600).ceil()} h';
  return '${(secs / 86400).ceil()} d';
}

String _formatDuration(num mins) {
  final m = mins.round();
  if (m >= 60) {
    final h = m ~/ 60;
    final rem = m % 60;
    return rem == 0 ? '~ $h h' : '~ $h h $rem min';
  }
  return '~ $m min';
}

DriverRequest driverRequestFromServer(Map<String, dynamic> json) {
  final snap = json['priceSnapshot'];
  final guidanceRaw = json['pricingGuidance'];
  Map<String, dynamic>? snapMap;
  if (snap is Map) snapMap = Map<String, dynamic>.from(snap);
  if (guidanceRaw is Map) {
    snapMap = {...?snapMap, ...Map<String, dynamic>.from(guidanceRaw)};
  }

  final isRoundTrip = json['isRoundTrip'] as bool? ??
      snapMap?['isRoundTrip'] as bool? ??
      false;
  final legs = (snapMap?['legs'] as num?)?.toInt() ?? (isRoundTrip ? 2 : 1);

  String distance = '—';
  String duration = '—';
  if (snapMap != null) {
    final km = snapMap['distanceKm'];
    final mins = snapMap['durationMin'];
    if (km != null) {
      final oneWay = (km as num) / (legs > 0 ? legs : 1);
      distance = legs > 1
          ? '${oneWay.toStringAsFixed(0)} km × $legs'
          : '$km km';
    }
    if (mins != null) {
      final oneWayMins = (mins as num) / (legs > 0 ? legs : 1);
      duration = legs > 1
          ? '${_formatDuration(oneWayMins)} × $legs'
          : _formatDuration(mins);
    }
  }

  final classes = json['vehicleClassIds'];
  final classList = classes is List
      ? classes.map((e) => e.toString()).toList()
      : <String>[];
  final vehicleNeed =
      classList.isNotEmpty ? classList.join(', ') : 'Economy';

  final myOffers = json['myOffers'] ?? json['offers'];
  DriverOfferSummary? myOffer;
  if (myOffers is List && myOffers.isNotEmpty) {
    for (final raw in myOffers) {
      if (raw is Map) {
        final o = DriverOfferSummary.fromJson(Map<String, dynamic>.from(raw));
        if (o.isActive || myOffer == null) myOffer = o;
        if (o.isActive) break;
      }
    }
  }

  final requiredRaw = json['requiredOptions'];
  final requiredOptions = requiredRaw is List
      ? requiredRaw.map((e) => e.toString()).toList()
      : <String>[];

  final childRaw = json['childSeatsJson'];
  final childSeats = childRaw is Map
      ? Map<String, dynamic>.from(childRaw)
      : <String, dynamic>{};

  DateTime? createdAt;
  final createdRaw = json['createdAt'];
  if (createdRaw is String) createdAt = DateTime.tryParse(createdRaw);

  DateTime? requestExpiresAt;
  final expRaw = json['requestExpiresAt'];
  if (expRaw is String) requestExpiresAt = DateTime.tryParse(expRaw);

  final pickupWait = (json['pickupWaitMin'] as num?)?.toInt();
  final returnWait = (json['returnWaitMin'] as num?)?.toInt();
  final flight = json['flight'] as String?;

  PricingGuidance? pricing;
  if (snapMap != null && snapMap['guidanceAmount'] != null) {
    pricing = PricingGuidance.fromJson(snapMap);
  }

  return DriverRequest(
    id: json['id'] as String,
    datetimeLabel: _formatPickup(json['pickupAt']),
    returnDatetimeLabel:
        json['returnAt'] != null ? _formatPickup(json['returnAt']) : null,
    from: json['fromLabel'] as String? ?? '',
    to: json['toLabel'] as String? ?? '',
    distance: distance,
    duration: duration,
    vehicleNeed: vehicleNeed,
    vehicleClassIds: classList,
    passengers: (json['adults'] as num?)?.toInt() ?? 1,
    ttlLabel: _ttlFromExpiry(json['requestExpiresAt']),
    flightWait: pickupWait != null
        ? '$pickupWait min'
        : (flight != null && flight.isNotEmpty ? '60 min' : null),
    hasOffer: myOffer != null && myOffer.isActive,
    offerPrice: myOffer?.bidAmount,
    fromLat: (json['fromLat'] as num?)?.toDouble(),
    fromLng: (json['fromLng'] as num?)?.toDouble(),
    toLat: (json['toLat'] as num?)?.toDouble(),
    toLng: (json['toLng'] as num?)?.toDouble(),
    currency: json['currency'] as String? ?? 'USD',
    isRoundTrip: isRoundTrip,
    pickupWaitMin: pickupWait,
    returnWaitMin: returnWait,
    comment: json['comment'] as String?,
    signage: json['signage'] as String?,
    flight: flight,
    requiredOptions: requiredOptions,
    childSeats: childSeats,
    pricing: pricing,
    myOffer: myOffer,
    createdAt: createdAt,
    requestExpiresAt: requestExpiresAt,
    status: json['status'] as String?,
    shortId: json['shortId']?.toString(),
  );
}

/// Age label for request detail header (uses createdAt when present).
String driverRequestAgeLabel(DriverRequest req) => _relativeAge(req.createdAt);
