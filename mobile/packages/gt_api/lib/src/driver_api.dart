import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'api_client.dart';

class DriverApi {
  DriverApi(this.client);
  final ApiClient client;

  Future<Map<String, dynamic>> me() => client.get('/driver/me');

  Future<Map<String, dynamic>> updateMe(Map<String, dynamic> body) =>
      client.patch('/driver/me', body: body);

  Future<Map<String, dynamic>> accountStatus() =>
      client.get('/driver/me/account-status');

  Future<Map<String, dynamic>> paymentDetails() =>
      client.get('/driver/me/payment-details');

  Future<Map<String, dynamic>> updatePaymentDetails(
          Map<String, dynamic> body) =>
      client.patch('/driver/me/payment-details', body: body);

  Future<Map<String, dynamic>> documentsStatus() =>
      client.get('/driver/documents');

  Future<Map<String, dynamic>> uploadDocument({
    required String docType,
    required Uint8List bytes,
    required String filename,
    String contentType = 'image/jpeg',
    String? vehicleId,
  }) {
    return client.postMultipart(
      '/driver/documents',
      fields: {
        'docType': docType,
        if (vehicleId != null) 'vehicleId': vehicleId,
      },
      files: [
        http.MultipartFile.fromBytes(
          'file',
          bytes,
          filename: filename,
        ),
      ],
    );
  }

  Future<Map<String, dynamic>> reuploadDocument({
    required String documentId,
    required Uint8List bytes,
    required String filename,
  }) {
    return client.postMultipart(
      '/driver/documents/$documentId/reupload',
      fields: const {},
      files: [
        http.MultipartFile.fromBytes(
          'file',
          bytes,
          filename: filename,
        ),
      ],
    );
  }

  Future<Map<String, dynamic>> createVehicle({
    required String name,
    required String plate,
    required String vehicleClass,
    String? color,
    int? year,
    int? passengerSeats,
    int? luggagePlaces,
    Map<String, dynamic>? amenities,
    int? autocancelBefore,
    int? autocancelAfter,
    bool? isDefault,
  }) =>
      client.post(
        '/driver/vehicles',
        body: {
          'name': name,
          'plate': plate,
          'vehicleClass': vehicleClass,
          if (color != null) 'color': color,
          if (year != null) 'year': year,
          if (passengerSeats != null) 'passengerSeats': passengerSeats,
          if (luggagePlaces != null) 'luggagePlaces': luggagePlaces,
          if (amenities != null) 'amenities': amenities,
          if (autocancelBefore != null) 'autocancelBefore': autocancelBefore,
          if (autocancelAfter != null) 'autocancelAfter': autocancelAfter,
          if (isDefault != null) 'isDefault': isDefault,
        },
      );

  Future<Map<String, dynamic>> updateVehicle(
    String id,
    Map<String, dynamic> body,
  ) =>
      client.patch('/driver/vehicles/$id', body: body);

  Future<Map<String, dynamic>> getVehicle(String id) =>
      client.get('/driver/vehicles/$id');

  Future<Map<String, dynamic>> deleteVehicle(String id) =>
      client.delete('/driver/vehicles/$id');

  Future<List<dynamic>> listVehicles() async {
    final data = await client.get('/driver/vehicles');
    return (data['_list'] as List?) ??
        (data is List ? data as List : const []);
  }

  Future<List<dynamic>> listZones() async {
    final data = await client.get('/driver/operating-zones');
    return (data['_list'] as List?) ?? const [];
  }

  Future<Map<String, dynamic>> createZone({
    required String name,
    required String zoneType,
    required Map<String, dynamic> geoJson,
    double? radiusKm,
  }) =>
      client.post(
        '/driver/operating-zones',
        body: {
          'name': name,
          'zoneType': zoneType,
          'geoJson': geoJson,
          if (radiusKm != null) 'radiusKm': radiusKm,
        },
      );

  Future<Map<String, dynamic>> updateZone({
    required String id,
    required String name,
    required String zoneType,
    required Map<String, dynamic> geoJson,
    double? radiusKm,
  }) =>
      client.put(
        '/driver/operating-zones/$id',
        body: {
          'name': name,
          'zoneType': zoneType,
          'geoJson': geoJson,
          if (radiusKm != null) 'radiusKm': radiusKm,
        },
      );

  Future<Map<String, dynamic>> deleteZone(String id) =>
      client.delete('/driver/operating-zones/$id');

  Future<List<dynamic>> openRequests() async {
    final data = await client.get('/driver/requests');
    return (data['_list'] as List?) ?? [];
  }

  Future<List<dynamic>> mySchedule() async {
    final data = await client.get('/driver/schedule');
    return (data['_list'] as List?) ?? [];
  }

  Future<Map<String, dynamic>> requestDetail(String rideId) =>
      client.get('/driver/requests/$rideId');

  Future<Map<String, dynamic>> skipRequest(String rideId) =>
      client.post('/driver/requests/$rideId/skip', body: {});

  Future<Map<String, dynamic>> createOffer(
    String rideId, {
    double? bidAmount,
    double? outboundPrice,
    double? returnPrice,
    String? currency,
    String? vehicleId,
    int? validForSeconds,
    List<String>? selectedOptions,
    String? idempotencyKey,
  }) =>
      client.post(
        '/rides/$rideId/offers',
        body: {
          if (bidAmount != null) 'bidAmount': bidAmount,
          if (outboundPrice != null) 'outboundPrice': outboundPrice,
          if (returnPrice != null) 'returnPrice': returnPrice,
          if (currency != null) 'currency': currency,
          if (vehicleId != null) 'vehicleId': vehicleId,
          if (validForSeconds != null) 'validForSeconds': validForSeconds,
          if (selectedOptions != null) 'selectedOptions': selectedOptions,
          if (idempotencyKey != null) 'idempotencyKey': idempotencyKey,
        },
        idempotencyKey: idempotencyKey,
      );

  Future<Map<String, dynamic>> updateOffer(
    String rideId,
    String offerId, {
    double? outboundPrice,
    double? returnPrice,
    double? bidAmount,
    String? vehicleId,
    int? validForSeconds,
    List<String>? selectedOptions,
    String? idempotencyKey,
  }) =>
      client.patch(
        '/rides/$rideId/offers/$offerId',
        body: {
          if (bidAmount != null) 'bidAmount': bidAmount,
          if (outboundPrice != null) 'outboundPrice': outboundPrice,
          if (returnPrice != null) 'returnPrice': returnPrice,
          if (vehicleId != null) 'vehicleId': vehicleId,
          if (validForSeconds != null) 'validForSeconds': validForSeconds,
          if (selectedOptions != null) 'selectedOptions': selectedOptions,
          if (idempotencyKey != null) 'idempotencyKey': idempotencyKey,
        },
        idempotencyKey: idempotencyKey,
      );

  Future<Map<String, dynamic>> withdrawOffer(String offerId) =>
      client.post('/offers/$offerId/withdraw', body: {});

  Future<Map<String, dynamic>> enRoute(String rideId) =>
      client.post('/driver/rides/$rideId/en-route', body: {});

  Future<Map<String, dynamic>> arrived(String rideId) =>
      client.post('/driver/rides/$rideId/arrived', body: {});

  Future<Map<String, dynamic>> startTrip(String rideId) =>
      client.post('/driver/rides/$rideId/start', body: {});

  Future<Map<String, dynamic>> completeTrip(String rideId) =>
      client.post('/driver/rides/$rideId/complete', body: {});

  Future<Map<String, dynamic>> pushLocation({
    required double lat,
    required double lng,
    String? rideId,
  }) =>
      client.post(
        '/tracking/location',
        body: {
          'lat': lat,
          'lng': lng,
          if (rideId != null) 'rideId': rideId,
        },
      );

  Future<List<dynamic>> listDayOffs() async {
    final data = await client.get('/driver/day-offs');
    return (data['_list'] as List?) ?? [];
  }

  Future<Map<String, dynamic>> addDayOff(String date, {String? note}) =>
      client.post(
        '/driver/day-offs',
        body: {
          'date': date,
          if (note != null) 'note': note,
        },
      );

  Future<Map<String, dynamic>> removeDayOff(String id) =>
      client.delete('/driver/day-offs/$id');
}
