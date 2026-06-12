/**
 * Sensor Data Availability API Endpoint
 * Returns a list of sensor IDs that have data in the specified time range
 * Optimized for minimal database reads using a single DISTINCT query
 */
export async function onRequest(context) {
    try {
        const urlParams = new URL(context.request.url).searchParams;
        
        let timeFrom = urlParams.get("from");
        let timeTo = urlParams.get("to");

        // Ensure time fields are always present
        if (timeFrom === null) {
            timeFrom = Date.now() - 86400000; // Default to 24 hours ago
        }
        if (timeTo === null) {
            timeTo = Date.now();
        }

        // Validate time range
        const fromTime = parseInt(timeFrom);
        const toTime = parseInt(timeTo);
        
        if (isNaN(fromTime) || isNaN(toTime)) {
            return new Response(JSON.stringify({
                error: 'Invalid time parameters',
                message: 'from and to parameters must be valid timestamps'
            }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }

        if (fromTime > toTime) {
            return new Response(JSON.stringify({
                error: 'Invalid time range',
                message: 'from time must be before to time'
            }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }

        // One index probe per known sensor instead of scanning every reading in the
        // range: the correlated EXISTS stops at the first matching row via the
        // (device_id, event_time) index, so rows read is ~2 per sensor regardless of
        // how wide the time range is. Restricted to the public sensor list so private
        // device activity is not disclosed.
        const availabilityQuery = context.env.READINGS_TABLE.prepare(`
            SELECT s.device_id
            FROM sensors s
            WHERE s.private = 0 AND s.active = 1
              AND EXISTS (
                SELECT 1 FROM sensor_readings r
                WHERE r.device_id = s.device_id
                  AND r.event_time >= ?1 AND r.event_time <= ?2
              )
        `);

        const result = await availabilityQuery.bind(fromTime, toTime).all();

        // Extract just the device IDs from the results
        const availableSensors = result.results.map(row => row.device_id);

        console.log(JSON.stringify({ endpoint: 'sensors_availability', rows_read: result.meta?.rows_read }));
        
        // Calculate cache duration based on data age
        const dataAge = Date.now() - toTime;
        const cacheMaxAge = dataAge > 3600000 ? 1800 : 300; // 30 min for old data, 5 min for recent
        
        return new Response(JSON.stringify({
            availableSensors: availableSensors,
            timeRange: {
                from: fromTime,
                to: toTime
            },
            count: availableSensors.length,
            rowsRead: result.meta.rows_read || 0
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Cache-Control': `public, max-age=${cacheMaxAge}`,
                'ETag': `"availability-${fromTime}-${toTime}-${availableSensors.length}"`
            }
        });

    } catch (error) {
        console.error('Error checking sensor availability:', error);
        
        return new Response(JSON.stringify({
            error: 'Failed to check sensor availability',
            message: error.message
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}

// Handle OPTIONS requests for CORS preflight
export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        }
    });
}
