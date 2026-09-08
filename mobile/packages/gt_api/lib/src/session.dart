import 'api_client.dart';
import 'auth_api.dart';
import 'cms_api.dart';
import 'driver_api.dart';
import 'marketplace_api.dart';

/// Shared API façade for Passenger + Driver apps.
class CanGoSession {
  CanGoSession({String? baseUrl})
      : client = ApiClient(baseUrl: baseUrl ?? kDefaultApiBaseUrl) {
    auth = AuthApi(client);
    marketplace = MarketplaceApi(client);
    driver = DriverApi(client);
    cms = CmsApi(client);
  }

  final ApiClient client;
  late final AuthApi auth;
  late final MarketplaceApi marketplace;
  late final DriverApi driver;
  late final CmsApi cms;

  bool get hasTokenSync => false; // prefer async check

  Future<bool> isAuthenticated() async {
    final t = await client.tokens.readAccess();
    return t != null && t.isNotEmpty;
  }

  Future<void> clear() => client.tokens.clear();
}
