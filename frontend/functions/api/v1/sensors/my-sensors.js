/**
 * My Sensors API Endpoint
 * Returns all sensors owned by the authenticated user.
 * Authenticated + same-origin only: no CORS headers.
 */
import { requireSession } from '../lib/auth.js';
import { json, apiError } from '../lib/responses.js';

export async function onRequestGet(context) {
    const session = await requireSession(context);
    if (!session) {
        return apiError('unauthenticated', 'Not logged in', 401, { cors: false });
    }

    const sensors = await context.env.READINGS_TABLE.prepare(
        `SELECT device_id, name, lat, long, private, active, created_at
         FROM sensors
         WHERE user_id = ?
         ORDER BY created_at DESC`
    ).bind(session.userId).all();

    return json({
        success: true,
        sensors: sensors.results,
        count: sensors.results.length
    }, { cors: false, cacheControl: 'private, max-age=60' });
}
