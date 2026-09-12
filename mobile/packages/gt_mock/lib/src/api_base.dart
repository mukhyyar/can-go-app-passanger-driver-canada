import 'package:flutter/foundation.dart';

/// Compile-time override: `--dart-define=CANGO_API_BASE=https://…/api`
const kApiBaseFromEnv = String.fromEnvironment('CANGO_API_BASE');

const kLocalApiBaseUrl = 'http://127.0.0.1:4000/api';
const kProdApiBaseUrl = 'https://www.can-rides.ca/api';

/// Nest API base for Flutter clients.
///
/// Precedence: non-empty [kApiBaseFromEnv] → production in release/profile →
/// localhost for debug.
String resolveApiBaseUrl() {
  if (kApiBaseFromEnv.isNotEmpty) return kApiBaseFromEnv;
  if (kReleaseMode) return kProdApiBaseUrl;
  return kLocalApiBaseUrl;
}

/// Same as [resolveApiBaseUrl] without a trailing slash.
String normalizedApiBaseUrl() {
  final base = resolveApiBaseUrl();
  return base.endsWith('/') ? base.substring(0, base.length - 1) : base;
}
