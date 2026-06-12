/**
 * Sensors Latest API Endpoint
 * Returns every public, active sensor with its most recent reading in one
 * response — replaces the per-sensor /sensor/{id}/latest fan-out on the map
 * page. Reads ~2 rows per sensor from the sensor_latest read model, which is
 * maintained on ingest.
 */
export async function onRequest(context) {
    if (context.request.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }

    try {
        const result = await context.env.READINGS_TABLE.prepare(`
            SELECT s.device_id, s.name, s.lat, s.long,
                   l.event_time AS time,
                   l.relative_humidity, l.temperature,
                   l.pm1, l.pm2_5, l.pm4, l.pm10, l.voc, l.nox
            FROM sensors s
            LEFT JOIN sensor_latest l ON l.device_id = s.device_id
            WHERE s.private = 0 AND s.active = 1
        `).all();

        console.log(JSON.stringify({ endpoint: 'sensors_latest', sensors: result.results.length, rows_read: result.meta?.rows_read }));

        return new Response(JSON.stringify(result.results), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                // Sensors post every 5 minutes; 2 min matches the old per-sensor
                // /latest freshness for recent data
                'Cache-Control': 'public, max-age=120'
            }
        });
    } catch (error) {
        console.error('Error fetching latest sensor readings:', error);

        return new Response(JSON.stringify({
            error: 'Failed to fetch latest sensor readings',
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
