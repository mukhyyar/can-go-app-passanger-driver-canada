import 'api_client.dart';

class CmsApi {
  CmsApi(this.client);
  final ApiClient client;

  Future<Map<String, dynamic>> page(String slug) {
    return client.get('/cms/pages/$slug', auth: false);
  }

  Future<List<Map<String, dynamic>>> pages({String? kind}) async {
    final q = (kind == null || kind.isEmpty) ? '' : '?kind=$kind';
    final data = await client.get('/cms/pages$q', auth: false);
    final list = data['_list'];
    if (list is List) {
      return list
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    }
    return const [];
  }
}
