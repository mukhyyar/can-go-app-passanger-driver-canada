import 'api_client.dart';

class NotificationsApi {
  NotificationsApi(this.client);
  final ApiClient client;

  Future<Map<String, dynamic>> list({int limit = 50, String? appRole}) {
    final query = StringBuffer('/notifications?limit=$limit');
    if (appRole != null && appRole.isNotEmpty) {
      query.write('&appRole=${Uri.encodeComponent(appRole)}');
    }
    return client.get(query.toString());
  }

  Future<Map<String, dynamic>> unreadCount({String? appRole}) {
    final query = StringBuffer('/notifications/unread-count');
    if (appRole != null && appRole.isNotEmpty) {
      query.write('?appRole=${Uri.encodeComponent(appRole)}');
    }
    return client.get(query.toString());
  }

  Future<Map<String, dynamic>> markRead(String id) =>
      client.post('/notifications/$id/read');

  Future<Map<String, dynamic>> markAllRead() =>
      client.post('/notifications/read-all');
}
