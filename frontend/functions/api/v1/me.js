/**
 * Session introspection: who is logged in, according to the httpOnly session
 * cookie. The dashboard calls this on load instead of trusting localStorage.
 * No database access — pure JWT verification.
 */
import { requireSession, jsonError } from './lib/auth.js';

export async function onRequestGet(context) {
    const session = await requireSession(context);
    if (!session) {
        return jsonError('Not logged in', 401);
    }
    return new Response(JSON.stringify({
        success: true,
        email: session.email,
        user_id: session.userId
    }), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store'
        }
    });
}
