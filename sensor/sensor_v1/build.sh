#!/bin/bash

# Check if arduino-cli is installed, if not, slap yourself.
if ! command -v arduino-cli &> /dev/null
then
    echo "arduino-cli is not installed. Install it first, then rerun."
    echo "If on fedora linux, use `curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR=~/.local/bin sh`"
    exit 1
fi

# Update the index of available platforms
echo "Updating platform index..."
arduino-cli core update-index

# Install the RP2040 core if you haven't already
echo "Installing the RP2040 core..."
arduino-cli core install rp2040:rp2040

# Set the RP2040 board type.
BOARD_NAME="rp2040:rp2040:rpipicow"

# Check if the sketch file exists
SKETCH_PATH="./sensor_v1.ino"
if [ ! -f "$SKETCH_PATH" ]; then
    echo "Sketch file not found at $SKETCH_PATH"
    exit 1
fi

# Check if the input file with variables exists
INPUT_FILE="node_credentials.csv"
if [ ! -f "$INPUT_FILE" ]; then
    echo "Input file $INPUT_FILE not found. Create it and try again."
    exit 1
fi

# Directory where the compiled files will be placed
BUILD_DIR="./build/${BOARD_NAME//:/\.}"
OUT_DIR="./build/out"

mkdir -p $OUT_DIR

# Clean up old builds
rm -rf $OUT_DIR/*

# Compile for each set of variables in the input file
while IFS=',' read -r SENSORNAME STASSID STAPSK UUID
do
    echo "----------------------------------------------------------"
    if [ -z "$SENSORNAME" ] || [ -z "$STASSID" ] || [ -z "$STAPSK" ] || [ -z "$UUID" ]; then
        echo "Skipping incomplete line in $INPUT_FILE. Fix your formatting."
        continue
    fi

    echo "Compiling sketch with NAME: $SENSORNAME, SSID: $STASSID, PSK: $STAPSK, UUID: $UUID"

    # Quote all variables that could contain spaces
    arduino-cli compile \
        --fqbn "$BOARD_NAME" "$SKETCH_PATH" -e \
        --build-property "build.extra_flags=\"-DUUID=\"$UUID\"\" \"-DSTAPSK=\"$STAPSK\"\" \"-DSTASSID=\"$STASSID\"\"" --build-property "build.fs_start=270397440"

    # Check if the build was successful by verifying if the .uf2 file exists
    FIRMWARE_FILE="$BUILD_DIR/sensor_v1.ino.uf2"
    if [ ! -f "$FIRMWARE_FILE" ]; then
        echo "Compilation failed for NAME: $SENSORNAME. Try fixing your code."
        continue
    fi

    # Create a sensible output filename, using the UUID or SSID in the filename
    OUTPUT_FILE="${OUT_DIR}/${SENSORNAME// /_}_firmware.uf2"  # Replace spaces in the filename with underscores

    # Move and rename the .uf2 file
    mv "$FIRMWARE_FILE" "$OUTPUT_FILE"
    rm -rf $BUILD_DIR
    echo "Firmware for $SENSORNAME saved as $OUTPUT_FILE"

    echo "Done compiling for $SENSORNAME"

done < "$INPUT_FILE"

echo "All builds completed"
