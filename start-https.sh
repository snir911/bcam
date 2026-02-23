#!/bin/bash

# ========================================
# Baby Monitor - HTTPS Server Script
# ========================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

PORT=8443
CERT_DIR="./certs"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   👶 Baby Monitor HTTPS Server${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Create certs directory if it doesn't exist
mkdir -p "$CERT_DIR"

# Check if certificates already exist
if [ ! -f "$CERT_DIR/server.key" ] || [ ! -f "$CERT_DIR/server.crt" ]; then
    echo -e "${YELLOW}📜 Generating self-signed certificate...${NC}"

    # Get local IP
    LOCAL_IP=$(hostname -I | awk '{print $1}')

    # Generate self-signed certificate
    openssl req -new -x509 -keyout "$CERT_DIR/server.key" -out "$CERT_DIR/server.crt" -days 365 -nodes \
        -subj "/C=US/ST=State/L=City/O=BabyMonitor/CN=$LOCAL_IP"

    echo -e "${GREEN}✓ Certificate generated!${NC}"
else
    echo -e "${GREEN}✓ Using existing certificate${NC}"
fi

echo ""
echo -e "${BLUE}Local IP: $(hostname -I | awk '{print $1}')${NC}"
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   📱 Access URLs (HTTPS)${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Local:${NC} https://localhost:$PORT/"
echo -e "${BLUE}LAN:${NC} https://$(hostname -I | awk '{print $1}'):$PORT/"
echo ""
echo -e "${YELLOW}⚠️  Browser will show security warning (it's normal!)${NC}"
echo -e "${YELLOW}    Click 'Advanced' → 'Proceed to site' to continue${NC}"
echo ""
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Starting HTTPS server on port $PORT...${NC}"
echo ""

# Start Python HTTPS server
python3 -c "
import http.server
import ssl

server_address = ('0.0.0.0', $PORT)
httpd = http.server.HTTPServer(server_address, http.server.SimpleHTTPRequestHandler)

context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain('$CERT_DIR/server.crt', '$CERT_DIR/server.key')

httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

print('HTTPS Server running...')
print('Press Ctrl+C to stop')
httpd.serve_forever()
"
