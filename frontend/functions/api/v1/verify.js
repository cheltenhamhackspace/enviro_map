/**
 * Login link verification.
 *
 * GET  /api/v1/verify?jwt=...  — serves a fully static interstitial page with a
 *      "Complete sign-in" button. Nothing is verified or consumed on GET, so
 *      email security scanners that prefetch links cannot burn the token. The
 *      page JS reads the jwt from the URL client-side; the server never
 *      reflects request data into the HTML.
 *
 * POST /api/v1/verify  (JSON body {jwt})  — verifies the login token
 *      (purpose=login enforced; session tokens are rejected, so sessions can
 *      no longer renew themselves), consumes its jti (single use), and sets
 *      the session as an httpOnly cookie.
 */
import { signToken, verifyToken, sessionCookieHeader, jsonError } from './lib/auth.js';

const INTERSTITIAL_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign In - Environmental Dashboard</title>
    <style>
        body {
            font-family: system-ui, -apple-system, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            padding: 1rem;
        }
        .container {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 1rem;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
            padding: 2rem;
            text-align: center;
            max-width: 500px;
            width: 100%;
        }
        h1 { color: #206bc4; margin-bottom: 1rem; }
        .btn {
            display: inline-block;
            background: linear-gradient(135deg, #206bc4, #4dabf7);
            color: white;
            border: none;
            font-size: 1rem;
            cursor: pointer;
            padding: 0.75rem 2rem;
            text-decoration: none;
            border-radius: 0.5rem;
            margin-top: 1rem;
        }
        .btn:disabled { opacity: 0.6; cursor: wait; }
        .error {
            background: #f8d7da;
            border: 1px solid #f5c6cb;
            color: #721c24;
            padding: 1rem;
            border-radius: 0.5rem;
            margin: 1rem 0;
            display: none;
        }
        .muted { color: #6c757d; font-size: 0.9rem; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Environmental Dashboard</h1>
        <p>Click the button below to complete your sign-in.</p>
        <div class="error" id="error"></div>
        <button class="btn" id="signin">Complete Sign-In</button>
        <p class="muted">If you did not request this sign-in, close this page.</p>
    </div>
    <script>
        const btn = document.getElementById('signin');
        const errorBox = document.getElementById('error');
        const jwt = new URLSearchParams(window.location.search).get('jwt');

        function showError(message) {
            errorBox.textContent = message;
            errorBox.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Try Again';
        }

        if (!jwt) {
            btn.style.display = 'none';
            showError('No sign-in token found in this link. Please request a new login email.');
        }

        btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.textContent = 'Signing in...';
            errorBox.style.display = 'none';
            try {
                const response = await fetch('/api/v1/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jwt: jwt })
                });
                const data = await response.json();
                if (response.ok && data.success) {
                    // Display hint only — auth lives in the httpOnly cookie
                    localStorage.setItem('enviro_user_email', data.email);
                    localStorage.removeItem('enviro_session');
                    window.location.href = '/dashboard.html';
                } else {
                    showError(data.message || 'Sign-in failed. Please request a new login email.');
                }
            } catch (err) {
                showError('Network error. Please try again.');
            }
        });
    </script>
</body>
</html>`;

export async function onRequestGet() {
    return new Response(INTERSTITIAL_PAGE, {
        headers: {
            'Content-Type': 'text/html;charset=UTF-8',
            'Cache-Control': 'no-store'
        }
    });
}

export async function onRequestPost(context) {
    try {
        let body;
        try {
            body = await context.request.json();
        } catch {
            return jsonError('Expected JSON body', 400);
        }
        const jwt = body?.jwt;
        if (!jwt || typeof jwt !== 'string') {
            return jsonError('Missing authentication token', 400);
        }

        // Only purpose=login tokens are accepted here
        const result = await verifyToken(jwt, context.env.JWT_PUBLIC_KEY, 'login');
        if (!result.success) {
            return jsonError(result.error || 'Invalid or expired token', 401);
        }

        const { payload } = result;
        if (!payload.jti) {
            return jsonError('Invalid token (missing jti). Please request a new login email.', 401);
        }

        // Single use: consume the jti, reject replays
        const expiresAt = (payload.exp || 0) * 1000;
        const used = await context.env.READINGS_TABLE.prepare(
            'SELECT jti FROM auth_tokens_used WHERE jti = ?'
        ).bind(payload.jti).first();
        if (used) {
            return jsonError('This sign-in link has already been used. Please request a new login email.', 403);
        }
        await context.env.READINGS_TABLE.prepare(
            'INSERT INTO auth_tokens_used (jti, expires_at) VALUES (?, ?)'
        ).bind(payload.jti, expiresAt).run();

        // Opportunistic purge of expired entries keeps the table tiny
        try {
            await context.env.READINGS_TABLE.prepare(
                'DELETE FROM auth_tokens_used WHERE expires_at < ?'
            ).bind(Date.now()).run();
        } catch (purgeError) {
            console.error('auth_tokens_used purge failed (non-fatal):', purgeError);
        }

        // Update last_login and mark email verified
        try {
            await context.env.READINGS_TABLE.prepare(
                'UPDATE users SET last_login = ?, email_verified = 1 WHERE id = ?'
            ).bind(Date.now(), payload.user_id).run();
        } catch (error) {
            console.error('Failed to update user login time:', error);
            // Continue anyway - login should still work
        }

        const sessionJwt = await signToken({
            email: payload.email,
            userId: payload.user_id,
            purpose: 'session',
            expiry: '7d'
        }, context.env.JWT_PRIVATE_KEY);

        return new Response(JSON.stringify({
            success: true,
            email: payload.email
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store',
                'Set-Cookie': sessionCookieHeader(sessionJwt)
            }
        });

    } catch (error) {
        console.error('JWT verification error:', error);
        return jsonError('An unexpected error occurred during authentication.', 500);
    }
}
