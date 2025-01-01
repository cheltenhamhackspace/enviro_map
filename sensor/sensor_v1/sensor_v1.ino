#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Arduino.h>
#include <SensirionI2CSen5x.h>
#include <Wire.h>
#include <malloc.h>
#include <FatFS.h>
#include <FatFSUSB.h>

// Define buffer size requirement for I2C communication
#define MAXBUF_REQUIREMENT 48

// Check if the buffer size meets the requirement, define USE_PRODUCT_INFO if true
#if (defined(I2C_BUFFER_LENGTH) && (I2C_BUFFER_LENGTH >= MAXBUF_REQUIREMENT)) || (defined(BUFFER_LENGTH) && BUFFER_LENGTH >= MAXBUF_REQUIREMENT)
    #define USE_PRODUCT_INFO
#endif

// Default configurations
#ifndef STASSID
    #define STASSID "DEFAULT_SSID"
#endif
#ifndef STAPSK
    #define STAPSK "DEFAULT_PASSWORD"
#endif
#ifndef UUID
    #define UUID "DEFAULT_UUID"
#endif
#ifndef FWVERSION
    #define FWVERSION "0.2.0"
#endif
#ifndef BASEURL
    #define BASEURL "https://map.cheltenham.space/api/v1/sensor/"
#endif

// Credentials structure
struct WifiCredentials {
    String ssid;
    String password;
};

// Global variables
SensirionI2CSen5x sen5x;
const char* ssid = STASSID;
const char* password = STAPSK;
String url = String(BASEURL) + String(UUID);
WiFiMulti multi;

// Sensor variables
unsigned char serialNumber[32];
uint8_t serialNumberSize = 32;
unsigned long previousMillis = 0;
unsigned long interval = 300000;

// Accumulator variables
float totalMassConcentrationPm1p0 = 0;
float totalMassConcentrationPm2p5 = 0;
float totalMassConcentrationPm4p0 = 0;
float totalMassConcentrationPm10p0 = 0;
float totalAmbientHumidity = 0;
float totalAmbientTemperature = 0;
float totalVocIndex = 0;
float totalNoxIndex = 0;
int readingsTaken = 0;

// Status tracking variables
bool sensor_connected = false;
volatile bool driveConnected = false;
unsigned long driveStartTime = 0;
const unsigned long DRIVE_TIMEOUT = 60000;
bool driveHasBeenMounted = false;
volatile bool driveHasBeenUnmounted = false;

// USB Drive callback functions
void unplug(uint32_t i) {
    (void)i;
    driveConnected = false;
    FatFS.begin();
}

void plug(uint32_t i) {
    (void)i;
    driveConnected = true;
    FatFS.end();
}

bool mountable(uint32_t i) {
    (void)i;
    return true;
}

// Print memory statistics
void printMemoryStats() {
    struct mallinfo mi = mallinfo();
    Serial.printf("Total non-mmapped bytes (arena): %d\n", mi.arena);
    Serial.printf("Free chunks (ordblks): %d\n", mi.ordblks);
    Serial.printf("Free bytes (fordblks): %d\n", mi.fordblks);
    Serial.printf("Allocated chunks: %d\n", mi.uordblks);
}

// Print MAC address
void printMacAddress(byte mac[]) {
    for (int i = 0; i <= 5; i++) {
        if (mac[i] < 16) {
            Serial.print("0");
        }
        Serial.print(mac[i], HEX);
        if (i < 5) {
            Serial.print(":");
        }
    }
    Serial.println();
}

// WiFi credentials management functions
WifiCredentials readWifiCredentials() {
    WifiCredentials creds;
    if (FatFS.exists("WIFI_CONFIG.txt")) {
        File f = FatFS.open("WIFI_CONFIG.txt", "r");
        if (f) {
            String ssidLine = f.readStringUntil('\n');
            String pskLine = f.readStringUntil('\n');
            f.close();
            
            ssidLine.trim();
            pskLine.trim();
            
            if (ssidLine.startsWith("SSID=")) {
                creds.ssid = ssidLine.substring(5);
            }
            if (pskLine.startsWith("PSK=")) {
                creds.password = pskLine.substring(4);
            }
        }
    }
    return creds;
}

void writeWifiConfigTemplate() {
    if (!FatFS.exists("WIFI_CONFIG.txt")) {
        File f = FatFS.open("WIFI_CONFIG.txt", "w");
        if (f) {
            f.println("SSID=your_wifi_name_here");
            f.println("PSK=your_wifi_password_here");
            f.println("");
            f.println("Instructions:");
            f.println("1. Replace 'your_wifi_name_here' with your WiFi network name");
            f.println("2. Replace 'your_wifi_password_here' with your WiFi password");
            f.println("3. Save this file and safely eject the drive");
            f.println("4. The device will automatically restart and connect to WiFi");
            f.close();
            Serial.println("Created new WIFI_CONFIG.txt template");
        }
    }
}

void writeDeviceInfoFile() {
    static bool previouslyConnected = false;
    bool shouldWrite = !FatFS.exists("DEVICE_INFO.txt") || 
                      (WiFi.status() == WL_CONNECTED && !previouslyConnected);
    
    if (shouldWrite) {
        byte mac[6];
        WiFi.macAddress(mac);
        char macStr[18];
        snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
                 mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
        
        File f = FatFS.open("DEVICE_INFO.txt", "w");
        if (f) {
            f.println("Device Information:");
            f.println("-----------------");
            f.print("Pico W MAC Address: ");
            f.println(macStr);
            f.print("Firmware Version: ");
            f.println(FWVERSION);
            f.print("WiFi Status: ");
            f.println(WiFi.status() == WL_CONNECTED ? 
                     "Connected to: " + WiFi.SSID() : "Not Connected");
            f.println("-----------------");
            f.println("This file was automatically generated.");
            f.close();
            Serial.println("Device info file written successfully");
        }
    }
    previouslyConnected = (WiFi.status() == WL_CONNECTED);
}

void handleUSBDrive() {
    if (!driveHasBeenMounted && !driveConnected && !driveHasBeenUnmounted) {
        if (FatFS.begin()) {
            writeDeviceInfoFile();
            writeWifiConfigTemplate();
            
            FatFSUSB.onUnplug(unplug);
            FatFSUSB.onPlug(plug);
            FatFSUSB.driveReady(mountable);
            
            FatFSUSB.begin();
            driveStartTime = millis();
            driveHasBeenMounted = true;
            Serial.println("USB Drive mounted. Will auto-unmount in 30 seconds.");
        }
    }

    if (driveHasBeenMounted && !driveConnected && !driveHasBeenUnmounted &&
        (millis() - driveStartTime >= DRIVE_TIMEOUT)) {
        
        WifiCredentials newCreds = readWifiCredentials();
        if (newCreds.ssid != String(ssid) || newCreds.password != String(password)) {
            Serial.println("New WiFi credentials detected. Rebooting...");
            FatFSUSB.end();
            delay(1000);
            rp2040.reboot();
        }
        
        FatFSUSB.end();
        Serial.println("USB Drive auto-unmounted");
        driveStartTime = 0;
        driveHasBeenUnmounted = true;
    }
}

void setupWiFi() {
    WifiCredentials creds = readWifiCredentials();
    
    // Check if we're using template/default credentials
    if ((creds.ssid == "your_wifi_name_here" || creds.ssid == "DEFAULT_SSID") ||
        (creds.password == "your_wifi_password_here" || creds.password == "DEFAULT_PASSWORD")) {
        Serial.println("Using template/default WiFi credentials. Skipping connection.");
        return;  // Skip connection attempt
    }
    
    if (creds.ssid.length() > 0 && creds.password.length() > 0) {
        ssid = creds.ssid.c_str();
        password = creds.password.c_str();
    }
    
    byte mac[6];
    WiFi.macAddress(mac);
    Serial.print("MAC: ");
    printMacAddress(mac);
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

void handleWiFiReconnection() {
    // Skip reconnection if using template/default credentials
    WifiCredentials creds = readWifiCredentials();
    if ((creds.ssid == "your_wifi_name_here" || creds.ssid == "DEFAULT_SSID") ||
        (creds.password == "your_wifi_password_here" || creds.password == "DEFAULT_PASSWORD")) {
        return;  // Skip reconnection attempt
    }

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
            Serial.printf("Signal strength (RSSI): %d dBm\n", WiFi.RSSI());
        }
    }
}

void attemptSensorReinitialisation() {
    uint16_t error;
    char errorMessage[256];
    Serial.println("Attempting to reinitialise the sensor...");
    
    error = sen5x.deviceReset();
    if (error) {
        errorToString(error, errorMessage, sizeof(errorMessage));
        Serial.printf("Sensor reset failed: %s\n", errorMessage);
    }
    
    error = sen5x.getSerialNumber(serialNumber, serialNumberSize);
    if (error) {
        errorToString(error, errorMessage, sizeof(errorMessage));
        Serial.printf("Failed to fetch serial number: %s\n", errorMessage);
    } else {
        Serial.print("Sensor Serial Number: ");
        Serial.println((char*)serialNumber);
    }
    
    float tempOffset = 0.0;
    error = sen5x.setTemperatureOffsetSimple(tempOffset);
    if (error) {
        errorToString(error, errorMessage, sizeof(errorMessage));
        Serial.printf("Failed to set temperature offset: %s\n", errorMessage);
    } else {
        Serial.printf("Temperature Offset set to %.1f deg. Celsius\n", tempOffset);
    }
    
    error = sen5x.startMeasurement();
    if (error) {
        errorToString(error, errorMessage, sizeof(errorMessage));
        Serial.printf("Failed to start sensor measurement: %s\n", errorMessage);
        sensor_connected = false;
    } else {
        sensor_connected = true;
        Serial.println("Sensor reinitialised successfully.");
    }
}

void readAndStoreMeasurements() {
    if (!sensor_connected) {
        attemptSensorReinitialisation();
        if (!sensor_connected) {
            return;
        }
    }
    
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
        sensor_connected = false;
        return;
    } else {
        sensor_connected = true;
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
    float avgMassConcentrationPm1p0 = 0;
    float avgMassConcentrationPm2p5 = 0;
    float avgMassConcentrationPm4p0 = 0;
    float avgMassConcentrationPm10p0 = 0;
    float avgAmbientHumidity = 0;
    float avgAmbientTemperature = 0;
    float avgVocIndex = 0;
    float avgNoxIndex = 0;
    
    if (readingsTaken > 0) {
        avgMassConcentrationPm1p0 = totalMassConcentrationPm1p0 / readingsTaken;
        avgMassConcentrationPm2p5 = totalMassConcentrationPm2p5 / readingsTaken;
        avgMassConcentrationPm4p0 = totalMassConcentrationPm4p0 / readingsTaken;
        avgMassConcentrationPm10p0 = totalMassConcentrationPm10p0 / readingsTaken;
        avgAmbientHumidity = totalAmbientHumidity / readingsTaken;
        avgAmbientTemperature = totalAmbientTemperature / readingsTaken;
        avgVocIndex = totalVocIndex / readingsTaken;
        avgNoxIndex = totalNoxIndex / readingsTaken;
    }

    WiFiClient client;
    HTTPClient https;
    https.setInsecure();
    
    if (https.begin(url)) {
        https.addHeader("Content-Type", "application/json");
        https.setTimeout(20000);
        
        JsonDocument doc;
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
        doc["sensor_connected"] = sensor_connected;
        doc["wifi_rssi"] = WiFi.RSSI();
        
        String payload;
        serializeJson(doc, payload);
        
        int httpCode = https.POST(payload);
        
        if (httpCode > 0) {
            Serial.printf("POST Response: %d\n", httpCode);
            String response = https.getString();
            Serial.println(response);
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
    delay(3000);
    Serial.print("Node UUID: ");
    Serial.println(UUID);
    
    handleUSBDrive();
    setupWiFi();
    
    Wire.begin();
    sen5x.begin(Wire);
    
    bool sensorinitialisationSuccessful = true;
    uint16_t error;
    char errorMessage[256];
    
    error = sen5x.deviceReset();
    if (error) {
        errorToString(error, errorMessage, sizeof(errorMessage));
        Serial.printf("Sensor reset failed: %s\n", errorMessage);
        sensorinitialisationSuccessful = false;
    }
    
    error = sen5x.getSerialNumber(serialNumber, serialNumberSize);
    if (error) {
        errorToString(error, errorMessage, sizeof(errorMessage));
        Serial.printf("Failed to fetch serial number: %s\n", errorMessage);
        sensorinitialisationSuccessful = false;
    } else {
        Serial.print("Sensor Serial Number: ");
        Serial.println((char*)serialNumber);
    }
    
    float tempOffset = 0.0;
    error = sen5x.setTemperatureOffsetSimple(tempOffset);
    if (error) {
        errorToString(error, errorMessage, sizeof(errorMessage));
        Serial.printf("Failed to set temperature offset: %s\n", errorMessage);
        sensorinitialisationSuccessful = false;
    }
    
    error = sen5x.startMeasurement();
    if (error) {
        errorToString(error, errorMessage, sizeof(errorMessage));
        Serial.printf("Failed to start sensor measurement: %s\n", errorMessage);
        sensorinitialisationSuccessful = false;
    }
    
    sensor_connected = sensorinitialisationSuccessful;
    delay(10000);
}

void loop() {
    unsigned long currentMillis = millis();
    handleUSBDrive();
    handleWiFiReconnection();
    readAndStoreMeasurements();
    
    if ((currentMillis - previousMillis) >= interval) {
        sendDataToServer();
        previousMillis = currentMillis;
        printMemoryStats();
    }
}