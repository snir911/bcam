# 👶 Baby Monitor - WebRTC Streaming

A secure, peer-to-peer baby monitor web application that works entirely in your browser. No servers, no cloud storage, no subscription - just direct video streaming between your devices.

## Features

- 📹 **Camera Mode** - Place device with baby and stream video/audio
- 👀 **Viewer Mode** - Watch from any device
- 🔒 **Peer-to-peer** - Video never goes through external servers (direct P2P or relay)
- 📱 **Mobile-friendly** - Works on phones and tablets
- 🔢 **Simple codes** - Easy 6-digit connection codes
- 🔄 **Auto-reconnect** - Viewer reconnects when returning from background
- 🔒 **Wake Lock** - Camera stays on when screen is active

## Quick Start

### Using the App

1. **On GitHub Pages:**
   - Visit: `https://[your-username].github.io/bcam/`
   - Or serve locally with Python/Node.js

2. **Locally with Python:**
   ```bash
   cd /home/ssheribe/git/babycam
   python3 -m http.server 8000
   ```
   Then open `http://localhost:8000`

⚠️ **Note**: Camera access requires HTTPS in production, but `localhost` works for testing.

## How to Use

### Setting Up Camera Mode

1. **On the device near the baby:**
   - Open the app in your browser
   - Click "📹 Camera Mode"
   - Grant camera and microphone permissions
   - A 6-digit code will appear on screen
   - Keep this device with the baby

### Setting Up Viewer Mode

2. **On your monitoring device:**
   - Open the app in your browser
   - Click "👀 Viewer Mode"
   - Enter the 6-digit code from the camera screen
   - Click "Connect"
   - Video feed will start automatically (muted)
   - Click "🔊 Enable Sound & Play" to unmute

## Browser Compatibility

✅ **Desktop:**
- Chrome/Chromium 74+
- Firefox 66+
- Edge 79+
- Safari 12+

✅ **Mobile:**
- Chrome for Android 74+
- Safari on iOS 16.4+ (for Wake Lock API)
- Samsung Internet 11+

## Network Requirements

### Works on LAN and Internet! 🌍

This baby monitor works on:
- ✅ **Same local network (LAN)** - Lowest latency
- ✅ **Direct internet P2P** - When NAT allows
- ✅ **TURN relay fallback** - For restricted networks

### Requirements:

- Both devices need internet connection (for signaling)
- Modern browser (Chrome, Firefox, Safari, Edge)
- No special router configuration needed
- No port forwarding required

### How It Works:

1. **Direct P2P** (best): Camera ↔️ Viewer (low latency)
2. **TURN Relay** (fallback): Camera → Relay → Viewer (if firewall blocks P2P)

The app automatically tries direct connection first, then falls back to relay if needed.

## Troubleshooting

### Camera/Microphone Not Working

- **Check permissions**: Ensure you granted camera/microphone access when prompted
- **HTTPS required**: Modern browsers require HTTPS for media access (except localhost)
- **iOS Safari**: May need user interaction before accessing camera - click a button first

### Connection Fails

- **Firewall**: Check if firewall is blocking WebRTC connections
- **Try again**: Close the app and restart both devices
- **Browser console**: Open developer tools (F12) and check for errors
- **TURN server**: The free TURN server may be down, try again later

### No Video/Audio

- **Browser support**: Ensure you're using a compatible browser
- **Codec support**: Some older devices may not support the same video codecs
- **Bandwidth**: Poor network signal can affect streaming quality
- **Autoplay**: Click "🔊 Enable Sound & Play" button to unmute

### Viewer Disconnects on Mobile

- **Expected behavior**: Mobile browsers suspend pages when backgrounded
- **Auto-reconnect**: App automatically reconnects when you return to the page
- **Keep screen on**: Don't let your phone sleep

## Technical Architecture

### WebRTC Peer-to-Peer

The app uses WebRTC for direct browser-to-browser communication:

1. **Signaling**: PeerJS provides a free cloud signaling server for initial handshake
2. **ICE/STUN**: Google's STUN server helps with NAT traversal
3. **TURN**: Free TURN relay server for restricted networks
4. **Media**: Audio/video streams directly between peers (or via relay)

### Libraries Used

- **PeerJS** (v1.5.2) - Simplifies WebRTC peer connections

### Privacy & Security

✅ **No cloud storage** - Video is never saved anywhere
✅ **Peer-to-peer** - Direct connection between your devices (or minimal relay)
✅ **Temporary session** - Connection ends when you close the page

⚠️ **Security note**: This is designed for personal use. For production deployment, consider additional encryption and authentication.

## Development Notes

### File Structure

```
bcam/
├── index.html          # Main HTML structure
├── app.js              # Application logic
├── style.css           # Styling
├── README.md          # This file
└── start.sh           # Helper script
```

### Key Features Implementation

- **6-digit codes**: Random peer IDs (100000-999999)
- **Wake Lock API**: Keeps camera screen on
- **Auto-reconnect**: Detects page visibility changes
- **Multi-camera**: Switch between front/back cameras
- **Connection detection**: Shows LAN vs Internet connection type

### Customization

You can easily customize:

- **Video quality**: Modify the `getUserMedia` constraints in `getCamera()`
- **UI colors**: Update the CSS variables
- **TURN server**: Change the ICE server configuration in `app.js`

### Example: Change Video Quality

```javascript
// In getCamera(), find this section:
video: {
    facingMode: 'environment',  // 'user' for front, 'environment' for back
    width: { ideal: 1280 },     // Change to 640 for lower quality
    height: { ideal: 720 }      // Change to 480 for lower quality
}
```

## Limitations

- **Battery drain**: Camera mode will drain battery quickly
- **Wake Lock**: Works in foreground only (true background requires native app)
- **One viewer at a time**: Current implementation supports 1-to-1 connection
- **No recording**: Video is not saved (by design)
- **Free TURN server**: May be slow or unavailable

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

---

**Made with ❤️ using WebRTC and vanilla JavaScript**
