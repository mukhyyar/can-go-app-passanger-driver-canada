import 'package:flutter/material.dart';
import 'package:gt_mock/gt_mock.dart';

import 'api_client.dart';

/// Absolute URL for offer/vehicle images (API-relative paths or legacy signed).
String resolveOfferImageUrl(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return trimmed;
  if (trimmed.startsWith('/')) {
    return '${normalizedApiBaseUrl()}$trimmed';
  }
  return rewriteMediaUrl(trimmed) ?? trimmed;
}

bool _needsApiAuth(String absoluteUrl) {
  final api = normalizedApiBaseUrl().toLowerCase();
  final lower = absoluteUrl.toLowerCase();
  if (lower.startsWith(api)) return true;
  // Relative paths already resolved against API base.
  return absoluteUrl.startsWith('/') &&
      absoluteUrl.contains('/photos/') &&
      absoluteUrl.endsWith('/content');
}

/// [Image.network] that attaches Bearer when the URL is an API photo proxy.
class AuthNetworkImage extends StatefulWidget {
  const AuthNetworkImage({
    super.key,
    required this.url,
    this.fit = BoxFit.cover,
    this.width,
    this.height,
    this.errorBuilder,
    this.tokens,
  });

  final String url;
  final BoxFit fit;
  final double? width;
  final double? height;
  final ImageErrorWidgetBuilder? errorBuilder;
  final TokenStore? tokens;

  @override
  State<AuthNetworkImage> createState() => _AuthNetworkImageState();
}

class _AuthNetworkImageState extends State<AuthNetworkImage> {
  Map<String, String>? _headers;
  bool _ready = false;
  late String _resolved;

  @override
  void initState() {
    super.initState();
    _resolved = resolveOfferImageUrl(widget.url);
    _prepare();
  }

  @override
  void didUpdateWidget(covariant AuthNetworkImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.url != widget.url) {
      _resolved = resolveOfferImageUrl(widget.url);
      _ready = false;
      _headers = null;
      _prepare();
    }
  }

  Future<void> _prepare() async {
    Map<String, String>? headers;
    if (_needsApiAuth(_resolved)) {
      final store = widget.tokens ?? TokenStore();
      final access = await store.readAccess();
      if (access != null && access.isNotEmpty) {
        headers = {'Authorization': 'Bearer $access'};
      }
    }
    if (!mounted) return;
    setState(() {
      _headers = headers;
      _ready = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      return SizedBox(
        width: widget.width,
        height: widget.height,
        child: const Center(
          child: SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
    }
    return Image.network(
      _resolved,
      fit: widget.fit,
      width: widget.width,
      height: widget.height,
      headers: _headers,
      errorBuilder: widget.errorBuilder,
    );
  }
}
