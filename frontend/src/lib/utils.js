/**
 * Utility functions for the Environmental Monitoring Dashboard
 */
import { notify } from './notify.js';

export const Utils = {
    // Escape user-supplied text before interpolating into HTML strings.
    // Sensor names are user input — every innerHTML sink must go through this.
    escapeHtml: (text) => {
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    // Round a time range to bucket boundaries (default 5 min) so request URLs
    // repeat between polls and HTTP caching (browser + edge) can engage.
    // Raw Date.now() in a query string makes every URL unique and defeats caching.
    roundTimeRange: (fromMs, toMs, bucketMs = 300000) => ({
        from: Math.floor(fromMs / bucketMs) * bucketMs,
        to: Math.ceil(toMs / bucketMs) * bucketMs
    }),

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

    // Delegates to the unified toast component (src/lib/notify.js)
    showNotification: (message, type = 'info') => notify(message, type)
};
