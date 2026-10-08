/* =========================================================
   Habibi Sparks – script.js (Live Firebase Realtime Database)
   ========================================================= */

const $ = (id) => document.getElementById(id);

// Firebase Configuratie
const firebaseConfig = {
  apiKey: "AIzaSyChU6Lpiyb6jpz0Znl9fT1MatLIrdsdCf8",
  authDomain: "habibi-sparks.firebaseapp.com",
  databaseURL: "https://habibi-sparks-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "habibi-sparks",
  storageBucket: "habibi-sparks.firebasestorage.app",
  messagingSenderId: "250714297147",
  appId: "1:250714297147:web:05a57be269ecdc06465d1e"
};

// Initialiseer Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

const SAVE_KEY = "habibiSparks.save.v1";
const SAVE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const BACK_SCREENS = ["screen-lobby", "screen-question", "screen-wait", "screen-reveal"];

const state = {
  roomId: null,
  me: "A",
  nameA: "Jij",
  nameB: "Partner",
  questions: [],
  categoryMeta: null,
  index: 0,
  chosen: null,
  matches: 0,
  phase: "idle",          // idle | question | reveal | done
  lastReveal: null,
  timers: []
};

function later(fn, ms) { state.timers.push(setTimeout(fn, ms)); }
function clearTimers() { state.timers.forEach(clearTimeout); state.timers = []; }

/* ---------- Geluid & Welkomst ---------- */
const WELCOME_FILE = "welkom.mp3";
const WELCOME_AR = "السلام عليكم ورحمة الله";
const WELCOME_AR_PHONETIC = "Assalaam oe aleikoem";
const WELCOME_NL =
  "En welkom bij Habibi Sparks. Neem samen even de tijd. " +
  "Beantwoord de vragen eerlijk, vier wat jullie gemeen hebben, " +
  "en praat daarna door met de gesprekskaarten. Bismillaah, laten we beginnen.";
const MUSIC_FILE = "nasheed.mp3";
const MUSIC_VOLUME = 0.28;
const MUSIC_DUCKED = 0.08;

const sound = { on: false, music: null, musicOk: true, utter: null, welcomeAudio: null, welcomeOk: true };
const hasSpeech = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

function getMusic() {
  if (sound.music) return sound.music;
  const a = new Audio(MUSIC_FILE);
  a.loop = true;
  a.preload = "auto";
  a.volume = MUSIC_VOLUME;
  a.addEventListener("error", () => { sound.musicOk = false; });
  sound.music = a;
  return a;
}
function startMusic() { if (sound.musicOk) getMusic().play().catch(() => {}); }
function stopMusic() { if (sound.music) sound.music.pause(); }
function duckMusic(on) { if (sound.music) sound.music.volume = on ? MUSIC_DUCKED : MUSIC_VOLUME; }

const FEMALE_HINT = /colette|fenna|claire|ellen|google nederlands|female|vrouw/i;
const MALE_HINT = /maarten|xander|frank|\bmale\b|\bman\b|david|mark/i;

function pickDutchVoice() {
  const nl = speechSynthesis.getVoices().filter(v => /^nl/i.test(v.lang));
  return nl.find(v => FEMALE_HINT.test(v.name) && !MALE_HINT.test(v.name)) || nl.find(v => !MALE_HINT.test(v.name)) || nl[0] || null;
}
function pickArabicVoice() {
  const ar = speechSynthesis.getVoices().filter(v => /^ar/i.test(v.lang));
  return ar.find(v => FEMALE_HINT.test(v.name) && !MALE_HINT.test(v.name)) || ar[0] || null;
}
if (hasSpeech) speechSynthesis.getVoices();

function stopVoice() {
  sound.utter = null;
  if (sound.welcomeAudio) { sound.welcomeAudio.pause(); sound.welcomeAudio = null; }
  if (hasSpeech) speechSynthesis.cancel();
  duckMusic(false);
}

function speakWelcome() {
  if (!hasSpeech) return false;
  stopVoice();
  const arVoice = pickArabicVoice();
  const nlVoice = pickDutchVoice();
  const parts = [
    arVoice ? { text: WELCOME_AR, lang: "ar-SA", voice: arVoice, rate: 0.8 } : { text: WELCOME_AR_PHONETIC, lang: "nl-NL", voice: nlVoice, rate: 0.85 },
    { text: WELCOME_NL, lang: "nl-NL", voice: nlVoice, rate: 0.92 }
  ];
  const token = {};
  sound.utter = token;
  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p.text);
    u.lang = p.lang; u.rate = p.rate;
    if (p.voice) u.voice = p.voice;
    if (i === 0) u.onstart = () => { if (sound.utter === token) duckMusic(true); };
    if (i === parts.length - 1) {
      u.onend = u.onerror = () => { if (sound.utter === token) { sound.utter = null; duckMusic(false); } };
    }
    speechSynthesis.speak(u);
  });
  return true;
}

function playWelcome() {
  stopVoice();
  if (!sound.welcomeOk) { speakWelcome(); return; }
  const a = new Audio(WELCOME_FILE);
  sound.welcomeAudio = a;
  a.addEventListener("playing", () => duckMusic(true));
  a.addEventListener("ended", () => { sound.welcomeAudio = null; duckMusic(false); });
  a.play().catch(() => {
    if (sound.welcomeAudio !== a) return;
    sound.welcomeAudio = null; sound.welcomeOk = false;
    speakWelcome();
  });
}

function setSound(on) {
  sound.on = on;
  const b = $("btnSound");
  b.textContent = on ? "🔊" : "🔇";
  b.setAttribute("aria-pressed", String(on));
  if (on) startMusic(); else { stopMusic(); stopVoice(); }
}

$("btnSound").addEventListener("click", () => setSound(!sound.on));
$("btnWelcome").addEventListener("click", () => { setSound(true); playWelcome(); });

/* ---------- Schermen ---------- */
function show(id) {
  if (id !== "screen-start") stopVoice();
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");
  $("btnBack").hidden = !BACK_SCREENS.includes(id);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------- LocalStorage Opslaan/Hervatten ---------- */
function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if ((s.phase !== "question" && s.phase !== "reveal") || typeof s.index !== "number") return null;
    if (Date.now() - (s.savedAt || 0) > SAVE_MAX_AGE_MS) return null;
    return s;
  } catch (e) { return null; }
}

function writeSave() {
  if (state.phase !== "question" && state.phase !== "reveal") return;
  const q = state.questions[state.index];
  if (!q) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1, savedAt: Date.now(), phase: state.phase, roomId: state.roomId,
      me: state.me, nameA: state.nameA, nameB: state.nameB, index: state.index,
      total: state.questions.length, matches: state.matches, category: q.category || "",
      questionId: q.id || null, chosenId: state.chosen ? state.chosen.id : null, lastReveal: state.lastReveal
    }));
  } catch (e) {}
}

function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

function refreshResumeBox() {
  const s = readSave();
  const box = $("resumeBox");
  if (!s) { box.hidden = true; return; }
  $("btnResume").textContent = `Vervolg laatste spel · stap ${s.index + 1} van ${s.total}`;
  $("resumeMeta").textContent = `${s.category} · opgeslagen ${new Date(s.savedAt).toLocaleTimeString("nl-NL", {hour: "2-digit", minute:"2-digit"})}`;
  $("resumeBarFill").style.
