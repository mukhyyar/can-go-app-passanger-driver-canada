import 'package:flutter/foundation.dart';

/// Compile-time override: `--dart-define=CANGO_API_BASE=https://…/api`
const kApiBaseFromEnv = String.fromEnvironment('CANGO_API_BASE');

const kLocalApiBaseUrl = 'http://127.0.0.1:4000/api';
const kProdApiBaseUrl = 'https://www.can-rides.ca/api';

/// Nest API base for Flutter clients.
///
/// Precedence: non-empty [kApiBaseFromEnv] → production default (override with CANGO_API_BASE).
String resolveApiBaseUrl() {
  if (kApiBaseFromEnv.isNotEmpty) return kApiBaseFromEnv;
  return kProdApiBaseUrl;
}

/// Same as [resolveApiBaseUrl] without a trailing slash.
String normalizedApiBaseUrl() {
  final base = resolveApiBaseUrl();
  return base.endsWith('/') ? base.substring(0, base.length - 1) : base;
}

/// Rewrite signed MinIO/S3 URLs that point at localhost so phones can load them
/// via the same host as [CANGO_API_BASE] (LAN IP), keeping path + query intact.
String? rewriteMediaUrl(String? url) {
  if (url == null || url.isEmpty) return url;
  final uri = Uri.tryParse(url);
  if (uri == null || !uri.hasScheme) return url;
  final host = uri.host.toLowerCase();
  if (host != '127.0.0.1' && host != 'localhost') return url;
  final api = Uri.tryParse(normalizedApiBaseUrl());
  if (api == null || api.host.isEmpty) return url;
  if (api.host == '127.0.0.1' || api.host == 'localhost') return url;
  return uri.replace(host: api.host).toString();
}
