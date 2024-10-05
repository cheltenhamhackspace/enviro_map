#include "utilities.h"
#include <ESP_SSLClient.h>
#include <ArduinoJson.h>
#include <Arduino.h>
#include <SensirionI2CSen5x.h>
#include <Wire.h>

SensirionI2CSen5x sen5x_1;

// Select your modem:
// #define TINY_GSM_MODEM_SIM800
// #define TINY_GSM_MODEM_SIM808
// #define TINY_GSM_MODEM_SIM868
// #define TINY_GSM_MODEM_SIM900
// #define TINY_GSM_MODEM_SIM7000
// #define TINY_GSM_MODEM_SIM7000SSL
// #define TINY_GSM_MODEM_SIM7080
// #define TINY_GSM_MODEM_SIM5360
#define TINY_GSM_MODEM_SIM7600
// #define TINY_GSM_MODEM_A7672X
// #define TINY_GSM_MODEM_UBLOX
// #define TINY_GSM_MODEM_SARAR4
// #define TINY_GSM_MODEM_SARAR5
// #define TINY_GSM_MODEM_M95
// #define TINY_GSM_MODEM_BG95
// #define TINY_GSM_MODEM_BG96
// #define TINY_GSM_MODEM_A6
// #define TINY_GSM_MODEM_A7
// #define TINY_GSM_MODEM_M590
// #define TINY_GSM_MODEM_MC60
// #define TINY_GSM_MODEM_MC60E
// #define TINY_GSM_MODEM_ESP8266
// #define TINY_GSM_MODEM_ESP32
// #define TINY_GSM_MODEM_XBEE
// #define TINY_GSM_MODEM_SEQUANS_MONARCH

// Set serial for debug console (to the Serial Monitor, default speed 115200)
#define SerialMon Serial

// Set serial for AT commands (to the module)
// Use Hardware Serial on Mega, Leonardo, Micro
#ifndef __AVR_ATmega328P__
#define SerialAT Serial1

// or Software Serial on Uno, Nano
#else
#include <SoftwareSerial.h>
SoftwareSerial SerialAT(2, 3);  // RX, TX
#endif

// See all AT commands, if wanted
// #define DUMP_AT_COMMANDS

// Define the serial console for debug prints, if needed
#define TINY_GSM_DEBUG SerialMon

// Range to attempt to autobaud
// NOTE:  DO NOT AUTOBAUD in production code.  Once you've established
// communication, set a fixed baud rate using modem.setBaud(#).
#define GSM_AUTOBAUD_MIN 9600
#define GSM_AUTOBAUD_MAX 57600

// Add a reception delay, if needed.
// This may be needed for a fast processor at a slow baud rate.
// #define TINY_GSM_YIELD() { delay(2); }

/*
 * Tests enabled
 */
#define TINY_GSM_TEST_GPRS true
#define TINY_GSM_TEST_TCP true
#define TINY_GSM_TEST_BATTERY true
#define TINY_GSM_TEST_TEMPERATURE true
#define TINY_GSM_TEST_GSM_LOCATION true
#define TINY_GSM_TEST_NTP true
#define TINY_GSM_TEST_TIME true
// disconnect and power down modem after tests
#define TINY_GSM_POWERDOWN false

// set GSM PIN, if any
#define GSM_PIN ""

// Set phone numbers, if you want to test SMS and Calls
// #define SMS_TARGET  "+380xxxxxxxxx"
// #define CALL_TARGET "+380xxxxxxxxx"

// Your GPRS credentials, if any
const char apn[] = "YourAPN";
// const char apn[] = "ibasis.iot";
const char gprsUser[] = "";
const char gprsPass[] = "";

// Your WiFi connection credentials, if applicable
const char wifiSSID[] = "YourSSID";
const char wifiPass[] = "YourWiFiPass";

// Server details to test TCP/SSL
const char server[]   = "www.cloudflare.com";
const char resource[] = "/robots.txt";



// Delays
unsigned long currentTime = 0;
unsigned long lastReadingTime = 0;
unsigned long lastReportTime = 0;
unsigned long readingInterval = 60000; // 1 minute
unsigned long reportInterval = 900000; // 15 minutes

// Define the number of readings to store
const int numReadings = 15;

// Arrays to store the last 15 readings for sensor1
float sensor1_pm1p0Readings[numReadings];
float sensor1_pm2p5Readings[numReadings];
float sensor1_pm4p0Readings[numReadings];
float sensor1_pm10p0Readings[numReadings];
float sensor1_humidityReadings[numReadings];
float sensor1_temperatureReadings[numReadings];
float sensor1_vocIndexReadings[numReadings];
float sensor1_noxIndexReadings[numReadings];

// Arrays to store the last 15 readings for sensor2
float sensor2_pm1p0Readings[numReadings];
float sensor2_pm2p5Readings[numReadings];
float sensor2_pm4p0Readings[numReadings];
float sensor2_pm10p0Readings[numReadings];
float sensor2_humidityReadings[numReadings];
float sensor2_temperatureReadings[numReadings];
float sensor2_vocIndexReadings[numReadings];
float sensor2_noxIndexReadings[numReadings];

// Index for the current reading
int readingIndex = 0;



#include <TinyGsmClient.h>

#if TINY_GSM_TEST_GPRS && not defined TINY_GSM_MODEM_HAS_GPRS
#undef TINY_GSM_TEST_GPRS
#undef TINY_GSM_TEST_WIFI
#define TINY_GSM_TEST_GPRS false
#define TINY_GSM_TEST_WIFI true
#endif
#if TINY_GSM_TEST_WIFI && not defined TINY_GSM_MODEM_HAS_WIFI
#undef TINY_GSM_USE_GPRS
#undef TINY_GSM_USE_WIFI
#define TINY_GSM_USE_GPRS true
#define TINY_GSM_USE_WIFI false
#endif

#ifdef DUMP_AT_COMMANDS
#include <StreamDebugger.h>
StreamDebugger debugger(SerialAT, SerialMon);
TinyGsm        modem(debugger);
#else
TinyGsm        modem(SerialAT);
#endif


#define I2C_SDA1 5
#define I2C_SCL1 3
#define I2C_SDA2 1
#define I2C_SCL2 2

unsigned char serialNumber[32];
uint8_t serialNumberSize = 32;

SEN5xSensor sensor1(Wire);
SEN5xSensor sensor2(Wire1);

void initModem() {
  SerialAT.begin(115200, SERIAL_8N1, MODEM_RX_PIN, MODEM_TX_PIN);

#ifdef BOARD_POWERON_PIN
  pinMode(BOARD_POWERON_PIN, OUTPUT);
  digitalWrite(BOARD_POWERON_PIN, HIGH);
#endif

  // Set modem reset pin ,reset modem
  pinMode(MODEM_RESET_PIN, OUTPUT);
  digitalWrite(MODEM_RESET_PIN, !MODEM_RESET_LEVEL); delay(100);
  digitalWrite(MODEM_RESET_PIN, MODEM_RESET_LEVEL); delay(2600);
  digitalWrite(MODEM_RESET_PIN, !MODEM_RESET_LEVEL);

  pinMode(BOARD_PWRKEY_PIN, OUTPUT);
  digitalWrite(BOARD_PWRKEY_PIN, LOW);
  delay(100);
  digitalWrite(BOARD_PWRKEY_PIN, HIGH);
  delay(100);
  digitalWrite(BOARD_PWRKEY_PIN, LOW);

  Serial.println(F("***********************************************************"));
}

void setup() {
  // Set console baud rate
  SerialMon.begin(115200);
  delay(10);

  // !!!!!!!!!!!
  // Set your reset, enable, power pins here
  // !!!!!!!!!!!

  DBG("Wait...");
  delay(6000L);

  // Set GSM module baud rate
  // TinyGsmAutoBaud(SerialAT, GSM_AUTOBAUD_MIN, GSM_AUTOBAUD_MAX);
  initModem();

  Wire.begin(I2C_SDA1, I2C_SCL1);
  Wire1.begin(I2C_SDA2, I2C_SCL2);

  sensor1.begin();
  sensor2.begin();
}

void loop() {
  // Restart takes quite some time
  // To skip it, call init() instead of restart()
  DBG("Initializing modem...");
  if (!modem.restart()) {
    DBG("Failed to restart modem, delaying 10s and retrying");
    return;
  }

  DBG("Waiting for network...");
  if (!modem.waitForNetwork(600000L, true)) {
    delay(10000);
    return;
  }

  DBG("Connecting to", apn);
  if (!modem.gprsConnect(apn, gprsUser, gprsPass)) {
    delay(10000);
    return;
  }

  // TinyGsmClient client(modem, 0);
  // const int     port = 80;
  // DBG("Connecting to", server);
  // if (!client.connect(server, port)) {
  //   DBG("... failed");
  // } else {
  //   // Make a HTTP GET request:
  //   client.print(String("GET ") + resource + " HTTP/1.0\r\n");
  //   client.print(String("Host: ") + server + "\r\n");
  //   client.print("Connection: close\r\n\r\n");

  //   // Wait for data to arrive
  //   uint32_t start = millis();
  //   while (client.connected() && !client.available() &&
  //          millis() - start < 30000L) {
  //     delay(100);
  //   };

  //   // Read data
  //   start          = millis();
  //   char logo[640] = {
  //       '\0',
  //   };
  //   int read_chars = 0;
  //   while (client.connected() && millis() - start < 10000L) {
  //     while (client.available()) {
  //       logo[read_chars]     = client.read();
  //       logo[read_chars + 1] = '\0';
  //       read_chars++;
  //       start = millis();
  //     }
  //   }
  //   DBG(logo);
  //   DBG("#####  RECEIVED:", strlen(logo), "CHARACTERS");
  //   client.stop();
  // }

  while (true) {
    currentTime = millis();

    if (currentTime - lastReadingTime >= readingInterval) {
      DBG("READING");
      
      // Read sensor1 data
      float pm1p0, pm2p5, pm4p0, pm10p0, humidity, temperature, vocIndex, noxIndex;
      sensor1.getReadings(pm1p0, pm2p5, pm4p0, pm10p0, humidity, temperature, vocIndex, noxIndex);
      DBG("Sensor1: :", pm1p0, pm2p5, pm4p0, pm10p0, humidity, temperature, vocIndex, noxIndex);

      // Store the readings in the sensor1 arrays
      sensor1_pm1p0Readings[readingIndex] = pm1p0;
      sensor1_pm2p5Readings[readingIndex] = pm2p5;
      sensor1_pm4p0Readings[readingIndex] = pm4p0;
      sensor1_pm10p0Readings[readingIndex] = pm10p0;
      sensor1_humidityReadings[readingIndex] = humidity;
      sensor1_temperatureReadings[readingIndex] = temperature;
      sensor1_vocIndexReadings[readingIndex] = vocIndex;
      sensor1_noxIndexReadings[readingIndex] = noxIndex;

      // Read sensor2 data
      sensor2.getReadings(pm1p0, pm2p5, pm4p0, pm10p0, humidity, temperature, vocIndex, noxIndex);
      DBG("Sensor2: :", pm1p0, pm2p5, pm4p0, pm10p0, humidity, temperature, vocIndex, noxIndex);

      // Store the readings in the sensor2 arrays
      sensor2_pm1p0Readings[readingIndex] = pm1p0;
      sensor2_pm2p5Readings[readingIndex] = pm2p5;
      sensor2_pm4p0Readings[readingIndex] = pm4p0;
      sensor2_pm10p0Readings[readingIndex] = pm10p0;
      sensor2_humidityReadings[readingIndex] = humidity;
      sensor2_temperatureReadings[readingIndex] = temperature;
      sensor2_vocIndexReadings[readingIndex] = vocIndex;
      sensor2_noxIndexReadings[readingIndex] = noxIndex;

      // Increment the index for the next reading
      readingIndex = (readingIndex + 1) % numReadings;

      lastReadingTime = currentTime;
    }

    if (currentTime - lastReportTime >= reportInterval) {
      modem.maintain();

      // Create a JSON document
      StaticJsonDocument<200> doc;
      String json;

      // Add values to the document
      doc["relative_humidity"] = String(calculateAverage(sensor1_humidityReadings, numReadings));
      doc["temperature"] = String(calculateAverage(sensor1_temperatureReadings, numReadings));
      doc["pm1"] = String(calculateAverage(sensor1_pm1p0Readings, numReadings));
      doc["pm2_5"] = String(calculateAverage(sensor1_pm2p5Readings, numReadings));
      doc["pm4"] = String(calculateAverage(sensor1_pm4p0Readings, numReadings));
      doc["pm10"] = String(calculateAverage(sensor1_pm10p0Readings, numReadings));
      doc["voc"] = String(calculateAverage(sensor1_vocIndexReadings, numReadings));
      doc["nox"] = String(calculateAverage(sensor1_noxIndexReadings, numReadings));

      // Convert the document to a string
      serializeJson(doc, json);

      if (httpsPost("map.cheltenham.space", "/api/v1/sensor/verification-node-1-uuid-1", json.c_str())) {
        DBG("POST request successful");
      } else {
        DBG("POST request failed");
      }


      // Add values to the document
      doc["relative_humidity"] = String(calculateAverage(sensor2_humidityReadings, numReadings));
      doc["temperature"] = String(calculateAverage(sensor2_temperatureReadings, numReadings));
      doc["pm1"] = String(calculateAverage(sensor2_pm1p0Readings, numReadings));
      doc["pm2_5"] = String(calculateAverage(sensor2_pm2p5Readings, numReadings));
      doc["pm4"] = String(calculateAverage(sensor2_pm4p0Readings, numReadings));
      doc["pm10"] = String(calculateAverage(sensor2_pm10p0Readings, numReadings));
      doc["voc"] = String(calculateAverage(sensor2_vocIndexReadings, numReadings));
      doc["nox"] = String(calculateAverage(sensor2_noxIndexReadings, numReadings));

      // Convert the document to a string
      serializeJson(doc, json);

      if (httpsPost("map.cheltenham.space", "/api/v1/sensor/verification-node-1-uuid-2", json.c_str())) {
        DBG("POST request successful");
      } else {
        DBG("POST request failed");
      }
      lastReportTime = currentTime;
    }
  }
}

bool httpsPost(const char* server, const char* resource, const char* json) {
  TinyGsmClient client(modem, 0);
  ESP_SSLClient ssl_client;

  ssl_client.setInsecure();
  ssl_client.setDebugLevel(1);

  ssl_client.setClient(&client);


  const int port = 443;
  DBG("Connecting to", server);
  if (!ssl_client.connect(server, port)) {
    DBG("... failed");
    return false;
  }

  // Make a HTTP POST request:
  ssl_client.print(String("POST ") + resource + " HTTP/1.1\r\n");
  ssl_client.print(String("Host: ") + server + "\r\n");
  ssl_client.print("Content-Type: application/json\r\n");
  ssl_client.print("Connection: close\r\n");
  ssl_client.print("Content-Length: ");
  ssl_client.print(strlen(json));
  ssl_client.print("\r\n\r\n");
  ssl_client.print(json);

  // Wait for data to arrive
  uint32_t start = millis();
  while (ssl_client.connected() && !ssl_client.available() &&
         millis() - start < 30000L) {
    delay(100);
  };

  // Read data
  start = millis();
  char response[2048] = {
      '\0',
  };
  int read_chars = 0;
  while (ssl_client.connected() && millis() - start < 20000L) {
    while (ssl_client.available()) {
      response[read_chars] = ssl_client.read();
      response[read_chars + 1] = '\0';
      read_chars++;
      start = millis();
    }
  }
  DBG(response);
  DBG("#####  RECEIVED:", strlen(response), "CHARACTERS");
  ssl_client.stop();

  // Check if the response starts with "HTTP/1.1 200 OK"
  if (strncmp(response, "HTTP/1.1 200 OK", 15) == 0) {
    return true;
  } else {
    return false;
  }
}

