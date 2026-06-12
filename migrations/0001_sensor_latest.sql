-- WP3 (rework plan §3.1): sensor_latest — newest reading per device.
-- Additive only: creates one new table and backfills it by READING existing
-- sensor_readings rows. No existing data is modified or deleted.
--
-- Run BEFORE deploying the WP3 code:
--   wrangler d1 execute <DB_NAME> --remote --file=migrations/0001_sensor_latest.sql
--
-- The backfill scans the readings table once (~1.5-2M rows read, one-off).
-- If the single statement hits D1 statement limits, fall back to running the
-- INSERT once per device_id with `WHERE device_id = '...'` added.

CREATE TABLE IF NOT EXISTS sensor_latest (
  device_id         TEXT PRIMARY KEY,
  event_time        INTEGER NOT NULL,
  relative_humidity REAL,
  temperature       REAL,
  pm1               REAL,
  pm2_5             REAL,
  pm4               REAL,
  pm10              REAL,
  voc               REAL,
  nox               REAL
) WITHOUT ROWID;

-- Bare columns alongside MAX() come from the max-event_time row per group
-- (documented SQLite behaviour).
INSERT OR REPLACE INTO sensor_latest
  (device_id, event_time, relative_humidity, temperature, pm1, pm2_5, pm4, pm10, voc, nox)
SELECT device_id, MAX(event_time), relative_humidity, temperature, pm1, pm2_5, pm4, pm10, voc, nox
FROM sensor_readings
GROUP BY device_id;
