/**
 * Sensor Management API Endpoint
 * DELETE: Remove a sensor (authenticated owner only).
 *
 * Default action is DEACTIVATE (active=0): the sensor disappears from the
 * public map and stops accepting authenticated uploads, but all historical
 * readings are preserved. Hard deletion of the sensor row and every reading
 * requires the explicit ?purge=true opt-in (decision Q3 in the rework plan).
 */
import { requireSession } from '../lib/auth.js';
import { json, apiError } from '../lib/responses.js';

export async function onRequestDelete(context) {
    // Session comes from the httpOnly cookie; same-origin only, no CORS
    const session = await requireSession(context);
    if (!session) {
        return apiError('unauthenticated', 'Not logged in', 401, { cors: false });
    }

    const deviceId = context.params.device_id;
    const purge = new URL(context.request.url).searchParams.get('purge') === 'true';

    // Verify sensor exists and user owns it
    const sensor = await context.env.READINGS_TABLE.prepare(
        'SELECT device_id, name, user_id FROM sensors WHERE device_id = ?'
    ).bind(deviceId).first();

    if (!sensor) {
        return apiError('not_found', 'Sensor not found', 404, { cors: false });
    }

    if (sensor.user_id !== session.userId) {
        return apiError('forbidden', 'You do not have permission to remove this sensor', 403, { cors: false });
    }

    if (!purge) {
        const result = await context.env.READINGS_TABLE.prepare(
            'UPDATE sensors SET active = 0 WHERE device_id = ?'
        ).bind(deviceId).run();

        if (!result.success) {
            return apiError('internal_error', 'Failed to deactivate sensor', 500, { cors: false });
        }

        return json({
            success: true,
            action: 'deactivated',
            message: 'Sensor deactivated. Historical readings are preserved.',
            device_id: deviceId
        }, { cors: false, cacheControl: 'no-store' });
    }

    // Explicit purge: delete readings, the latest-reading row, then the sensor
    const deleteReadingsResult = await context.env.READINGS_TABLE.prepare(
        'DELETE FROM sensor_readings WHERE device_id = ?'
    ).bind(deviceId).run();

    try {
        await context.env.READINGS_TABLE.prepare(
            'DELETE FROM sensor_latest WHERE device_id = ?'
        ).bind(deviceId).run();
    } catch (latestError) {
        console.error('sensor_latest delete failed (non-fatal):', latestError);
    }

    const deleteSensorResult = await context.env.READINGS_TABLE.prepare(
        'DELETE FROM sensors WHERE device_id = ?'
    ).bind(deviceId).run();

    if (!deleteSensorResult.success) {
        return apiError('internal_error', 'Failed to delete sensor', 500, { cors: false });
    }

    return json({
        success: true,
        action: 'purged',
        message: 'Sensor and all associated data deleted permanently.',
        device_id: deviceId,
        readings_deleted: deleteReadingsResult.meta?.changes || 0
    }, { cors: false, cacheControl: 'no-store' });
}
