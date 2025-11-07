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
  nox real,
  uptime integer,
  version text
);
CREATE INDEX idx_sensor_readings_device_id_event_time ON sensor_readings(device_id, event_time);

### Possible alternative indexes, NOT IN USE
CREATE INDEX idx_sensor_readings_event_time_device_id ON sensor_readings(event_time, device_id);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_event_time_device_id ON sensor_readings(event_time, device_id);
CREATE INDEX IF NOT EXISTS idx_sensors_lat_long ON sensors(lat, long);
CREATE INDEX idx_sensor_readings_event_time ON sensor_readings(event_time);
CREATE INDEX idx_sensor_readings_device_id ON sensor_readings(device_id);

## Users
CREATE TABLE IF NOT EXISTS users (
  id integer PRIMARY KEY AUTOINCREMENT,
  email text UNIQUE NOT NULL,
  created_at integer NOT NULL,
  last_login integer,
  email_verified integer DEFAULT 0
);
CREATE INDEX idx_users_email ON users(email);

## Sensors
CREATE TABLE IF NOT EXISTS sensors (
  id integer PRIMARY KEY AUTOINCREMENT,
  device_id text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at integer NOT NULL,
  owner text NOT NULL,
  lat real NOT NULL,
  long real NOT NULL,
  token text UNIQUE NOT NULL,
  private integer NOT NULL,
  active integer NOT NULL,
  user_id integer,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_sensors_device_id ON sensors(device_id);
CREATE INDEX idx_sensors_token ON sensors(token);
CREATE INDEX idx_sensors_user_id ON sensors(user_id);

## Get total number of sensors
SELECT COUNT(device_id) AS sensors FROM sensors WHERE active = 1 AND private = 0

# Email sending
Using Cloudflare and MailChannels
https://developers.cloudflare.com/pages/functions/plugins/mailchannels/
https://developers.cloudflare.com/pages/functions/plugins/mailchannels/#enable-mailchannels-for-your-account---domain-lockdown
## DNS records


# JWT support

## Key generation
### RSA
```openssl genrsa -out privatekey.pem 2048```
```openssl rsa -in privatekey.pem -pubout -out publickey.pem```

### ED25519 (what we use)
```openssl genpkey -algorithm ed25519 -out private.pem```
```openssl pkey -in private.pem -pubout -out public.pem```

## Key use
Set the private key and public keys contents as an environment variable
