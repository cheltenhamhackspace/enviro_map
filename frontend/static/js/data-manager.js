/**
 * Data management with caching and optimization for the Environmental Monitoring Dashboard
 */

const DataManager = {
    // Check if cached data is still valid
    isCacheValid(key, cacheType = 'default') {
        const lastFetch = AppState.cache.lastFetch.get(key);
        if (!lastFetch) return false;
        
        const duration = cacheType === 'latest' ? 
            AppState.cache.latestCacheDuration : 
            AppState.cache.cacheDuration;
            
        return (Date.now() - lastFetch) < duration;
    },

    // Cache data with timestamp
    setCacheData(key, data, cacheType = 'default') {
        if (cacheType === 'latest') {
            AppState.cache.latestData.set(key, data);
        } else {
            AppState.cache.sensorData.set(key, data);
        }
        AppState.cache.lastFetch.set(key, Date.now());
    },

    // Get cached data
    getCacheData(key, cacheType = 'default') {
        return cacheType === 'latest' ? 
            AppState.cache.latestData.get(key) : 
            AppState.cache.sensorData.get(key);
    },

    async fetchSensors() {
        try {
            // Check cache first
            if (AppState.cache.sensors && DataManager.isCacheValid('sensors')) {
                AppState.sensors = AppState.cache.sensors;
                DataManager.updateSensorStatus(AppState.sensors);
                return;
            }

            const response = await fetch(`${API_BASE}/sensors`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const sensors = await response.json();
            AppState.sensors = sensors;
            AppState.cache.sensors = sensors;
            AppState.cache.lastFetch.set('sensors', Date.now());
            
            await DataManager.loadSensorMarkersOptimized(sensors);
            DataManager.updateSensorStatus(sensors);
            
        } catch (error) {
            console.error('Error loading sensors:', error);
            Utils.showNotification('Failed to load sensor data', 'danger');
        }
    },

    // Optimized version that batches requests and uses caching
    async loadSensorMarkersOptimized(sensors) {
        const sensorArray = Object.values(sensors);
        const batchSize = 5; // Process 5 sensors at a time to avoid overwhelming the API
        
        for (let i = 0; i < sensorArray.length; i += batchSize) {
            const batch = sensorArray.slice(i, i + batchSize);
            
            // Process batch in parallel
            await Promise.all(batch.map(async (sensor) => {
                let latestData = {};
                let isUninitialised = false;
                let isInactive = false;

                try {
                    // Check cache first
                    const cacheKey = `latest_${sensor.device_id}`;
                    if (DataManager.isCacheValid(cacheKey, 'latest')) {
                        latestData = DataManager.getCacheData(cacheKey, 'latest');
                    } else {
                        const response = await fetch(`${API_BASE}/sensor/${sensor.device_id}/latest`);
                        if (response.ok) {
                            latestData = await response.json();
                            DataManager.setCacheData(cacheKey, latestData, 'latest');
                        } else if (response.status === 404) {
                            isUninitialised = true;
                            DataManager.setCacheData(cacheKey, {}, 'latest');
                        } else {
                            console.warn(`Error fetching data for sensor ${sensor.device_id}`);
                        }
                    }
                    
                    // Check if sensor is inactive (no data in last 2 hours)
                    if (latestData.time) {
                        const now = Date.now();
                        const dataTime = new Date(latestData.time).getTime();
                        isInactive = (now - dataTime) > 2 * 3600 * 1000;
                    }
                    
                } catch (error) {
                    console.error(`Error fetching data for sensor ${sensor.device_id}:`, error);
                }

                MapManager.createSensorMarker(sensor, latestData, isInactive, isUninitialised);
            }));
            
            // Small delay between batches to be nice to the API
            if (i + batchSize < sensorArray.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
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

        // Check cache first
        const cacheKey = `${AppState.deviceId}_${AppState.timespan}`;
        if (DataManager.isCacheValid(cacheKey)) {
            const cachedData = DataManager.getCacheData(cacheKey);
            ChartManager.updateCharts(cachedData);
            return;
        }

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
                
                // Cache the data
                DataManager.setCacheData(cacheKey, data);
                
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
    },

    // Clear old cache entries to prevent memory leaks
    cleanupCache() {
        const now = Date.now();
        const maxAge = AppState.cache.cacheDuration * 2; // Keep cache for twice the duration
        
        for (const [key, timestamp] of AppState.cache.lastFetch.entries()) {
            if (now - timestamp > maxAge) {
                AppState.cache.lastFetch.delete(key);
                AppState.cache.sensorData.delete(key);
                AppState.cache.latestData.delete(key);
            }
        }
    }
};
