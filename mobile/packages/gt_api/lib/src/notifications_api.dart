import 'api_client.dart';

class NotificationsApi {
  NotificationsApi(this.client);
  final ApiClient client;

  Future<Map<String, dynamic>> list({int limit = 50}) =>
      client.get('/notifications?limit=$limit');

  Future<Map<String, dynamic>> unreadCount() =>
      client.get('/notifications/unread-count');

  Future<Map<String, dynamic>> markRead(String id) =>
      client.post('/notifications/$id/read');

  Future<Map<String, dynamic>> markAllRead() =>
      client.post('/notifications/read-all');
}
