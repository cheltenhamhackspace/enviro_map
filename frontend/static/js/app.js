/**
 * Cheltenham Hackspace Environmental Monitoring Dashboard
 * Main application file - OPTIMIZED VERSION
 */

// Check if user is logged in and update navigation
(function checkAuthAndUpdateNav() {
    const sessionToken = localStorage.getItem('enviro_session');
    const userEmail = localStorage.getItem('enviro_user_email');
    const loginLink = document.querySelector('a[href="./login.html"]');

    if (loginLink) {
        if (sessionToken && userEmail) {
            // User is logged in - change link to "My Dashboard"
            loginLink.href = './dashboard.html';
            loginLink.querySelector('.nav-link-title').textContent = 'My Dashboard';

            // Update icon to dashboard icon
            const icon = loginLink.querySelector('.nav-link-icon svg');
            if (icon) {
                icon.innerHTML = `
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                `;
            }
        }
    }
})();

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
    const newTimespan = parseInt(value);
    if (newTimespan !== AppState.timespan) {
        AppState.timespan = newTimespan;
        if (AppState.deviceId) {
            DataManager.fetchSensorData();
        }
    }
}

function refreshData() {
    // Clear relevant cache entries to force fresh data
    if (AppState.deviceId) {
        const cacheKey = `${AppState.deviceId}_${AppState.timespan}`;
        AppState.cache.sensorData.delete(cacheKey);
        AppState.cache.lastFetch.delete(cacheKey);
        DataManager.fetchSensorData();
    }
    
    // Also refresh sensor list
    AppState.cache.sensors = null;
    AppState.cache.lastFetch.delete('sensors');
    DataManager.fetchSensors();
    
    Utils.showNotification('Data refreshed', 'success');
}

function downloadData() {
    if (!AppState.deviceId) {
        Utils.showNotification('Please select a sensor first', 'warning');
        return;
    }

    const url = `${API_BASE}/sensor/${AppState.deviceId}/download?from=${Date.now() - AppState.timespan}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `sensor_${AppState.deviceId}_data.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    Utils.showNotification('Download started', 'success');
}

// Application initialization
function initializeApp() {
    // Initialize components
    MapManager.init();
    ChartManager.init();
    
    // Load initial data
    DataManager.fetchSensors();
    
    // Set up periodic cache cleanup
    setInterval(() => {
        DataManager.cleanupCache();
    }, 10 * 60 * 1000); // Every 10 minutes
    
    // Set up periodic data refresh for active sensor
    setInterval(() => {
        if (AppState.deviceId) {
            // Only refresh if cache is expired
            const cacheKey = `${AppState.deviceId}_${AppState.timespan}`;
            if (!DataManager.isCacheValid(cacheKey)) {
                DataManager.fetchSensorData();
            }
        }
    }, 2 * 60 * 1000); // Every 2 minutes
    
    console.log('Environmental Monitoring Dashboard initialized');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// Export functions for global access
window.toggleDataset = toggleDataset;
window.setTimespan = setTimespan;
window.refreshData = refreshData;
window.downloadData = downloadData;
