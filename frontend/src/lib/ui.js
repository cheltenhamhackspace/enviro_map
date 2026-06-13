/**
 * Shared UI foundation — every page entry imports this once.
 * Brings: Tabler (CSS + JS for modals/tabs/dropdowns), the two typefaces,
 * the unified theme, the component-polish stylesheet, and re-exports the
 * nav + toast components.
 */
import '@tabler/core/dist/css/tabler.min.css';
import '@fontsource/bricolage-grotesque/400.css';
import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/chivo-mono/400.css';
import '@fontsource/chivo-mono/600.css';
import '../styles/theme.css';
import '../../static/css/styles.css';
import * as bootstrap from '@tabler/core/dist/js/tabler.min.js';

window.bootstrap = bootstrap;

export { initNav } from './nav.js';
export { notify } from './notify.js';
