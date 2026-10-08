/* =========================================================
   Habibi Sparks – script.js (Met werkend geluid + Realtime Firebase)
   ========================================================= */

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

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

const $ = (id) => document.getElementById(id);

const SAVE_KEY = "habibiSparks.save.v1";
const SAVE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;      // opgeslagen spel vervalt na 30 dagen
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
  lastReveal: null,       // { mineId, theirsId } van de huidige vraag
  timers: []
};

/* ---------- Timers ---------- */
function later(fn, ms) { state.timers.push(setTimeout(fn, ms)); }
function clearTimers() { state.timers.forEach(clearTimeout); state.timers = []; }

/* =========================================================
   GELUID: gesproken welkomst + zachte achtergrond-nasheed
   ========================================================= */
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
  a.addEventListener("error", () => {
    sound.musicOk = false;
    console.warn(MUSIC_FILE + " niet gevonden of niet af te spelen");
  });
  sound.music = a;
  return a;
}
function startMusic() {
  if (!sound.musicOk) return;
  const p = getMusic().play();
  if (p && p.catch) p.catch((e) => console.warn("Muziek geblokkeerd", e));
}
function stopMusic() { if (sound.music) sound.music.pause(); }
function duckMusic(on) { if (sound.music) sound.music.volume = on ? MUSIC_DUCKED : MUSIC_VOLUME; }

const FEMALE_HINT = /colette|fenna|claire|ellen|google nederlands|female|vrouw/i;
const MALE_HINT = /maarten|xander|frank|\bmale\b|\bman\b|david|mark/i;

function pickDutchVoice() {
  const nl = speechSynthesis.getVoices().filter(v => /^nl/i.test(v.lang));
  return nl.find(v => FEMALE_HINT.test(v.name) && !MALE_HINT.test(v.name))
      || nl.find(v => !MALE_HINT.test(v.name))
      || nl[0] || null;
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
    arVoice
      ? { text: WELCOME_AR, lang: "ar-SA", voice: arVoice, rate: 0.8 }
      : { text: WELCOME_AR_PHONETIC, lang: "nl-NL", voice: nlVoice, rate: 0.85 },
    { text: WELCOME_NL, lang: "nl-NL", voice: nlVoice, rate: 0.92 }
  ];
  const token = {};
  sound.utter = token;
  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p.text);
    u.lang = p.lang;
    u.rate = p.rate;
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
    sound.welcomeAudio = null;
    sound.welcomeOk = false;
    speakWelcome();
  });
}

function setSound(on) {
  sound.on = on;
  const b = $("btnSound");
  b.textContent = on ? "🔊" : "🔇";
  b.setAttribute("aria-pressed", String(on));
  b.setAttribute("aria-label", on ? "Geluid uit" : "Geluid aan");
  if (on) startMusic(); else { stopMusic(); stopVoice(); }
}

$("btnSound").addEventListener("click", () => setSound(!sound.on));
$("btnWelcome").addEventListener("click", () => {
  setSound(true);
  playWelcome();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") { stopMusic(); stopVoice(); }
  else if (sound.on) startMusic();
});

/* ---------- Schermen ---------- */
function show(id) {
  if (id !== "screen-start") stopVoice();
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");
  $("btnBack").hidden = !BACK_SCREENS.includes(id);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* =========================================================
   VOORTGANG OPSLAAN & HERVATTEN (localStorage)
   ========================================================= */
function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    const playing = s && (s.phase === "question" || s.phase === "reveal");
    if (!playing || typeof s.index !== "number" || !s.total || s.index >= s.total) return null;
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
      v: 1,
      savedAt: Date.now(),
      phase: state.phase,
      roomId: state.roomId,
      me: state.me,
      nameA: state.nameA,
      nameB: state.nameB,
      index: state.index,
      total: state.questions.length,
      matches: state.matches,
      categoryId: q.categoryId || null,
      category: q.category || "",
      questionId: q.id || null,
      chosenId: state.chosen ? state.chosen.id : null,
      lastReveal: state.lastReveal
    }));
  } catch (e) {}
}

function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
}

function refreshResumeBox() {
  const s = readSave();
  const box = $("resumeBox");
  if (!s) { box.hidden = true; return; }
  const step = s.index + 1;
  $("btnResume").textContent = `Vervolg laatste spel · stap ${step} van ${s.total}`;
  const when = new Date(s.savedAt).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const matchTxt = s.matches === 1 ? "1 match" : `${s.matches} matches`;
  $("resumeMeta").textContent = `${s.category} · ${matchTxt} · opgeslagen ${when}`;
  $("resumeBarFill").style.width = Math.round((s.index / s.total) * 100) + "%";
  box.hidden = false;
}

async function resumeGame() {
  const s = readSave();
  if (!s) { refreshResumeBox(); return; }
  await loadQuestions();

  let idx = s.questionId ? state.questions.findIndex(q => q.id === s.questionId) : s.index;
  if (idx < 0 || idx >= state.questions.length) {
    clearSave();
    refreshResumeBox();
    alert("De vragen zijn gewijzigd, dus het opgeslagen spel kan niet worden hervat. Start een nieuw spel.");
    return;
  }

  state.roomId = s.roomId;
  state.me = s.me || "A";
  state.nameA = s.nameA || "Jij";
  state.nameB = s.nameB || "Partner";
  state.matches = s.matches || 0;
  state.index = idx;
  state.lastReveal = null;

  const q = state.questions[idx];
  if (s.phase === "reveal" && s.lastReveal) {
    const mine = q.options.find(o => o.id === s.lastReveal.mineId);
    const theirs = q.options.find(o => o.id === s.lastReveal.theirsId);
    if (mine && theirs) {
      state.lastReveal = s.lastReveal;
      state.phase = "reveal";
      renderReveal(q, mine, theirs);
      writeSave();
      return;
    }
  }
  renderQuestion(s.chosenId);
}

function confirmNewGame() {
  if (readSave() && !confirm("Er staat nog een spel open. Als je een nieuw spel start, wordt dat opgeslagen spel gewist. Doorgaan?")) {
    return false;
  }
  clearSave();
  state.phase = "idle";
  return true;
}

document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") writeSave(); });
window.addEventListener("pagehide", writeSave);
window.addEventListener("beforeunload", writeSave);

/* ---------- Terug naar Hoofdscherm ---------- */
function goHome() {
  writeSave();
  clearTimers();
  $("convoOverlay").classList.remove("open");
  const lobbyCard = document.querySelector("#screen-lobby > .card");
  if (lobbyCard) lobbyCard.hidden = false;
  $("joinBox").hidden = true;
  show("screen-start");
  refreshResumeBox();
}

/* ---------- Kusjes / hartjes ---------- */
function burst(emojis = ["💋","💗","✨","💕"], count = 14, origin) {
  const layer = $("burstLayer");
  const ox = origin ? origin.x : window.innerWidth / 2;
  const oy = origin ? origin.y : window.innerHeight * 0.55;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    el.className = "burst-item";
    el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    el.style.setProperty("--x", (ox + (Math.random() - .5) * 120) + "px");
    el.style.setProperty("--y", (oy + (Math.random() - .5) * 40) + "px");
    el.style.setProperty("--dx", ((Math.random() - .5) * 220) + "px");
    el.style.setProperty("--dy", (140 + Math.random() * 260) + "px");
    el.style.setProperty("--rot", ((Math.random() - .5) * 60) + "deg");
    el.style.setProperty("--size", (1.2 + Math.random() * 1.6) + "rem");
    el.style.setProperty("--dur", (1.4 + Math.random() * 1.2) + "s");
    el.style.animationDelay = (Math.random() * .35) + "s";
    layer.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }
}

/* ---------- Kamer-ID & QR ---------- */
function makeRoomId(custom) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = custom ? custom.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) : "";
  if (!suffix) {
    suffix = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  }
  return "HABIBI-" + suffix;
}

function renderQR(roomId) {
  const holder = $("qrcode");
  holder.innerHTML = "";
  const url = location.origin + location.pathname + "?room=" + encodeURIComponent(roomId);
  if (window.QRCode) {
    new QRCode(holder, {
      text: url, width: 190, height: 190,
      colorDark: "#6B2D5C", colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
  } else {
    holder.textContent = url;
  }
}

function enterLobby(roomId, asPlayer) {
  state.roomId = roomId;
  state.me = asPlayer;
  state.phase = "idle";
  $("roomIdDisplay").textContent = roomId;
  $("nameA").textContent = state.nameA;
  $("nameB").textContent = "Wacht op partner…";
  $("pillB").classList.remove("ready");
  $("pillB").classList.add("waiting");
  $("btnStart").disabled = true;
  renderQR(roomId);
  show("screen-lobby");

  // REALTIME FIREBASE KOPPELING LOBBY
  const playerRef = db.ref(`rooms/${roomId}/players/${asPlayer}`);
  playerRef.set({ name: state.nameA, ready: true });
  playerRef.onDisconnect().remove();

  db.ref(`rooms/${roomId}`).on("value", (snap) => {
    const room = snap.val();
    if (!room) return;

    if (room.players) {
      if (room.players.A && state.me === "B") {
        state.nameB = room.players.A.name;
        $("nameA").textContent = room.players.A.name;
      }
      if (room.players.B) {
        if (state.me === "A") state.nameB = room.players.B.name;
        $("nameB").textContent = room.players.B.name;
        $("pillB").classList.remove("waiting");
        $("pillB").classList.add("ready");
        $("btnStart").disabled = false;
      }
    }

    if (room.meta && room.meta.status === "playing" && state.phase === "idle") {
      state.index = room.meta.currentIndex || 0;
      renderQuestion();
    }
  });
}

/* ---------- Vragen laden ---------- */
const FALLBACK_QUESTIONS = [{
  id: "demo", category: "Liefdestalen & Ihsan", type: "couple_alignment",
  questionText: "Wat laat jou het meest voelen dat je partner van je houdt?",
  options: [{id:"a",text:"Woorden"},{id:"b",text:"Tijd"},{id:"c",text:"Daden"},{id:"d",text:"Cadeautjes"}],
  conversationCard: { insightTitle: "Liefde spreekt meer dan één taal", discussionPrompt: "Vertel elkaar wanneer je je geliefd voelde.", islamicContext: "Koran 30:21." }
}];

async function loadQuestions() {
  if (state.questions.length) return;
  try {
    const res = await fetch("questions.json", { cache: "no-store" });
    const data = await res.json();
    state.categoryMeta = data.categories;
    state.questions = Object.values(data.questions).sort((a, b) =>
      (data.categories[a.categoryId]?.order - data.categories[b.categoryId]?.order) || (a.order - b.order));
  } catch (e) {
    console.warn("questions.json niet geladen, demo-vraag gebruikt", e);
    state.questions = FALLBACK_QUESTIONS;
  }
}

/* ---------- Vraag tonen ---------- */
const LETTERS = ["A","B","C","D"];

function renderQuestion(preselectId) {
  const q = state.questions[state.index];
  state.chosen = null;
  state.lastReveal = null;
  state.phase = "question";
  $("btnLock").disabled = true;
  const icon = state.categoryMeta?.[q.categoryId]?.icon || "💌";
  $("qCategory").textContent = icon + " " + q.category;
  $("qText").textContent = q.questionText;
  $("progressBar").style.width = ((state.index) / state.questions.length * 100) + "%";

  const box = $("qOptions");
  box.innerHTML = "";
  q.options.forEach((opt, i) => {
    const b = document.createElement("button");
    b.className = "option";
    b.dataset.letter = LETTERS[i];
    b.textContent = opt.text;
    b.addEventListener("click", () => {
      box.querySelectorAll(".option").forEach(o => o.classList.remove("selected"));
      b.classList.add("selected");
      state.chosen = opt;
      $("btnLock").disabled = false;
      const r = b.getBoundingClientRect();
      burst(["💗","✨"], 4, { x: r.left + 30, y: r.top + r.height / 2 });
      writeSave();
    });
    box.appendChild(b);
    if (preselectId && opt.id === preselectId) {
      b.classList.add("selected");
      state.chosen = opt;
      $("btnLock").disabled = false;
    }
  });
  show("screen-question");
  writeSave();
}

/* ---------- Antwoord vergrendelen & reveal ---------- */
function lockAnswer() {
  const q = state.questions[state.index];
  show("screen-wait");

  // REALTIME FIREBASE KOPPELING ANTWOORDEN
  db.ref(`rooms/${state.roomId}/answers/${q.id}/${state.me}`).set(state.chosen.id);

  const answersRef = db.ref(`rooms/${state.roomId}/answers/${q.id}`);
  answersRef.on("value", (snap) => {
    const answers = snap.val();
    if (answers && answers.A && answers.B) {
      answersRef.off();
      const optionA = q.options.find(o => o.id === answers.A);
      const optionB = q.options.find(o => o.id === answers.B);
      const mine = state.me === "A" ? optionA : optionB;
      const theirs = state.me === "A" ? optionB : optionA;
      reveal(q, mine, theirs);
    }
  });
}

function reveal(q, mine, theirs) {
  const isMatch = mine.id === theirs.id;
  if (isMatch) state.matches++;
  state.lastReveal = { mineId: mine.id, theirsId: theirs.id };
  state.phase = "reveal";
  renderReveal(q, mine, theirs);
  burst(isMatch ? ["💋","💗","✨","💕","💋"] : ["✨","💗"], isMatch ? 22 : 10);
  writeSave();
}

function renderReveal(q, mine, theirs) {
  const isMatch = mine.id === theirs.id;
  $("revNameA").textContent = state.nameA;
  $("revNameB").textContent = state.nameB;
  $("revTextA").textContent = mine.text;
  $("revTextB").textContent = theirs.text;

  const badge = $("matchBadge");
  if (isMatch) {
    badge.className = "match-badge match";
    badge.innerHTML = '<span class="kiss-pop">💋</span> Match! <span class="sparkle">✨</span>';
    $("revNote").textContent = "Jullie zitten op één lijn. Vier het even!";
  } else {
    badge.className = "match-badge differ";
    badge.innerHTML = '<span class="heart-beat">💗</span> Een spark!';
    $("revNote").textContent = "Jullie kiezen verschillend, en dat is precies waar het gesprek begint.";
  }
  show("screen-reveal");
}

/* ---------- Gesprekskaart-overlay ---------- */
function openCard() {
  const q = state.questions[state.index];
  const c = q.conversationCard;
  $("convoKicker").textContent = "Gesprekskaart · " + q.category;
  $("convoTitle").textContent = c.insightTitle;
  $("convoPrompt").textContent = c.discussionPrompt;
  $("convoContext").textContent = c.islamicContext;
  $("btnNext").textContent = (state.index === state.questions.length - 1)
    ? "Bekijk jullie sparks ✨" : "Verder naar de volgende vraag →";
  $("convoOverlay").classList.add("open");
  burst(["✨","💗","💋"], 10);
}

function nextStep() {
  $("convoOverlay").classList.remove("open");
  state.index++;
  if (state.index < state.questions.length) {
    renderQuestion();
  } else {
    showResults();
  }
}

function showResults() {
  state.phase = "done";
  clearSave();
  const pct = Math.round(state.matches / state.questions.length * 100);
  $("scoreValue").textContent = pct + "%";
  $("scoreRing").style.setProperty("--pct", pct);
  $("scoreText").textContent =
    pct >= 70 ? "Wat een harmonie! Blijf elkaar verrassen." :
    pct >= 40 ? "Mooie mix van gelijkheid en verschil: dat geeft stof voor gesprek." :
                "Veel verschillen, dus veel om samen te ontdekken. Neem de gesprekskaarten nog eens door.";
  show("screen-results");
  burst(["💋","💗","✨","💕","🌹"], 30);
}

/* ---------- Events ---------- */
$("btnCreate").addEventListener("click", async () => {
  if (!confirmNewGame()) return;
  state.nameA = $("playerName").value.trim() || "Jij";
  state.questions = [];
  await loadQuestions();
  enterLobby(makeRoomId(), "A");
});

$("btnResume").addEventListener("click", resumeGame);
$("btnBack").addEventListener("click", goHome);

$("btnJoin").addEventListener("click", () => {
  $("joinBox").hidden = false;
  show("screen-lobby");
  document.querySelector("#screen-lobby > .card").hidden = true;
});

$("btnJoinGo").addEventListener("click", async () => {
  const code = $("joinCode").value.trim().toUpperCase();
  if (!code) return;
  if (!confirmNewGame()) return;
  state.nameA = $("playerName").value.trim() || "Partner B";
  state.questions = [];
  await loadQuestions();
  document.querySelector("#screen-lobby > .card").hidden = false;
  $("joinBox").hidden = true;
  enterLobby(code, "B");
});

$("btnCopy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(state.roomId); $("btnCopy").textContent = "Gekopieerd ✓"; }
  catch { $("btnCopy").textContent = state.roomId; }
});

$("btnStart").addEventListener("click", () => {
  state.index = 0; state.matches = 0;
  db.ref(`rooms/${state.roomId}/meta`).set({ status: "playing", currentIndex: 0 });
});

$("btnLock").addEventListener("click", lockAnswer);
$("btnOpenCard").addEventListener("click", openCard);
$("btnNext").addEventListener("click", nextStep);
$("btnAgain").addEventListener("click", () => {
  state.index = 0; state.matches = 0; state.phase = "idle";
  show("screen-start");
  refreshResumeBox();
});

(function autoJoinFromUrl() {
  const room = new URLSearchParams(location.search).get("room");
  if (room) {
    $("joinCode").value = room.toUpperCase();
    $("joinBox").hidden = false;
    show("screen-lobby");
    document.querySelector("#screen-lobby > .card").hidden = true;
  }
})();

refreshResumeBox();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service worker mislukt", e));
  });
}

(function setupInstall() {
  const box = $("installBox"), btn = $("btnInstall"), iosHint = $("iosHint");
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (isStandalone) return;

  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    box.hidden = false;
    btn.hidden = false;
  });

  btn.addEventListener("click", async () => {
    if (!deferred) return;
    deferred.prompt();
    const choice = await deferred.userChoice;
    deferred = null;
    if (choice.outcome === "accepted") { box.hidden = true; burst(["💗","✨","💋"], 14); }
  });

  window.addEventListener("appinstalled", () => { box.hidden = true; burst(["💗","✨","💋"], 18); });

  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) { box.hidden = false; iosHint.hidden = false; }
})();
