import 'dart:convert';

import 'package:http/http.dart' as http;

/// Debug-mode NDJSON ingest (session 1b2370). Do not log secrets.
Future<void> agentDbgLog({
  required String location,
  required String message,
  required String hypothesisId,
  Map<String, dynamic>? data,
  String runId = 'pre',
}) async {
  // #region agent log
  try {
    await http
        .post(
          Uri.parse(
            'http://127.0.0.1:7899/ingest/0b379297-28b2-450f-845a-79b8831d36fe',
          ),
          headers: {
            'Content-Type': 'application/json',
            'X-Debug-Session-Id': '1b2370',
          },
          body: jsonEncode({
            'sessionId': '1b2370',
            'runId': runId,
            'hypothesisId': hypothesisId,
            'location': location,
            'message': message,
            'data': data ?? const <String, dynamic>{},
            'timestamp': DateTime.now().millisecondsSinceEpoch,
          }),
        )
        .timeout(const Duration(milliseconds: 800));
  } catch (_) {}
  // #endregion
}
