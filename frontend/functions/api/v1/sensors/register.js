/**
 * Sensor Registration API Endpoint
 * Allows authenticated users to register new sensors.
 * Authenticated + same-origin only: no CORS headers.
 */
import { requireSession, sha256Hex } from '../lib/auth.js';
import { json, apiError } from '../lib/responses.js';

export async function onRequestPost(context) {
    const session = await requireSession(context);
    if (!session) {
        return apiError('unauthenticated', 'Not logged in', 401, { cors: false });
    }

    let body;
    try {
        body = await context.request.json();
    } catch {
        return apiError('invalid_request', 'Expected JSON body', 400, { cors: false });
    }
    const { name, lat, long, private: isPrivate } = body;

    // Validate required fields
    if (!name || lat === undefined || long === undefined) {
        return apiError('invalid_request', 'Missing required fields: name, lat, long', 400, { cors: false });
    }

    if (typeof name !== 'string' || name.length > 100) {
        return apiError('invalid_request', 'Name must be a string of at most 100 characters', 400, { cors: false });
    }

    // Validate coordinates
    if (typeof lat !== 'number' || typeof long !== 'number') {
        return apiError('invalid_request', 'Latitude and longitude must be numbers', 400, { cors: false });
    }

    if (lat < -90 || lat > 90 || long < -180 || long > 180) {
        return apiError('invalid_request', 'Invalid coordinates', 400, { cors: false });
    }

    // Generate unique device_id and token. Only the SHA-256 of the token is
    // stored; the plain token is returned to the user exactly once below.
    const deviceId = generateDeviceId();
    const sensorToken = generateSecureToken();
    const sensorTokenHash = await sha256Hex(sensorToken);

    try {
        const result = await context.env.READINGS_TABLE.prepare(`
            INSERT INTO sensors (device_id, name, created_at, owner, lat, long, token, private, active, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        `).bind(
            deviceId,
            name,
            Date.now(),
            session.email,
            lat,
            long,
            sensorTokenHash,
            isPrivate ? 1 : 0,
            session.userId
        ).run();

        if (!result.success) {
            console.error('Failed to insert sensor:', result);
            return apiError('internal_error', 'Failed to register sensor', 500, { cors: false });
        }

        // Return sensor details including the token (only shown once!)
        return json({
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
        }, { status: 201, cors: false, cacheControl: 'no-store' });

    } catch (error) {
        console.error('Database error during sensor registration:', error);

        // Check for unique constraint violations
        if (error.message && error.message.includes('UNIQUE')) {
            return apiError('conflict', 'A sensor with this ID already exists. Please try again.', 409, { cors: false });
        }

        return apiError('internal_error', 'Database error during sensor registration', 500, { cors: false });
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
