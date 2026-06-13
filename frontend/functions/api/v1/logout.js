/**
 * Logout: clears the httpOnly session cookie. (JWTs are stateless, so the
 * token itself remains technically valid until expiry — clearing the cookie
 * removes it from the browser, which is the only place it lives.)
 */
import { sessionCookieHeader } from './lib/auth.js';

export async function onRequestPost() {
    return new Response(JSON.stringify({ success: true }), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'Set-Cookie': sessionCookieHeader(null)
        }
    });
}
