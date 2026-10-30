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
  final h =
      math.sin(dLat / 2) * math.sin(dLat / 2) +
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
    this.passengerSeats = 4,
    this.luggagePlaces = 2,
    this.capacityInfo,
    this.seatsRange,
  });
  final String id;
  final String name;
  final String? fromPrice;

  /// Path under `gt_ui` package assets, e.g. `assets/vehicles/economy.png`.
  final String? imageAsset;
  final int passengerSeats;
  final int luggagePlaces;
  final String? capacityInfo;
  final String? seatsRange;

  String get seatsCapacityText =>
      seatsRange != null ? 'Up to $seatsRange' : 'Up to $passengerSeats';
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
    this.platformFee = 0,
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
  final double platformFee;
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

  factory OfferPriceBreakdown.fromBasePrice(
    double basePrice, {
    String currency = 'CAD',
    double taxes = 0,
  }) {
    final ridePrice = basePrice;
    final fee = ((ridePrice * 0.20) * 100).roundToDouble() / 100.0;
    final total = ((ridePrice + fee + taxes) * 100).roundToDouble() / 100.0;
    return OfferPriceBreakdown(
      ridePrice: ridePrice,
      platformFee: fee,
      marketplaceFee: fee,
      taxes: taxes,
      total: total,
      currency: currency,
      includesNote: 'Includes all taxes and fees',
      ridePriceNote: 'Includes waiting time, toll roads (if any) and taxes.',
      marketplaceFeeNote: 'Platform fee for booking and support.',
    );
  }

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

    var rawRidePrice = n(json['ridePrice']);
    var rawPlatformFee = n(json['platformFee'] ?? json['marketplaceFee']);
    final rawTaxes = n(json['taxes']);
    var rawTotal = n(json['total']);

    // Detect legacy bug where ridePrice was driver earning ($160) and total was driver bid ($200):
    // e.g. rawRidePrice = 160, rawPlatformFee = 40, rawTotal = 200 (160 + 40 == 200 and 160 == 200 * 0.8)
    if (rawTotal > 0 &&
        rawRidePrice > 0 &&
        (rawRidePrice + rawPlatformFee - rawTotal).abs() < 0.05 &&
        (rawRidePrice - (rawTotal * 0.8)).abs() < 0.05) {
      rawRidePrice = rawTotal;
      rawPlatformFee = ((rawRidePrice * 0.20) * 100).roundToDouble() / 100.0;
      rawTotal =
          ((rawRidePrice + rawPlatformFee + rawTaxes) * 100).roundToDouble() /
          100.0;
    } else {
      if (rawPlatformFee == 0 && rawRidePrice > 0) {
        rawPlatformFee = ((rawRidePrice * 0.20) * 100).roundToDouble() / 100.0;
      }
      if (rawTotal <= 0 ||
          (rawRidePrice > 0 && (rawTotal - rawRidePrice).abs() < 0.01)) {
        rawTotal =
            ((rawRidePrice + rawPlatformFee + rawTaxes) * 100).roundToDouble() /
            100.0;
      }
    }

    return OfferPriceBreakdown(
      ridePrice: rawRidePrice,
      platformFee: rawPlatformFee,
      marketplaceFee: rawPlatformFee,
      taxes: rawTaxes,
      tolls: n(json['tolls']),
      waitingTime: n(json['waitingTime']),
      discount: n(json['discount']),
      promotion: n(json['promotion']),
      total: rawTotal,
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
    final b = vehicleBrand.trim();
    final m = vehicleModel.trim();
    String base;
    if (b.isNotEmpty && m.isNotEmpty) {
      if (b.toLowerCase().contains(m.toLowerCase())) {
        base = b;
      } else if (m.toLowerCase().contains(b.toLowerCase())) {
        base = m;
      } else {
        base = '$b $m';
      }
    } else {
      base = b.isNotEmpty ? b : (m.isNotEmpty ? m : 'Vehicle');
    }
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
    this.createdAt,
    this.communicationStars,
    this.driverStars,
    this.vehicleStars,
  });
  final int stars;
  final String text;
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

class LostItemDetails {
  const LostItemDetails({
    required this.caseId,
    required this.status,
    this.contactPhone,
    this.itemDescription,
    this.driverNote,
    this.photoUrl,
    this.handoverPhotoUrl,
    this.pickupLocation,
    this.returnFeeAmount = 20.0,
    this.returnFeePaid = false,
    this.returnFeePaymentId,
    this.reportedAt,
    this.updatedAt,
  });

  final String caseId;
  final String status;
  final String? contactPhone;
  final String? itemDescription;
  final String? driverNote;
  final String? photoUrl;
  final String? handoverPhotoUrl;
  final String? pickupLocation;
  final double returnFeeAmount;
  final bool returnFeePaid;
  final String? returnFeePaymentId;
  final DateTime? reportedAt;
  final DateTime? updatedAt;

  bool get isReported => status.toUpperCase() == 'REPORTED';
  bool get isFound => status.toUpperCase() == 'FOUND';
  bool get isNotFound => status.toUpperCase() == 'NOT_FOUND';
  bool get isReturned => status.toUpperCase() == 'RETURNED';

  LostItemDetails copyWith({
    String? caseId,
    String? status,
    String? contactPhone,
    String? itemDescription,
    String? driverNote,
    String? photoUrl,
    String? handoverPhotoUrl,
    String? pickupLocation,
    double? returnFeeAmount,
    bool? returnFeePaid,
    String? returnFeePaymentId,
    DateTime? reportedAt,
    DateTime? updatedAt,
  }) {
    return LostItemDetails(
      caseId: caseId ?? this.caseId,
      status: status ?? this.status,
      contactPhone: contactPhone ?? this.contactPhone,
      itemDescription: itemDescription ?? this.itemDescription,
      driverNote: driverNote ?? this.driverNote,
      photoUrl: photoUrl ?? this.photoUrl,
      handoverPhotoUrl: handoverPhotoUrl ?? this.handoverPhotoUrl,
      pickupLocation: pickupLocation ?? this.pickupLocation,
      returnFeeAmount: returnFeeAmount ?? this.returnFeeAmount,
      returnFeePaid: returnFeePaid ?? this.returnFeePaid,
      returnFeePaymentId: returnFeePaymentId ?? this.returnFeePaymentId,
      reportedAt: reportedAt ?? this.reportedAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  factory LostItemDetails.fromJson(Map<String, dynamic> json) {
    DateTime? parseDate(dynamic d) {
      if (d == null) return null;
      if (d is DateTime) return d;
      return DateTime.tryParse(d.toString());
    }

    return LostItemDetails(
      caseId: json['caseId']?.toString() ?? '',
      status: json['status']?.toString() ?? 'REPORTED',
      contactPhone: json['contactPhone']?.toString(),
      itemDescription: json['itemDescription']?.toString(),
      driverNote: json['driverNote']?.toString(),
      photoUrl: json['photoUrl']?.toString(),
      handoverPhotoUrl: json['handoverPhotoUrl']?.toString(),
      pickupLocation: json['pickupLocation']?.toString(),
      returnFeeAmount: (json['returnFeeAmount'] as num?)?.toDouble() ?? 20.0,
      returnFeePaid: json['returnFeePaid'] == true,
      returnFeePaymentId: json['returnFeePaymentId']?.toString(),
      reportedAt: parseDate(json['reportedAt']),
      updatedAt: parseDate(json['updatedAt']),
    );
  }

  Map<String, dynamic> toJson() => {
    'caseId': caseId,
    'status': status,
    'contactPhone': contactPhone,
    'itemDescription': itemDescription,
    'driverNote': driverNote,
    'photoUrl': photoUrl,
    'handoverPhotoUrl': handoverPhotoUrl,
    'pickupLocation': pickupLocation,
    'returnFeeAmount': returnFeeAmount,
    'returnFeePaid': returnFeePaid,
    'returnFeePaymentId': returnFeePaymentId,
    'reportedAt': reportedAt?.toIso8601String(),
    'updatedAt': updatedAt?.toIso8601String(),
  };
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
    this.isRoundTrip = false,
    this.selectedOfferId,
    this.serverStatus,
    this.shortId,
    this.createdAtLabel,
    this.viewCount,
    this.currency = 'CAD',
    this.hasLostItemRequest = false,
    this.hasReportedRide = false,
    this.hasActiveSupport = false,
    this.lostItem,
    this.startPin,
    this.tipAmount,
    this.shareToken,
    this.shareUrl,
    this.pickupAt,
    this.isOverdue = false,
    this.isChatLocked = false,
    this.originalDriverId,
    this.originalDriverName,
    this.originalDriverPhone,
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
  final bool isRoundTrip;
  String? selectedOfferId;

  /// Canonical Nest status when wired to API.
  String? serverStatus;
  final String? shortId;
  final String? createdAtLabel;
  final int? viewCount;
  final String? currency;
  final bool hasLostItemRequest;
  final bool hasReportedRide;
  final bool hasActiveSupport;
  final LostItemDetails? lostItem;
  String? startPin;
  final double? tipAmount;
  String? shareToken;
  String? shareUrl;
  final DateTime? pickupAt;
  final bool isOverdue;
  final bool isChatLocked;
  final String? originalDriverId;
  final String? originalDriverName;
  final String? originalDriverPhone;

  bool get isOverdueBooking {
    if (isOverdue) return true;
    final s = (serverStatus ?? '').toUpperCase();
    if (pickupAt != null) {
      final now = DateTime.now();
      if (s == 'BOOKED') {
        return now.isAfter(pickupAt!.add(const Duration(minutes: 30)));
      }
      if (const {'TRIP_STARTED', 'IN_PROGRESS'}.contains(s)) {
        return now.isAfter(pickupAt!.add(const Duration(hours: 3)));
      }
    }
    return false;
  }

  bool get hasReturnTrip =>
      isRoundTrip || (returnLabel != null && returnLabel!.trim().isNotEmpty);

  String get displayId {
    if (shortId != null && shortId!.isNotEmpty) return shortId!;
    if (id.length <= 8) return id;
    final digits = id.replaceAll(RegExp(r'[^0-9]'), '');
    if (digits.length >= 6) {
      return digits.length >= 8 ? digits.substring(digits.length - 8) : digits;
    }
    return id.substring(0, 8).toUpperCase();
  }

  bool get isBooked {
    if (status == RideStatus.booked || status == RideStatus.past) return true;
    final s = (serverStatus ?? '').toUpperCase();
    const bookedStatuses = {
      'BOOKED',
      'EN_ROUTE',
      'DRIVER_EN_ROUTE',
      'ARRIVED',
      'DRIVER_ARRIVED',
      'TRIP_STARTED',
      'IN_PROGRESS',
      'COMPLETED',
    };
    return bookedStatuses.contains(s);
  }

  bool get isCancelled {
    if (status == RideStatus.cancelled) return true;
    final s = (serverStatus ?? '').toUpperCase();
    return s.contains('CANCEL') || s == 'EXPIRED' || s == 'NO_SHOW';
  }

  bool get isOngoingTrip {
    final s = (serverStatus ?? '').toUpperCase();
    return const {
      'DRIVER_EN_ROUTE',
      'EN_ROUTE',
      'DRIVER_ARRIVED',
      'ARRIVED',
      'TRIP_STARTED',
      'IN_PROGRESS',
    }.contains(s);
  }

  bool get isFutureBooking {
    if (isOngoingTrip || isCancelled) return false;
    final s = (serverStatus ?? '').toUpperCase();
    if (s == 'COMPLETED') return false;
    if (timeBadge == 'Pickup now') return false;
    if (pickupAt != null) {
      return pickupAt!.isAfter(DateTime.now().add(const Duration(minutes: 30)));
    }
    if (isBooked && (timeBadge == 'Scheduled' || (timeBadge != null && timeBadge != 'Pickup now'))) {
      return true;
    }
    return false;
  }

  bool get isImminentOrActive {
    if (isCancelled) return false;
    final s = (serverStatus ?? '').toUpperCase();
    if (s == 'COMPLETED') return false;
    if (isOngoingTrip) return true;
    if (isOverdueBooking) return true;
    if (isBooked) {
      if (timeBadge == 'Pickup now') return true;
      if (pickupAt != null) {
        return !pickupAt!.isAfter(DateTime.now().add(const Duration(minutes: 30)));
      }
      return false;
    }
    return false;
  }

  RideRequest copyWith({
    String? id,
    String? datetimeLabel,
    String? from,
    String? to,
    String? distance,
    String? duration,
    String? timeBadge,
    RideStatus? status,
    int? offerCount,
    String? returnLabel,
    bool? isRoundTrip,
    String? selectedOfferId,
    String? serverStatus,
    String? shortId,
    String? createdAtLabel,
    int? viewCount,
    String? currency,
    bool? hasLostItemRequest,
    bool? hasReportedRide,
    bool? hasActiveSupport,
    LostItemDetails? lostItem,
    String? startPin,
    double? tipAmount,
    String? shareToken,
    String? shareUrl,
    DateTime? pickupAt,
    bool? isOverdue,
    bool? isChatLocked,
    String? originalDriverId,
    String? originalDriverName,
    String? originalDriverPhone,
  }) {
    return RideRequest(
      id: id ?? this.id,
      datetimeLabel: datetimeLabel ?? this.datetimeLabel,
      from: from ?? this.from,
      to: to ?? this.to,
      distance: distance ?? this.distance,
      duration: duration ?? this.duration,
      timeBadge: timeBadge ?? this.timeBadge,
      status: status ?? this.status,
      offerCount: offerCount ?? this.offerCount,
      returnLabel: returnLabel ?? this.returnLabel,
      isRoundTrip: isRoundTrip ?? this.isRoundTrip,
      selectedOfferId: selectedOfferId ?? this.selectedOfferId,
      serverStatus: serverStatus ?? this.serverStatus,
      shortId: shortId ?? this.shortId,
      createdAtLabel: createdAtLabel ?? this.createdAtLabel,
      viewCount: viewCount ?? this.viewCount,
      currency: currency ?? this.currency,
      hasLostItemRequest: hasLostItemRequest ?? this.hasLostItemRequest,
      hasReportedRide: hasReportedRide ?? this.hasReportedRide,
      hasActiveSupport: hasActiveSupport ?? this.hasActiveSupport,
      lostItem: lostItem ?? this.lostItem,
      startPin: startPin ?? this.startPin,
      tipAmount: tipAmount ?? this.tipAmount,
      shareToken: shareToken ?? this.shareToken,
      shareUrl: shareUrl ?? this.shareUrl,
      pickupAt: pickupAt ?? this.pickupAt,
      isOverdue: isOverdue ?? this.isOverdue,
      isChatLocked: isChatLocked ?? this.isChatLocked,
      originalDriverId: originalDriverId ?? this.originalDriverId,
      originalDriverName: originalDriverName ?? this.originalDriverName,
      originalDriverPhone: originalDriverPhone ?? this.originalDriverPhone,
    );
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
    this.make,
    this.model,
    this.inspectionStatus = 'PENDING',
    this.approvalStatus = 'PENDING',
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
  final String? make;
  final String? model;
  final String inspectionStatus;
  final String approvalStatus;

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
      make: json['make'] as String?,
      model: json['model'] as String?,
      inspectionStatus: json['inspectionStatus'] as String? ?? 'PENDING',
      approvalStatus: json['approvalStatus'] as String? ?? 'PENDING',
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
  bool get isSelected => status == 'SELECTED';
  bool get isAccepted => status == 'ACCEPTED' || status == 'SELECTED';

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
      platformFee: commission is Map
          ? asDouble(commission['platformFee'])
          : null,
      driverEarning: commission is Map
          ? asDouble(commission['driverEarning'])
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
    this.hasLostItemRequest = false,
    this.hasReportedRide = false,
    this.hasActiveSupport = false,
    this.lostItem,
    this.startPin,
    this.tipAmount,
    this.isOverdue = false,
    this.isChatLocked = false,
    this.originalDriverId,
  });

  final String id;
  final String? originalDriverId;
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
  final bool hasLostItemRequest;
  final bool hasReportedRide;
  final bool hasActiveSupport;
  final LostItemDetails? lostItem;
  final String? startPin;
  final double? tipAmount;
  final bool isOverdue;
  final bool isChatLocked;

  bool get isOverdueBooking {
    if (isOverdue) return true;
    final s = (status ?? '').toUpperCase();
    if (pickupAt != null) {
      final now = DateTime.now();
      if (s == 'BOOKED') {
        return now.isAfter(pickupAt!.add(const Duration(minutes: 30)));
      }
      if (const {'TRIP_STARTED', 'IN_PROGRESS'}.contains(s)) {
        return now.isAfter(pickupAt!.add(const Duration(hours: 3)));
      }
    }
    return false;
  }

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
    bool? hasLostItemRequest,
    bool? hasReportedRide,
    bool? hasActiveSupport,
    LostItemDetails? lostItem,
    double? tipAmount,
    bool? isOverdue,
    bool? isChatLocked,
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
      hasLostItemRequest: hasLostItemRequest ?? this.hasLostItemRequest,
      hasReportedRide: hasReportedRide ?? this.hasReportedRide,
      hasActiveSupport: hasActiveSupport ?? this.hasActiveSupport,
      lostItem: lostItem ?? this.lostItem,
      startPin: startPin,
      tipAmount: tipAmount ?? this.tipAmount,
      isOverdue: isOverdue ?? this.isOverdue,
      isChatLocked: isChatLocked ?? this.isChatLocked,
    );
  }
}

class PassengerProfile {
  PassengerProfile({this.fullName = '', this.email = '', this.phone = ''});
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
              .map(
                (e) => GeoPoint.fromJson(Map<String, dynamic>.from(e as Map)),
              )
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
