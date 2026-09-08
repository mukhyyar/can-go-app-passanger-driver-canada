import 'api_client.dart';

class AuthSession {
  AuthSession({
    required this.accessToken,
    required this.refreshToken,
    this.user,
  });

  final String accessToken;
  final String refreshToken;
  final Map<String, dynamic>? user;
}

class AuthApi {
  AuthApi(this.client);
  final ApiClient client;

  Future<Map<String, dynamic>> register({
    required String email,
    required String password,
    required String phoneE164,
    required String role,
    String? fullName,
  }) {
    return client.post(
      '/auth/register',
      auth: false,
      body: {
        'email': email,
        'password': password,
        'phoneE164': phoneE164,
        'role': role,
        if (fullName != null) 'fullName': fullName,
      },
    );
  }

  Future<AuthSession> verifyOtp({
    required String challengeId,
    required String code,
  }) async {
    final data = await client.post(
      '/auth/otp/verify',
      auth: false,
      body: {'challengeId': challengeId, 'code': code},
    );
    return _saveSession(data);
  }

  Future<AuthSession> login({
    required String password,
    String? email,
    String? phoneE164,
  }) async {
    final data = await client.post(
      '/auth/login',
      auth: false,
      body: {
        'password': password,
        if (email != null) 'email': email,
        if (phoneE164 != null) 'phoneE164': phoneE164,
      },
    );
    return _saveSession(data);
  }

  Future<Map<String, dynamic>> me() => client.get('/auth/me');

  Future<void> logout({String? refreshToken}) async {
    try {
      await client.post(
        '/auth/logout',
        body: {
          if (refreshToken != null) 'refreshToken': refreshToken,
        },
      );
    } catch (_) {}
    await client.tokens.clear();
  }

  Future<Map<String, dynamic>> requestVip() =>
      client.post('/passenger/vip/request', body: {});

  Future<Map<String, dynamic>> vipStatus() => client.get('/passenger/vip');

  Future<Map<String, dynamic>> ensureReferralCode() =>
      client.post('/passenger/referral/ensure', body: {});

  Future<Map<String, dynamic>> redeemReferral(String code) =>
      client.post('/referrals/redeem', body: {'code': code});

  Future<AuthSession> _saveSession(Map<String, dynamic> data) async {
    final access = data['accessToken'] as String;
    final refresh = data['refreshToken'] as String;
    await client.tokens.saveTokens(access: access, refresh: refresh);
    return AuthSession(
      accessToken: access,
      refreshToken: refresh,
      user: data['user'] as Map<String, dynamic>?,
    );
  }
}
