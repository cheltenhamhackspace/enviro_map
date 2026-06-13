/**
 * Application state for the public map page
 */
export const AppState = {
    selectedDatasets: ['pm1', 'pm2_5'],
    timespan: 86400000, // 24 hours default
    deviceId: '',
    sensorName: '',
    map: null,
    charts: {
        particulate: null,
        tempHum: null,
        aqi: null
    },
    heatmapLayer: null,
    sensors: {},
    isLoading: false,
    cache: {
        sensors: null,
        sensorData: new Map(),
        lastFetch: new Map(),
        cacheDuration: 5 * 60 * 1000 // 5 minutes cache
    }
};
