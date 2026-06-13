/**
 * Session introspection: who is logged in, according to the httpOnly session
 * cookie. The dashboard calls this on load instead of trusting localStorage.
 * No database access — pure JWT verification.
 */
import { requireSession } from './lib/auth.js';
import { json, apiError } from './lib/responses.js';

export async function onRequestGet(context) {
    const session = await requireSession(context);
    if (!session) {
        return apiError('unauthenticated', 'Not logged in', 401, { cors: false });
    }
    return json({
        success: true,
        email: session.email,
        user_id: session.userId
    }, { cors: false, cacheControl: 'no-store' });
}
