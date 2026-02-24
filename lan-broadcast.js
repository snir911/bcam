/**
 * ========================================
 * BABY MONITOR - Browser-Based Signaling
 * ========================================
 *
 * Uses BroadcastChannel + localStorage for signaling
 * NO external server needed!
 *
 * Works when:
 * - Same device (two tabs/windows)
 * - Different devices accessing same local server
 */

console.log('📡 Browser-based signaling module loaded');

/**
 * Initialize camera with browser-based signaling
 */
app.initLANModeCamera_Browser = async function() {
    console.log('🏠 LAN Mode: Using browser-based signaling');

    app.showStatus('cameraStatus', 'Setting up local signaling...', 'info');

    // Generate room ID
    const roomId = Math.floor(1000 + Math.random() * 9000).toString();

    console.log('📋 Room ID:', roomId);

    // Create peer connection
    app.peerConnection = new RTCPeerConnection({ iceServers: [] });

    // Add media tracks
    app.localStream.getTracks().forEach(track => {
        app.peerConnection.addTrack(track, app.localStream);
        console.log('Added track:', track.kind);
    });

    // Collect offer data
    let offerData = {
        offer: null,
        candidates: []
    };

    app.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            offerData.candidates.push(event.candidate);
        } else {
            console.log('✅ ICE gathering complete');
            // Store offer in localStorage
            app.storeOffer(roomId, offerData);
        }
    };

    app.peerConnection.onconnectionstatechange = () => {
        const state = app.peerConnection.connectionState;
        console.log('🔌 Connection state:', state);

        if (state === 'connected') {
            app.showStatus('cameraStatus', '✅ Connected to viewer!', 'success');
        } else if (state === 'failed') {
            app.showStatus('cameraStatus', '❌ Connection failed', 'error');
        }
    };

    // Create offer
    const offer = await app.peerConnection.createOffer();
    await app.peerConnection.setLocalDescription(offer);
    offerData.offer = offer;

    console.log('📤 Created offer');

    // Set up BroadcastChannel for real-time communication
    if (typeof BroadcastChannel !== 'undefined') {
        app.signalingBC = new BroadcastChannel('babymonitor_signaling');

        app.signalingBC.onmessage = async (event) => {
            const message = event.data;
            console.log('📥 Received broadcast:', message.type);

            if (message.type === 'answer' && message.roomId === roomId) {
                console.log('📥 Received answer for room', roomId);
                await app.handleAnswer(message.data);
            } else if (message.type === 'request_offer' && message.roomId === roomId) {
                console.log('📤 Sending offer via broadcast');
                app.signalingBC.postMessage({
                    type: 'offer',
                    roomId: roomId,
                    data: offerData
                });
            }
        };

        console.log('✅ BroadcastChannel created');
    }

    // Listen for localStorage changes (fallback for cross-tab on older browsers)
    window.addEventListener('storage', (event) => {
        if (event.key === `babymonitor_answer_${roomId}`) {
            console.log('📥 Received answer via localStorage');
            const answerData = JSON.parse(event.newValue);
            app.handleAnswer(answerData);
        }
    });

    // Display connection info
    app.showStatus('cameraStatus', '⏳ Waiting for viewer...', 'warning');

    app.elements.peerId.textContent = roomId;
    app.elements.qrContainer.classList.remove('hidden');

    // Generate QR with room URL
    const viewerURL = `${window.location.origin}${window.location.pathname}?mode=lan-viewer&room=${roomId}`;

    try {
        app.elements.qrcode.innerHTML = '';

        new QRCode(app.elements.qrcode, {
            text: viewerURL,
            width: 250,
            height: 250,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });

        console.log(`✅ QR code generated: ${viewerURL}`);

        // Add manual URL option
        const urlDiv = document.createElement('div');
        urlDiv.style.cssText = 'margin-top: 15px; padding: 12px; background: #f8f9fa; border-radius: 8px;';
        urlDiv.innerHTML = `
            <p style="font-size: 11px; color: #666; margin-bottom: 5px;">Or open this URL:</p>
            <code style="font-size: 10px; word-break: break-all; background: white; padding: 6px; display: block; border-radius: 4px;">
                ${viewerURL}
            </code>
        `;
        app.elements.qrContainer.appendChild(urlDiv);

    } catch (err) {
        console.error('QR generation failed:', err);
        app.elements.qrcode.innerHTML = `
            <p style="font-size: 12px; margin-bottom: 8px;">Open this URL on viewer device:</p>
            <code style="word-break: break-all; font-size: 11px;">${viewerURL}</code>
        `;
    }
};

/**
 * Store offer in localStorage
 */
app.storeOffer = function(roomId, offerData) {
    const key = `babymonitor_offer_${roomId}`;

    // Store for 5 minutes
    const data = {
        offer: offerData,
        timestamp: Date.now(),
        expires: Date.now() + (5 * 60 * 1000)
    };

    try {
        localStorage.setItem(key, JSON.stringify(data));
        console.log(`✅ Offer stored in localStorage: ${key}`);
    } catch (err) {
        console.error('Failed to store offer:', err);
    }
};

/**
 * Handle answer from viewer
 */
app.handleAnswer = async function(answerData) {
    try {
        console.log('📥 Processing answer...');

        await app.peerConnection.setRemoteDescription(
            new RTCSessionDescription(answerData.answer)
        );

        for (const candidate of answerData.candidates) {
            await app.peerConnection.addIceCandidate(
                new RTCIceCandidate(candidate)
            );
        }

        console.log('✅ Answer processed successfully');

    } catch (error) {
        console.error('❌ Error processing answer:', error);
        app.showStatus('cameraStatus', 'Connection error: ' + error.message, 'error');
    }
};

/**
 * Initialize viewer with browser-based signaling
 */
app.initLANModeViewer_Browser = async function(roomId) {
    console.log('🏠 LAN Viewer: Connecting to room', roomId);

    app.showStatus('viewerStatus', 'Connecting to camera...', 'info');

    // Try to get offer from localStorage first
    let offerData = null;
    const key = `babymonitor_offer_${roomId}`;

    try {
        const stored = localStorage.getItem(key);
        if (stored) {
            const data = JSON.parse(stored);

            // Check if expired
            if (data.expires > Date.now()) {
                offerData = data.offer;
                console.log('✅ Retrieved offer from localStorage');
            } else {
                console.log('⚠️ Offer expired');
                localStorage.removeItem(key);
            }
        }
    } catch (err) {
        console.error('Error reading localStorage:', err);
    }

    // Set up BroadcastChannel
    if (typeof BroadcastChannel !== 'undefined') {
        app.signalingBC = new BroadcastChannel('babymonitor_signaling');

        app.signalingBC.onmessage = async (event) => {
            const message = event.data;

            if (message.type === 'offer' && message.roomId === roomId) {
                console.log('📥 Received offer via broadcast');
                offerData = message.data;
                await app.processOfferAndConnect(roomId, offerData);
            }
        };

        // Request offer via broadcast if not in localStorage
        if (!offerData) {
            console.log('📡 Requesting offer via broadcast...');
            app.signalingBC.postMessage({
                type: 'request_offer',
                roomId: roomId
            });

            // Wait a bit for response
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    // If we have offer data, proceed
    if (offerData) {
        await app.processOfferAndConnect(roomId, offerData);
    } else {
        app.showStatus('viewerStatus', 'Waiting for camera... (open camera first)', 'warning');

        // Keep polling localStorage for offer
        app.offerPollInterval = setInterval(() => {
            const stored = localStorage.getItem(key);
            if (stored) {
                const data = JSON.parse(stored);
                if (data.expires > Date.now()) {
                    clearInterval(app.offerPollInterval);
                    offerData = data.offer;
                    app.processOfferAndConnect(roomId, offerData);
                }
            }
        }, 1000);
    }
};

/**
 * Process offer and create connection
 */
app.processOfferAndConnect = async function(roomId, offerData) {
    try {
        console.log('📥 Processing offer and creating connection...');

        app.showStatus('viewerStatus', 'Creating connection...', 'info');

        // Create peer connection
        app.peerConnection = new RTCPeerConnection({ iceServers: [] });

        // Handle incoming media
        app.peerConnection.ontrack = (event) => {
            console.log('📹 Received track:', event.track.kind);

            if (!app.elements.remoteVideo.srcObject) {
                app.elements.remoteVideo.srcObject = event.streams[0];
                app.elements.remoteVideoContainer.classList.remove('hidden');
                app.showStatus('viewerStatus', '✅ Connected! Receiving video', 'success');

                // Hide input containers
                const manualContainer = document.getElementById('manualEntryContainer');
                if (manualContainer) {
                    manualContainer.classList.add('hidden');
                }
            }
        };

        app.peerConnection.onconnectionstatechange = () => {
            console.log('🔌 Connection state:', app.peerConnection.connectionState);
        };

        // Set remote offer
        await app.peerConnection.setRemoteDescription(
            new RTCSessionDescription(offerData.offer)
        );

        // Add ICE candidates
        for (const candidate of offerData.candidates) {
            await app.peerConnection.addIceCandidate(
                new RTCIceCandidate(candidate)
            );
        }

        // Collect answer
        let answerData = {
            answer: null,
            candidates: []
        };

        app.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                answerData.candidates.push(event.candidate);
            } else {
                console.log('✅ ICE gathering complete, sending answer');

                // Send answer via BroadcastChannel
                if (app.signalingBC) {
                    app.signalingBC.postMessage({
                        type: 'answer',
                        roomId: roomId,
                        data: answerData
                    });
                    console.log('📤 Answer sent via broadcast');
                }

                // Also store in localStorage (fallback)
                try {
                    localStorage.setItem(
                        `babymonitor_answer_${roomId}`,
                        JSON.stringify(answerData)
                    );
                    console.log('📤 Answer stored in localStorage');
                } catch (err) {
                    console.error('Failed to store answer:', err);
                }
            }
        };

        // Create answer
        const answer = await app.peerConnection.createAnswer();
        await app.peerConnection.setLocalDescription(answer);
        answerData.answer = answer;

        console.log('📤 Created answer');
        app.showStatus('viewerStatus', 'Establishing connection...', 'info');

    } catch (error) {
        console.error('❌ Connection error:', error);
        app.showStatus('viewerStatus', 'Failed to connect: ' + error.message, 'error');
    }
};

/**
 * Clean up old signaling data from localStorage
 */
app.cleanupSignalingData = function() {
    const now = Date.now();
    const keys = Object.keys(localStorage);

    keys.forEach(key => {
        if (key.startsWith('babymonitor_')) {
            try {
                const data = JSON.parse(localStorage.getItem(key));
                if (data.expires && data.expires < now) {
                    localStorage.removeItem(key);
                    console.log('🗑️ Cleaned up expired:', key);
                }
            } catch (err) {
                // Not JSON or corrupted, remove it
                localStorage.removeItem(key);
            }
        }
    });
};

// Clean up on load
app.cleanupSignalingData();
