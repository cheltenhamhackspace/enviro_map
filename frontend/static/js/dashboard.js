/**
 * Dashboard JavaScript
 * Manages user's sensor registration and viewing
 */

const API_BASE = '/api/v1';
let sessionToken = null;
let userEmail = null;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    sessionToken = localStorage.getItem('enviro_session');
    userEmail = localStorage.getItem('enviro_user_email');

    if (!sessionToken || !userEmail) {
        // Not logged in, redirect to login
        window.location.href = './login.html';
        return;
    }

    // Display user email
    document.getElementById('userEmail').textContent = userEmail;

    // Load sensors
    await loadSensors();

    // Set up event listeners
    document.getElementById('submitRegisterBtn').addEventListener('click', handleSensorRegistration);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
});

/**
 * Load user's sensors from API
 */
async function loadSensors() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    const noSensors = document.getElementById('noSensors');
    const sensorsGrid = document.getElementById('sensorsGrid');

    try {
        const response = await fetch(`${API_BASE}/sensors/my-sensors`, {
            headers: {
                'Authorization': `Bearer ${sessionToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 401) {
            // Token expired or invalid
            handleLogout();
            return;
        }

        if (!response.ok) {
            throw new Error('Failed to load sensors');
        }

        const data = await response.json();
        loadingIndicator.classList.add('d-none');

        if (data.sensors.length === 0) {
            noSensors.classList.remove('d-none');
        } else {
            sensorsGrid.classList.remove('d-none');
            renderSensors(data.sensors);
        }

    } catch (error) {
        console.error('Error loading sensors:', error);
        loadingIndicator.classList.add('d-none');
        showAlert('Failed to load sensors. Please try refreshing the page.', 'danger');
    }
}

/**
 * Render sensors in grid
 */
function renderSensors(sensors) {
    const sensorsGrid = document.getElementById('sensorsGrid');
    sensorsGrid.innerHTML = '';

    sensors.forEach(sensor => {
        const activeStatus = sensor.active ?
            '<span class="status-badge badge bg-success">Active</span>' :
            '<span class="status-badge badge bg-secondary">Inactive</span>';

        const privateStatus = sensor.private ?
            '<span class="status-badge badge bg-warning">Private</span>' :
            '<span class="status-badge badge bg-info">Public</span>';

        const createdDate = new Date(sensor.created_at).toLocaleDateString();

        const card = document.createElement('div');
        card.className = 'col-md-6 col-lg-4';
        card.innerHTML = `
            <div class="card sensor-card">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-3">
                        <h3 class="card-title mb-0">${escapeHtml(sensor.name)}</h3>
                        <div>
                            ${activeStatus}
                            ${privateStatus}
                        </div>
                    </div>
                    <div class="mb-2">
                        <strong>Device ID:</strong><br>
                        <code>${escapeHtml(sensor.device_id)}</code>
                    </div>
                    <div class="mb-2">
                        <strong>Location:</strong><br>
                        ${sensor.lat.toFixed(6)}, ${sensor.long.toFixed(6)}
                    </div>
                    <div class="text-muted small">
                        Registered: ${createdDate}
                    </div>
                </div>
                <div class="card-footer">
                    <div class="row">
                        <div class="col">
                            <a href="./index.html" class="btn btn-sm btn-outline-primary w-100">
                                View on Map
                            </a>
                        </div>
                        <div class="col">
                            <button class="btn btn-sm btn-outline-secondary w-100" onclick="toggleSensorActive('${escapeHtml(sensor.device_id)}', ${!sensor.active})">
                                ${sensor.active ? 'Deactivate' : 'Activate'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        sensorsGrid.appendChild(card);
    });
}

/**
 * Handle sensor registration
 */
async function handleSensorRegistration() {
    const submitBtn = document.getElementById('submitRegisterBtn');
    const form = document.getElementById('registerSensorForm');

    // Validate form
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const name = document.getElementById('sensorName').value;
    const lat = parseFloat(document.getElementById('sensorLat').value);
    const long = parseFloat(document.getElementById('sensorLong').value);
    const isPrivate = document.getElementById('sensorPrivate').checked;

    // Disable button and show loading
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Registering...';

    try {
        const response = await fetch(`${API_BASE}/sensors/register`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${sessionToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                lat,
                long,
                private: isPrivate
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to register sensor');
        }

        // Close registration modal
        const registerModal = bootstrap.Modal.getInstance(document.getElementById('registerSensorModal'));
        registerModal.hide();

        // Show token modal
        showTokenModal(data.sensor);

        // Reset form
        form.reset();

        // Reload sensors
        document.getElementById('sensorsGrid').innerHTML = '';
        document.getElementById('noSensors').classList.add('d-none');
        await loadSensors();

    } catch (error) {
        console.error('Error registering sensor:', error);
        showAlert(`Failed to register sensor: ${error.message}`, 'danger');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Register Sensor';
    }
}

/**
 * Show token modal with sensor details
 */
function showTokenModal(sensor) {
    document.getElementById('newDeviceId').textContent = sensor.device_id;
    document.getElementById('newSensorName').textContent = sensor.name;
    document.getElementById('newSensorToken').textContent = sensor.token;

    const tokenModal = new bootstrap.Modal(document.getElementById('sensorTokenModal'));
    tokenModal.show();
}

/**
 * Copy token to clipboard
 */
function copyToken() {
    const tokenText = document.getElementById('newSensorToken').textContent;
    navigator.clipboard.writeText(tokenText).then(() => {
        showAlert('Token copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Failed to copy:', err);
        showAlert('Failed to copy token. Please copy manually.', 'warning');
    });
}

/**
 * Toggle sensor active status
 */
async function toggleSensorActive(deviceId, newActiveStatus) {
    // This would require a new API endpoint - placeholder for now
    showAlert('Feature coming soon: Toggle sensor active/inactive status', 'info');
}

/**
 * Handle logout
 */
function handleLogout() {
    localStorage.removeItem('enviro_session');
    localStorage.removeItem('enviro_user_email');
    window.location.href = './login.html';
}

/**
 * Show alert message
 */
function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px; max-width: 500px;';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(alertDiv);

    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make copyToken available globally for onclick handler
window.copyToken = copyToken;
window.toggleSensorActive = toggleSensorActive;
