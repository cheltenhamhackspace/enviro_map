/**
 * Unified toast notifications — replaces the two parallel implementations
 * (Utils.showNotification on the map/analysis pages, showAlert on the
 * dashboard). Messages are inserted as text, never HTML.
 */

const ICONS = {
    success: '<polyline points="20 6 9 17 4 12"></polyline>',
    danger: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>',
    warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
    info: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>'
};

const MAX_VISIBLE = 3;

function container() {
    let el = document.querySelector('.eh-toasts');
    if (!el) {
        el = document.createElement('div');
        el.className = 'eh-toasts';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        document.body.appendChild(el);
    }
    return el;
}

export function notify(message, type = 'info', { duration = 5000 } = {}) {
    if (!ICONS[type]) type = 'info';
    const host = container();

    // Keep the stack short — drop the oldest
    while (host.children.length >= MAX_VISIBLE) {
        host.firstChild.remove();
    }

    const toast = document.createElement('div');
    toast.className = `eh-toast eh-toast-${type}`;
    toast.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px">${ICONS[type]}</svg>`;
    toast.appendChild(document.createTextNode(message));

    const dismiss = () => {
        if (!toast.parentNode) return;
        toast.classList.add('leaving');
        setTimeout(() => toast.remove(), 200);
    };

    toast.addEventListener('click', dismiss);
    setTimeout(dismiss, duration);
    host.appendChild(toast);
}
