/**
 * ========================================
 * BABY MONITOR - WebRTC Application
 * ========================================
 *
 * SECURITY & BROWSER REQUIREMENTS:
 *
 * ⚠️ HTTPS REQUIRED:
 * - Modern browsers require HTTPS for camera/microphone access
 * - For local testing, use 'localhost' (browsers trust localhost over HTTP)
 * - Or use a self-signed certificate for HTTPS
 *
 * ⚠️ MOBILE CONSIDERATIONS:
 * - iOS Safari requires user interaction before accessing camera
 * - Some browsers may block camera access in cross-origin iframes
 * - Test on actual devices, not just emulators
 *
 * ⚠️ NETWORK REQUIREMENTS:
 * - Both devices must be on the same LAN for optimal performance
 * - ICE/STUN servers help with NAT traversal
 * - No media data goes through external servers (peer-to-peer only)
 */

// ========================================
// GLOBAL STATE
// ========================================

const app = {
    peer: null,              // PeerJS peer instance
    localStream: null,       // Local media stream (camera mode)
    connection: null,        // Data connection for signaling
    call: null,              // Media call connection
    scannerStream: null,     // QR scanner video stream
    scannerInterval: null,   // QR scanner polling interval

    // DOM element references
    elements: {
        modeSelection: document.getElementById('modeSelection'),
        cameraMode: document.getElementById('cameraMode'),
        viewerMode: document.getElementById('viewerMode'),
        localVideo: document.getElementById('localVideo'),
        remoteVideo: document.getElementById('remoteVideo'),
        qrScanner: document.getElementById('qrScanner'),
        qrContainer: document.getElementById('qrContainer'),
        qrcode: document.getElementById('qrcode'),
        peerId: document.getElementById('peerId'),
        cameraStatus: document.getElementById('cameraStatus'),
        viewerStatus: document.getElementById('viewerStatus'),
        scannerContainer: document.getElementById('scannerContainer'),
        remoteVideoContainer: document.getElementById('remoteVideoContainer')
    }
};

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Show a status message to the user
 * @param {string} elementId - ID of the status element
 * @param {string} message - Message to display
 * @param {string} type - Type of message (info, success, error, warning)
 */
app.showStatus = function(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.className = `status ${type}`;
};

/**
 * Reset the application to initial state
 */
app.resetApp = function() {
    console.log('Resetting application...');

    // Clean up peer connection
    if (app.peer) {
        app.peer.destroy();
        app.peer = null;
    }

    // Stop local media stream
    if (app.localStream) {
        app.localStream.getTracks().forEach(track => track.stop());
        app.localStream = null;
    }

    // Stop QR scanner
    app.stopQRScanner();

    // Close call
    if (app.call) {
        app.call.close();
        app.call = null;
    }

    // Reset UI
    app.elements.modeSelection.classList.remove('hidden');
    app.elements.cameraMode.classList.add('hidden');
    app.elements.viewerMode.classList.add('hidden');
    app.elements.qrContainer.classList.add('hidden');
    app.elements.remoteVideoContainer.classList.add('hidden');
    app.elements.scannerContainer.classList.add('hidden');  // Hide scanner
    app.elements.qrcode.innerHTML = '';

    // Reset viewer mode to manual entry state
    const manualContainer = document.getElementById('manualEntryContainer');
    if (manualContainer) {
        manualContainer.classList.remove('hidden');  // Show manual entry
    }

    // Clear manual input
    const manualInput = document.getElementById('manualPeerId');
    if (manualInput) {
        manualInput.value = '';
    }
};

// ========================================
// CAMERA MODE FUNCTIONS
// ========================================

/**
 * Initialize and start camera mode
 * This mode captures video/audio and waits for viewer to connect
 */
app.startCameraMode = async function() {
    console.log('Starting camera mode...');

    // Hide mode selection and show camera mode
    app.elements.modeSelection.classList.add('hidden');
    app.elements.cameraMode.classList.remove('hidden');

    try {
        // Check browser compatibility first
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('getUserMedia is not supported in this browser or context. Please use HTTPS or localhost.');
        }

        // Step 1: Request camera and microphone access
        app.showStatus('cameraStatus', 'Requesting camera and microphone access...', 'info');

        app.localStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'user',  // Front camera (can change to 'environment' for back)
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        // Step 2: Display local video feed
        app.elements.localVideo.srcObject = app.localStream;

        // Log stream info for debugging
        console.log('✅ Local stream created successfully');
        console.log('Stream ID:', app.localStream.id);
        console.log('Stream active:', app.localStream.active);

        const videoTracks = app.localStream.getVideoTracks();
        const audioTracks = app.localStream.getAudioTracks();

        console.log('Video tracks:', videoTracks.length, videoTracks);
        console.log('Audio tracks:', audioTracks.length, audioTracks);

        // Check if we actually have video
        if (videoTracks.length === 0) {
            throw new Error('No video track available. Camera might be in use by another app.');
        }

        // Ensure tracks are enabled
        videoTracks.forEach(track => {
            if (!track.enabled) {
                console.warn('Video track was disabled, enabling...');
                track.enabled = true;
            }
        });

        audioTracks.forEach(track => {
            if (!track.enabled) {
                console.warn('Audio track was disabled, enabling...');
                track.enabled = true;
            }
        });

        // Monitor stream health
        app.localStream.getTracks().forEach(track => {
            track.onended = () => {
                console.error('❌ Track ended unexpectedly:', track.kind);
                app.showStatus('cameraStatus', `${track.kind} track ended! Please restart.`, 'error');
            };
        });

        app.showStatus('cameraStatus', 'Camera started. Setting up peer connection...', 'info');

        // Step 3: Initialize PeerJS with custom short ID
        // PeerJS provides a free cloud signaling server
        // The actual video/audio data flows peer-to-peer (WebRTC), not through PeerJS servers

        // Check if Peer library is loaded
        if (typeof Peer === 'undefined') {
            throw new Error('PeerJS library not loaded. Check your internet connection.');
        }

        console.log('Initializing PeerJS...');

        // Generate a random 4-digit number for peer ID
        const shortId = Math.floor(1000 + Math.random() * 9000).toString(); // 1000-9999

        console.log('Attempting to create peer with ID:', shortId);

        app.peer = new Peer(shortId, {
            config: {
                // STUN servers help with NAT traversal (finding your public IP)
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ],
                sdpSemantics: 'unified-plan'  // Use modern WebRTC semantics
            }
        });

        console.log('PeerJS initialized, waiting for connection...');

        // Step 4: When peer is ready, generate QR code with direct viewer URL
        app.peer.on('open', (id) => {
            console.log('Peer connection opened! Peer ID:', id);
            app.showStatus('cameraStatus', 'Waiting for viewer to connect...', 'warning');

            // Display peer ID
            app.elements.peerId.textContent = id;

            // Show QR container first (with peer ID text)
            app.elements.qrContainer.classList.remove('hidden');

            // Create direct viewer URL with peer ID
            // When scanned, this will automatically open viewer mode and connect
            const baseUrl = window.location.origin + window.location.pathname;
            const viewerUrl = `${baseUrl}?mode=viewer&peer=${id}`;

            console.log('Generating QR code for viewer URL:', viewerUrl);

            // Check if QRCode library is loaded
            if (typeof QRCode === 'undefined') {
                console.error('QRCode library not loaded!');
                app.showStatus('cameraStatus', 'QR library failed to load. Share URL manually: ' + viewerUrl, 'warning');
                app.elements.qrcode.innerHTML = '<div style="padding: 20px; background: white; border-radius: 8px;"><strong style="font-size: 12px; font-family: monospace; word-break: break-all;">' + viewerUrl + '</strong></div>';
                return;
            }

            try {
                // Clear the loading message
                app.elements.qrcode.innerHTML = '';

                // Create QR code containing the full viewer URL
                // Scanning this will open the page and auto-connect!
                new QRCode(app.elements.qrcode, {
                    text: viewerUrl,
                    width: 250,
                    height: 250,
                    colorDark: '#000000',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.M  // Medium correction for URLs
                });

                console.log('✅ QR code generated successfully with auto-connect URL');
            } catch (err) {
                console.error('Exception generating QR code:', err);
                app.showStatus('cameraStatus', 'QR generation error. Use URL: ' + viewerUrl, 'warning');
                // Fallback to displaying URL as text
                app.elements.qrcode.innerHTML = '<div style="padding: 20px; background: white; border-radius: 8px;"><strong style="font-size: 12px; font-family: monospace; word-break: break-all;">' + viewerUrl + '</strong></div>';
            }
        });

        // Step 5: Handle incoming calls from viewer
        app.peer.on('call', (incomingCall) => {
            console.log('📞 Incoming call from viewer');

            // Verify we still have the stream
            if (!app.localStream) {
                console.error('❌ Local stream lost!');
                app.showStatus('cameraStatus', 'Camera stream lost. Please restart.', 'error');
                return;
            }

            // Detailed logging of what we're sending
            console.log('Camera stream state:', {
                id: app.localStream.id,
                active: app.localStream.active,
                tracks: app.localStream.getTracks().length
            });

            const videoTracks = app.localStream.getVideoTracks();
            const audioTracks = app.localStream.getAudioTracks();

            console.log('Video tracks to send:', videoTracks.length, videoTracks.map(t => ({
                id: t.id,
                kind: t.kind,
                enabled: t.enabled,
                readyState: t.readyState,
                muted: t.muted,
                label: t.label
            })));

            console.log('Audio tracks to send:', audioTracks.length, audioTracks.map(t => ({
                id: t.id,
                kind: t.kind,
                enabled: t.enabled,
                readyState: t.readyState,
                muted: t.muted
            })));

            // Check if video track exists and is active
            if (videoTracks.length === 0) {
                console.error('❌ No video tracks in local stream!');
                app.showStatus('cameraStatus', 'Camera has no video! Please restart.', 'error');
                return;
            }

            if (videoTracks[0].readyState !== 'live') {
                console.error('❌ Video track is not live! State:', videoTracks[0].readyState);
                app.showStatus('cameraStatus', 'Camera stopped! Please restart.', 'error');
                return;
            }

            if (!videoTracks[0].enabled) {
                console.warn('⚠️ Video track was disabled, enabling...');
                videoTracks[0].enabled = true;
            }

            // Clone the stream to avoid track sharing issues
            const streamToSend = app.localStream.clone();
            console.log('Cloned stream for sending:', streamToSend.getTracks());

            // Answer the call with the cloned stream
            console.log('✅ Answering call with cloned stream');

            try {
                incomingCall.answer(streamToSend);
                console.log('✅ Answer sent successfully');
            } catch (err) {
                console.error('❌ Error in answer():', err);
                app.showStatus('cameraStatus', 'Failed to answer call: ' + err.message, 'error');
                return;
            }

            app.call = incomingCall;

            // Update status
            app.showStatus('cameraStatus', 'Connected to viewer! Streaming...', 'success');

            // Handle call close
            incomingCall.on('close', () => {
                console.log('📞 Call closed by viewer');
                app.showStatus('cameraStatus', 'Viewer disconnected. Waiting for new connection...', 'warning');
            });

            // Log when viewer sends stream back (if any)
            incomingCall.on('stream', (stream) => {
                console.log('📥 Viewer is sending stream:', stream.getTracks());
            });

            // Monitor if our stream stays active
            setTimeout(() => {
                if (app.localStream && app.localStream.active) {
                    console.log('✅ Camera stream still active after 2 seconds');
                } else {
                    console.error('❌ Camera stream became inactive!');
                }
            }, 2000);
        });

        // Handle peer errors
        app.peer.on('error', (error) => {
            console.error('Peer error:', error);

            // If ID is already taken, try a new one
            if (error.type === 'unavailable-id') {
                console.log('ID already taken, generating new one...');
                app.showStatus('cameraStatus', 'ID taken, retrying...', 'warning');

                // Destroy old peer and try again with new ID
                if (app.peer) {
                    app.peer.destroy();
                }

                // Retry after a short delay
                setTimeout(() => {
                    app.startCameraMode();
                }, 500);
            } else {
                app.showStatus('cameraStatus', `Connection error: ${error.type}`, 'error');
            }
        });

        // Handle peer disconnection
        app.peer.on('disconnected', () => {
            console.log('Peer disconnected');
            app.showStatus('cameraStatus', 'Disconnected from signaling server. Reconnecting...', 'warning');
            // PeerJS automatically tries to reconnect
        });

    } catch (error) {
        console.error('Camera mode error:', error);

        if (error.name === 'NotAllowedError') {
            app.showStatus('cameraStatus', 'Camera/microphone access denied. Please grant permissions and try again.', 'error');
        } else if (error.name === 'NotFoundError') {
            app.showStatus('cameraStatus', 'No camera/microphone found on this device.', 'error');
        } else {
            app.showStatus('cameraStatus', `Error: ${error.message}`, 'error');
        }
    }
};

// ========================================
// VIEWER MODE FUNCTIONS
// ========================================

/**
 * Initialize and start viewer mode
 * This mode scans QR code and connects to camera
 * @param {boolean} autoConnect - If true, skip QR scanner
 * @returns {Promise} Resolves when peer is ready
 */
app.startViewerMode = async function(autoConnect = false) {
    console.log('Starting viewer mode...', autoConnect ? '(auto-connect)' : '');

    // Hide mode selection and show viewer mode
    app.elements.modeSelection.classList.add('hidden');
    app.elements.viewerMode.classList.remove('hidden');

    return new Promise((resolve, reject) => {
        try {
            // Step 1: Initialize PeerJS for viewer
            app.showStatus('viewerStatus', 'Initializing connection...', 'info');

        // Generate a random 4-digit ID for viewer too (not critical, but keeps it consistent)
        const viewerShortId = Math.floor(1000 + Math.random() * 9000).toString();

        app.peer = new Peer(viewerShortId, {
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ],
                sdpSemantics: 'unified-plan'  // Use modern WebRTC semantics
            }
        });

        app.peer.on('open', (id) => {
            console.log('✅ Viewer peer connected! ID:', id);

            // If auto-connecting (from URL), skip everything and just connect
            if (autoConnect) {
                app.showStatus('viewerStatus', 'Connecting...', 'info');
                document.getElementById('manualEntryContainer').classList.add('hidden');
                resolve();  // Signal that peer is ready
            } else {
                app.showStatus('viewerStatus', 'Ready to connect', 'success');
                // Don't auto-start QR scanner - let user choose
                resolve();
            }
        });

        app.peer.on('error', (error) => {
            console.error('❌ Peer error:', error);
            app.showStatus('viewerStatus', `Peer connection error: ${error.type}`, 'error');
            reject(error);
        });

        app.peer.on('disconnected', () => {
            console.warn('⚠️ Viewer peer disconnected from server');
            app.showStatus('viewerStatus', 'Disconnected, reconnecting...', 'warning');
        });

        } catch (error) {
            console.error('Viewer mode error:', error);
            app.showStatus('viewerStatus', `Error: ${error.message}`, 'error');
            reject(error);
        }
    });
};

/**
 * Start the QR code scanner
 * Uses the device camera to scan QR codes
 */
app.startQRScanner = async function() {
    try {
        console.log('Starting QR scanner...');

        // Check browser compatibility first
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('getUserMedia is not supported in this browser or context. Please use HTTPS or localhost.');
        }

        app.showStatus('viewerStatus', 'Requesting camera access...', 'info');

        // Request camera access for QR scanning
        try {
            app.scannerStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment'  // Back camera preferred for scanning
                }
            });
        } catch (err) {
            console.error('Camera access error:', err);
            // Try without facingMode constraint (some devices don't support it)
            app.scannerStream = await navigator.mediaDevices.getUserMedia({
                video: true
            });
        }

        console.log('Camera access granted, starting video...');
        app.elements.qrScanner.srcObject = app.scannerStream;

        // Wait for video to be ready
        app.elements.qrScanner.onloadedmetadata = () => {
            console.log('QR scanner video loaded');
            app.elements.qrScanner.play().then(() => {
                console.log('QR scanner video playing');
                app.showStatus('viewerStatus', 'Point camera at QR code', 'success');
            }).catch(err => {
                console.error('Video play error:', err);
            });
        };

        app.showStatus('viewerStatus', 'Starting camera...', 'info');

        // Create a canvas for processing video frames
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        // Wait a bit for video to start, then begin scanning
        setTimeout(() => {
            console.log('Starting QR code detection loop...');

            // Poll video frames to detect QR codes
            // This runs continuously while scanner is active
            app.scannerInterval = setInterval(() => {
                if (app.elements.qrScanner.readyState === app.elements.qrScanner.HAVE_ENOUGH_DATA) {
                    // Set canvas size to match video
                    canvas.width = app.elements.qrScanner.videoWidth;
                    canvas.height = app.elements.qrScanner.videoHeight;

                    if (canvas.width > 0 && canvas.height > 0) {
                        // Draw current video frame to canvas
                        context.drawImage(app.elements.qrScanner, 0, 0, canvas.width, canvas.height);

                        // Get image data and attempt to decode QR code
                        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                        const code = jsQR(imageData.data, imageData.width, imageData.height);

                        // If QR code detected, process it
                        if (code) {
                            console.log('✅ QR code detected:', code.data);

                            // Check if it's a URL or just a peer ID
                            if (code.data.includes('mode=viewer&peer=')) {
                                // Extract peer ID from URL
                                const url = new URL(code.data);
                                const peerId = url.searchParams.get('peer');
                                console.log('Extracted peer ID from URL:', peerId);
                                app.connectToPeer(peerId);
                            } else {
                                // Assume it's just a peer ID
                                app.connectToPeer(code.data);
                            }
                        }
                    }
                }
            }, 100);  // Check every 100ms
        }, 500);  // Wait 500ms for video to start

    } catch (error) {
        console.error('QR scanner error:', error);

        if (error.name === 'NotAllowedError') {
            app.showStatus('viewerStatus', 'Camera access denied. Please grant permissions and try again.', 'error');
        } else {
            app.showStatus('viewerStatus', `Scanner error: ${error.message}`, 'error');
        }
    }
};

/**
 * Toggle QR scanner visibility
 */
app.toggleQRScanner = function() {
    const scannerContainer = document.getElementById('scannerContainer');
    const manualContainer = document.getElementById('manualEntryContainer');

    if (scannerContainer.classList.contains('hidden')) {
        // Show scanner, hide manual entry
        scannerContainer.classList.remove('hidden');
        manualContainer.classList.add('hidden');
        app.showStatus('viewerStatus', 'Point camera at QR code', 'info');
        app.startQRScanner();
    } else {
        // Hide scanner, show manual entry
        scannerContainer.classList.add('hidden');
        manualContainer.classList.remove('hidden');
        app.showStatus('viewerStatus', 'Ready to connect', 'success');
        app.stopQRScanner();
    }
};

/**
 * Stop QR scanner and release camera
 */
app.stopQRScanner = function() {
    // Stop scanner interval
    if (app.scannerInterval) {
        clearInterval(app.scannerInterval);
        app.scannerInterval = null;
    }

    // Stop scanner stream
    if (app.scannerStream) {
        app.scannerStream.getTracks().forEach(track => track.stop());
        app.scannerStream = null;
    }

    // Clear video element
    const scannerVideo = document.getElementById('qrScanner');
    if (scannerVideo) {
        scannerVideo.srcObject = null;
    }

    console.log('QR scanner stopped');
};

/**
 * Connect manually using peer ID from text input
 */
app.connectManually = function() {
    const input = document.getElementById('manualPeerId');
    const peerId = input.value.trim();

    if (!peerId) {
        app.showStatus('viewerStatus', 'Please enter a 4-digit code', 'error');
        return;
    }

    if (peerId.length !== 4 || !/^\d{4}$/.test(peerId)) {
        app.showStatus('viewerStatus', 'Code must be 4 digits (0-9)', 'error');
        return;
    }

    console.log('Manual connection to:', peerId);
    app.connectToPeer(peerId);
};

/**
 * Connect to the camera peer using the scanned peer ID
 * @param {string} remotePeerId - The peer ID from the QR code
 */
app.connectToPeer = function(remotePeerId) {
    console.log('Connecting to peer:', remotePeerId);

    // Stop QR scanner if it's running
    app.stopQRScanner();

    // Hide both input containers
    app.elements.scannerContainer.classList.add('hidden');
    document.getElementById('manualEntryContainer').classList.add('hidden');

    app.showStatus('viewerStatus', `Connecting to camera (${remotePeerId})...`, 'info');

    // Function to attempt the connection
    const attemptConnection = () => {
        try {
            // Check if peer is ready
            if (!app.peer) {
                throw new Error('Viewer peer object not created. Please restart.');
            }

            if (!app.peer.id) {
                console.warn('Peer not ready yet, waiting...');
                app.showStatus('viewerStatus', 'Waiting for peer connection...', 'info');
                // Wait and retry
                setTimeout(() => attemptConnection(), 500);
                return;
            }

            if (app.peer.disconnected) {
                console.warn('Peer is disconnected, reconnecting...');
                app.peer.reconnect();
                setTimeout(() => attemptConnection(), 500);
                return;
            }

            console.log('Viewer peer ID:', app.peer.id);
            console.log('Initiating call to camera peer:', remotePeerId);
            console.log('Peer connection state:', app.peer.disconnected ? 'disconnected' : 'connected');

            // Create a dummy stream with BOTH audio and video
            // This is crucial: WebRTC negotiates capabilities based on what you send
            // If you only send audio, it won't negotiate for receiving video!

            // Create silent audio track
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const destination = audioContext.createMediaStreamDestination();
            const gainNode = audioContext.createGain();
            gainNode.gain.value = 0.001; // Very quiet
            oscillator.connect(gainNode);
            gainNode.connect(destination);
            oscillator.start();

            // Create a blank video track (black canvas)
            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = 480;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Capture canvas as video stream at 1fps (minimal bandwidth)
            const canvasStream = canvas.captureStream(1);
            const videoTrack = canvasStream.getVideoTracks()[0];

            // Combine audio and video into one stream
            const outgoingStream = new MediaStream();
            outgoingStream.addTrack(destination.stream.getAudioTracks()[0]);
            outgoingStream.addTrack(videoTrack);

            console.log('Calling with outgoing stream (audio + video):', outgoingStream.getTracks().map(t => t.kind));

            // Initiate a call to the camera peer
            app.call = app.peer.call(remotePeerId, outgoingStream);

            // Safety check
            if (!app.call) {
                throw new Error('Failed to create call. Peer ID might be incorrect or camera is offline: ' + remotePeerId);
            }

            console.log('✅ Call object created successfully, waiting for stream...');

            // When we receive the remote stream, display it
            app.call.on('stream', (remoteStream) => {
            console.log('✅ Received remote stream from camera');
            console.log('Stream ID:', remoteStream.id);
            console.log('Stream active:', remoteStream.active);
            console.log('All tracks:', remoteStream.getTracks().map(t => ({
                kind: t.kind,
                enabled: t.enabled,
                readyState: t.readyState,
                muted: t.muted
            })));

            const videoTracks = remoteStream.getVideoTracks();
            const audioTracks = remoteStream.getAudioTracks();

            console.log(`Video tracks: ${videoTracks.length}`, videoTracks);
            console.log(`Audio tracks: ${audioTracks.length}`, audioTracks);

            // Check if stream has video
            if (videoTracks.length === 0) {
                console.error('❌ No video tracks in remote stream!');
                console.error('Remote stream details:', {
                    id: remoteStream.id,
                    active: remoteStream.active,
                    allTracks: remoteStream.getTracks()
                });
                app.showStatus('viewerStatus', 'Connected but no video received. Retrying...', 'error');

                // Try to renegotiate after 1 second
                setTimeout(() => {
                    console.log('Attempting to renegotiate...');
                    if (app.call && app.call.peerConnection) {
                        console.log('PeerConnection state:', app.call.peerConnection.connectionState);
                        console.log('ICE state:', app.call.peerConnection.iceConnectionState);
                    }
                }, 1000);
                return;
            }

            // Check if video track is enabled
            if (!videoTracks[0].enabled) {
                console.warn('⚠️ Video track is disabled, enabling...');
                videoTracks[0].enabled = true;
            }

            // Set the stream
            app.elements.remoteVideo.srcObject = remoteStream;

            // Add event listeners to video element for debugging
            app.elements.remoteVideo.onloadedmetadata = () => {
                console.log('✅ Video metadata loaded:', {
                    duration: app.elements.remoteVideo.duration,
                    videoWidth: app.elements.remoteVideo.videoWidth,
                    videoHeight: app.elements.remoteVideo.videoHeight
                });
            };

            app.elements.remoteVideo.onloadeddata = () => {
                console.log('✅ Video data loaded');
            };

            app.elements.remoteVideo.onplay = () => {
                console.log('✅ Video playing');
            };

            app.elements.remoteVideo.onerror = (e) => {
                console.error('❌ Video element error:', e);
            };

            // Force play (in case autoplay is blocked)
            app.elements.remoteVideo.play().then(() => {
                console.log('✅ Video playback started successfully');
            }).catch(err => {
                console.error('❌ Autoplay failed:', err);
                app.showStatus('viewerStatus', 'Connected! Click ▶ Play button below', 'warning');
            });

            // Show video and update status
            app.elements.remoteVideoContainer.classList.remove('hidden');
            app.showStatus('viewerStatus', 'Connected! Receiving live feed', 'success');
        });

            // Handle call errors
            app.call.on('error', (error) => {
                console.error('❌ Call error:', error);
                app.showStatus('viewerStatus', `Connection failed: ${error.message}`, 'error');
            });

            // Handle call close
            app.call.on('close', () => {
                console.log('📞 Call ended');
                app.showStatus('viewerStatus', 'Connection closed', 'warning');
                app.elements.remoteVideoContainer.classList.add('hidden');
            });

        } catch (error) {
            console.error('❌ Connection error:', error);
            app.showStatus('viewerStatus', `Failed to connect: ${error.message}`, 'error');
            // Show scanner again so user can retry
            app.elements.scannerContainer.classList.remove('hidden');
        }
    };

    // Start connection attempt
    attemptConnection();
};

// ========================================
// BROWSER COMPATIBILITY CHECKS
// ========================================

/**
 * Check if the browser supports required features
 * @returns {Object} compatibility status
 */
app.checkCompatibility = function() {
    const compat = {
        webrtc: false,
        mediaDevices: false,
        getUserMedia: false,
        secure: false,
        errors: []
    };

    // Check for secure context (HTTPS or localhost)
    compat.secure = window.isSecureContext ||
                    window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1';

    if (!compat.secure) {
        compat.errors.push('Page must be served over HTTPS or localhost for camera access');
    }

    // Check for navigator.mediaDevices
    if (!navigator.mediaDevices) {
        compat.errors.push('Your browser does not support navigator.mediaDevices');
    } else {
        compat.mediaDevices = true;

        // Check for getUserMedia
        if (!navigator.mediaDevices.getUserMedia) {
            compat.errors.push('Your browser does not support getUserMedia');
        } else {
            compat.getUserMedia = true;
        }
    }

    // Check for WebRTC (RTCPeerConnection)
    if (typeof RTCPeerConnection !== 'undefined') {
        compat.webrtc = true;
    } else {
        compat.errors.push('Your browser does not support WebRTC');
    }

    return compat;
};

/**
 * Show compatibility warning if browser is not fully supported
 */
app.showCompatibilityWarning = function() {
    const compat = app.checkCompatibility();

    if (compat.errors.length > 0) {
        const warningDiv = document.createElement('div');
        warningDiv.className = 'status error';
        warningDiv.style.margin = '20px';
        warningDiv.innerHTML = `
            <strong>⚠️ Browser Compatibility Issue</strong><br><br>
            ${compat.errors.map(e => `• ${e}`).join('<br>')}<br><br>
            <strong>Solutions:</strong><br>
            • Use a modern browser (Chrome, Firefox, Safari, Edge)<br>
            • Access via <code>http://localhost:8000/</code> instead of file:///<br>
            • Or use HTTPS for production deployment
        `;
        app.elements.modeSelection.insertBefore(warningDiv, app.elements.modeSelection.firstChild);

        console.error('Compatibility check failed:', compat.errors);
        return false;
    }

    return true;
};

// ========================================
// INITIALIZATION
// ========================================

// Check for HTTPS or localhost
if (window.location.protocol !== 'https:' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1') {
    console.warn('⚠️ Camera access requires HTTPS or localhost. Some features may not work.');
}

// ========================================
// URL PARAMETER HANDLING (Auto-mode)
// ========================================

/**
 * Check URL parameters and auto-start the appropriate mode
 */
app.checkUrlParameters = function() {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    const peerId = urlParams.get('peer');

    if (mode === 'viewer' && peerId) {
        console.log('🔗 Auto-starting viewer mode from URL');
        console.log('Target peer ID:', peerId);

        // Auto-start viewer mode and connect
        app.startViewerMode().then(() => {
            // Wait a bit for peer to initialize, then connect
            setTimeout(() => {
                console.log('🔗 Auto-connecting to peer:', peerId);
                app.connectToPeer(peerId);
            }, 1000);
        });

        return true;
    }

    return false;
};

// Run compatibility check and auto-mode on load
document.addEventListener('DOMContentLoaded', function() {
    app.showCompatibilityWarning();

    // Log library loading status
    console.log('Library status:', {
        Peer: typeof Peer !== 'undefined',
        QRCode: typeof QRCode !== 'undefined',
        jsQR: typeof jsQR !== 'undefined'
    });

    // Check if URL has auto-mode parameters
    if (app.checkUrlParameters()) {
        console.log('✅ Auto-mode activated from URL');
    } else {
        console.log('Manual mode selection required');
    }
});

console.log('Baby Monitor initialized. Select a mode to begin.');
console.log('Version: 1.0.2');
