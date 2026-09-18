import 'models.dart';

class MockData {
  static const places = <Place>[
    Place(
      id: 'yyz',
      label: 'Toronto Pearson International Airport (YYZ), Silver Dart Drive, Mississauga, ON, Canada',
      lat: 43.6777,
      lng: -79.6248,
    ),
    Place(
      id: 'yvr',
      label: 'Vancouver International Airport (YVR), Grant McConachie Way, Richmond, BC, Canada',
      lat: 49.1967,
      lng: -123.1815,
    ),
    Place(
      id: 'nue',
      label: 'Airport Nürnberg (NUE), Flughafenstraße, Nuremberg-Nordwestliche Außenstadt, Germany',
      lat: 49.4987,
      lng: 11.0783,
    ),
    Place(
      id: 'vaughan',
      label: '9580 Jane St, Vaughan, ON L4H 2E8, Canada',
      lat: 43.8341,
      lng: -79.5373,
    ),
    Place(
      id: 'cumberland',
      label: 'Cumberland St, Toronto, ON, Canada',
      lat: 43.6708,
      lng: -79.3910,
    ),
    Place(
      id: 'collingwood',
      label: 'Collingwood Bus Terminal, Collingwood, ON, Canada',
      lat: 44.5008,
      lng: -80.2167,
    ),
    Place(
      id: 'atlantis',
      label: 'Atlantis The Royal, Crescent Rd, Dubai',
      lat: 25.1304,
      lng: 55.1171,
    ),
    Place(
      id: 'dxb',
      label: 'Dubai International Airport (DXB), Dubai, UAE',
      lat: 25.2532,
      lng: 55.3657,
    ),
  ];

  static const vehicleClasses = <VehicleClass>[
    VehicleClass(
      id: 'economy',
      name: 'Economy',
      fromPrice: 'from CA\$22',
      imageAsset: 'assets/vehicles/economy.png',
    ),
    VehicleClass(
      id: 'comfort',
      name: 'Comfort',
      fromPrice: 'from CA\$35',
      imageAsset: 'assets/vehicles/comfort.png',
    ),
    VehicleClass(
      id: 'business',
      name: 'Business',
      fromPrice: 'from CA\$61',
      imageAsset: 'assets/vehicles/business.png',
    ),
    VehicleClass(
      id: 'premium',
      name: 'Premium',
      fromPrice: 'from CA\$95',
      imageAsset: 'assets/vehicles/premium.png',
    ),
    VehicleClass(
      id: 'vip',
      name: 'VIP',
      fromPrice: 'from CA\$140',
      imageAsset: 'assets/vehicles/vip.png',
    ),
    VehicleClass(
      id: 'suv',
      name: 'SUV',
      fromPrice: 'from CA\$75',
      imageAsset: 'assets/vehicles/suv.png',
    ),
    VehicleClass(
      id: 'van',
      name: 'Van',
      fromPrice: 'from CA\$85',
      imageAsset: 'assets/vehicles/van.png',
    ),
    VehicleClass(
      id: 'minibus',
      name: 'Minibus',
      fromPrice: 'from CA\$110',
      imageAsset: 'assets/vehicles/minibus.png',
    ),
    VehicleClass(
      id: 'bus',
      name: 'Bus',
      fromPrice: 'from CA\$160',
      imageAsset: 'assets/vehicles/bus.png',
    ),
  ];

  static const languages = [
    'English', 'Deutsch', 'Français', 'Italiano', 'Español', 'Português',
    'Nederlands', 'Русский', '简体中文', '繁體中文', 'العربية', 'Türkçe',
  ];

  /// Asset path in `gt_ui` for a vehicle class name/id, or null.
  static String? vehicleImageAsset(String classNameOrId) {
    final key = classNameOrId.trim().toLowerCase();
    for (final vc in vehicleClasses) {
      if (vc.id == key || vc.name.toLowerCase() == key) return vc.imageAsset;
    }
    return null;
  }

  static List<Offer> offersFor(String requestId) => [
        Offer(
          id: 'o1-$requestId',
          vehicleBrand: 'Kia',
          vehicleModel: 'EV9',
          vehicleClass: 'SUV',
          price: 8705,
          currency: 'CAD',
          rating: 0.6,
          ratingCount: 2,
          rides: 1,
          options: const ['Free Wi-Fi', 'Charger', 'Water'],
          languages: const ['EN', 'RU', 'UR', 'UK'],
          carrierId: '439529',
          passengers: 7,
          reviews: const [
            Review(stars: 5, text: 'Punctual driver', fromLanguage: 'French'),
          ],
        ),
        Offer(
          id: 'o2-$requestId',
          vehicleBrand: 'Toyota',
          vehicleModel: 'Camry',
          vehicleClass: 'Comfort',
          price: 4353,
          currency: 'CAD',
          rating: 5.0,
          ratingCount: 3,
          rides: 2,
          options: const ['Free Wi-Fi', 'Water'],
          languages: const ['EN', 'FR'],
          carrierId: '228441',
          passengers: 3,
          yearsWithPlatform: 2,
          reviews: const [
            Review(stars: 5, text: 'Punctual driver', fromLanguage: 'French'),
            Review(stars: 5, text: 'Clean car and polite'),
          ],
        ),
        Offer(
          id: 'o3-$requestId',
          vehicleBrand: 'Mercedes-Benz',
          vehicleModel: 'V-Class',
          vehicleClass: 'Van',
          price: 871.11,
          currency: 'CAD',
          rating: 4.9,
          ratingCount: 128,
          rides: 540,
          options: const ['Free Wi-Fi', 'Charger', 'Water', 'Air conditioner'],
          languages: const ['EN', 'AR'],
          carrierId: '100221',
          passengers: 6,
          yearsWithPlatform: 5,
        ),
      ];

  static List<DriverRequest> driverRequests() => const [
        DriverRequest(
          id: '25088082',
          datetimeLabel: 'Sun 6 Sept, 06:30',
          from: 'Cumberland St, Toronto, ON, Canada',
          to: 'Toronto Pearson International Airport (YYZ), Silver Dart Drive, Mississauga, ON, Canada',
          distance: '34 km',
          duration: '~ 44 min',
          vehicleNeed: 'Van, SUV',
          passengers: 2,
          ttlLabel: '15 min',
          fromLat: 43.6702,
          fromLng: -79.3915,
          toLat: 43.6777,
          toLng: -79.6248,
        ),
        DriverRequest(
          id: '25120504',
          datetimeLabel: 'Wed 9 Sept, 21:30',
          from: 'Toronto Pearson International Airport (YYZ), Silver Dart Drive, Mississauga, ON, Canada',
          to: 'Collingwood Bus Terminal, Collingwood, ON, Canada',
          distance: '128 km',
          duration: '~ 1 h 47 min',
          vehicleNeed: 'Economy',
          passengers: 1,
          ttlLabel: '5 min',
          flightWait: '60 min',
          fromLat: 43.6777,
          fromLng: -79.6248,
          toLat: 44.5008,
          toLng: -80.2167,
        ),
        DriverRequest(
          id: '25120999',
          datetimeLabel: 'Sun 6 Sept, 15:00 (8 h 30 min)',
          from: 'Airport Nürnberg (NUE), Flughafenstraße, Nuremberg, Germany',
          to: 'Munich Central Station, Munich, Germany',
          distance: '170 km',
          duration: '~ 1 h 50 min',
          vehicleNeed: 'Any',
          passengers: 3,
          ttlLabel: '15 min',
          fromLat: 49.4987,
          fromLng: 11.0780,
          toLat: 48.1402,
          toLng: 11.5583,
        ),
      ];

  static List<ChatThread> chats() => const [
        ChatThread(
          id: 'c1',
          title: 'Ride #25333913',
          lastMessage: 'I will wait at arrivals hall B.',
          time: 'Yesterday',
        ),
        ChatThread(
          id: 'c2',
          title: 'Support',
          lastMessage: 'How can we help you today?',
          time: 'Mon',
        ),
      ];
}
