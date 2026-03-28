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
 * - Works on same LAN or with direct internet P2P connection
 * - WebRTC automatically prefers local network (LAN) for lowest latency
 * - STUN server helps with NAT traversal
 * - TURN relay available as fallback for restricted networks
 */

// ========================================
// GLOBAL STATE
// ========================================

const app = {
    peer: null,              // PeerJS peer instance
    localStream: null,       // Local media stream (camera mode)
    connection: null,        // Data connection for signaling
    call: null,              // Media call connection
    availableCameras: [],    // List of available video devices
    currentCameraIndex: -1,  // Currently selected camera index (-1 = use facingMode)
    wakeLock: null,          // Screen wake lock (keep camera running)

    // DOM element references
    elements: {
        modeSelection: document.getElementById('modeSelection'),
        cameraMode: document.getElementById('cameraMode'),
        viewerMode: document.getElementById('viewerMode'),
        localVideo: document.getElementById('localVideo'),
        remoteVideo: document.getElementById('remoteVideo'),
        codeDisplay: document.getElementById('codeDisplay'),
        peerId: document.getElementById('peerId'),
        cameraStatus: document.getElementById('cameraStatus'),
        viewerStatus: document.getElementById('viewerStatus'),
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
 * Enumerate available cameras
 */
app.enumerateCameras = async function() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        app.availableCameras = devices.filter(device => device.kind === 'videoinput');

        console.log(`📷 Found ${app.availableCameras.length} camera(s):`,
            app.availableCameras.map(c => c.label || c.deviceId.substring(0, 8)));

        // Try to find back camera and set as default
        const backCameraIndex = app.availableCameras.findIndex(camera =>
            camera.label.toLowerCase().includes('back') ||
            camera.label.toLowerCase().includes('rear') ||
            camera.label.toLowerCase().includes('environment')
        );

        if (backCameraIndex >= 0) {
            app.currentCameraIndex = backCameraIndex;
            console.log('📷 Using back camera as default');
        } else {
            app.currentCameraIndex = -1; // Use facingMode instead
            console.log('📷 Using facingMode: environment');
        }
    } catch (err) {
        console.warn('Could not enumerate cameras:', err);
        app.availableCameras = [];
        app.currentCameraIndex = -1;
    }
};

/**
 * Get camera stream based on current selection
 */
app.getCamera = async function() {
    const constraints = {
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        }
    };

    // If specific camera selected, use deviceId
    if (app.currentCameraIndex >= 0 && app.availableCameras[app.currentCameraIndex]) {
        constraints.video = {
            deviceId: { exact: app.availableCameras[app.currentCameraIndex].deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 }
        };
        console.log('📷 Using camera:', app.availableCameras[app.currentCameraIndex].label);
    } else {
        // Otherwise use facingMode (back camera preferred)
        constraints.video = {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
        };
        console.log('📷 Using facingMode: environment');
    }

    return await navigator.mediaDevices.getUserMedia(constraints);
};

/**
 * Get scanner camera stream
 */
app.getScannerCamera = async function() {
    const constraints = { video: true };

    // If specific camera selected, use deviceId
    if (app.currentCameraIndex >= 0 && app.availableCameras[app.currentCameraIndex]) {
        constraints.video = {
            deviceId: { exact: app.availableCameras[app.currentCameraIndex].deviceId }
        };
        console.log('📷 Scanner using camera:', app.availableCameras[app.currentCameraIndex].label);
    } else {
        // Otherwise use facingMode (back camera preferred for scanning)
        constraints.video = { facingMode: 'environment' };
        console.log('📷 Scanner using facingMode: environment');
    }

    return await navigator.mediaDevices.getUserMedia(constraints);
};

/**
 * Switch to next available camera
 */
app.switchCamera = async function() {
    if (app.availableCameras.length <= 1) {
        console.log('Only one camera available, nothing to switch');
        return;
    }

    // Prevent multiple simultaneous switches
    const switchBtn = document.getElementById('switchCameraBtn');
    if (switchBtn && switchBtn.disabled) {
        console.log('Camera switch already in progress');
        return;
    }

    try {
        // Disable button during switch
        if (switchBtn) switchBtn.disabled = true;

        app.showStatus('cameraStatus', 'Switching camera...', 'info');

        // Stop current stream
        if (app.localStream) {
            app.localStream.getTracks().forEach(track => {
                track.stop();
                console.log('Stopped track:', track.kind);
            });
            // Small delay to ensure tracks are fully released
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Move to next camera
        if (app.currentCameraIndex < 0) {
            // Was using facingMode, switch to first device
            app.currentCameraIndex = 0;
        } else {
            app.currentCameraIndex = (app.currentCameraIndex + 1) % app.availableCameras.length;
        }

        // Get new camera stream
        app.localStream = await app.getCamera();
        console.log('✅ New camera stream acquired');

        // Update video element
        app.elements.localVideo.srcObject = app.localStream;

        // Wait a bit for the video element to start playing
        await new Promise(resolve => setTimeout(resolve, 300));

        // Update peer connection if active
        if (app.peerConnection) {
            const videoTrack = app.localStream.getVideoTracks()[0];
            const audioTrack = app.localStream.getAudioTracks()[0];
            const videoSender = app.peerConnection.getSenders().find(s => s.track?.kind === 'video');
            const audioSender = app.peerConnection.getSenders().find(s => s.track?.kind === 'audio');

            if (videoSender && videoTrack) {
                await videoSender.replaceTrack(videoTrack);
                console.log('📷 Updated video track in peer connection');
            }
            if (audioSender && audioTrack) {
                await audioSender.replaceTrack(audioTrack);
                console.log('🎤 Updated audio track in peer connection');
            }
        }

        // Update call if active (PeerJS)
        if (app.call && app.call.peerConnection) {
            const videoTrack = app.localStream.getVideoTracks()[0];
            const audioTrack = app.localStream.getAudioTracks()[0];
            const videoSender = app.call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
            const audioSender = app.call.peerConnection.getSenders().find(s => s.track?.kind === 'audio');

            if (videoSender && videoTrack) {
                await videoSender.replaceTrack(videoTrack);
                console.log('📷 Updated video track in active call');
            }
            if (audioSender && audioTrack) {
                await audioSender.replaceTrack(audioTrack);
                console.log('🎤 Updated audio track in active call');
            }
        }

        const cameraName = app.availableCameras[app.currentCameraIndex]?.label || 'Camera';
        app.showStatus('cameraStatus', `Switched to: ${cameraName}`, 'success');

        // Auto-clear status after 2 seconds
        setTimeout(() => {
            if (app.call || app.peerConnection) {
                app.showStatus('cameraStatus', 'Connected to viewer! Streaming...', 'success');
            } else {
                app.showStatus('cameraStatus', 'Waiting for viewer to connect...', 'warning');
            }
        }, 2000);

    } catch (error) {
        console.error('Camera switch error:', error);
        app.showStatus('cameraStatus', `Failed to switch camera: ${error.message}`, 'error');

        // Try to recover by getting a fresh stream
        try {
            console.log('Attempting recovery...');
            app.localStream = await app.getCamera();
            app.elements.localVideo.srcObject = app.localStream;
        } catch (recoveryError) {
            console.error('Recovery failed:', recoveryError);
        }
    } finally {
        // Re-enable button
        if (switchBtn) switchBtn.disabled = false;
    }
};

/**
 * Detect connection type (LAN vs Internet)
 */
app.detectConnectionType = async function() {
    try {
        const pc = app.call?.peerConnection;
        if (!pc) {
            console.log('No peer connection to check');
            return;
        }

        const stats = await pc.getStats();
        let selectedPair = null;
        let localCandidate = null;
        let remoteCandidate = null;

        // Log all candidate pairs for debugging
        const allPairs = [];
        stats.forEach(report => {
            if (report.type === 'candidate-pair') {
                allPairs.push({
                    state: report.state,
                    localId: report.localCandidateId,
                    remoteId: report.remoteCandidateId
                });
                if (report.state === 'succeeded') {
                    selectedPair = report;
                }
            }
        });

        console.log('📊 All candidate pairs:', allPairs);

        if (!selectedPair) {
            console.warn('⚠️ No successful candidate pair found yet');
            return;
        }

        // Get local and remote candidates
        stats.forEach(report => {
            if (report.type === 'local-candidate' && report.id === selectedPair.localCandidateId) {
                localCandidate = report;
            }
            if (report.type === 'remote-candidate' && report.id === selectedPair.remoteCandidateId) {
                remoteCandidate = report;
            }
        });

        console.log('📊 Connection Stats:', {
            localCandidate: localCandidate?.candidateType,
            remoteCandidate: remoteCandidate?.candidateType,
            localAddress: localCandidate?.address,
            remoteAddress: remoteCandidate?.address,
            protocol: localCandidate?.protocol
        });

        // Determine connection type
        let connectionType = 'Unknown';
        let connectionIcon = '🔗';
        let connectionColor = '#667eea';

        if (localCandidate && remoteCandidate) {
            // Both are host candidates = direct LAN connection
            if (localCandidate.candidateType === 'host' && remoteCandidate.candidateType === 'host') {
                connectionType = 'LAN (Direct Local Network)';
                connectionIcon = '🏠';
                connectionColor = '#28a745';
            }
            // Either is relay = using TURN server
            else if (localCandidate.candidateType === 'relay' || remoteCandidate.candidateType === 'relay') {
                connectionType = 'Internet (Relay Server)';
                connectionIcon = '🌐';
                connectionColor = '#ffc107';
            }
            // Server reflexive = direct internet (through NAT)
            else if (localCandidate.candidateType === 'srflx' || remoteCandidate.candidateType === 'srflx') {
                connectionType = 'Internet (Direct P2P)';
                connectionIcon = '🌐';
                connectionColor = '#17a2b8';
            }
        }

        // Display connection type
        const connectionTypeElement = document.getElementById('connectionType');
        if (connectionTypeElement) {
            connectionTypeElement.innerHTML = `${connectionIcon} Connected via <strong>${connectionType}</strong>`;
            connectionTypeElement.style.color = connectionColor;
        }

        console.log(`✅ Connection Type: ${connectionType}`);

    } catch (error) {
        console.error('Error detecting connection type:', error);
    }
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

    // Release wake lock
    app.releaseWakeLock();

    // Close call
    if (app.call) {
        app.call.close();
        app.call = null;
    }

    // Reset UI
    app.elements.modeSelection.classList.remove('hidden');
    app.elements.cameraMode.classList.add('hidden');
    app.elements.viewerMode.classList.add('hidden');
    if (app.elements.codeDisplay) {
        app.elements.codeDisplay.classList.add('hidden');
    }
    app.elements.remoteVideoContainer.classList.add('hidden');

    // Hide camera switch button
    const switchBtn = document.getElementById('switchCameraBtn');
    if (switchBtn) {
        switchBtn.style.display = 'none';
    }

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

    // Reset connection type display
    const connectionTypeElement = document.getElementById('connectionType');
    if (connectionTypeElement) {
        connectionTypeElement.innerHTML = '🔗 Detecting connection type...';
        connectionTypeElement.style.color = '#667eea';
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

        // Step 1: Enumerate available cameras
        await app.enumerateCameras();

        // Step 2: Request camera and microphone access
        app.showStatus('cameraStatus', 'Requesting camera and microphone access...', 'info');

        app.localStream = await app.getCamera();

        // Step 2: Display local video feed
        app.elements.localVideo.srcObject = app.localStream;

        // Show camera switch button if multiple cameras available
        const switchBtn = document.getElementById('switchCameraBtn');
        if (switchBtn && app.availableCameras.length > 1) {
            switchBtn.style.display = 'block';
            console.log(`📷 Camera switcher enabled (${app.availableCameras.length} cameras available)`);
        }

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

        // Request wake lock to keep screen on and prevent backgrounding
        await app.requestWakeLock();

        // Step 3: Initialize PeerJS with custom short ID
        // PeerJS provides a free cloud signaling server
        // The actual video/audio data flows peer-to-peer (WebRTC), not through PeerJS servers

        // Check if Peer library is loaded
        if (typeof Peer === 'undefined') {
            throw new Error('PeerJS library not loaded. Check your internet connection.');
        }

        console.log('Initializing PeerJS...');

        // Generate a random 6-digit number for peer ID
        const shortId = Math.floor(100000 + Math.random() * 900000).toString(); // 100000-999999

        console.log('Attempting to create peer with ID:', shortId);

        app.peer = new Peer(shortId, {
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    {
                        urls: 'turn:openrelay.metered.ca:443',
                        username: 'openrelayproject',
                        credential: 'openrelayproject'
                    }
                ],
                sdpSemantics: 'unified-plan'
            }
        });

        console.log('PeerJS initialized, waiting for connection...');

        // Step 4: When peer is ready, display the 6-digit code
        app.peer.on('open', (id) => {
            console.log('Peer connection opened! Peer ID:', id);
            app.showStatus('cameraStatus', 'Ready to stream! Show this code to viewer', 'success');

            // Display peer ID
            app.elements.peerId.textContent = id;

            // Show code display
            app.elements.codeDisplay.classList.remove('hidden');

            console.log('✅ 6-digit code displayed:', id);
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

        // Generate a random 6-digit ID for viewer too (not critical, but keeps it consistent)
        const viewerShortId = Math.floor(100000 + Math.random() * 900000).toString();

        app.peer = new Peer(viewerShortId, {
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    {
                        urls: 'turn:openrelay.metered.ca:443',
                        username: 'openrelayproject',
                        credential: 'openrelayproject'
                    }
                ],
                sdpSemantics: 'unified-plan'
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
 * Connect manually using peer ID from text input
 */
app.connectManually = function() {
    const input = document.getElementById('manualPeerId');
    const peerId = input.value.trim();

    if (!peerId) {
        app.showStatus('viewerStatus', 'Please enter a 6-digit code', 'error');
        return;
    }

    if (peerId.length !== 6 || !/^\d{6}$/.test(peerId)) {
        app.showStatus('viewerStatus', 'Code must be 6 digits (0-9)', 'error');
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

    // Hide input container
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

            // Set timeout for stream reception (30 seconds)
            const streamTimeout = setTimeout(() => {
                if (app.call && !app.elements.remoteVideo.srcObject) {
                    console.error('❌ Stream timeout - no video received after 30 seconds');
                    app.showStatus('viewerStatus', 'Connection timeout. Camera may be offline or behind firewall.', 'error');
                    if (app.call) {
                        app.call.close();
                        app.call = null;
                    }
                    // Show manual entry again for retry
                    document.getElementById('manualEntryContainer').classList.remove('hidden');
                }
            }, 30000);

            // Store timeout for cleanup
            app.streamTimeout = streamTimeout;

            // Log ICE candidates for debugging
            app.call.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('📍 ICE Candidate:', {
                        type: event.candidate.type || 'unknown',
                        protocol: event.candidate.protocol,
                        address: event.candidate.address || event.candidate.ip || 'N/A',
                        port: event.candidate.port,
                        candidate: event.candidate.candidate
                    });
                } else {
                    console.log('✅ ICE gathering complete');
                }
            };

            // Log ICE connection state for debugging
            app.call.peerConnection.oniceconnectionstatechange = () => {
                const state = app.call.peerConnection.iceConnectionState;
                console.log('🔌 ICE Connection State:', state);

                if (state === 'connected') {
                    console.log('✅ Direct P2P connection established');
                } else if (state === 'completed') {
                    console.log('✅ Connection via relay (TURN server)');
                } else if (state === 'disconnected') {
                    console.warn('⚠️ ICE connection disconnected - may recover automatically');
                    app.showStatus('viewerStatus', 'Connection interrupted, attempting to reconnect...', 'warning');
                } else if (state === 'failed') {
                    console.error('❌ Connection failed - check network/firewall');
                    clearTimeout(streamTimeout);
                    app.showStatus('viewerStatus', 'Connection failed. Check network/firewall settings.', 'error');
                    // Show manual entry again for retry
                    document.getElementById('manualEntryContainer').classList.remove('hidden');
                }
            };

            // When we receive the remote stream, display it
            app.call.on('stream', (remoteStream) => {
            console.log('✅ Received remote stream from camera');

            // Skip if this is the same stream we already have
            if (app.elements.remoteVideo.srcObject && app.elements.remoteVideo.srcObject.id === remoteStream.id) {
                console.log('ℹ️ Stream already set, skipping duplicate update');
                return;
            }

            // Clear timeout - stream received successfully
            if (app.streamTimeout) {
                clearTimeout(app.streamTimeout);
                app.streamTimeout = null;
            }

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

            // Set the stream (this will trigger loadedmetadata/loadeddata events)
            app.elements.remoteVideo.srcObject = remoteStream;

            // Ensure video is muted for autoplay (will be unmuted by user button)
            app.elements.remoteVideo.muted = true;

            // Use canplay event which fires when enough data is available to play
            const playVideo = () => {
                console.log('✅ Video can play, attempting playback...');

                app.elements.remoteVideo.play().then(() => {
                    console.log('✅ Video playback started successfully (muted)');
                    app.showStatus('viewerStatus', 'Connected! Click "Enable Sound" button below to hear audio', 'success');
                }).catch(err => {
                    console.error('❌ Autoplay failed:', err);
                    app.showStatus('viewerStatus', 'Connected! Click "Enable Sound & Play" button below', 'warning');
                });
            };

            // Use once to ensure this only fires one time
            app.elements.remoteVideo.addEventListener('canplay', playVideo, { once: true });

            app.elements.remoteVideo.onplay = () => {
                console.log('✅ Video playing');
            };

            app.elements.remoteVideo.onerror = (e) => {
                console.error('❌ Video element error:', e);
            };

            // Show video container (status will be updated when video starts playing)
            app.elements.remoteVideoContainer.classList.remove('hidden');

            // Store peer ID for auto-reconnect
            app.lastConnectedPeer = remotePeerId;
            console.log('💾 Stored peer ID for auto-reconnect:', remotePeerId);

            // Detect and display connection type (LAN vs Internet)
            setTimeout(() => {
                app.detectConnectionType();
            }, 2000);  // Wait 2 seconds for ICE to settle
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
        Peer: typeof Peer !== 'undefined'
    });

    // Check if URL has auto-mode parameters
    if (app.checkUrlParameters()) {
        console.log('✅ Auto-mode activated from URL');
    } else {
        console.log('Manual mode selection required');
    }
});

// ========================================
// WAKE LOCK - KEEP SCREEN ON (CAMERA MODE)
// ========================================

/**
 * Request screen wake lock to keep camera running in background
 */
app.requestWakeLock = async function() {
    if ('wakeLock' in navigator) {
        try {
            app.wakeLock = await navigator.wakeLock.request('screen');
            console.log('🔒 Wake Lock acquired - screen will stay on');

            // Re-acquire wake lock if it's released (e.g., when screen turns off)
            app.wakeLock.addEventListener('release', () => {
                console.log('🔓 Wake Lock released');
            });
        } catch (err) {
            console.warn('⚠️ Wake Lock failed:', err.message);
        }
    } else {
        console.warn('⚠️ Wake Lock API not supported in this browser');
    }
};

/**
 * Release screen wake lock
 */
app.releaseWakeLock = async function() {
    if (app.wakeLock) {
        try {
            await app.wakeLock.release();
            app.wakeLock = null;
            console.log('🔓 Wake Lock released manually');
        } catch (err) {
            console.warn('⚠️ Failed to release Wake Lock:', err);
        }
    }
};

// ========================================
// AUTO-RECONNECT ON PAGE VISIBILITY
// ========================================

// Store last connected peer for auto-reconnect
app.lastConnectedPeer = null;

// Detect when page becomes visible again (mobile returns from background)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        console.log('📱 Page became visible');

        // Re-acquire wake lock if in camera mode
        if (app.mode === 'camera' && app.localStream) {
            console.log('🔄 Re-acquiring wake lock for camera mode');
            app.requestWakeLock();
        }

        // If we're in viewer mode and had a connection that's now closed
        if (app.mode === 'viewer' && app.lastConnectedPeer && (!app.call || app.call.connectionId === undefined)) {
            console.log('🔄 Auto-reconnecting to:', app.lastConnectedPeer);
            app.showStatus('viewerStatus', 'Reconnecting...', 'info');

            // Wait a bit for network to stabilize
            setTimeout(() => {
                app.connectToPeer(app.lastConnectedPeer);
            }, 1000);
        }
    } else {
        console.log('📱 Page hidden (backgrounded)');
    }
});

console.log('Baby Monitor initialized. Select a mode to begin.');
console.log('Version: 1.3.0 - Connection type detection, camera switcher & 6-digit codes');
