/**
 * Spatial Analysis API Endpoint
 * Provides geographic analysis with regional statistics and interpolation data
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
        const gridSize = parseInt(url.searchParams.get('gridSize')) || 10; // For interpolation grid

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

        // Build metrics selection for SQL
        const metricColumns = metrics.map(metric => {
            const column = metric === 'humidity' ? 'relative_humidity' : metric;
            return `AVG(${column}) as avg_${metric}`;
        }).join(',');

        // Build placeholders for sensor IDs
        const sensorPlaceholders = sensorIds.map((_, index) => `?${index + 3}`).join(',');

        // Get sensor locations and averaged data for the time period
        const spatialQuery = `
            SELECT 
                s.device_id,
                s.name,
                s.lat,
                s.long,
                ${metricColumns},
                COUNT(*) as reading_count
            FROM sensors s
            LEFT JOIN sensor_readings sr ON s.device_id = sr.device_id
            WHERE s.device_id IN (${sensorPlaceholders})
                AND (sr.event_time IS NULL OR (sr.event_time >= ?1 AND sr.event_time <= ?2))
            GROUP BY s.device_id, s.name, s.lat, s.long
        `;

        const spatialResult = await context.env.READINGS_TABLE.prepare(spatialQuery)
            .bind(timeFrom, timeTo, ...sensorIds)
            .all();

        if (!spatialResult.success) {
            throw new Error('Database query failed');
        }

        const sensorData = spatialResult.results.map(row => ({
            device_id: row.device_id,
            name: row.name,
            lat: row.lat,
            long: row.long,
            reading_count: row.reading_count,
            metrics: metrics.reduce((acc, metric) => {
                acc[metric] = row[`avg_${metric}`];
                return acc;
            }, {})
        }));

        // Filter out sensors without location data
        const validSensors = sensorData.filter(sensor => 
            sensor.lat !== null && sensor.long !== null
        );

        if (validSensors.length === 0) {
            return new Response(JSON.stringify({
                error: 'No sensors with valid location data found'
            }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }

        // Calculate bounding box
        const lats = validSensors.map(s => s.lat);
        const longs = validSensors.map(s => s.long);
        const bounds = {
            minLat: Math.min(...lats),
            maxLat: Math.max(...lats),
            minLong: Math.min(...longs),
            maxLong: Math.max(...longs)
        };

        // Add padding to bounds (10%)
        const latPadding = (bounds.maxLat - bounds.minLat) * 0.1;
        const longPadding = (bounds.maxLong - bounds.minLong) * 0.1;
        bounds.minLat -= latPadding;
        bounds.maxLat += latPadding;
        bounds.minLong -= longPadding;
        bounds.maxLong += longPadding;

        // Calculate regional statistics
        const regionalStats = {};
        metrics.forEach(metric => {
            const values = validSensors
                .map(s => s.metrics[metric])
                .filter(val => val !== null && val !== undefined);
            
            if (values.length > 0) {
                const sorted = values.sort((a, b) => a - b);
                const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
                const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
                
                regionalStats[metric] = {
                    mean: mean,
                    median: sorted[Math.floor(sorted.length / 2)],
                    min: sorted[0],
                    max: sorted[sorted.length - 1],
                    stdDev: Math.sqrt(variance),
                    count: values.length
                };
            } else {
                regionalStats[metric] = null;
            }
        });

        // Generate interpolation grid using inverse distance weighting (IDW)
        const interpolationData = {};
        metrics.forEach(metric => {
            const grid = [];
            const latStep = (bounds.maxLat - bounds.minLat) / gridSize;
            const longStep = (bounds.maxLong - bounds.minLong) / gridSize;
            
            for (let i = 0; i <= gridSize; i++) {
                for (let j = 0; j <= gridSize; j++) {
                    const gridLat = bounds.minLat + i * latStep;
                    const gridLong = bounds.minLong + j * longStep;
                    
                    // Calculate IDW interpolated value
                    let weightedSum = 0;
                    let weightSum = 0;
                    
                    validSensors.forEach(sensor => {
                        const value = sensor.metrics[metric];
                        if (value !== null && value !== undefined) {
                            // Calculate distance using Haversine formula (simplified for small distances)
                            const latDiff = (sensor.lat - gridLat) * Math.PI / 180;
                            const longDiff = (sensor.long - gridLong) * Math.PI / 180;
                            const distance = Math.sqrt(latDiff * latDiff + longDiff * longDiff);
                            
                            // Avoid division by zero for exact matches
                            const weight = distance === 0 ? 1e10 : 1 / Math.pow(distance, 2);
                            
                            weightedSum += value * weight;
                            weightSum += weight;
                        }
                    });
                    
                    const interpolatedValue = weightSum > 0 ? weightedSum / weightSum : null;
                    
                    grid.push({
                        lat: gridLat,
                        long: gridLong,
                        value: interpolatedValue
                    });
                }
            }
            
            interpolationData[metric] = grid;
        });

        // Calculate distance-based correlations
        const distanceCorrelations = {};
        metrics.forEach(metric => {
            const correlations = [];
            
            for (let i = 0; i < validSensors.length; i++) {
                for (let j = i + 1; j < validSensors.length; j++) {
                    const sensor1 = validSensors[i];
                    const sensor2 = validSensors[j];
                    
                    const val1 = sensor1.metrics[metric];
                    const val2 = sensor2.metrics[metric];
                    
                    if (val1 !== null && val1 !== undefined && 
                        val2 !== null && val2 !== undefined) {
                        
                        // Calculate distance between sensors
                        const latDiff = (sensor1.lat - sensor2.lat) * Math.PI / 180;
                        const longDiff = (sensor1.long - sensor2.long) * Math.PI / 180;
                        const distance = Math.sqrt(latDiff * latDiff + longDiff * longDiff) * 6371000; // Convert to meters
                        
                        // Calculate value difference
                        const valueDiff = Math.abs(val1 - val2);
                        
                        correlations.push({
                            distance: distance,
                            valueDifference: valueDiff,
                            sensor1: sensor1.device_id,
                            sensor2: sensor2.device_id
                        });
                    }
                }
            }
            
            // Calculate correlation coefficient between distance and value difference
            if (correlations.length > 1) {
                const n = correlations.length;
                const sumDist = correlations.reduce((sum, c) => sum + c.distance, 0);
                const sumDiff = correlations.reduce((sum, c) => sum + c.valueDifference, 0);
                const sumDistDiff = correlations.reduce((sum, c) => sum + c.distance * c.valueDifference, 0);
                const sumDistSq = correlations.reduce((sum, c) => sum + c.distance * c.distance, 0);
                const sumDiffSq = correlations.reduce((sum, c) => sum + c.valueDifference * c.valueDifference, 0);
                
                const num = n * sumDistDiff - sumDist * sumDiff;
                const den = Math.sqrt((n * sumDistSq - sumDist * sumDist) * (n * sumDiffSq - sumDiff * sumDiff));
                
                distanceCorrelations[metric] = {
                    correlation: den !== 0 ? num / den : 0,
                    sampleSize: n,
                    interpretation: den !== 0 && (num / den) > 0.3 ? 'spatial_autocorrelation' : 'no_clear_pattern'
                };
            } else {
                distanceCorrelations[metric] = null;
            }
        });

        // Identify hotspots and coldspots
        const hotspots = {};
        metrics.forEach(metric => {
            const values = validSensors
                .map(s => ({ ...s, value: s.metrics[metric] }))
                .filter(s => s.value !== null && s.value !== undefined);
            
            if (values.length > 0) {
                const sorted = values.sort((a, b) => b.value - a.value);
                const threshold = Math.ceil(values.length * 0.2); // Top/bottom 20%
                
                hotspots[metric] = {
                    hotspots: sorted.slice(0, threshold).map(s => ({
                        device_id: s.device_id,
                        name: s.name,
                        lat: s.lat,
                        long: s.long,
                        value: s.value
                    })),
                    coldspots: sorted.slice(-threshold).map(s => ({
                        device_id: s.device_id,
                        name: s.name,
                        lat: s.lat,
                        long: s.long,
                        value: s.value
                    }))
                };
            } else {
                hotspots[metric] = { hotspots: [], coldspots: [] };
            }
        });

        // Calculate cache duration based on data age
        const dataAge = Date.now() - timeTo;
        const cacheMaxAge = dataAge > 3600000 ? 1800 : 300;

        return new Response(JSON.stringify({
            timeRange: { from: timeFrom, to: timeTo },
            metrics: metrics,
            bounds: bounds,
            sensorData: validSensors,
            regionalStats: regionalStats,
            interpolationData: interpolationData,
            distanceCorrelations: distanceCorrelations,
            hotspots: hotspots,
            meta: {
                totalSensors: validSensors.length,
                gridSize: gridSize,
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
        console.error('Spatial analysis error:', error);
        
        return new Response(JSON.stringify({
            error: 'Failed to generate spatial analysis',
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
