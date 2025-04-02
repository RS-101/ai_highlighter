#!/bin/bash

# AI Highlighter Extension Build Script
echo "Building AI Highlighter Extension"

# Set variables
BUILD_DIR="./build"
EXTENSION_NAME="ai_highlighter"
VERSION=$(grep -o '"version": "[^"]*"' manifest.json | cut -d'"' -f4)
OUTPUT_FILE="../${EXTENSION_NAME}_v${VERSION}.xpi"

# Create clean build directory
echo "Creating build directory..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/lib" "$BUILD_DIR/icons"

# Copy core files
echo "Copying core files..."
cp manifest.json popup.html popup.js background.js content.js "$BUILD_DIR/"

# Copy library files
echo "Copying library files..."
cp lib/pdf.min.js lib/pdf.worker.min.js "$BUILD_DIR/lib/"

# Copy and verify icons
echo "Copying icon files..."
cp icons/icon-16.png icons/icon-32.png icons/icon-48.png icons/icon-64.png icons/icon-96.png icons/icon-128.png "$BUILD_DIR/icons/"

# Verify essential files
echo "Verifying files..."
MISSING_FILES=0

check_file() {
  if [ ! -f "$BUILD_DIR/$1" ]; then
    echo "ERROR: Missing file $1"
    MISSING_FILES=$((MISSING_FILES+1))
  fi
}

# Check core files
check_file "manifest.json"
check_file "popup.html"
check_file "popup.js"
check_file "background.js"
check_file "content.js"

# Check library files
check_file "lib/pdf.min.js"
check_file "lib/pdf.worker.min.js"

# Check icon files
check_file "icons/icon-16.png"
check_file "icons/icon-32.png"
check_file "icons/icon-48.png"
check_file "icons/icon-64.png"
check_file "icons/icon-96.png"
check_file "icons/icon-128.png"

if [ $MISSING_FILES -gt 0 ]; then
  echo "ERROR: $MISSING_FILES files are missing. Build failed."
  exit 1
fi

# Create XPI package
echo "Creating XPI package..."
cd "$BUILD_DIR"
zip -r "$OUTPUT_FILE" * -x "*.DS_Store" -x "*__MACOSX*" -x "*.git*"

if [ $? -eq 0 ]; then
  echo "Success! Extension built at $OUTPUT_FILE"
  echo "Version: $VERSION"
  echo "To install in Firefox Developer Edition:"
  echo "1. Go to about:debugging"
  echo "2. Click 'This Firefox'"
  echo "3. Click 'Load Temporary Add-on'"
  echo "4. Select the XPI file"
  echo ""
  echo "To submit to Mozilla Add-ons:"
  echo "1. Go to https://addons.mozilla.org/developers/"
  echo "2. Upload the XPI file for review"
else
  echo "Error creating package. Check permissions and try again."
  exit 1
fi 