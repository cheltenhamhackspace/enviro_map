# enviro_map
A hackspace project to map the quality of our air

## Sensor Unit
### Hardware
| Manufacturer | Part No | Purpose | Quantity | Price |
|--------------|---------|---------|----------|-------|
| Sensirion    | [SEN55](https://www.digikey.co.uk/en/products/detail/sensirion-ag/SEN55-SDN-T/16342756?s=N4IgTCBcDaIM4FMB2BWFIC6BfIA)   | Primary Environmental Sensor | 1 | £31.02 |
| Sensirion    | [SEN5X JUMPER CABLE SET](https://www.digikey.co.uk/en/products/detail/sensirion-ag/SEN5X-JUMPER-6-PIN-JST-GHR-06V-S-CABLE-SET/20507225) | Environmental Sensor Breakout Cable | 1 | £10.53 |
| Raspberry Pi | [Pico W](https://www.digikey.co.uk/en/products/detail/raspberry-pi/SC0918/16608263)  | MCU     | 1 | £5.71 |

### Software
WIP (Likely Arduino)

## Front End
WIP (Preferably raw html/javascript)

[Demo](https://raw.githack.com/cheltenhamhackspace/enviro_map/main/frontend/wip-demo.html)

## Back End
WIP (AWS Lambda & DynamoDB?)

## TODO
- Everything
    - Security
    - CI?
- Frontend
    - Get actual latest readings for nodes
    - Get nodes within bounding box after settle time
    - ~~Make graphed dataset selectable~~
    - Make averages visible
    - Snazzy top banner (partially done)
    - Heatmap view
    - S3 hosting
    - Full refactor
        - Optimise number of API calls needed
- Backend
    - Stable and sensible API structure
        - Device Registration
        - Sensor Data
    - Full terraform refactor
- Sensor
    - Full refactor
    - Send averaged readings, not instantaneous
    - Prevent bad readings from being sent
        - Uninitialised sensor etc