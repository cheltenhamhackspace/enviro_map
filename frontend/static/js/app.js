/**
 * Cheltenham Hackspace Environmental Monitoring Dashboard
 * Modern, clean, and fast frontend application
 */

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
    isLoading: false
};

// Dataset configuration
const DATASET_CONFIG = {
    pm1: { name: 'PM 1.0', unit: 'μg/m³', color: '#206bc4' },
    pm2_5: { name: 'PM 2.5', unit: 'μg/m³', color: '#d63939' },
    pm4: { name: 'PM 4.0', unit: 'μg/m³', color: '#f76707' },
    pm10: { name: 'PM 10', unit: 'μg/m³', color: '#ae3ec9' },
    voc: { name: 'VOC Index', unit: '', color: '#2fb344' },
    nox: { name: 'NOx Index', unit: '', color: '#fd7e14' }
};

// API endpoints
const API_BASE = 'https://map.cheltenham.space/api/v1';

// Utility functions
const Utils = {
    formatValue: (value, unit = '') => {
        if (!Number.isFinite(value)) return 'N/A';
        return `${value.toFixed(2)} ${unit}`.trim();
    },

    formatTimestamp: (timestamp) => {
        return new Date(timestamp).toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    },

    getPMColor: (pm2_5) => {
        if (!Number.isFinite(pm2_5)) return '#808080';
        if (pm2_5 <= 12) return '#2fb344'; // Good
        if (pm2_5 <= 35) return '#f76707'; // Moderate
        if (pm2_5 <= 55) return '#fd7e14'; // Unhealthy for sensitive
        if (pm2_5 <= 150) return '#d63939'; // Unhealthy
        return '#ae3ec9'; // Very unhealthy
    },

    debounce: (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    showNotification: (message, type = 'info') => {
        // Simple notification system
        const notification = document.createElement('div');
        notification.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        notification.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }
};

// Map functionality
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

// Chart management
const ChartManager = {
    init: () => {
        ChartManager.initParticulateChart();
        ChartManager.initTempHumChart();
        ChartManager.initAQIChart();
    },

    initParticulateChart: () => {
        const options = {
            chart: {
                height: 350,
                type: 'line',
                toolbar: {
                    show: true,
                    tools: {
                        download: true,
                        selection: true,
                        zoom: true,
                        zoomin: true,
                        zoomout: true,
                        pan: true,
                        reset: true,
                    },
                    autoSelected: 'zoom'
                },
                animations: {
                    enabled: true,
                    easing: 'easeinout',
                    speed: 800
                }
            },
            series: [],
            title: {
                text: 'Particulate Matter Levels',
                align: 'center',
                style: {
                    fontSize: '16px',
                    fontWeight: 600
                }
            },
            noData: {
                text: 'Select a sensor to display data',
                align: 'center',
                verticalAlign: 'middle',
                style: {
                    fontSize: '14px'
                }
            },
            xaxis: {
                type: 'datetime',
                labels: {
                    datetimeUTC: false
                }
            },
            yaxis: {
                title: {
                    text: 'Concentration (μg/m³)'
                }
            },
            tooltip: {
                x: {
                    format: 'dd MMM yyyy HH:mm:ss'
                },
                y: {
                    formatter: (value) => `${value.toFixed(2)} μg/m³`
                }
            },
            legend: {
                position: 'top'
            },
            stroke: {
                width: 2,
                curve: 'smooth'
            }
        };

        AppState.charts.particulate = new ApexCharts(document.querySelector("#timeChart"), options);
        AppState.charts.particulate.render();
    },

    initTempHumChart: () => {
        const options = {
            chart: {
                height: 350,
                type: 'line',
                toolbar: { show: true }
            },
            series: [],
            title: {
                text: 'Temperature and Humidity',
                align: 'center',
                style: {
                    fontSize: '16px',
                    fontWeight: 600
                }
            },
            noData: {
                text: 'Select a sensor to display data'
            },
            xaxis: {
                type: 'datetime',
                labels: {
                    datetimeUTC: false
                }
            },
            yaxis: [
                {
                    title: {
                        text: 'Temperature (°C)'
                    },
                    seriesName: 'Temperature'
                },
                {
                    opposite: true,
                    title: {
                        text: 'Relative Humidity (%)'
                    },
                    seriesName: 'Humidity'
                }
            ],
            tooltip: {
                x: {
                    format: 'dd MMM yyyy HH:mm:ss'
                }
            },
            stroke: {
                width: 2,
                curve: 'smooth'
            }
        };

        AppState.charts.tempHum = new ApexCharts(document.querySelector("#tempHumChart"), options);
        AppState.charts.tempHum.render();
    },

    initAQIChart: () => {
        const options = {
            chart: {
                height: 350,
                type: 'line',
                toolbar: { show: true }
            },
            series: [],
            title: {
                text: 'Air Quality Indices',
                align: 'center',
                style: {
                    fontSize: '16px',
                    fontWeight: 600
                }
            },
            noData: {
                text: 'Select a sensor to display data'
            },
            xaxis: {
                type: 'datetime',
                labels: {
                    datetimeUTC: false
                }
            },
            yaxis: {
                title: {
                    text: 'Index Value'
                }
            },
            tooltip: {
                x: {
                    format: 'dd MMM yyyy HH:mm:ss'
                }
            },
            stroke: {
                width: 2,
                curve: 'smooth'
            }
        };

        AppState.charts.aqi = new ApexCharts(document.querySelector("#aqiChart"), options);
        AppState.charts.aqi.render();
    },

    updateCharts: (data) => {
        if (!data || data.length === 0) {
            ChartManager.clearCharts();
            return;
        }

        ChartManager.updateParticulateChart(data);
        ChartManager.updateTempHumChart(data);
        ChartManager.updateAQIChart(data);
    },

    updateParticulateChart: (data) => {
        const seriesData = AppState.selectedDatasets
            .filter(dataset => ['pm1', 'pm2_5', 'pm4', 'pm10'].includes(dataset))
            .map(dataset => ({
                name: DATASET_CONFIG[dataset].name,
                data: data.map(entry => [entry.event_time, entry[dataset]]),
                color: DATASET_CONFIG[dataset].color
            }));

        AppState.charts.particulate.updateOptions({
            series: seriesData,
            title: { text: `${AppState.sensorName} - Particulate Matter` },
            xaxis: {
                min: Date.now() - AppState.timespan,
                max: Date.now()
            }
        });
    },

    updateTempHumChart: (data) => {
        AppState.charts.tempHum.updateOptions({
            series: [
                {
                    name: 'Temperature',
                    data: data.map(entry => [entry.event_time, entry.temperature]),
                    color: '#d63939'
                },
                {
                    name: 'Humidity',
                    data: data.map(entry => [entry.event_time, entry.relative_humidity]),
                    color: '#206bc4'
                }
            ],
            title: { text: `${AppState.sensorName} - Temperature & Humidity` },
            xaxis: {
                min: Date.now() - AppState.timespan,
                max: Date.now()
            }
        });
    },

    updateAQIChart: (data) => {
        AppState.charts.aqi.updateOptions({
            series: [
                {
                    name: 'VOC Index',
                    data: data.map(entry => [entry.event_time, entry.voc]),
                    color: '#2fb344'
                },
                {
                    name: 'NOx Index',
                    data: data.map(entry => [entry.event_time, entry.nox]),
                    color: '#fd7e14'
                }
            ],
            title: { text: `${AppState.sensorName} - Air Quality Indices` },
            xaxis: {
                min: Date.now() - AppState.timespan,
                max: Date.now()
            }
        });
    },

    clearCharts: () => {
        const noDataText = AppState.deviceId ? 'No data available' : 'Select a sensor to display data';
        
        AppState.charts.particulate.updateOptions({
            series: [],
            title: { text: AppState.sensorName || 'Particulate Matter Levels' },
            noData: { text: noDataText }
        });

        AppState.charts.tempHum.updateOptions({
            series: [],
            title: { text: AppState.sensorName ? `${AppState.sensorName} - Temperature & Humidity` : 'Temperature and Humidity' },
            noData: { text: noDataText }
        });

        AppState.charts.aqi.updateOptions({
            series: [],
            title: { text: AppState.sensorName ? `${AppState.sensorName} - Air Quality Indices` : 'Air Quality Indices' },
            noData: { text: noDataText }
        });
    }
};

// Data management
const DataManager = {
    async fetchSensors() {
        try {
            const response = await fetch(`${API_BASE}/sensors`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const sensors = await response.json();
            AppState.sensors = sensors;
            
            await DataManager.loadSensorMarkers(sensors);
            DataManager.updateSensorStatus(sensors);
            
        } catch (error) {
            console.error('Error loading sensors:', error);
            Utils.showNotification('Failed to load sensor data', 'danger');
        }
    },

    async loadSensorMarkers(sensors) {
        for (const sensor of Object.values(sensors)) {
            let latestData = {};
            let isUninitialised = false;
            let isInactive = false;

            try {
                const response = await fetch(`${API_BASE}/sensor/${sensor.device_id}/latest`);
                if (response.ok) {
                    latestData = await response.json();
                    
                    // Check if sensor is inactive (no data in last 2 hours)
                    const now = Date.now();
                    const dataTime = latestData.time ? new Date(latestData.time).getTime() : null;
                    isInactive = dataTime ? (now - dataTime) > 2 * 3600 * 1000 : false;
                    
                } else if (response.status === 404) {
                    isUninitialised = true;
                } else {
                    console.warn(`Error fetching data for sensor ${sensor.device_id}`);
                }
            } catch (error) {
                console.error(`Error fetching data for sensor ${sensor.device_id}:`, error);
            }

            DataManager.createSensorMarker(sensor, latestData, isInactive, isUninitialised);
        }
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

    handleSensorClick(e) {
        AppState.deviceId = e.target.options.device_id;
        AppState.sensorName = `Sensor: ${e.target.options.name}`;
        
        document.getElementById('downloadButton').disabled = false;
        DataManager.fetchSensorData();
        
        Utils.showNotification(`Selected ${AppState.sensorName}`, 'success');
    },

    async fetchSensorData() {
        if (!AppState.deviceId) return;

        AppState.isLoading = true;
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Loading...';
        }

        try {
            const response = await fetch(`${API_BASE}/sensor/${AppState.deviceId}?from=${Date.now() - AppState.timespan}`);
            
            if (response.status === 404) {
                ChartManager.clearCharts();
                Utils.showNotification('No data available for this sensor', 'warning');
            } else if (response.ok) {
                const data = await response.json();
                ChartManager.updateCharts(data);
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Error fetching sensor data:', error);
            ChartManager.clearCharts();
            Utils.showNotification('Error fetching sensor data', 'danger');
        } finally {
            AppState.isLoading = false;
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="me-1">
                        <polyline points="23,4 23,10 17,10"></polyline>
                        <polyline points="1,20 1,14 7,14"></polyline>
                        <path d="M20.49,9A9,9,0,0,0,5.64,5.64L1,10m22,4L18.36,18.36A9,9,0,0,1,3.51,15"></path>
                    </svg>
                    Refresh
                `;
            }
        }
    },

    updateSensorStatus(sensors) {
        const statusElement = document.getElementById('sensor-status');
        if (!statusElement) return;

        const total = Object.keys(sensors).length;
        const active = Object.values(sensors).filter(s => s.isActive).length;
        const inactive = total - active;
        const uninitialised = Object.values(sensors).filter(s => !s.hasOwnProperty('isActive')).length;

        statusElement.innerHTML = `
            <div class="d-flex justify-content-between mb-2 sensor-status-row" data-filter="active" style="cursor: pointer; padding: 4px; border-radius: 4px;" title="Click to show only active sensors">
                <span><span class="status-indicator status-active"></span>Active</span>
                <span class="fw-bold">${active}</span>
            </div>
            <div class="d-flex justify-content-between mb-2 sensor-status-row" data-filter="inactive" style="cursor: pointer; padding: 4px; border-radius: 4px;" title="Click to show only inactive sensors">
                <span><span class="status-indicator status-inactive"></span>Inactive</span>
                <span class="fw-bold">${inactive}</span>
            </div>
            <div class="d-flex justify-content-between mb-2 sensor-status-row" data-filter="all" style="cursor: pointer; padding: 4px; border-radius: 4px;" title="Click to show all sensors">
                <span>Total</span>
                <span class="fw-bold">${total}</span>
            </div>
            <div class="mt-3">
                <button class="btn btn-sm btn-outline-primary w-100" onclick="DataManager.centerMapOnSensors()" title="Center map on all sensors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="me-1">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="M21 21l-4.35-4.35"></path>
                    </svg>
                    Center Map
                </button>
            </div>
        `;

        // Add click event listeners to status rows
        statusElement.querySelectorAll('.sensor-status-row').forEach(row => {
            row.addEventListener('click', (e) => {
                const filter = e.currentTarget.dataset.filter;
                DataManager.filterSensorsByStatus(filter);
                
                // Visual feedback
                statusElement.querySelectorAll('.sensor-status-row').forEach(r => {
                    r.style.backgroundColor = '';
                });
                e.currentTarget.style.backgroundColor = 'rgba(32, 107, 196, 0.1)';
            });

            row.addEventListener('mouseenter', (e) => {
                if (!e.currentTarget.style.backgroundColor) {
                    e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                }
            });

            row.addEventListener('mouseleave', (e) => {
                if (e.currentTarget.style.backgroundColor === 'rgba(0, 0, 0, 0.05)') {
                    e.currentTarget.style.backgroundColor = '';
                }
            });
        });
    },

    filterSensorsByStatus(filter) {
        Object.values(AppState.sensors).forEach(sensor => {
            if (!sensor.marker) return;

            let shouldShow = true;
            if (filter === 'active') {
                shouldShow = sensor.isActive === true;
            } else if (filter === 'inactive') {
                shouldShow = sensor.isActive === false;
            }
            // 'all' shows everything

            if (shouldShow) {
                sensor.marker.addTo(AppState.map);
            } else {
                AppState.map.removeLayer(sensor.marker);
            }
        });

        const filterText = filter === 'all' ? 'all sensors' : `${filter} sensors`;
        Utils.showNotification(`Showing ${filterText}`, 'info');
    },

    centerMapOnSensors() {
        const visibleSensors = Object.values(AppState.sensors).filter(sensor => 
            sensor.marker && AppState.map.hasLayer(sensor.marker)
        );

        if (visibleSensors.length === 0) {
            Utils.showNotification('No sensors to center on', 'warning');
            return;
        }

        const bounds = L.latLngBounds(visibleSensors.map(sensor => [sensor.lat, sensor.long]));
        AppState.map.fitBounds(bounds, { padding: [20, 20] });
        Utils.showNotification('Map centered on visible sensors', 'success');
    }
};

// Event handlers
function toggleDataset(dataset) {
    const checkbox = document.getElementById(`${dataset}-toggle`);
    if (!checkbox) return;

    if (checkbox.checked) {
        if (!AppState.selectedDatasets.includes(dataset)) {
            AppState.selectedDatasets.push(dataset);
        }
    } else {
        AppState.selectedDatasets = AppState.selectedDatasets.filter(d => d !== dataset);
    }

    if (AppState.deviceId) {
        DataManager.fetchSensorData();
    }
}

function setTimespan(value) {
    AppState.timespan = parseInt(value);
    if (AppState.deviceId) {
        DataManager.fetchSensorData();
    }
}

function refreshData() {
    if (AppState.deviceId) {
        DataManager.fetchSensorData();
    } else {
        DataManager.fetchSensors();
    }
}

async function downloadSensorData() {
    if (!AppState.deviceId) {
        Utils.showNotification('Please select a sensor first', 'warning');
        return;
    }

    const downloadButton = document.getElementById('downloadButton');
    const originalText = downloadButton.innerHTML;
    
    try {
        downloadButton.disabled = true;
        downloadButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Downloading...';
        
        const response = await fetch(`${API_BASE}/sensor/${AppState.deviceId}?from=${Date.now() - AppState.timespan}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        const headers = ['Timestamp', 'Temperature', 'Relative Humidity', 'PM1', 'PM2.5', 'PM4', 'PM10', 'VOC Index', 'NOx Index'];
        const csvRows = [headers];

        data.forEach(row => {
            csvRows.push([
                new Date(row.event_time).toISOString(),
                row.temperature,
                row.relative_humidity,
                row.pm1,
                row.pm2_5,
                row.pm4,
                row.pm10,
                row.voc,
                row.nox
            ]);
        });

        const csvContent = csvRows.map(row => row.join(',')).join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `sensor_data_${AppState.deviceId}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        Utils.showNotification('Data downloaded successfully', 'success');
        
    } catch (error) {
        console.error('Error downloading data:', error);
        Utils.showNotification('Error downloading data. Please try again.', 'danger');
    } finally {
        downloadButton.disabled = false;
        downloadButton.innerHTML = originalText;
    }
}

function toggleHeatmap() {
    if (AppState.heatmapLayer) {
        AppState.map.removeLayer(AppState.heatmapLayer);
        AppState.heatmapLayer = null;
        Utils.showNotification('Heatmap disabled', 'info');
    } else {
        // Create heatmap from sensor data
        const heatData = Object.values(AppState.sensors)
            .filter(sensor => sensor.isActive && sensor.marker)
            .map(sensor => {
                const latestData = sensor.marker.options;
                return [sensor.lat, sensor.long, 0.5]; // You could use actual PM2.5 values here
            });

        if (heatData.length > 0) {
            AppState.heatmapLayer = L.heatLayer(heatData, {
                radius: 25,
                blur: 15,
                maxZoom: 17
            }).addTo(AppState.map);
            Utils.showNotification('Heatmap enabled', 'info');
        } else {
            Utils.showNotification('No active sensors for heatmap', 'warning');
        }
    }
}

function toggleMobileNav() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('show');
}

// Initialize dataset toggles
function initializeDatasetToggles() {
    ['pm1', 'pm2_5', 'pm4', 'pm10'].forEach(dataset => {
        const checkbox = document.getElementById(`${dataset}-toggle`);
        if (checkbox) {
            checkbox.addEventListener('change', () => toggleDataset(dataset));
            // Set initial state
            checkbox.checked = AppState.selectedDatasets.includes(dataset);
        }
    });
}

// Application initialization
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize components
        MapManager.init();
        ChartManager.init();
        initializeDatasetToggles();
        
        // Load initial data
        await DataManager.fetchSensors();
        
        // Set up periodic refresh (every 5 minutes)
        setInterval(() => {
            if (!AppState.isLoading) {
                DataManager.fetchSensors();
            }
        }, 5 * 60 * 1000);
        
        Utils.showNotification('Dashboard loaded successfully', 'success');
        
    } catch (error) {
        console.error('Error initializing application:', error);
        Utils.showNotification('Error loading dashboard', 'danger');
    }
});

// Handle mobile navigation clicks outside sidebar
document.addEventListener('click', (e) => {
    const sidebar = document.getElementById('sidebar');
    const toggleButton = document.querySelector('.mobile-nav-toggle');
    
    if (sidebar && sidebar.classList.contains('show') && 
        !sidebar.contains(e.target) && 
        !toggleButton.contains(e.target)) {
        sidebar.classList.remove('show');
    }
});

// Export for global access (if needed)
window.AppState = AppState;
window.refreshData = refreshData;
window.downloadSensorData = downloadSensorData;
window.toggleHeatmap = toggleHeatmap;
window.toggleMobileNav = toggleMobileNav;
window.setTimespan = setTimespan;
