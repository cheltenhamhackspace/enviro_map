#!/bin/bash

# Set the batch size (number of simultaneous builds)
BATCH_SIZE=8

# Check if arduino-cli is installed
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
OUT_DIR="./build/out"
mkdir -p $OUT_DIR

# Clean up old builds
rm -rf $OUT_DIR/*

# Function to compile a single configuration
compile_config() {
    local SENSORNAME="$1"
    local STASSID="$2"
    local STAPSK="$3"
    local UUID="$4"
    
    # Create a unique build directory for this configuration
    local BUILD_DIR="./build/${SENSORNAME// /_}"
    mkdir -p "$BUILD_DIR"

    echo "Starting compilation for NAME: $SENSORNAME"
    echo "Parameters: SSID: $STASSID, PSK: $STAPSK, UUID: $UUID"

    # Quote all variables that could contain spaces
    arduino-cli compile \
        --fqbn "$BOARD_NAME" "$SKETCH_PATH" -e \
        --build-path "$BUILD_DIR" \
        --build-property "build.extra_flags=\"-DUUID=\"$UUID\"\" \"-DSTAPSK=\"$STAPSK\"\" \"-DSTASSID=\"$STASSID\"\"" \
        --build-property "build.fs_start=270397440"

    # Check if the build was successful
    local FIRMWARE_FILE="$BUILD_DIR/sensor_v1.ino.uf2"
    if [ ! -f "$FIRMWARE_FILE" ]; then
        echo "Compilation failed for NAME: $SENSORNAME"
        return 1
    fi

    # Create output filename
    local OUTPUT_FILE="${OUT_DIR}/${SENSORNAME// /_}_firmware.uf2"

    # Move and rename the .uf2 file
    mv "$FIRMWARE_FILE" "$OUTPUT_FILE"
    rm -rf "$BUILD_DIR"
    echo "Firmware for $SENSORNAME saved as $OUTPUT_FILE"
}

# Function to process a batch of builds
process_batch() {
    local -a PIDS=()
    local COUNT=0
    
    while IFS=',' read -r SENSORNAME STASSID STAPSK UUID; do
        if [ -z "$SENSORNAME" ] || [ -z "$STASSID" ] || [ -z "$STAPSK" ] || [ -z "$UUID" ]; then
            echo "Skipping incomplete line in $INPUT_FILE"
            continue
        fi

        # Start compilation in background
        compile_config "$SENSORNAME" "$STASSID" "$STAPSK" "$UUID" &
        PIDS+=($!)
        ((COUNT++))

        # If we've reached the batch size, wait for all current builds to complete
        if [ $COUNT -eq $BATCH_SIZE ]; then
            echo "Waiting for current batch to complete..."
            for PID in "${PIDS[@]}"; do
                wait $PID
            done
            PIDS=()
            COUNT=0
            echo "Batch complete, starting next batch..."
        fi
    done

    # Wait for any remaining builds
    if [ ${#PIDS[@]} -gt 0 ]; then
        echo "Waiting for final batch to complete..."
        for PID in "${PIDS[@]}"; do
            wait $PID
        done
    fi
}

# Count total number of valid configurations
TOTAL_CONFIGS=$(grep -v '^[[:space:]]*$' "$INPUT_FILE" | wc -l)
echo "Found $TOTAL_CONFIGS configurations to build"
echo "Processing in batches of $BATCH_SIZE"

# Process all configurations in batches
process_batch < "$INPUT_FILE"

echo "All builds completed"