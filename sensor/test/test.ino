#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Arduino.h>
#include <SensirionI2CSen5x.h>
#include <Wire.h>
#include <malloc.h>

#define MAXBUF_REQUIREMENT 48
#if (defined(I2C_BUFFER_LENGTH) && (I2C_BUFFER_LENGTH >= MAXBUF_REQUIREMENT)) || (defined(BUFFER_LENGTH) && BUFFER_LENGTH >= MAXBUF_REQUIREMENT)
    #define USE_PRODUCT_INFO
#endif

SensirionI2CSen5x sen5x;

#ifndef STASSID
    #define STASSID "SSID HERE"
    #define STAPSK "SSID PASSWORD HERE"
    #define UUID "UUID HERE"
    #define FWVERSION "0.1.2"
    #define BASEURL "https://map.cheltenham.space/api/v1/sensor/"
#endif

const char* ssid = STASSID;
const char* password = STAPSK;
String url = String(BASEURL) + String(UUID);

WiFiMulti multi;

unsigned char serialNumber[32];
uint8_t serialNumberSize = 32;

unsigned long previousMillis = 0;
unsigned long interval = 300000;

float totalMassConcentrationPm1p0 = 0;
float totalMassConcentrationPm2p5 = 0;
float totalMassConcentrationPm4p0 = 0;
float totalMassConcentrationPm10p0 = 0;
float totalAmbientHumidity = 0;
float totalAmbientTemperature = 0;
float totalVocIndex = 0;
float totalNoxIndex = 0;
int readingsTaken = 0;

void printMemoryStats() {
    struct mallinfo mi = mallinfo();
    Serial.printf("Total non-mmapped bytes (arena): %d\n", mi.arena);
    Serial.printf("Free chunks (ordblks): %d\n", mi.ordblks);
    Serial.printf("Free bytes (fordblks): %d\n", mi.fordblks);
    Serial.printf("Allocated chunks: %d\n", mi.uordblks);
}

void setupWiFi() {
    Serial.print("Connecting to ");
    Serial.println(ssid);
    
    multi.addAP(ssid, password);
    int attempts = 0;
    const int maxAttempts = 10;
    
    while (multi.run() != WL_CONNECTED && attempts < maxAttempts) {
        attempts++;
        delay(1000);
        Serial.printf("Attempt %d/%d to connect to WiFi\n", attempts, maxAttempts);
    }
    
    if (multi.run() != WL_CONNECTED) {
        Serial.println("Failed to connect after maximum attempts. Rebooting...");
        delay(10000);
        rp2040.reboot();
    }

    Serial.println("WiFi connected");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
}

void resetSensor() {
    uint16_t error;
    char errorMessage[256];
    error = sen5x.deviceReset();
    if (error) {
        errorToString(error, errorMessage, sizeof(errorMessage));
        Serial.printf("Sensor reset failed: %s\n", errorMessage);
    }
}

void fetchSensorSerial() {
    uint16_t error;
    char errorMessage[256];
    error = sen5x.getSerialNumber(serialNumber, serialNumberSize);
    if (error) {
        errorToString(error, errorMessage, sizeof(errorMessage));
        Serial.printf("Failed to fetch serial number: %s\n", errorMessage);
    } else {
        Serial.print("Sensor Serial Number: ");
        Serial.println((char*)serialNumber);
    }
}

void setTemperatureOffset() {
    float tempOffset = 0.0;
    uint16_t error = sen5x.setTemperatureOffsetSimple(tempOffset);
    if (error) {
        char errorMessage[256];
        errorToString(error, errorMessage, sizeof(errorMessage));
        Serial.printf("Failed to set temperature offset: %s\n", errorMessage);
    } else {
        Serial.printf("Temperature Offset set to %.1f deg. Celsius\n", tempOffset);
    }
}

void handleWiFiReconnection() {
    if (multi.run() != WL_CONNECTED) {
        Serial.println("WiFi lost. Attempting reconnection...");

        int retries = 0;
        const int maxRetries = 10;

        while (multi.run() != WL_CONNECTED && retries < maxRetries) {
            retries++;
            delay(1000);
            Serial.printf("Reconnection attempt %d/%d\n", retries, maxRetries);
        }

        if (multi.run() != WL_CONNECTED) {
            Serial.println("Failed to reconnect. Rebooting...");
            delay(1000);
            rp2040.reboot();
        } else {
            Serial.println("Reconnected to WiFi.");
        }
    }
}

void readAndStoreMeasurements() {
    uint16_t error;
    char errorMessage[256];

    float massConcentrationPm1p0, massConcentrationPm2p5, massConcentrationPm4p0, massConcentrationPm10p0;
    float ambientHumidity, ambientTemperature, vocIndex, noxIndex;

    error = sen5x.readMeasuredValues(
        massConcentrationPm1p0, massConcentrationPm2p5, massConcentrationPm4p0,
        massConcentrationPm10p0, ambientHumidity, ambientTemperature, vocIndex, noxIndex);

    if (error) {
        errorToString(error, errorMessage, sizeof(errorMessage));
        Serial.printf("Failed to read sensor values: %s\n", errorMessage);
        return;
    }

    totalMassConcentrationPm1p0 += massConcentrationPm1p0;
    totalMassConcentrationPm2p5 += massConcentrationPm2p5;
    totalMassConcentrationPm4p0 += massConcentrationPm4p0;
    totalMassConcentrationPm10p0 += massConcentrationPm10p0;
    totalAmbientHumidity += ambientHumidity;
    totalAmbientTemperature += ambientTemperature;
    totalVocIndex += vocIndex;
    totalNoxIndex += noxIndex;
    readingsTaken++;
}

void sendDataToServer() {
    if (readingsTaken == 0) {
        Serial.println("No data to send.");
        return;
    }

    float avgMassConcentrationPm1p0 = totalMassConcentrationPm1p0 / readingsTaken;
    float avgMassConcentrationPm2p5 = totalMassConcentrationPm2p5 / readingsTaken;
    float avgMassConcentrationPm4p0 = totalMassConcentrationPm4p0 / readingsTaken;
    float avgMassConcentrationPm10p0 = totalMassConcentrationPm10p0 / readingsTaken;
    float avgAmbientHumidity = totalAmbientHumidity / readingsTaken;
    float avgAmbientTemperature = totalAmbientTemperature / readingsTaken;
    float avgVocIndex = totalVocIndex / readingsTaken;
    float avgNoxIndex = totalNoxIndex / readingsTaken;

    WiFiClient client;
    HTTPClient https;

    https.setInsecure();  // Skip SSL verification
    if (https.begin(url)) {
        https.addHeader("Content-Type", "application/json");
        StaticJsonDocument<500> doc;
        doc["relative_humidity"] = avgAmbientHumidity;
        doc["temperature"] = avgAmbientTemperature;
        doc["pm1"] = avgMassConcentrationPm1p0;
        doc["pm2_5"] = avgMassConcentrationPm2p5;
        doc["pm4"] = avgMassConcentrationPm4p0;
        doc["pm10"] = avgMassConcentrationPm10p0;
        doc["voc"] = avgVocIndex;
        doc["nox"] = avgNoxIndex;
        doc["sensor_serial"] = (char*)serialNumber;
        doc["version"] = FWVERSION;
        doc["uptime"] = millis();

        String payload;
        serializeJson(doc, payload);

        int httpCode = https.POST(payload);

        if (httpCode > 0) {
            Serial.printf("POST Response: %d\n", httpCode);
            if (httpCode == HTTP_CODE_OK) {
                String response = https.getString();
                Serial.println(response);
            }
        } else {
            Serial.printf("POST Failed: %s\n", https.errorToString(httpCode).c_str());
        }

        https.end();
    } else {
        Serial.println("Failed to connect to the server.");
    }

    totalMassConcentrationPm1p0 = 0;
    totalMassConcentrationPm2p5 = 0;
    totalMassConcentrationPm4p0 = 0;
    totalMassConcentrationPm10p0 = 0;
    totalAmbientHumidity = 0;
    totalAmbientTemperature = 0;
    totalVocIndex = 0;
    totalNoxIndex = 0;
    readingsTaken = 0;
}

void setup() {
    Serial.begin(115200);

    setupWiFi();

    Wire.begin();
    sen5x.begin(Wire);

    resetSensor();
    fetchSensorSerial();
    setTemperatureOffset();

    // Start Measurement
    uint16_t error = sen5x.startMeasurement();
    if (error) {
        char errorMessage[256];
        errorToString(error, errorMessage, sizeof(errorMessage));
        Serial.printf("Failed to start sensor measurement: %s\n", errorMessage);
    }
    
    delay(10000);  // Wait for sensor to stabilize
}

void loop() {
    unsigned long currentMillis = millis();
    
    handleWiFiReconnection();
    readAndStoreMeasurements();

    if ((currentMillis - previousMillis) >= interval) {
        sendDataToServer();
        previousMillis = currentMillis;
        printMemoryStats();
    }
}
