#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Arduino.h>
#include <SensirionI2CSen5x.h>
#include <Wire.h>
#include <malloc.h>

// Define buffer size requirement for I2C communication
#define MAXBUF_REQUIREMENT 48

// Check if the buffer size meets the requirement, define USE_PRODUCT_INFO if true
#if (defined(I2C_BUFFER_LENGTH) && (I2C_BUFFER_LENGTH >= MAXBUF_REQUIREMENT)) || (defined(BUFFER_LENGTH) && BUFFER_LENGTH >= MAXBUF_REQUIREMENT)
    #define USE_PRODUCT_INFO
#endif

// Sensor object for the Sensirion SEN5x sensor
SensirionI2CSen5x sen5x;

// WiFi credentials and other constant definitions
#ifndef STASSID
    #define STASSID "DEFAULT_SSID"  // WiFi SSID
#endif

#ifndef STAPSK
    #define STAPSK "DEFAULT_PASSWORD"  // WiFi Password
#endif

#ifndef UUID
    #define UUID "DEFAULT_UUID"  // Unique identifier for the sensor node
#endif

#ifndef FWVERSION
    #define FWVERSION "0.1.2"  // Firmware version
#endif

#ifndef BASEURL
    #define BASEURL "https://map.cheltenham.space/api/v1/sensor/"  // Base URL for data submission
#endif

// WiFi credentials
const char* ssid = STASSID;
const char* password = STAPSK;
String url = String(BASEURL) + String(UUID);  // Construct the full URL for API endpoint

WiFiMulti multi;  // WiFiMulti allows for multiple access point connections

// Sensor serial number buffer and size
unsigned char serialNumber[32];
uint8_t serialNumberSize = 32;

// Timing variables for periodic measurements and data submission
unsigned long previousMillis = 0;
unsigned long interval = 300000;  // Interval for sending data (5 minutes)

// Variables to accumulate sensor readings for averaging
float totalMassConcentrationPm1p0 = 0;
float totalMassConcentrationPm2p5 = 0;
float totalMassConcentrationPm4p0 = 0;
float totalMassConcentrationPm10p0 = 0;
float totalAmbientHumidity = 0;
float totalAmbientTemperature = 0;
float totalVocIndex = 0;
float totalNoxIndex = 0;
int readingsTaken = 0;  // Counter for how many readings have been taken

// Function to print memory stats for debugging purposes
void printMemoryStats() {
    struct mallinfo mi = mallinfo();
    Serial.printf("Total non-mmapped bytes (arena): %d\n", mi.arena);
    Serial.printf("Free chunks (ordblks): %d\n", mi.ordblks);
    Serial.printf("Free bytes (fordblks): %d\n", mi.fordblks);
    Serial.printf("Allocated chunks: %d\n", mi.uordblks);
}

// Function to connect to the WiFi network
void setupWiFi() {
    Serial.print("Connecting to ");
    Serial.println(ssid);

    multi.addAP(ssid, password);  // Add the WiFi network to the list of available networks
    int attempts = 0;
    const int maxAttempts = 10;  // Maximum number of WiFi connection attempts
    
    // Try connecting to WiFi within a maximum number of attempts
    while (multi.run() != WL_CONNECTED && attempts < maxAttempts) {
        attempts++;
        delay(1000);
        Serial.printf("Attempt %d/%d to connect to WiFi\n", attempts, maxAttempts);
    }
    
    // If connection fails after max attempts, reboot the device "the Microsoft approach"
    if (multi.run() != WL_CONNECTED) {
        Serial.println("Failed to connect after maximum attempts. Rebooting...");
        delay(10000);
        rp2040.reboot();  // Reboot function for RP2040 boards
    }

    Serial.println("WiFi connected");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());  // Print the local IP address
}

// Function to reset the sensor
void resetSensor() {
    uint16_t error;
    char errorMessage[256];
    
    // Reset the sensor and handle any errors
    error = sen5x.deviceReset();
    if (error) {
        errorToString(error, errorMessage, sizeof(errorMessage));
        Serial.printf("Sensor reset failed: %s\n", errorMessage);
    }
}

// Function to retrieve and print the sensor's serial number
void fetchSensorSerial() {
    uint16_t error;
    char errorMessage[256];
    
    // Fetch the serial number of the sensor
    error = sen5x.getSerialNumber(serialNumber, serialNumberSize);
    if (error) {
        errorToString(error, errorMessage, sizeof(errorMessage));
        Serial.printf("Failed to fetch serial number: %s\n", errorMessage);
    } else {
        Serial.print("Sensor Serial Number: ");
        Serial.println((char*)serialNumber);
    }
}

// Function to set a temperature offset for the sensor
void setTemperatureOffset() {
    float tempOffset = 0.0;
    uint16_t error = sen5x.setTemperatureOffsetSimple(tempOffset);
    
    // Check for errors in setting the temperature offset
    if (error) {
        char errorMessage[256];
        errorToString(error, errorMessage, sizeof(errorMessage));
        Serial.printf("Failed to set temperature offset: %s\n", errorMessage);
    } else {
        Serial.printf("Temperature Offset set to %.1f deg. Celsius\n", tempOffset);
    }
}

// Function to handle WiFi reconnection if the connection drops
void handleWiFiReconnection() {
    if (multi.run() != WL_CONNECTED) {
        Serial.println("WiFi lost. Attempting reconnection...");

        int retries = 0;
        const int maxRetries = 10;  // Maximum number of reconnection attempts

        // Attempt to reconnect to WiFi
        while (multi.run() != WL_CONNECTED && retries < maxRetries) {
            retries++;
            delay(1000);
            Serial.printf("Reconnection attempt %d/%d\n", retries, maxRetries);
        }

        // If reconnection fails, reboot the device
        if (multi.run() != WL_CONNECTED) {
            Serial.println("Failed to reconnect. Rebooting...");
            delay(1000);
            rp2040.reboot();
        } else {
            Serial.println("Reconnected to WiFi.");
        }
    }
}

// Function to read sensor measurements and accumulate them for averaging
void readAndStoreMeasurements() {
    uint16_t error;
    char errorMessage[256];

    float massConcentrationPm1p0, massConcentrationPm2p5, massConcentrationPm4p0, massConcentrationPm10p0;
    float ambientHumidity, ambientTemperature, vocIndex, noxIndex;

    // Read sensor values
    error = sen5x.readMeasuredValues(
        massConcentrationPm1p0, massConcentrationPm2p5, massConcentrationPm4p0,
        massConcentrationPm10p0, ambientHumidity, ambientTemperature, vocIndex, noxIndex);

    // Check for errors in reading sensor values
    if (error) {
        errorToString(error, errorMessage, sizeof(errorMessage));
        Serial.printf("Failed to read sensor values: %s\n", errorMessage);
        return;
    }

    // Accumulate readings for averaging
    totalMassConcentrationPm1p0 += massConcentrationPm1p0;
    totalMassConcentrationPm2p5 += massConcentrationPm2p5;
    totalMassConcentrationPm4p0 += massConcentrationPm4p0;
    totalMassConcentrationPm10p0 += massConcentrationPm10p0;
    totalAmbientHumidity += ambientHumidity;
    totalAmbientTemperature += ambientTemperature;
    totalVocIndex += vocIndex;
    totalNoxIndex += noxIndex;
    readingsTaken++;  // Increment the count of readings taken
}

// Function to send the averaged data to the server
void sendDataToServer() {
    // Ensure that at least one reading has been taken before sending data
    if (readingsTaken == 0) {
        Serial.println("No data to send.");
        return;
    }

    // Calculate average values of the accumulated data
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

    https.setInsecure();  // Disable SSL certificate verification
    if (https.begin(url)) {  // Begin the HTTPS connection
        https.addHeader("Content-Type", "application/json");
        
        // Prepare the JSON payload with sensor data
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

        // Send the POST request to the server
        int httpCode = https.POST(payload);

        // Handle the server response
        if (httpCode > 0) {
            Serial.printf("POST Response: %d\n", httpCode);
            if (httpCode == HTTP_CODE_OK) {
                String response = https.getString();
                Serial.println(response);
            }
        } else {
            Serial.printf("POST Failed: %s\n", https.errorToString(httpCode).c_str());
        }

        https.end();  // End the HTTPS connection
    } else {
        Serial.println("Failed to connect to the server.");
    }

    // Reset the accumulated data after sending
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

// Setup function runs once when the microcontroller starts
void setup() {
    Serial.begin(115200);  // Start serial communication

    delay(2000);    // Sleep so the serial port can show up in time
    Serial.print("Node UUID: ");
    Serial.println(UUID);

    setupWiFi();  // Connect to WiFi

    Wire.begin();  // Initialize I2C bus
    sen5x.begin(Wire);  // Start communication with the sensor

    resetSensor();  // Reset the sensor
    fetchSensorSerial();  // Retrieve and print the sensor serial number
    setTemperatureOffset();  // Set the temperature offset

    // Start the sensor measurement
    uint16_t error = sen5x.startMeasurement();
    if (error) {
        char errorMessage[256];
        errorToString(error, errorMessage, sizeof(errorMessage));
        Serial.printf("Failed to start sensor measurement: %s\n", errorMessage);
    }
    
    delay(10000);  // Wait for the sensor to stabilize before taking measurements
}

// Loop function runs repeatedly after the setup function
void loop() {
    unsigned long currentMillis = millis();  // Get the current time

    handleWiFiReconnection();  // Check and maintain WiFi connection
    readAndStoreMeasurements();  // Read and accumulate sensor data

    // Check if it's time to send data to the server based on the set interval
    if ((currentMillis - previousMillis) >= interval) {
        sendDataToServer();  // Send the data to the server
        previousMillis = currentMillis;  // Reset the previousMillis to current time
        printMemoryStats();  // Print memory stats for debugging
    }
}
