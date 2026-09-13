# CAN-RIDE mobile (Passenger + Driver)

## Build APKs (always live + local)

```powershell
powershell -File mobile/scripts/build-apks.ps1 -InstallLive
```

Produces in `mobile/apks/`:

| APK | API |
|-----|-----|
| `can-go-passenger-live.apk` | `https://www.can-rides.ca/api` |
| `can-go-passenger-local.apk` | `http://<PC-LAN-IP>:4000/api` |
| `can-go-driver-live.apk` | production |
| `can-go-driver-local.apk` | LAN Nest |
| `can-go-*-release.apk` | copy of live (legacy name) |

Override local base:

```powershell
powershell -File mobile/scripts/build-apks.ps1 -LocalApiBase http://192.168.100.5:4000/api
```

## API base URL (manual)

Release defaults to production when no dart-define is set. Prefer explicit defines via the script above.

```bash
flutter build apk --release --dart-define=CANGO_API_BASE=https://www.can-rides.ca/api
flutter build apk --release --dart-define=CANGO_API_BASE=http://192.168.100.5:4000/api
```

Local APKs need Nest listening on `0.0.0.0:4000` (not only loopback) and the phone on the same Wi‑Fi. Cleartext HTTP is enabled in the Android manifests.

## Maps

Native Android/iOS maps use **OpenStreetMap** tiles (`flutter_map`) so map screens work without a Google Maps SDK Android key.

Address search / reverse geocode still go through Nest (`/api/maps/*`).

Optional Google Maps SDK key (legacy / future): put in gitignored `android/maps.properties`:

```properties
GOOGLE_MAPS_API_KEY=AIza…
```

## Google Sign-In (Passenger + Driver)

Production uses a real Google ID token (`serverClientId` from `/auth/oauth/config` — Web client in GCP project **can-ride**).

Android OAuth clients (same **can-ride** project) must exist for:

| App | Package |
|-----|---------|
| Passenger | `com.gettransfer.passenger` |
| Driver | `com.gettransfer.driver` |

OAuth consent Audience must be **In production** (Testing blocks all non–test-user Google accounts).

Debug SHA-1 (current release APKs still sign with the debug keystore):

```
93:41:5B:AA:74:13:D0:46:1F:58:6C:CD:3A:D9:F2:C0:D8:6F:89:EA
```

When you switch to a real release keystore / Play App Signing, add that SHA-1 as additional Android OAuth clients (or extra fingerprints) for both packages.
