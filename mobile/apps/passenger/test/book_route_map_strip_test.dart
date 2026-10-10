import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:gt_ui/gt_ui.dart';
import 'package:passenger/screens/book/route_map_adjust_bar.dart';
import 'package:passenger/screens/book/route_map_controls.dart';
import 'package:passenger/state/app_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues({});

  group('AppState route booking integrity', () {
    test('blocks submit without authoritative driving route', () {
      final state = AppState();
      state.setFrom(MockData.places.first);
      state.setTo(MockData.places.last);
      expect(state.canSubmitWithCurrentRoute, isFalse);
      expect(state.hasAuthoritativeDrivingRoute, isFalse);
    });

    test('allows submit when selected route has positive distance', () {
      final state = AppState();
      state.setFrom(MockData.places.first);
      state.setTo(MockData.places.last);
      state.setAvailableRoutes(const [
        GtRouteOption(
          id: 'r1',
          summary: 'Via Hwy 2 S',
          distanceKm: 12.4,
          durationMin: 18,
          isFastest: true,
        ),
        GtRouteOption(
          id: 'r2',
          summary: 'Via AB-201 S',
          distanceKm: 13.1,
          durationMin: 22,
        ),
      ]);
      expect(state.hasAuthoritativeDrivingRoute, isTrue);
      expect(state.canSubmitWithCurrentRoute, isTrue);
      expect(state.selectedRoute?.distanceKm, 12.4);
    });

    test('rejects synthetic zero-distance and failed recalc', () {
      final state = AppState();
      state.setFrom(MockData.places.first);
      state.setTo(MockData.places.last);
      state.setAvailableRoutes(const [
        GtRouteOption(
          id: 'fallback_0',
          summary: 'Direct route',
          distanceKm: 0,
          durationMin: 0,
          isFastest: true,
        ),
      ]);
      expect(state.hasAuthoritativeDrivingRoute, isFalse);
      expect(state.canSubmitWithCurrentRoute, isFalse);

      state.setAvailableRoutes(const []);
      state.setRouteRecalcFailed(true);
      expect(state.canSubmitWithCurrentRoute, isFalse);
    });

    test('setFrom clears routes and recalc failure flag', () {
      final state = AppState();
      state.setFrom(MockData.places.first);
      state.setTo(MockData.places.last);
      state.setAvailableRoutes(const [
        GtRouteOption(
          id: 'r1',
          summary: 'Via Hwy 2 S',
          distanceKm: 10,
          durationMin: 15,
        ),
      ]);
      state.setRouteRecalcFailed(true);
      state.setFrom(MockData.places.first);
      expect(state.availableRoutes, isEmpty);
      expect(state.routeRecalcFailed, isFalse);
    });

    test('per-hour without dropoff does not require driving route', () {
      final state = AppState();
      state.setServiceType(ServiceType.perHour);
      state.setFrom(MockData.places.first);
      expect(state.canSubmitWithCurrentRoute, isTrue);
    });
  });

  group('RouteMapAdjustBar', () {
    testWidgets('Cancel invokes callback; Confirm disabled while geocoding',
        (tester) async {
      var cancelled = false;
      var confirmed = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: RouteMapAdjustBar(
              title: 'Adjust pickup',
              addressLabel: 'Searching address…',
              geocoding: true,
              confirming: false,
              onConfirm: () => confirmed = true,
              onCancel: () => cancelled = true,
            ),
          ),
        ),
      );

      expect(find.text('Confirm location'), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await tester.pump();
      expect(cancelled, isTrue);

      // Confirm is disabled while geocoding.
      await tester.tap(find.text('Confirm location'));
      await tester.pump();
      expect(confirmed, isFalse);
    });

    testWidgets('Confirm works when ready', (tester) async {
      var confirmed = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: RouteMapAdjustBar(
              title: 'Adjust drop-off',
              addressLabel: '123 Main St',
              geocoding: false,
              confirming: false,
              onConfirm: () => confirmed = true,
              onCancel: () {},
            ),
          ),
        ),
      );
      await tester.tap(find.text('Confirm location'));
      await tester.pump();
      expect(confirmed, isTrue);
    });
  });

  group('RouteMapControls', () {
    testWidgets('fires recenter / zoom / adjust callbacks', (tester) async {
      final hits = <String>[];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: RouteMapControls(
              onRecenter: () => hits.add('recenter'),
              onZoomIn: () => hits.add('in'),
              onZoomOut: () => hits.add('out'),
              onAdjustPickup: () => hits.add('pickup'),
              onAdjustDropoff: () => hits.add('drop'),
            ),
          ),
        ),
      );

      await tester.tap(find.byIcon(Icons.center_focus_strong_rounded));
      await tester.tap(find.byIcon(Icons.add_rounded));
      await tester.tap(find.byIcon(Icons.remove_rounded));
      await tester.tap(find.byIcon(Icons.trip_origin_rounded));
      await tester.tap(find.byIcon(Icons.flag_rounded));
      await tester.pump();

      expect(hits, ['recenter', 'in', 'out', 'pickup', 'drop']);
    });
  });
}
