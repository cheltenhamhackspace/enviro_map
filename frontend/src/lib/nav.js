/**
 * Single source of truth for the app sidebar. Pages provide an empty
 * <aside id="sidebar" class="navbar navbar-vertical navbar-expand-sm navbar-dark">
 * and call initNav('map' | 'analysis' | 'account'); this module renders the
 * brand, the nav items (login-state aware), the optional page extra
 * (<template id="sidebar-extra">), the account footer, and the mobile
 * toggle. Nav markup previously lived per-page and drifted.
 */

const ICONS = {
    map: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle>',
    analysis: '<path d="M18 20V10"></path><path d="M12 20V4"></path><path d="M6 20v-6"></path>',
    account: '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>',
    login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10,17 15,12 10,7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15,3 21,3 21,9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line>',
    brand: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9,22 9,12 15,12 15,22"></polyline>'
};

function icon(name, size = 24) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
}

function navItem(key, href, label, active, extra = '') {
    return `
        <div class="nav-item">
            <a class="nav-link${active === key ? ' active' : ''}" href="${href}"${active === key ? ' aria-current="page"' : ''}${extra}>
                <span class="nav-link-icon">${icon(key)}</span>
                <span class="nav-link-title">${label}</span>
            </a>
        </div>`;
}

export function initNav(active) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // Display hint only — real auth is the httpOnly cookie, enforced
    // server-side; the worst a forged hint does is show a nav label
    const loggedIn = Boolean(localStorage.getItem('enviro_user_email'));

    const items = [
        navItem('map', './', 'Live Map', active),
        navItem('analysis', './analysis.html', 'Analysis', active),
        loggedIn
            ? navItem('account', './dashboard.html', 'My Sensors', active)
            : navItem('login', './login.html', 'Login', active),
        navItem('external', 'https://www.cheltenhamhackspace.org/', 'Cheltenham Hackspace', active,
            ' target="_blank" rel="noopener"')
    ].join('');

    const accountFooter = active === 'account' ? `
        <div class="mt-auto p-3 eh-sidebar-footer">
            <div class="mb-1">Signed in as</div>
            <div class="eh-user-email mb-2" id="userEmail">…</div>
            <button class="btn btn-sm btn-outline-light w-100" id="logoutBtn">Logout</button>
        </div>` : '';

    sidebar.innerHTML = `
        <div class="container-fluid d-flex flex-column h-100">
            <h1 class="navbar-brand navbar-brand-autodark">
                <span class="me-2">${icon('brand', 32)}</span>
                <span class="d-none d-lg-inline">
                    Cheltenham Hackspace<br>
                    <small class="text-muted">Environmental Monitor</small>
                </span>
            </h1>
            <nav class="navbar-nav pt-lg-3">${items}</nav>
            <div id="sidebar-extra-slot" class="mt-auto"></div>
            ${accountFooter}
        </div>`;

    // Page-specific sidebar content (e.g. the map page's sensor status card)
    const extra = document.getElementById('sidebar-extra');
    if (extra && extra.content) {
        document.getElementById('sidebar-extra-slot').appendChild(extra.content.cloneNode(true));
    }

    // Mobile off-canvas toggle (markup owned here, styles in theme.css)
    const toggle = document.createElement('button');
    toggle.className = 'eh-nav-toggle d-md-none';
    toggle.setAttribute('aria-label', 'Toggle navigation');
    toggle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
    toggle.addEventListener('click', () => sidebar.classList.toggle('show'));
    document.body.appendChild(toggle);

    // Tap outside closes the off-canvas sidebar on mobile
    document.addEventListener('click', (e) => {
        if (sidebar.classList.contains('show') &&
            !sidebar.contains(e.target) && !toggle.contains(e.target)) {
            sidebar.classList.remove('show');
        }
    });
}
