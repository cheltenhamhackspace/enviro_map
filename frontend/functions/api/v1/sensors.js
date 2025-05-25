/**
 * Sensors API Endpoint
 * Returns a list of all sensors with their basic information
 */
export async function onRequest(context) {
    try {
        // Query all sensors from the database
        const allSensors = await context.env.READINGS_TABLE.prepare(
            "SELECT name, device_id, lat, long FROM sensors"
        ).all();

        // Return the sensor data as JSON
        return new Response(JSON.stringify(allSensors.results), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
            }
        });
    } catch (error) {
        console.error('Error fetching sensors:', error);
        
        return new Response(JSON.stringify({
            error: 'Failed to fetch sensors',
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
