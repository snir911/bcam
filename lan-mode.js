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
 * Compress connection data for smaller QR codes
 */
app.compressConnectionData = function(connectionInfo) {
    let sdp = connectionInfo.offer.sdp;

    // Aggressive SDP minification
    sdp = sdp
        .replace(/\r\n/g, '\n')           // Remove \r
        .replace(/\n+/g, '\n')            // Multiple newlines → single
        .replace(/a=extmap:[^\n]+\n/g, '') // Remove extension maps (not critical)
        .replace(/a=rtcp-fb:[^\n]+\n/g, '') // Remove RTCP feedback (optional)
        .replace(/a=fmtp:[^\n]+\n/g, '')   // Remove format parameters (use defaults)
        .replace(/a=ssrc:[^\n]+\n/g, '')   // Remove SSRC attributes
        .replace(/a=msid:[^\n]+\n/g, '')   // Remove media stream IDs
        .replace(/a=rtcp-mux\n/g, '')      // Implied by modern WebRTC
        .trim();

    // Filter candidates - only host type for LAN
    const candidates = connectionInfo.candidates
        .filter(c => c.candidate.includes('typ host')) // Only local IPs
        .slice(0, 2) // Maximum 2 candidates (IPv4 + IPv6)
        .map(c => {
            // Extract minimal candidate info
            const parts = c.candidate.split(' ');
            // Keep only: foundation, component, protocol, priority, IP, port, type
            return `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]} ${parts[4]} ${parts[5]} ${parts[7]} ${parts[8]}`;
        });

    console.log('🔧 Optimized candidates:', candidates);

    // Ultra-compact structure
    const compact = {
        o: sdp,
        c: candidates
    };

    return JSON.stringify(compact);
};

/**
 * Decompress connection data
 */
app.decompressConnectionData = function(compactString) {
    const compact = JSON.parse(compactString);

    // Restore full structure
    return {
        offer: {
            type: 'offer',
            sdp: compact.o
        },
        candidates: compact.c.map(candidateStr => ({
            candidate: candidateStr,
            sdpMid: '0',
            sdpMLineIndex: 0
        }))
    };
};

/**
 * Display connection info for viewer to copy
 */
app.displayLANConnectionInfo = function(connectionInfo) {
    // Debug: Log what we have
    console.log('📦 Raw connection info:', {
        sdpLength: connectionInfo.offer.sdp.length,
        candidatesCount: connectionInfo.candidates.length,
        candidates: connectionInfo.candidates
    });

    // Compress data
    const connectionString = app.compressConnectionData(connectionInfo);
    const base64 = btoa(connectionString);  // Encode to base64 for easier sharing

    console.log('📦 After compression:', {
        originalSize: JSON.stringify(connectionInfo).length,
        compressedSize: connectionString.length,
        base64Size: base64.length,
        savings: `${(100 - (connectionString.length / JSON.stringify(connectionInfo).length * 100)).toFixed(1)}%`
    });

    // Generate short code (first 8 chars of hash)
    const hash = base64.substring(0, 8).toUpperCase();

    app.elements.peerId.textContent = hash;
    app.elements.qrContainer.classList.remove('hidden');

    // Check QR code data size
    const dataSize = base64.length;
    console.log(`📊 Connection data size: ${dataSize} bytes`);

    // QR code capacity: ~2953 bytes for Low error correction
    const QR_MAX_SIZE = 2900;

    app.elements.qrcode.innerHTML = '';

    if (dataSize > QR_MAX_SIZE) {
        console.warn(`⚠️ Data too large for QR code (${dataSize} > ${QR_MAX_SIZE})`);

        // Show copy/paste interface with helpful message
        app.elements.qrcode.innerHTML = `
            <div style="padding: 20px; background: #fff3cd; border-radius: 8px; text-align: left;">
                <p style="font-size: 14px; font-weight: 600; margin-bottom: 10px; color: #856404;">
                    ⚠️ Connection data too large for QR code (${(dataSize/1024).toFixed(1)} KB)
                </p>
                <p style="font-size: 12px; color: #856404; margin-bottom: 10px;">
                    Use copy/paste instead:
                </p>
                <textarea readonly id="lanConnectionCode"
                          style="width: 100%; height: 100px; font-family: monospace; font-size: 9px;
                                 padding: 8px; border: 2px solid #856404; border-radius: 6px; resize: vertical;"
                >${base64}</textarea>
                <button onclick="app.copyLANCode()"
                        style="margin-top: 10px; padding: 10px 20px; background: #667eea; color: white;
                               border: none; border-radius: 6px; cursor: pointer; width: 100%;">
                    📋 Copy Connection Code
                </button>
                <p style="font-size: 11px; color: #856404; margin-top: 10px;">
                    💡 Tip: Paste in viewer's "Enter manually" field
                </p>
            </div>
        `;
    } else {
        // Data fits in QR code
        try {
            new QRCode(app.elements.qrcode, {
                text: base64,
                width: 250,
                height: 250,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.L  // Low correction for large data
            });

            console.log(`✅ Connection QR code generated (${dataSize} bytes)`);
        } catch (err) {
            console.error('❌ QR generation failed:', err);
            // Fallback to copy/paste
            app.elements.qrcode.innerHTML = `
                <div style="padding: 15px; background: #f8d7da; border-radius: 8px;">
                    <p style="color: #721c24; font-size: 14px; margin-bottom: 10px;">
                        ❌ QR code generation failed: ${err.message}
                    </p>
                    <textarea readonly id="lanConnectionCode"
                              style="width: 100%; height: 100px; font-family: monospace; font-size: 10px;
                                     padding: 10px; border: 2px solid #ddd; border-radius: 6px;"
                    >${base64}</textarea>
                    <button onclick="app.copyLANCode()" style="margin-top: 10px; width: 100%;">
                        📋 Copy Code
                    </button>
                </div>
            `;
        }
    }

    // Add container for answer (will use QR scanner or manual)
    const answerContainer = document.createElement('div');
    answerContainer.id = 'lanAnswerSection';
    answerContainer.style.cssText = 'margin-top: 20px; padding: 20px; background: #fff3cd; border-radius: 12px;';
    answerContainer.innerHTML = `
        <p style="font-size: 14px; font-weight: 600; margin-bottom: 10px; color: #333;">
            📥 Step 2: Get viewer's answer
        </p>
        <button onclick="app.scanAnswerQR()" style="width: 100%; padding: 15px; background: #28a745; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; margin-bottom: 10px;">
            📷 Scan Answer QR Code
        </button>
        <div style="text-align: center; margin: 10px 0; color: #999; font-size: 12px;">── OR ──</div>
        <textarea id="lanAnswerInput" placeholder="Paste answer code here..."
                  style="width: 100%; height: 80px; font-family: monospace; font-size: 10px;
                         padding: 10px; border: 2px solid #ddd; border-radius: 6px; resize: vertical;"></textarea>
        <button onclick="app.completeLANConnection()" style="margin-top: 10px; padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; width: 100%;">
            ✅ Complete Connection
        </button>

        <div id="answerScannerContainer" class="hidden" style="margin-top: 15px;">
            <video id="lanAnswerScanner" playsinline style="width: 100%; max-width: 300px; height: 300px; background: #000; border-radius: 8px;"></video>
            <button onclick="app.stopAnswerScanner()" style="margin-top: 10px; padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 6px; cursor: pointer;">
                ⌨️ Enter Manually Instead
            </button>
        </div>
    `;

    app.elements.qrContainer.appendChild(answerContainer);

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

        const compact = JSON.parse(atob(answerCode));

        // Decompress answer
        const data = {
            answer: {
                type: 'answer',
                sdp: compact.a
            },
            candidates: compact.c.map(candidateStr => ({
                candidate: candidateStr,
                sdpMid: '0',
                sdpMLineIndex: 0
            }))
        };

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

    // Show LAN connection interface with QR scanning option
    document.getElementById('manualEntryContainer').innerHTML = `
        <div style="margin: 20px 0; padding: 20px; background: #f8f9fa; border-radius: 12px;">
            <p style="font-size: 16px; margin-bottom: 15px;"><strong>📷 Step 1: Connect to Camera</strong></p>

            <button onclick="app.startOfferQRScanner()" style="width: 100%; padding: 15px; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; margin-bottom: 10px;">
                📷 Scan Camera's QR Code
            </button>

            <div style="text-align: center; margin: 10px 0; color: #999; font-size: 12px;">── OR ──</div>

            <textarea id="lanOfferCode" placeholder="Paste connection code here..."
                      style="width: 100%; height: 100px; font-family: monospace; font-size: 10px;
                             padding: 10px; border: 2px solid #ddd; border-radius: 6px; resize: vertical;"></textarea>
            <button onclick="app.connectLANMode()" style="margin-top: 10px; width: 100%; padding: 12px; background: #28a745; color: white; border: none; border-radius: 8px; cursor: pointer;">
                🔗 Connect to Camera
            </button>

            <div id="offerScannerContainer" class="hidden" style="margin-top: 15px;">
                <video id="lanOfferScanner" playsinline style="width: 100%; max-width: 300px; height: 300px; background: #000; border-radius: 8px;"></video>
                <p style="font-size: 12px; color: #666; margin-top: 5px;">Point at camera's QR code</p>
                <button onclick="app.stopOfferScanner()" style="margin-top: 10px; padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    ⌨️ Enter Manually Instead
                </button>
            </div>
        </div>

        <div id="lanAnswerContainer" class="hidden" style="margin: 20px 0; padding: 20px; background: #e8f5e9; border-radius: 12px;">
            <p style="font-size: 16px; font-weight: 600; margin-bottom: 10px; color: #333;">
                📤 Step 2: Show this to camera
            </p>
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

        // Decode and decompress connection info
        const connectionInfo = app.decompressConnectionData(atob(offerCode));

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
 * Display answer code for camera (as QR code)
 */
app.displayLANAnswer = function(answerInfo) {
    // Compress answer data
    const compactAnswer = {
        a: answerInfo.answer.sdp.replace(/\r\n/g, '\n').trim(),
        c: answerInfo.candidates.map(c => c.candidate)
    };

    const answerString = JSON.stringify(compactAnswer);
    const base64 = btoa(answerString);

    const answerContainer = document.getElementById('lanAnswerContainer');
    answerContainer.classList.remove('hidden');

    // Generate QR code for answer
    try {
        const qrDiv = document.createElement('div');
        qrDiv.id = 'answerQRCode';
        qrDiv.style.cssText = 'text-align: center; padding: 15px; background: white; border-radius: 8px;';

        new QRCode(qrDiv, {
            text: base64,
            width: 200,
            height: 200,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.L
        });

        answerContainer.innerHTML = '';
        answerContainer.appendChild(qrDiv);

        const instructions = document.createElement('p');
        instructions.style.cssText = 'font-size: 12px; color: #333; margin-top: 10px;';
        instructions.innerHTML = `
            <strong>📷 Camera device: Scan this QR code</strong><br>
            (or copy code below to paste manually)
        `;
        answerContainer.appendChild(instructions);

        // Add manual copy option
        const manualDiv = document.createElement('div');
        manualDiv.style.cssText = 'margin-top: 10px;';
        manualDiv.innerHTML = `
            <textarea readonly id="lanAnswerCode"
                      style="width: 100%; height: 60px; font-family: monospace; font-size: 9px; padding: 5px; border: 1px solid #ddd; border-radius: 4px;"
            >${base64}</textarea>
            <button onclick="app.copyAnswerCode()"
                    style="margin-top: 5px; padding: 8px 16px; background: #4caf50; color: white; border: none; border-radius: 6px; cursor: pointer; width: 100%;">
                📋 Copy Code
            </button>
        `;
        answerContainer.appendChild(manualDiv);

        console.log('✅ Answer QR code generated');
    } catch (err) {
        console.error('Answer QR generation failed:', err);
        // Fallback to text only
        answerContainer.innerHTML = `
            <textarea readonly id="lanAnswerCode">${base64}</textarea>
            <button onclick="app.copyAnswerCode()">📋 Copy Answer Code</button>
        `;
    }

    app.showStatus('viewerStatus', '📱 Show QR code to camera device', 'success');
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
        button.textContent = '📋 Copy Code';
    }, 2000);
};

/**
 * Scan answer QR code (on camera device)
 */
app.scanAnswerQR = async function() {
    console.log('Starting answer QR scanner...');

    const scannerContainer = document.getElementById('answerScannerContainer');
    scannerContainer.classList.remove('hidden');

    try {
        // Request camera access
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        }).catch(() => {
            // Fallback without facingMode
            return navigator.mediaDevices.getUserMedia({ video: true });
        });

        const video = document.getElementById('lanAnswerScanner');
        video.srcObject = stream;

        video.onloadedmetadata = () => {
            video.play();
        };

        // Create canvas for QR detection
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        // Scan for QR code
        const scanInterval = setInterval(() => {
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;

                if (canvas.width > 0 && canvas.height > 0) {
                    context.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                    const code = jsQR(imageData.data, imageData.width, imageData.height);

                    if (code) {
                        console.log('✅ Answer QR code detected:', code.data.substring(0, 50) + '...');
                        clearInterval(scanInterval);

                        // Stop camera
                        stream.getTracks().forEach(track => track.stop());
                        scannerContainer.classList.add('hidden');

                        // Process answer automatically
                        document.getElementById('lanAnswerInput').value = code.data;
                        app.completeLANConnection();
                    }
                }
            }
        }, 100);

        // Store interval for cleanup
        app.lanAnswerScanInterval = scanInterval;
        app.lanAnswerScanStream = stream;

    } catch (error) {
        console.error('Answer scanner error:', error);
        app.showStatus('cameraStatus', 'Failed to start scanner: ' + error.message, 'error');
        scannerContainer.classList.add('hidden');
    }
};

/**
 * Stop answer QR scanner
 */
app.stopAnswerScanner = function() {
    if (app.lanAnswerScanInterval) {
        clearInterval(app.lanAnswerScanInterval);
        app.lanAnswerScanInterval = null;
    }

    if (app.lanAnswerScanStream) {
        app.lanAnswerScanStream.getTracks().forEach(track => track.stop());
        app.lanAnswerScanStream = null;
    }

    const video = document.getElementById('lanAnswerScanner');
    if (video) {
        video.srcObject = null;
    }

    document.getElementById('answerScannerContainer').classList.add('hidden');
};

/**
 * Start QR scanner for camera's offer (on viewer device)
 */
app.startOfferQRScanner = async function() {
    console.log('Starting offer QR scanner...');

    const scannerContainer = document.getElementById('offerScannerContainer');
    scannerContainer.classList.remove('hidden');

    try {
        // Request camera access
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        }).catch(() => {
            return navigator.mediaDevices.getUserMedia({ video: true });
        });

        const video = document.getElementById('lanOfferScanner');
        video.srcObject = stream;

        video.onloadedmetadata = () => {
            video.play();
        };

        // Create canvas for QR detection
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        // Scan for QR code
        const scanInterval = setInterval(() => {
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;

                if (canvas.width > 0 && canvas.height > 0) {
                    context.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                    const code = jsQR(imageData.data, imageData.width, imageData.height);

                    if (code) {
                        console.log('✅ Offer QR code detected:', code.data.substring(0, 50) + '...');
                        clearInterval(scanInterval);

                        // Stop camera
                        stream.getTracks().forEach(track => track.stop());
                        scannerContainer.classList.add('hidden');

                        // Process offer automatically
                        document.getElementById('lanOfferCode').value = code.data;
                        app.connectLANMode();
                    }
                }
            }
        }, 100);

        // Store interval for cleanup
        app.lanOfferScanInterval = scanInterval;
        app.lanOfferScanStream = stream;

    } catch (error) {
        console.error('Offer scanner error:', error);
        app.showStatus('viewerStatus', 'Failed to start scanner: ' + error.message, 'error');
        scannerContainer.classList.add('hidden');
    }
};

/**
 * Stop offer QR scanner
 */
app.stopOfferScanner = function() {
    if (app.lanOfferScanInterval) {
        clearInterval(app.lanOfferScanInterval);
        app.lanOfferScanInterval = null;
    }

    if (app.lanOfferScanStream) {
        app.lanOfferScanStream.getTracks().forEach(track => track.stop());
        app.lanOfferScanStream = null;
    }

    const video = document.getElementById('lanOfferScanner');
    if (video) {
        video.srcObject = null;
    }

    document.getElementById('offerScannerContainer').classList.add('hidden');
};
