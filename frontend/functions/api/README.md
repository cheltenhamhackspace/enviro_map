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
  created_at integer NOT NULL,
  owner text NOT NULL,
  lat real NOT NULL,
  long real NOT NULL,
  token text NOT NULL
);

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
