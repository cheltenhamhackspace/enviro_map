/**
 * Central Leaflet import. Exposes window.L because the leaflet.heat plugin
 * (and any future plain plugins) expect the global. Import this module
 * BEFORE importing 'leaflet.heat' — ES module evaluation order guarantees
 * the global is set first.
 */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

window.L = L;

export default L;
