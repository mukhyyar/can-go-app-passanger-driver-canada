import 'mock_data.dart';
import 'models.dart';
import 'places_search.dart';

/// Mock service layer — replace with real API later.
class MockRepository {
  MockRepository._();
  static final MockRepository instance = MockRepository._();

  final PassengerProfile passenger = PassengerProfile();
  final DriverProfile driver = DriverProfile();

  final List<RideRequest> rides = [
    RideRequest(
      id: '25333913',
      datetimeLabel: 'Fri 4 Sept, 02:01',
      from: 'Toronto Pearson International Airport (YYZ), Silver Dart Drive, Mississauga, ON, Canada',
      to: 'Vancouver International Airport (YVR), Grant McConachie Way, Richmond, BC, Canada',
      distance: '4357 km',
      duration: '~ 39 h 16 min',
      status: RideStatus.chooseOffer,
      offerCount: 2,
    ),
    RideRequest(
      id: '25333909',
      datetimeLabel: 'Fri 4 Sept, 02:01',
      from: 'Airport Nürnberg (NUE), Flughafenstraße, Nuremberg-Nordwestliche Außenstadt, Germany',
      timeBadge: 'Fri 4 Sept, 05:01',
      status: RideStatus.waitingOffers,
    ),
    RideRequest(
      id: '25333893',
      datetimeLabel: 'Sat 26 Sept, 01:56',
      from: 'Toronto Pearson International Airport (YYZ), Silver Dart Drive, Mississauga, ON, Canada',
      to: 'Vancouver International Airport (YVR), Grant McConachie Way, Richmond, BC, Canada',
      distance: '4357 km',
      duration: '~ 39 h 16 min',
      status: RideStatus.waitingOffers,
      returnLabel: 'Fri 25 Dec, 01:55',
    ),
  ];

  List<DriverRequest> get newRequests => MockData.driverRequests();
  final List<DriverRequest> myOffers = [];

  List<Offer> offersFor(String requestId) => MockData.offersFor(requestId);

  RideRequest createRequest({
    required String from,
    String? to,
    String? timeBadge,
    String? returnLabel,
  }) {
    final id = '${25334000 + rides.length}';
    final req = RideRequest(
      id: id,
      datetimeLabel: 'Fri 4 Sept, 02:01',
      from: from,
      to: to,
      timeBadge: timeBadge,
      returnLabel: returnLabel,
      status: RideStatus.waitingOffers,
      distance: to != null ? '120 km' : null,
      duration: to != null ? '~ 1 h 30 min' : null,
    );
    rides.insert(0, req);
    Future.delayed(const Duration(seconds: 3), () {
      req.status = RideStatus.chooseOffer;
      req.offerCount = 3;
    });
    return req;
  }

  void selectOffer(String rideId, String offerId) {
    final ride = rides.cast<RideRequest?>().firstWhere(
          (r) => r?.id == rideId,
          orElse: () => null,
        );
    if (ride == null) return;
    ride.selectedOfferId = offerId;
    ride.status = RideStatus.booked;
  }

  void submitDriverOffer(String requestId, double price) {
    final src = newRequests.firstWhere((r) => r.id == requestId);
    myOffers.insert(
      0,
      DriverRequest(
        id: src.id,
        datetimeLabel: src.datetimeLabel,
        from: src.from,
        to: src.to,
        distance: src.distance,
        duration: src.duration,
        vehicleNeed: src.vehicleNeed,
        passengers: src.passengers,
        ttlLabel: src.ttlLabel,
        flightWait: src.flightWait,
        hasOffer: true,
        offerPrice: price,
      ),
    );
  }

  /// No canned suggestions — callers should show the user's own history.
  List<Place> suggestedPlaces() => const [];

  /// Live worldwide place search (Photon / OpenStreetMap).
  /// Falls back to filtered mock places if the network request fails.
  Future<List<Place>> searchPlaces(String q) async {
    final query = q.trim();
    if (query.isEmpty) return suggestedPlaces();

    try {
      final remote = await PlacesSearch.search(query);
      if (remote.isNotEmpty) return remote;
    } catch (_) {
      // Fall through to local filter.
    }

    final lower = query.toLowerCase();
    final local = MockData.places
        .where((p) => p.label.toLowerCase().contains(lower))
        .toList();
    if (local.isNotEmpty) return local;

    // Still allow free-text entry with unknown coords (map may be empty).
    return [
      Place(id: 'custom-${query.hashCode}', label: query),
    ];
  }
}
