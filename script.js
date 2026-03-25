// Global variables
let userData = { id: '', login: '', logout: '', audio: true, token: '' };
let flightData = Array.from({length: 20}, (_, i) => ({
    id: i + 1,
    flt: '',
    sdt: '',
    entryTS: null,
    tasks: {
        cargo: { done: false, ts: '', snz: 0, late: false },
        fzfw: { done: false, ts: '', snz: 0, late: false },
        lirpub: { done: false, ts: '', snz: 0, late: false },
        provls: { done: false, ts: '', snz: 0, late: false },
        acarsls: { done: false, ts: '', snz: 0, late: false }
    }
}));

const taskOffsets = {
    cargo: -180 * 60 * 1000, // -180 minutes
    fzfw: -160 * 60 * 1000,
    lirpub: -120 * 60 * 1000,
    provls: -25 * 60 * 1000,
    acarsls: -10 * 60 * 1000
};

const AUDIO = new (window.AudioContext || window.webkitAudioContext)();
let activeQuads = [1];
let masterUrgent = { label: "IDLE", time: "00:00:00" };

// DOM elements
const loginOverlay = document.getElementById('login-overlay');
const loginForm = document.getElementById('login-form');
const userBox = document.getElementById('user-box');
const audioBtn = document.getElementById('audio-btn');
const confirmModal = document.getElementById('confirm-modal');
const flightModal = document.getElementById('flight-modal');
const pipCanvas = document.getElementById('pip-canvas');

// Initialize
document.addEventListener('DOMContentLoaded', init);

function init() {
    loadData();
    if (userData.id) {
        loginOverlay.style.display = 'none';
        renderTables();
        updateClocks();
        setInterval(updateClocks, 1000);
        setInterval(tick, 1000);
        updatePiPCanvas();
    } else {
        loginOverlay.style.display = 'flex';
    }

    // Event listeners
    loginForm.addEventListener('submit', handleLogin);
    document.getElementById('import-btn').addEventListener('click', importData);
    document.getElementById('export-btn').addEventListener('click', exportData);
    document.getElementById('logout-btn').addEventListener('click', logout);
    audioBtn.addEventListener('click', toggleAudio);
    document.getElementById('compact-btn').addEventListener('click', toggleCompact);
    document.getElementById('pip-btn').addEventListener('click', togglePiP);

    // Quad buttons
    document.querySelectorAll('.quad-btn').forEach(btn => {
        btn.addEventListener('click', () => toggleQuad(parseInt(btn.dataset.quad)));
    });
}

function handleLogin(e) {
    e.preventDefault();
    const empId = document.getElementById('emp-id').value.trim().toUpperCase();
    const token = document.getElementById('token').value.trim().toUpperCase();

    // For beta, simple validation: token is empId + 'TOKEN' or something
    if (empId && token === generateToken(empId)) {
        userData.id = empId;
        userData.token = token;
        userData.login = new Date().toLocaleString();
        loginOverlay.style.display = 'none';
        saveData();
        renderTables();
        updateClocks();
        setInterval(updateClocks, 1000);
        setInterval(tick, 1000);
    } else {
        alert('Invalid Employee Number or Security Token. Contact IT/Admin.');
    }
}

function generateToken(empId) {
    // Simple token generation for beta
    return empId + 'SECURE';
}

function updateClocks() {
    const now = new Date();
    const timeZones = [
        { id: 'utc', tz: 'UTC' },
        { id: 'lax', tz: 'America/Los_Angeles' },
        { id: 'nyc', tz: 'America/New_York' },
        { id: 'lhr', tz: 'Europe/London' }
    ];

    timeZones.forEach(tz => {
        const time = now.toLocaleTimeString('en-GB', { timeZone: tz.tz, hour12: false });
        const date = now.toLocaleDateString('en-GB', { timeZone: tz.tz, month: 'short', day: '2-digit' }).toUpperCase();
        document.getElementById(`time-${tz.id}`).textContent = time;
        document.getElementById(`date-${tz.id}`).textContent = date;
    });

    if (userData.id) {
        userBox.innerHTML = `ID: ${userData.id}<br>Login: ${userData.login}<br>Logout: ${userData.logout || '---'}`;
    }
}

function tick() {
    const now = new Date();
    let alerts = [0, 0, 0, 0];
    let hasData = [false, false, false, false];

    flightData.forEach((f, i) => {
        if (!f.sdt || !f.entryTS) return;
        const sdt = new Date(`${new Date().toDateString()} ${f.sdt}:00`);
        const quad = Math.floor(i / 5) + 1;
        if (!activeQuads.includes(quad)) return;

        hasData[quad - 1] = true;

        Object.keys(f.tasks).forEach(task => {
            const offset = taskOffsets[task];
            const targetTime = new Date(sdt.getTime() + offset);
            const diff = now - targetTime;
            const absDiff = Math.abs(diff);
            const isLate = diff > 0;

            let alertLevel = 0;
            if (absDiff <= 10 * 60 * 1000) alertLevel = 1; // 10m
            if (absDiff <= 5 * 60 * 1000) alertLevel = 2; // 5m
            if (absDiff <= 2 * 60 * 1000) alertLevel = 3; // 2m

            if (alertLevel > alerts[quad - 1]) alerts[quad - 1] = alertLevel;

            updateUI(i, task, formatTime(diff), isLate, alertLevel, f.flt && f.sdt);
        });
    });

    if (userData.audio) handleAudio(Math.max(...alerts));
    updateNav(alerts, hasData);
    updatePiPCanvas();
}

function updateUI(idx, task, timeStr, isLate, alertLevel, active) {
    const cell = document.getElementById(`cell-${idx}-${task}`);
    const timeEl = document.getElementById(`time-${idx}-${task}`);
    const decoEl = document.getElementById(`deco-${idx}-${task}`);
    const doneBtn = document.getElementById(`done-${idx}-${task}`);

    if (!cell) return;

    timeEl.textContent = timeStr;
    timeEl.classList.toggle('late', isLate);

    let decoClass = '';
    if (alertLevel === 1) decoClass = 'caution';
    else if (alertLevel === 2) decoClass = 'warning';
    else if (alertLevel === 3) decoClass = 'critical';

    decoEl.className = `deco-line ${decoClass}`;

    doneBtn.classList.toggle('active', active);
}

function formatTime(ms) {
    const totalSeconds = Math.floor(Math.abs(ms) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const sign = ms < 0 ? '-' : '';
    return `${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function updateNav(alerts, hasData) {
    document.querySelectorAll('.quad-btn').forEach((btn, i) => {
        const quad = i + 1;
        btn.classList.toggle('caution', alerts[i] === 1 && hasData[i]);
        btn.classList.toggle('warning', alerts[i] === 2 && hasData[i]);
        btn.classList.toggle('critical', alerts[i] === 3 && hasData[i]);
    });
}

function handleAudio(level) {
    if (level === 0) return;
    // Simple beep for demo
    const oscillator = AUDIO.createOscillator();
    const gainNode = AUDIO.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(AUDIO.destination);
    oscillator.frequency.setValueAtTime(level === 1 ? 440 : level === 2 ? 900 : 900, AUDIO.currentTime);
    gainNode.gain.setValueAtTime(0.1, AUDIO.currentTime);
    oscillator.start();
    oscillator.stop(AUDIO.currentTime + 0.5);
}

function toggleQuad(quad) {
    const index = activeQuads.indexOf(quad);
    if (index > -1) {
        activeQuads.splice(index, 1);
    } else {
        activeQuads.push(quad);
    }
    renderTables();
}

function renderTables() {
    for (let q = 1; q <= 4; q++) {
        const tbody = document.getElementById(`table-body-${q}`);
        tbody.innerHTML = '';
        const start = (q - 1) * 5;
        const end = start + 5;
        for (let i = start; i < end; i++) {
            const f = flightData[i];
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${f.id}</td>
                <td><input type="text" value="${f.flt}" onchange="updateFlight(${i}, 'flt', this.value)"></td>
                <td><select onchange="updateSDT(${i}, this.value)">${generateSDTOptions(f.sdt)}</select></td>
                <td class="timer-cell" id="cell-${i}-cargo">
                    <div class="timer-display" id="time-${i}-cargo">00:00:00</div>
                    <div class="deco-line" id="deco-${i}-cargo"></div>
                    <button class="btn-done" id="done-${i}-cargo" onclick="markDone(${i}, 'cargo')">Done</button>
                </td>
                <td class="timer-cell" id="cell-${i}-fzfw">
                    <div class="timer-display" id="time-${i}-fzfw">00:00:00</div>
                    <div class="deco-line" id="deco-${i}-fzfw"></div>
                    <button class="btn-done" id="done-${i}-fzfw" onclick="markDone(${i}, 'fzfw')">Done</button>
                </td>
                <td class="timer-cell" id="cell-${i}-lirpub">
                    <div class="timer-display" id="time-${i}-lirpub">00:00:00</div>
                    <div class="deco-line" id="deco-${i}-lirpub"></div>
                    <button class="btn-done" id="done-${i}-lirpub" onclick="markDone(${i}, 'lirpub')">Done</button>
                </td>
                <td class="timer-cell" id="cell-${i}-provls">
                    <div class="timer-display" id="time-${i}-provls">00:00:00</div>
                    <div class="deco-line" id="deco-${i}-provls"></div>
                    <button class="btn-done" id="done-${i}-provls" onclick="markDone(${i}, 'provls')">Done</button>
                </td>
                <td class="timer-cell" id="cell-${i}-acarsls">
                    <div class="timer-display" id="time-${i}-acarsls">00:00:00</div>
                    <div class="deco-line" id="deco-${i}-acarsls"></div>
                    <button class="btn-done" id="done-${i}-acarsls" onclick="markDone(${i}, 'acarsls')">Done</button>
                </td>
                <td><button class="btn-reset" onclick="resetRow(${i})">Reset</button></td>
            `;
            tbody.appendChild(row);
        }
        document.getElementById(`quad-${q}`).classList.toggle('visible', activeQuads.includes(q));
    }
}

function generateSDTOptions(selected) {
    let options = '<option value="">SET</option>';
    for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 5) {
            const time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
            options += `<option value="${time}" ${selected === time ? 'selected' : ''}>${time}</option>`;
        }
    }
    return options;
}

function updateFlight(i, field, value) {
    flightData[i][field] = value.toUpperCase();
    saveData();
}

function updateSDT(i, value) {
    flightData[i].sdt = value;
    flightData[i].entryTS = new Date();
    saveData();
}

function markDone(i, task) {
    const f = flightData[i];
    if (!f.flt || !f.sdt) return;
    const now = new Date().toLocaleString();
    document.getElementById('modal-body').textContent = `Confirm completion of ${task.toUpperCase()} for flight ${f.flt} at ${now}`;
    confirmModal.style.display = 'flex';
    document.getElementById('confirm-btn').onclick = () => {
        f.tasks[task].done = true;
        f.tasks[task].ts = now;
        saveData();
        closeModal();
        renderTables();
    };
}

function resetRow(i) {
    if (confirm('Purge row?')) {
        flightData[i].flt = '';
        flightData[i].sdt = '';
        flightData[i].entryTS = null;
        Object.keys(flightData[i].tasks).forEach(t => {
            flightData[i].tasks[t] = { done: false, ts: '', snz: 0, late: false };
        });
        saveData();
        renderTables();
    }
}

function toggleAudio() {
    userData.audio = !userData.audio;
    audioBtn.textContent = `Audio: ${userData.audio ? 'ON' : 'OFF'}`;
    audioBtn.classList.toggle('active', userData.audio);
    saveData();
}

function toggleCompact() {
    document.body.classList.toggle('compact-mode');
}

async function togglePiP() {
    const v = document.getElementById('pip-video');
    try {
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
        } else {
            await v.requestPictureInPicture();
        }
    } catch (err) {
        console.error(err);
    }
}

function updatePiPCanvas() {
    const ctx = pipCanvas.getContext('2d');
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, 300, 150);
    ctx.fillStyle = '#58a6ff';
    ctx.font = 'bold 16px Inter';
    ctx.fillText('V.E.C.T.O.R. v55.0', 10, 30);
    ctx.fillStyle = '#f0f6fc';
    ctx.font = '14px monospace';
    ctx.fillText(masterUrgent.label, 10, 70);
    ctx.fillStyle = '#d29922';
    ctx.font = 'bold 28px monospace';
    ctx.fillText(masterUrgent.time, 10, 115);
}

function closeModal() {
    confirmModal.style.display = 'none';
    flightModal.style.display = 'none';
}

function importData() {
    const input = prompt('Paste migration data:');
    if (input) {
        try {
            const data = JSON.parse(input);
            userData = data.userData;
            flightData = data.flightData;
            saveData();
            location.reload();
        } catch (e) {
            alert('Invalid data');
        }
    }
}

function exportData() {
    const data = JSON.stringify({ userData, flightData });
    navigator.clipboard.writeText(data).then(() => alert('Data copied to clipboard'));
}

function logout() {
    userData.logout = new Date().toLocaleString();
    localStorage.removeItem('VECTOR_V55_CANON');
    location.reload();
}

function saveData() {
    localStorage.setItem('VECTOR_V55_CANON', JSON.stringify({ userData, flightData }));
}

function loadData() {
    const data = localStorage.getItem('VECTOR_V55_CANON');
    if (data) {
        const parsed = JSON.parse(data);
        userData = parsed.userData;
        flightData = parsed.flightData;
    }
}