# Database structure

## Sensor readings
CREATE TABLE IF NOT EXISTS sensor_readings (
  id integer PRIMARY KEY AUTOINCREMENT,
  device_id text NOT NULL,
  event_time integer NOT NULL,
  relative_humidity real,
  temperature real,
  pm1 real,
  pm2_5 real,
  pm4 real,
  pm10 real,
  voc real,
  nox real
);
CREATE INDEX idx_sensor_readings_device_id_event_time ON sensor_readings(device_id, event_time);

### Possible alternative indexes, NOT IN USE
CREATE INDEX idx_sensor_readings_event_time_device_id ON sensor_readings(event_time, device_id);
CREATE INDEX idx_sensor_readings_event_time ON sensor_readings(event_time);
CREATE INDEX idx_sensor_readings_device_id ON sensor_readings(device_id);

## Sensors
CREATE TABLE IF NOT EXISTS sensors (
  id integer PRIMARY KEY AUTOINCREMENT,
  device_id text NOT NULL,
  name text NOT NULL,
  created integer NOT NULL,
  owner text NOT NULL,
  lat real NOT NULL,
  long real NOT NULL,
  token text NOT NULL
);