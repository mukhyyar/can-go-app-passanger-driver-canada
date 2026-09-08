import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/state/app_state.dart';
import 'package:provider/provider.dart';

class MapPickScreen extends StatelessWidget {
  const MapPickScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final existing = state.locationField == 'to' ? state.to : state.from;
    final pin = existing?.hasCoords == true
        ? existing!
        : MockData.places.first;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Choose on map'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
      ),
      body: Stack(
        children: [
          Positioned.fill(
            child: GtGoogleRouteMap(
              fromLat: pin.lat,
              fromLng: pin.lng,
              fromLabel: pin.label,
              height: double.infinity,
            ),
          ),
          Positioned(
            left: 16,
            right: 16,
            bottom: 24,
            child: SafeArea(
              child: GtGreenButton(
                label: 'Done',
                onPressed: () {
                  final app = context.read<AppState>();
                  final field = app.locationField;
                  // Use the pin currently shown on the map (existing coords /
                  // last selection) — never hardcode MockData.places.
                  final place = Place(
                    id: pin.id.isNotEmpty
                        ? pin.id
                        : 'pin-${pin.lat}-${pin.lng}',
                    label: pin.label.isNotEmpty
                        ? pin.label
                        : '${pin.lat.toStringAsFixed(5)}, ${pin.lng.toStringAsFixed(5)}',
                    lat: pin.lat,
                    lng: pin.lng,
                  );
                  if (Navigator.of(context).canPop()) {
                    Navigator.of(context).pop();
                  }
                  if (Navigator.of(context).canPop()) {
                    Navigator.of(context).pop();
                  } else {
                    context.go('/');
                  }
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    if (field == 'to') {
                      app.setTo(place);
                    } else {
                      app.setFrom(place);
                    }
                  });
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
