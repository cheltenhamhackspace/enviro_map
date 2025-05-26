export async function onRequest(context) {

    if (context.params.catchall.length === 2 && context.params.catchall[1] === "latest") {
        try {
            const latestReading = await context.env.READINGS_TABLE.prepare(
                "SELECT pm1, pm2_5, pm4, pm10, temperature, relative_humidity, nox, voc, MAX(event_time) AS time FROM sensor_readings WHERE device_id = ?"
            ).bind(context.params.catchall[0]).all();
            console.log(latestReading);

            if (latestReading.results.length == 1 && latestReading.results[0]["time"] !== null) {
                // Calculate cache duration based on data age
                const dataAge = Date.now() - latestReading.results[0].time;
                const cacheMaxAge = dataAge > 7200000 ? 600 : 120; // 10 min for old data, 2 min for recent
                
                return new Response(JSON.stringify(latestReading.results[0]), {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Cache-Control': `public, max-age=${cacheMaxAge}`,
                        'ETag': `"${context.params.catchall[0]}-latest-${latestReading.results[0].time}"`
                    }
                });
            }
            else {
                return new Response(JSON.stringify({ error: "No data found" }), { 
                    status: 404,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'public, max-age=60' // Cache 404s for 1 minute
                    }
                });
            }
        } catch (error) {
            console.error('Database error:', error);
            return new Response(JSON.stringify({ 
                error: "Database error", 
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
    else if (context.params.catchall.length === 2 && context.params.catchall[1] === "download") {
        // Handle CSV download requests
        const urlParams = new URL(context.request.url).searchParams;
        let timeFrom = urlParams.get("from");
        let timeTo = urlParams.get("to");

        // Default to last 24 hours if not specified
        if (timeFrom === null) {
            timeFrom = Date.now() - 86400000;
        }
        if (timeTo === null) {
            timeTo = Date.now();
        }

        try {
            const dbQueryAllData = context.env.READINGS_TABLE.prepare(
                'SELECT event_time, relative_humidity, temperature, pm1, pm2_5, pm4, pm10, voc, nox FROM sensor_readings WHERE device_id = ?1 AND event_time >= ?2 AND event_time <= ?3 ORDER BY event_time ASC'
            );
            const allData = await dbQueryAllData.bind(context.params.catchall[0], timeFrom, timeTo).all();

            if (allData.results.length > 0) {
                // Convert to CSV
                const headers = ['timestamp', 'relative_humidity', 'temperature', 'pm1', 'pm2_5', 'pm4', 'pm10', 'voc', 'nox'];
                const csvRows = [headers.join(',')];
                
                allData.results.forEach(row => {
                    const csvRow = [
                        new Date(row.event_time).toISOString(),
                        row.relative_humidity || '',
                        row.temperature || '',
                        row.pm1 || '',
                        row.pm2_5 || '',
                        row.pm4 || '',
                        row.pm10 || '',
                        row.voc || '',
                        row.nox || ''
                    ];
                    csvRows.push(csvRow.join(','));
                });

                const csvContent = csvRows.join('\n');
                const filename = `sensor_${context.params.catchall[0]}_${new Date(parseInt(timeFrom)).toISOString().split('T')[0]}_to_${new Date(parseInt(timeTo)).toISOString().split('T')[0]}.csv`;

                return new Response(csvContent, {
                    headers: {
                        'Content-Type': 'text/csv',
                        'Content-Disposition': `attachment; filename="${filename}"`,
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'public, max-age=3600' // Cache downloads for 1 hour
                    }
                });
            } else {
                return new Response(JSON.stringify({ error: "No data found for download" }), { 
                    status: 404,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }
        } catch (error) {
            console.error('Database error:', error);
            return new Response(JSON.stringify({ 
                error: "Database error", 
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
    else {
        return new Response(JSON.stringify({ error: "Endpoint not found" }), { 
            status: 404,
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
