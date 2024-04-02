/*
    This sketch establishes a TCP connection to a "quote of the day" service.
    It sends a "hello" message, and then prints received data.
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <Arduino_JSON.h>
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
  delay(300000);  // execute once every 5 minutes, don't flood remote service
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

  error = sen5x.readMeasuredValues(
    massConcentrationPm1p0, massConcentrationPm2p5, massConcentrationPm4p0,
    massConcentrationPm10p0, ambientHumidity, ambientTemperature, vocIndex,
    noxIndex);

  if (error) {
    Serial.print("Error trying to execute readMeasuredValues(): ");
    errorToString(error, errorMessage, 256);
    Serial.println(errorMessage);
  } else {
    Serial.print("MassConcentrationPm1p0:");
    Serial.print(massConcentrationPm1p0);
    Serial.print("\t");
    Serial.print("MassConcentrationPm2p5:");
    Serial.print(massConcentrationPm2p5);
    Serial.print("\t");
    Serial.print("MassConcentrationPm4p0:");
    Serial.print(massConcentrationPm4p0);
    Serial.print("\t");
    Serial.print("MassConcentrationPm10p0:");
    Serial.print(massConcentrationPm10p0);
    Serial.print("\t");
    Serial.print("AmbientHumidity:");
    if (isnan(ambientHumidity)) {
        Serial.print("n/a");
    } else {
        Serial.print(ambientHumidity);
    }
    Serial.print("\t");
    Serial.print("AmbientTemperature:");
    if (isnan(ambientTemperature)) {
        Serial.print("n/a");
    } else {
        Serial.print(ambientTemperature);
    }
    Serial.print("\t");
    Serial.print("VocIndex:");
    if (isnan(vocIndex)) {
        Serial.print("n/a");
    } else {
        Serial.print(vocIndex);
    }
    Serial.print("\t");
    Serial.print("NoxIndex:");
    if (isnan(noxIndex)) {
        Serial.println("n/a");
    } else {
        Serial.println(noxIndex);
    }
  }

  // Use WiFiClient class to create TCP connections
  WiFiClient client;
  HTTPClient https;
  Serial.println("[HTTPS] begin...");
  Serial.println("[HTTPS] using insecure SSL, not validating certificate");
  https.setInsecure(); 
  if (https.begin("https://api.ntf.systems/v1/sensor")) {  // HTTPS

    Serial.println("[HTTPS] POST...");
    // start connection and send HTTP header
    int httpCode = https.POST("{\"DeviceId\":\"test-node-2-uuid\", \"RelativeHumidity\":\"" + String(ambientHumidity) + "\", \"Temperature\":\"" + String(ambientTemperature) + "\", \"PM1\":\"" + String(massConcentrationPm1p0) + "\", \"PM2_5\":\"" + String(massConcentrationPm2p5) + "\", \"PM4\":\"" + String(massConcentrationPm4p0) + "\", \"PM10\":\"" + String(massConcentrationPm10p0) + "\", \"VOC\":\"" + String(vocIndex) + "\", \"NOx\":\"" + String(noxIndex) + "\"}");

    // httpCode will be negative on error
    if (httpCode > 0) {
      // HTTP header has been send and Server response header has been handled
      Serial.printf("[HTTPS] POST... code: %d\n\r", httpCode);

      // file found at server
      if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_MOVED_PERMANENTLY) {
        String payload = https.getString();
        Serial.println(payload);
      }
    } else {
      Serial.printf("[HTTPS] GET... failed, error: %s\n\r", https.errorToString(httpCode).c_str());
    }

    https.end();
  } else {
    Serial.printf("[HTTPS] Unable to connect\n\r");
  }
}
