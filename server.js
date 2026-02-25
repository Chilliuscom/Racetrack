require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// --- Keskkonnamuutujate valideerimine ---
const RECEPTIONIST_KEY = process.env.RECEPTIONIST_KEY;
const OBSERVER_KEY = process.env.OBSERVER_KEY;
const SAFETY_KEY = process.env.SAFETY_KEY;

if (!RECEPTIONIST_KEY || !OBSERVER_KEY || !SAFETY_KEY) {
  console.error('\n VIGA: Vajalikud keskkonnamuutujad puuduvad.\n');
  console.error(' Enne serveri käivitamist sea järgmised keskkonnamuutujad:\n');
  console.error('   export RECEPTIONIST_KEY=<sinu-võti>');
  console.error('   export OBSERVER_KEY=<sinu-võti>');
  console.error('   export SAFETY_KEY=<sinu-võti>');
  console.error('\n Seejärel käivita: npm start\n');
  process.exit(1);
}

// --- Arendusrežiimi tuvastamine ---
const DEV_MODE = process.env.DEV_MODE === 'true';
const RACE_DURATION_MS = DEV_MODE ? 60 * 1000 : 10 * 60 * 1000;

if (DEV_MODE) {
  console.log('Töötab ARENDUSREŽIIMIS — võistluse taimer 1 minut');
} else {
  console.log('Töötab TOOTMISREŽIIMIS — võistluse taimer 10 minutit');
}

// --- Express + Socket.IO seadistamine ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Iga liidese marsruutimine (enne staatilist teenindajat, et vältida 301 ümbersuunamisi)
const interfaces = [
  'front-desk', 'race-control', 'lap-line-tracker',
  'leader-board', 'next-race', 'race-countdown', 'race-flags'
];

interfaces.forEach(name => {
  app.get(`/${name}`, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', name, 'index.html'));
  });
});

// Juurteekond suunab edetabelile
app.get('/', (req, res) => {
  res.redirect('/leader-board');
});

app.use(express.static(path.join(__dirname, 'public')));

// --- Mälupõhine olek ---
const state = {
  sessions: [],            // Kõik võistlussessioonid
  lastFinishedSession: null // Viimane lõppenud sessioon (kuvamiseks edetabelis)
};

let raceTimerInterval = null;  // Taimeri intervalli viide
let raceTimeRemaining = 0;     // Järelejäänud aeg millisekundites
let sessionIdCounter = 0;      // Sessiooni ID loendur

// Genereerib unikaalse sessiooni ID
function generateId() {
  return String(++sessionIdCounter);
}

// --- Abifunktsioonid ---

// Leiab aktiivse (käimasoleva) sessiooni
function getActiveSession() {
  return state.sessions.find(s => s.status === 'active');
}

// Leiab järgmise ootel sessiooni
function getNextUpcomingSession() {
  return state.sessions.find(s => s.status === 'upcoming');
}

// Leiab järgmise vaba autonumbri (1-8)
function getNextAvailableCarNumber(session) {
  const usedNumbers = session.drivers.map(d => d.carNumber);
  for (let i = 1; i <= 8; i++) {
    if (!usedNumbers.includes(i)) return i;
  }
  return null;
}

// Saadab hetkeoleku kõigile ühendusetele klientidele
function broadcastState() {
  const active = getActiveSession();
  io.emit('state-update', {
    sessions: state.sessions,
    lastFinishedSession: state.lastFinishedSession,
    raceTimeRemaining: active ? raceTimeRemaining : null
  });
}

// Käivitab võistluse pöördloenduse taimeri
function startRaceTimer(session) {
  raceTimeRemaining = RACE_DURATION_MS;

  if (raceTimerInterval) {
    clearInterval(raceTimerInterval);
  }

  // Iga sekundi järel vähenda aega ja teavita kliente
  raceTimerInterval = setInterval(() => {
    raceTimeRemaining -= 1000;

    if (raceTimeRemaining <= 0) {
      raceTimeRemaining = 0;
      clearInterval(raceTimerInterval);
      raceTimerInterval = null;

      // Automaatne finiš — aeg sai läbi
      session.raceMode = 'finish';
      broadcastState();
      return;
    }

    io.emit('timer-tick', { remaining: raceTimeRemaining });
  }, 1000);
}

// Peatab võistluse taimeri
function stopRaceTimer() {
  if (raceTimerInterval) {
    clearInterval(raceTimerInterval);
    raceTimerInterval = null;
  }
}

// --- Autentimise võtmete kaart ---
const AUTH_KEYS = {
  'front-desk': RECEPTIONIST_KEY,
  'race-control': SAFETY_KEY,
  'lap-line-tracker': OBSERVER_KEY
};

// --- Socket.IO ühenduste haldamine ---
io.on('connection', (socket) => {
  // Saada hetkeolekut uuele ühendusele kohe
  const active = getActiveSession();
  socket.emit('state-update', {
    sessions: state.sessions,
    lastFinishedSession: state.lastFinishedSession,
    raceTimeRemaining: active ? raceTimeRemaining : null
  });

  // --- Autentimine ---
  socket.on('authenticate', ({ interface: iface, key }) => {
    const expectedKey = AUTH_KEYS[iface];
    if (!expectedKey) {
      socket.emit('auth-failure', { message: 'Tundmatu liides.' });
      return;
    }

    // Vale võtme korral oota 500ms enne vastamist (turvameede)
    if (key !== expectedKey) {
      setTimeout(() => {
        socket.emit('auth-failure', { message: 'Vale pääsuvõti.' });
      }, 500);
      return;
    }

    // Õige võti — lisa klient liidese ruumi
    socket.join(iface);
    socket.data.authenticated = iface;
    socket.emit('auth-success', { interface: iface });
  });

  // Kontrollib, kas klient on autenditud antud liidese jaoks
  function requireAuth(iface) {
    return socket.data.authenticated === iface;
  }

  // --- Registratuuri sündmused (front-desk) ---

  // Uue sessiooni loomine
  socket.on('create-session', () => {
    if (!requireAuth('front-desk')) return;

    const session = {
      id: generateId(),
      drivers: [],
      status: 'upcoming',   // Olek: ootel
      raceMode: null,        // Võistlusrežiim puudub
      startTime: null,
      laps: {}               // Ringiandmed autonumbrite kaupa
    };
    state.sessions.push(session);
    broadcastState();
  });

  // Sessiooni kustutamine (ainult ootel sessioonid)
  socket.on('delete-session', ({ sessionId }) => {
    if (!requireAuth('front-desk')) return;

    const idx = state.sessions.findIndex(s => s.id === sessionId && s.status === 'upcoming');
    if (idx !== -1) {
      state.sessions.splice(idx, 1);
      broadcastState();
    }
  });

  // Sõitja lisamine sessiooni
  socket.on('add-driver', ({ sessionId, name }) => {
    if (!requireAuth('front-desk')) return;

    const session = state.sessions.find(s => s.id === sessionId && s.status === 'upcoming');
    if (!session) return;

    // Maksimaalselt 8 sõitjat sessiooni kohta
    if (session.drivers.length >= 8) return;

    // Nimi peab olema unikaalne sessiooni piires
    const trimmedName = (name || '').trim();
    if (!trimmedName) return;
    if (session.drivers.some(d => d.name.toLowerCase() === trimmedName.toLowerCase())) return;

    // Määra järgmine vaba autonumber
    const carNumber = getNextAvailableCarNumber(session);
    if (carNumber === null) return;

    session.drivers.push({ name: trimmedName, carNumber });

    // Initsialiseeri ringiandmed sellele autole
    session.laps[carNumber] = {
      count: 0,            // Ringide arv
      fastestLap: null,    // Kiireim ringiaeg (ms)
      lastCrossing: null   // Viimase ülesõidu ajatempel
    };

    broadcastState();
  });

  // Sõitja eemaldamine sessioonist
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

  // Sõitja nime muutmine
  socket.on('edit-driver', ({ sessionId, carNumber, name }) => {
    if (!requireAuth('front-desk')) return;

    const session = state.sessions.find(s => s.id === sessionId && s.status === 'upcoming');
    if (!session) return;

    const trimmedName = (name || '').trim();
    if (!trimmedName) return;

    // Nimi peab olema unikaalne (v.a. praegune sõitja ise)
    if (session.drivers.some(d => d.carNumber !== carNumber && d.name.toLowerCase() === trimmedName.toLowerCase())) return;

    const driver = session.drivers.find(d => d.carNumber === carNumber);
    if (driver) {
      driver.name = trimmedName;
      broadcastState();
    }
  });

  // --- Ohutusametniku sündmused (race-control) ---

  // Võistluse alustamine
  socket.on('start-race', () => {
    if (!requireAuth('race-control')) return;

    // Ei saa alustada, kui võistlus juba käib
    if (getActiveSession()) return;

    const session = getNextUpcomingSession();
    if (!session) return;

    // Vaja vähemalt 1 sõitjat
    if (session.drivers.length === 0) return;

    session.status = 'active';
    session.raceMode = 'safe';      // Alustab ohutu režiimiga (roheline lipp)
    session.startTime = Date.now();

    startRaceTimer(session);
    broadcastState();
  });

  // Võistlusrežiimi muutmine
  socket.on('set-mode', ({ mode }) => {
    if (!requireAuth('race-control')) return;

    const session = getActiveSession();
    if (!session) return;

    // Kui juba finišis, ei saa režiimi muuta
    if (session.raceMode === 'finish') return;

    const validModes = ['safe', 'hazard', 'danger', 'finish'];
    if (!validModes.includes(mode)) return;

    session.raceMode = mode;

    // Käsitsi finiši korral peata taimer
    if (mode === 'finish') {
      stopRaceTimer();
      raceTimeRemaining = 0;
    }

    broadcastState();
  });

  // Sessiooni lõpetamine (pärast finišit)
  socket.on('end-session', () => {
    if (!requireAuth('race-control')) return;

    const session = getActiveSession();
    if (!session) return;

    // Saab lõpetada ainult finiši režiimis
    if (session.raceMode !== 'finish') return;

    stopRaceTimer();

    session.status = 'ended';
    session.raceMode = 'danger';  // Punane lipp — rada pole ohutu

    // Salvesta viimane lõppenud sessioon edetabeli kuvamiseks
    state.lastFinishedSession = JSON.parse(JSON.stringify(session));

    // Eemalda lõppenud sessioon nimekirjast
    const idx = state.sessions.findIndex(s => s.id === session.id);
    if (idx !== -1) {
      state.sessions.splice(idx, 1);
    }

    broadcastState();
  });

  // --- Ringivaatleja sündmused (lap-line-tracker) ---

  // Ringi salvestamine (auto ületas ringjoone)
  socket.on('record-lap', ({ carNumber }) => {
    if (!requireAuth('lap-line-tracker')) return;

    const session = getActiveSession();
    if (!session) return;

    // Ringide salvestamine on lubatud ohutu, ohu ja finiši režiimis
    // Punase (danger) režiimis ei saa salvestada
    if (!session.raceMode || session.raceMode === 'danger') return;

    const lapData = session.laps[carNumber];
    if (!lapData) return;

    const now = Date.now();

    // Kui eelmine ülesõit on olemas, arvuta ringiaeg
    if (lapData.lastCrossing !== null) {
      const lapTime = now - lapData.lastCrossing;
      // Uuenda parimat ringi, kui see on kiirem
      if (lapData.fastestLap === null || lapTime < lapData.fastestLap) {
        lapData.fastestLap = lapTime;
      }
    }

    lapData.count++;              // Suurenda ringide arvu
    lapData.lastCrossing = now;   // Salvesta ülesõidu aeg

    broadcastState();
  });
});

// --- Serveri käivitamine ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n Beachside Racetrack server töötab aadressil http://localhost:${PORT}\n`);
  console.log(' Liidesed:');
  interfaces.forEach(name => {
    console.log(`   http://localhost:${PORT}/${name}`);
  });
  console.log('');
});
