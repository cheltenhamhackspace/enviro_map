/**
 * Map functionality for the Environmental Monitoring Dashboard
 */

const MapManager = {
    init: () => {
        AppState.map = L.map('map').setView([51.8994, -2.0783], 7);
        
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(AppState.map);

        // Add map event listeners
        AppState.map.on('zoomend moveend', Utils.debounce(() => {
            MapManager.updateVisibleSensors();
        }, 300));
    },

    createPopupContent: (sensor, data, isInactive, isUninitialised) => {
        if (isUninitialised) {
            return `
                <div class="sensor-popup">
                    <div class="status-banner uninitialised">Uninitialised Sensor</div>
                    <strong>${sensor.name || 'Unknown'}</strong>
                    <p class="mb-0 mt-2 text-muted">No data available for this sensor. It may be new to the system and hasn't sent any data yet.</p>
                </div>
            `;
        }

        const dataRows = [
            ['Name', sensor.name || 'Unknown'],
            ['Temperature', Utils.formatValue(data.temperature, '°C')],
            ['Relative Humidity', Utils.formatValue(data.relative_humidity, '%')],
            ['PM 1.0', Utils.formatValue(data.pm1, 'μg/m³')],
            ['PM 2.5', Utils.formatValue(data.pm2_5, 'μg/m³')],
            ['PM 4.0', Utils.formatValue(data.pm4, 'μg/m³')],
            ['PM 10', Utils.formatValue(data.pm10, 'μg/m³')],
            ['NOx Index', Number.isFinite(data.nox) ? data.nox : 'N/A'],
            ['VOC Index', Number.isFinite(data.voc) ? data.voc : 'N/A'],
            ['Last Updated', data.time ? Utils.formatTimestamp(data.time) : 'N/A']
        ];

        const tableRows = dataRows.map(([key, value]) => 
            `<tr><td class="fw-bold">${key}</td><td>${value}</td></tr>`
        ).join('');

        const banner = isInactive ? '<div class="status-banner inactive">Inactive Sensor</div>' : '';

        return `
            <div class="sensor-popup">
                ${banner}
                <div class="table-responsive">
                    <table class="table table-sm table-borderless">${tableRows}</table>
                </div>
            </div>
        `;
    },

    createSensorMarker(sensor, latestData, isInactive, isUninitialised) {
        const pm2_5Value = latestData.pm2_5;
        let displayText = '';
        
        const markerOptions = {
            radius: 12,
            device_id: sensor.device_id,
            name: sensor.name,
            weight: 2
        };

        if (isUninitialised) {
            displayText = 'New';
            markerOptions.color = '#000000';
            markerOptions.fillColor = '#6c757d';
            markerOptions.fillOpacity = 0.7;
        } else if (isInactive) {
            displayText = 'Offline';
            markerOptions.color = '#d63939';
            markerOptions.fillColor = '#f8d7da';
            markerOptions.fillOpacity = 0.7;
        } else {
            displayText = Number.isFinite(pm2_5Value) ? pm2_5Value.toFixed(1) : 'N/A';
            markerOptions.color = Utils.getPMColor(pm2_5Value);
            markerOptions.fillColor = Utils.getPMColor(pm2_5Value);
            markerOptions.fillOpacity = 0.8;
        }

        const marker = L.circleMarker([sensor.lat, sensor.long], markerOptions)
            .bindPopup(MapManager.createPopupContent(sensor, latestData, isInactive, isUninitialised), {
                maxWidth: 300,
                className: 'sensor-popup-container'
            })
            .bindTooltip(displayText, {
                direction: 'top',
                className: 'sensor-tooltip',
                permanent: false,
                opacity: 0.9
            })
            .addTo(AppState.map)
            .on('click', (e) => DataManager.handleSensorClick(e));

        // Store marker reference
        sensor.marker = marker;
        sensor.isActive = !isInactive && !isUninitialised;
    },

    updateVisibleSensors: () => {
        // Update sensor status in sidebar based on visible sensors
        const bounds = AppState.map.getBounds();
        let visibleCount = 0;
        let activeCount = 0;
        
        Object.values(AppState.sensors).forEach(sensor => {
            if (bounds.contains([sensor.lat, sensor.long])) {
                visibleCount++;
                if (sensor.isActive) activeCount++;
            }
        });

        // Update sidebar status if needed
        // This could be expanded to show more detailed statistics
    }
};
