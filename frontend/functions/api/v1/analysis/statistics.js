/**
 * Statistics Analysis API Endpoint
 * Provides statistical summaries with optimized D1 queries
 */
import { apiError } from '../lib/responses.js';
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
        const VALID_METRICS = new Set(['pm1', 'pm2_5', 'pm4', 'pm10', 'voc', 'nox', 'temperature', 'humidity']);
        const rawMetrics = url.searchParams.get('metrics')?.split(',') || ['pm2_5', 'temperature', 'relative_humidity'];
        const metrics = rawMetrics.filter(m => VALID_METRICS.has(m));

        if (metrics.length === 0) {
            return apiError('invalid_request', 'No valid metrics specified', 400);
        }

        if (sensorIds.length === 0) {
            return apiError('invalid_request', 'No sensors specified', 400);
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
        const sensorPlaceholders = sensorIds.map(() => '?').join(',');

        // Create the main statistics query - optimized for minimal row reads
        const statsQuery = `
            SELECT 
                device_id,
                COUNT(*) as total_readings,
                ${metricColumns}
            FROM sensor_readings 
            WHERE device_id IN (${sensorPlaceholders})
                AND event_time >= ? 
                AND event_time <= ?
            GROUP BY device_id
        `;

        // Execute the statistics query
        const statsResult = await context.env.READINGS_TABLE.prepare(statsQuery)
            .bind(...sensorIds, timeFrom, timeTo)
            .all();

        if (!statsResult.success) {
            throw new Error('Database query failed');
        }

        let totalRowsRead = statsResult.meta?.rows_read || 0;

        // Percentiles and standard deviation need raw values. One un-ordered fetch
        // per sensor covering all requested metrics at once (instead of one ordered
        // scan per sensor per metric): rows read drops by the metric count, and the
        // sort happens here rather than in SQLite. Column names are whitelisted via
        // VALID_METRICS above.
        const percentileResults = {};
        const columnList = [...new Set(metrics.map(m => m === 'humidity' ? 'relative_humidity' : m))].join(', ');
        for (const sensorId of sensorIds) {
            const rawData = await context.env.READINGS_TABLE.prepare(`
                SELECT ${columnList}
                FROM sensor_readings
                WHERE device_id = ?
                    AND event_time >= ?
                    AND event_time <= ?
            `).bind(sensorId, timeFrom, timeTo).all();

            totalRowsRead += rawData.meta?.rows_read || 0;

            if (!rawData.success || rawData.results.length === 0) continue;

            for (const metric of metrics) {
                const column = metric === 'humidity' ? 'relative_humidity' : metric;
                const values = rawData.results
                    .map(r => r[column])
                    .filter(v => v !== null && v !== undefined)
                    .sort((a, b) => a - b);
                const n = values.length;
                if (n === 0) continue;

                const mean = values.reduce((sum, val) => sum + val, 0) / n;
                const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;

                if (!percentileResults[sensorId]) {
                    percentileResults[sensorId] = {};
                }

                percentileResults[sensorId][metric] = {
                    p25: values[Math.floor(n * 0.25)],
                    median: values[Math.floor(n * 0.5)],
                    p75: values[Math.floor(n * 0.75)],
                    stdDev: Math.sqrt(variance)
                };
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

        console.log(JSON.stringify({ endpoint: 'analysis_statistics', sensors: sensorIds.length, metrics: metrics.length, rows_read: totalRowsRead }));

        return new Response(JSON.stringify({
            timeRange: { from: timeFrom, to: timeTo },
            aggregation: aggregation,
            metrics: metrics,
            results: combinedResults,
            meta: {
                totalSensors: sensorIds.length,
                queryTime: Date.now(),
                rowsRead: totalRowsRead
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
        
        return apiError('internal_error', 'Failed to generate statistics', 500);
    }
}

