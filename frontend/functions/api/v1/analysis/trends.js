/**
 * Trend Analysis API Endpoint
 * Provides long-term trend analysis with moving averages and seasonal patterns
 */
export async function onRequest(context) {
    if (context.request.method !== 'GET') {
        return new Response('Method not allowed', { status: 405 });
    }

    try {
        const url = new URL(context.request.url);
        const sensorIds = url.searchParams.get('sensors')?.split(',') || [];
        const timeFrom = parseInt(url.searchParams.get('from')) || (Date.now() - 30 * 24 * 60 * 60 * 1000); // Default 30 days
        const timeTo = parseInt(url.searchParams.get('to')) || Date.now();
        const metrics = url.searchParams.get('metrics')?.split(',') || ['pm2_5', 'temperature', 'relative_humidity'];
        const aggregation = url.searchParams.get('aggregation') || 'daily';

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

        // Build time bucket based on aggregation level
        let timeBucket, bucketSize;
        switch (aggregation) {
            case 'hourly':
                timeBucket = 'CAST(event_time / 3600000 AS INTEGER) * 3600000';
                bucketSize = 3600000; // 1 hour in ms
                break;
            case 'daily':
                timeBucket = 'CAST(event_time / 86400000 AS INTEGER) * 86400000';
                bucketSize = 86400000; // 1 day in ms
                break;
            case 'weekly':
                timeBucket = 'CAST(event_time / 604800000 AS INTEGER) * 604800000';
                bucketSize = 604800000; // 1 week in ms
                break;
            default:
                timeBucket = 'CAST(event_time / 86400000 AS INTEGER) * 86400000';
                bucketSize = 86400000;
        }

        // Build metrics selection for SQL
        const metricColumns = metrics.map(metric => {
            const column = metric === 'humidity' ? 'relative_humidity' : metric;
            return `AVG(${column}) as avg_${metric}`;
        }).join(',');

        // Build placeholders for sensor IDs
        const sensorPlaceholders = sensorIds.map((_, index) => `?${index + 3}`).join(',');

        // Get time series data for trend analysis
        const trendQuery = `
            SELECT 
                device_id,
                ${timeBucket} as time_bucket,
                ${metricColumns}
            FROM sensor_readings 
            WHERE device_id IN (${sensorPlaceholders})
                AND event_time >= ?1 
                AND event_time <= ?2
            GROUP BY device_id, time_bucket
            ORDER BY device_id, time_bucket ASC
        `;

        const trendResult = await context.env.READINGS_TABLE.prepare(trendQuery)
            .bind(timeFrom, timeTo, ...sensorIds)
            .all();

        if (!trendResult.success) {
            throw new Error('Database query failed');
        }

        // Organize data by sensor
        const sensorTrendData = {};
        sensorIds.forEach(sensorId => {
            sensorTrendData[sensorId] = {};
            metrics.forEach(metric => {
                sensorTrendData[sensorId][metric] = [];
            });
        });

        // Process results
        trendResult.results.forEach(row => {
            const sensorId = row.device_id;
            const timestamp = row.time_bucket;
            
            metrics.forEach(metric => {
                const value = row[`avg_${metric}`];
                if (value !== null && value !== undefined) {
                    sensorTrendData[sensorId][metric].push({
                        timestamp: timestamp,
                        value: value
                    });
                }
            });
        });

        // Calculate trends and moving averages for each sensor and metric
        const analysisResults = {};
        
        sensorIds.forEach(sensorId => {
            analysisResults[sensorId] = {};
            
            metrics.forEach(metric => {
                const data = sensorTrendData[sensorId][metric];
                
                if (data.length < 2) {
                    analysisResults[sensorId][metric] = {
                        trend: null,
                        movingAverage: [],
                        seasonalPattern: null,
                        changePoints: []
                    };
                    return;
                }

                // Sort by timestamp
                data.sort((a, b) => a.timestamp - b.timestamp);

                // Calculate linear trend using least squares regression
                const n = data.length;
                const sumX = data.reduce((sum, point, index) => sum + index, 0);
                const sumY = data.reduce((sum, point) => sum + point.value, 0);
                const sumXY = data.reduce((sum, point, index) => sum + index * point.value, 0);
                const sumXX = data.reduce((sum, point, index) => sum + index * index, 0);

                const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
                const intercept = (sumY - slope * sumX) / n;

                // Calculate R-squared
                const meanY = sumY / n;
                const ssRes = data.reduce((sum, point, index) => {
                    const predicted = slope * index + intercept;
                    return sum + Math.pow(point.value - predicted, 2);
                }, 0);
                const ssTot = data.reduce((sum, point) => {
                    return sum + Math.pow(point.value - meanY, 2);
                }, 0);
                const rSquared = ssTot !== 0 ? 1 - (ssRes / ssTot) : 0;

                // Calculate moving averages (7-period for daily, 24-period for hourly)
                const windowSize = aggregation === 'hourly' ? 24 : 7;
                const movingAverage = [];
                
                for (let i = windowSize - 1; i < data.length; i++) {
                    const window = data.slice(i - windowSize + 1, i + 1);
                    const avg = window.reduce((sum, point) => sum + point.value, 0) / window.length;
                    movingAverage.push({
                        timestamp: data[i].timestamp,
                        value: avg
                    });
                }

                // Detect seasonal patterns (simplified - look for weekly/monthly cycles)
                let seasonalPattern = null;
                if (data.length >= 14) { // Need at least 2 weeks of data
                    const cycleLengths = aggregation === 'daily' ? [7, 30] : [24, 168]; // daily: week/month, hourly: day/week
                    
                    for (const cycleLength of cycleLengths) {
                        if (data.length >= cycleLength * 2) {
                            const cycles = Math.floor(data.length / cycleLength);
                            const cycleAverages = [];
                            
                            for (let cycle = 0; cycle < cycles; cycle++) {
                                const cycleData = data.slice(cycle * cycleLength, (cycle + 1) * cycleLength);
                                const cycleAvg = cycleData.reduce((sum, point) => sum + point.value, 0) / cycleData.length;
                                cycleAverages.push(cycleAvg);
                            }
                            
                            // Calculate coefficient of variation to detect seasonality
                            const cycleMean = cycleAverages.reduce((sum, avg) => sum + avg, 0) / cycleAverages.length;
                            const cycleStdDev = Math.sqrt(
                                cycleAverages.reduce((sum, avg) => sum + Math.pow(avg - cycleMean, 2), 0) / cycleAverages.length
                            );
                            const coefficientOfVariation = cycleStdDev / cycleMean;
                            
                            if (coefficientOfVariation > 0.1) { // Threshold for detecting seasonality
                                seasonalPattern = {
                                    cycleLength: cycleLength,
                                    cycleLengthLabel: cycleLength === 7 ? 'weekly' : 
                                                    cycleLength === 30 ? 'monthly' : 
                                                    cycleLength === 24 ? 'daily' : 
                                                    cycleLength === 168 ? 'weekly' : 'custom',
                                    strength: coefficientOfVariation,
                                    averages: cycleAverages
                                };
                                break;
                            }
                        }
                    }
                }

                // Simple change point detection (look for significant changes in trend)
                const changePoints = [];
                const segmentSize = Math.max(Math.floor(data.length / 10), 5); // At least 5 points per segment
                
                for (let i = segmentSize; i < data.length - segmentSize; i += segmentSize) {
                    const beforeSegment = data.slice(Math.max(0, i - segmentSize), i);
                    const afterSegment = data.slice(i, Math.min(data.length, i + segmentSize));
                    
                    const beforeMean = beforeSegment.reduce((sum, point) => sum + point.value, 0) / beforeSegment.length;
                    const afterMean = afterSegment.reduce((sum, point) => sum + point.value, 0) / afterSegment.length;
                    
                    const change = Math.abs(afterMean - beforeMean);
                    const threshold = meanY * 0.2; // 20% change threshold
                    
                    if (change > threshold) {
                        changePoints.push({
                            timestamp: data[i].timestamp,
                            beforeValue: beforeMean,
                            afterValue: afterMean,
                            changePercent: ((afterMean - beforeMean) / beforeMean) * 100
                        });
                    }
                }

                analysisResults[sensorId][metric] = {
                    trend: {
                        slope: slope,
                        intercept: intercept,
                        rSquared: rSquared,
                        direction: slope > 0.01 ? 'increasing' : slope < -0.01 ? 'decreasing' : 'stable',
                        significance: rSquared > 0.5 ? 'strong' : rSquared > 0.2 ? 'moderate' : 'weak'
                    },
                    movingAverage: movingAverage,
                    seasonalPattern: seasonalPattern,
                    changePoints: changePoints,
                    rawData: data
                };
            });
        });

        // Get sensor names
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
            analysis: analysisResults,
            meta: {
                totalSensors: sensorIds.length,
                bucketSize: bucketSize,
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
        console.error('Trend analysis error:', error);
        
        return new Response(JSON.stringify({
            error: 'Failed to generate trend analysis',
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
