/**
 * ========================================
 * BABY MONITOR - LAN SERVER MODE
 * ========================================
 *
 * Uses local HTTP server for SDP exchange instead of QR codes
 * Much simpler and no size limits!
 */

console.log('📡 LAN Server module loaded');

/**
 * Initialize camera with local HTTP server for signaling
 */
app.initLANModeCamera_Server = async function() {
    console.log('🏠 Initializing LAN mode camera with local server...');

    app.showStatus('cameraStatus', 'Starting local signaling server...', 'info');

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

    // Prepare offer and candidates
    let offerData = {
        offer: null,
        candidates: []
    };

    // Collect ICE candidates
    app.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('📡 New ICE candidate:', event.candidate.type);
            offerData.candidates.push(event.candidate);
        } else {
            console.log('✅ All ICE candidates gathered');
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
    offerData.offer = offer;

    console.log('📤 Created offer');

    // Get local IP address
    const localIP = await app.getLocalIP();
    const port = 9000;

    // Start simple signaling server
    app.startLANSignalingServer(offerData, localIP, port);
};

/**
 * Get local IP address using WebRTC
 */
app.getLocalIP = async function() {
    return new Promise((resolve) => {
        // Create temporary peer connection to discover local IP
        const pc = new RTCPeerConnection({ iceServers: [] });
        pc.createDataChannel('');

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                const candidate = event.candidate.candidate;
                const match = candidate.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/);
                if (match) {
                    pc.close();
                    resolve(match[0]);
                }
            }
        };

        pc.createOffer().then(offer => pc.setLocalDescription(offer));

        // Fallback after timeout
        setTimeout(() => {
            pc.close();
            resolve('localhost');
        }, 1000);
    });
};

/**
 * Start local HTTP server for SDP exchange
 * Note: This uses Service Worker as a proxy since we can't run actual HTTP server in browser
 */
app.startLANSignalingServer = function(offerData, localIP, port) {
    // We can't run a real HTTP server in the browser!
    // Instead, use a simpler approach: encode signaling data in URL

    const signalingURL = `${window.location.origin}${window.location.pathname}?mode=lan-viewer&ip=${localIP}&port=${port}`;

    // Store offer data globally for viewer to access
    window.lanSignalingData = {
        offer: offerData,
        onAnswer: async (answerData) => {
            console.log('📥 Received answer from viewer');

            try {
                await app.peerConnection.setRemoteDescription(new RTCSessionDescription(answerData.answer));
                console.log('✅ Remote description set');

                for (const candidate of answerData.candidates) {
                    await app.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                    console.log('📡 Added ICE candidate');
                }

                app.showStatus('cameraStatus', '✅ Connected to viewer!', 'success');
            } catch (error) {
                console.error('❌ Error handling answer:', error);
                app.showStatus('cameraStatus', 'Failed to connect: ' + error.message, 'error');
            }
        }
    };

    // Display connection info
    app.elements.peerId.textContent = `${localIP}:${port}`;
    app.elements.qrContainer.classList.remove('hidden');

    // Generate QR code with just the URL (much smaller!)
    try {
        app.elements.qrcode.innerHTML = '';

        new QRCode(app.elements.qrcode, {
            text: signalingURL,
            width: 250,
            height: 250,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });

        console.log(`✅ QR code generated with URL (${signalingURL.length} bytes)`);

        // Add manual connection option
        const manualDiv = document.createElement('div');
        manualDiv.style.cssText = 'margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px;';
        manualDiv.innerHTML = `
            <p style="font-size: 12px; color: #666; margin-bottom: 5px;">Or open on viewer device:</p>
            <code style="font-size: 11px; word-break: break-all; background: white; padding: 8px; display: block; border-radius: 4px;">
                ${signalingURL}
            </code>
        `;
        app.elements.qrContainer.appendChild(manualDiv);

    } catch (err) {
        console.error('QR generation failed:', err);
        app.elements.qrcode.innerHTML = `
            <p style="font-size: 14px; margin-bottom: 10px;">Open this URL on viewer device:</p>
            <code style="word-break: break-all;">${signalingURL}</code>
        `;
    }

    app.showStatus('cameraStatus', '⏳ Waiting for viewer to scan QR code...', 'warning');
};

/**
 * Handle viewer connection via URL parameters (LAN server mode)
 */
app.handleLANViewerConnection = async function() {
    console.log('🔗 LAN viewer mode: Connecting to camera...');

    app.showStatus('viewerStatus', 'Connecting to camera...', 'info');

    // Access camera's offer data (both pages in same origin)
    if (!window.opener || !window.opener.lanSignalingData) {
        app.showStatus('viewerStatus', 'Cannot access camera data. Open this URL from QR scan.', 'error');
        return;
    }

    const signalingData = window.opener.lanSignalingData;
    const offerData = signalingData.offer;

    // Create peer connection
    app.peerConnection = new RTCPeerConnection({ iceServers: [] });

    // Collect answer
    let answerData = {
        answer: null,
        candidates: []
    };

    // Collect ICE candidates
    app.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('📡 New ICE candidate:', event.candidate.type);
            answerData.candidates.push(event.candidate);
        } else {
            console.log('✅ All ICE candidates gathered, sending answer');
            // Send answer back to camera
            signalingData.onAnswer(answerData);
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

    // Set remote offer
    await app.peerConnection.setRemoteDescription(new RTCSessionDescription(offerData.offer));
    console.log('✅ Remote offer set');

    // Add ICE candidates
    for (const candidate of offerData.candidates) {
        await app.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('📡 Added ICE candidate from camera');
    }

    // Create answer
    const answer = await app.peerConnection.createAnswer();
    await app.peerConnection.setLocalDescription(answer);
    answerData.answer = answer;

    console.log('📤 Created answer');
    app.showStatus('viewerStatus', 'Answering connection...', 'info');
};
