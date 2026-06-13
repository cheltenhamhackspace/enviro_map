/**
 * Sensor Management API Endpoint
 * DELETE: Delete a sensor and all its data (authenticated users only)
 */
import { requireSession } from '../lib/auth.js';

export async function onRequestDelete(context) {
    try {
        // Session comes from the httpOnly cookie
        const session = await requireSession(context);
        if (!session) {
            return createErrorResponse('Not logged in', 401);
        }

        const userId = session.userId;
        const deviceId = context.params.device_id;

        // Verify sensor exists and user owns it
        const sensor = await context.env.READINGS_TABLE.prepare(`
            SELECT device_id, name, user_id FROM sensors WHERE device_id = ?
        `).bind(deviceId).first();

        if (!sensor) {
            return createErrorResponse('Sensor not found', 404);
        }

        if (sensor.user_id !== userId) {
            return createErrorResponse('You do not have permission to delete this sensor', 403);
        }

        // Delete all sensor readings first
        const deleteReadingsResult = await context.env.READINGS_TABLE.prepare(`
            DELETE FROM sensor_readings WHERE device_id = ?
        `).bind(deviceId).run();

        // Delete the sensor
        const deleteSensorResult = await context.env.READINGS_TABLE.prepare(`
            DELETE FROM sensors WHERE device_id = ?
        `).bind(deviceId).run();

        if (!deleteSensorResult.success) {
            console.error('Failed to delete sensor:', deleteSensorResult);
            return createErrorResponse('Failed to delete sensor', 500);
        }

        return new Response(JSON.stringify({
            success: true,
            message: 'Sensor and all associated data deleted successfully',
            device_id: deviceId,
            readings_deleted: deleteReadingsResult.meta?.changes || 0
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            }
        });

    } catch (error) {
        console.error('Sensor deletion error:', error);
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
            'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
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
            'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
    });
}
