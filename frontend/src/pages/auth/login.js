/**
 * Login page entry point
 */
import '../../lib/ui.js';

// Renders the post-submit success state in place. All static markup;
// the email address is inserted via textContent, never innerHTML.
function showLoginSuccess(email) {
    const cardBody = document.querySelector('.auth-card .card-body');
    cardBody.innerHTML = `
        <div class="text-center">
            <div class="feature-icon mx-auto" style="background: linear-gradient(135deg, #2fb344, #51cf66);">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </div>
            <h2 class="mb-2" style="color: #2fb344;">Login Email Sent</h2>
            <p class="text-muted">Welcome back! A login link has been sent to:</p>
            <p><code id="sent-email" style="word-break: break-all;"></code></p>
            <div class="alert alert-info text-start">
                <strong>Next steps:</strong>
                <ol class="mb-0 mt-1">
                    <li>Check your email inbox (and spam folder)</li>
                    <li>Click the login link in the email</li>
                    <li>You'll be redirected to your dashboard</li>
                </ol>
            </div>
            <p class="fw-bold">This link will expire in 15 minutes for your security.</p>
            <a href="./" class="btn btn-primary">Return to Dashboard</a>
        </div>
    `;
    document.getElementById('sent-email').textContent = email;
}

document.getElementById('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const submitBtn = document.getElementById('submitBtn');
    const originalHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Sending...';

    const existingAlert = document.getElementById('form-alert');
    if (existingAlert) existingAlert.remove();

    const showFormError = (message) => {
        const alert = document.createElement('div');
        alert.id = 'form-alert';
        alert.className = 'alert alert-danger mt-3';
        alert.textContent = message;
        this.appendChild(alert);
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHTML;
    };

    try {
        const response = await fetch('/api/v1/login', {
            method: 'POST',
            body: new FormData(this)
        });
        const data = await response.json();
        if (response.ok && data.success) {
            showLoginSuccess(data.email);
        } else {
            showFormError(data.error?.message || data.message || 'An error occurred. Please try again.');
        }
    } catch (err) {
        showFormError('Network error. Please try again.');
    }
});
