import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';
import 'package:passenger/utils/browser_geo.dart';
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

  @override
  void initState() {
    super.initState();
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
      final results = await context.read<AppState>().repo.searchPlaces(trimmed);
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

  Future<void> _submitTyped() async {
    final q = _controller.text.trim();
    if (q.isEmpty) return;
    if (_results.isNotEmpty && !_loading) {
      _pick(_results.first);
      return;
    }
    setState(() => _loading = true);
    final results = await context.read<AppState>().repo.searchPlaces(q);
    if (!mounted) return;
    setState(() {
      _results = results;
      _loading = false;
      _showingHistory = false;
    });
    if (results.isNotEmpty) _pick(results.first);
  }

  void _pick(Place place) {
    final state = context.read<AppState>();
    final field = state.locationField;
    unawaited(state.addPlaceToSearchHistory(place));
    // Apply after leaving this route so GoRouter refresh can't cancel pop.
    if (Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    } else {
      context.go('/');
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (field == 'to') {
        state.setTo(place);
      } else {
        state.setFrom(place);
      }
    });
  }

  Future<void> _useCurrentLocation() async {
    setState(() => _locating = true);
    try {
      Place? place;
      if (kIsWeb) {
        final coords = await readBrowserCoords();
        if (coords != null) {
          place = await PlacesSearch.reverse(coords.$1, coords.$2);
        }
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
      _pick(place);
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
    return Icons.place_outlined;
  }

  @override
  Widget build(BuildContext context) {
    final emptyMessage = _showingHistory
        ? 'No recent searches yet.\nSearch an address, airport, or hotel.'
        : 'No places found.\nTry a city, airport, or full address.';

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
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
          if (_loading || _locating)
            const LinearProgressIndicator(minHeight: 2),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
              child: Text(
                _error!,
                style: const TextStyle(color: Colors.redAccent, fontSize: 13),
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
                    child: Text(
                      emptyMessage,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: GtColors.textSecondary),
                    ),
                  )
                : ListView.separated(
                    itemCount: _results.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (_, i) {
                      final p = _results[i];
                      final parts = p.label.split(',');
                      final title = parts.first.trim();
                      final subtitle = parts.length > 1
                          ? parts.sublist(1).join(',').trim()
                          : p.subtitle;
                      return ListTile(
                        leading: Icon(
                          _showingHistory
                              ? Icons.history
                              : _iconFor(p),
                          color: Colors.black87,
                        ),
                        title: Text(
                          title,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        subtitle: subtitle.isEmpty
                            ? null
                            : Text(
                                subtitle,
                                style: const TextStyle(
                                  color: GtColors.textSecondary,
                                ),
                              ),
                        onTap: () => _pick(p),
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
                      onPressed: _locating ? null : _useCurrentLocation,
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
                      onPressed: () => context.push('/map-pick'),
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
