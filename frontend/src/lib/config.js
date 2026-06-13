/**
 * Configuration and constants for the Environmental Monitoring Dashboard
 */

// Relative path: same origin in production AND local dev (the old absolute
// production URL made local development impossible)
export const API_BASE = '/api/v1';

// Dataset configuration
export const DATASET_CONFIG = {
    pm1: { name: 'PM 1.0', unit: 'μg/m³', color: '#206bc4' },
    pm2_5: { name: 'PM 2.5', unit: 'μg/m³', color: '#d63939' },
    pm4: { name: 'PM 4.0', unit: 'μg/m³', color: '#f76707' },
    pm10: { name: 'PM 10', unit: 'μg/m³', color: '#ae3ec9' },
    voc: { name: 'VOC Index', unit: '', color: '#2fb344' },
    nox: { name: 'NOx Index', unit: '', color: '#fd7e14' }
};
