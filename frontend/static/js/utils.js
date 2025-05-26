/**
 * Utility functions for the Environmental Monitoring Dashboard
 */

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
