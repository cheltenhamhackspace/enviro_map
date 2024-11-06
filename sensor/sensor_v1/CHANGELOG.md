# 0.1.1 (First official release)
- instantaneous readings, pretty bodgy
- Had bug where after ~1-6 hours the sensor would lock up

# 0.1.2 (Refactor and reliability)
- Major code rewrite and added comments everywhere
- Migrated from 5 min instantaneous to 5 minute average readings (~10 readings per second)
- Fixed 0.1.1 lock up bug. Memory would run out. Even though sensors on 0.1.0 or before were rock solid, this new one should make things more reliable than that.
- Reporting of firmware version (for feature tracking)
- Reporting of time since last reboot (the sensor gets re-initialised and has some settle in time for a few things, so its useful to know. Also identifies bad units if they reboot a lot)
- Reporting of the sensing elements serial number (for bad batch tracking)
- **Added a build script for bulk compiling sensor firmware when managing a fleet!**

# 0.1.3 (Update depreciated JSON function)
- What he said. Makes build output cleaner

# 0.1.4 (Report missing sensor)
- Report when a sensor cant communicate with the sensing element

# 0.1.5 (Print MAC address on startup)
- Make the sensor report the MAC address in the console when starting up