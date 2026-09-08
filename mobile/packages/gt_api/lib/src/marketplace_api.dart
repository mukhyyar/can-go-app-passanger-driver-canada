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
    String? flight,
    String? signage,
    String? comment,
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
        if (flight != null) 'flight': flight,
        if (signage != null) 'signage': signage,
        if (comment != null) 'comment': comment,
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

  Future<Map<String, dynamic>> createPaymentIntent(String rideId) =>
      client.post('/payments/intents', body: {'rideId': rideId});

  Future<Map<String, dynamic>> cancelRide(String rideId) =>
      client.post('/rides/$rideId/cancel', body: {});

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
