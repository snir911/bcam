#!/bin/bash

# ========================================
# Baby Monitor - Start Server Script
# ========================================

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
PORT=8000

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   👶 Baby Monitor Server${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Get local IP address
echo -e "${YELLOW}📡 Detecting network interfaces...${NC}"
LOCAL_IP=$(hostname -I | awk '{print $1}')

if [ -z "$LOCAL_IP" ]; then
    echo -e "${RED}❌ Could not detect local IP address${NC}"
    echo -e "${YELLOW}⚠️  Using localhost only${NC}"
    LOCAL_IP="127.0.0.1"
fi

echo -e "${GREEN}✓ Local IP: $LOCAL_IP${NC}"
echo ""

# Check if port is already in use
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${RED}❌ Port $PORT is already in use!${NC}"
    echo -e "${YELLOW}🔍 Finding process using port $PORT...${NC}"
    lsof -i :$PORT
    echo ""
    echo -e "${YELLOW}To kill the process, run:${NC}"
    echo -e "  kill -9 \$(lsof -t -i:$PORT)"
    exit 1
fi

# Display access URLs
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   📱 Access URLs${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Local Access (this device):${NC}"
echo -e "  👉 http://localhost:$PORT/"
echo ""
echo -e "${BLUE}LAN Access (other devices on same WiFi):${NC}"
echo -e "  👉 http://$LOCAL_IP:$PORT/"
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   📋 Quick Start Guide${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Camera Mode (device with baby):${NC}"
echo -e "  1. Open: http://$LOCAL_IP:$PORT/"
echo -e "  2. Click '📹 Camera Mode'"
echo -e "  3. Allow camera/microphone access"
echo -e "  4. QR code will appear"
echo ""
echo -e "${YELLOW}Viewer Mode (your monitoring device):${NC}"
echo -e "  1. Open: http://$LOCAL_IP:$PORT/"
echo -e "  2. Click '👀 Viewer Mode'"
echo -e "  3. Scan the QR code"
echo -e "  4. Enjoy live streaming!"
echo ""
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}⚠️  To stop the server: Press Ctrl+C${NC}"
echo ""
echo -e "${BLUE}Starting server on port $PORT...${NC}"
echo ""

# Start the server
# Check if Python 3 is available
if command -v python3 &> /dev/null; then
    python3 -m http.server $PORT
elif command -v python &> /dev/null; then
    python -m SimpleHTTPServer $PORT
else
    echo -e "${RED}❌ Python is not installed!${NC}"
    echo -e "${YELLOW}Please install Python to run the server.${NC}"
    exit 1
fi
