/**
 * Statistics Analysis API Endpoint
 * Provides statistical summaries with optimized D1 queries
 */
export async function onRequest(context) {
    if (context.request.method !== 'GET') {
        return new Response('Method not allowed', { status: 405 });
    }

    try {
        const url = new URL(context.request.url);
        const sensorIds = url.searchParams.get('sensors')?.split(',') || [];
        const timeFrom = parseInt(url.searchParams.get('from')) || (Date.now() - 7 * 24 * 60 * 60 * 1000);
        const timeTo = parseInt(url.searchParams.get('to')) || Date.now();
        const aggregation = url.searchParams.get('aggregation') || 'hourly';
        const metrics = url.searchParams.get('metrics')?.split(',') || ['pm2_5', 'temperature', 'relative_humidity'];

        if (sensorIds.length === 0) {
            return new Response(JSON.stringify({
                error: 'No sensors specified'
            }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }

        // Build the metrics selection for SQL
        const metricColumns = metrics.map(metric => {
            const column = metric === 'humidity' ? 'relative_humidity' : metric;
            return `
                AVG(${column}) as avg_${metric},
                MIN(${column}) as min_${metric},
                MAX(${column}) as max_${metric},
                COUNT(${column}) as count_${metric}
            `;
        }).join(',');

        // Build placeholders for sensor IDs
        const sensorPlaceholders = sensorIds.map((_, index) => `?${index + 4}`).join(',');

        // Create the main statistics query - optimized for minimal row reads
        const statsQuery = `
            SELECT 
                device_id,
                COUNT(*) as total_readings,
                ${metricColumns}
            FROM sensor_readings 
            WHERE device_id IN (${sensorPlaceholders})
                AND event_time >= ?1 
                AND event_time <= ?2
            GROUP BY device_id
        `;

        // Execute the statistics query
        const statsResult = await context.env.READINGS_TABLE.prepare(statsQuery)
            .bind(timeFrom, timeTo, ...sensorIds)
            .all();

        if (!statsResult.success) {
            throw new Error('Database query failed');
        }

        // Calculate percentiles and standard deviation (requires a separate query for efficiency)
        const percentileResults = {};
        for (const sensorId of sensorIds) {
            for (const metric of metrics) {
                const column = metric === 'humidity' ? 'relative_humidity' : metric;
                
                // Get ordered values for percentile calculation
                const percentileQuery = `
                    SELECT ${column} as value
                    FROM sensor_readings 
                    WHERE device_id = ? 
                        AND event_time >= ? 
                        AND event_time <= ?
                        AND ${column} IS NOT NULL
                    ORDER BY ${column}
                `;

                const percentileData = await context.env.READINGS_TABLE.prepare(percentileQuery)
                    .bind(sensorId, timeFrom, timeTo)
                    .all();

                if (percentileData.success && percentileData.results.length > 0) {
                    const values = percentileData.results.map(r => r.value);
                    const n = values.length;
                    
                    // Calculate percentiles
                    const p25Index = Math.floor(n * 0.25);
                    const p50Index = Math.floor(n * 0.5);
                    const p75Index = Math.floor(n * 0.75);
                    
                    // Calculate standard deviation
                    const mean = values.reduce((sum, val) => sum + val, 0) / n;
                    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
                    const stdDev = Math.sqrt(variance);

                    if (!percentileResults[sensorId]) {
                        percentileResults[sensorId] = {};
                    }
                    
                    percentileResults[sensorId][metric] = {
                        p25: values[p25Index],
                        median: values[p50Index],
                        p75: values[p75Index],
                        stdDev: stdDev
                    };
                }
            }
        }

        // Combine results
        const combinedResults = statsResult.results.map(row => {
            const sensorId = row.device_id;
            const result = {
                device_id: sensorId,
                total_readings: row.total_readings,
                statistics: {}
            };

            metrics.forEach(metric => {
                result.statistics[metric] = {
                    mean: row[`avg_${metric}`],
                    min: row[`min_${metric}`],
                    max: row[`max_${metric}`],
                    count: row[`count_${metric}`],
                    median: percentileResults[sensorId]?.[metric]?.median || null,
                    p25: percentileResults[sensorId]?.[metric]?.p25 || null,
                    p75: percentileResults[sensorId]?.[metric]?.p75 || null,
                    stdDev: percentileResults[sensorId]?.[metric]?.stdDev || null
                };
            });

            return result;
        });

        // Calculate cache duration based on data age
        const dataAge = Date.now() - timeTo;
        const cacheMaxAge = dataAge > 3600000 ? 1800 : 300; // 30 min for old data, 5 min for recent

        return new Response(JSON.stringify({
            timeRange: { from: timeFrom, to: timeTo },
            aggregation: aggregation,
            metrics: metrics,
            results: combinedResults,
            meta: {
                totalSensors: sensorIds.length,
                queryTime: Date.now()
            }
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Cache-Control': `public, max-age=${cacheMaxAge}`
            }
        });

    } catch (error) {
        console.error('Statistics analysis error:', error);
        
        return new Response(JSON.stringify({
            error: 'Failed to generate statistics',
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
