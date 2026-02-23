# 👶 Baby Monitor - WebRTC LAN Streaming

A secure, peer-to-peer baby monitor web application that works entirely in your browser. No servers, no cloud storage, no subscription - just direct video streaming between your devices on the same network.

## Features

- 📹 **Camera Mode** - Place device with baby and stream video/audio
- 👀 **Viewer Mode** - Watch from any device on your LAN
- 🔒 **Peer-to-peer** - Video never goes through external servers
- 📱 **Mobile-friendly** - Works on phones and tablets
- 🎯 **One-file app** - Everything in a single HTML file

## Quick Start

### Method 1: Using Python (Recommended for Testing)

```bash
# Navigate to the directory containing baby-monitor.html
cd /home/ssheribe/git/babycam

# Start a simple HTTP server
python3 -m http.server 8000

# Or using Python 2
python -m SimpleHTTPServer 8000
```

Then open in your browser:
- On the same device: `http://localhost:8000/baby-monitor.html`
- On other devices: `http://[YOUR_LOCAL_IP]:8000/baby-monitor.html`

### Method 2: Direct File Access

Some browsers allow direct file access for testing:
```bash
firefox baby-monitor.html
# or
google-chrome baby-monitor.html
```

⚠️ **Note**: Camera access requires HTTPS in production, but `localhost` works for testing.

## How to Use

### Setting Up Camera Mode

1. **On the device near the baby:**
   - Open `baby-monitor.html`
   - Click "📹 Camera Mode"
   - Grant camera and microphone permissions
   - A QR code will appear on screen
   - Keep this device with the baby

### Setting Up Viewer Mode

2. **On your monitoring device:**
   - Open `baby-monitor.html`
   - Click "👀 Viewer Mode"
   - Grant camera permission (for QR scanning)
   - Point your camera at the QR code from step 1
   - Video feed will start automatically

## Browser Compatibility

✅ **Desktop:**
- Chrome/Chromium 74+
- Firefox 66+
- Edge 79+
- Safari 12+

✅ **Mobile:**
- Chrome for Android 74+
- Safari on iOS 12+
- Samsung Internet 11+

## Network Requirements

- Both devices must be connected to the same LAN (Wi-Fi or Ethernet)
- No special router configuration needed
- No port forwarding required
- Firewall should allow WebRTC (usually enabled by default)

## Troubleshooting

### Camera/Microphone Not Working

- **Check permissions**: Ensure you granted camera/microphone access when prompted
- **HTTPS required**: Modern browsers require HTTPS for media access (except localhost)
- **iOS Safari**: May need user interaction before accessing camera - click a button first

### QR Scanner Not Working

- **Lighting**: Ensure good lighting for QR code scanning
- **Distance**: Hold camera 6-12 inches from QR code
- **Focus**: Wait for camera to focus on the QR code
- **Permissions**: Verify camera access was granted

### Connection Fails

- **Same network**: Verify both devices are on the same LAN
- **Firewall**: Check if firewall is blocking WebRTC connections
- **Try again**: Close the app and restart both devices
- **Browser console**: Open developer tools (F12) and check for errors

### No Video/Audio

- **Browser support**: Ensure you're using a compatible browser
- **Codec support**: Some older devices may not support the same video codecs
- **Bandwidth**: Poor Wi-Fi signal can affect streaming quality

## Technical Architecture

### WebRTC Peer-to-Peer

The app uses WebRTC for direct browser-to-browser communication:

1. **Signaling**: PeerJS provides a free cloud signaling server for initial handshake
2. **ICE/STUN**: Google's public STUN servers help with NAT traversal
3. **Media**: Audio/video streams directly between peers (no relay)

### Libraries Used

- **PeerJS** (v1.5.2) - Simplifies WebRTC peer connections
- **qrcode.js** (v1.5.3) - Generates QR codes
- **jsQR** (v1.4.0) - Scans QR codes from video stream

### Privacy & Security

✅ **No cloud storage** - Video is never saved anywhere
✅ **Peer-to-peer** - Direct connection between your devices
✅ **Temporary session** - Connection ends when you close the page
✅ **Local network** - Works entirely on your LAN

⚠️ **Security note**: This is designed for home LAN use. For production or internet-wide deployment, add encryption, authentication, and use HTTPS.

## Development Notes

### File Structure

```
baby-monitor.html
├── HTML structure
├── Embedded CSS (styling)
├── External libraries (CDN)
│   ├── PeerJS
│   ├── QRCode.js
│   └── jsQR
└── Embedded JavaScript (logic)
    ├── Camera mode functions
    ├── Viewer mode functions
    ├── QR code generation/scanning
    └── WebRTC connection handling
```

### Customization

You can easily customize:

- **Video quality**: Modify the `getUserMedia` constraints in `startCameraMode()`
- **UI colors**: Update the CSS gradient and color values
- **QR code size**: Change `width` parameter in `QRCode.toCanvas()`
- **Scanner sensitivity**: Adjust the interval in `setInterval()` for QR scanning

### Example: Change Video Quality

```javascript
// In startCameraMode(), find this section:
video: {
    facingMode: 'user',
    width: { ideal: 1280 },    // Change to 640 for lower quality
    height: { ideal: 720 }     // Change to 480 for lower quality
}
```

## Limitations

- **Battery drain**: Camera mode will drain battery quickly
- **Screen must stay on**: Device may sleep if screen turns off
- **One viewer at a time**: Current implementation supports 1-to-1 connection
- **No recording**: Video is not saved (by design)
- **Internet required**: PeerJS signaling requires internet (but media is local)

## Future Enhancements

Possible improvements:

- [ ] Multiple viewer support
- [ ] Chat/audio feedback from viewer to camera
- [ ] Motion detection alerts
- [ ] Night mode (low-light enhancement)
- [ ] Recording capability
- [ ] Self-hosted signaling server for complete offline use

## License

This is a demonstration project. Use freely for personal, educational, or commercial purposes.

## Support

For issues or questions:
1. Check the browser console (F12) for error messages
2. Verify your network setup and permissions
3. Test with a different browser or device
4. Ensure both devices are on the same LAN

---

**Made with ❤️ using WebRTC and vanilla JavaScript**
