#define MODEM_BAUDRATE                      (115200)
#define MODEM_DTR_PIN                       (7)
#define MODEM_TX_PIN                        (17)
#define MODEM_RX_PIN                        (18)
// The modem boot pin needs to follow the startup sequence.
#define BOARD_PWRKEY_PIN                    (15)
#define BOARD_BAT_ADC_PIN                   (4)
// The modem power switch must be set to HIGH for the modem to supply power.
// #define BOARD_POWERON_PIN                   (12)
#define MODEM_RING_PIN                      (6)
#define MODEM_RESET_PIN                     (16)
#define BOARD_MISO_PIN                      (47)
#define BOARD_MOSI_PIN                      (14)
#define BOARD_SCK_PIN                       (21)
#define BOARD_SD_CS_PIN                     (13)

#define MODEM_RESET_LEVEL                   LOW
#define SerialAT                            Serial1



#include <Arduino.h>
#include <Wire.h>
#include <SensirionI2CSen5x.h>

class SEN5xSensor {
  private:
    SensirionI2CSen5x sen5x;
    TwoWire* wire;

  public:
    SEN5xSensor(TwoWire& wire) : wire(&wire) {}

    void begin() {
      sen5x.begin(*wire);
      uint16_t error;
      char errorMessage[256];
      error = sen5x.deviceReset();
      if (error) {
        Serial.println("Error trying to execute deviceReset(): ");
        errorToString(error, errorMessage, 256);
        Serial.println(errorMessage);
      }

      unsigned char serialNumber[32];
      uint8_t serialNumberSize = 32;
      error = sen5x.getSerialNumber(serialNumber, serialNumberSize);
      if (error) {
        Serial.println("Error trying to execute getSerialNumber(): ");
        errorToString(error, errorMessage, 256);
        Serial.println(errorMessage);
      } else {
        Serial.println("SerialNumber:");
        Serial.println((char*)serialNumber);
      }

      float tempOffset = 0.0;
      error = sen5x.setTemperatureOffsetSimple(tempOffset);
      if (error) {
        Serial.println("Error trying to execute setTemperatureOffsetSimple(): ");
        errorToString(error, errorMessage, 256);
        Serial.println(errorMessage);
      } else {
        Serial.println("Temperature Offset set to ");
        Serial.println(tempOffset);
        Serial.println(" deg. Celsius (SEN54/SEN55 only)");
      }

      error = sen5x.startMeasurement();
      if (error) {
        Serial.println("Error trying to execute startMeasurement(): ");
        errorToString(error, errorMessage, 256);
        Serial.println(errorMessage);
      }
    }

    void getReadings(float& pm1p0, float& pm2p5, float& pm4p0, float& pm10p0, float& humidity, float& temperature, float& vocIndex, float& noxIndex) {
      uint16_t error;
      char errorMessage[256];
      error = sen5x.readMeasuredValues(pm1p0, pm2p5, pm4p0, pm10p0, humidity, temperature, vocIndex, noxIndex);
      if (error) {
        Serial.println("Error trying to execute readMeasuredValues(): ");
        errorToString(error, errorMessage, 256);
        Serial.println(errorMessage);
      }
    }
};

// Calculate the average of an array of floats
float calculateAverage(float values[], int size) {
  float sum = 0;
  for (int i = 0; i < size; i++) {
    sum += values[i];
  }
  return sum / size;
}