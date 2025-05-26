/**
 * Chart management for the Environmental Monitoring Dashboard
 */

const ChartManager = {
    init: () => {
        ChartManager.initParticulateChart();
        ChartManager.initTempHumChart();
        ChartManager.initAQIChart();
    },

    initParticulateChart: () => {
        const options = {
            chart: {
                height: 350,
                type: 'line',
                toolbar: {
                    show: true,
                    tools: {
                        download: true,
                        selection: true,
                        zoom: true,
                        zoomin: true,
                        zoomout: true,
                        pan: true,
                        reset: true,
                    },
                    autoSelected: 'zoom'
                },
                animations: {
                    enabled: true,
                    easing: 'easeinout',
                    speed: 800
                }
            },
            series: [],
            title: {
                text: 'Particulate Matter Levels',
                align: 'center',
                style: {
                    fontSize: '16px',
                    fontWeight: 600
                }
            },
            noData: {
                text: 'Select a sensor to display data',
                align: 'center',
                verticalAlign: 'middle',
                style: {
                    fontSize: '14px'
                }
            },
            xaxis: {
                type: 'datetime',
                labels: {
                    datetimeUTC: false
                }
            },
            yaxis: {
                title: {
                    text: 'Concentration (μg/m³)'
                }
            },
            tooltip: {
                x: {
                    format: 'dd MMM yyyy HH:mm:ss'
                },
                y: {
                    formatter: (value) => `${value.toFixed(2)} μg/m³`
                }
            },
            legend: {
                position: 'top'
            },
            stroke: {
                width: 2,
                curve: 'smooth'
            }
        };

        AppState.charts.particulate = new ApexCharts(document.querySelector("#timeChart"), options);
        AppState.charts.particulate.render();
    },

    initTempHumChart: () => {
        const options = {
            chart: {
                height: 350,
                type: 'line',
                toolbar: { show: true }
            },
            series: [],
            title: {
                text: 'Temperature and Humidity',
                align: 'center',
                style: {
                    fontSize: '16px',
                    fontWeight: 600
                }
            },
            noData: {
                text: 'Select a sensor to display data'
            },
            xaxis: {
                type: 'datetime',
                labels: {
                    datetimeUTC: false
                }
            },
            yaxis: [
                {
                    title: {
                        text: 'Temperature (°C)'
                    },
                    seriesName: 'Temperature'
                },
                {
                    opposite: true,
                    title: {
                        text: 'Relative Humidity (%)'
                    },
                    seriesName: 'Humidity'
                }
            ],
            tooltip: {
                x: {
                    format: 'dd MMM yyyy HH:mm:ss'
                }
            },
            stroke: {
                width: 2,
                curve: 'smooth'
            }
        };

        AppState.charts.tempHum = new ApexCharts(document.querySelector("#tempHumChart"), options);
        AppState.charts.tempHum.render();
    },

    initAQIChart: () => {
        const options = {
            chart: {
                height: 350,
                type: 'line',
                toolbar: { show: true }
            },
            series: [],
            title: {
                text: 'Air Quality Indices',
                align: 'center',
                style: {
                    fontSize: '16px',
                    fontWeight: 600
                }
            },
            noData: {
                text: 'Select a sensor to display data'
            },
            xaxis: {
                type: 'datetime',
                labels: {
                    datetimeUTC: false
                }
            },
            yaxis: {
                title: {
                    text: 'Index Value'
                }
            },
            tooltip: {
                x: {
                    format: 'dd MMM yyyy HH:mm:ss'
                }
            },
            stroke: {
                width: 2,
                curve: 'smooth'
            }
        };

        AppState.charts.aqi = new ApexCharts(document.querySelector("#aqiChart"), options);
        AppState.charts.aqi.render();
    },

    updateCharts: (data) => {
        if (!data || data.length === 0) {
            ChartManager.clearCharts();
            return;
        }

        ChartManager.updateParticulateChart(data);
        ChartManager.updateTempHumChart(data);
        ChartManager.updateAQIChart(data);
    },

    updateParticulateChart: (data) => {
        const seriesData = AppState.selectedDatasets
            .filter(dataset => ['pm1', 'pm2_5', 'pm4', 'pm10'].includes(dataset))
            .map(dataset => ({
                name: DATASET_CONFIG[dataset].name,
                data: data.map(entry => [entry.event_time, entry[dataset]]),
                color: DATASET_CONFIG[dataset].color
            }));

        AppState.charts.particulate.updateOptions({
            series: seriesData,
            title: { text: `${AppState.sensorName} - Particulate Matter` },
            xaxis: {
                min: Date.now() - AppState.timespan,
                max: Date.now()
            }
        });
    },

    updateTempHumChart: (data) => {
        AppState.charts.tempHum.updateOptions({
            series: [
                {
                    name: 'Temperature',
                    data: data.map(entry => [entry.event_time, entry.temperature]),
                    color: '#d63939'
                },
                {
                    name: 'Humidity',
                    data: data.map(entry => [entry.event_time, entry.relative_humidity]),
                    color: '#206bc4'
                }
            ],
            title: { text: `${AppState.sensorName} - Temperature & Humidity` },
            xaxis: {
                min: Date.now() - AppState.timespan,
                max: Date.now()
            }
        });
    },

    updateAQIChart: (data) => {
        AppState.charts.aqi.updateOptions({
            series: [
                {
                    name: 'VOC Index',
                    data: data.map(entry => [entry.event_time, entry.voc]),
                    color: '#2fb344'
                },
                {
                    name: 'NOx Index',
                    data: data.map(entry => [entry.event_time, entry.nox]),
                    color: '#fd7e14'
                }
            ],
            title: { text: `${AppState.sensorName} - Air Quality Indices` },
            xaxis: {
                min: Date.now() - AppState.timespan,
                max: Date.now()
            }
        });
    },

    clearCharts: () => {
        const noDataText = AppState.deviceId ? 'No data available' : 'Select a sensor to display data';
        
        AppState.charts.particulate.updateOptions({
            series: [],
            title: { text: AppState.sensorName || 'Particulate Matter Levels' },
            noData: { text: noDataText }
        });

        AppState.charts.tempHum.updateOptions({
            series: [],
            title: { text: AppState.sensorName ? `${AppState.sensorName} - Temperature & Humidity` : 'Temperature and Humidity' },
            noData: { text: noDataText }
        });

        AppState.charts.aqi.updateOptions({
            series: [],
            title: { text: AppState.sensorName ? `${AppState.sensorName} - Air Quality Indices` : 'Air Quality Indices' },
            noData: { text: noDataText }
        });
    }
};
