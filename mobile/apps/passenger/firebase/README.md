# Passenger Firebase client configs (`can-go-platform`)

| File | Use |
|------|-----|
| `../android/app/google-services.json` | Active Android build (matches `applicationId`, including `.prototype`) |
| `GoogleService-Info.plist` | Copy to `ios/Runner/` when the iOS folder is generated |
| `google-services.prod.json` / `google-services.prototype.json` | Reference copies |

Do not commit Admin SDK keys here — those live under repo `secrets/`.
