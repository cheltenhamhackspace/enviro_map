/**
 * Configuration and constants for the Environmental Monitoring Dashboard
 */

// API endpoints
const API_BASE = 'https://map.cheltenham.space/api/v1';

// Dataset configuration
const DATASET_CONFIG = {
    pm1: { name: 'PM 1.0', unit: 'μg/m³', color: '#206bc4' },
    pm2_5: { name: 'PM 2.5', unit: 'μg/m³', color: '#d63939' },
    pm4: { name: 'PM 4.0', unit: 'μg/m³', color: '#f76707' },
    pm10: { name: 'PM 10', unit: 'μg/m³', color: '#ae3ec9' },
    voc: { name: 'VOC Index', unit: '', color: '#2fb344' },
    nox: { name: 'NOx Index', unit: '', color: '#fd7e14' }
};

// Application state
const AppState = {
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
        latestData: new Map(),
        lastFetch: new Map(),
        cacheDuration: 5 * 60 * 1000, // 5 minutes cache
        latestCacheDuration: 2 * 60 * 1000 // 2 minutes for latest data
    }
};
