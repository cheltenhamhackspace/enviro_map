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
    sensors: []
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
            
            this.renderSensorSelector();
        } catch (error) {
            console.error('Error loading sensors:', error);
            Utils.showNotification('Failed to load sensors', 'danger');
        }
    },

    // Render sensor selection interface
    renderSensorSelector() {
        const container = document.getElementById('sensor-selector');
        if (!container) return;

        if (AnalysisState.sensors.length === 0) {
            container.innerHTML = '<p class="text-muted">No sensors available</p>';
            return;
        }

        const sensorHTML = AnalysisState.sensors.map(sensor => `
            <div class="form-check">
                <input class="form-check-input" type="checkbox" value="${sensor.device_id}" 
                       id="sensor-${sensor.device_id}" onchange="AnalysisManager.toggleSensor('${sensor.device_id}')">
                <label class="form-check-label" for="sensor-${sensor.device_id}">
                    ${sensor.name || sensor.device_id}
                </label>
            </div>
        `).join('');

        container.innerHTML = sensorHTML;
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

    // Select all sensors
    selectAllSensors() {
        AnalysisState.selectedSensors = AnalysisState.sensors.map(s => s.device_id);
        
        // Update checkboxes
        AnalysisState.sensors.forEach(sensor => {
            const checkbox = document.getElementById(`sensor-${sensor.device_id}`);
            if (checkbox) checkbox.checked = true;
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

    // Create seasonal chart (placeholder)
    createSeasonalChart(data) {
        const container = document.getElementById('seasonal-chart');
        if (!container) return;

        // Simple placeholder chart
        const options = {
            series: [{
                name: 'Seasonal Pattern',
                data: [10, 15, 12, 18, 20, 16, 14]
            }],
            chart: {
                type: 'line',
                height: 350
            },
            title: {
                text: 'Seasonal Patterns'
            },
            xaxis: {
                categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
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
        if (!container) return;

        // Initialize Leaflet map
        if (AnalysisState.charts.spatialMap) {
            AnalysisState.charts.spatialMap.remove();
        }

        const map = L.map(container).setView([
            (data.bounds.minLat + data.bounds.maxLat) / 2,
            (data.bounds.minLong + data.bounds.maxLong) / 2
        ], 10);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        // Add sensor markers with data
        data.sensorData.forEach(sensor => {
            const pm25Value = sensor.metrics.pm2_5;
            const color = this.getValueColor(pm25Value, 0, 50); // Assuming 0-50 range for PM2.5
            
            const marker = L.circleMarker([sensor.lat, sensor.long], {
                radius: 8,
                fillColor: color,
                color: '#000',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(map);

            marker.bindPopup(`
                <strong>${sensor.name || sensor.device_id}</strong><br>
                PM2.5: ${pm25Value?.toFixed(1) || 'N/A'} μg/m³<br>
                Temperature: ${sensor.metrics.temperature?.toFixed(1) || 'N/A'} °C<br>
                Humidity: ${sensor.metrics.humidity?.toFixed(1) || 'N/A'} %
            `);
        });

        // Fit map to bounds
        const bounds = L.latLngBounds([
            [data.bounds.minLat, data.bounds.minLong],
            [data.bounds.maxLat, data.bounds.maxLong]
        ]);
        map.fitBounds(bounds);

        AnalysisState.charts.spatialMap = map;
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
