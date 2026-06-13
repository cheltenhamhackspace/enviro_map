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
// Tabler's bundle is an IIFE: importing it for its side effect sets
// globalThis.bootstrap (with Modal/Dropdown/etc.) and globalThis.tabler.
// Do NOT `import * as bootstrap` and reassign window.bootstrap — the namespace
// is empty and would clobber the real global the bundle just installed.
import '@tabler/core/dist/js/tabler.min.js';

export { initNav } from './nav.js';
export { notify } from './notify.js';
