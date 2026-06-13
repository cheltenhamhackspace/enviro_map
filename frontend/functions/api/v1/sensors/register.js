/**
 * Sensor Registration API Endpoint
 * Allows authenticated users to register new sensors
 */
import { requireSession, sha256Hex } from '../lib/auth.js';

export async function onRequest(context) {
    if (context.request.method !== 'POST') {
        return createErrorResponse('Method not allowed', 405);
    }

    try {
        // Session comes from the httpOnly cookie
        const session = await requireSession(context);
        if (!session) {
            return createErrorResponse('Not logged in', 401);
        }

        const userId = session.userId;
        const userEmail = session.email;

        // Parse request body
        const body = await context.request.json();
        const { name, lat, long, private: isPrivate } = body;

        // Validate required fields
        if (!name || lat === undefined || long === undefined) {
            return createErrorResponse('Missing required fields: name, lat, long', 400);
        }

        // Validate coordinates
        if (typeof lat !== 'number' || typeof long !== 'number') {
            return createErrorResponse('Latitude and longitude must be numbers', 400);
        }

        if (lat < -90 || lat > 90 || long < -180 || long > 180) {
            return createErrorResponse('Invalid coordinates', 400);
        }

        // Generate unique device_id and token. Only the SHA-256 of the token is
        // stored; the plain token is returned to the user exactly once below.
        const deviceId = generateDeviceId();
        const sensorToken = generateSecureToken();
        const sensorTokenHash = await sha256Hex(sensorToken);

        // Insert sensor into database
        try {
            const result = await context.env.READINGS_TABLE.prepare(`
                INSERT INTO sensors (device_id, name, created_at, owner, lat, long, token, private, active, user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            `).bind(
                deviceId,
                name,
                Date.now(),
                userEmail,
                lat,
                long,
                sensorTokenHash,
                isPrivate ? 1 : 0,
                userId
            ).run();

            if (!result.success) {
                console.error('Failed to insert sensor:', result);
                return createErrorResponse('Failed to register sensor', 500);
            }

            // Return sensor details including the token (only shown once!)
            return new Response(JSON.stringify({
                success: true,
                sensor: {
                    device_id: deviceId,
                    name: name,
                    token: sensorToken,
                    lat: lat,
                    long: long,
                    private: isPrivate ? true : false,
                    created_at: Date.now()
                },
                message: 'Sensor registered successfully',
                warning: 'IMPORTANT: Save the token securely. It will not be shown again!'
            }), {
                status: 201,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                }
            });

        } catch (error) {
            console.error('Database error during sensor registration:', error);

            // Check for unique constraint violations
            if (error.message && error.message.includes('UNIQUE')) {
                return createErrorResponse('A sensor with this ID already exists. Please try again.', 409);
            }

            return createErrorResponse('Database error: ' + error.message, 500);
        }

    } catch (error) {
        console.error('Sensor registration error:', error);
        return createErrorResponse('Internal server error: ' + error.message, 500);
    }
}

/**
 * Generates a unique device ID
 * Format: enviro-XXXXXXXX (8 random hex characters)
 */
function generateDeviceId() {
    const array = new Uint8Array(4);
    crypto.getRandomValues(array);
    const randomHex = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    return `enviro-${randomHex}`;
}

/**
 * Generates a secure random token for sensor authentication
 * 32 bytes = 64 hex characters
 */
function generateSecureToken() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
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
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
    });
}
