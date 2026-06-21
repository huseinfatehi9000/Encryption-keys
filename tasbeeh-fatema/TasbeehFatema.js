// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: teal; icon-glyph: praying-hands;
//
// ============================================================================
//  Tasbeeh-e-Fatema  —  a Scriptable counter + Home Screen widget
// ----------------------------------------------------------------------------
//  • Tap-counter that cycles through the Tasbeeh of Fatima az-Zahra (ﷺ):
//        Allahu Akbar      x33
//        Alhamdulillah     x33
//        Subhanallah       x33
//        La ilaha illAllah x1
//    ...then marks the cycle complete and resets.
//  • Home Screen widget showing the next prayer + today's completed cycles.
//  • Schedules reminders at the 5 daily prayer times (auto by GPS location)
//    so you remember to recite tasbeeh after every salah.
//
//  See README.md for install instructions.
// ============================================================================

// ----------------------------- CONFIG ---------------------------------------

// The dhikr cycle, in order. Edit `count` here if you prefer the traditional
// 34 / 33 / 33 distribution (set takbir count to 34 and remove tahlil).
const PHASES = [
  { key: "takbir", ar: "اللّٰهُ أَكْبَر",            tr: "Allāhu Akbar",        count: 33, color: "#34d399" },
  { key: "tahmid", ar: "اَلْحَمْدُ لِلّٰه",          tr: "Alhamdulillāh",       count: 33, color: "#60a5fa" },
  { key: "tasbih", ar: "سُبْحَانَ اللّٰه",           tr: "SubḥānAllāh",         count: 33, color: "#f472b6" },
  { key: "tahlil", ar: "لَا إِلٰهَ إِلَّا اللّٰه",   tr: "Lā ilāha illā Allāh", count: 1,  color: "#fbbf24" },
];

// Aladhan calculation method.
//   0  = Shia Ithna-Ashari (Jafari)   <- default, matches Tasbeeh-e-Fatema
//   2  = ISNA (North America, Sunni)
//   3  = Muslim World League
//   See https://aladhan.com/calculation-methods for the full list.
const CALC_METHOD = 0;

// The 5 obligatory prayers we remind for (Sunrise/Sunset are skipped).
const PRAYER_NAMES = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

// How many days of prayer reminders to schedule ahead (iOS caps pending at 64).
const REMINDER_DAYS = 5;

const NOTIF_PREFIX = "tasbeeh-fatema-";
const STORE_FILE = "tasbeeh-fatema.json";

// ----------------------------- STORAGE --------------------------------------

const fm = FileManager.local();
const storePath = fm.joinPath(fm.documentsDirectory(), STORE_FILE);

function loadStore() {
  try {
    if (fm.fileExists(storePath)) {
      return JSON.parse(fm.readString(storePath));
    }
  } catch (e) {}
  return {};
}

function saveStore(store) {
  try {
    fm.writeString(storePath, JSON.stringify(store));
  } catch (e) {}
}

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

// Number of full tasbeeh cycles completed today.
function completedToday(store) {
  if (store.completed && store.completed.date === todayKey()) {
    return store.completed.count || 0;
  }
  return 0;
}

// ----------------------------- LOCATION -------------------------------------

// In-app we fetch fresh GPS and cache it. In a widget we reuse the cache,
// because Location.current() is unreliable / slow inside widgets.
async function resolveLocation(store) {
  if (config.runsInApp) {
    try {
      Location.setAccuracyToHundredMeters();
      const loc = await Location.current();
      store.location = { latitude: loc.latitude, longitude: loc.longitude, ts: Date.now() };
      saveStore(store);
      return store.location;
    } catch (e) {
      // fall through to cached
    }
  }
  return store.location || null;
}

// ----------------------------- PRAYER TIMES ---------------------------------

// Returns [{ name, date }] for the given day, fetched (and cached) from Aladhan.
async function prayerTimesForDay(loc, date, store) {
  const dKey = todayKey(date);
  const cacheKey = `${dKey}@${loc.latitude.toFixed(2)},${loc.longitude.toFixed(2)},m${CALC_METHOD}`;
  store.timings = store.timings || {};

  let timings = store.timings[cacheKey];
  if (!timings) {
    const ddmmyyyy = `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
    const url =
      `https://api.aladhan.com/v1/timings/${ddmmyyyy}` +
      `?latitude=${loc.latitude}&longitude=${loc.longitude}&method=${CALC_METHOD}`;
    const req = new Request(url);
    const json = await req.loadJSON();
    timings = json.data.timings;
    store.timings[cacheKey] = timings;
    // Keep the cache small.
    const keys = Object.keys(store.timings);
    if (keys.length > 20) delete store.timings[keys[0]];
    saveStore(store);
  }

  return PRAYER_NAMES
    .map((name) => {
      const hhmm = (timings[name] || "").split(" ")[0]; // strip any "(EDT)" suffix
      const [h, m] = hhmm.split(":").map(Number);
      if (Number.isNaN(h) || Number.isNaN(m)) return null;
      const dt = new Date(date);
      dt.setHours(h, m, 0, 0);
      return { name, date: dt };
    })
    .filter(Boolean);
}

// All upcoming prayers across the next REMINDER_DAYS days.
async function upcomingPrayers(loc, store) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < REMINDER_DAYS; i++) {
    const day = new Date();
    day.setDate(now.getDate() + i);
    try {
      const list = await prayerTimesForDay(loc, day, store);
      out.push(...list);
    } catch (e) {
      // network/parse failure for this day — skip it
    }
  }
  return out.filter((p) => p.date.getTime() > now.getTime()).sort((a, b) => a.date - b.date);
}

// ----------------------------- NOTIFICATIONS --------------------------------

async function scheduleReminders(prayers) {
  // Clear our previously scheduled reminders so we never duplicate.
  try {
    const pending = await Notification.allPending();
    const ours = pending.filter((n) => n.identifier && n.identifier.startsWith(NOTIF_PREFIX));
    if (ours.length) {
      await Notification.removePending(ours.map((n) => n.identifier));
    }
  } catch (e) {}

  // iOS allows 64 pending notifications; stay well under.
  const toSchedule = prayers.slice(0, 50);
  for (const p of toSchedule) {
    const n = new Notification();
    n.identifier = `${NOTIF_PREFIX}${todayKey(p.date)}-${p.name}`;
    n.title = `🕌 ${p.name} — Tasbeeh-e-Fatema`;
    n.body = `Time for ${p.name}. After salah, recite the Tasbeeh of Fatima az-Zahra ﷺ.`;
    n.sound = "default";
    n.setTriggerDate(p.date);
    // Tapping the reminder opens this script.
    n.scriptName = Script.name();
    try {
      await n.schedule();
    } catch (e) {}
  }
}

// ----------------------------- WIDGET ---------------------------------------

function buildWidget(store, nextPrayer) {
  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [new Color("#0b1020"), new Color("#14233f")];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  w.setPadding(14, 16, 14, 16);

  const title = w.addText("تَسْبِيح الزَّهْرَاء");
  title.font = Font.boldSystemFont(16);
  title.textColor = new Color("#ffffff");

  const sub = w.addText("Tasbeeh-e-Fatema");
  sub.font = Font.systemFont(10);
  sub.textColor = new Color("#9fb3d1");

  w.addSpacer(6);

  // 33 · 33 · 33 · 1 breakdown
  const row = w.addStack();
  row.spacing = 6;
  const beads = [
    ["33", "#34d399"], ["33", "#60a5fa"], ["33", "#f472b6"], ["1", "#fbbf24"],
  ];
  for (const [num, col] of beads) {
    const chip = row.addStack();
    chip.backgroundColor = new Color(col, 0.18);
    chip.cornerRadius = 6;
    chip.setPadding(2, 7, 2, 7);
    const t = chip.addText(num);
    t.font = Font.semiboldSystemFont(11);
    t.textColor = new Color(col);
  }

  w.addSpacer(8);

  const done = completedToday(store);
  const doneText = w.addText(`✓ ${done} cycle${done === 1 ? "" : "s"} today`);
  doneText.font = Font.systemFont(11);
  doneText.textColor = new Color("#c9d6ea");

  w.addSpacer();

  if (nextPrayer) {
    const t = nextPrayer.date;
    const hh = ((t.getHours() + 11) % 12) + 1;
    const ampm = t.getHours() < 12 ? "AM" : "PM";
    const np = w.addText(`Next: ${nextPrayer.name} ${hh}:${pad(t.getMinutes())} ${ampm}`);
    np.font = Font.mediumSystemFont(12);
    np.textColor = new Color("#7dd3fc");
  } else if (!store.location) {
    const np = w.addText("Open the app once to set location");
    np.font = Font.systemFont(10);
    np.textColor = new Color("#f0a8a8");
  }

  const tap = w.addText("Tap to count →");
  tap.font = Font.systemFont(10);
  tap.textColor = new Color("#7f93b3");

  return w;
}

// ----------------------------- COUNTER (WebView) ----------------------------

function counterHTML(initialState) {
  const phasesJson = JSON.stringify(PHASES);
  const stateJson = JSON.stringify(initialState);

  // NB: the inner page script uses plain strings (no backticks) so it can live
  // inside this template literal without escaping headaches.
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<style>
  :root { --accent:#34d399; }
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; -webkit-user-select:none; user-select:none; }
  html,body { margin:0; height:100%; font-family:-apple-system,system-ui,sans-serif;
    background:radial-gradient(120% 120% at 50% 0%, #14233f 0%, #0b1020 60%); color:#fff; overflow:hidden; }
  #app { display:flex; flex-direction:column; height:100%; padding:env(safe-area-inset-top) 20px env(safe-area-inset-bottom); }
  header { text-align:center; padding-top:14px; }
  header h1 { margin:0; font-size:20px; font-weight:700; letter-spacing:.5px; }
  header p { margin:2px 0 0; font-size:12px; color:#9fb3d1; }
  #dots { display:flex; justify-content:center; gap:8px; margin-top:12px; }
  .dot { width:9px; height:9px; border-radius:50%; background:#2a3a57; transition:.2s; }
  .dot.active { transform:scale(1.35); }
  .dot.done { opacity:.55; }
  #tap { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; }
  #ringWrap { position:relative; width:260px; height:260px; }
  svg { transform:rotate(-90deg); }
  #ringBg { stroke:#1c2c4a; }
  #ringFg { stroke:var(--accent); stroke-linecap:round; transition:stroke-dashoffset .18s ease, stroke .25s; }
  #center { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
  #arabic { font-size:34px; font-weight:700; line-height:1.3; }
  #translit { font-size:14px; color:#9fb3d1; margin-top:4px; }
  #count { font-size:52px; font-weight:800; margin-top:10px; font-variant-numeric:tabular-nums; }
  #total { font-size:15px; color:#7f93b3; margin-top:-6px; }
  #hint { font-size:12px; color:#5d6f8e; margin-top:18px; }
  #cycles { font-size:13px; color:#7dd3fc; text-align:center; padding:4px; }
  footer { display:flex; gap:12px; padding:14px 0 22px; }
  button { flex:1; padding:14px; border:none; border-radius:14px; font-size:15px; font-weight:600;
    background:#1c2c4a; color:#cdddf2; }
  button:active { background:#243a60; }
  #pulse { animation:none; }
  .bump { animation:bump .14s ease; }
  @keyframes bump { 0%{transform:scale(1)} 50%{transform:scale(.93)} 100%{transform:scale(1)} }
  #done { display:none; flex:1; flex-direction:column; align-items:center; justify-content:center; text-align:center; }
  #done .big { font-size:44px; }
  #done h2 { margin:10px 0 4px; }
  #done p { color:#9fb3d1; margin:0 24px; }
</style>
</head>
<body>
<div id="app">
  <header>
    <h1>تَسْبِيح الزَّهْرَاء</h1>
    <p>Tasbeeh-e-Fatema</p>
    <div id="dots"></div>
  </header>

  <div id="tap">
    <div id="ringWrap" class="bumpable">
      <svg width="260" height="260" viewBox="0 0 260 260">
        <circle id="ringBg" cx="130" cy="130" r="118" fill="none" stroke-width="12"/>
        <circle id="ringFg" cx="130" cy="130" r="118" fill="none" stroke-width="12"/>
      </svg>
      <div id="center">
        <div id="arabic"></div>
        <div id="translit"></div>
        <div id="count">0</div>
        <div id="total"></div>
      </div>
    </div>
    <div id="hint">Tap anywhere to count</div>
  </div>

  <div id="done">
    <div class="big">🌙✨</div>
    <h2>Tasbeeh complete</h2>
    <p>Allāhumma ṣalli ʿalā Muḥammadin wa āli Muḥammad. May it be accepted.</p>
  </div>

  <div id="cycles"></div>

  <footer>
    <button id="undo">↶ Undo</button>
    <button id="reset">Reset</button>
  </footer>
</div>

<script>
  var PHASES = ${phasesJson};
  var S = ${stateJson};
  if (typeof S.phaseIndex !== 'number') S.phaseIndex = 0;
  if (typeof S.count !== 'number') S.count = 0;
  if (typeof S.cyclesToday !== 'number') S.cyclesToday = 0;

  var R = 118;
  var CIRC = 2 * Math.PI * R;
  var ringFg = document.getElementById('ringFg');
  ringFg.style.strokeDasharray = CIRC;

  var elArabic = document.getElementById('arabic');
  var elTranslit = document.getElementById('translit');
  var elCount = document.getElementById('count');
  var elTotal = document.getElementById('total');
  var elDots = document.getElementById('dots');
  var elCycles = document.getElementById('cycles');
  var elDone = document.getElementById('done');
  var elTapWrap = document.getElementById('tap');
  var ringWrap = document.getElementById('ringWrap');

  for (var i = 0; i < PHASES.length; i++) {
    var d = document.createElement('div');
    d.className = 'dot';
    elDots.appendChild(d);
  }
  var dots = elDots.querySelectorAll('.dot');

  function render() {
    var finished = S.phaseIndex >= PHASES.length;
    elDone.style.display = finished ? 'flex' : 'none';
    elTapWrap.style.display = finished ? 'none' : 'flex';

    elCycles.textContent = '✓ ' + S.cyclesToday + ' cycle' + (S.cyclesToday === 1 ? '' : 's') + ' today';

    if (finished) return;

    var p = PHASES[S.phaseIndex];
    document.documentElement.style.setProperty('--accent', p.color);
    elArabic.textContent = p.ar;
    elTranslit.textContent = p.tr;
    elCount.textContent = S.count;
    elTotal.textContent = S.count + ' / ' + p.count;

    var frac = p.count ? S.count / p.count : 0;
    ringFg.style.stroke = p.color;
    ringFg.style.strokeDashoffset = CIRC * (1 - frac);

    for (var i = 0; i < dots.length; i++) {
      dots[i].className = 'dot' + (i < S.phaseIndex ? ' done' : '') + (i === S.phaseIndex ? ' active' : '');
      dots[i].style.background = i <= S.phaseIndex ? PHASES[i].color : '#2a3a57';
    }
  }

  function bump() {
    ringWrap.classList.remove('bump');
    void ringWrap.offsetWidth;
    ringWrap.classList.add('bump');
  }

  function increment() {
    if (S.phaseIndex >= PHASES.length) return;
    var p = PHASES[S.phaseIndex];
    S.count++;
    bump();
    if (S.count >= p.count) {
      S.phaseIndex++;
      S.count = 0;
      if (S.phaseIndex >= PHASES.length) {
        S.cyclesToday++;
      }
    }
    render();
  }

  function undo() {
    if (S.count > 0) {
      S.count--;
    } else if (S.phaseIndex > 0) {
      S.phaseIndex--;
      S.count = Math.max(0, PHASES[S.phaseIndex].count - 1);
    } else {
      return;
    }
    if (S.phaseIndex < PHASES.length) render(); else render();
  }

  document.getElementById('tap').addEventListener('click', increment);
  document.getElementById('done').addEventListener('click', function(){ /* no-op */ });
  document.getElementById('undo').addEventListener('click', function(e){ e.stopPropagation(); undo(); });
  document.getElementById('reset').addEventListener('click', function(e){
    e.stopPropagation();
    S.phaseIndex = 0; S.count = 0;
    render();
  });

  // Scriptable reads this after the view is dismissed to persist progress.
  window.getState = function() { return JSON.stringify(S); };

  render();
</script>
</body>
</html>`;
}

async function presentCounter(store) {
  const initial = store.counter && store.counter.date === todayKey()
    ? store.counter
    : { phaseIndex: 0, count: 0, cyclesToday: completedToday(store) };

  const wv = new WebView();
  await wv.loadHTML(counterHTML(initial));
  await wv.present(true);

  // Read final state back and persist it.
  try {
    const raw = await wv.evaluateJavaScript("window.getState()");
    const s = JSON.parse(raw);
    store.counter = { phaseIndex: s.phaseIndex, count: s.count, cyclesToday: s.cyclesToday, date: todayKey() };
    store.completed = { count: s.cyclesToday, date: todayKey() };
    saveStore(store);
  } catch (e) {}
}

// ----------------------------- MAIN -----------------------------------------

async function main() {
  const store = loadStore();

  // Refresh prayer cache + reminders whenever we have a location.
  const loc = await resolveLocation(store);
  let nextPrayer = null;
  if (loc) {
    try {
      const upcoming = await upcomingPrayers(loc, store);
      nextPrayer = upcoming[0] || null;
      // Only (re)schedule reminders from the foreground app to avoid
      // hammering the API on every widget refresh.
      if (config.runsInApp) {
        await scheduleReminders(upcoming);
      }
    } catch (e) {}
  }

  if (config.runsInWidget) {
    Script.setWidget(buildWidget(store, nextPrayer));
    Script.complete();
    return;
  }

  // Running in the app (tapped widget, notification, or run button).
  await presentCounter(store);
  Script.complete();
}

await main();
