/**
 * ========================================
 * BABY MONITOR - CONFIGURATION
 * ========================================
 */

// Initialize app object early (before other modules)
if (typeof app === 'undefined') {
    var app = {};
}

const BabyMonitorConfig = {
    // Connection mode: 'internet' or 'lan'
    mode: 'internet',  // Default to internet mode

    // Internet mode settings (uses PeerJS cloud signaling)
    internet: {
        usePeerJS: true,
        useSTUN: true,
        useTURN: true,
        iceServers: [
            // STUN servers
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            // TURN servers
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ]
    },

    // LAN mode settings (no external servers, manual SDP exchange)
    lan: {
        usePeerJS: false,
        useSTUN: false,
        useTURN: false,
        iceServers: []  // Empty - only local candidates
    }
};

// Load saved preference from localStorage
if (typeof localStorage !== 'undefined') {
    const savedMode = localStorage.getItem('babymonitor_mode');
    if (savedMode === 'lan' || savedMode === 'internet') {
        BabyMonitorConfig.mode = savedMode;
        console.log('📡 Loaded connection mode:', savedMode);
    }
}
