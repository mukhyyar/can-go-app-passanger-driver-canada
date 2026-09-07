import 'dart:async';



import 'package:flutter/material.dart';

import 'package:go_router/go_router.dart';

import 'package:gt_mock/gt_mock.dart';

import 'package:gt_ui/gt_ui.dart';

import 'package:provider/provider.dart';



import '../../state/app_state.dart';



class LocationScreen extends StatefulWidget {

  const LocationScreen({super.key});



  @override

  State<LocationScreen> createState() => _LocationScreenState();

}



class _LocationScreenState extends State<LocationScreen> {

  final _query = TextEditingController();

  List<Place> _results = MockData.places;

  Timer? _debounce;

  int _searchSeq = 0;

  bool _loading = false;



  @override

  void dispose() {

    _debounce?.cancel();

    _query.dispose();

    super.dispose();

  }



  void _onQueryChanged(String q) {

    _debounce?.cancel();

    _debounce = Timer(const Duration(milliseconds: 320), () => _search(q));

  }



  Future<void> _search(String q) async {

    final seq = ++_searchSeq;

    final trimmed = q.trim();

    if (trimmed.isEmpty) {

      setState(() {

        _loading = false;

        _results = MockData.places;

      });

      return;

    }

    setState(() => _loading = true);

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

        _results = const [];

      });

    }

  }



  void _select(Place place) {
    context.read<AppState>().updateProfile(
          baseLocation: place.label,
          baseLatitude: place.hasCoords ? place.lat : null,
          baseLongitude: place.hasCoords ? place.lng : null,
        );
    context.go('/onboarding/zone');
  }

  void _selectLabel(String label, {double? lat, double? lng}) {
    context.read<AppState>().updateProfile(
          baseLocation: label,
          baseLatitude: lat,
          baseLongitude: lng,
        );
    context.go('/onboarding/zone');
  }



  @override

  Widget build(BuildContext context) {

    return Scaffold(

      body: SafeArea(

        child: Column(

          children: [

            Padding(

              padding: const EdgeInsets.fromLTRB(8, 8, 16, 8),

              child: Row(

                children: [

                  IconButton(

                    onPressed: () => context.pop(),

                    icon: const Icon(Icons.arrow_back),

                  ),

                  Expanded(

                    child: TextField(

                      controller: _query,

                      autofocus: true,

                      onChanged: _onQueryChanged,

                      textInputAction: TextInputAction.search,

                      onSubmitted: (v) async {
                        if (_results.isNotEmpty) {
                          _select(_results.first);
                          return;
                        }
                        final results =
                            await context.read<AppState>().repo.searchPlaces(v);
                        if (!mounted) return;
                        if (results.isNotEmpty) _select(results.first);
                      },

                      decoration: InputDecoration(

                        hintText: 'Base location of your transport',

                        contentPadding: const EdgeInsets.symmetric(

                          horizontal: 14,

                          vertical: 12,

                        ),

                        border: OutlineInputBorder(

                          borderRadius: BorderRadius.circular(10),

                          borderSide: const BorderSide(color: GtColors.border),

                        ),

                        enabledBorder: OutlineInputBorder(

                          borderRadius: BorderRadius.circular(10),

                          borderSide: const BorderSide(color: GtColors.border),

                        ),

                      ),

                    ),

                  ),

                ],

              ),

            ),

            if (_loading) const LinearProgressIndicator(minHeight: 2),

            Expanded(

              child: _results.isEmpty && !_loading

                  ? const Center(

                      child: Text(

                        'No places found.\nTry any city or address.',

                        textAlign: TextAlign.center,

                        style: TextStyle(color: GtColors.textSecondary),

                      ),

                    )

                  : ListView.separated(

                      itemCount: _results.length,

                      separatorBuilder: (_, __) => const Divider(height: 1),

                      itemBuilder: (_, i) {

                        final p = _results[i];

                        return ListTile(

                          leading: const Icon(Icons.place_outlined),

                          title: Text(p.label, maxLines: 2),

                          onTap: () => _select(p),

                        );

                      },

                    ),

            ),

            Container(

              decoration: const BoxDecoration(

                border: Border(top: BorderSide(color: GtColors.border)),

              ),

              child: Row(

                children: [

                  Expanded(

                    child: TextButton.icon(

                      onPressed: () => _selectLabel(
                        '9580 Jane St, Vaughan, ON L4H 2E8, Canada',
                        lat: 43.8341,
                        lng: -79.5373,
                      ),

                      icon: const Icon(Icons.near_me, color: GtColors.orange),

                      label: const Text(

                        'Current location',

                        style: TextStyle(color: Colors.black87),

                      ),

                    ),

                  ),

                  Container(width: 1, height: 40, color: GtColors.border),

                  Expanded(

                    child: TextButton.icon(

                      onPressed: () => context.push('/onboarding/map'),

                      icon: const Icon(Icons.location_on, color: GtColors.orange),

                      label: const Text(

                        'Choose on map',

                        style: TextStyle(color: Colors.black87),

                      ),

                    ),

                  ),

                ],

              ),

            ),

          ],

        ),

      ),

    );

  }

}


