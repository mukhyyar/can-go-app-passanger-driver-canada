import 'package:flutter_test/flutter_test.dart';
import 'package:passenger/state/app_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('Schedule conflict resolution and non-past validation tests', () {
    test('Pickup time cannot be set in the past', () {
      final state = AppState();
      final now = DateTime.now();
      final pastTime = now.subtract(const Duration(hours: 2));

      state.setPickupDateTime(pastTime);

      // Should be clamped to current time or later, not pastTime
      expect(state.pickupDateTime.isBefore(now.subtract(const Duration(minutes: 1))), isFalse);
    });

    test('Return date/time cannot be before pickup time or in the past', () {
      final state = AppState();
      state.setReturnEnabled(true);

      // Initial return time must be strictly after effective pickup
      expect(state.returnDateTime, isNotNull);
      expect(state.returnDateTime!.isAfter(state.effectivePickupDateTime), isTrue);

      // Attempt setting return time in the past
      final past = DateTime.now().subtract(const Duration(hours: 1));
      state.setReturnDateTime(past);
      expect(state.returnDateTime!.isBefore(DateTime.now()), isFalse);
      expect(state.returnDateTime!.isAfter(state.effectivePickupDateTime), isTrue);

      // Attempt setting return time before pickup time
      final pickup = DateTime.now().add(const Duration(days: 2));
      state.setPickupDateTime(pickup);
      state.setReturnDateTime(pickup.subtract(const Duration(hours: 1)));
      expect(state.returnDateTime!.isAfter(pickup), isTrue);
    });

    test('Updating pickup time automatically pushes conflicting return time forward', () {
      final state = AppState();
      final now = DateTime.now();

      // Set pickup today + 2 hours
      final pickup1 = now.add(const Duration(hours: 2));
      state.setPickupDateTime(pickup1);
      state.setReturnEnabled(true);

      // Return time should be around pickup1 + 3 hours
      expect(state.returnDateTime!.isAfter(pickup1), isTrue);

      // Now move pickup forward to 10 hours later (which would conflict with prior return time)
      final pickup2 = now.add(const Duration(hours: 10));
      state.setPickupDateTime(pickup2);

      // Return time must have been automatically adjusted to be after pickup2
      expect(state.returnDateTime!.isAfter(pickup2), isTrue);
      expect(state.returnDateTime!.difference(pickup2).inMinutes >= 30, isTrue);
    });

    test('Toggling pickupNow automatically adjusts return time if it conflicts', () {
      final state = AppState();
      final now = DateTime.now();

      // Set scheduled pickup tomorrow
      state.setPickupDateTime(now.add(const Duration(days: 1)));
      state.setReturnEnabled(true);

      // Switch back to pickupNow = true
      state.setPickupNow(true);
      expect(state.pickupNow, isTrue);
      expect(state.returnDateTime!.isAfter(DateTime.now()), isTrue);
    });

    test('Hourly booking ride ends automatically stays after pickup and not in the past', () {
      final state = AppState();
      final now = DateTime.now();

      state.setServiceType(ServiceType.perHour);
      state.setPickupDateTime(now.add(const Duration(hours: 2)));
      state.setPerHourDurationMinutes(60);

      expect(state.rideEndsDateTime, isNotNull);
      expect(state.rideEndsDateTime!.isAfter(state.effectivePickupDateTime), isTrue);

      // Move pickup forward
      final newPickup = now.add(const Duration(hours: 5));
      state.setPickupDateTime(newPickup);
      expect(state.rideEndsDateTime!.isAfter(newPickup), isTrue);
    });
  });
}
