import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SavedCredentials {
  const SavedCredentials({
    required this.email,
    required this.password,
  });

  final String email;
  final String password;
}

/// Secure email/password store, namespaced per app (`driver` / `passenger`).
class CredentialStore {
  CredentialStore({
    required this.namespace,
    FlutterSecureStorage? secure,
  }) : _secure = secure ?? const FlutterSecureStorage();

  final String namespace;
  final FlutterSecureStorage _secure;

  String get _emailKey => 'cango_${namespace}_saved_email';
  String get _passwordKey => 'cango_${namespace}_saved_password';
  String get _rememberKey => 'cango_${namespace}_remember_me';

  Future<SavedCredentials?> read() async {
    try {
      final email = await _secure.read(key: _emailKey);
      final password = await _secure.read(key: _passwordKey);
      if (email == null ||
          email.isEmpty ||
          password == null ||
          password.isEmpty) {
        return null;
      }
      return SavedCredentials(email: email, password: password);
    } catch (_) {
      return null;
    }
  }

  Future<bool> get hasCredentials async => (await read()) != null;

  Future<void> save({
    required String email,
    required String password,
  }) async {
    final trimmed = email.trim();
    try {
      await _secure.write(key: _emailKey, value: trimmed);
      await _secure.write(key: _passwordKey, value: password);
    } catch (_) {
      // Never fall back to SharedPreferences for passwords.
    }
    await setRememberMe(true);
  }

  Future<void> clear() async {
    try {
      await _secure.delete(key: _emailKey);
      await _secure.delete(key: _passwordKey);
    } catch (_) {
      // ignore
    }
  }

  /// Last Remember-me checkbox choice. Defaults to `true` when unset.
  Future<bool> readRememberMe() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_rememberKey) ?? true;
  }

  Future<void> setRememberMe(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_rememberKey, value);
  }
}
