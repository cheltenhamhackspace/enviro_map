/**
 * My Sensors API Endpoint
 * Returns all sensors owned by the authenticated user
 */
import { jwtVerify, importSPKI } from 'jose';

export async function onRequest(context) {
    if (context.request.method !== 'GET') {
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
