# PARKED: WP4 — Hourly rollups for analysis endpoints

**Status: permanently parked (decision 2026-06-13).** Self-contained design,
ready to pick up if analysis-page read costs ever become a problem. Nothing
else in the codebase depends on this.

## Why it was designed (and why it's safe to park)

The analysis endpoints (statistics/compare/trends/spatial) aggregate raw
`sensor_readings` rows in SQL per request: a 30-day, 5-sensor query scans
~43k rows; statistics at 7 days scans ~10k per call (post-WP2). At the
measured traffic level (~120k rows read/week total, ~0.3 % of the D1 free
tier daily allowance) this is affordable — the WP2 fixes removed the
unbounded tail risks (availability scan, /latest history scan), and the edge
Cache Rule absorbs repeat traffic. Rollups become worth it when:

- analysis traffic grows materially (check the `rows_read` log lines /
  response meta added in WP1), or
- the active fleet grows (cost scales with sensors × range × visitors), or
- multi-month/year analysis views are wanted.

## Design (from rework plan §3.2, decisions Q4/Q8 applied)

### Table

```sql
CREATE TABLE IF NOT EXISTS sensor_readings_hourly (
  device_id    TEXT NOT NULL,
  hour_start   INTEGER NOT NULL,          -- ms epoch, floor(event_time/3600000)*3600000
  sample_count INTEGER NOT NULL DEFAULT 0,
  -- per metric m in {rh, temp, pm1, pm2_5, pm4, pm10, voc, nox}:
  --   m_sum REAL, m_sumsq REAL, m_min REAL, m_max REAL, m_count INTEGER
  rh_sum REAL,    rh_sumsq REAL,    rh_min REAL,    rh_max REAL,    rh_count INTEGER DEFAULT 0,
  temp_sum REAL,  temp_sumsq REAL,  temp_min REAL,  temp_max REAL,  temp_count INTEGER DEFAULT 0,
  pm1_sum REAL,   pm1_sumsq REAL,   pm1_min REAL,   pm1_max REAL,   pm1_count INTEGER DEFAULT 0,
  pm2_5_sum REAL, pm2_5_sumsq REAL, pm2_5_min REAL, pm2_5_max REAL, pm2_5_count INTEGER DEFAULT 0,
  pm4_sum REAL,   pm4_sumsq REAL,   pm4_min REAL,   pm4_max REAL,   pm4_count INTEGER DEFAULT 0,
  pm10_sum REAL,  pm10_sumsq REAL,  pm10_min REAL,  pm10_max REAL,  pm10_count INTEGER DEFAULT 0,
  voc_sum REAL,   voc_sumsq REAL,   voc_min REAL,   voc_max REAL,   voc_count INTEGER DEFAULT 0,
  nox_sum REAL,   nox_sumsq REAL,   nox_min REAL,   nox_max REAL,   nox_count INTEGER DEFAULT 0,
  PRIMARY KEY (device_id, hour_start)
) WITHOUT ROWID;
```

Sum/sumsq rather than avg because sums compose: `avg = sum/count` exactly,
`stddev = sqrt(sumsq/count − (sum/count)²)` exactly, and hourly rows
re-aggregate into daily/weekly buckets with plain `SUM()` in SQL — no daily
table needed (one rollup level only, deliberately).

### Maintenance — inline on ingest, no cron

Third statement in the ingest handler (`functions/api/v1/sensor/[sensorid].js`),
after the raw insert and the `sensor_latest` upsert, same pattern:

```sql
INSERT INTO sensor_readings_hourly (device_id, hour_start, sample_count,
  pm2_5_sum, pm2_5_sumsq, pm2_5_min, pm2_5_max, pm2_5_count, ...)
VALUES (?, ?, 1, ?, ?*?, ?, ?, (? IS NOT NULL), ...)
ON CONFLICT(device_id, hour_start) DO UPDATE SET
  sample_count = sample_count + 1,
  pm2_5_sum   = COALESCE(pm2_5_sum, 0) + COALESCE(excluded.pm2_5_sum, 0),
  pm2_5_sumsq = COALESCE(pm2_5_sumsq, 0) + COALESCE(excluded.pm2_5_sumsq, 0),
  pm2_5_min   = MIN(COALESCE(pm2_5_min, excluded.pm2_5_min), COALESCE(excluded.pm2_5_min, pm2_5_min)),
  pm2_5_max   = MAX(COALESCE(pm2_5_max, excluded.pm2_5_max), COALESCE(excluded.pm2_5_max, pm2_5_max)),
  pm2_5_count = pm2_5_count + (excluded.pm2_5_count),
  ...;
```

Wrapped in try/catch like the `sensor_latest` upsert: a failure must never
fail the sensor's request. NULL metrics contribute nothing (`COALESCE`).
Write overhead at current volume: ~576 extra row writes/day — negligible.

### Backfill — one-off, batched

```sql
INSERT INTO sensor_readings_hourly
SELECT device_id,
       (event_time / 3600000) * 3600000,
       COUNT(*),
       SUM(relative_humidity), SUM(relative_humidity*relative_humidity),
       MIN(relative_humidity), MAX(relative_humidity), COUNT(relative_humidity),
       ... per metric ...
FROM sensor_readings
WHERE event_time >= :batch_start AND event_time < :batch_end
GROUP BY 1, 2;
```

Batch by month via the `(device_id, event_time)` index to stay inside D1
statement limits. Reads every raw row once (~1M rows ≈ $0.001, one-off);
writes ~90k rows. Existing rows only read, never modified. Run the
migration + backfill BEFORE deploying endpoint code, same protocol as
WP3/WP5 (`npx wrangler d1 execute enviro-map-readings --remote --file=...`).

### Endpoint changes

- `statistics`: mean/min/max/count from rollup sums; **stddev exact in SQL**
  via sumsq; **percentiles approximated** from the sample-count-weighted
  distribution of hourly averages, payload flagged
  `"percentilesApproximate": true`, UI labels them (decision Q4). No raw-row
  pass at any range.
- `compare`/`trends`: same GROUP BY shapes against `sensor_readings_hourly`
  (hour buckets native; daily/weekly = re-aggregate hours). Trends drops
  `rawData` from the response; regression + moving averages stay;
  **seasonal-pattern and change-point detection deleted** (decision Q8) —
  note: still present in `src/pages/analysis/main.js` UI; remove the
  seasonal/changepoint panels at the same time.
- `spatial`: per-sensor aggregates from rollups (~2N + ~170/sensor).
- `GET /sensor/{id}?bucket=hour`: bucketed series for ranges >3 days
  (~12× fewer rows than raw).
- Rollout safety: a `?verify=1` debug mode on statistics comparing
  rollup-derived vs raw-derived results for a short range.

### Expected impact (for reference)

| Call | Rows read today | With rollups |
|---|---|---|
| statistics, 5 sensors, 7 d | ~10,000 | ~850 |
| trends, 5 sensors, 30 d | ~43,200 | ~3,600 |
| compare, 5 sensors, 7 d | ~10,000 | ~850 |

### Risk notes (why it was ranked riskiest)

Touches the frozen ingest path (additively); backfill must be re-runnable
(idempotent via DELETE + re-INSERT per batch range, or INSERT OR REPLACE);
rollup drift is recoverable by re-deriving any hour range from raw. Ship
alone, nothing else in the same deploy.
