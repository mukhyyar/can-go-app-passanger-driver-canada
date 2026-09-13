import 'package:flutter/foundation.dart';
import 'package:local_auth/local_auth.dart';

/// Thin wrapper around [LocalAuthentication] for email credential unlock.
class GtBiometricAuth {
  GtBiometricAuth({LocalAuthentication? auth})
      : _auth = auth ?? LocalAuthentication();

  final LocalAuthentication _auth;

  /// False on web and when the device has no enrolled biometrics.
  Future<bool> isAvailable() async {
    if (kIsWeb) return false;
    try {
      final supported = await _auth.isDeviceSupported();
      if (!supported) return false;
      final canCheck = await _auth.canCheckBiometrics;
      if (!canCheck) return false;
      final types = await _auth.getAvailableBiometrics();
      return types.isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  /// Human label for the biometric CTA, e.g. "Sign in with fingerprint".
  Future<String> signInLabel() async {
    if (kIsWeb) return 'Sign in with biometrics';
    try {
      final types = await _auth.getAvailableBiometrics();
      final hasFace = types.contains(BiometricType.face);
      final hasFingerprint = types.contains(BiometricType.fingerprint) ||
          types.contains(BiometricType.strong) ||
          types.contains(BiometricType.weak);
      if (hasFace && !hasFingerprint) {
        return 'Sign in with Face ID';
      }
      if (hasFingerprint && !hasFace) {
        return 'Sign in with fingerprint';
      }
      if (hasFace && hasFingerprint) {
        return 'Sign in with biometrics';
      }
    } catch (_) {
      // fall through
    }
    return 'Sign in with biometrics';
  }

  Future<bool> authenticate({
    String reason = 'Sign in to CAN-RIDE',
  }) async {
    if (kIsWeb) return false;
    try {
      return await _auth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          biometricOnly: true,
          stickyAuth: true,
        ),
      );
    } catch (_) {
      return false;
    }
  }
}
