import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gt_ui/gt_ui.dart';

void main() {
  testWidgets('GtGoogleRouteMap responsive overlay does not overlap badges on mobile width',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 328, // Standard card width on 360dp phone with 16dp margins
              height: 220,
              child: GtGoogleRouteMap(
                fromLat: 43.6532,
                fromLng: -79.3832,
                fromLabel: 'Toronto',
                toLat: 43.5890,
                toLng: -79.6441,
                toLabel: 'Mississauga',
                distanceLabel: '32.3 km × 2 · ~ 34 min × 2',
                height: 220,
                canExpand: false,
                interactive: false,
                onFullscreen: () {},
              ),
            ),
          ),
        ),
      ),
    );

    await tester.pumpAndSettle();

    final routeFinder = find.text('A → B route');
    final distanceFinder = find.text('32.3 km × 2 · ~ 34 min × 2');
    final fullscreenIconFinder = find.byIcon(Icons.fullscreen_rounded);

    expect(routeFinder, findsOneWidget);
    expect(distanceFinder, findsOneWidget);
    expect(fullscreenIconFinder, findsOneWidget);

    final routeRect = tester.getRect(routeFinder);
    final distanceRect = tester.getRect(distanceFinder);
    final fullscreenRect = tester.getRect(fullscreenIconFinder);

    // On constrained width (<520), distance badge drops cleanly to Row 2
    // so its top must be strictly below routeRect.bottom
    expect(
      distanceRect.top,
      greaterThanOrEqualTo(routeRect.bottom),
      reason: 'Distance badge must sit below the route badge to prevent horizontal collision',
    );

    // Fullscreen icon is aligned on Row 1 to the right of route badge
    expect(
      fullscreenRect.left,
      greaterThan(routeRect.right),
      reason: 'Fullscreen button must be to the right of the route badge',
    );
  });

  testWidgets('GtGoogleRouteMap single-row layout when ample width is available',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 600, // Tablet or wide screen
              height: 260,
              child: GtGoogleRouteMap(
                fromLat: 43.6532,
                fromLng: -79.3832,
                fromLabel: 'Toronto',
                toLat: 43.5890,
                toLng: -79.6441,
                toLabel: 'Mississauga',
                distanceLabel: '12 km · ~ 15 min',
                height: 260,
                canExpand: false,
                interactive: false,
                onFullscreen: () {},
              ),
            ),
          ),
        ),
      ),
    );

    await tester.pumpAndSettle();

    final routeFinder = find.text('A → B route');
    final distanceFinder = find.text('12 km · ~ 15 min');

    expect(routeFinder, findsOneWidget);
    expect(distanceFinder, findsOneWidget);

    final routeRect = tester.getRect(routeFinder);
    final distanceRect = tester.getRect(distanceFinder);

    // On wide screen, both badges fit side-by-side on Row 1 without vertical wrapping
    expect(
      (routeRect.top - distanceRect.top).abs(),
      lessThan(10.0),
      reason: 'Both badges must fit on the same horizontal row when space permits',
    );
    expect(
      distanceRect.left,
      greaterThan(routeRect.right),
      reason: 'Distance badge must be placed to the right of the route badge',
    );
  });
}
