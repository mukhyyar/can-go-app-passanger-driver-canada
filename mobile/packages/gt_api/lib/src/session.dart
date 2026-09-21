import 'api_client.dart';
import 'auth_api.dart';
import 'cms_api.dart';
import 'driver_api.dart';
import 'marketplace_api.dart';
import 'notifications_api.dart';

/// Shared API façade for Passenger + Driver apps.
class CanGoSession {
  CanGoSession({String? baseUrl, ApiClient? client})
      : client = client ?? ApiClient(baseUrl: baseUrl) {
    auth = AuthApi(this.client);
    marketplace = MarketplaceApi(this.client);
    driver = DriverApi(this.client);
    cms = CmsApi(this.client);
    notifications = NotificationsApi(this.client);
  }

  final ApiClient client;
  late final AuthApi auth;
  late final MarketplaceApi marketplace;
  late final DriverApi driver;
  late final CmsApi cms;
  late final NotificationsApi notifications;

  bool get hasTokenSync => false; // prefer async check

  Future<bool> isAuthenticated() async {
    final t = await client.tokens.readAccess();
    return t != null && t.isNotEmpty;
  }

  Future<void> clear() => client.tokens.clear();
}
