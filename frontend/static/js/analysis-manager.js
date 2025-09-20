/**
 * Analysis Manager for Environmental Monitoring Dashboard
 * Handles all analysis functionality and visualization
 */

// Analysis state management
const AnalysisState = {
    selectedSensors: [],
    timeRange: 604800000, // 7 days default
    customTimeRange: { from: null, to: null },
    aggregationLevel: 'hourly',
    selectedMetrics: ['pm2_5', 'temperature', 'humidity'],
    currentAnalysisType: 'statistical',
    analysisResults: {},
    charts: {},
    isLoading: false,
    sensors: [],
    availableSensors: new Set(),
    availabilityCache: new Map(),
    availabilityCheckTimeout: null
};

const AnalysisManager = {
    // Initialize the analysis manager
    async init() {
        try {
            // Load available sensors
            await this.loadSensors();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Update UI state
            this.updateUI();
            
            console.log('Analysis Manager initialized');
        } catch (error) {
            console.error('Failed to initialize Analysis Manager:', error);
            Utils.showNotification('Failed to initialize analysis tools', 'danger');
        }
    },

    // Load available sensors
    async loadSensors() {
        try {
            const response = await fetch(`${API_BASE}/sensors`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const sensors = await response.json();
            AnalysisState.sensors = Object.values(sensors);
            
            // Check availability for current time range
            await this.checkSensorAvailability();
            
            this.renderSensorSelector();
        } catch (error) {
            console.error('Error loading sensors:', error);
            Utils.showNotification('Failed to load sensors', 'danger');
        }
    },

    // Check sensor data availability for current time range
    async checkSensorAvailability() {
        const timeRange = this.getTimeRange();
        const cacheKey = `${timeRange.from}-${timeRange.to}`;
        
        // Check cache first
        if (AnalysisState.availabilityCache.has(cacheKey)) {
            const cachedData = AnalysisState.availabilityCache.get(cacheKey);
            // Check if cache is still valid (5 minutes for recent data, 30 minutes for historical)
            const cacheAge = Date.now() - cachedData.timestamp;
            const maxAge = (Date.now() - timeRange.to) > 3600000 ? 1800000 : 300000;
            
            if (cacheAge < maxAge) {
                AnalysisState.availableSensors = new Set(cachedData.sensors);
                return;
            }
        }

        try {
            const params = new URLSearchParams({
                from: timeRange.from.toString(),
                to: timeRange.to.toString()
            });

            const response = await fetch(`${API_BASE}/sensors/availability?${params}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            AnalysisState.availableSensors = new Set(data.availableSensors);
            
            // Cache the results
            AnalysisState.availabilityCache.set(cacheKey, {
                sensors: data.availableSensors,
                timestamp: Date.now()
            });
            
            // Limit cache size to prevent memory issues
            if (AnalysisState.availabilityCache.size > 20) {
                const firstKey = AnalysisState.availabilityCache.keys().next().value;
                AnalysisState.availabilityCache.delete(firstKey);
            }
            
            console.log(`Found ${data.availableSensors.length} sensors with data in selected time range (${data.rowsRead || 0} rows read)`);
            
        } catch (error) {
            console.error('Error checking sensor availability:', error);
            // On error, assume all sensors are available to avoid blocking the UI
            AnalysisState.availableSensors = new Set(AnalysisState.sensors.map(s => s.device_id));
        }
    },

    // Debounced availability check for time range changes
    debouncedAvailabilityCheck() {
        if (AnalysisState.availabilityCheckTimeout) {
            clearTimeout(AnalysisState.availabilityCheckTimeout);
        }
        
        AnalysisState.availabilityCheckTimeout = setTimeout(async () => {
            await this.checkSensorAvailability();
            this.renderSensorSelector();
            this.updateUI();
        }, 500); // 500ms debounce
    },

    // Render sensor selection interface
    renderSensorSelector() {
        const container = document.getElementById('sensor-selector');
        if (!container) return;

        if (AnalysisState.sensors.length === 0) {
            container.innerHTML = '<p class="text-muted">No sensors available</p>';
            return;
        }

        const availableCount = AnalysisState.sensors.filter(s => AnalysisState.availableSensors.has(s.device_id)).length;
        const totalCount = AnalysisState.sensors.length;

        let headerHTML = '';
        if (totalCount > 0) {
            headerHTML = `
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <small class="text-muted">
                        ${availableCount} of ${totalCount} sensors have data in selected time range
                    </small>
                    ${availableCount < totalCount ? 
                        '<small class="text-warning"><i class="fas fa-exclamation-triangle"></i> Some sensors unavailable</small>' : 
                        '<small class="text-success"><i class="fas fa-check-circle"></i> All sensors available</small>'
                    }
                </div>
            `;
        }

        const sensorHTML = AnalysisState.sensors.map(sensor => {
            const isAvailable = AnalysisState.availableSensors.has(sensor.device_id);
            const isSelected = AnalysisState.selectedSensors.includes(sensor.device_id);
            
            return `
                <div class="form-check ${!isAvailable ? 'opacity-50' : ''}">
                    <input class="form-check-input" type="checkbox" value="${sensor.device_id}" 
                           id="sensor-${sensor.device_id}" 
                           ${isSelected ? 'checked' : ''}
                           ${!isAvailable ? 'disabled' : ''}
                           onchange="AnalysisManager.toggleSensor('${sensor.device_id}')">
                    <label class="form-check-label d-flex justify-content-between align-items-center" for="sensor-${sensor.device_id}">
                        <span>${sensor.name || sensor.device_id}</span>
                        ${!isAvailable ? 
                            '<small class="text-muted ms-2"><i class="fas fa-ban"></i> No data</small>' : 
                            '<small class="text-success ms-2"><i class="fas fa-check"></i></small>'
                        }
                    </label>
                </div>
            `;
        }).join('');

        container.innerHTML = headerHTML + sensorHTML;
    },

    // Toggle sensor selection
    toggleSensor(sensorId) {
        const index = AnalysisState.selectedSensors.indexOf(sensorId);
        if (index > -1) {
            AnalysisState.selectedSensors.splice(index, 1);
        } else {
            AnalysisState.selectedSensors.push(sensorId);
        }
        
        this.updateUI();
    },

    // Select all available sensors
    selectAllSensors() {
        // Only select sensors that have data available
        AnalysisState.selectedSensors = AnalysisState.sensors
            .filter(s => AnalysisState.availableSensors.has(s.device_id))
            .map(s => s.device_id);
        
        // Update checkboxes
        AnalysisState.sensors.forEach(sensor => {
            const checkbox = document.getElementById(`sensor-${sensor.device_id}`);
            if (checkbox && !checkbox.disabled) {
                checkbox.checked = AnalysisState.availableSensors.has(sensor.device_id);
            }
        });
        
        this.updateUI();
    },

    // Clear sensor selection
    clearSensorSelection() {
        AnalysisState.selectedSensors = [];
        
        // Update checkboxes
        AnalysisState.sensors.forEach(sensor => {
            const checkbox = document.getElementById(`sensor-${sensor.device_id}`);
            if (checkbox) checkbox.checked = false;
        });
        
        this.updateUI();
    },

    // Set time range
    setTimeRange(value) {
        if (value === 'custom') {
            document.getElementById('custom-date-range').classList.remove('d-none');
            AnalysisState.timeRange = null;
        } else {
            document.getElementById('custom-date-range').classList.add('d-none');
            AnalysisState.timeRange = parseInt(value);
            AnalysisState.customTimeRange = { from: null, to: null };
        }
        
        // Trigger availability check for new time range
        this.debouncedAvailabilityCheck();
        this.updateUI();
    },

    // Update custom time range
    updateCustomRange() {
        const startDate = document.getElementById('start-date').value;
        const endDate = document.getElementById('end-date').value;
        
        if (startDate && endDate) {
            AnalysisState.customTimeRange = {
                from: new Date(startDate).getTime(),
                to: new Date(endDate).getTime()
            };
            AnalysisState.timeRange = null;
            
            // Trigger availability check for new time range
            this.debouncedAvailabilityCheck();
        }
        
        this.updateUI();
    },

    // Get selected metrics
    getSelectedMetrics() {
        const checkboxes = document.querySelectorAll('.form-selectgroup-input:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    },

    // Get time range for API calls
    getTimeRange() {
        if (AnalysisState.customTimeRange.from && AnalysisState.customTimeRange.to) {
            return {
                from: AnalysisState.customTimeRange.from,
                to: AnalysisState.customTimeRange.to
            };
        } else if (AnalysisState.timeRange) {
            return {
                from: Date.now() - AnalysisState.timeRange,
                to: Date.now()
            };
        } else {
            // Default to 7 days
            return {
                from: Date.now() - 604800000,
                to: Date.now()
            };
        }
    },

    // Run analysis based on current settings
    async runAnalysis() {
        if (AnalysisState.selectedSensors.length === 0) {
            Utils.showNotification('Please select at least one sensor', 'warning');
            return;
        }

        AnalysisState.isLoading = true;
        this.updateLoadingState(true);

        try {
            const timeRange = this.getTimeRange();
            const metrics = this.getSelectedMetrics();
            const aggregation = document.getElementById('aggregation-level').value;

            // Get current active tab
            const activeTab = document.querySelector('.analysis-type-tabs .nav-link.active');
            const analysisType = activeTab ? activeTab.id.replace('-tab', '') : 'statistical';

            switch (analysisType) {
                case 'statistical':
                    await this.runStatisticalAnalysis(timeRange, metrics, aggregation);
                    break;
                case 'comparative':
                    await this.runComparativeAnalysis(timeRange, metrics, aggregation);
                    break;
                case 'trend':
                    await this.runTrendAnalysis(timeRange, metrics, aggregation);
                    break;
                case 'spatial':
                    await this.runSpatialAnalysis(timeRange, metrics);
                    break;
            }

            Utils.showNotification('Analysis completed successfully', 'success');
            document.getElementById('export-btn').disabled = false;

        } catch (error) {
            console.error('Analysis error:', error);
            Utils.showNotification('Analysis failed: ' + error.message, 'danger');
        } finally {
            AnalysisState.isLoading = false;
            this.updateLoadingState(false);
        }
    },

    // Run statistical analysis
    async runStatisticalAnalysis(timeRange, metrics, aggregation) {
        const params = new URLSearchParams({
            sensors: AnalysisState.selectedSensors.join(','),
            from: timeRange.from.toString(),
            to: timeRange.to.toString(),
            metrics: metrics.join(','),
            aggregation: aggregation
        });

        const response = await fetch(`${API_BASE}/analysis/statistics?${params}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        AnalysisState.analysisResults.statistical = data;

        this.renderStatisticalResults(data);
    },

    // Run comparative analysis
    async runComparativeAnalysis(timeRange, metrics, aggregation) {
        if (AnalysisState.selectedSensors.length < 2) {
            throw new Error('At least 2 sensors required for comparison');
        }

        const params = new URLSearchParams({
            sensors: AnalysisState.selectedSensors.join(','),
            from: timeRange.from.toString(),
            to: timeRange.to.toString(),
            metrics: metrics.join(','),
            aggregation: aggregation
        });

        const response = await fetch(`${API_BASE}/analysis/compare?${params}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        AnalysisState.analysisResults.comparative = data;

        this.renderComparativeResults(data);
    },

    // Run trend analysis
    async runTrendAnalysis(timeRange, metrics, aggregation) {
        const params = new URLSearchParams({
            sensors: AnalysisState.selectedSensors.join(','),
            from: timeRange.from.toString(),
            to: timeRange.to.toString(),
            metrics: metrics.join(','),
            aggregation: aggregation
        });

        const response = await fetch(`${API_BASE}/analysis/trends?${params}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        AnalysisState.analysisResults.trend = data;

        this.renderTrendResults(data);
    },

    // Run spatial analysis
    async runSpatialAnalysis(timeRange, metrics) {
        const params = new URLSearchParams({
            sensors: AnalysisState.selectedSensors.join(','),
            from: timeRange.from.toString(),
            to: timeRange.to.toString(),
            metrics: metrics.join(',')
        });

        const response = await fetch(`${API_BASE}/analysis/spatial?${params}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        AnalysisState.analysisResults.spatial = data;

        this.renderSpatialResults(data);
    },

    // Render statistical analysis results
    renderStatisticalResults(data) {
        // Update summary metrics
        if (data.results.length > 0) {
            const firstResult = data.results[0];
            const totalReadings = data.results.reduce((sum, r) => sum + r.total_readings, 0);
            
            document.getElementById('total-readings').textContent = totalReadings.toLocaleString();
            
            if (firstResult.statistics.pm2_5) {
                document.getElementById('avg-pm25').textContent = 
                    firstResult.statistics.pm2_5.mean?.toFixed(1) || '-';
            }
            
            if (firstResult.statistics.temperature) {
                document.getElementById('avg-temp').textContent = 
                    firstResult.statistics.temperature.mean?.toFixed(1) || '-';
            }
            
            if (firstResult.statistics.humidity) {
                document.getElementById('avg-humidity').textContent = 
                    firstResult.statistics.humidity.mean?.toFixed(1) || '-';
            }
        }

        // Update statistics table
        this.renderStatisticsTable(data);
        
        // Create distribution chart
        this.createDistributionChart(data);
    },

    // Render statistics table
    renderStatisticsTable(data) {
        const tableBody = document.querySelector('#statistics-table tbody');
        if (!tableBody) return;

        let html = '';
        
        data.metrics.forEach(metric => {
            const stats = data.results[0]?.statistics[metric];
            if (stats) {
                html += `
                    <tr>
                        <td><strong>${this.getMetricLabel(metric)}</strong></td>
                        <td>${stats.mean?.toFixed(2) || '-'}</td>
                        <td>${stats.median?.toFixed(2) || '-'}</td>
                        <td>${stats.stdDev?.toFixed(2) || '-'}</td>
                        <td>${stats.min?.toFixed(2) || '-'}</td>
                        <td>${stats.max?.toFixed(2) || '-'}</td>
                        <td>${stats.p25?.toFixed(2) || '-'}</td>
                        <td>${stats.p75?.toFixed(2) || '-'}</td>
                    </tr>
                `;
            }
        });

        tableBody.innerHTML = html;
    },

    // Create distribution chart
    createDistributionChart(data) {
        const container = document.getElementById('distribution-chart');
        if (!container) return;

        // For now, create a simple histogram for PM2.5
        const firstResult = data.results[0];
        if (!firstResult?.statistics.pm2_5) return;

        const stats = firstResult.statistics.pm2_5;
        
        const options = {
            series: [{
                name: 'Distribution',
                data: [
                    { x: 'Min', y: stats.min || 0 },
                    { x: '25th %ile', y: stats.p25 || 0 },
                    { x: 'Median', y: stats.median || 0 },
                    { x: 'Mean', y: stats.mean || 0 },
                    { x: '75th %ile', y: stats.p75 || 0 },
                    { x: 'Max', y: stats.max || 0 }
                ]
            }],
            chart: {
                type: 'bar',
                height: 350
            },
            title: {
                text: 'PM2.5 Distribution'
            },
            xaxis: {
                type: 'category'
            },
            yaxis: {
                title: {
                    text: 'PM2.5 (μg/m³)'
                },
                labels: {
                    formatter: function (val) {
                        return val?.toFixed(2) || '0.00';
                    }
                }
            },
            dataLabels: {
                enabled: true,
                formatter: function (val) {
                    return val?.toFixed(2) || '0.00';
                }
            },
            tooltip: {
                y: {
                    formatter: function (val) {
                        return val?.toFixed(2) + ' μg/m³' || '0.00 μg/m³';
                    }
                }
            }
        };

        if (AnalysisState.charts.distribution) {
            AnalysisState.charts.distribution.destroy();
        }

        AnalysisState.charts.distribution = new ApexCharts(container, options);
        AnalysisState.charts.distribution.render();
    },

    // Render comparative analysis results
    renderComparativeResults(data) {
        this.createComparisonChart(data);
        this.renderCorrelationMatrix(data);
    },

    // Create comparison chart
    createComparisonChart(data) {
        const container = document.getElementById('comparison-chart');
        if (!container) return;

        const series = [];
        
        // Create series for each sensor and metric combination
        data.sensors.forEach(sensor => {
            data.metrics.forEach(metric => {
                const seriesData = data.timeSeriesData.map(point => ({
                    x: point.timestamp,
                    y: point[`${sensor.id}_${metric}`]
                })).filter(point => point.y !== null);

                if (seriesData.length > 0) {
                    series.push({
                        name: `${sensor.name || sensor.id} - ${this.getMetricLabel(metric)}`,
                        data: seriesData
                    });
                }
            });
        });

        const options = {
            series: series,
            chart: {
                type: 'line',
                height: 350,
                zoom: {
                    enabled: true
                }
            },
            title: {
                text: 'Sensor Comparison'
            },
            xaxis: {
                type: 'datetime'
            },
            yaxis: {
                title: {
                    text: 'Values'
                },
                labels: {
                    formatter: function (val) {
                        return val?.toFixed(2) || '0.00';
                    }
                }
            },
            legend: {
                position: 'top'
            },
            tooltip: {
                y: {
                    formatter: function (val) {
                        return val?.toFixed(2) || '0.00';
                    }
                }
            }
        };

        if (AnalysisState.charts.comparison) {
            AnalysisState.charts.comparison.destroy();
        }

        AnalysisState.charts.comparison = new ApexCharts(container, options);
        AnalysisState.charts.comparison.render();
    },

    // Render correlation matrix
    renderCorrelationMatrix(data) {
        const container = document.getElementById('correlation-matrix');
        if (!container) return;

        let html = '<table class="table correlation-matrix"><thead><tr><th>Sensor Pair</th>';
        
        data.metrics.forEach(metric => {
            html += `<th>${this.getMetricLabel(metric)}</th>`;
        });
        html += '</tr></thead><tbody>';

        Object.keys(data.correlations).forEach(pairKey => {
            const [sensor1, sensor2] = pairKey.split('_');
            html += `<tr><td><strong>${sensor1} vs ${sensor2}</strong></td>`;
            
            data.metrics.forEach(metric => {
                const correlation = data.correlations[pairKey][metric];
                const cellClass = this.getCorrelationClass(correlation);
                html += `<td class="correlation-cell ${cellClass}">
                    ${correlation !== null ? correlation.toFixed(3) : 'N/A'}
                </td>`;
            });
            html += '</tr>';
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    },

    // Render trend analysis results
    renderTrendResults(data) {
        this.createTrendChart(data);
        this.createSeasonalChart(data);
        this.createMovingAverageChart(data);
    },

    // Create trend chart
    createTrendChart(data) {
        const container = document.getElementById('trend-chart');
        if (!container) return;

        const series = [];
        
        Object.keys(data.analysis).forEach(sensorId => {
            data.metrics.forEach(metric => {
                const sensorData = data.analysis[sensorId][metric];
                if (sensorData && sensorData.rawData.length > 0) {
                    const rawSeries = {
                        name: `${sensorId} - ${this.getMetricLabel(metric)}`,
                        data: sensorData.rawData.map(point => ({
                            x: point.timestamp,
                            y: point.value
                        }))
                    };
                    
                    // Add trend line if available
                    if (sensorData.trend && sensorData.trend.slope !== null) {
                        const trendSeries = {
                            name: `${sensorId} - ${this.getMetricLabel(metric)} Trend`,
                            data: sensorData.rawData.map((point, index) => ({
                                x: point.timestamp,
                                y: sensorData.trend.slope * index + sensorData.trend.intercept
                            })),
                            type: 'line',
                            stroke: {
                                dashArray: 5
                            }
                        };
                        series.push(rawSeries, trendSeries);
                    } else {
                        series.push(rawSeries);
                    }
                }
            });
        });

        const options = {
            series: series,
            chart: {
                type: 'line',
                height: 350,
                zoom: {
                    enabled: true
                }
            },
            title: {
                text: 'Long-term Trends'
            },
            xaxis: {
                type: 'datetime'
            },
            yaxis: {
                title: {
                    text: 'Values'
                },
                labels: {
                    formatter: function (val) {
                        return val?.toFixed(2) || '0.00';
                    }
                }
            },
            tooltip: {
                y: {
                    formatter: function (val) {
                        return val?.toFixed(2) || '0.00';
                    }
                }
            }
        };

        if (AnalysisState.charts.trend) {
            AnalysisState.charts.trend.destroy();
        }

        AnalysisState.charts.trend = new ApexCharts(container, options);
        AnalysisState.charts.trend.render();
    },

    // Create seasonal chart with actual data
    createSeasonalChart(data) {
        const container = document.getElementById('seasonal-chart');
        if (!container) return;

        const series = [];
        let hasSeasonalData = false;

        // Process seasonal patterns from each sensor and metric
        Object.keys(data.analysis).forEach(sensorId => {
            const sensorName = data.sensors.find(s => s.id === sensorId)?.name || sensorId;
            
            data.metrics.forEach(metric => {
                const sensorData = data.analysis[sensorId][metric];
                if (sensorData && sensorData.seasonalPattern) {
                    hasSeasonalData = true;
                    const pattern = sensorData.seasonalPattern;
                    
                    // Create categories based on cycle length
                    let categories = [];
                    if (pattern.cycleLengthLabel === 'weekly') {
                        categories = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                    } else if (pattern.cycleLengthLabel === 'daily') {
                        categories = Array.from({length: 24}, (_, i) => `${i}:00`);
                    } else if (pattern.cycleLengthLabel === 'monthly') {
                        categories = Array.from({length: 30}, (_, i) => `Day ${i + 1}`);
                    } else {
                        categories = Array.from({length: pattern.cycleLength}, (_, i) => `Period ${i + 1}`);
                    }

                    // Ensure we have the right number of data points
                    const dataPoints = pattern.averages.slice(0, categories.length);
                    while (dataPoints.length < categories.length) {
                        dataPoints.push(null);
                    }

                    series.push({
                        name: `${sensorName} - ${this.getMetricLabel(metric)} (${pattern.cycleLengthLabel})`,
                        data: dataPoints,
                        type: 'line'
                    });
                }
            });
        });

        // If no seasonal data found, show a message
        if (!hasSeasonalData) {
            container.innerHTML = `
                <div class="d-flex align-items-center justify-content-center h-100">
                    <div class="text-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted mb-3">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                        <h5 class="text-muted">No Seasonal Patterns Detected</h5>
                        <p class="text-muted mb-0">
                            Seasonal patterns require more data or stronger cyclical variations.<br>
                            Try extending the time range or selecting different sensors.
                        </p>
                    </div>
                </div>
            `;
            return;
        }

        // Get the first series to determine categories
        const firstSeries = series[0];
        let categories = [];
        
        // Determine categories based on the first seasonal pattern found
        Object.keys(data.analysis).forEach(sensorId => {
            data.metrics.forEach(metric => {
                const sensorData = data.analysis[sensorId][metric];
                if (sensorData && sensorData.seasonalPattern && categories.length === 0) {
                    const pattern = sensorData.seasonalPattern;
                    if (pattern.cycleLengthLabel === 'weekly') {
                        categories = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                    } else if (pattern.cycleLengthLabel === 'daily') {
                        categories = Array.from({length: 24}, (_, i) => `${i}:00`);
                    } else if (pattern.cycleLengthLabel === 'monthly') {
                        categories = Array.from({length: 30}, (_, i) => `Day ${i + 1}`);
                    } else {
                        categories = Array.from({length: pattern.cycleLength}, (_, i) => `Period ${i + 1}`);
                    }
                }
            });
        });

        const options = {
            series: series,
            chart: {
                type: 'line',
                height: 350,
                zoom: {
                    enabled: true
                }
            },
            title: {
                text: 'Seasonal Patterns'
            },
            xaxis: {
                categories: categories,
                title: {
                    text: 'Time Period'
                }
            },
            yaxis: {
                title: {
                    text: 'Average Values'
                },
                labels: {
                    formatter: function (val) {
                        return val?.toFixed(2) || '0.00';
                    }
                }
            },
            legend: {
                position: 'top',
                horizontalAlign: 'left'
            },
            stroke: {
                width: 2,
                curve: 'smooth'
            },
            markers: {
                size: 4
            },
            tooltip: {
                y: {
                    formatter: function (val, opts) {
                        if (val === null || val === undefined) return 'No data';
                        
                        // Get the metric from series name
                        const seriesName = opts.w.config.series[opts.seriesIndex].name;
                        let unit = '';
                        if (seriesName.includes('PM')) unit = ' μg/m³';
                        else if (seriesName.includes('Temperature')) unit = ' °C';
                        else if (seriesName.includes('Humidity')) unit = ' %';
                        
                        return val.toFixed(2) + unit;
                    }
                }
            },
            noData: {
                text: 'No seasonal patterns detected',
                align: 'center',
                verticalAlign: 'middle',
                style: {
                    color: '#6c757d',
                    fontSize: '16px'
                }
            }
        };

        if (AnalysisState.charts.seasonal) {
            AnalysisState.charts.seasonal.destroy();
        }

        AnalysisState.charts.seasonal = new ApexCharts(container, options);
        AnalysisState.charts.seasonal.render();
    },

    // Create moving average chart
    createMovingAverageChart(data) {
        const container = document.getElementById('moving-average-chart');
        if (!container) return;

        const series = [];
        
        Object.keys(data.analysis).forEach(sensorId => {
            data.metrics.forEach(metric => {
                const sensorData = data.analysis[sensorId][metric];
                if (sensorData && sensorData.movingAverage.length > 0) {
                    series.push({
                        name: `${sensorId} - ${this.getMetricLabel(metric)} MA`,
                        data: sensorData.movingAverage.map(point => ({
                            x: point.timestamp,
                            y: point.value
                        }))
                    });
                }
            });
        });

        const options = {
            series: series,
            chart: {
                type: 'line',
                height: 350
            },
            title: {
                text: 'Moving Averages'
            },
            xaxis: {
                type: 'datetime'
            },
            yaxis: {
                labels: {
                    formatter: function (val) {
                        return val?.toFixed(2) || '0.00';
                    }
                }
            },
            tooltip: {
                y: {
                    formatter: function (val) {
                        return val?.toFixed(2) || '0.00';
                    }
                }
            }
        };

        if (AnalysisState.charts.movingAverage) {
            AnalysisState.charts.movingAverage.destroy();
        }

        AnalysisState.charts.movingAverage = new ApexCharts(container, options);
        AnalysisState.charts.movingAverage.render();
    },

    // Render spatial analysis results
    renderSpatialResults(data) {
        this.createSpatialMap(data);
        this.renderRegionalStats(data);
    },

    // Create spatial map
    createSpatialMap(data) {
        const container = document.getElementById('spatial-map');
        if (!container) {
            console.error('Spatial map container not found');
            return;
        }

        // Remove loading class if present
        container.classList.remove('loading');

        // Initialize Leaflet map
        if (AnalysisState.charts.spatialMap) {
            AnalysisState.charts.spatialMap.remove();
        }

        // Check if we have valid sensor data
        if (!data.sensorData || data.sensorData.length === 0) {
            container.innerHTML = `
                <div class="d-flex align-items-center justify-content-center h-100">
                    <div class="text-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted mb-3">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                            <circle cx="12" cy="10" r="3"></circle>
                        </svg>
                        <h5 class="text-muted">No Spatial Data Available</h5>
                        <p class="text-muted mb-0">
                            No sensors with location data found for the selected time range.<br>
                            Try selecting different sensors or extending the time range.
                        </p>
                    </div>
                </div>
            `;
            return;
        }

        // Calculate center point with fallback
        let centerLat = 51.9; // Cheltenham approximate
        let centerLng = -2.1;
        let zoom = 10;

        if (data.bounds && data.bounds.minLat && data.bounds.maxLat) {
            centerLat = (data.bounds.minLat + data.bounds.maxLat) / 2;
            centerLng = (data.bounds.minLong + data.bounds.maxLong) / 2;
            
            // Calculate appropriate zoom level based on bounds
            const latDiff = data.bounds.maxLat - data.bounds.minLat;
            const lngDiff = data.bounds.maxLong - data.bounds.minLong;
            const maxDiff = Math.max(latDiff, lngDiff);
            
            if (maxDiff < 0.01) zoom = 15;
            else if (maxDiff < 0.05) zoom = 13;
            else if (maxDiff < 0.1) zoom = 12;
            else if (maxDiff < 0.5) zoom = 10;
            else zoom = 8;
        }

        try {
            const map = L.map(container, {
                center: [centerLat, centerLng],
                zoom: zoom,
                zoomControl: true,
                attributionControl: true
            });

            // Add tile layer with error handling
            const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 18,
                errorTileUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI1NiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI1NiIgZmlsbD0iI2Y4ZjlmYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjNmM3NTdkIj5NYXAgVGlsZSBVbmF2YWlsYWJsZTwvdGV4dD48L3N2Zz4='
            });

            tileLayer.addTo(map);

            // Track markers for legend
            const markerData = [];
            let minValue = Infinity;
            let maxValue = -Infinity;

            // Add sensor markers with data
            data.sensorData.forEach(sensor => {
                // Validate sensor coordinates
                if (!sensor.lat || !sensor.long || 
                    isNaN(sensor.lat) || isNaN(sensor.long) ||
                    sensor.lat < -90 || sensor.lat > 90 ||
                    sensor.long < -180 || sensor.long > 180) {
                    console.warn(`Invalid coordinates for sensor ${sensor.device_id}:`, sensor.lat, sensor.long);
                    return;
                }

                const pm25Value = sensor.metrics.pm2_5;
                if (pm25Value !== null && pm25Value !== undefined && !isNaN(pm25Value)) {
                    minValue = Math.min(minValue, pm25Value);
                    maxValue = Math.max(maxValue, pm25Value);
                }

                const color = this.getValueColor(pm25Value, 0, 50); // Assuming 0-50 range for PM2.5
                
                const marker = L.circleMarker([sensor.lat, sensor.long], {
                    radius: 10,
                    fillColor: color,
                    color: '#fff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                }).addTo(map);

                // Enhanced popup with better formatting
                const popupContent = `
                    <div class="sensor-popup">
                        <h6 class="mb-2">${sensor.name || sensor.device_id}</h6>
                        <div class="row g-2">
                            <div class="col-6">
                                <small class="text-muted">PM2.5</small><br>
                                <strong>${pm25Value?.toFixed(1) || 'N/A'}</strong> μg/m³
                            </div>
                            <div class="col-6">
                                <small class="text-muted">Temperature</small><br>
                                <strong>${sensor.metrics.temperature?.toFixed(1) || 'N/A'}</strong> °C
                            </div>
                            <div class="col-6">
                                <small class="text-muted">Humidity</small><br>
                                <strong>${sensor.metrics.humidity?.toFixed(1) || 'N/A'}</strong> %
                            </div>
                            <div class="col-6">
                                <small class="text-muted">Location</small><br>
                                <small>${sensor.lat.toFixed(4)}, ${sensor.long.toFixed(4)}</small>
                            </div>
                        </div>
                    </div>
                `;

                marker.bindPopup(popupContent, {
                    className: 'sensor-popup-container',
                    maxWidth: 250
                });

                markerData.push({ value: pm25Value, color: color });
            });

            // Fit map to bounds if we have valid bounds
            if (data.bounds && data.bounds.minLat && data.bounds.maxLat && 
                data.bounds.minLong && data.bounds.maxLong) {
                try {
                    const bounds = L.latLngBounds([
                        [data.bounds.minLat, data.bounds.minLong],
                        [data.bounds.maxLat, data.bounds.maxLong]
                    ]);
                    
                    // Add some padding to the bounds
                    const paddedBounds = bounds.pad(0.1);
                    map.fitBounds(paddedBounds);
                } catch (boundsError) {
                    console.warn('Error fitting map to bounds:', boundsError);
                }
            }

            // Add legend if we have valid data
            if (minValue !== Infinity && maxValue !== -Infinity) {
                this.addSpatialLegend(map, minValue, maxValue);
            }

            AnalysisState.charts.spatialMap = map;

            // Force map resize after a short delay to ensure proper rendering
            setTimeout(() => {
                map.invalidateSize();
            }, 100);

        } catch (error) {
            console.error('Error creating spatial map:', error);
            container.innerHTML = `
                <div class="d-flex align-items-center justify-content-center h-100">
                    <div class="text-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-danger mb-3">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                        <h5 class="text-danger">Map Loading Error</h5>
                        <p class="text-muted mb-0">
                            Unable to load the spatial map.<br>
                            Please check your internet connection and try again.
                        </p>
                    </div>
                </div>
            `;
        }
    },

    // Add legend to spatial map
    addSpatialLegend(map, minValue, maxValue) {
        const legend = L.control({ position: 'bottomright' });
        
        legend.onAdd = function() {
            const div = L.DomUtil.create('div', 'spatial-legend');
            div.innerHTML = `
                <div class="mb-2"><strong>PM2.5 (μg/m³)</strong></div>
                <div class="spatial-legend-item">
                    <div class="spatial-legend-color" style="background-color: ${AnalysisManager.getValueColor(minValue, 0, 50)}"></div>
                    <span>${minValue.toFixed(1)} (Low)</span>
                </div>
                <div class="spatial-legend-item">
                    <div class="spatial-legend-color" style="background-color: ${AnalysisManager.getValueColor((minValue + maxValue) / 2, 0, 50)}"></div>
                    <span>${((minValue + maxValue) / 2).toFixed(1)} (Medium)</span>
                </div>
                <div class="spatial-legend-item">
                    <div class="spatial-legend-color" style="background-color: ${AnalysisManager.getValueColor(maxValue, 0, 50)}"></div>
                    <span>${maxValue.toFixed(1)} (High)</span>
                </div>
            `;
            return div;
        };
        
        legend.addTo(map);
    },

    // Render regional statistics
    renderRegionalStats(data) {
        const container = document.getElementById('regional-stats');
        if (!container) return;

        let html = '';
        
        Object.keys(data.regionalStats).forEach(metric => {
            const stats = data.regionalStats[metric];
            if (stats) {
                html += `
                    <div class="mb-3">
                        <h5>${this.getMetricLabel(metric)}</h5>
                        <div class="row">
                            <div class="col-6">
                                <small class="text-muted">Mean</small><br>
                                <strong>${stats.mean.toFixed(2)}</strong>
                            </div>
                            <div class="col-6">
                                <small class="text-muted">Range</small><br>
                                <strong>${stats.min.toFixed(1)} - ${stats.max.toFixed(1)}</strong>
                            </div>
                        </div>
                    </div>
                `;
            }
        });

        container.innerHTML = html;
    },

    // Export analysis results
    exportResults() {
        const activeTab = document.querySelector('.analysis-type-tabs .nav-link.active');
        const analysisType = activeTab ? activeTab.id.replace('-tab', '') : 'statistical';
        
        const results = AnalysisState.analysisResults[analysisType];
        if (!results) {
            Utils.showNotification('No analysis results to export', 'warning');
            return;
        }

        const dataStr = JSON.stringify(results, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `analysis_${analysisType}_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        Utils.showNotification('Analysis results exported', 'success');
    },

    // Setup event listeners
    setupEventListeners() {
        // Tab change events
        document.querySelectorAll('.analysis-type-tabs .nav-link').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const analysisType = e.target.id.replace('-tab', '');
                AnalysisState.currentAnalysisType = analysisType;
                this.updateUI();
            });
        });

        // Metric selection changes
        document.querySelectorAll('.form-selectgroup-input').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateUI();
            });
        });
    },

    // Update UI state
    updateUI() {
        // Update selected count
        document.getElementById('selected-count').textContent = AnalysisState.selectedSensors.length;
        
        // Update time range display
        const timeRangeSelect = document.getElementById('time-range-select');
        const selectedOption = timeRangeSelect.options[timeRangeSelect.selectedIndex];
        document.getElementById('time-range-display').textContent = selectedOption.text;
        
        // Update analysis type display
        const activeTab = document.querySelector('.analysis-type-tabs .nav-link.active');
        if (activeTab) {
            document.getElementById('analysis-type-display').textContent = 
                activeTab.textContent.trim().split(' ')[0];
        }
        
        // Enable/disable analyze button
        const analyzeBtn = document.getElementById('analyze-btn');
        const canAnalyze = AnalysisState.selectedSensors.length > 0 && !AnalysisState.isLoading;
        analyzeBtn.disabled = !canAnalyze;
    },

    // Update loading state
    updateLoadingState(isLoading) {
        const analyzeBtn = document.getElementById('analyze-btn');
        
        if (isLoading) {
            analyzeBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Analyzing...';
            analyzeBtn.disabled = true;
        } else {
            analyzeBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="me-1">
                    <path d="M18 20V10"></path>
                    <path d="M12 20V4"></path>
                    <path d="M6 20v-6"></path>
                </svg>
                Run Analysis
            `;
            analyzeBtn.disabled = false;
        }
    },

    // Helper functions
    getMetricLabel(metric) {
        const labels = {
            'pm2_5': 'PM2.5',
            'pm1': 'PM1.0',
            'pm4': 'PM4.0',
            'pm10': 'PM10',
            'temperature': 'Temperature',
            'humidity': 'Humidity',
            'relative_humidity': 'Humidity',
            'voc': 'VOC',
            'nox': 'NOx'
        };
        return labels[metric] || metric;
    },

    getCorrelationClass(correlation) {
        if (correlation === null) return '';
        const abs = Math.abs(correlation);
        if (abs > 0.7) return 'correlation-high';
        if (abs > 0.3) return 'correlation-medium';
        return 'correlation-low';
    },

    getValueColor(value, min, max) {
        if (value === null || value === undefined) return '#gray';
        const normalized = (value - min) / (max - min);
        const hue = (1 - normalized) * 120; // Green to red
        return `hsl(${hue}, 70%, 50%)`;
    }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AnalysisManager.init());
} else {
    AnalysisManager.init();
}

// Export for global access
window.AnalysisManager = AnalysisManager;
