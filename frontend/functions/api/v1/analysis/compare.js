/**
 * Comparative Analysis API Endpoint
 * Provides multi-sensor comparisons and correlations with optimized D1 queries
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
        const metrics = url.searchParams.get('metrics')?.split(',') || ['pm2_5', 'temperature', 'relative_humidity'];
        const aggregation = url.searchParams.get('aggregation') || 'hourly';

        if (sensorIds.length < 2) {
            return new Response(JSON.stringify({
                error: 'At least 2 sensors required for comparison'
            }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }

        // Build time bucket based on aggregation level
        let timeBucket;
        switch (aggregation) {
            case 'hourly':
                timeBucket = 'CAST(event_time / 3600000 AS INTEGER) * 3600000';
                break;
            case 'daily':
                timeBucket = 'CAST(event_time / 86400000 AS INTEGER) * 86400000';
                break;
            case 'weekly':
                timeBucket = 'CAST(event_time / 604800000 AS INTEGER) * 604800000';
                break;
            default:
                timeBucket = 'event_time';
        }

        // Build metrics selection for SQL
        const metricColumns = metrics.map(metric => {
            const column = metric === 'humidity' ? 'relative_humidity' : metric;
            return `AVG(${column}) as avg_${metric}`;
        }).join(',');

        // Build placeholders for sensor IDs
        const sensorPlaceholders = sensorIds.map(() => '?').join(',');

        // Get aggregated data for all sensors - single optimized query
        const comparisonQuery = `
            SELECT 
                device_id,
                ${timeBucket} as time_bucket,
                ${metricColumns}
            FROM sensor_readings 
            WHERE device_id IN (${sensorPlaceholders})
                AND event_time >= ? 
                AND event_time <= ?
            GROUP BY device_id, time_bucket
            ORDER BY time_bucket ASC
        `;

        const comparisonResult = await context.env.READINGS_TABLE.prepare(comparisonQuery)
            .bind(...sensorIds, timeFrom, timeTo)
            .all();

        if (!comparisonResult.success) {
            throw new Error('Database query failed');
        }

        // Organize data by sensor and time
        const sensorData = {};
        const timePoints = new Set();

        comparisonResult.results.forEach(row => {
            const sensorId = row.device_id;
            const timeBucket = row.time_bucket;
            
            if (!sensorData[sensorId]) {
                sensorData[sensorId] = {};
            }
            
            sensorData[sensorId][timeBucket] = {};
            metrics.forEach(metric => {
                sensorData[sensorId][timeBucket][metric] = row[`avg_${metric}`];
            });
            
            timePoints.add(timeBucket);
        });

        // Convert to array and sort
        const sortedTimePoints = Array.from(timePoints).sort((a, b) => a - b);

        // Calculate correlations between sensors for each metric
        const correlations = {};
        
        for (let i = 0; i < sensorIds.length; i++) {
            for (let j = i + 1; j < sensorIds.length; j++) {
                const sensor1 = sensorIds[i];
                const sensor2 = sensorIds[j];
                const pairKey = `${sensor1}_${sensor2}`;
                
                correlations[pairKey] = {};
                
                metrics.forEach(metric => {
                    // Get paired values for correlation calculation
                    const pairs = [];
                    sortedTimePoints.forEach(time => {
                        const val1 = sensorData[sensor1]?.[time]?.[metric];
                        const val2 = sensorData[sensor2]?.[time]?.[metric];
                        
                        if (val1 !== null && val1 !== undefined && 
                            val2 !== null && val2 !== undefined) {
                            pairs.push([val1, val2]);
                        }
                    });
                    
                    // Calculate Pearson correlation coefficient
                    if (pairs.length > 1) {
                        const n = pairs.length;
                        const sum1 = pairs.reduce((sum, pair) => sum + pair[0], 0);
                        const sum2 = pairs.reduce((sum, pair) => sum + pair[1], 0);
                        const sum1Sq = pairs.reduce((sum, pair) => sum + pair[0] * pair[0], 0);
                        const sum2Sq = pairs.reduce((sum, pair) => sum + pair[1] * pair[1], 0);
                        const pSum = pairs.reduce((sum, pair) => sum + pair[0] * pair[1], 0);
                        
                        const num = pSum - (sum1 * sum2 / n);
                        const den = Math.sqrt((sum1Sq - sum1 * sum1 / n) * (sum2Sq - sum2 * sum2 / n));
                        
                        correlations[pairKey][metric] = den !== 0 ? num / den : 0;
                    } else {
                        correlations[pairKey][metric] = null;
                    }
                });
            }
        }

        // Get sensor names for better display
        const sensorNamesQuery = `
            SELECT device_id, name 
            FROM sensors 
            WHERE device_id IN (${sensorPlaceholders})
        `;

        const sensorNamesResult = await context.env.READINGS_TABLE.prepare(sensorNamesQuery)
            .bind(...sensorIds)
            .all();

        const sensorNames = {};
        if (sensorNamesResult.success) {
            sensorNamesResult.results.forEach(row => {
                sensorNames[row.device_id] = row.name;
            });
        }

        // Format time series data for charts
        const timeSeriesData = sortedTimePoints.map(time => {
            const dataPoint = { timestamp: time };
            sensorIds.forEach(sensorId => {
                metrics.forEach(metric => {
                    const key = `${sensorId}_${metric}`;
                    dataPoint[key] = sensorData[sensorId]?.[time]?.[metric] || null;
                });
            });
            return dataPoint;
        });

        // Calculate summary statistics for comparison
        const summaryStats = {};
        sensorIds.forEach(sensorId => {
            summaryStats[sensorId] = {};
            metrics.forEach(metric => {
                const values = sortedTimePoints
                    .map(time => sensorData[sensorId]?.[time]?.[metric])
                    .filter(val => val !== null && val !== undefined);
                
                if (values.length > 0) {
                    const sorted = values.sort((a, b) => a - b);
                    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
                    
                    summaryStats[sensorId][metric] = {
                        mean: mean,
                        min: sorted[0],
                        max: sorted[sorted.length - 1],
                        median: sorted[Math.floor(sorted.length / 2)],
                        count: values.length
                    };
                } else {
                    summaryStats[sensorId][metric] = null;
                }
            });
        });

        // Calculate cache duration based on data age
        const dataAge = Date.now() - timeTo;
        const cacheMaxAge = dataAge > 3600000 ? 1800 : 300;

        return new Response(JSON.stringify({
            timeRange: { from: timeFrom, to: timeTo },
            aggregation: aggregation,
            metrics: metrics,
            sensors: sensorIds.map(id => ({
                id: id,
                name: sensorNames[id] || id
            })),
            timeSeriesData: timeSeriesData,
            correlations: correlations,
            summaryStats: summaryStats,
            meta: {
                totalSensors: sensorIds.length,
                totalDataPoints: sortedTimePoints.length,
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
        console.error('Comparative analysis error:', error);
        
        return new Response(JSON.stringify({
            error: 'Failed to generate comparative analysis',
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
