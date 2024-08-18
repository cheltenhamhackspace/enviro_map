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