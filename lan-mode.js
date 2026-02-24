/**
 * ========================================
 * BABY MONITOR - LAN MODE (No External Servers)
 * ========================================
 *
 * This module implements pure local WebRTC without:
 * - PeerJS signaling server
 * - STUN servers
 * - TURN servers
 *
 * Uses manual SDP/ICE candidate exchange via copy/paste
 */

// Ensure app object exists (in case this loads before app.js)
if (typeof app === 'undefined') {
    var app = {};
}

console.log('🏠 LAN Mode module loaded');

/**
 * Initialize camera in LAN mode
 * Creates WebRTC offer that viewer can paste to connect
 */
app.initLANModeCamera = async function() {
    console.log('🏠 Initializing LAN mode camera...');

    app.showStatus('cameraStatus', 'Creating local connection...', 'info');

    // Create RTCPeerConnection with NO ICE servers (local only)
    const config = {
        iceServers: []  // Empty = only local network candidates
    };

    app.peerConnection = new RTCPeerConnection(config);

    // Add local stream to connection
    app.localStream.getTracks().forEach(track => {
        app.peerConnection.addTrack(track, app.localStream);
        console.log('Added track to peer connection:', track.kind);
    });

    // Collect connection info to share with viewer
    let connectionInfo = {
        offer: null,
        candidates: []
    };

    // Collect ICE candidates
    app.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('📡 New ICE candidate:', event.candidate.type);
            connectionInfo.candidates.push(event.candidate);
        } else {
            console.log('✅ All ICE candidates gathered');
            // Display connection info for viewer
            app.displayLANConnectionInfo(connectionInfo);
        }
    };

    // Handle connection state
    app.peerConnection.onconnectionstatechange = () => {
        console.log('🔌 Connection state:', app.peerConnection.connectionState);

        if (app.peerConnection.connectionState === 'connected') {
            app.showStatus('cameraStatus', '✅ Connected to viewer (LAN)', 'success');
        } else if (app.peerConnection.connectionState === 'failed') {
            app.showStatus('cameraStatus', '❌ Connection failed', 'error');
        }
    };

    // Create offer
    const offer = await app.peerConnection.createOffer();
    await app.peerConnection.setLocalDescription(offer);
    connectionInfo.offer = offer;

    console.log('📤 Created offer, waiting for ICE candidates...');
    app.showStatus('cameraStatus', 'Generating connection code...', 'info');
};

/**
 * Display connection info for viewer to copy
 */
app.displayLANConnectionInfo = function(connectionInfo) {
    const connectionString = JSON.stringify(connectionInfo);
    const base64 = btoa(connectionString);  // Encode to base64 for easier sharing

    // Generate short code (first 8 chars of hash)
    const hash = base64.substring(0, 8).toUpperCase();

    app.elements.peerId.textContent = hash;
    app.elements.qrContainer.classList.remove('hidden');

    // Show copy-paste interface
    app.elements.qrcode.innerHTML = `
        <div style="padding: 20px; background: white; border-radius: 8px; text-align: left;">
            <p style="font-size: 14px; font-weight: 600; margin-bottom: 10px; color: #333;">
                📋 Step 1: Share this code with viewer:
            </p>
            <textarea readonly id="lanConnectionCode"
                      style="width: 100%; height: 120px; font-family: monospace; font-size: 10px;
                             padding: 10px; border: 2px solid #ddd; border-radius: 6px; resize: none;"
            >${base64}</textarea>
            <button onclick="app.copyLANCode()"
                    style="margin-top: 10px; padding: 10px 20px; background: #667eea; color: white;
                           border: none; border-radius: 6px; cursor: pointer; width: 100%;">
                📋 Copy Code
            </button>
        </div>

        <div style="padding: 20px; background: #fff3cd; border-radius: 8px; text-align: left; margin-top: 15px;">
            <p style="font-size: 14px; font-weight: 600; margin-bottom: 10px; color: #333;">
                📥 Step 2: Paste viewer's answer code:
            </p>
            <textarea id="lanAnswerInput" placeholder="Paste answer code from viewer here..."
                      style="width: 100%; height: 100px; font-family: monospace; font-size: 10px;
                             padding: 10px; border: 2px solid #ddd; border-radius: 6px; resize: vertical;"></textarea>
            <button onclick="app.completeLANConnection()"
                    style="margin-top: 10px; padding: 10px 20px; background: #28a745; color: white;
                           border: none; border-radius: 6px; cursor: pointer; width: 100%;">
                ✅ Complete Connection
            </button>
        </div>
    `;

    app.showStatus('cameraStatus', '⏳ Waiting for viewer answer...', 'warning');

    // Store for later use
    app.lanConnectionInfo = connectionInfo;
};

/**
 * Copy LAN connection code to clipboard
 */
app.copyLANCode = function() {
    const textarea = document.getElementById('lanConnectionCode');
    textarea.select();
    document.execCommand('copy');

    const button = event.target;
    const originalText = button.textContent;
    button.textContent = '✅ Copied!';
    button.style.background = '#28a745';

    setTimeout(() => {
        button.textContent = originalText;
        button.style.background = '#667eea';
    }, 2000);
};

/**
 * Complete LAN connection with viewer's answer (called from camera)
 */
app.completeLANConnection = async function() {
    const textarea = document.getElementById('lanAnswerInput');
    const answerCode = textarea.value.trim();

    if (!answerCode) {
        app.showStatus('cameraStatus', 'Please paste answer code from viewer', 'error');
        return;
    }

    console.log('📥 Processing answer from viewer');

    try {
        app.showStatus('cameraStatus', 'Completing connection...', 'info');

        const data = JSON.parse(atob(answerCode));

        // Set remote description
        await app.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        console.log('✅ Remote description set');

        // Add ICE candidates
        for (const candidate of data.candidates) {
            await app.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('📡 Added ICE candidate');
        }

        app.showStatus('cameraStatus', '✅ Connected to viewer! (LAN)', 'success');
    } catch (error) {
        console.error('❌ Error handling answer:', error);
        app.showStatus('cameraStatus', 'Failed to complete connection: ' + error.message, 'error');
    }
};

/**
 * Initialize viewer in LAN mode
 */
app.initLANModeViewer = async function() {
    console.log('🏠 Initializing LAN mode viewer...');

    app.showStatus('viewerStatus', 'Ready for LAN connection', 'success');

    // Show LAN connection interface instead of QR scanner/manual peer ID
    document.getElementById('manualEntryContainer').innerHTML = `
        <div style="margin: 20px 0; padding: 20px; background: #f8f9fa; border-radius: 12px;">
            <p style="font-size: 16px; margin-bottom: 15px;"><strong>📋 Paste Camera Connection Code:</strong></p>
            <textarea id="lanOfferCode" placeholder="Paste connection code from camera here..."
                      style="width: 100%; height: 120px; font-family: monospace; font-size: 10px;
                             padding: 10px; border: 2px solid #ddd; border-radius: 6px; resize: vertical;"></textarea>
            <button onclick="app.connectLANMode()" style="margin-top: 15px; width: 100%;">
                🔗 Connect to Camera
            </button>
            <p style="font-size: 11px; color: #666; margin-top: 10px;">
                Copy the connection code from the camera device and paste it above
            </p>
        </div>

        <div id="lanAnswerContainer" class="hidden" style="margin: 20px 0; padding: 20px; background: #e8f5e9; border-radius: 12px;">
            <p style="font-size: 14px; font-weight: 600; margin-bottom: 10px; color: #333;">
                📤 Send this code back to camera:
            </p>
            <textarea readonly id="lanAnswerCode"
                      style="width: 100%; height: 100px; font-family: monospace; font-size: 10px;
                             padding: 10px; border: 2px solid #4caf50; border-radius: 6px; resize: none;"></textarea>
            <button onclick="app.copyAnswerCode()"
                    style="margin-top: 10px; padding: 10px 20px; background: #4caf50; color: white;
                           border: none; border-radius: 6px; cursor: pointer; width: 100%;">
                📋 Copy Answer Code
            </button>
        </div>
    `;

    // Hide scanner container
    document.getElementById('scannerContainer').classList.add('hidden');
};

/**
 * Connect to camera using pasted connection code
 */
app.connectLANMode = async function() {
    const textarea = document.getElementById('lanOfferCode');
    const offerCode = textarea.value.trim();

    if (!offerCode) {
        app.showStatus('viewerStatus', 'Please paste connection code from camera', 'error');
        return;
    }

    try {
        app.showStatus('viewerStatus', 'Connecting...', 'info');

        // Decode connection info
        const connectionInfo = JSON.parse(atob(offerCode));

        // Create peer connection (no ICE servers = LAN only)
        app.peerConnection = new RTCPeerConnection({ iceServers: [] });

        // Collect answer info
        let answerInfo = {
            answer: null,
            candidates: []
        };

        // Collect ICE candidates
        app.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('📡 New ICE candidate:', event.candidate.type);
                answerInfo.candidates.push(event.candidate);
            } else {
                console.log('✅ All ICE candidates gathered');
                app.displayLANAnswer(answerInfo);
            }
        };

        // Handle incoming stream
        app.peerConnection.ontrack = (event) => {
            console.log('📹 Received track:', event.track.kind);

            if (!app.elements.remoteVideo.srcObject) {
                app.elements.remoteVideo.srcObject = event.streams[0];
                app.elements.remoteVideoContainer.classList.remove('hidden');
                app.showStatus('viewerStatus', '✅ Connected! Receiving video', 'success');
            }
        };

        // Handle connection state
        app.peerConnection.onconnectionstatechange = () => {
            console.log('🔌 Connection state:', app.peerConnection.connectionState);
        };

        // Set remote offer
        await app.peerConnection.setRemoteDescription(new RTCSessionDescription(connectionInfo.offer));
        console.log('✅ Remote offer set');

        // Add ICE candidates from offer
        for (const candidate of connectionInfo.candidates) {
            await app.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('📡 Added ICE candidate from camera');
        }

        // Create answer
        const answer = await app.peerConnection.createAnswer();
        await app.peerConnection.setLocalDescription(answer);
        answerInfo.answer = answer;

        console.log('📤 Created answer, waiting for ICE candidates...');
        app.showStatus('viewerStatus', 'Generating response code...', 'info');

    } catch (error) {
        console.error('❌ Connection error:', error);
        app.showStatus('viewerStatus', 'Connection failed: ' + error.message, 'error');
    }
};

/**
 * Display answer code for camera
 */
app.displayLANAnswer = function(answerInfo) {
    const answerString = JSON.stringify(answerInfo);
    const base64 = btoa(answerString);

    document.getElementById('lanAnswerCode').value = base64;
    document.getElementById('lanAnswerContainer').classList.remove('hidden');

    app.showStatus('viewerStatus', '📋 Copy answer code and paste on camera device', 'warning');
};

/**
 * Copy answer code to clipboard
 */
app.copyAnswerCode = function() {
    const textarea = document.getElementById('lanAnswerCode');
    textarea.select();
    document.execCommand('copy');

    const button = event.target;
    button.textContent = '✅ Copied!';

    setTimeout(() => {
        button.textContent = '📋 Copy Answer Code';
    }, 2000);
};
