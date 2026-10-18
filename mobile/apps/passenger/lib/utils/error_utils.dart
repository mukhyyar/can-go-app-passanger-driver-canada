import 'package:flutter/material.dart';
import 'package:gt_api/gt_api.dart';

/// Strips low-level exception wrappers (like `ApiException(400):`, `Exception:`, etc.)
/// and formats user-facing errors into clean, friendly messages.
String cleanErrorMessage(
  dynamic error, {
  String fallback = 'An unexpected error occurred',
}) {
  if (error == null) return fallback;

  if (error is ApiException) {
    final msg = error.message.trim();
    if (msg.isNotEmpty && !msg.toLowerCase().startsWith('request failed')) {
      return _cleanRawString(msg, fallback: fallback);
    }
    switch (error.statusCode) {
      case 400:
        return 'Invalid request. Please check your details and try again.';
      case 401:
        return 'Session expired. Please sign in again.';
      case 403:
        return 'You do not have permission to perform this action.';
      case 404:
        return 'The requested resource was not found.';
      case 409:
        return 'This request was already updated or is in conflict.';
      case 429:
        return 'Too many requests. Please wait a moment and try again.';
      default:
        if (error.statusCode >= 500) {
          return 'Server error. Please try again later.';
        }
        return 'Request failed (${error.statusCode})';
    }
  }

  final raw = error.toString().trim();
  final lower = raw.toLowerCase();

  // Network / Connection issues
  if (lower.contains('socketexception') ||
      lower.contains('failed host lookup') ||
      lower.contains('network is unreachable') ||
      lower.contains('connection refused') ||
      lower.contains('connection closed') ||
      lower.contains('clientexception') ||
      lower.contains('timeoutexception') ||
      lower.contains('broken pipe')) {
    return 'Network connection issue. Please check your internet and try again.';
  }

  return _cleanRawString(raw, fallback: fallback);
}

/// Recursively removes technical prefixes like `ApiException(400): `, `Exception: `, etc.
String _cleanRawString(String raw, {required String fallback}) {
  var cleaned = raw.trim();

  final prefixRegex = RegExp(
    r'^(ApiException\s*\(\d+\)\s*:\s*|ApiException\s*:\s*|Exception\s*:\s*|Error\s*:\s*)',
    caseSensitive: false,
  );

  // Strip repeated prefixes (e.g. "Exception: ApiException(400): ...")
  while (prefixRegex.hasMatch(cleaned)) {
    cleaned = cleaned.replaceFirst(prefixRegex, '').trim();
  }

  // Also clean any unclosed/trailing "ApiException(" artifacts
  if (cleaned.startsWith('ApiException(') && cleaned.contains('):')) {
    cleaned = cleaned.substring(cleaned.indexOf('):') + 2).trim();
  }

  // Also clean if format is "400): actual message"
  final codeClosingRegex = RegExp(r'^\d+\)\s*:\s*');
  if (codeClosingRegex.hasMatch(cleaned)) {
    cleaned = cleaned.replaceFirst(codeClosingRegex, '').trim();
  }

  if (cleaned.isEmpty) {
    return fallback;
  }

  return cleaned;
}

/// Extension on [BuildContext] to show clean, user-friendly error SnackBars.
extension ContextErrorSnackBar on BuildContext {
  void showErrorSnackBar(
    dynamic error, {
    String? prefix,
    SnackBarBehavior behavior = SnackBarBehavior.floating,
    Duration duration = const Duration(seconds: 4),
  }) {
    if (!mounted) return;
    final clean = cleanErrorMessage(error);
    final text =
        prefix != null && prefix.trim().isNotEmpty ? '$prefix: $clean' : clean;
    ScaffoldMessenger.of(this).showSnackBar(
      SnackBar(
        content: Text(text),
        behavior: behavior,
        duration: duration,
      ),
    );
  }
}
