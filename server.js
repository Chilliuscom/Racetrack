require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// --- Environment variable validation ---
const RECEPTIONIST_KEY = process.env.RECEPTIONIST_KEY;
const OBSERVER_KEY = process.env.OBSERVER_KEY;
const SAFETY_KEY = process.env.SAFETY_KEY;

if (!RECEPTIONIST_KEY || !OBSERVER_KEY || !SAFETY_KEY) {
  console.error('\n ERROR: Missing required environment variables.\n');
  console.error(' You must set the following environment variables before starting the server:\n');
  console.error('   export RECEPTIONIST_KEY=<your-key>');
  console.error('   export OBSERVER_KEY=<your-key>');
  console.error('   export SAFETY_KEY=<your-key>');
  console.error('\n Then run: npm start\n');
  process.exit(1);
}

// --- Dev mode detection ---
const DEV_MODE = process.env.DEV_MODE === 'true';
const RACE_DURATION_MS = DEV_MODE ? 60 * 1000 : 10 * 60 * 1000;

if (DEV_MODE) {
  console.log('Running in DEV MODE — race timer set to 1 minute');
} else {
  console.log('Running in PRODUCTION MODE — race timer set to 10 minutes');
}

// --- Express + Socket.IO setup ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Route each interface (before static middleware to avoid 301 redirects)
const interfaces = [
  'front-desk', 'race-control', 'lap-line-tracker',
  'leader-board', 'next-race', 'race-countdown', 'race-flags'
];

interfaces.forEach(name => {
  app.get(`/${name}`, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', name, 'index.html'));
  });
});

app.get('/', (req, res) => {
  res.redirect('/leader-board');
});

app.use(express.static(path.join(__dirname, 'public')));

// --- In-memory state ---
const state = {
  sessions: [],
  lastFinishedSession: null
};

let raceTimerInterval = null;
let raceTimeRemaining = 0; // ms
let sessionIdCounter = 0;

function generateId() {
  return String(++sessionIdCounter);
}

// --- Helper functions ---

function getActiveSession() {
  return state.sessions.find(s => s.status === 'active');
}

function getNextUpcomingSession() {
  return state.sessions.find(s => s.status === 'upcoming');
}

function getNextAvailableCarNumber(session) {
  const usedNumbers = session.drivers.map(d => d.carNumber);
  for (let i = 1; i <= 8; i++) {
    if (!usedNumbers.includes(i)) return i;
  }
  return null;
}

function broadcastState() {
  const active = getActiveSession();
  io.emit('state-update', {
    sessions: state.sessions,
    lastFinishedSession: state.lastFinishedSession,
    raceTimeRemaining: active ? raceTimeRemaining : null
  });
}

function startRaceTimer(session) {
  raceTimeRemaining = RACE_DURATION_MS;

  if (raceTimerInterval) {
    clearInterval(raceTimerInterval);
  }

  raceTimerInterval = setInterval(() => {
    raceTimeRemaining -= 1000;

    if (raceTimeRemaining <= 0) {
      raceTimeRemaining = 0;
      clearInterval(raceTimerInterval);
      raceTimerInterval = null;

      // Auto-finish
      session.raceMode = 'finish';
      broadcastState();
      return;
    }

    io.emit('timer-tick', { remaining: raceTimeRemaining });
  }, 1000);
}

function stopRaceTimer() {
  if (raceTimerInterval) {
    clearInterval(raceTimerInterval);
    raceTimerInterval = null;
  }
}

// --- Authentication keys map ---
const AUTH_KEYS = {
  'front-desk': RECEPTIONIST_KEY,
  'race-control': SAFETY_KEY,
  'lap-line-tracker': OBSERVER_KEY
};

// --- Socket.IO connection handling ---
io.on('connection', (socket) => {
  // Send current state to new connections immediately
  const active = getActiveSession();
  socket.emit('state-update', {
    sessions: state.sessions,
    lastFinishedSession: state.lastFinishedSession,
    raceTimeRemaining: active ? raceTimeRemaining : null
  });

  // --- Authentication ---
  socket.on('authenticate', ({ interface: iface, key }) => {
    const expectedKey = AUTH_KEYS[iface];
    if (!expectedKey) {
      socket.emit('auth-failure', { message: 'Tundmatu liides.' });
      return;
    }

    if (key !== expectedKey) {
      setTimeout(() => {
        socket.emit('auth-failure', { message: 'Vale pääsuvõti.' });
      }, 500);
      return;
    }

    socket.join(iface);
    socket.data.authenticated = iface;
    socket.emit('auth-success', { interface: iface });
  });

  // --- Middleware check ---
  function requireAuth(iface) {
    return socket.data.authenticated === iface;
  }

  // --- Receptionist events (front-desk) ---

  socket.on('create-session', () => {
    if (!requireAuth('front-desk')) return;

    const session = {
      id: generateId(),
      drivers: [],
      status: 'upcoming',
      raceMode: null,
      startTime: null,
      laps: {}
    };
    state.sessions.push(session);
    broadcastState();
  });

  socket.on('delete-session', ({ sessionId }) => {
    if (!requireAuth('front-desk')) return;

    const idx = state.sessions.findIndex(s => s.id === sessionId && s.status === 'upcoming');
    if (idx !== -1) {
      state.sessions.splice(idx, 1);
      broadcastState();
    }
  });

  socket.on('add-driver', ({ sessionId, name }) => {
    if (!requireAuth('front-desk')) return;

    const session = state.sessions.find(s => s.id === sessionId && s.status === 'upcoming');
    if (!session) return;

    // Max 8 drivers
    if (session.drivers.length >= 8) return;

    // Name must be unique within session
    const trimmedName = (name || '').trim();
    if (!trimmedName) return;
    if (session.drivers.some(d => d.name.toLowerCase() === trimmedName.toLowerCase())) return;

    const carNumber = getNextAvailableCarNumber(session);
    if (carNumber === null) return;

    session.drivers.push({ name: trimmedName, carNumber });

    // Initialize lap data
    session.laps[carNumber] = {
      count: 0,
      fastestLap: null,
      lastCrossing: null
    };

    broadcastState();
  });

  socket.on('remove-driver', ({ sessionId, carNumber }) => {
    if (!requireAuth('front-desk')) return;

    const session = state.sessions.find(s => s.id === sessionId && s.status === 'upcoming');
    if (!session) return;

    const idx = session.drivers.findIndex(d => d.carNumber === carNumber);
    if (idx !== -1) {
      session.drivers.splice(idx, 1);
      delete session.laps[carNumber];
      broadcastState();
    }
  });

  socket.on('edit-driver', ({ sessionId, carNumber, name }) => {
    if (!requireAuth('front-desk')) return;

    const session = state.sessions.find(s => s.id === sessionId && s.status === 'upcoming');
    if (!session) return;

    const trimmedName = (name || '').trim();
    if (!trimmedName) return;

    // Name must be unique within session (excluding current driver)
    if (session.drivers.some(d => d.carNumber !== carNumber && d.name.toLowerCase() === trimmedName.toLowerCase())) return;

    const driver = session.drivers.find(d => d.carNumber === carNumber);
    if (driver) {
      driver.name = trimmedName;
      broadcastState();
    }
  });

  // --- Safety Official events (race-control) ---

  socket.on('start-race', () => {
    if (!requireAuth('race-control')) return;

    // Cannot start if there's already an active race
    if (getActiveSession()) return;

    const session = getNextUpcomingSession();
    if (!session) return;

    // Need at least 1 driver
    if (session.drivers.length === 0) return;

    session.status = 'active';
    session.raceMode = 'safe';
    session.startTime = Date.now();

    startRaceTimer(session);
    broadcastState();
  });

  socket.on('set-mode', ({ mode }) => {
    if (!requireAuth('race-control')) return;

    const session = getActiveSession();
    if (!session) return;

    // If already finished, cannot change mode
    if (session.raceMode === 'finish') return;

    const validModes = ['safe', 'hazard', 'danger', 'finish'];
    if (!validModes.includes(mode)) return;

    session.raceMode = mode;

    // If manually setting to finish, stop timer
    if (mode === 'finish') {
      stopRaceTimer();
      raceTimeRemaining = 0;
    }

    broadcastState();
  });

  socket.on('end-session', () => {
    if (!requireAuth('race-control')) return;

    const session = getActiveSession();
    if (!session) return;

    // Can only end when in finish mode
    if (session.raceMode !== 'finish') return;

    stopRaceTimer();

    session.status = 'ended';
    session.raceMode = 'danger';

    // Store as last finished session for display
    state.lastFinishedSession = JSON.parse(JSON.stringify(session));

    // Remove the ended session from the sessions list
    const idx = state.sessions.findIndex(s => s.id === session.id);
    if (idx !== -1) {
      state.sessions.splice(idx, 1);
    }

    broadcastState();
  });

  // --- Lap-line Observer events (lap-line-tracker) ---

  socket.on('record-lap', ({ carNumber }) => {
    if (!requireAuth('lap-line-tracker')) return;

    const session = getActiveSession();
    if (!session) return;

    // Can record laps in safe, hazard, or finish modes (not when ended)
    // The spec says cars can still cross in finish mode
    if (!session.raceMode || session.raceMode === 'danger') return;

    const lapData = session.laps[carNumber];
    if (!lapData) return;

    const now = Date.now();

    if (lapData.lastCrossing !== null) {
      const lapTime = now - lapData.lastCrossing;
      if (lapData.fastestLap === null || lapTime < lapData.fastestLap) {
        lapData.fastestLap = lapTime;
      }
    }

    lapData.count++;
    lapData.lastCrossing = now;

    broadcastState();
  });
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n Beachside Racetrack server running on http://localhost:${PORT}\n`);
  console.log(' Interfaces:');
  interfaces.forEach(name => {
    console.log(`   http://localhost:${PORT}/${name}`);
  });
  console.log('');
});
