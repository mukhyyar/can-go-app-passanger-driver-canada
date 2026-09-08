import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'api_client.dart';

class DriverApi {
  DriverApi(this.client);
  final ApiClient client;

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

  Future<Map<String, dynamic>> createVehicle({
    required String name,
    required String plate,
    required String vehicleClass,
  }) =>
      client.post(
        '/driver/vehicles',
        body: {
          'name': name,
          'plate': plate,
          'vehicleClass': vehicleClass,
        },
      );

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

  Future<List<dynamic>> openRequests() async {
    final data = await client.get('/driver/requests');
    return (data['_list'] as List?) ?? [];
  }

  Future<Map<String, dynamic>> createOffer(
    String rideId, {
    required double bidAmount,
  }) =>
      client.post(
        '/rides/$rideId/offers',
        body: {'bidAmount': bidAmount},
      );

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
