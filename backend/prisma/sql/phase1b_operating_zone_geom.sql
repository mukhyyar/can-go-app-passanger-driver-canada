-- Phase 1b: PostGIS geometry for operating zones
-- Safe to re-run.

ALTER TABLE "OperatingZone"
  ADD COLUMN IF NOT EXISTS geom geometry(Geometry, 4326);

CREATE INDEX IF NOT EXISTS operating_zone_geom_idx
  ON "OperatingZone"
  USING GIST (geom);
