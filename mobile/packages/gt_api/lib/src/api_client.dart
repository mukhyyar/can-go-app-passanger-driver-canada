import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// Resolved Nest API base (see [resolveApiBaseUrl]).
String get kDefaultApiBaseUrl => resolveApiBaseUrl();

class ApiException implements Exception {
  ApiException(this.statusCode, this.message, {this.body});
  final int statusCode;
  final String message;
  final dynamic body;

  /// Nest often nests `{ code, challengeId, ... }` under `message`.
  Map<String, dynamic> get flatBody {
    if (body is! Map) return {};
    final map = Map<String, dynamic>.from(body as Map);
    final nested = map['message'];
    if (nested is Map) {
      return {...map, ...Map<String, dynamic>.from(nested)};
    }
    return map;
  }

  String? get code {
    final c = flatBody['code'];
    return c?.toString();
  }

  @override
  String toString() => 'ApiException($statusCode): $message';
}

class TokenStore {
  TokenStore({FlutterSecureStorage? secure})
      : _secure = secure ?? const FlutterSecureStorage();

  final FlutterSecureStorage _secure;
  static const _accessKey = 'cango_access_token';
  static const _refreshKey = 'cango_refresh_token';

  Future<String?> readAccess() async {
    try {
      return await _secure.read(key: _accessKey);
    } catch (_) {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString(_accessKey);
    }
  }

  Future<String?> readRefresh() async {
    try {
      return await _secure.read(key: _refreshKey);
    } catch (_) {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString(_refreshKey);
    }
  }

  Future<void> saveTokens({
    required String access,
    required String refresh,
  }) async {
    try {
      await _secure.write(key: _accessKey, value: access);
      await _secure.write(key: _refreshKey, value: refresh);
    } catch (_) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_accessKey, access);
      await prefs.setString(_refreshKey, refresh);
    }
  }

  Future<void> clear() async {
    try {
      await _secure.delete(key: _accessKey);
      await _secure.delete(key: _refreshKey);
    } catch (_) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_accessKey);
      await prefs.remove(_refreshKey);
    }
  }
}

class ApiClient {
  ApiClient({
    String? baseUrl,
    TokenStore? tokens,
    http.Client? httpClient,
  })  : baseUrl = baseUrl ?? resolveApiBaseUrl(),
        tokens = tokens ?? TokenStore(),
        _http = httpClient ?? http.Client();

  final String baseUrl;
  final TokenStore tokens;
  final http.Client _http;

  Uri _uri(String path) {
    final normalized = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$baseUrl$normalized');
  }

  Future<Map<String, dynamic>> get(
    String path, {
    bool auth = true,
  }) async {
    return _send('GET', path, auth: auth);
  }

  Future<Map<String, dynamic>> post(
    String path, {
    Map<String, dynamic>? body,
    bool auth = true,
    String? idempotencyKey,
  }) async {
    return _send(
      'POST',
      path,
      body: body,
      auth: auth,
      idempotencyKey: idempotencyKey,
    );
  }

  Future<Map<String, dynamic>> put(
    String path, {
    Map<String, dynamic>? body,
    bool auth = true,
  }) async {
    return _send('PUT', path, body: body, auth: auth);
  }

  Future<Map<String, dynamic>> patch(
    String path, {
    Map<String, dynamic>? body,
    bool auth = true,
    String? idempotencyKey,
  }) async {
    return _send(
      'PATCH',
      path,
      body: body,
      auth: auth,
      idempotencyKey: idempotencyKey,
    );
  }

  Future<Map<String, dynamic>> delete(String path, {bool auth = true}) async {
    return _send('DELETE', path, auth: auth);
  }

  Future<Map<String, dynamic>> postMultipart(
    String path, {
    required List<http.MultipartFile> files,
    Map<String, String> fields = const {},
  }) async {
    final req = http.MultipartRequest('POST', _uri(path));
    final access = await tokens.readAccess();
    if (access != null) {
      req.headers['Authorization'] = 'Bearer $access';
    }
    req.fields.addAll(fields);
    req.files.addAll(files);
    final streamed = await _http.send(req);
    final res = await http.Response.fromStream(streamed);
    return _decode(res);
  }

  Future<Map<String, dynamic>> _send(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool auth = true,
    String? idempotencyKey,
    bool retried = false,
  }) async {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (idempotencyKey != null) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    if (auth) {
      final access = await tokens.readAccess();
      if (access != null) headers['Authorization'] = 'Bearer $access';
    }

    late http.Response res;
    final uri = _uri(path);
    final encoded = body == null ? null : jsonEncode(body);
    switch (method) {
      case 'GET':
        res = await _http.get(uri, headers: headers);
        break;
      case 'POST':
        res = await _http.post(uri, headers: headers, body: encoded);
        break;
      case 'PUT':
        res = await _http.put(uri, headers: headers, body: encoded);
        break;
      case 'PATCH':
        res = await _http.patch(uri, headers: headers, body: encoded);
        break;
      case 'DELETE':
        res = await _http.delete(uri, headers: headers);
        break;
      default:
        throw ApiException(0, 'Unsupported method $method');
    }

    if (res.statusCode == 401 && auth && !retried) {
      final refreshed = await tryRefresh();
      if (refreshed) {
        return _send(
          method,
          path,
          body: body,
          auth: auth,
          idempotencyKey: idempotencyKey,
          retried: true,
        );
      }
    }

    return _decode(res);
  }

  Future<bool> tryRefresh() async {
    final refresh = await tokens.readRefresh();
    if (refresh == null) return false;
    try {
      final res = await _http.post(
        _uri('/auth/refresh'),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: jsonEncode({'refreshToken': refresh}),
      );
      if (res.statusCode >= 200 && res.statusCode < 300) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final access = data['accessToken'] as String?;
        final nextRefresh = data['refreshToken'] as String?;
        if (access != null && nextRefresh != null) {
          await tokens.saveTokens(access: access, refresh: nextRefresh);
          return true;
        }
      }
    } catch (_) {}
    await tokens.clear();
    return false;
  }

  Map<String, dynamic> _decode(http.Response res) {
    dynamic parsed;
    if (res.body.isNotEmpty) {
      try {
        parsed = jsonDecode(res.body);
      } catch (_) {
        parsed = res.body;
      }
    }
    if (res.statusCode >= 200 && res.statusCode < 300) {
      if (parsed is Map<String, dynamic>) return parsed;
      if (parsed is List) return {'_list': parsed};
      return {'_data': parsed};
    }
    String message = 'Request failed';
    if (parsed is Map && parsed['message'] != null) {
      final m = parsed['message'];
      if (m is List) {
        message = m.join(', ');
      } else if (m is Map) {
        final inner = m['message'];
        message = inner != null ? inner.toString() : 'Request failed';
      } else {
        message = m.toString();
      }
    }
    throw ApiException(res.statusCode, message, body: parsed);
  }
}
