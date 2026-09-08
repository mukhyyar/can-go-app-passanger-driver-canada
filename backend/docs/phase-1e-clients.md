# Phase 1e — Client consumers

Clients now call Phase 1a–1d Nest APIs.

## Flutter (`gt_api`)

- JWT + refresh in secure storage / prefs fallback
- Passenger: pricing quote → rides → select-offer → payments/intents
- Driver: `/driver/documents` multipart, vehicles, operating-zones, `/driver/requests`, offers, trip transitions helpers

## Web

- Passenger Web `:3002` — auth + rides list
- Admin Ops `:3001` — `/admin/drivers/kyc`, document review, activate

See [`docs/phase-1e.md`](../../docs/phase-1e.md).
