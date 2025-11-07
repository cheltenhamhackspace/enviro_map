/**
 * Sensor Registration API Endpoint
 * Allows authenticated users to register new sensors
 */
import { jwtVerify, importSPKI } from 'jose';
import { randomBytes } from 'crypto';

export async function onRequest(context) {
    if (context.request.method !== 'POST') {
        return createErrorResponse('Method not allowed', 405);
    }

    try {
        // Verify authentication
        const authHeader = context.request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return createErrorResponse('Missing or invalid authorization header', 401);
        }

        const token = authHeader.substring(7);
        const verificationResult = await verifyJWT(token, context.env.JWT_PUBLIC_KEY);

        if (!verificationResult.success) {
            return createErrorResponse('Invalid or expired token', 401);
        }

        const userId = verificationResult.data.payload.user_id;
        const userEmail = verificationResult.data.payload.email;

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

        // Generate unique device_id and token
        const deviceId = generateDeviceId();
        const sensorToken = generateSecureToken();

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
                sensorToken,
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
 * Verifies JWT token using the public key
 */
async function verifyJWT(jwt, publicKeyPem) {
    try {
        const alg = 'EdDSA';
        const publicKey = await importSPKI(publicKeyPem, alg);

        const verificationResult = await jwtVerify(jwt, publicKey, {
            issuer: 'map.cheltenham.space',
            audience: 'enviro-dashboard',
        });

        return {
            success: true,
            data: verificationResult
        };
    } catch (error) {
        console.error('JWT verification failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Generates a unique device ID
 * Format: enviro-XXXXXXXX (8 random hex characters)
 */
function generateDeviceId() {
    const randomHex = randomBytes(4).toString('hex');
    return `enviro-${randomHex}`;
}

/**
 * Generates a secure random token for sensor authentication
 * 32 bytes = 64 hex characters
 */
function generateSecureToken() {
    return randomBytes(32).toString('hex');
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
