/*
    This sketch establishes a TCP connection to a "quote of the day" service.
    It sends a "hello" message, and then prints received data.
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Arduino.h>
#include <SensirionI2CSen5x.h>
#include <Wire.h>

// The used commands use up to 48 bytes. On some Arduino's the default buffer
// space is not large enough
#define MAXBUF_REQUIREMENT 48

#if (defined(I2C_BUFFER_LENGTH) &&                 \
     (I2C_BUFFER_LENGTH >= MAXBUF_REQUIREMENT)) || \
    (defined(BUFFER_LENGTH) && BUFFER_LENGTH >= MAXBUF_REQUIREMENT)
#define USE_PRODUCT_INFO
#endif

SensirionI2CSen5x sen5x;

#ifndef STASSID
#define STASSID "YOUR SSID HERE"
#define STAPSK "YOUR PASSWORD HERE"
#endif

const char* ssid = STASSID;
const char* password = STAPSK;

WiFiMulti multi;

unsigned char serialNumber[32];
uint8_t serialNumberSize = 32;

unsigned long previousMillis = 0;
unsigned long interval = 300000;
// Variables to keep track of the total readings and the number of readings taken
float totalMassConcentrationPm1p0 = 0;
float totalMassConcentrationPm2p5 = 0;
float totalMassConcentrationPm4p0 = 0;
float totalMassConcentrationPm10p0 = 0;
float totalAmbientHumidity = 0;
float totalAmbientTemperature = 0;
float totalVocIndex = 0;
float totalNoxIndex = 0;
int readingsTaken = 0;

void setup() {
  Serial.begin(115200);

  // We start by connecting to a WiFi network

  Serial.println();
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);

  multi.addAP(ssid, password);

  if (multi.run() != WL_CONNECTED) {
    Serial.println("Unable to connect to network, rebooting in 10 seconds...");
    delay(10000);
    rp2040.reboot();
  }

  Serial.println("");
  Serial.println("WiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());

  Wire.begin();

  sen5x.begin(Wire);

  uint16_t error;
  char errorMessage[256];
  error = sen5x.deviceReset();
  if (error) {
      Serial.print("Error trying to execute deviceReset(): ");
      errorToString(error, errorMessage, 256);
      Serial.println(errorMessage);
  }

   

  error = sen5x.getSerialNumber(serialNumber, serialNumberSize);
  if (error) {
      Serial.print("Error trying to execute getSerialNumber(): ");
      errorToString(error, errorMessage, 256);
      Serial.println(errorMessage);
  } else {
      Serial.print("SerialNumber:");
      Serial.println((char*)serialNumber);
  }
  
  // Adjust tempOffset to account for additional temperature offsets
  // exceeding the SEN module's self heating.
  float tempOffset = 0.0;
  error = sen5x.setTemperatureOffsetSimple(tempOffset);
  if (error) {
      Serial.print("Error trying to execute setTemperatureOffsetSimple(): ");
      errorToString(error, errorMessage, 256);
      Serial.println(errorMessage);
  } else {
      Serial.print("Temperature Offset set to ");
      Serial.print(tempOffset);
      Serial.println(" deg. Celsius (SEN54/SEN55 only)");
  }

  // Start Measurement
  error = sen5x.startMeasurement();
  if (error) {
      Serial.print("Error trying to execute startMeasurement(): ");
      errorToString(error, errorMessage, 256);
      Serial.println(errorMessage);
  }

}

void loop() {
  unsigned long currentMillis = millis();
  if (multi.run() != WL_CONNECTED) {
    Serial.println("Unable to connect to network, rebooting...");
    delay(10000);
    rp2040.reboot();
  }
  uint16_t error;
  char errorMessage[256];

  // Read Measurement
  float massConcentrationPm1p0;
  float massConcentrationPm2p5;
  float massConcentrationPm4p0;
  float massConcentrationPm10p0;
  float ambientHumidity;
  float ambientTemperature;
  float vocIndex;
  float noxIndex;

  delay(250);

  error = sen5x.readMeasuredValues(
    massConcentrationPm1p0, massConcentrationPm2p5, massConcentrationPm4p0,
    massConcentrationPm10p0, ambientHumidity, ambientTemperature, vocIndex,
    noxIndex);

  if (error) {
    Serial.print("Error trying to execute readMeasuredValues(): ");
    errorToString(error, errorMessage, 256);
    Serial.println(errorMessage);
  } else {
    // Add the current readings to the totals
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

  if (currentMillis - previousMillis >= interval) {
    // Calculate the averages
    float avgMassConcentrationPm1p0 = totalMassConcentrationPm1p0 / readingsTaken;
    float avgMassConcentrationPm2p5 = totalMassConcentrationPm2p5 / readingsTaken;
    float avgMassConcentrationPm4p0 = totalMassConcentrationPm4p0 / readingsTaken;
    float avgMassConcentrationPm10p0 = totalMassConcentrationPm10p0 / readingsTaken;
    float avgAmbientHumidity = totalAmbientHumidity / readingsTaken;
    float avgAmbientTemperature = totalAmbientTemperature / readingsTaken;
    float avgVocIndex = totalVocIndex / readingsTaken;
    float avgNoxIndex = totalNoxIndex / readingsTaken;

    // Print the averages (optional)
    Serial.print("Average MassConcentrationPm1p0:");
    Serial.print(avgMassConcentrationPm1p0);
    // ... (print other averages)

    // Use WiFiClient class to create TCP connections
    WiFiClient client;
    HTTPClient https;
    Serial.println("[HTTPS] begin...");
    Serial.println("[HTTPS] using insecure SSL, not validating certificate");
    https.setInsecure();
    if (https.begin("https://map.cheltenham.space/api/v1/sensor/test-node-2-uuid")) {  // HTTPS

      Serial.println("[HTTPS] POST...");

      https.addHeader("Content-Type", "application/json");
      StaticJsonDocument<200> doc;
      doc["relative_humidity"] = avgAmbientHumidity;
      doc["temperature"] = avgAmbientTemperature;
      doc["pm1"] = avgMassConcentrationPm1p0;
      doc["pm2_5"] = avgMassConcentrationPm2p5;
      doc["pm4"] = avgMassConcentrationPm4p0;
      doc["pm10"] = avgMassConcentrationPm10p0;
      doc["voc"] = avgVocIndex;
      doc["nox"] = avgNoxIndex;

      String payload;
      serializeJson(doc, payload);

      int httpCode = https.POST(payload);
      // start connection and send HTTP header
      //int httpCode = https.POST("{\"relative_humidity\":\"" + String(avgAmbientHumidity) + "\", \"temperature\":\"" + String(avgAmbientTemperature) + "\", \"pm1\":\"" + String(avgMassConcentrationPm1p0) + "\", \"pm2_5\":\"" + String(avgMassConcentrationPm2p5) + "\", \"pm4\":\"" + String(avgMassConcentrationPm4p0) + "\", \"pm10\":\"" + String(avgMassConcentrationPm10p0) + "\", \"voc\":\"" + String(avgVocIndex) + "\", \"nox\":\"" + String(avgNoxIndex) + "\"}");

      // ... (rest of the HTTPS code)
    }

    // Reset the totals and the number of readings taken
    totalMassConcentrationPm1p0 = 0;
    totalMassConcentrationPm2p5 = 0;
    totalMassConcentrationPm4p0 = 0;
    totalMassConcentrationPm10p0 = 0;
    totalAmbientHumidity = 0;
    totalAmbientTemperature = 0;
    totalVocIndex = 0;
    totalNoxIndex = 0;
    readingsTaken = 0;

    previousMillis = currentMillis;
  }
}
