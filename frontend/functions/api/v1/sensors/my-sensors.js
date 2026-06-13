/**
 * My Sensors API Endpoint
 * Returns all sensors owned by the authenticated user
 */
import { requireSession } from '../lib/auth.js';

export async function onRequest(context) {
    if (context.request.method !== 'GET') {
        return createErrorResponse('Method not allowed', 405);
    }

    try {
        // Session comes from the httpOnly cookie
        const session = await requireSession(context);
        if (!session) {
            return createErrorResponse('Not logged in', 401);
        }

        const userId = session.userId;

        // Query user's sensors
        const sensors = await context.env.READINGS_TABLE.prepare(
            `SELECT device_id, name, lat, long, private, active, created_at
             FROM sensors
             WHERE user_id = ?
             ORDER BY created_at DESC`
        ).bind(userId).all();

        return new Response(JSON.stringify({
            success: true,
            sensors: sensors.results,
            count: sensors.results.length
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Cache-Control': 'private, max-age=60' // Cache for 1 minute
            }
        });

    } catch (error) {
        console.error('Error fetching user sensors:', error);
        return createErrorResponse('Internal server error: ' + error.message, 500);
    }
}

/**
 * Creates standardized error response
 */
function createErrorResponse(message, status = 400) {
    return new Response(JSON.stringify({
        error: true,
        message: message
    }), {
        status: status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
    });
}

/**
 * Handle OPTIONS requests for CORS preflight
 */
export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
    });
}
