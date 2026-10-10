import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';
import 'package:passenger/utils/device_geo.dart';
import 'package:provider/provider.dart';

class LocationScreen extends StatefulWidget {
  const LocationScreen({super.key});

  @override
  State<LocationScreen> createState() => _LocationScreenState();
}

class _LocationScreenState extends State<LocationScreen> {
  final _controller = TextEditingController();
  List<Place> _results = const [];
  Timer? _debounce;
  int _searchSeq = 0;
  bool _loading = false;
  String? _error;
  bool _locating = false;
  bool _showingHistory = true;
  bool _resolvingPick = false;
  String? _pickingId;

  /// Google Places session — one token per search→select cycle.
  late String _sessionToken;

  @override
  void initState() {
    super.initState();
    _sessionToken = PlacesSearch.newSessionToken();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _showHistory();
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _rotateSession() {
    _sessionToken = PlacesSearch.newSessionToken();
  }

  void _showHistory() {
    final history = context.read<AppState>().placeSearchHistory;
    setState(() {
      _loading = false;
      _error = null;
      _showingHistory = true;
      _results = List<Place>.from(history);
    });
  }

  void _onQueryChanged(String q) {
    setState(() {});
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 320), () => _search(q));
  }

  Future<void> _search(String q) async {
    final seq = ++_searchSeq;
    final trimmed = q.trim();
    if (trimmed.isEmpty) {
      if (!mounted || seq != _searchSeq) return;
      _showHistory();
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
      _showingHistory = false;
    });

    try {
      // Canada-wide search — no GPS / viewport bias params.
      final results = await context.read<AppState>().repo.searchPlaces(
            trimmed,
            sessionToken: _sessionToken,
          );
      if (!mounted || seq != _searchSeq) return;
      setState(() {
        _results = results;
        _loading = false;
      });
    } catch (_) {
      if (!mounted || seq != _searchSeq) return;
      setState(() {
        _loading = false;
        _error = 'Could not search places. Check your connection.';
        _results = const [];
      });
    }
  }

  Future<void> _retrySearch() async {
    final q = _controller.text.trim();
    if (q.isEmpty) {
      _showHistory();
      return;
    }
    await _search(q);
  }

  /// Expand/collapse common CA street abbreviations for geocode fallback.
  static String _expandStreetAbbrevs(String q) {
    const pairs = <String, String>{
      'dr': 'Drive',
      'drive': 'Dr',
      'st': 'Street',
      'street': 'St',
      'ave': 'Avenue',
      'avenue': 'Ave',
      'rd': 'Road',
      'road': 'Rd',
      'blvd': 'Boulevard',
      'boulevard': 'Blvd',
      'cres': 'Crescent',
      'crescent': 'Cres',
      'mr': 'Manor',
      'manor': 'Mr',
      'hwy': 'Highway',
      'highway': 'Hwy',
    };
    final parts = q.split(RegExp(r'(\s+|,\s*)'));
    var changed = false;
    final out = parts.map((tok) {
      if (tok.isEmpty || RegExp(r'^\s+$').hasMatch(tok) || tok.startsWith(',')) {
        return tok;
      }
      final bare = tok.replaceAll('.', '');
      final repl = pairs[bare.toLowerCase()];
      if (repl != null) {
        changed = true;
        return repl;
      }
      return tok;
    }).join();
    if (!changed) return q;
    return out.replaceAll(RegExp(r'\s+'), ' ').trim();
  }

  bool _looksLikeFullAddress(String q) {
    final t = q.trim();
    if (t.length < 8) return false;
    final hasNumber = RegExp(r'\d').hasMatch(t);
    final hasStreet = RegExp(
      r'\b(st|street|ave|avenue|rd|road|blvd|dr|drive|way|cres|crescent|lane|hwy|manor|mr)\b',
      caseSensitive: false,
    ).hasMatch(t);
    return hasNumber && (hasStreet || t.contains(','));
  }

  bool _isHighConfidenceMatch(String query, Place p) {
    // Ignore free-text stubs with no provider coords/placeId.
    if (!p.hasCoords && (p.placeId == null || p.placeId!.isEmpty)) {
      return false;
    }
    final hay = '${p.label} ${p.subtitle}'.toLowerCase();
    final q = query.toLowerCase().trim();
    final house = RegExp(r'^(\d+)\b').firstMatch(q)?.group(1);
    if (house != null && !RegExp('\\b$house\\b').hasMatch(hay)) return false;
    final postal = RegExp(r'\b([a-z]\d[a-z])\s*(\d[a-z]\d)\b', caseSensitive: false)
        .firstMatch(q);
    if (postal != null) {
      final compact = '${postal.group(1)}${postal.group(2)}'.toLowerCase();
      if (!hay.replaceAll(RegExp(r'\s+'), '').contains(compact)) return false;
    }
    // Street-type family agreement when user specified one.
    const families = <List<String>>[
      ['dr', 'drive'],
      ['st', 'street'],
      ['ave', 'avenue'],
      ['rd', 'road'],
      ['mr', 'manor'],
      ['blvd', 'boulevard'],
      ['cres', 'crescent'],
    ];
    for (final family in families) {
      final qHas = family.any((t) => RegExp('\\b$t\\b').hasMatch(q));
      if (!qHas) continue;
      final rHas = family.any((t) => RegExp('\\b$t\\b').hasMatch(hay));
      return rHas;
    }
    return house != null;
  }

  bool get _showUseTypedAddress {
    if (_showingHistory || _loading || _resolvingPick) return false;
    final q = _controller.text.trim();
    if (!_looksLikeFullAddress(q)) return false;
    if (_results.isEmpty) return true;
    return !_results.any((p) => _isHighConfidenceMatch(q, p));
  }

  Future<void> _useTypedAddress() async {
    final typed = _controller.text.trim();
    if (typed.isEmpty || _resolvingPick) return;
    setState(() {
      _resolvingPick = true;
      _pickingId = 'typed-address';
    });
    try {
      final expanded = _expandStreetAbbrevs(typed);
      Place? best;
      for (final q in {typed, expanded}) {
        final geos = await PlacesSearch.geocode(q);
        if (geos.isNotEmpty && geos.first.hasCoords) {
          best = geos.first;
          break;
        }
      }
      if (!mounted) return;
      if (best == null || !best.hasCoords) {
        setState(() {
          _resolvingPick = false;
          _pickingId = null;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Could not place that address. Try Choose on map.',
            ),
          ),
        );
        return;
      }
      // Keep the user's typed label; use provider coordinates only.
      final parts = typed.split(',');
      final label = parts.first.trim();
      final subtitle = parts.length > 1
          ? parts.sublist(1).join(',').trim()
          : best.subtitle;
      // Clear gate so _pick can run (it early-returns when resolving).
      setState(() {
        _resolvingPick = false;
        _pickingId = null;
      });
      await _pick(
        Place(
          id: best.id,
          label: label.isNotEmpty ? label : best.label,
          subtitle: subtitle,
          lat: best.lat,
          lng: best.lng,
          placeId: best.placeId,
        ),
      );
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _resolvingPick = false;
        _pickingId = null;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not place that address. Try Choose on map.'),
        ),
      );
    }
  }

  Future<void> _submitTyped() async {
    final q = _controller.text.trim();
    if (q.isEmpty) return;
    if (_results.isNotEmpty && !_loading) {
      await _pick(_results.first);
      return;
    }
    setState(() => _loading = true);
    final results = await context.read<AppState>().repo.searchPlaces(
          q,
          sessionToken: _sessionToken,
        );
    if (!mounted) return;
    setState(() {
      _results = results;
      _loading = false;
      _showingHistory = false;
    });
    if (results.isNotEmpty) {
      await _pick(results.first);
    } else {
      final geos = await PlacesSearch.geocode(q);
      if (geos.isNotEmpty && mounted) {
        await _pick(geos.first);
      }
    }
  }

  Future<void> _pick(Place place) async {
    if (_resolvingPick) return;
    final state = context.read<AppState>();
    final field = state.locationField;

    Place resolved = place;
    if (!place.hasCoords) {
      setState(() {
        _resolvingPick = true;
        _pickingId = place.id;
      });
      try {
        final detail = await state.repo.resolvePlaceDetails(
          place,
          sessionToken: _sessionToken,
        );
        if (!mounted) return;
        if (detail == null || !detail.hasCoords) {
          final query = place.subtitle.isNotEmpty
              ? '${place.label}, ${place.subtitle}'
              : place.label;
          final geos = await PlacesSearch.geocode(query);
          if (geos.isNotEmpty && geos.first.hasCoords) {
            resolved = Place(
              id: geos.first.id,
              label: place.label,
              subtitle: place.subtitle.isNotEmpty
                  ? place.subtitle
                  : geos.first.subtitle,
              lat: geos.first.lat,
              lng: geos.first.lng,
              placeId: geos.first.placeId ?? place.placeId,
            );
          } else {
            setState(() {
              _resolvingPick = false;
              _pickingId = null;
            });
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Could not resolve that place. Try another.'),
              ),
            );
            return;
          }
        } else {
          resolved = detail;
        }
      } catch (_) {
        if (!mounted) return;
        setState(() {
          _resolvingPick = false;
          _pickingId = null;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not resolve that place. Try another.'),
          ),
        );
        return;
      }
    }

    _rotateSession();

    // Pop first — addPlaceToSearchHistory notifies AppState, and GoRouter's
    // refreshListenable would cancel/undo the pop if history runs before navigate.
    if (Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    } else {
      context.go('/');
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (field == 'to') {
        state.setTo(resolved);
      } else {
        state.setFrom(resolved);
      }
      unawaited(state.addPlaceToSearchHistory(resolved));
    });
  }

  Future<void> _useCurrentLocation() async {
    setState(() => _locating = true);
    try {
      final coords = await readDeviceCoords();
      Place? place;
      if (coords != null) {
        place = await PlacesSearch.reverse(coords.$1, coords.$2);
      }
      if (!mounted) return;
      if (place == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Location permission needed — pick an address instead',
            ),
          ),
        );
        return;
      }
      await _pick(place);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not get current location')),
      );
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  IconData _iconFor(Place p) {
    final l = '${p.label} ${p.subtitle}'.toLowerCase();
    if (l.contains('airport') || l.contains('aerodrome')) return Icons.flight;
    if (l.contains('hotel') || l.contains('hostel') || l.contains('resort')) {
      return Icons.hotel;
    }
    if (l.contains('station') || l.contains('railway')) return Icons.train;
    // Street / house-number style rows
    if (RegExp(r'^\d+\s').hasMatch(p.label.trim()) ||
        RegExp(r'\b(st|ave|rd|blvd|dr|way|cres|lane|hwy)\b', caseSensitive: false)
            .hasMatch(l)) {
      return Icons.home_outlined;
    }
    return Icons.place_outlined;
  }

  /// Highlight case-insensitive occurrences of [query] inside [text].
  Widget _highlightedText(
    String text, {
    required String query,
    required TextStyle style,
    TextStyle? matchStyle,
  }) {
    final q = query.trim();
    if (q.isEmpty || _showingHistory) {
      return Text(text, style: style);
    }
    final lower = text.toLowerCase();
    final needle = q.toLowerCase();
    final spans = <TextSpan>[];
    var start = 0;
    while (true) {
      final idx = lower.indexOf(needle, start);
      if (idx < 0) {
        if (start < text.length) {
          spans.add(TextSpan(text: text.substring(start), style: style));
        }
        break;
      }
      if (idx > start) {
        spans.add(TextSpan(text: text.substring(start, idx), style: style));
      }
      spans.add(
        TextSpan(
          text: text.substring(idx, idx + needle.length),
          style: matchStyle ??
              style.copyWith(
                color: GtColors.orange,
                fontWeight: FontWeight.w700,
              ),
        ),
      );
      start = idx + needle.length;
    }
    if (spans.isEmpty) return Text(text, style: style);
    return Text.rich(TextSpan(children: spans));
  }

  @override
  Widget build(BuildContext context) {
    final query = _controller.text;
    final emptyMessage = _showingHistory
        ? 'No recent searches yet.\nSearch a Canadian address, airport, or hotel.'
        : 'No places found.\nTry a full address, postal code, or city in Canada.';

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.canPop() ? context.pop() : context.go('/'),
        ),
        titleSpacing: 0,
        title: Container(
          height: 40,
          margin: const EdgeInsets.only(right: 12),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: GtColors.bgGrey,
            borderRadius: BorderRadius.circular(8),
          ),
          child: TextField(
            controller: _controller,
            autofocus: true,
            textInputAction: TextInputAction.search,
            onSubmitted: (_) => _submitTyped(),
            decoration: InputDecoration(
              hintText: 'Search address, airport, hotel',
              border: InputBorder.none,
              suffixIcon: _controller.text.isEmpty
                  ? null
                  : IconButton(
                      icon: const Icon(Icons.close, size: 18),
                      onPressed: () {
                        _controller.clear();
                        _onQueryChanged('');
                      },
                    ),
            ),
            onChanged: _onQueryChanged,
          ),
        ),
      ),
      body: Column(
        children: [
          if (_loading || _locating || _resolvingPick)
            const LinearProgressIndicator(minHeight: 2),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      _error!,
                      style: const TextStyle(
                        color: Colors.redAccent,
                        fontSize: 13,
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: _loading ? null : _retrySearch,
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          if (_showingHistory && _results.isNotEmpty)
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Recent searches',
                  style: TextStyle(
                    color: GtColors.textSecondary,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          Expanded(
            child: _results.isEmpty && !_loading
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            emptyMessage,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: GtColors.textSecondary,
                            ),
                          ),
                          if (!_showingHistory && _error == null) ...[
                            const SizedBox(height: 12),
                            TextButton.icon(
                              onPressed: () => context.push('/map-pick'),
                              icon: const Icon(
                                Icons.place,
                                color: GtColors.orange,
                              ),
                              label: const Text('Choose on map'),
                            ),
                          ],
                        ],
                      ),
                    ),
                  )
                : ListView.separated(
                    itemCount:
                        _results.length + (_showUseTypedAddress ? 1 : 0),
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (_, i) {
                      if (_showUseTypedAddress && i == _results.length) {
                        final typed = _controller.text.trim();
                        final picking =
                            _pickingId == 'typed-address' && _resolvingPick;
                        return ListTile(
                          leading: picking
                              ? const SizedBox(
                                  width: 24,
                                  height: 24,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(
                                  Icons.edit_location_alt_outlined,
                                  color: GtColors.orange,
                                ),
                          title: const Text(
                            'Use typed address',
                            style: TextStyle(fontWeight: FontWeight.w600),
                          ),
                          subtitle: Text(
                            typed,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: GtColors.textSecondary,
                            ),
                          ),
                          onTap: _resolvingPick ? null : _useTypedAddress,
                        );
                      }
                      final p = _results[i];
                      final title = p.label.trim();
                      final subtitle = (p.subtitle.trim().isNotEmpty)
                          ? p.subtitle.trim()
                          : '';
                      final picking = _pickingId == p.id && _resolvingPick;
                      return ListTile(
                        leading: picking
                            ? const SizedBox(
                                width: 24,
                                height: 24,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : Icon(
                                _showingHistory
                                    ? Icons.history
                                    : _iconFor(p),
                                color: Colors.black87,
                              ),
                        title: _highlightedText(
                          title,
                          query: query,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        subtitle: subtitle.isEmpty
                            ? null
                            : _highlightedText(
                                subtitle,
                                query: query,
                                style: const TextStyle(
                                  color: GtColors.textSecondary,
                                ),
                              ),
                        onTap: _resolvingPick ? null : () => _pick(p),
                      );
                    },
                  ),
          ),
          const Divider(height: 1),
          SafeArea(
            top: false,
            child: SizedBox(
              height: 52,
              child: Row(
                children: [
                  Expanded(
                    child: TextButton.icon(
                      onPressed: (_locating || _resolvingPick)
                          ? null
                          : _useCurrentLocation,
                      icon: _locating
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.near_me, color: GtColors.orange),
                      label: const Text(
                        'Current location',
                        style: TextStyle(color: Colors.black87),
                      ),
                    ),
                  ),
                  Container(width: 1, height: 28, color: GtColors.border),
                  Expanded(
                    child: TextButton.icon(
                      onPressed: _resolvingPick
                          ? null
                          : () => context.push('/map-pick'),
                      icon: const Icon(Icons.place, color: GtColors.orange),
                      label: const Text(
                        'Choose on map',
                        style: TextStyle(color: Colors.black87),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
