import 'dart:math' as math;

class Place {
  const Place({
    required this.id,
    required this.label,
    this.subtitle = '',
    this.lat = 0,
    this.lng = 0,
  });
  final String id;
  final String label;
  final String subtitle;
  final double lat;
  final double lng;

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
  const ChildSeats({this.infant = 0, this.child = 0, this.booster = 0});
  final int infant;
  final int child;
  final int booster;

  ChildSeats copyWith({int? infant, int? child, int? booster}) => ChildSeats(
        infant: infant ?? this.infant,
        child: child ?? this.child,
        booster: booster ?? this.booster,
      );

  int get total => infant + child + booster;
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
    this.currency = 'USD',
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
    return OfferPriceBreakdown(
      ridePrice: (json['ridePrice'] as num?)?.toDouble() ?? 0,
      marketplaceFee: (json['marketplaceFee'] as num?)?.toDouble() ?? 0,
      taxes: (json['taxes'] as num?)?.toDouble() ?? 0,
      tolls: (json['tolls'] as num?)?.toDouble() ?? 0,
      waitingTime: (json['waitingTime'] as num?)?.toDouble() ?? 0,
      discount: (json['discount'] as num?)?.toDouble() ?? 0,
      promotion: (json['promotion'] as num?)?.toDouble() ?? 0,
      total: (json['total'] as num?)?.toDouble() ?? 0,
      currency: json['currency'] as String? ?? 'USD',
      includesNote: json['includesNote'] as String?,
      ridePriceNote: json['ridePriceNote'] as String?,
      marketplaceFeeNote: json['marketplaceFeeNote'] as String?,
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
    return OfferRatingBreakdown(
      overall: (json['overall'] as num?)?.toDouble() ?? 0,
      count: (json['count'] as num?)?.toInt() ?? 0,
      communication: (json['communication'] as num?)?.toDouble() ?? 0,
      driver: (json['driver'] as num?)?.toDouble() ?? 0,
      vehicle: (json['vehicle'] as num?)?.toDouble() ?? 0,
      completedRides: (json['completedRides'] as num?)?.toInt() ?? 0,
      yearsWithPlatform: (json['yearsWithPlatform'] as num?)?.toInt() ?? 0,
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
        return 'CA\$';
      case 'USD':
      case 'US':
        return 'US\$';
      case 'EUR':
        return '€';
      case 'GBP':
        return '£';
      case 'AED':
        return 'AED ';
      default:
        if (code.contains('\$') || code.contains('€') || code.contains('£')) {
          return code;
        }
        return letters.length == 3 ? '$letters ' : code;
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
  });
  final int stars;
  final String text;
  final String? fromLanguage;
  final DateTime? createdAt;
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
    this.currency,
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

  factory DriverVehicle.fromJson(Map<String, dynamic> json) {
    final amenitiesRaw = json['amenities'] ?? json['amenitiesJson'];
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
    return PricingGuidance(
      guidanceAmount: (json['guidanceAmount'] as num?)?.toDouble() ?? 0,
      minBid: (json['minBid'] as num?)?.toDouble() ?? 0,
      maxBid: (json['maxBid'] as num?)?.toDouble() ?? 0,
      platformCommissionPct:
          (json['platformCommissionPct'] as num?)?.toDouble() ?? 0,
      distanceKm: (json['distanceKm'] as num?)?.toDouble(),
      durationMin: (json['durationMin'] as num?)?.toDouble(),
      isRoundTrip: json['isRoundTrip'] as bool? ?? false,
      legs: (json['legs'] as num?)?.toInt() ?? 1,
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
    final commission = json['commission'];
    DateTime? expires;
    final rawExp = json['expiresAt'];
    if (rawExp is String) expires = DateTime.tryParse(rawExp);
    final opts = json['selectedOptions'];
    return DriverOfferSummary(
      id: json['id'] as String,
      status: json['status'] as String? ?? 'ACTIVE',
      bidAmount: (json['bidAmount'] as num?)?.toDouble() ?? 0,
      currency: json['currency'] as String? ?? 'USD',
      outboundPrice: (json['outboundPrice'] as num?)?.toDouble(),
      returnPrice: (json['returnPrice'] as num?)?.toDouble(),
      expiresAt: expires,
      validForSeconds: (json['validForSeconds'] as num?)?.toInt(),
      selectedOptions: opts is List
          ? opts.map((e) => e.toString()).toList()
          : const [],
      vehicleId: json['vehicleId'] as String?,
      platformCommissionPct: commission is Map
          ? (commission['platformCommissionPct'] as num?)?.toDouble()
          : null,
      platformFee: commission is Map
          ? (commission['platformFee'] as num?)?.toDouble()
          : null,
      driverEarning: commission is Map
          ? (commission['driverEarning'] as num?)?.toDouble()
          : null,
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
    this.fromLat,
    this.fromLng,
    this.toLat,
    this.toLng,
    this.currency = 'USD',
    this.isRoundTrip = false,
    this.returnDatetimeLabel,
    this.pickupWaitMin,
    this.returnWaitMin,
    this.comment,
    this.signage,
    this.flight,
    this.vehicleClassIds = const [],
    this.requiredOptions = const [],
    this.childSeats = const {},
    this.pricing,
    this.myOffer,
    this.createdAt,
    this.requestExpiresAt,
    this.status,
    this.shortId,
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
  final List<String> vehicleClassIds;
  final List<String> requiredOptions;
  final Map<String, dynamic> childSeats;
  final PricingGuidance? pricing;
  final DriverOfferSummary? myOffer;
  final DateTime? createdAt;
  final DateTime? requestExpiresAt;
  final String? status;
  final String? shortId;

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
      vehicleClassIds: vehicleClassIds,
      requiredOptions: requiredOptions,
      childSeats: childSeats,
      pricing: pricing,
      myOffer: myOffer ?? this.myOffer,
      createdAt: createdAt,
      requestExpiresAt: requestExpiresAt,
      status: status,
      shortId: shortId,
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
