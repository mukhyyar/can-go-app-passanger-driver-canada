import 'api_client.dart';

class MarketplaceApi {
  MarketplaceApi(this.client);
  final ApiClient client;

  Future<Map<String, dynamic>> quote({
    required String serviceType,
    required double fromLat,
    required double fromLng,
    double? toLat,
    double? toLng,
    double? distanceKm,
    double? durationMin,
    String? vehicleClass,
    String? currency,
    double? hours,
    double? days,
  }) {
    return client.post(
      '/pricing/quote',
      body: {
        'serviceType': serviceType,
        'fromLat': fromLat,
        'fromLng': fromLng,
        if (toLat != null) 'toLat': toLat,
        if (toLng != null) 'toLng': toLng,
        if (distanceKm != null) 'distanceKm': distanceKm,
        if (durationMin != null) 'durationMin': durationMin,
        if (vehicleClass != null) 'vehicleClass': vehicleClass,
        if (currency != null) 'currency': currency,
        if (hours != null) 'hours': hours,
        if (days != null) 'days': days,
      },
    );
  }

  Future<Map<String, dynamic>> createRide({
    required String serviceType,
    required String fromLabel,
    String? toLabel,
    required double fromLat,
    required double fromLng,
    double? toLat,
    double? toLng,
    double? distanceKm,
    double? durationMin,
    required String pickupAt,
    required List<String> vehicleClassIds,
    int? adults,
    Map<String, int>? childSeatsJson,
    String? flight,
    String? signage,
    String? comment,
    bool? isRoundTrip,
    String? returnAt,
    String? returnFlight,
    String? promoCode,
    String? currency,
    double? hours,
    double? days,
    String? idempotencyKey,
  }) async {
    final body = <String, dynamic>{
      'serviceType': serviceType,
      'fromLabel': fromLabel,
      if (toLabel != null) 'toLabel': toLabel,
      'fromLat': fromLat,
      'fromLng': fromLng,
      if (toLat != null) 'toLat': toLat,
      if (toLng != null) 'toLng': toLng,
      if (distanceKm != null) 'distanceKm': distanceKm,
      if (durationMin != null) 'durationMin': durationMin,
      'pickupAt': pickupAt,
      'vehicleClassIds': vehicleClassIds,
      if (adults != null) 'adults': adults,
      if (childSeatsJson != null) 'childSeatsJson': childSeatsJson,
      if (flight != null) 'flight': flight,
      if (signage != null) 'signage': signage,
      if (comment != null) 'comment': comment,
      if (isRoundTrip != null) 'isRoundTrip': isRoundTrip,
      if (returnAt != null) 'returnAt': returnAt,
      if (returnFlight != null) 'returnFlight': returnFlight,
      if (promoCode != null) 'promoCode': promoCode,
      if (currency != null) 'currency': currency,
      if (hours != null) 'hours': hours,
      if (days != null) 'days': days,
    };

    try {
      return await client.post(
        '/rides',
        idempotencyKey: idempotencyKey,
        body: body,
      );
    } on ApiException catch (e) {
      if (e.statusCode == 400 &&
          (e.message.contains('distanceKm') ||
              e.message.contains('durationMin'))) {
        final legacyBody = Map<String, dynamic>.from(body)
          ..remove('distanceKm')
          ..remove('durationMin');
        return await client.post(
          '/rides',
          idempotencyKey: idempotencyKey,
          body: legacyBody,
        );
      }
      rethrow;
    }
  }

  Future<List<dynamic>> listRides() async {
    final data = await client.get('/rides');
    return (data['_list'] as List?) ??
        (data['rides'] as List?) ??
        [];
  }

  Future<Map<String, dynamic>> getRide(String id) =>
      client.get('/rides/$id');

  Future<Map<String, dynamic>> selectOffer(String rideId, String offerId) =>
      client.post('/rides/$rideId/select-offer', body: {'offerId': offerId});

  Future<Map<String, dynamic>> validateBook(String rideId, String offerId) =>
      client.post('/rides/$rideId/validate-book', body: {'offerId': offerId});

  Future<Map<String, dynamic>> paymentQuote({
    required String rideId,
    required String offerId,
    String? paymentMode,
    String? platform,
  }) {
    return client.post(
      '/payments/quote',
      body: {
        'rideId': rideId,
        'offerId': offerId,
        if (paymentMode != null) 'paymentMode': paymentMode,
        if (platform != null) 'platform': platform,
      },
    );
  }

  Future<Map<String, dynamic>> createPaymentIntent(
    String rideId, {
    String? paymentMode,
    String? paymentMethod,
    bool? termsAccepted,
    String? termsVersion,
    String? policyVersion,
    String? platform,
    String? idempotencyKey,
  }) {
    return client.post(
      '/payments/intents',
      idempotencyKey: idempotencyKey,
      body: {
        'rideId': rideId,
        if (paymentMode != null) 'paymentMode': paymentMode,
        if (paymentMethod != null) 'paymentMethod': paymentMethod,
        if (termsAccepted != null) 'termsAccepted': termsAccepted,
        if (termsVersion != null) 'termsVersion': termsVersion,
        if (policyVersion != null) 'policyVersion': policyVersion,
        if (platform != null) 'platform': platform,
        if (idempotencyKey != null) 'idempotencyKey': idempotencyKey,
      },
    );
  }

  /// After PaymentSheet succeeds — ask API to reconcile Stripe PI → BOOKED.
  Future<Map<String, dynamic>> confirmPayment(
    String rideId, {
    String? paymentIntentId,
  }) {
    return client.post(
      '/payments/confirm',
      body: {
        'rideId': rideId,
        if (paymentIntentId != null && paymentIntentId.isNotEmpty)
          'paymentIntentId': paymentIntentId,
      },
    );
  }

  Future<Map<String, dynamic>> tipRide(
    String rideId, {
    required double amount,
    String? paymentMethod,
    String? idempotencyKey,
  }) {
    return client.post(
      '/rides/$rideId/tip',
      idempotencyKey: idempotencyKey,
      body: {
        'amount': amount,
        if (paymentMethod != null) 'paymentMethod': paymentMethod,
        if (idempotencyKey != null) 'idempotencyKey': idempotencyKey,
      },
    );
  }

  Future<Map<String, dynamic>> getOffer(String rideId, String offerId) =>
      client.get('/rides/$rideId/offers/$offerId');

  Future<Map<String, dynamic>> listOfferReviews(
    String offerId, {
    String? cursor,
    int? take,
  }) {
    final params = <String>[];
    if (cursor != null && cursor.isNotEmpty) {
      params.add('cursor=${Uri.encodeQueryComponent(cursor)}');
    }
    if (take != null) params.add('take=$take');
    final q = params.isEmpty ? '' : '?${params.join('&')}';
    return client.get('/offers/$offerId/reviews$q');
  }

  Future<Map<String, dynamic>> paymentStatus(String rideId) =>
      client.get('/rides/$rideId/payment-status');

  /// Public payment provider introspection (includes Stripe publishable key).
  Future<Map<String, dynamic>> providersStatus() =>
      client.get('/providers/status', auth: false);

  Future<Map<String, dynamic>> recordRideView(String rideId) =>
      client.post('/rides/$rideId/view', body: {});

  Future<Map<String, dynamic>> registerDeviceToken({
    required String token,
    required String platform,
    required String appRole,
    String? deviceId,
  }) {
    return client.post(
      '/notifications/device-tokens',
      body: {
        'token': token,
        'platform': platform,
        'appRole': appRole,
        if (deviceId != null) 'deviceId': deviceId,
      },
    );
  }

  Future<Map<String, dynamic>> cancelRide(String rideId) =>
      client.post('/rides/$rideId/cancel', body: {});

  Future<Map<String, dynamic>> cancelBookedRide(String rideId) =>
      client.post(
        '/rides/$rideId/transitions',
        body: {'status': 'PASSENGER_CANCELLED'},
      );

  Future<Map<String, dynamic>> driverCancelBookedRide(String rideId) =>
      client.post(
        '/rides/$rideId/transitions',
        body: {'status': 'DRIVER_CANCELLED'},
      );


  Future<Map<String, dynamic>> updateRide(
    String rideId, {
    String? fromLabel,
    String? toLabel,
    double? fromLat,
    double? fromLng,
    double? toLat,
    double? toLng,
    String? pickupAt,
    List<String>? vehicleClassIds,
    int? adults,
    Map<String, int>? childSeatsJson,
    String? flight,
    String? returnFlight,
    String? signage,
    String? comment,
    bool? isRoundTrip,
    String? returnAt,
    int? pickupWaitMin,
    int? returnWaitMin,
    List<String>? requiredOptions,
    double? hours,
    double? days,
  }) {
    return client.patch(
      '/rides/$rideId',
      body: {
        if (fromLabel != null) 'fromLabel': fromLabel,
        if (toLabel != null) 'toLabel': toLabel,
        if (fromLat != null) 'fromLat': fromLat,
        if (fromLng != null) 'fromLng': fromLng,
        if (toLat != null) 'toLat': toLat,
        if (toLng != null) 'toLng': toLng,
        if (pickupAt != null) 'pickupAt': pickupAt,
        if (vehicleClassIds != null) 'vehicleClassIds': vehicleClassIds,
        if (adults != null) 'adults': adults,
        if (childSeatsJson != null) 'childSeatsJson': childSeatsJson,
        if (flight != null) 'flight': flight,
        if (returnFlight != null) 'returnFlight': returnFlight,
        if (signage != null) 'signage': signage,
        if (comment != null) 'comment': comment,
        if (isRoundTrip != null) 'isRoundTrip': isRoundTrip,
        if (returnAt != null) 'returnAt': returnAt,
        if (pickupWaitMin != null) 'pickupWaitMin': pickupWaitMin,
        if (returnWaitMin != null) 'returnWaitMin': returnWaitMin,
        if (requiredOptions != null) 'requiredOptions': requiredOptions,
        if (hours != null) 'hours': hours,
        if (days != null) 'days': days,
      },
    );
  }

  Future<Map<String, dynamic>> getChatThread(String rideId) =>
      client.get('/rides/$rideId/chat');

  Future<Map<String, dynamic>> sendChatMessage(String rideId, String body) =>
      client.post('/rides/$rideId/chat/messages', body: {'body': body});

  Future<Map<String, dynamic>> getRideContact(String rideId) =>
      client.get('/rides/$rideId/contact');

  Future<Map<String, dynamic>> getRideTracking(String rideId) =>
      client.get('/rides/$rideId/tracking');

  Future<Map<String, dynamic>> createChangeRequest(
    String rideId, {
    required String type,
    String? proposedPickupAt,
    String? note,
    String? flightNumber,
    String? contactPhone,
  }) =>
      client.post(
        '/rides/$rideId/change-requests',
        body: {
          'type': type,
          if (proposedPickupAt != null) 'proposedPickupAt': proposedPickupAt,
          if (note != null) 'note': note,
          if (flightNumber != null) 'flightNumber': flightNumber,
          if (contactPhone != null) 'contactPhone': contactPhone,
        },
      );

  Future<Map<String, dynamic>> respondLostItem(
    String rideId, {
    required String action,
    String? note,
    String? photoUrl,
  }) =>
      client.post(
        '/rides/$rideId/lost-item/respond',
        body: {
          'action': action,
          if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
          if (photoUrl != null && photoUrl.trim().isNotEmpty)
            'photoUrl': photoUrl.trim(),
        },
      );

  Future<Map<String, dynamic>> markLostItemReturned(
    String rideId, {
    String? note,
    String? handoverPhotoUrl,
  }) =>
      client.post(
        '/rides/$rideId/lost-item/returned',
        body: {
          if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
          if (handoverPhotoUrl != null && handoverPhotoUrl.trim().isNotEmpty)
            'handoverPhotoUrl': handoverPhotoUrl.trim(),
        },
      );

  Future<Map<String, dynamic>> setLostItemPickupLocation(
    String rideId, {
    required String location,
  }) =>
      client.post(
        '/rides/$rideId/lost-item/pickup-location',
        body: {
          'location': location.trim(),
        },
      );

  Future<Map<String, dynamic>> payLostItemReturnFee(
    String rideId, {
    String? paymentMethod,
  }) =>
      client.post(
        '/rides/$rideId/lost-item/pay-fee',
        body: {
          if (paymentMethod != null) 'paymentMethod': paymentMethod,
        },
      );

  Future<Map<String, dynamic>> rateRide(
    String rideId, {
    required int stars,
    int? communicationStars,
    int? driverStars,
    int? vehicleStars,
    String? comment,
  }) =>
      client.post(
        '/rides/$rideId/ratings',
        body: {
          'stars': stars,
          if (communicationStars != null)
            'communicationStars': communicationStars,
          if (driverStars != null) 'driverStars': driverStars,
          if (vehicleStars != null) 'vehicleStars': vehicleStars,
          if (comment != null) 'comment': comment,
        },
      );

  Future<Map<String, dynamic>> reportRide(
    String rideId, {
    required List<String> reasons,
    String? details,
  }) =>
      client.post(
        '/rides/$rideId/reports',
        body: {
          'reasons': reasons,
          if (details != null && details.trim().isNotEmpty)
            'details': details.trim(),
        },
      );

  Future<Map<String, dynamic>> createRideShareLink(String rideId) =>
      client.post('/rides/$rideId/share-link');

  Future<Map<String, dynamic>> revokeRideShareLink(String rideId) =>
      client.delete('/rides/$rideId/share-link');

  Future<Map<String, dynamic>> getPublicSharedRide(String token) =>
      client.get('/rides/shared/$token', auth: false);

  Future<List<dynamic>> listRideRatings(String rideId) async {

    final data = await client.get('/rides/$rideId/ratings');
    final list = data['_list'] ?? data['ratings'] ?? data['items'];
    if (list is List) return list;
    return const [];
  }

  Future<List<dynamic>> catalog({String? serviceType}) async {
    final q = serviceType != null ? '?serviceType=$serviceType' : '';
    final data = await client.get('/catalog$q');
    return (data['_list'] as List?) ?? [];
  }
}
