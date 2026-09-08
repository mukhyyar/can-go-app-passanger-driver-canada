-- Optional PostGIS point columns for location tables (safe to re-run).
ALTER TABLE "DriverLocationCurrent"
  ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);

CREATE INDEX IF NOT EXISTS driver_location_current_geom_idx
  ON "DriverLocationCurrent" USING GIST (geom);

ALTER TABLE "TripLocationSample"
  ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);

CREATE INDEX IF NOT EXISTS trip_location_sample_geom_idx
  ON "TripLocationSample" USING GIST (geom);
