import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

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

class OAuthProviderConfig {
  OAuthProviderConfig({
    required this.enabled,
    this.clientId,
    this.localMock = false,
  });

  final bool enabled;
  final String? clientId;
  final bool localMock;

  factory OAuthProviderConfig.fromJson(Map<String, dynamic>? json) {
    if (json == null) {
      return OAuthProviderConfig(enabled: false);
    }
    return OAuthProviderConfig(
      enabled: json['enabled'] == true,
      clientId: json['clientId'] as String?,
      localMock: json['localMock'] == true,
    );
  }
}

class OAuthConfig {
  OAuthConfig({required this.google, required this.apple});

  final OAuthProviderConfig google;
  final OAuthProviderConfig apple;

  factory OAuthConfig.fromJson(Map<String, dynamic> json) {
    return OAuthConfig(
      google: OAuthProviderConfig.fromJson(
        json['google'] is Map
            ? Map<String, dynamic>.from(json['google'] as Map)
            : null,
      ),
      apple: OAuthProviderConfig.fromJson(
        json['apple'] is Map
            ? Map<String, dynamic>.from(json['apple'] as Map)
            : null,
      ),
    );
  }

  static OAuthConfig disabled() => OAuthConfig(
        google: OAuthProviderConfig(enabled: false),
        apple: OAuthProviderConfig(enabled: false),
      );
}

/// Result of Google/Apple OAuth — either a full session or phone-link step.
class OAuthResult {
  OAuthResult._({
    required this.requiresPhoneLink,
    this.linkToken,
    this.session,
    this.user,
    this.message,
  });

  final bool requiresPhoneLink;
  final String? linkToken;
  final AuthSession? session;
  final Map<String, dynamic>? user;
  final String? message;

  factory OAuthResult.fromJson(Map<String, dynamic> data) {
    if (data['requiresPhoneLink'] == true) {
      return OAuthResult._(
        requiresPhoneLink: true,
        linkToken: data['linkToken'] as String?,
        user: data['user'] is Map
            ? Map<String, dynamic>.from(data['user'] as Map)
            : null,
        message: data['message']?.toString(),
      );
    }
    return OAuthResult._(
      requiresPhoneLink: false,
      session: AuthSession(
        accessToken: data['accessToken'] as String,
        refreshToken: (data['refreshToken'] as String?) ?? '',
        user: data['user'] is Map
            ? Map<String, dynamic>.from(data['user'] as Map)
            : null,
      ),
      user: data['user'] is Map
          ? Map<String, dynamic>.from(data['user'] as Map)
          : null,
    );
  }
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

  Future<Map<String, dynamic>> sendOtp({
    required String phoneE164,
    String purpose = 'login',
  }) {
    return client.post(
      '/auth/otp/send',
      auth: false,
      body: {'phoneE164': phoneE164, 'purpose': purpose},
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

  Future<OAuthConfig> oauthConfig() async {
    final data = await client.get('/auth/oauth/config', auth: false);
    return OAuthConfig.fromJson(data);
  }

  Future<OAuthResult> oauthGoogle({
    String? idToken,
    String? email,
    String? fullName,
    String role = 'PASSENGER',
  }) async {
    final data = await client.post(
      '/auth/oauth/google',
      auth: false,
      body: {
        if (idToken != null) 'idToken': idToken,
        if (email != null) 'email': email,
        if (fullName != null) 'fullName': fullName,
        'role': role,
      },
    );
    return _applyOAuthResult(data);
  }

  Future<OAuthResult> oauthApple({
    String? idToken,
    String? email,
    String? fullName,
    String role = 'PASSENGER',
  }) async {
    final data = await client.post(
      '/auth/oauth/apple',
      auth: false,
      body: {
        if (idToken != null) 'idToken': idToken,
        if (email != null) 'email': email,
        if (fullName != null) 'fullName': fullName,
        'role': role,
      },
    );
    return _applyOAuthResult(data);
  }

  Future<Map<String, dynamic>> linkOAuthPhone({
    required String linkToken,
    required String phoneE164,
  }) {
    return client.post(
      '/auth/oauth/link-phone',
      auth: false,
      body: {'linkToken': linkToken, 'phoneE164': phoneE164},
    );
  }

  Future<Map<String, dynamic>> me() => client.get('/auth/me');

  /// POST /auth/me/avatar — multipart field `file`.
  Future<Map<String, dynamic>> uploadAvatar({
    required Uint8List bytes,
    required String filename,
  }) {
    return client.postMultipart(
      '/auth/me/avatar',
      files: [
        http.MultipartFile.fromBytes(
          'file',
          bytes,
          filename: filename,
          contentType: mediaTypeForImageFilename(filename),
        ),
      ],
    );
  }

  /// Infer image MediaType from filename (Multer uses part Content-Type).
  static MediaType mediaTypeForImageFilename(String filename) {
    final lower = filename.toLowerCase();
    if (lower.endsWith('.png')) return MediaType('image', 'png');
    if (lower.endsWith('.webp')) return MediaType('image', 'webp');
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
      return MediaType('image', 'jpeg');
    }
    // Default jpeg — server also sniffs magic bytes.
    return MediaType('image', 'jpeg');
  }

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

  Future<Map<String, dynamic>> vipStatus() => client.get('/passenger/vip');

  Future<Map<String, dynamic>> ensureReferralCode() =>
      client.post('/passenger/referral/ensure', body: {});

  Future<Map<String, dynamic>> redeemReferral(String code) =>
      client.post('/referrals/redeem', body: {'code': code});

  Future<OAuthResult> _applyOAuthResult(Map<String, dynamic> data) async {
    final result = OAuthResult.fromJson(data);
    if (!result.requiresPhoneLink && result.session != null) {
      await client.tokens.saveTokens(
        access: result.session!.accessToken,
        refresh: result.session!.refreshToken,
      );
    }
    return result;
  }

  Future<AuthSession> _saveSession(Map<String, dynamic> data) async {
    final access = data['accessToken'] as String;
    final refresh = (data['refreshToken'] as String?) ?? '';
    await client.tokens.saveTokens(access: access, refresh: refresh);
    return AuthSession(
      accessToken: access,
      refreshToken: refresh,
      user: data['user'] as Map<String, dynamic>?,
    );
  }
}
