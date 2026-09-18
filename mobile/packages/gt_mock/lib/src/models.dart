import 'dart:math' as math;

class Place {
  const Place({
    required this.id,
    required this.label,
    this.subtitle = '',
    this.lat = 0,
    this.lng = 0,
    this.placeId,
  });
  final String id;
  final String label;
  final String subtitle;
  final double lat;
  final double lng;
  /// Google Places placeId when present (autocomplete may lack coords until details).
  final String? placeId;

  bool get hasCoords => lat != 0 || lng != 0;
}

/// Great-circle distance in kilometres.
double haversineKm(Place a, Place b) {
  const r = 6371.0;
  final dLat = _rad(b.lat - a.lat);
  final dLng = _rad(b.lng - a.lng);
  final lat1 = _rad(a.lat);
  final lat2 = _rad(b.lat);
  final h = math.sin(dLat / 2) * math.sin(dLat / 2) +
      math.cos(lat1) * math.cos(lat2) * math.sin(dLng / 2) * math.sin(dLng / 2);
  return 2 * r * math.asin(math.sqrt(h.clamp(0.0, 1.0)));
}

String formatDistanceKm(double km) {
  if (km < 1) return '${(km * 1000).round()} m';
  if (km < 10) return '${km.toStringAsFixed(1)} km';
  return '${km.round()} km';
}

double _rad(double d) => d * math.pi / 180.0;

class VehicleClass {
  const VehicleClass({
    required this.id,
    required this.name,
    this.fromPrice,
    this.imageAsset,
  });
  final String id;
  final String name;
  final String? fromPrice;
  /// Path under `gt_ui` package assets, e.g. `assets/vehicles/economy.png`.
  final String? imageAsset;
}

class ChildSeats {
  const ChildSeats({this.infant = 0, this.convertible = 0, this.booster = 0});
  final int infant;
  final int convertible;
  final int booster;

  ChildSeats copyWith({int? infant, int? convertible, int? booster}) =>
      ChildSeats(
        infant: infant ?? this.infant,
        convertible: convertible ?? this.convertible,
        booster: booster ?? this.booster,
      );

  int get total => infant + convertible + booster;

  /// Compact summary for the book form row.
  String get summaryLabel {
    if (total == 0) return 'Child seats';
    final parts = <String>[];
    if (infant > 0) parts.add('Infant carrier ×$infant');
    if (convertible > 0) parts.add('Convertible ×$convertible');
    if (booster > 0) parts.add('Booster ×$booster');
    return parts.join(' · ');
  }

  Map<String, int> toJson() => {
        'infant': infant,
        'convertible': convertible,
        'booster': booster,
      };
}

class OfferImage {
  const OfferImage({required this.id, required this.url});
  final String id;
  final String url;
}

class OfferPriceBreakdown {
  const OfferPriceBreakdown({
    this.ridePrice = 0,
    this.marketplaceFee = 0,
    this.taxes = 0,
    this.tolls = 0,
    this.waitingTime = 0,
    this.discount = 0,
    this.promotion = 0,
    this.total = 0,
    this.currency = 'CAD',
    this.includesNote,
    this.ridePriceNote,
    this.marketplaceFeeNote,
  });

  final double ridePrice;
  final double marketplaceFee;
  final double taxes;
  final double tolls;
  final double waitingTime;
  final double discount;
  final double promotion;
  final double total;
  final String currency;
  final String? includesNote;
  final String? ridePriceNote;
  final String? marketplaceFeeNote;

  factory OfferPriceBreakdown.fromJson(Map<String, dynamic>? json) {
    if (json == null) {
      return const OfferPriceBreakdown();
    }
    double n(dynamic v) {
      if (v == null) return 0;
      if (v is num) return v.toDouble();
      if (v is String) return double.tryParse(v.trim()) ?? 0;
      return 0;
    }

    return OfferPriceBreakdown(
      ridePrice: n(json['ridePrice']),
      marketplaceFee: n(json['marketplaceFee']),
      taxes: n(json['taxes']),
      tolls: n(json['tolls']),
      waitingTime: n(json['waitingTime']),
      discount: n(json['discount']),
      promotion: n(json['promotion']),
      total: n(json['total']),
      currency: json['currency']?.toString() ?? 'CAD',
      includesNote: json['includesNote']?.toString(),
      ridePriceNote: json['ridePriceNote']?.toString(),
      marketplaceFeeNote: json['marketplaceFeeNote']?.toString(),
    );
  }
}

class OfferRatingBreakdown {
  const OfferRatingBreakdown({
    this.overall = 0,
    this.count = 0,
    this.communication = 0,
    this.driver = 0,
    this.vehicle = 0,
    this.completedRides = 0,
    this.yearsWithPlatform = 0,
  });

  final double overall;
  final int count;
  final double communication;
  final double driver;
  final double vehicle;
  final int completedRides;
  final int yearsWithPlatform;

  factory OfferRatingBreakdown.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const OfferRatingBreakdown();
    double n(dynamic v) {
      if (v == null) return 0;
      if (v is num) return v.toDouble();
      if (v is String) return double.tryParse(v.trim()) ?? 0;
      return 0;
    }

    int i(dynamic v) {
      if (v == null) return 0;
      if (v is int) return v;
      if (v is num) return v.round();
      if (v is String) return int.tryParse(v.trim()) ?? 0;
      return 0;
    }

    return OfferRatingBreakdown(
      overall: n(json['overall']),
      count: i(json['count']),
      communication: n(json['communication']),
      driver: n(json['driver']),
      vehicle: n(json['vehicle']),
      completedRides: i(json['completedRides']),
      yearsWithPlatform: i(json['yearsWithPlatform']),
    );
  }
}

class Offer {
  const Offer({
    required this.id,
    required this.vehicleBrand,
    required this.vehicleModel,
    required this.vehicleClass,
    required this.price,
    required this.currency,
    required this.rating,
    required this.ratingCount,
    required this.rides,
    required this.options,
    required this.languages,
    required this.carrierId,
    required this.passengers,
    this.yearsWithPlatform = 1,
    this.reviews = const [],
    this.imageUrl,
    this.images = const [],
    this.year,
    this.baggage,
    this.status,
    this.priceBreakdown,
    this.ratingBreakdown,
    this.waitingTimeSummary,
    this.color,
    this.vehicleDisplayName,
    this.plate,
    this.driverName,
  });

  final String id;
  final String vehicleBrand;
  final String vehicleModel;
  final String vehicleClass;
  final double price;
  /// ISO code (CAD/USD) or legacy display prefix (US$).
  final String currency;
  final double rating;
  final int ratingCount;
  final int rides;
  /// Amenity labels for display.
  final List<String> options;
  final List<String> languages;
  final String carrierId;
  final int passengers;
  final int yearsWithPlatform;
  final List<Review> reviews;
  final String? imageUrl;
  final List<OfferImage> images;
  final int? year;
  final int? baggage;
  final String? status;
  final OfferPriceBreakdown? priceBreakdown;
  final OfferRatingBreakdown? ratingBreakdown;
  final String? waitingTimeSummary;
  final String? color;
  final String? vehicleDisplayName;
  final String? plate;
  /// Driver / carrier display name after booking (from server `driver.fullName`).
  final String? driverName;

  String get displayName {
    if (vehicleDisplayName != null && vehicleDisplayName!.trim().isNotEmpty) {
      return vehicleDisplayName!;
    }
    final base = '$vehicleBrand $vehicleModel'.trim();
    if (year != null) return '$base, $year';
    return base.isEmpty ? 'Vehicle' : base;
  }

  List<String> get imageUrls {
    if (images.isNotEmpty) return images.map((e) => e.url).toList();
    if (imageUrl != null && imageUrl!.isNotEmpty) return [imageUrl!];
    return const [];
  }

  String get priceLabel {
    final prefix = _currencyPrefix(currency);
    final whole = price.truncateToDouble() == price;
    final numStr = whole
        ? _thousands(price.round())
        : '${_thousands(price.floor())}.${((price - price.floor()) * 100).round().toString().padLeft(2, '0')}';
    return '$prefix$numStr';
  }

  static String _currencyPrefix(String code) {
    final upper = code.trim().toUpperCase();
    final letters = upper.replaceAll(RegExp(r'[^A-Z]'), '');
    switch (letters) {
      case 'CAD':
      default:
        return 'CA\$';
    }
  }

  static String _thousands(int n) {
    final s = n.abs().toString();
    final buf = StringBuffer();
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write(',');
      buf.write(s[i]);
    }
    return n < 0 ? '-$buf' : buf.toString();
  }
}

class Review {
  const Review({
    required this.stars,
    required this.text,
    this.fromLanguage,
    this.createdAt,
    this.communicationStars,
    this.driverStars,
    this.vehicleStars,
  });
  final int stars;
  final String text;
  final String? fromLanguage;
  final DateTime? createdAt;
  final int? communicationStars;
  final int? driverStars;
  final int? vehicleStars;
}

enum RideStatus {
  waitingOffers,
  chooseOffer,
  paymentPending,
  booked,
  past,
  cancelled,
}

class RideRequest {
  RideRequest({
    required this.id,
    required this.datetimeLabel,
    required this.from,
    this.to,
    this.distance,
    this.duration,
    this.timeBadge,
    required this.status,
    this.offerCount = 0,
    this.returnLabel,
    this.selectedOfferId,
    this.serverStatus,
    this.shortId,
    this.createdAtLabel,
    this.viewCount,
    this.currency = 'CAD',
  });

  final String id;
  final String datetimeLabel;
  final String from;
  final String? to;
  final String? distance;
  final String? duration;
  final String? timeBadge;
  RideStatus status;
  int offerCount;
  final String? returnLabel;
  String? selectedOfferId;
  /// Canonical Nest status when wired to API.
  String? serverStatus;
  final String? shortId;
  final String? createdAtLabel;
  final int? viewCount;
  final String? currency;

  String get displayId {
    if (shortId != null && shortId!.isNotEmpty) return shortId!;
    if (id.length <= 8) return id;
    final digits = id.replaceAll(RegExp(r'[^0-9]'), '');
    if (digits.length >= 6) {
      return digits.length >= 8
          ? digits.substring(digits.length - 8)
          : digits;
    }
    return id.substring(0, 8).toUpperCase();
  }
}

class DriverVehicle {
  const DriverVehicle({
    required this.id,
    required this.name,
    required this.plate,
    required this.vehicleClass,
    this.amenities = const {},
    this.isActive = true,
    this.isDefault = false,
    this.color = '',
    this.year,
    this.passengerSeats,
    this.luggagePlaces,
    this.autocancelBefore = 10,
    this.autocancelAfter = 10,
    this.updatedAt,
  });

  final String id;
  final String name;
  final String plate;
  final String vehicleClass;
  final Map<String, dynamic> amenities;
  final bool isActive;
  final bool isDefault;
  final String color;
  final int? year;
  final int? passengerSeats;
  final int? luggagePlaces;
  final int autocancelBefore;
  final int autocancelAfter;
  final DateTime? updatedAt;

  factory DriverVehicle.fromJson(Map<String, dynamic> json) {
    final amenitiesRaw = json['amenities'] ?? json['amenitiesJson'];
    DateTime? updatedAt;
    final rawUpdated = json['updatedAt']?.toString();
    if (rawUpdated != null && rawUpdated.isNotEmpty) {
      updatedAt = DateTime.tryParse(rawUpdated);
    }
    return DriverVehicle(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      plate: json['plate'] as String? ?? '',
      vehicleClass: json['vehicleClass'] as String? ?? '',
      amenities: amenitiesRaw is Map
          ? Map<String, dynamic>.from(amenitiesRaw)
          : const {},
      isActive: json['isActive'] as bool? ?? true,
      isDefault: json['isDefault'] as bool? ?? false,
      color: json['color'] as String? ?? '',
      year: json['year'] is num ? (json['year'] as num).toInt() : null,
      passengerSeats: json['passengerSeats'] is num
          ? (json['passengerSeats'] as num).toInt()
          : null,
      luggagePlaces: json['luggagePlaces'] is num
          ? (json['luggagePlaces'] as num).toInt()
          : null,
      autocancelBefore: json['autocancelBefore'] is num
          ? (json['autocancelBefore'] as num).toInt()
          : 10,
      autocancelAfter: json['autocancelAfter'] is num
          ? (json['autocancelAfter'] as num).toInt()
          : 10,
      updatedAt: updatedAt,
    );
  }
}

class PricingGuidance {
  const PricingGuidance({
    required this.guidanceAmount,
    required this.minBid,
    required this.maxBid,
    required this.platformCommissionPct,
    this.distanceKm,
    this.durationMin,
    this.isRoundTrip = false,
    this.legs = 1,
  });

  final double guidanceAmount;
  final double minBid;
  final double maxBid;
  final double platformCommissionPct;
  final double? distanceKm;
  final double? durationMin;
  final bool isRoundTrip;
  final int legs;

  factory PricingGuidance.fromJson(Map<String, dynamic> json) {
    double asDouble(dynamic v, [double fallback = 0]) {
      if (v == null) return fallback;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString()) ?? fallback;
    }

    int asInt(dynamic v, [int fallback = 0]) {
      if (v == null) return fallback;
      if (v is num) return v.toInt();
      return int.tryParse(v.toString()) ?? fallback;
    }

    return PricingGuidance(
      guidanceAmount: asDouble(json['guidanceAmount']),
      minBid: asDouble(json['minBid']),
      maxBid: asDouble(json['maxBid']),
      platformCommissionPct: asDouble(json['platformCommissionPct']),
      distanceKm: json['distanceKm'] == null
          ? null
          : asDouble(json['distanceKm']),
      durationMin: json['durationMin'] == null
          ? null
          : asDouble(json['durationMin']),
      isRoundTrip: json['isRoundTrip'] as bool? ?? false,
      legs: asInt(json['legs'], 1),
    );
  }
}

class DriverOfferSummary {
  const DriverOfferSummary({
    required this.id,
    required this.status,
    required this.bidAmount,
    required this.currency,
    this.outboundPrice,
    this.returnPrice,
    this.expiresAt,
    this.validForSeconds,
    this.selectedOptions = const [],
    this.vehicleId,
    this.platformCommissionPct,
    this.platformFee,
    this.driverEarning,
  });

  final String id;
  final String status;
  final double bidAmount;
  final String currency;
  final double? outboundPrice;
  final double? returnPrice;
  final DateTime? expiresAt;
  final int? validForSeconds;
  final List<String> selectedOptions;
  final String? vehicleId;
  final double? platformCommissionPct;
  final double? platformFee;
  final double? driverEarning;

  bool get isActive => status == 'ACTIVE';

  factory DriverOfferSummary.fromJson(Map<String, dynamic> json) {
    double? asDouble(dynamic v) {
      if (v == null) return null;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString());
    }

    int? asInt(dynamic v) {
      if (v == null) return null;
      if (v is num) return v.toInt();
      return int.tryParse(v.toString());
    }

    final commission = json['commission'];
    DateTime? expires;
    final rawExp = json['expiresAt'];
    if (rawExp != null) expires = DateTime.tryParse(rawExp.toString());
    final opts = json['selectedOptions'];
    final id = json['id']?.toString();
    if (id == null || id.isEmpty) {
      throw FormatException('Offer missing id');
    }
    return DriverOfferSummary(
      id: id,
      status: json['status']?.toString() ?? 'ACTIVE',
      bidAmount: asDouble(json['bidAmount']) ?? 0,
      currency: json['currency']?.toString() ?? 'CAD',
      outboundPrice: asDouble(json['outboundPrice']),
      returnPrice: asDouble(json['returnPrice']),
      expiresAt: expires,
      validForSeconds: asInt(json['validForSeconds']),
      selectedOptions: opts is List
          ? opts.map((e) => e.toString()).toList()
          : const [],
      vehicleId: json['vehicleId']?.toString(),
      platformCommissionPct: commission is Map
          ? asDouble(commission['platformCommissionPct'])
          : null,
      platformFee:
          commission is Map ? asDouble(commission['platformFee']) : null,
      driverEarning:
          commission is Map ? asDouble(commission['driverEarning']) : null,
    );
  }
}

class DriverRequest {
  const DriverRequest({
    required this.id,
    required this.datetimeLabel,
    required this.from,
    required this.to,
    required this.distance,
    required this.duration,
    required this.vehicleNeed,
    required this.passengers,
    this.ttlLabel = '15 min',
    this.flightWait,
    this.hasOffer = false,
    this.offerPrice,
    this.driverEarning,
    this.fromLat,
    this.fromLng,
    this.toLat,
    this.toLng,
    this.currency = 'CAD',
    this.isRoundTrip = false,
    this.returnDatetimeLabel,
    this.pickupWaitMin,
    this.returnWaitMin,
    this.comment,
    this.signage,
    this.flight,
    this.returnFlight,
    this.vehicleClassIds = const [],
    this.requiredOptions = const [],
    this.childSeats = const {},
    this.pricing,
    this.myOffer,
    this.createdAt,
    this.requestExpiresAt,
    this.status,
    this.shortId,
    this.pickupAt,
    this.passengerName,
  });

  final String id;
  final String datetimeLabel;
  final String from;
  final String to;
  final String distance;
  final String duration;
  final String vehicleNeed;
  final int passengers;
  final String ttlLabel;
  final String? flightWait;
  final bool hasOffer;
  final double? offerPrice;
  /// Net driver earning from frozen priceSnapshot (completed trips).
  final double? driverEarning;
  final double? fromLat;
  final double? fromLng;
  final double? toLat;
  final double? toLng;
  final String currency;
  final bool isRoundTrip;
  final String? returnDatetimeLabel;
  final int? pickupWaitMin;
  final int? returnWaitMin;
  final String? comment;
  final String? signage;
  final String? flight;
  final String? returnFlight;
  final List<String> vehicleClassIds;
  final List<String> requiredOptions;
  final Map<String, dynamic> childSeats;
  final PricingGuidance? pricing;
  final DriverOfferSummary? myOffer;
  final DateTime? createdAt;
  final DateTime? requestExpiresAt;
  final String? status;
  final String? shortId;
  final DateTime? pickupAt;
  /// Booked passenger display name (from API `passengerName` / `passenger.fullName`).
  final String? passengerName;

  String get displayId {
    if (shortId != null && shortId!.isNotEmpty) return shortId!;
    if (id.length <= 8) return id;
    final digits = id.replaceAll(RegExp(r'[^0-9]'), '');
    if (digits.length >= 6) return digits.substring(digits.length - 8);
    return id.substring(0, 8).toUpperCase();
  }

  DriverRequest copyWith({
    bool? hasOffer,
    double? offerPrice,
    DriverOfferSummary? myOffer,
    DateTime? pickupAt,
    String? status,
  }) {
    return DriverRequest(
      id: id,
      datetimeLabel: datetimeLabel,
      from: from,
      to: to,
      distance: distance,
      duration: duration,
      vehicleNeed: vehicleNeed,
      passengers: passengers,
      ttlLabel: ttlLabel,
      flightWait: flightWait,
      hasOffer: hasOffer ?? this.hasOffer,
      offerPrice: offerPrice ?? this.offerPrice,
      driverEarning: driverEarning,
      fromLat: fromLat,
      fromLng: fromLng,
      toLat: toLat,
      toLng: toLng,
      currency: currency,
      isRoundTrip: isRoundTrip,
      returnDatetimeLabel: returnDatetimeLabel,
      pickupWaitMin: pickupWaitMin,
      returnWaitMin: returnWaitMin,
      comment: comment,
      signage: signage,
      flight: flight,
      returnFlight: returnFlight,
      vehicleClassIds: vehicleClassIds,
      requiredOptions: requiredOptions,
      childSeats: childSeats,
      pricing: pricing,
      myOffer: myOffer ?? this.myOffer,
      createdAt: createdAt,
      requestExpiresAt: requestExpiresAt,
      status: status ?? this.status,
      shortId: shortId,
      pickupAt: pickupAt ?? this.pickupAt,
      passengerName: passengerName,
    );
  }
}

class PassengerProfile {
  PassengerProfile({
    this.fullName = '',
    this.email = '',
    this.phone = '',
  });
  String fullName;
  String email;
  String phone;
}

/// Lat/lng point for polygons and map markers.
class GeoPoint {
  const GeoPoint({required this.latitude, required this.longitude});

  final double latitude;
  final double longitude;

  Map<String, dynamic> toJson() => {
        'latitude': latitude,
        'longitude': longitude,
      };

  factory GeoPoint.fromJson(Map<String, dynamic> json) => GeoPoint(
        latitude: (json['latitude'] as num).toDouble(),
        longitude: (json['longitude'] as num).toDouble(),
      );
}

enum OperatingZoneType {
  circle,
  polygon;

  static OperatingZoneType fromJson(Object? raw) {
    final s = raw?.toString().toLowerCase();
    if (s == 'circle') return OperatingZoneType.circle;
    return OperatingZoneType.polygon;
  }

  String toJson() => name;
}

/// Driver operating area — circle (radius) or freehand polygon.
class OperatingZone {
  OperatingZone({
    required this.id,
    required this.name,
    this.type = OperatingZoneType.polygon,
    List<GeoPoint>? coordinates,
    this.center,
    this.radiusKm,
  }) : coordinates = coordinates ?? const [];

  final String id;
  String name;
  OperatingZoneType type;

  /// Polygon vertices (also generated for circle zones for map rendering).
  List<GeoPoint> coordinates;

  /// Circle center (when [type] == circle).
  GeoPoint? center;

  /// Circle radius in kilometres (when [type] == circle).
  double? radiusKm;

  bool get isCircle => type == OperatingZoneType.circle;

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'type': type.toJson(),
        'coordinates': coordinates.map((c) => c.toJson()).toList(),
        if (center != null) 'center': center!.toJson(),
        if (radiusKm != null) 'radiusKm': radiusKm,
      };

  factory OperatingZone.fromJson(Map<String, dynamic> json) {
    final type = OperatingZoneType.fromJson(json['type']);
    final coordsRaw = json['coordinates'];
    final coordinates = coordsRaw is List
        ? coordsRaw
            .map((e) => GeoPoint.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList()
        : <GeoPoint>[];

    GeoPoint? center;
    final centerRaw = json['center'];
    if (centerRaw is Map) {
      center = GeoPoint.fromJson(Map<String, dynamic>.from(centerRaw));
    }

    final radius = json['radiusKm'];
    return OperatingZone(
      id: json['id'] as String,
      name: (json['name'] as String?) ?? 'Operating Zone',
      type: type,
      coordinates: coordinates,
      center: center,
      radiusKm: radius is num ? radius.toDouble() : null,
    );
  }

  OperatingZone copyWith({
    String? id,
    String? name,
    OperatingZoneType? type,
    List<GeoPoint>? coordinates,
    GeoPoint? center,
    double? radiusKm,
  }) {
    return OperatingZone(
      id: id ?? this.id,
      name: name ?? this.name,
      type: type ?? this.type,
      coordinates: coordinates ?? List<GeoPoint>.from(this.coordinates),
      center: center ?? this.center,
      radiusKm: radiusKm ?? this.radiusKm,
    );
  }
}

class DriverProfile {
  DriverProfile({
    this.fullName = '',
    this.legalName = '',
    this.isIndividual = true,
    this.baseLocation = '',
    /// Default map center (GTA) only when no saved base location exists.
    this.baseLatitude = 43.8341,
    this.baseLongitude = -79.5373,
    this.isActivated = false,
    this.vehicleName = '',
    this.plate = '',
    List<OperatingZone>? operatingZones,
  }) : operatingZones = operatingZones ?? [];

  String fullName;
  String legalName;
  bool isIndividual;
  String baseLocation;
  double baseLatitude;
  double baseLongitude;
  bool isActivated;
  String vehicleName;
  String plate;
  List<OperatingZone> operatingZones;
}

class ChatThread {
  const ChatThread({
    required this.id,
    required this.title,
    required this.lastMessage,
    required this.time,
  });
  final String id;
  final String title;
  final String lastMessage;
  final String time;
}
