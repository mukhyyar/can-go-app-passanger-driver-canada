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
  }) {
    return client.post(
      '/rides',
      idempotencyKey: idempotencyKey,
      body: {
        'serviceType': serviceType,
        'fromLabel': fromLabel,
        if (toLabel != null) 'toLabel': toLabel,
        'fromLat': fromLat,
        'fromLng': fromLng,
        if (toLat != null) 'toLat': toLat,
        if (toLng != null) 'toLng': toLng,
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
      },
    );
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
  }) =>
      client.post(
        '/rides/$rideId/change-requests',
        body: {
          'type': type,
          if (proposedPickupAt != null) 'proposedPickupAt': proposedPickupAt,
          if (note != null) 'note': note,
          if (flightNumber != null) 'flightNumber': flightNumber,
        },
      );

  Future<Map<String, dynamic>> rateRide(
    String rideId, {
    required int stars,
    String? comment,
  }) =>
      client.post(
        '/rides/$rideId/ratings',
        body: {
          'stars': stars,
          if (comment != null) 'comment': comment,
        },
      );

  Future<List<dynamic>> catalog({String? serviceType}) async {
    final q = serviceType != null ? '?serviceType=$serviceType' : '';
    final data = await client.get('/catalog$q');
    return (data['_list'] as List?) ?? [];
  }
}
