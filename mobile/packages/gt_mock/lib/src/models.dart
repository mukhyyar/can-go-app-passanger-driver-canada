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
  });

  final String id;
  final String vehicleBrand;
  final String vehicleModel;
  final String vehicleClass;
  final double price;
  final String currency;
  final double rating;
  final int ratingCount;
  final int rides;
  final List<String> options;
  final List<String> languages;
  final String carrierId;
  final int passengers;
  final int yearsWithPlatform;
  final List<Review> reviews;

  String get priceLabel => '$currency${price.toStringAsFixed(price.truncateToDouble() == price ? 0 : 2)}';
}

class Review {
  const Review({required this.stars, required this.text, this.fromLanguage});
  final int stars;
  final String text;
  final String? fromLanguage;
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
}

class PassengerProfile {
  PassengerProfile({
    this.fullName = 'John Smith',
    this.email = 'mukhyyar@live.com',
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
    this.fullName = 'Syed Mukhyyar Hussain Rizvi',
    this.legalName = '',
    this.isIndividual = true,
    this.baseLocation = '9580 Jane St, Vaughan, ON L4H 2E8, Canada',
    /// Prototype default: Vaughan / Greater Toronto Area (not UI-hardcoded).
    this.baseLatitude = 43.8341,
    this.baseLongitude = -79.5373,
    this.isActivated = false,
    this.vehicleName = 'Honda City',
    this.plate = 'BW238J',
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
