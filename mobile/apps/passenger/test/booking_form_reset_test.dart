import 'package:flutter_test/flutter_test.dart';
import 'package:gt_mock/gt_mock.dart';
import 'package:passenger/state/app_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('Booking Form Reset & Enquiry Separation Tests', () {
    test('resetBookingForm clears all composer inputs back to pristine default state', () {
      final state = AppState();

      // Simulate a passenger having configured an enquiry form
      state.from = const Place(
        id: 'place_1',
        label: '123 Main St, Toronto',
        lat: 43.6532,
        lng: -79.3832,
      );
      state.to = const Place(
        id: 'place_2',
        label: 'Pearson Airport Terminal 1',
        lat: 43.6777,
        lng: -79.6248,
      );
      state.comment = 'Handle luggage with care';
      state.flight = 'AC123';
      state.signage = 'Mr. Smith';
      state.promoCode = 'DISCOUNT10';
      state.promoEnabled = true;
      state.returnEnabled = true;
      state.returnDateTime = DateTime.now().add(const Duration(days: 2));
      state.returnFlight = 'AC456';
      state.adults = 3;
      state.childSeats = const ChildSeats(infant: 1, booster: 1);
      state.pickupNow = false;
      state.pickupDateTime = DateTime.now().add(const Duration(hours: 4));
      state.termsAccepted = true;
      state.perHourDurationMinutes = 120;
      state.perHourHasEnd = true;
      state.vehicleClassIds = {'sedan'};

      // Execute reset
      state.resetBookingForm();

      // Assert that all fields are pristine
      expect(state.from, isNull);
      expect(state.to, isNull);
      expect(state.comment, isEmpty);
      expect(state.flight, isEmpty);
      expect(state.signage, isEmpty);
      expect(state.promoCode, isEmpty);
      expect(state.promoEnabled, isFalse);
      expect(state.returnEnabled, isFalse);
      expect(state.returnDateTime, isNull);
      expect(state.returnFlight, isEmpty);
      expect(state.adults, equals(1));
      expect(state.childSeats.total, equals(0));
      expect(state.pickupNow, isTrue);
      expect(state.termsAccepted, isFalse);
      expect(state.perHourDurationMinutes, isNull);
      expect(state.perHourHasEnd, isFalse);
      expect(state.availableRoutes, isEmpty);
      expect(state.selectedRouteIndex, equals(0));
      expect(state.routeRecalcFailed, isFalse);
      expect(state.vehicleClassIds, equals(state.availableVehicleClasses.map((v) => v.id).toSet()));
    });

    test('resetBookingForm preserves active rides in repo.rides', () {
      final state = AppState();

      final existingRide = RideRequest(
        id: 'ride_active_1',
        datetimeLabel: 'Today, 14:00',
        from: '123 Main St',
        to: 'Airport',
        distance: '25 km',
        duration: '30 min',
        serverStatus: 'WAITING_FOR_OFFERS',
        status: RideStatus.waitingOffers,
      );
      state.repo.rides.add(existingRide);

      state.from = const Place(id: 'a', label: 'A', lat: 1, lng: 1);
      state.resetBookingForm();

      // Confirm the ride is completely untouched in repo.rides
      expect(state.repo.rides.length, equals(1));
      expect(state.repo.rides.first.id, equals('ride_active_1'));
      expect(state.repo.rides.first.serverStatus, equals('WAITING_FOR_OFFERS'));
    });

    test('activeWaitingEnquiry returns active WAITING_FOR_OFFERS or OFFER_SELECTION enquiries', () {
      final state = AppState();

      expect(state.activeWaitingEnquiry, isNull);

      final rideWaiting = RideRequest(
        id: 'ride_waiting',
        datetimeLabel: 'Today, 15:00',
        from: 'Downtown',
        to: 'Airport',
        distance: '20 km',
        duration: '25 min',
        serverStatus: 'WAITING_FOR_OFFERS',
        status: RideStatus.waitingOffers,
      );
      state.repo.rides.add(rideWaiting);

      expect(state.activeWaitingEnquiry?.id, equals('ride_waiting'));

      // Cancelled rides should not be returned as active waiting enquiries
      final rideCancelled = RideRequest(
        id: 'ride_cancelled',
        datetimeLabel: 'Yesterday, 10:00',
        from: 'A',
        to: 'B',
        distance: '10 km',
        duration: '15 min',
        serverStatus: 'CANCELLED',
        status: RideStatus.cancelled,
      );
      state.repo.rides.insert(0, rideCancelled);

      expect(state.activeWaitingEnquiry?.id, equals('ride_waiting'));
    });
  });
}
