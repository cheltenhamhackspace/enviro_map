# 🌿 enviro_map

*Distributed air quality monitoring by Cheltenham Hackspace*

![Deployed on Cloudflare Pages](https://img.shields.io/badge/Deployed%20on-Cloudflare%20Pages-F38020?logo=cloudflare&logoColor=white)
![Live](https://img.shields.io/badge/Live-map.cheltenham.space-brightgreen)

> **[→ View Live Dashboard](https://map.cheltenham.space/)**

## About

enviro_map is a distributed environmental monitoring system created by [Cheltenham Hackspace](https://cheltenhamhackspace.org/) and [Cheltenham Borough Council](https://www.cheltenham.gov.uk/) with an initial goal of producing environmental data for use by local schools. Sensor nodes placed around the space collect air quality data and transmit it over WiFi to a cloud API. The data is then visualised on an interactive map dashboard with historical charts and heatmap views.

## Architecture

| Layer | Technology | Role |
|-------|------------|------|
| Sensor | Raspberry Pi Pico WH + Sensirion SEN55 | Collects air quality data over WiFi |
| Backend | Cloudflare Pages Functions + D1 (SQLite) | REST API and database |
| Frontend | Vanilla JS, Leaflet, ApexCharts | Interactive map dashboard |

## Tech Stack

**Sensors**
- Raspberry Pi Pico WH (RP2040, WiFi)
- Sensirion SEN55 (PM1/2.5/4/10, VOC, NOx, temperature, humidity)
- Arduino firmware with averaged readings

**Backend**
- Cloudflare Pages Functions (file-based routing)
- Cloudflare D1 (SQLite) for readings, users, and sensor registry
- Passwordless email authentication via JWT + MailChannels

**Frontend**
- Vanilla HTML/CSS/JavaScript — no build step
- [Leaflet](https://leafletjs.com/) + Leaflet.heat for the map and heatmap
- [ApexCharts](https://apexcharts.com/) for time-series charts
- [Tabler](https://tabler.io/) (Bootstrap-based) CSS framework

## Hardware BOM

### Sensor Unit

| Manufacturer | Part No | Purpose | Qty | Price |
|---|---|---|---|---|
| Sensirion | [SEN55](https://www.digikey.co.uk/en/products/detail/sensirion-ag/SEN55-SDN-T/16342756?s=N4IgTCBcDaIM4FMB2BWFIC6BfIA) | Primary Environmental Sensor | 1 | £31.02 |
| Sensirion | [SEN5X JUMPER CABLE SET](https://www.digikey.co.uk/en/products/detail/sensirion-ag/SEN5X-JUMPER-6-PIN-JST-GHR-06V-S-CABLE-SET/20507225) | Sensor Breakout Cable | 1 | £10.53 |
| Raspberry Pi | [Pico WH](https://www.digikey.co.uk/en/products/detail/raspberry-pi/SC0919/18713315?s=N4IgTCBcDaIE4EMDOAHARgUznAngAhQEsDCBjAezwHcALEAXQF8g) | MCU | 1 | £5.71 |

### Enclosure

[Likely this one for small and low cost](https://www.screwfix.com/p/british-general-ip55-weatherproof-outdoor-enclosure-75mm-x-53mm-x-85mm/33991)

## Development

### Sensor Firmware

```bash
cd sensor/sensor_v1
cp node_credentials.csv.example node_credentials.csv
# Fill in SENSORNAME, STASSID, STAPSK, UUID for each node
./build.sh
```

Compiled `.uf2` files are written to `./build/out/`. Builds run in batches of 8.

### Frontend

```bash
cd frontend
python -m http.server 8000
```

Then open `http://localhost:8000`. No build step required.

### Backend

The API functions in `frontend/functions/api/` deploy automatically alongside the frontend to Cloudflare Pages. Local testing requires `wrangler` with a D1 binding configured.

## TODO

- Everything
    - ~~Security~~
    - CI?
- Frontend
    - ~~Get actual latest readings for nodes~~
    - ~~Get nodes within bounding box after settle time~~
    - ~~Make graphed dataset selectable~~
    - Make averages visible
    - ~~Snazzy top banner~~
    - ~~Heatmap view~~
    - ~~Full refactor~~
        - ~~Optimise number of API calls needed~~
- Backend
    - Stable and ~~sensible API structure~~
        - ~~Device Registration~~
        - ~~Sensor Data~~
        - ~~Make graph timescales selectable~~
    - Full terraform refactor
- Sensor
    - ~~Full refactor~~
    - ~~Send averaged readings, not instantaneous~~
    - Prevent bad readings from being sent
        - Uninitialised sensor etc
