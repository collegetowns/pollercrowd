/* Poller Crowd — teacher app: question sets, builder, live room, results. */
(function () {
  "use strict";
  var PC = window.PC, R = window.PCResults, B = window.PCBuddies, F = window.PCFilter;
  var $ = PC.$, $$ = PC.$$, esc = PC.esc;
  var app = $("#app");

  /* =========================================================
     Storage: question sets (decks) and sessions live only in this browser
     ========================================================= */
  var Store = {
    decks: function () { return PC.store.get("decks", []); },
    deck: function (id) { return PC.store.get("deck." + id, null); },
    saveDeck: function (d) {
      d.updated = Date.now();
      PC.store.set("deck." + d.id, d);
      var list = Store.decks().filter(function (x) { return x.id !== d.id; });
      list.unshift({ id: d.id, title: d.title, n: d.questions.length, updated: d.updated });
      PC.store.set("decks", list);
    },
    delDeck: function (id) { PC.store.del("deck." + id); PC.store.set("decks", Store.decks().filter(function (x) { return x.id !== id; })); },
    sessions: function () { return PC.store.get("sessions", []); },
    session: function (id) { return PC.store.get("session." + id, null); },
    saveSession: function (s) {
      var ok = PC.store.set("session." + s.id, s);
      var list = Store.sessions().filter(function (x) { return x.id !== s.id; });
      list.unshift({ id: s.id, title: s.title, code: s.code, startedAt: s.startedAt, endedAt: s.endedAt || null, people: Object.keys(s.roster || {}).length, n: s.questions.length });
      PC.store.set("sessions", list);
      if (!ok) PC.toast("This browser's storage is full. Export your results, then delete old sessions.", 6000);
    },
    delSession: function (id) { PC.store.del("session." + id); PC.store.set("sessions", Store.sessions().filter(function (x) { return x.id !== id; })); if (PC.store.get("live") === id) PC.store.del("live"); },
    settings: function () { return Object.assign({ hold: false, liveResults: true, banned: [] }, PC.store.get("settings", {})); },
    saveSettings: function (s) { PC.store.set("settings", s); F.setCustom(s.banned); }
  };
  F.setCustom(Store.settings().banned);

  // Delete finished sessions older than the configured number of days
  (function cleanup() {
    var days = +(PC.cfg.keepSessionsDays || 30), cut = Date.now() - days * 864e5;
    Store.sessions().forEach(function (x) { if (x.endedAt && x.endedAt < cut) Store.delSession(x.id); });
  })();

  // Load each photo at most once (a missing photo must not cause endless redraws)
  var photoTried = {};
  function needPhotos(qs) {
    var need = false;
    qs.forEach(function (q) { if (q.image && !PC.images.cached(q.image) && !photoTried[q.image]) { photoTried[q.image] = 1; need = true; } });
    return need;
  }
  function sampleRace() {
    var z = function (prompt, options, correct, timer) { return Object.assign(R.blank("qz"), { prompt: prompt, options: options, correct: correct, timer: timer || 20 }); };
    return {
      id: PC.uid(8), title: "Sample: Polar Quiz Race", updated: Date.now() + 1, questions: [
        z("What is the largest kind of penguin?", ["Adélie penguin", "King penguin", "Emperor penguin", "Gentoo penguin"], [2], 15),
        z("A narwhal’s long “tusk” is actually a…", ["Horn", "Tooth", "Nose", "Antler"], [1]),
        z("What color is a polar bear’s skin, under its fur?", ["White", "Pink", "Black", "Light brown"], [2]),
        z("Which of these animals live in the Arctic? (More than one is right!)", ["Polar bear", "Emperor penguin", "Arctic fox", "Walrus"], [0, 2, 3], 25),
        z("About how much of an iceberg is hidden under the water?", ["About 10%", "About half", "About 75%", "About 90%"], [3]),
        z("Snowflakes almost always have how many sides or arms?", ["Four", "Five", "Six", "Eight"], [2], 15),
        z("Which of these places has penguins living in the wild?", ["Alaska", "Greenland", "The Galápagos Islands", "Iceland"], [2]),
        z("On which continent is the South Pole?", ["Antarctica", "Australia", "South America", "Europe"], [0], 15)
      ]
    };
  }
  var SAMPLE_WELCOME = { prompt: "Welcome to Earth Science 101!", body: "Grab your phone and scan the code to join.\nPick a buddy, then look up here. We’ll start in a minute." };
  var SAMPLE_THERM = { prompt: "How much of Earth’s surface do you think is covered by water?", lowLabel: "None of it", highLabel: "All of it" };
  var SAMPLE_BREAK = { prompt: "Two-minute stretch break", body: "Stand up, stretch, refill your water. Back in two!", timer: 120 };
  function sampleDeck() {
    var q = function (type, o) { return Object.assign(R.blank(type), o); };
    return {
      id: PC.uid(8), title: "Sample: Earth Science 101", updated: Date.now(), questions: [
        q("sl", SAMPLE_WELCOME),
        q("rs", { prompt: "How awake are you right now?", scaleMax: 5, lowLabel: "Still asleep", highLabel: "Wide awake" }),
        q("wc", { prompt: "In one word, what is the atmosphere?", maxWords: 3 }),
        q("th", SAMPLE_THERM),
        q("mc", { prompt: "Which layer of the atmosphere do we live in?", options: ["Troposphere", "Stratosphere", "Mesosphere", "Thermosphere"], correct: 0 }),
        q("qz", { prompt: "Which gas makes up most of the air we breathe?", options: ["Oxygen", "Nitrogen", "Carbon dioxide", "Argon"], correct: 1, timer: 20 }),
        q("rk", { prompt: "Rank these layers from lowest to highest.", options: ["Stratosphere", "Troposphere", "Thermosphere", "Mesosphere"] }),
        q("sl", SAMPLE_BREAK),
        q("qa", { prompt: "What's still foggy about today's lecture?" })
      ]
    };
  }
  if (!PC.store.get("seeded")) { Store.saveDeck(sampleDeck()); PC.store.set("seeded", true); }
  // Older copies of the sample set get the new info slides and thermometer question
  if (!PC.store.get("sampleV3")) {
    Store.decks().filter(function (d) { return d.title === "Sample: Earth Science 101"; }).forEach(function (d) {
      var x = Store.deck(d.id); if (!x || x.questions.some(function (q) { return q.type === "th" || q.type === "sl"; })) return;
      var mk = function (type, o) { return Object.assign(R.blank(type), o); };
      x.questions.unshift(mk("sl", SAMPLE_WELCOME));
      var at = x.questions.findIndex(function (q) { return q.type === "wc"; });
      x.questions.splice(at >= 0 ? at + 1 : x.questions.length, 0, mk("th", SAMPLE_THERM));
      var qa = x.questions.findIndex(function (q) { return q.type === "qa"; });
      x.questions.splice(qa >= 0 ? qa : x.questions.length, 0, mk("sl", SAMPLE_BREAK));
      Store.saveDeck(x);
    });
    PC.store.set("sampleV3", true);
  }
  if (!PC.store.get("sampleRace")) { Store.saveDeck(sampleRace()); PC.store.set("sampleRace", true); }
  function sampleSlopes() {
    var policies = ["Curriculum in elementary and middle school | Elem. & middle curriculum", "Curriculum in high school | High school curriculum", "Curriculum in universities | University curriculum",
      "How much teachers are paid | Teacher pay", "Discrimination/ protected classes (race, gender, etc.) | Protected classes", "Driver’s license rules", "Highway speeds", "Speeds on local streets | Local street speeds",
      "Obscenity speech codes", "Building codes (such as fire safety and disability accommodations) | Building codes", "Building zoning codes | Zoning codes", "Workplace safety codes",
      "International Diplomacy | International diplomacy", "Privacy laws", "Artificial Intelligence | Artificial intelligence", "Police conduct", "Rights for those arrested/ prisoners | Arrestee & prisoner rights",
      "Immigration rules", "Income taxes", "Corporate taxes", "Health insurance regulations | Health insurance regs", "Car insurance regulations | Car insurance regs", "Border Control | Border control",
      "Responses to homelessness | Homelessness responses", "Drug and alcohol regulations | Drug & alcohol regs", "Voter rights", "Voting age", "Election management", "Hair stylist licensure", "Teacher licensure", "Environmental protection"];
    return {
      id: PC.uid(8), title: "Sample: Policy Slopes", updated: Date.now() + 2, questions: [
        Object.assign(R.blank("sl"), { prompt: "Welcome to Policy Slopes!", body: "Scan the code and pick your buddy.\nFor each policy: who usually sets it, and how much room does it leave?" }),
        Object.assign(R.blank("sp"), { prompt: "Where does each policy sit?", lowLabel: "Precision", highLabel: "Flexibility", levels: ["Federal", "State", "Local"], items: policies, shuffle: true })
      ]
    };
  }
  if (!PC.store.get("sampleSlopes")) { Store.saveDeck(sampleSlopes()); PC.store.set("sampleSlopes", true); }
  // Give the sample set a photo so every feature is there to try
  if (!PC.store.get("samplePhoto")) {
    var sd = Store.decks().filter(function (d) { return d.title === "Sample: Earth Science 101"; })[0], sdeck = sd && Store.deck(sd.id);
    var wq = sdeck && sdeck.questions.filter(function (q) { return q.type === "wc" && !q.image; })[0];
    if (wq) {
      var c = document.createElement("canvas"); c.width = 1200; c.height = 800; var g = c.getContext("2d");
      var sky = g.createLinearGradient(0, 0, 0, 800); sky.addColorStop(0, "#050B1E"); sky.addColorStop(0.45, "#1E4E9C"); sky.addColorStop(0.8, "#7FC4F2"); sky.addColorStop(1, "#D8F0FF");
      g.fillStyle = sky; g.fillRect(0, 0, 1200, 800);
      g.fillStyle = "#FFFFFF"; for (var i = 0; i < 70; i++) { g.globalAlpha = Math.random() * 0.8; g.beginPath(); g.arc(Math.random() * 1200, Math.random() * 260, Math.random() * 2 + 0.5, 0, 7); g.fill(); }
      g.globalAlpha = 1; g.fillStyle = "#FFE7A3"; g.beginPath(); g.arc(950, 300, 60, 0, 7); g.fill();
      g.fillStyle = "rgba(255,255,255,.85)"; [[260, 470, 90], [340, 450, 70], [420, 480, 80], [760, 520, 70], [830, 505, 90]].forEach(function (p) { g.beginPath(); g.ellipse(p[0], p[1], p[2], p[2] * 0.42, 0, 0, 7); g.fill(); });
      g.fillStyle = "#2E7D5B"; g.beginPath(); g.ellipse(600, 1650, 1400, 1000, 0, 0, 7); g.fill();
      g.fillStyle = "#3A97DA"; g.beginPath(); g.ellipse(250, 790, 300, 60, 0, 0, 7); g.fill();
      PC.images.save(c.toDataURL("image/jpeg", 0.85)).then(function (id) {
        var fresh = Store.deck(sd.id); if (!fresh) return;
        fresh.questions.forEach(function (q) { if (q.id === wq.id && !q.image) { q.image = id; q.imageAlt = "Drawing of the sky above the Earth, from starry space down to blue sky and clouds"; } });
        Store.saveDeck(fresh); PC.store.set("samplePhoto", true);
        if (view === "home") renderHome(); else if (view === "edit" && editId === sd.id) renderEdit();
      });
    } else PC.store.set("samplePhoto", true);
  }
  // Delete photos no question set or session uses any more
  setTimeout(function tidyPhotos() {
    var ids = {};
    Store.decks().forEach(function (d) { var x = Store.deck(d.id); if (x) x.questions.forEach(function (q) { if (q.image) ids[q.image] = 1; }); });
    Store.sessions().forEach(function (d) { var x = Store.session(d.id); if (x) x.questions.forEach(function (q) { if (q.image) ids[q.image] = 1; }); });
    PC.images.keepOnly(ids);
  }, 20000);

  /* =========================================================
     Router
     ========================================================= */
  var view = "home", editId = null, editQ = 0;
  function go(hash) { if (location.hash !== hash) location.hash = hash; else route(); }
  function route() {
    var h = location.hash.replace(/^#/, "").split("/");
    if (live && h[0] !== "live") pauseLiveView();
    if (h[0] === "edit" && Store.deck(h[1])) { view = "edit"; editId = h[1]; renderEdit(); }
    else if (h[0] === "live" && PC.store.get("live")) { view = "live"; resumeLive(); }
    else if (h[0] === "results" && Store.session(h[1])) { view = "results"; renderResults(h[1]); }
    else { view = "home"; renderHome(); }
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  function topBar(inner) {
    return '<header class="host-top"><a class="brand" href="#">' + PC.logo(44) + '<span class="stack"><span class="brand-name">Poller Crowd</span><span class="brand-tag">Warm up the lecture</span></span></a>' +
      '<div class="tools">' + (inner || "") + '<div data-theme-btn="seg" class="hide-fs"></div><button type="button" class="btn icon hide-fs" data-act="settings" aria-label="Settings" title="Settings">' + GEAR + "</button></div></header>";
  }
  var GEAR = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
  function footer() { return '<footer id="credits"></footer>'; }
  function finish() { PC.initThemeButtons(); var c = $("#credits"); if (c) PC.credits(c); }
  function fmtDate(t) { return t ? new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : ""; }
  function serverBanner() {
    var srv = PC.server.current();
    if (srv.mode === "demo") return '<div class="banner warn"><span><b>Demo mode.</b> People have to be in other tabs of this same browser, so it’s only for trying things out. ' +
      (PC.server.site() ? 'Switch back to the shared server in <button type="button" class="linkbtn" data-act="settings">Settings</button>.' : 'To use real phones, add your Supabase project to <code>js/config.js</code> (see README), or connect your own in <button type="button" class="linkbtn" data-act="settings">Settings</button>.') + "</span></div>";
    if (srv.own) return '<div class="banner"><span>Using <b>your own ' + (srv.mode === "firebase" ? "Firebase database" : "Supabase project") + "</b> (" + esc(srv.url.replace(/^https:\/\//, "")) + ', up to ' + (srv.mode === "firebase" ? 100 : 200) + ' devices at once). Change this in <button type="button" class="linkbtn" data-act="settings">Settings</button>.</span></div>';
    return '<div class="banner"><span><b>Heads up:</b> you’re on the shared connection, which handles about <b>' + (srv.mode === "firebase" ? 100 : 200) + ' people at once</b>, counting every room using Poller Crowd at that moment. For big audiences or regular use, <a href="setup.html" target="_blank" rel="noopener">set up your own free Supabase or Firebase</a> (about 5 minutes) and add it in <button type="button" class="linkbtn" data-act="settings">Settings</button>.</span></div>';
  }

  /* =========================================================
     Home: question sets and past sessions
     ========================================================= */
  function renderHome() {
    var decks = Store.decks(), sessions = Store.sessions(), liveId = PC.store.get("live"), ls = liveId && Store.session(liveId);
    app.innerHTML = topBar() + '<main class="page stack-16" style="gap:22px">' + serverBanner() + backupBanner() +
      (ls && !ls.endedAt ? '<div class="banner warn" style="align-items:center;justify-content:space-between;flex-wrap:wrap"><span><b>A live session is still open:</b> ' + esc(ls.title) + " · room " + esc(ls.code) + '</span><span class="controls"><button type="button" class="btn primary" data-act="resume">Back to the room</button><button type="button" class="btn" data-act="end-old">End it</button></span></div>' : "") +
      '<section class="stack-16"><div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between"><h1 style="font-size:34px">Your question sets</h1><div class="controls">' +
      (decks.length ? '<button type="button" class="btn" data-act="backup-all" title="Download every question set, with photos, in one file">Back up all</button>' : "") + '<button type="button" class="btn" data-act="import" title="Open a .pollercrowd set or backup file">Import</button><button type="button" class="btn primary" data-act="new-deck">+ New question set</button></div></div>' +
      (decks.length ? decks.map(function (d) {
        return '<div class="deck-row"><div class="t"><b style="font-size:19px">' + esc(d.title || "Untitled") + '</b><div class="muted">' + d.n + (d.n === 1 ? " question" : " questions") + " · edited " + fmtDate(d.updated) + '</div></div><div class="controls">' +
          '<button type="button" class="btn primary" data-act="present" data-id="' + d.id + '">Present</button><button type="button" class="btn" data-act="edit" data-id="' + d.id + '">Edit</button>' +
          '<button type="button" class="btn small" data-act="dup" data-id="' + d.id + '">Duplicate</button><button type="button" class="btn small" data-act="export-deck" data-id="' + d.id + '">Download</button><button type="button" class="btn small danger" data-act="del-deck" data-id="' + d.id + '">Delete</button></div></div>';
      }).join("") : '<p class="muted">No question sets yet. Make one, or import one a colleague shared.</p>') + "</section>" +
      '<section class="stack-16"><h2 style="font-size:26px">Past sessions</h2>' +
      (sessions.length ? sessions.map(function (x) {
        return '<div class="deck-row"><div class="t"><b>' + esc(x.title) + '</b><div class="muted">' + fmtDate(x.startedAt) + " · room " + esc(x.code) + " · " + x.people + (x.people === 1 ? " person" : " people") + (x.endedAt ? "" : " · still open") + '</div></div><div class="controls">' +
          '<button type="button" class="btn" data-act="results" data-id="' + x.id + '">Results &amp; export</button><button type="button" class="btn small danger" data-act="del-session" data-id="' + x.id + '">Delete</button></div></div>';
      }).join("") : '<p class="muted">Results from your sessions will show up here. They stay only on this computer and are deleted after ' + (+(PC.cfg.keepSessionsDays || 30)) + " days.</p>") +
      "</section></main>" + footer();
    finish();
  }

  /* =========================================================
     Editor
     ========================================================= */
  var deck = null, saveDeckLater = PC.debounce(function () { if (deck) { Store.saveDeck(deck); paintSaved(true); } }, 500);
  function saveDeckSoon() { paintSaved(false); saveDeckLater(); }
  function paintSaved(done) { var el = $("#saveState"); if (el) el.innerHTML = done ? '<span class="dot"></span>All changes saved' : '<span class="dot wait"></span>Saving…'; }
  function renderEdit() {
    deck = Store.deck(editId);
    if (needPhotos(deck.questions)) PC.images.preload(deck.questions).then(function () { if (view === "edit") renderEdit(); });
    if (editQ >= deck.questions.length) editQ = Math.max(0, deck.questions.length - 1);
    var allProblems = deck.questions.map(R.problems);
    var bad = allProblems.filter(function (p) { return p.length; }).length;
    app.innerHTML = topBar('<span class="chip" id="saveState" role="status"><span class="dot"></span>All changes saved</span><button type="button" class="btn" data-act="home">← All sets</button><button type="button" class="btn primary" data-act="present" data-id="' + deck.id + '">Present</button>') +
      '<main class="page stack-16"><label class="field" style="max-width:640px"><span>Question set name</span><input class="input" id="deckTitle" value="' + esc(deck.title) + '" maxlength="80"></label>' +
      (bad ? '<div class="banner warn" id="probBanner">' + bad + (bad === 1 ? " question needs" : " questions need") + " a little more before you present. Look for the ⚠ marks.</div>" : "") +
      '<div class="builder"><nav class="side" aria-label="Questions"><span class="label">Questions</span><div class="qlist" id="qlist">' + qlistHTML(allProblems) + '</div>' +
      '<button type="button" class="btn" data-act="add-q" style="border-style:dashed">+ Add a question</button></nav>' +
      '<section class="main card" id="qedit"></section></div></main>' + footer();
    renderQEdit(); finish();
    $("#deckTitle").addEventListener("input", function (e) { deck.title = e.target.value; saveDeckSoon(); });
  }
  function qlistHTML(probs) {
    return deck.questions.map(function (q, i) {
      return '<button type="button" class="qitem" data-act="pick-q" data-i="' + i + '" aria-current="' + (i === editQ) + '"><span class="num">' + (i + 1) + '</span><span class="t"><b>' + (esc(q.prompt) || '<span class="muted">New question</span>') +
        "</b><small class=\"qtype\">" + R.icon(q.type, 14) + R.TYPES[q.type].name + (probs[i].length ? ' · <span class="warm">⚠ needs work</span>' : ' · <span style="color:var(--live)">✓ ready</span>') + "</small></span></button>";
    }).join("") || '<p class="muted">No questions yet.</p>';
  }
  function refreshList() {
    var probs = deck.questions.map(R.problems);
    $("#qlist").innerHTML = qlistHTML(probs);
    var bad = probs.filter(function (p) { return p.length; }).length, pb = $("#probBanner");
    if (pb) { if (bad) pb.textContent = bad + (bad === 1 ? " question needs" : " questions need") + " a little more before you present. Look for the ⚠ marks."; else pb.remove(); }
  }
  var TIMERS_MC = [[0, "No timer"], [15, "15 seconds"], [30, "30 seconds"], [60, "1 minute"], [90, "90 seconds"]];
  var TIMERS_SL = [[0, "No countdown"], [60, "1 minute"], [120, "2 minutes"], [180, "3 minutes"], [300, "5 minutes"], [600, "10 minutes"], [900, "15 minutes"]];
  var TIMERS_QZ = [[10, "10 seconds"], [15, "15 seconds"], [20, "20 seconds"], [30, "30 seconds"], [45, "45 seconds"], [60, "1 minute"]];
  function sel(name, list, val) { return '<select class="input" data-f="' + name + '">' + list.map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === String(val) ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>"; }
  function renderQEdit() {
    var box = $("#qedit");
    if (!deck.questions.length) { box.innerHTML = '<div class="frozen"><h3>Add your first question</h3><p class="muted">Pick “Add a question” on the left.</p></div>'; return; }
    var q = deck.questions[editQ], T = R.TYPES, h = "";
    h += '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between"><span class="label">Question ' + (editQ + 1) + " of " + deck.questions.length + '</span><span class="controls">' +
      '<button type="button" class="btn small" data-act="q-up" ' + (editQ === 0 ? "disabled" : "") + ' aria-label="Move up">↑</button><button type="button" class="btn small" data-act="q-down" ' + (editQ === deck.questions.length - 1 ? "disabled" : "") + ' aria-label="Move down">↓</button>' +
      '<button type="button" class="btn small" data-act="q-dup">Duplicate</button><button type="button" class="btn small danger" data-act="q-del">Delete</button></span></div>';
    h += '<fieldset><legend class="sr">Activity type</legend><div class="types">' + Object.keys(T).map(function (k) {
      return '<button type="button" class="type-btn" data-act="q-type" data-type="' + k + '" aria-pressed="' + (q.type === k) + '"><span class="g">' + T[k].glyph + "</span><span>" + T[k].name + '<br><small class="muted">' + T[k].hint + "</small></span></button>";
    }).join("") + "</div></fieldset>";
    h += '<label class="field"><span>' + (q.type === "sl" ? "Slide title" : "Your question") + '</span><textarea class="input" data-f="prompt" rows="2" maxlength="200" style="font:600 22px var(--display)"' + (q.type === "sl" ? ' placeholder="e.g. Welcome! or Stretch break"' : "") + ">" + esc(q.prompt) + "</textarea></label>";
    if (q.type === "sl") h += '<label class="field"><span>Extra text <span class="muted">(optional)</span></span><textarea class="input" data-f="body" rows="3" maxlength="500" placeholder="Instructions, a quote, what’s coming up next…">' + esc(q.body || "") + "</textarea></label>";
    var src = PC.images.cached(q.image);
    h += q.image ? '<div class="photo-edit"><img class="photo-thumb" src="' + (src || "") + '" alt=""><div class="stack-16" style="gap:8px;flex:1;min-width:220px"><label class="field"><span>Describe the photo <span class="muted">(for screen readers)</span></span><input class="input" data-f="imageAlt" maxlength="160" placeholder="e.g. Diagram of the layers of the atmosphere" value="' + esc(q.imageAlt || "") + '"></label>' +
      '<div class="controls"><button type="button" class="btn small" data-act="photo-add">Replace photo</button><button type="button" class="btn small danger" data-act="photo-del">Remove photo</button></div></div></div>'
      : '<div class="dropzone" data-act="photo-add" role="button" tabindex="0"><b>+ Add a photo</b><span class="note">Drag one here, paste it, or click to choose. It shows on the big screen next to the question.</span></div>';
    if (q.options) {
      var isRank = q.type === "rk", canCorrect = q.type === "mc" || q.type === "qz";
      h += '<fieldset class="stack-16" style="gap:10px"><legend>' + (isRank ? "Items to rank" : "Answers") + (canCorrect ? (q.type === "qz" ? ' <span class="muted" style="font-weight:600">· tick every correct answer (one or more)</span>' : ' <span class="muted" style="font-weight:600">· ticking correct answers is optional; you can tick more than one</span>') : "") + "</legend>" +
        q.options.map(function (o, i) {
          return '<div class="optrow"><span class="letter">' + (isRank ? i + 1 : R.LETTERS[i]) + '</span><input class="input" data-opt="' + i + '" value="' + esc(o) + '" maxlength="80" aria-label="' + (isRank ? "Item " : "Answer ") + (i + 1) + '">' +
            (canCorrect ? '<label class="check" style="min-height:44px"><input type="checkbox" data-correct="' + i + '"' + (R.corrects(q).indexOf(i) >= 0 ? " checked" : "") + "> Correct</label>" : "") +
            '<button type="button" class="btn icon small" data-act="opt-del" data-i="' + i + '" aria-label="Remove ' + (isRank ? "item " : "answer ") + (i + 1) + '"' + (q.options.length <= 2 ? " disabled" : "") + ">✕</button></div>";
        }).join("") +
        '<div class="controls">' + (q.options.length < (q.type === "qz" ? 6 : 8) ? '<button type="button" class="btn small" data-act="opt-add" style="border-style:dashed">+ Add ' + (isRank ? "item" : "answer") + "</button>" : "") +
        (q.type === "mc" && R.corrects(q).length ? '<button type="button" class="btn small" data-act="no-correct">Clear correct answers</button>' : "") + "</div></fieldset>";
    }
    h += '<div class="grid2">';
    if (q.type === "mc") h += '<label class="check"><input type="checkbox" data-f="multi"' + (q.multi ? " checked" : "") + "> People can pick more than one</label>" + '<label class="field"><span>Timer</span>' + sel("timer", TIMERS_MC, q.timer || 0) + "</label>";
    if (q.type === "qz") h += '<label class="field"><span>Time to answer</span>' + sel("timer", TIMERS_QZ, q.timer || 20) + '</label><p class="note" style="align-self:end">This is a competition: faster correct answers earn more points (500 to 1,000), points add up across all the quiz race questions in this set, and the session ends with a trophy podium.</p>';
    if (q.type === "wc") h += '<label class="field"><span>Words per person</span>' + sel("maxWords", [[1, "1 word"], [2, "Up to 2"], [3, "Up to 3"]], q.maxWords) + '</label><label class="check"><input type="checkbox" data-f="moderate"' + (q.moderate ? " checked" : "") + "> Hold words for my approval before they show</label>";
    if (q.type === "qa") h += '<label class="check"><input type="checkbox" data-f="moderate"' + (q.moderate ? " checked" : "") + '> Hold questions for my approval before they show</label><p class="note">People can ask up to 3 questions and upvote each other’s.</p>';
    if (q.type === "rs") h += '<label class="field"><span>Scale</span>' + sel("scaleMax", [[5, "1 to 5"], [10, "1 to 10"]], q.scaleMax) + '</label><span></span><label class="field"><span>Label for 1</span><input class="input" data-f="lowLabel" value="' + esc(q.lowLabel) + '" maxlength="30"></label><label class="field"><span>Label for ' + q.scaleMax + '</span><input class="input" data-f="highLabel" value="' + esc(q.highLabel) + '" maxlength="30"></label>';
    if (q.type === "rk") h += '<p class="note">People put the items in order on their phones. Results show the average place of each item.</p>';
    if (q.type === "th") h += '<label class="field"><span>❄ Cold pole <span class="muted">(left end)</span></span><input class="input" data-f="lowLabel" value="' + esc(q.lowLabel || "") + '" maxlength="40" placeholder="e.g. Totally disagree"></label><label class="field"><span>🔥 Hot pole <span class="muted">(right end)</span></span><input class="input" data-f="highLabel" value="' + esc(q.highLabel || "") + '" maxlength="40" placeholder="e.g. Totally agree"></label>' +
      '<p class="note" style="grid-column:1/-1">People slide a marker along a thermometer to show where they think it sits between the two poles. The big screen shows where the room landed and the crowd average.</p>';
    if (q.type === "sp") {
      var lv = q.levels || ["", "", ""];
      h += '<label class="field"><span>⟵ Left end</span><input class="input" data-f="lowLabel" value="' + esc(q.lowLabel || "") + '" maxlength="30" placeholder="e.g. Precision"></label>' +
        '<label class="field"><span>Right end ⟶</span><input class="input" data-f="highLabel" value="' + esc(q.highLabel || "") + '" maxlength="30" placeholder="e.g. Flexibility"></label>' +
        '<fieldset style="grid-column:1/-1;border:0;padding:0;margin:0"><legend style="font-weight:700;font-size:14px;color:var(--muted);margin-bottom:6px;padding:0">Levels, top to bottom <span class="muted" style="font-weight:600">· two or three, like trail signs</span></legend><div class="sp-lv">' +
        [["◆ Top", "e.g. Federal"], ["■ Middle (optional)", "e.g. State"], ["● Bottom", "e.g. Local"]].map(function (x, i) {
          return '<label class="field"><span>' + x[0] + '</span><input class="input" data-lvl="' + i + '" value="' + esc(lv[i] || "") + '" maxlength="18" placeholder="' + x[1] + '"></label>';
        }).join("") + "</div></fieldset>" +
        '<label class="field" style="grid-column:1/-1"><span>Cases to place, one per line <span class="muted" style="font-weight:600">· ' + window.PCSlopes.items(q).length + ' so far · add a short map label after a bar, like “Building zoning codes | Zoning codes”</span></span><textarea class="input" data-f="itemsText" rows="9" spellcheck="true">' + esc((q.items || []).join("\n")) + "</textarea></label>" +
        '<label class="check" style="grid-column:1/-1"><input type="checkbox" data-f="shuffle"' + (q.shuffle !== false ? " checked" : "") + "> Shuffle the order (the big screen still shows the next three, so you can pick or skip)</label>" +
        '<p class="note" style="grid-column:1/-1">Cases come up one at a time. People tap the map on their phones and lock in; spots stay hidden until you reveal the crowd average. The map fills up case by case until you hit the lodge.</p>';
    }
    if (q.type === "sl") h += '<label class="field"><span>Countdown</span>' + sel("timer", TIMERS_SL, q.timer || 0) + '</label><p class="note" style="align-self:end">Nothing to answer here. Use it for a welcome screen, instructions or a break. Phones show the title and point people to the big screen.</p>';
    h += "</div>";
    var p = R.problems(q);
    h += p.length ? '<div class="banner warn" id="qprob">⚠ ' + p.join(" ") + "</div>" : "";
    h += '<div class="done-row"><span class="note">Changes save automatically as you type.</span><button type="button" class="btn primary big" data-act="q-done">✓ Done with this question</button></div>';
    box.innerHTML = '<div class="stack-16" style="gap:20px">' + h + "</div>";
  }
  function onEditInput(e) {
    if (view !== "edit" || !e.target.closest("#qedit")) return;
    var q = deck.questions[editQ], t = e.target, f = t.getAttribute("data-f");
    if (t.hasAttribute("data-opt")) q.options[+t.getAttribute("data-opt")] = t.value;
    else if (t.hasAttribute("data-correct")) {
      var ci = +t.getAttribute("data-correct"), cs = R.corrects(q).filter(function (x) { return x !== ci; });
      if (t.checked) cs.push(ci);
      q.correct = cs.sort(function (a, b) { return a - b; });
    }
    else if (t.hasAttribute("data-lvl")) { if (!q.levels) q.levels = ["", "", ""]; q.levels[+t.getAttribute("data-lvl")] = t.value; }
    else if (f === "itemsText") { q.items = t.value.split("\n"); var cnt = t.closest(".field").querySelector("span .muted"); if (cnt) cnt.textContent = cnt.textContent.replace(/^· \d+ so far/, "· " + window.PCSlopes.items(q).length + " so far"); }
    else if (f === "multi" || f === "moderate" || f === "shuffle") q[f] = t.checked;
    else if (f === "timer" || f === "maxWords" || f === "scaleMax") { q[f] = +t.value; if (f === "scaleMax") renderQEdit(); }
    else if (f) q[f] = t.value;
    saveDeckSoon(); refreshList();
    if (e.type === "change" && (t.hasAttribute("data-correct"))) renderQEdit();
  }
  app.addEventListener("input", onEditInput);
  app.addEventListener("change", function (e) { if (e.target.type === "radio" || e.target.tagName === "SELECT" || e.target.type === "checkbox") onEditInput(e); });

  function questionDone() {
    var q = deck.questions[editQ], p = R.problems(q);
    Store.saveDeck(deck); paintSaved(true); refreshList();
    if (p.length) {
      renderQEdit(); var pb = $("#qprob"); if (pb) { pb.scrollIntoView({ behavior: "smooth", block: "center" }); pb.classList.remove("shake"); void pb.offsetWidth; pb.classList.add("shake"); }
      PC.toast("Almost there: " + p[0]); return;
    }
    var n = editQ + 1, last = editQ === deck.questions.length - 1;
    var m = PC.modal("Question " + n + " is ready ✓", '<p>It’s saved in “' + esc(deck.title) + '”. What next?</p><div class="stack-16" style="gap:10px;margin-top:16px">' +
      (last ? "" : '<button type="button" class="btn primary block" data-next="go">Edit question ' + (n + 1) + "</button>") +
      '<button type="button" class="btn block' + (last ? " primary" : "") + '" data-next="add">+ Add another question</button>' +
      '<button type="button" class="btn block" data-next="present">Present this set now</button>' +
      '<button type="button" class="btn block" data-next="home">Back to all sets</button></div>');
    m.el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-next]"); if (!b) return; var a = b.getAttribute("data-next"); m.close();
      if (a === "go") { editQ++; refreshList(); renderQEdit(); window.scrollTo({ top: 0, behavior: "smooth" }); }
      if (a === "add") addQuestion();
      if (a === "present") startSession(deck.id);
      if (a === "home") go("#");
    });
  }
  async function usePhotoFile(f) {
    if (!f || !/^image\//.test(f.type)) { PC.toast("That isn’t a photo. Try a JPG or PNG."); return; }
    if (f.size > 25 * 1024 * 1024) { PC.toast("That photo is too big (over 25 MB). Try a smaller one."); return; }
    try {
      PC.toast("Adding photo…");
      var id = await PC.images.add(f), q = deck.questions[editQ];
      q.image = id; if (!q.imageAlt) q.imageAlt = "";
      Store.saveDeck(deck); paintSaved(true); renderQEdit(); PC.toast("Photo added.");
    } catch (e) { PC.toast("Couldn’t read that file. Try a JPG or PNG photo."); }
  }
  // Drag a photo anywhere onto the question editor, or paste one
  document.addEventListener("dragover", function (e) {
    if (view !== "edit" || !deck || !deck.questions.length || !e.dataTransfer || [].indexOf.call(e.dataTransfer.types, "Files") < 0) return;
    e.preventDefault(); var b = $("#qedit"); if (b) b.classList.add("dropping");
  });
  document.addEventListener("dragleave", function (e) { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest("#qedit")) { var b = $("#qedit"); if (b) b.classList.remove("dropping"); } });
  document.addEventListener("drop", function (e) {
    var b = $("#qedit"); if (b) b.classList.remove("dropping");
    if (view !== "edit" || !deck || !deck.questions.length || !e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault(); usePhotoFile(e.dataTransfer.files[0]);
  });
  document.addEventListener("paste", function (e) {
    if (view !== "edit" || !deck || !deck.questions.length || !e.clipboardData) return;
    var item = [].filter.call(e.clipboardData.items || [], function (it) { return it.kind === "file" && /^image\//.test(it.type); })[0];
    if (item) { e.preventDefault(); usePhotoFile(item.getAsFile()); }
  });
  document.addEventListener("keydown", function (e) { var d = e.target.closest && e.target.closest(".dropzone[data-act]"); if (d && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); d.click(); } });
  function pickPhoto() {
    var inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.onchange = function () { usePhotoFile(inp.files[0]); };
    inp.click();
  }
  function addQuestion() {
    var m = PC.modal("Add a question", '<div class="types">' + Object.keys(R.TYPES).map(function (k) {
      return '<button type="button" class="type-btn" data-new="' + k + '"><span class="g">' + R.TYPES[k].glyph + "</span><span>" + R.TYPES[k].name + '<br><small class="muted">' + R.TYPES[k].hint + "</small></span></button>";
    }).join("") + "</div>");
    m.el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-new]"); if (!b) return;
      var q = R.blank(b.getAttribute("data-new"));
      if ((q.type === "wc" || q.type === "qa") && Store.settings().hold) q.moderate = true;
      deck.questions.splice(editQ + 1, 0, q); editQ = deck.questions.length === 1 ? 0 : editQ + 1;
      Store.saveDeck(deck); m.close(); renderEdit();
      var ta = $('#qedit [data-f="prompt"]'); if (ta) ta.focus();
    });
  }

  /* =========================================================
     Live room
     ========================================================= */
  var live = null; // { s, keys, conn, srv, ... }
  var PRESENT_MS = 70000;

  async function startSession(deckId) {
    if (!PC.secure) {
      PC.modal("Open the secure address", '<p>Rooms need your browser’s security features, which only work when the page address starts with <b>https://</b>.</p><p class="note" style="margin-top:10px">If you just set up a custom domain on GitHub Pages, turn on <b>Enforce HTTPS</b> in the repository’s Settings → Pages (it can take a few minutes to become available). If you opened the file straight from your computer, use the local server described in the README instead.</p><div class="modal-actions"><button type="button" class="btn primary" data-close>OK</button></div>');
      return;
    }
    var dd = Store.deck(deckId), mode = "teacher";
    var nqz = dd ? dd.questions.filter(function (q) { return q.type === "qz" && !R.problems(q).length; }).length : 0;
    if (nqz) { mode = await chooseMode(nqz, dd.questions.length); if (!mode) return; }
    try { await startSessionInner(deckId, mode); }
    catch (e) { console.error(e); PC.modal("Couldn’t open the room", '<p>' + esc((e && e.message) || String(e)) + '</p><p class="note" style="margin-top:10px">Try reloading the page. If it keeps happening, use “Feedback or bug?” at the bottom and mention your browser.</p><div class="modal-actions"><button type="button" class="btn primary" data-close>OK</button></div>'); }
  }
  function chooseMode(nqz, total) {
    return new Promise(function (resolve) {
      var picked = null;
      var m = PC.modal("How should the quiz race run?", '<div class="stack-16" style="gap:12px">' +
        '<button type="button" class="mode-card" data-mode="teacher"><b>Together, led by you</b><span>One question at a time on the big screen. You start each question and reveal the answer. Works with every question in the set.</span></button>' +
        '<button type="button" class="mode-card" data-mode="self"><b>Self-paced race</b><span>People race through the ' + nqz + (nqz === 1 ? " quiz race question" : " quiz race questions") + ' on their own phones, each with their own timer. The big screen shows a live leaderboard, then the podium.' +
        (total > nqz ? " Other kinds of questions in this set are skipped." : "") + "</span></button></div>",
        { onClose: function () { resolve(picked); } });
      m.el.addEventListener("click", function (e) { var b = e.target.closest("[data-mode]"); if (b) { picked = b.getAttribute("data-mode"); m.close(); } });
    });
  }
  async function startSessionInner(deckId, mode) {
    var d = Store.deck(deckId);
    var probs = d.questions.map(R.problems);
    var badIdx = probs.map(function (p, i) { return p.length ? i + 1 : 0; }).filter(Boolean);
    if (!d.questions.length) { PC.toast("Add a question first."); return; }
    if (badIdx.length) {
      var okGo = await PC.confirm("Some questions aren’t ready", "Question " + badIdx.join(", ") + " still need" + (badIdx.length === 1 ? "s" : "") + " work and will be skipped. Present the rest?", "Present anyway");
      if (!okGo) return;
    }
    var old = PC.store.get("live"); var os = old && Store.session(old);
    if (os && !os.endedAt) {
      var end = await PC.confirm("End the open session?", "“" + esc(os.title) + "” (room " + esc(os.code) + ") is still open. Starting a new one will end it. Its results stay in Past sessions.", "End it and start");
      if (!end) return;
      os.endedAt = Date.now(); Store.saveSession(os);
    }
    var keys = await PC.keys.create();
    var qs = d.questions.filter(function (q, i) { return !probs[i].length; }).map(function (q) {
      var c = JSON.parse(JSON.stringify(q));
      if (c.options) {
        var keep = [], map = {};
        c.options.forEach(function (o, i) { if (String(o || "").trim()) { map[i] = keep.length; keep.push(String(o).trim()); } });
        c.options = keep;
        if (c.type === "mc" || c.type === "qz") c.correct = R.corrects(c).map(function (i) { return map[i]; }).filter(function (i) { return i != null; });
      }
      if (c.type === "sp") { c.items = window.PCSlopes.cleanLines(c); c.levels = window.PCSlopes.levels(c); }
      c.prompt = String(c.prompt).trim();
      return c;
    });
    if (mode === "self") qs = qs.filter(function (q) { return q.type === "qz"; });
    var srv = PC.server.current();
    var s = {
      id: PC.uid(8), deckId: d.id, title: d.title || "Untitled", code: keys.code, fp: keys.fp,
      keys: { pub: keys.pub, jwk: keys.jwk }, server: PC.server.save(srv),
      startedAt: Date.now(), endedAt: null, qi: 0, questions: qs, status: {}, answers: {}, words: {}, qa: {}, roster: {}, kicked: [], locked: false, showJoin: true,
      mode: mode === "self" ? "self" : "teacher"
    };
    if (s.mode === "self") s.race = { state: "lobby", starts: {}, prog: {} };
    Store.saveSession(s); PC.store.set("live", s.id);
    go("#live");
  }

  async function resumeLive() {
    var id = PC.store.get("live"), s = id && Store.session(id);
    if (!s || s.endedAt) { PC.store.del("live"); go("#"); return; }
    if (live && live.s.id === s.id) { renderLive(); return; }
    if (live) stopLive();
    var srv = PC.server.load(s.server);
    live = { s: s, srv: srv, keys: await PC.keys.load(s.keys), devPub: {}, bucket: {}, status: "connecting", hostStatus: "connecting", lastSent: 0, pending: null, seq: Date.now() };
    live.conn = PC.connect(srv);
    live.conn.join(s.code, "teacher", {
      onMessage: onStudentMessage,
      onStatus: function (st, d) { live.status = st; checkFull(st, d); paintConn(); if (st === "SUBSCRIBED") sendState(true); },
      onHostStatus: function (st, d) { live.hostStatus = st; checkFull(st, d); paintConn(); }
    });
    live.tick = setInterval(tick, 1000);
    await PC.images.preload(s.questions);
    if (s.mode !== "self" && !s.status[curQ().id]) openQuestion(s.qi, true);
    renderLive();
  }
  function pauseLiveView() { /* keep the room running while the teacher looks at other screens */ }
  function stopLive() {
    if (!live) return;
    clearInterval(live.tick); clearTimeout(live.pending); live.conn.close(); live = null;
  }
  function curQ() { return live.s.questions[live.s.qi]; }
  function curSt() { var q = curQ(); return live.s.status[q.id] || (live.s.status[q.id] = { open: false }); }
  var saveSoon = PC.debounce(function () { if (live) Store.saveSession(live.s); }, 800);

  function openQuestion(i, initial) {
    var s = live.s; s.qi = PC.clamp(i, 0, s.questions.length - 1);
    var q = curQ(), st = s.status[q.id];
    if (!st) {
      st = s.status[q.id] = { open: false, hideResults: !Store.settings().liveResults || q.type === "qz", revealed: false };
      if (q.type === "sp") st.sp = spStart(q);
      if (!needsStart(q)) startVoting(st, q);
    }
    if (!initial) { sendState(true); saveSoon(); renderLive(); }
  }
  // Timed questions wait for the teacher to press Start, so the clock doesn't run while people are still joining
  function needsStart(q) { return q.type === "qz" || !!q.timer; }
  function startVoting(st, q) {
    st.open = true; st.openedAt = Date.now();
    st.endsAt = q.timer ? Date.now() + q.timer * 1000 : null;
  }
  function tick() {
    if (!live) return;
    var now = Date.now();
    if (live.s.mode === "self") {
      if (view === "live") { paintCrowd(); if (live.s.race.state === "running" && !live.s.podium) paintRaceSoon(); }
      if (now - live.lastSent > 20000) sendState(false);
      return;
    }
    var st = curSt();
    if (st.open && st.endsAt && now >= st.endsAt) { st.open = false; st.endsAt = null; sendState(true); saveSoon(); if (view === "live") renderStage(); }
    if (view === "live") { paintTimer(); paintCrowd(); }
    if (now - live.lastSent > 20000) sendState(false); // keep late joiners in sync
  }

  /* ---------- state sent to phones (signed) ---------- */
  function present() {
    var now = Date.now(), r = live.s.roster;
    return Object.keys(r).filter(function (p) { return now - (r[p].seen || 0) < PRESENT_MS && live.s.kicked.indexOf(p) < 0; });
  }
  function buildState() {
    var s = live.s, now = Date.now();
    var d = { v: ++live.seq, code: s.code, title: s.title, ended: !!s.endedAt, locked: !!s.locked, kicked: s.kicked };
    var roster = {}; Object.keys(s.roster).forEach(function (p) { var x = s.roster[p]; roster[p] = x.k + "." + x.v + "." + x.l; });
    d.roster = roster;
    if (s.mode === "self") { d.self = raceState(); if (s.podium) addPodium(d); return d; }
    var q = curQ(), st = curSt();
    d.q = { id: q.id, i: s.qi, n: s.questions.length, type: q.type, prompt: q.prompt, open: !!st.open, revealed: !!st.revealed, left: st.open && st.endsAt ? Math.max(0, st.endsAt - now) : null };
    if (q.options) d.q.options = q.options;
    if (q.type === "mc") d.q.multi = !!q.multi;
    if (q.type === "wc") d.q.maxWords = q.maxWords || 1;
    if (q.type === "rs") { d.q.scaleMax = q.scaleMax; d.q.lowLabel = q.lowLabel; d.q.highLabel = q.highLabel; }
    if (q.type === "th") { d.q.lowLabel = q.lowLabel; d.q.highLabel = q.highLabel; }
    if (q.type === "sp" && st.sp) {
      var sp = st.sp, idx = sp.order[sp.pos], spi = window.PCSlopes.items(q)[idx];
      d.q.sp = { phase: sp.phase, low: q.lowLabel, high: q.highLabel, lv: q.levels };
      if (spi && sp.phase !== "lodge") { d.q.sp.i = idx; d.q.sp.title = spi.title; d.q.sp.n = sp.phase === "place" ? sp.done.length + 1 : sp.done.indexOf(idx) + 1; }
    }
    if (q.type === "sl") { d.q.body = q.body || ""; if (st.openedAt && !st.open && q.timer) d.q.done = 1; }
    if (q.timer) d.q.timer = q.timer;
    if (q.image) d.q.photo = 1;
    d.q.started = !!st.openedAt;
    if (q.type === "wc" || q.type === "qa") d.q.moderate = !!q.moderate;
    if (st.revealed && R.corrects(q).length) d.q.correct = R.corrects(q);
    if (q.type === "qa") {
      var list = (s.qa[q.id] || []).filter(function (x) { return x.ok && !x.hidden; })
        .sort(function (a, b) { return (a.answered - b.answered) || (b.votes.length - a.votes.length) || (a.at - b.at); }).slice(0, 40);
      d.q.qa = list.map(function (x) { return { id: x.id, text: x.text, n: x.votes.length, a: x.answered ? 1 : 0 }; });
    }
    if (q.type === "qz" && st.revealed) {
      var all = R.leaderboard(s, 0, q.id), mine = {};
      all.forEach(function (x) { mine[x.pub] = [x.pts, x.rank, all.length]; });
      var A = s.answers[q.id] || {};
      Object.keys(A).forEach(function (p) { if (mine[p]) mine[p].push(A[p].pts || 0); });
      d.q.scores = mine;
      d.q.top = all.slice(0, 5).map(function (x) { return { b: x.k + "." + x.v + "." + x.l, nick: x.nick, pts: x.pts }; });
    }
    if (s.podium) addPodium(d);
    return d;
  }
  function addPodium(d) {
    var s = live.s;
    {
      var lb = R.leaderboard(s, 0, null, true), sc = {};
      lb.forEach(function (x) { sc[x.pub] = [x.rank, x.pts]; });
      var step = s.podium.step;
      d.podium = { step: step, n: lb.length, scores: step >= 3 ? sc : {},
        top: lb.filter(function (x) { return x.rank <= 3 && x.rank > 3 - step; }).map(function (x) { return { b: x.k + "." + x.v + "." + x.l, nick: x.nick, pts: x.pts, rank: x.rank }; }) };
    }
    return d;
  }
  // Throttled: teacher actions go out right away; joins and new questions are batched
  // so a class of 100 stays under Supabase's free message limits.
  function sendState(urgent) {
    if (!live) return;
    var gap = urgent ? 250 : 2500, wait = Math.max(0, live.lastSent + gap - Date.now());
    if (live.pending) { if (!urgent) return; clearTimeout(live.pending); }
    live.pending = setTimeout(async function () {
      live.pending = null; if (!live) return;
      live.lastSent = Date.now();
      var d = JSON.stringify(buildState());
      try { var sig = await PC.keys.sign(live.keys, d); await live.conn.broadcast({ pk: live.keys.pub, d: d, sig: sig }); }
      catch (e) { console.warn("broadcast failed", e); }
    }, wait);
  }

  /* ---------- messages from phones ---------- */
  async function pubFor(dev) {
    if (live.devPub[dev]) return live.devPub[dev];
    return (live.devPub[dev] = await PC.hashId(dev));
  }
  function allow(pub) { // at most 12 messages per 10 seconds per phone
    var now = Date.now(), b = live.bucket[pub] || (live.bucket[pub] = []);
    while (b.length && now - b[0] > 10000) b.shift();
    if (b.length >= 12) return false; b.push(now); return true;
  }
  function cleanText(t, max) {
    t = String(t || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
    return F.clean(t).text;
  }
  async function onStudentMessage(m) {
    if (!live || !m || typeof m !== "object" || typeof m.dev !== "string" || m.dev.length < 8 || m.dev.length > 64) return;
    var s = live.s, pub = await pubFor(m.dev);
    if (s.kicked.indexOf(pub) >= 0 || s.endedAt || !allow(pub)) return;
    var r = s.roster[pub], now = Date.now(), changed = false;
    if (m.t === "sync") { sendState(false); return; }
    if (m.t === "hi") {
      if (!r && s.locked) { sendState(false); return; }
      var b = m.b || {}, k = B.ORDER.indexOf(b.k) >= 0 ? b.k : "penguin", l = ["none", "beanie", "sunglasses", "glasses", "beard"].indexOf(b.l) >= 0 ? b.l : "none";
      var v = PC.clamp(parseInt(b.v, 10) || 0, 0, 3);
      // Give out a pattern nobody else in the room has for this buddy and look
      var taken = {}; Object.keys(s.roster).forEach(function (p) { if (p !== pub) { var x = s.roster[p]; if (x.k === k && x.l === l) taken[x.v] = 1; } });
      if (taken[v]) { for (var i = 0; i < 4; i++) if (!taken[i]) { v = i; break; } }
      var nick = cleanText(m.nick, 16);
      if (!r || r.k !== k || r.v !== v || r.l !== l || r.nick !== nick) changed = true;
      s.roster[pub] = { k: k, v: v, l: l, nick: nick, seen: now, joined: r ? r.joined : now };
      if (changed) { sendState(false); saveSoon(); paintSoon(); }
      return;
    }
    if (!r) { sendState(false); return; } // must say hi first
    r.seen = now;
    if (m.t === "ping") return;
    if (m.t === "bye") { r.seen = 0; return; }
    if (s.mode === "self") { onRaceMessage(m, pub, now); return; }
    var q = curQ(), st = curSt();
    if (m.q !== q.id) return;
    var A = s.answers[q.id] || (s.answers[q.id] = {});
    if (m.t === "ans") {
      if (q.type === "sl") return;
      if (!st.open || (st.endsAt && now > st.endsAt + 1500)) return;
      var val = m.v, n = (q.options || []).length;
      if (q.type === "mc") {
        if (q.multi) { if (!Array.isArray(val)) return; val = val.filter(function (x, i, a) { return Number.isInteger(x) && x >= 0 && x < n && a.indexOf(x) === i; }).slice(0, n); if (!val.length) return; }
        else if (!Number.isInteger(val) || val < 0 || val >= n) return;
        A[pub] = val;
      } else if (q.type === "qz") {
        if (A[pub] || !Number.isInteger(val) || val < 0 || val >= n) return; // first answer counts
        var ms = now - (st.openedAt || now);
        A[pub] = { c: val, ms: ms, pts: R.quizPoints(q, val, ms) };
      } else if (q.type === "rs") {
        if (!Number.isInteger(val) || val < 1 || val > (q.scaleMax || 5)) return;
        A[pub] = val;
      } else if (q.type === "th") {
        if (!Number.isInteger(val) || val < 0 || val > 100) return;
        A[pub] = val;
      } else if (q.type === "sp") {
        var sp = st.sp; if (!sp || sp.phase !== "place" || !val || typeof val !== "object") return;
        var cur = sp.order[sp.pos];
        if (val.i !== cur || !Number.isInteger(val.x) || !Number.isInteger(val.y) || val.x < 0 || val.x > 1000 || val.y < 0 || val.y > 1000) return;
        var spots = A[pub] && typeof A[pub] === "object" && !Array.isArray(A[pub]) ? A[pub] : {};
        spots[cur] = [val.x, val.y]; A[pub] = spots;
      } else if (q.type === "rk") {
        if (!Array.isArray(val) || val.length !== n) return;
        var seen = {}; for (var j = 0; j < n; j++) { if (!Number.isInteger(val[j]) || val[j] < 0 || val[j] >= n || seen[val[j]]) return; seen[val[j]] = 1; }
        A[pub] = val.slice();
      } else return;
      changedResults();
      return;
    }
    if (m.t === "word" && q.type === "wc") {
      if (!st.open) return;
      var list = s.words[q.id] || (s.words[q.id] = []);
      var mine = list.filter(function (w) { return w.pub === pub; });
      if (mine.length >= (q.maxWords || 1)) return;
      var w = cleanText(m.w, 25); if (!w) return;
      list.push({ id: PC.uid(6), pub: pub, text: w, ok: !q.moderate, hidden: false, at: now });
      changedResults(); if (q.moderate) paintModBadge();
      return;
    }
    if (m.t === "ask" && q.type === "qa") {
      if (!st.open) return;
      var qa = s.qa[q.id] || (s.qa[q.id] = []);
      if (qa.filter(function (x) { return x.pub === pub; }).length >= 3) return;
      var text = cleanText(m.text, 160); if (text.length < 2) return;
      qa.push({ id: PC.uid(6), pub: pub, text: text, votes: [], ok: !q.moderate, hidden: false, answered: false, at: now });
      changedResults(); if (q.moderate) paintModBadge(); else sendState(false);
      return;
    }
    if (m.t === "up" && q.type === "qa") {
      var item = (s.qa[q.id] || []).filter(function (x) { return x.id === m.id; })[0];
      if (!item || item.pub === pub) return;
      var at = item.votes.indexOf(pub);
      if (m.on && at < 0) item.votes.push(pub); else if (!m.on && at >= 0) item.votes.splice(at, 1); else return;
      changedResults(); sendState(false);
    }
  }
  var paintSoon = PC.debounce(function () { if (view === "live") { if (live && live.s.mode === "self" && !live.s.podium) renderStage(); else renderResultsArea(); paintCrowd(); refreshDrawer(); } }, 250);
  function changedResults() { saveSoon(); paintSoon(); }

  /* ---------- live view ---------- */
  function renderLive() {
    if (view !== "live" || !live) return;
    var s = live.s;
    var joinUrl = PC.joinUrl(s.code, s.fp, live.srv), short = PC.siteBase().replace(/^https?:\/\//, "").replace(/\/$/, "") + "/join";
    app.innerHTML = topBar('<span class="chip" id="connChip"><span class="dot wait"></span>Connecting…</span>' +
      '<button type="button" class="btn" data-act="people">People <span class="badge" id="peopleN">0</span></button>' +
      '<button type="button" class="btn" data-act="moderate">Moderation <span class="badge" id="modN" hidden>0</span></button>' +
      '<button type="button" class="btn" data-act="more" aria-haspopup="true">More ▾</button>') +
      '<div class="stage' + (s.showJoin ? "" : " nojoin") + '" id="stage"><section class="q" id="qbox"></section>' +
      '<aside class="join" aria-label="How to join"><h2 style="font-size:28px">Join the crowd</h2><div class="qr">' + PC.qrSVG(joinUrl) + "</div>" +
      (live.srv.mode === "supabase" && !live.srv.own ? '<span style="font-weight:600;color:var(--inv-muted)">Scan with your phone camera, or go to</span><span class="join-url">' + esc(short) + "</span>" +
        '<div class="roomcode"><span class="label">Room code</span><b>' + esc(s.code.replace("-", " ")) + "</b></div>"
        : '<span style="font-weight:600;color:var(--inv-muted)">Scan with your phone camera to join.</span><div class="roomcode"><span class="label">Room</span><b>' + esc(s.code.replace("-", " ")) + "</b></div>" +
          (live.srv.mode === "demo" ? '<span class="note" style="color:var(--inv-muted)">Demo mode: open the link in another tab of this browser.</span>' : '<span class="note" style="color:var(--inv-muted)">This room uses your own server, so people need the QR code or link.</span>')) +
      '<button type="button" class="btn small" data-act="copy-link" style="border-color:var(--inv-muted);color:var(--inv-ink)">Copy join link</button>' +
      '<div style="margin-top:auto">' + PC.igloo(180) + "</div></aside></div>" + footer();
    finish(); renderStage(); paintConn(); paintCrowd(); paintModBadge();
  }
  function renderStage() {
    var box = $("#qbox"); if (!box || !live) return;
    if (live.s.podium) { renderPodium(box); return; }
    if (live.s.mode === "self") { renderRace(box); return; }
    if (curQ().type === "sp") { renderSlopesStage(box); return; }
    var s = live.s, q = curQ(), st = curSt(), T = R.TYPES[q.type];
    var ctrl = [];
    ctrl.push('<button type="button" class="btn" data-act="prev"' + (s.qi === 0 ? " disabled" : "") + '>← Back</button>');
    if (q.type === "sl") {
      if (q.timer) ctrl.push('<button type="button" class="btn' + (st.openedAt ? "" : " primary") + '" data-act="start">' + (st.openedAt ? "Restart the countdown" : "Start the " + fmtDur(q.timer) + " countdown") + "</button>");
    }
    else if (needsStart(q) && !st.openedAt) ctrl.push('<button type="button" class="btn primary" data-act="start">' + (q.type === "qz" ? "Start the " + (q.timer || 20) + "-second race" : "Start the " + q.timer + "-second timer") + "</button>");
    else if (!st.revealed) ctrl.push('<button type="button" class="btn" data-act="toggle-open">' + (st.open ? "Close answers" : "Reopen answers") + "</button>");
    if (q.type !== "qz" && q.type !== "sl") ctrl.push('<button type="button" class="btn" data-act="toggle-results">' + (st.hideResults ? "Show results" : "Hide results") + "</button>");
    if ((q.type === "mc" && R.corrects(q).length) || q.type === "qz") ctrl.push('<button type="button" class="btn' + (st.revealed ? "" : " solid") + '" data-act="reveal"' + (q.type === "qz" && !st.openedAt ? " disabled" : "") + ">" + (st.revealed ? "Hide answer" : "Reveal answer") + "</button>");
    ctrl.push('<button type="button" class="btn primary" data-act="next">' + (s.qi === s.questions.length - 1 ? (hasQuiz(s) && !s.podiumShown ? "Show the podium →" : "Finish") : "Next →") + "</button>");
    box.innerHTML = '<div style="display:flex;flex-direction:column;gap:12px"><div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;align-items:center"><span class="label">' + (q.type === "sl" ? "Slide · " + (s.qi + 1) + " of " + s.questions.length : "Question " + (s.qi + 1) + " of " + s.questions.length + " · " + T.name) +
      '</span><span class="chip" id="statusChip"></span></div><h1 class="q-title' + (q.type === "sl" ? " slide-title" : "") + '">' + esc(q.prompt) + "</h1></div>" +
      (q.image ? '<div class="q-body"><figure class="q-media"><button type="button" class="photo-btn" data-act="photo-zoom" aria-label="Show the photo larger"><img src="' + (PC.images.cached(q.image) || "") + '" alt="' + esc(q.imageAlt || "Photo for this question") + '"></button></figure><div id="resultsArea" aria-live="polite"></div></div>' : '<div id="resultsArea" aria-live="polite"></div>') +
      '<div class="controls" id="ctrl">' + ctrl.join("") + "</div>" +
      '<div class="crowd-row"><span class="label" id="crowdLabel">In the igloo · 0</span><div class="crowd" id="crowd"></div></div>';
    renderResultsArea(); paintTimer();
  }
  function renderResultsArea() {
    var el = $("#resultsArea"); if (!el || !live || live.s.podium || live.s.mode === "self") return;
    var s = live.s, q = curQ(), st = curSt();
    if (q.type === "sp") { renderSlopesArea(el); return; }
    if (q.type === "sl") {
      el.innerHTML = '<div class="stack-16" style="gap:22px">' + R.view(s, q).html + (q.timer ? '<div class="big-timer" id="bigTimer"><span class="label">' + (st.openedAt ? (st.open ? "Back in" : "Time’s up!") : "Countdown") + "</span><b>" + fmtClock(st.open && st.endsAt ? st.endsAt - Date.now() : st.openedAt ? 0 : q.timer * 1000) + "</b></div>" : "") +
        (q.body || q.timer || q.image ? "" : '<p class="muted" style="font-size:20px">Phones are showing this title too. Press Next when you’re ready.</p>') + "</div>";
      var bt = $("#bigTimer"); if (bt && st.openedAt && !st.open) bt.classList.add("done");
      var sc = $("#statusChip"); if (sc) sc.innerHTML = '<span class="dot off"></span>Info slide · nothing to answer<span id="timerTxt"></span>';
      return;
    }
    var r = R.view(s, q, { controls: true });
    var n = r.data.total, label = q.type === "wc" ? r.data.entries + (r.data.entries === 1 ? " word" : " words") + " from " + n : q.type === "qa" ? r.data.items.length + (r.data.items.length === 1 ? " question" : " questions") : n + (n === 1 ? " answer" : " answers");
    if (needsStart(q) && !st.openedAt) el.innerHTML = '<div class="frozen"><h3>Get ready…</h3><p class="muted">Press Start when everyone’s in.' + (q.type === "qz" ? " Faster correct answers score more." : " People get " + q.timer + " seconds.") + "</p></div>";
    else if ((st.hideResults && !st.revealed) || (q.type === "qz" && !st.revealed)) {
      var count = '<p class="answers-in"><b>' + n + "</b> " + (n === 1 ? "answer" : "answers") + (q.type === "qz" ? (st.open ? " in so far" : " in · time’s up!") : " in · results hidden for now") + "</p>";
      el.innerHTML = (q.options && q.options.length ? optionCards(q) : '<div class="frozen"><h3>Results are frozen for now</h3></div>') + count;
    }
    else el.innerHTML = r.html;
    if (r.data.pending) label += " · " + r.data.pending + " waiting for you";
    var chip = $("#statusChip");
    if (chip) chip.innerHTML = '<span class="dot' + (st.open ? "" : " off") + '"></span>' + (st.open ? "Open" : st.revealed ? "Answer shown" : "Closed") + " · " + label + '<span id="timerTxt"></span>';
  }
  /* ---------- Slopes on the big screen ---------- */
  var SP = window.PCSlopes;
  function spStart(q) {
    var order = SP.items(q).map(function (_, i) { return i; });
    if (q.shuffle !== false) for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = order[i]; order[i] = order[j]; order[j] = t; }
    return { order: order, pos: 0, phase: "place", done: [], view: "avg", hl: null };
  }
  var LIFT = '<svg width="26" height="22" viewBox="0 0 26 22" aria-hidden="true"><path d="M0 2 L26 6" stroke="currentColor" stroke-width="2"/><path d="M13 4 V12 M6 12 H20 M6 12 V18 H20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function spLocked(sp, A) { var idx = sp.order[sp.pos], n = 0; Object.keys(A || {}).forEach(function (p) { if (A[p] && A[p][idx]) n++; }); return n; }
  function renderSlopesStage(box) {
    var s = live.s, q = curQ(), st = curSt(), sp = st.sp || (st.sp = spStart(q)), its = SP.items(q), idx = sp.order[sp.pos], it = its[idx];
    var lodge = sp.phase === "lodge", placing = sp.phase === "place", n = placing ? sp.done.length + 1 : sp.done.indexOf(idx) + 1, last = s.qi === s.questions.length - 1;
    var ctrl = ['<button type="button" class="btn" data-act="prev"' + (s.qi === 0 ? " disabled" : "") + ">← Back</button>"];
    if (lodge) ctrl.push('<button type="button" class="btn" data-act="sp-ride">⛷ Keep riding</button>');
    else if (placing) ctrl.push('<button type="button" class="btn primary" data-act="sp-reveal">Reveal the crowd average</button>', '<button type="button" class="btn" data-act="sp-skipcur">Skip this case</button>');
    else ctrl.push('<button type="button" class="btn primary" data-act="sp-next">' + (sp.pos >= sp.order.length - 1 ? "To the lodge →" : "Next case →") + "</button>");
    if (!lodge) ctrl.push('<button type="button" class="btn" data-act="sp-lodge"' + (sp.done.length ? "" : " disabled") + '>🏔 Hit the Lodge</button>');
    ctrl.push('<button type="button" class="btn' + (lodge ? " primary" : "") + '" data-act="next">' + (last ? (hasQuiz(s) && !s.podiumShown ? "Show the podium →" : "Finish") : "Next question →") + "</button>");
    var head = lodge ? '<div class="sp-lift"><span class="chip sp-chip">' + LIFT + 'At the lodge</span><h1 class="q-title">' + esc(q.prompt) + '</h1><p class="sp-prompt muted">' + sp.done.length + (sp.done.length === 1 ? " case" : " cases") + " on the map</p></div>"
      : '<div class="sp-lift"><span class="chip sp-chip">' + LIFT + "On the lift · Case " + n + '</span><h1 class="q-title">' + esc(it ? it.title : "") + '</h1><p class="sp-prompt muted">' + esc(q.prompt) + "</p></div>";
    box.innerHTML = '<div style="display:flex;flex-direction:column;gap:12px"><div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;align-items:center"><span class="label">Question ' + (s.qi + 1) + " of " + s.questions.length + ' · Slopes</span><span class="chip" id="statusChip"></span></div>' + head + "</div>" +
      '<div id="resultsArea" aria-live="polite"></div><div class="controls" id="ctrl">' + ctrl.join("") + "</div>" +
      '<div class="crowd-row"><span class="label" id="crowdLabel">In the igloo · 0</span><div class="crowd" id="crowd"></div></div>';
    renderResultsArea();
  }
  function renderSlopesArea(el) {
    var s = live.s, q = curQ(), st = curSt(), sp = st.sp, its = SP.items(q), idx = sp.order[sp.pos];
    var r = SP.compute(s, q), list = r.items, lodge = sp.phase === "lodge", placing = sp.phase === "place", revealed = sp.phase === "revealed";
    var opts = { mode: sp.view, hl: sp.hl, id: "live" }, note = "";
    if (sp.view === "orig") {
      var focus = sp.hl != null ? sp.hl : revealed ? idx : list.length ? list[list.length - 1].id : null;
      list = list.filter(function (x) { return x.id === focus; }); opts.hl = null;
      note = list.length ? "Showing case " + list[0].n + " · pick another in the trail log" : "Nothing revealed yet";
    } else if (revealed && sp.hl == null) opts.show = idx;
    var up = lodge ? [] : sp.order.slice(sp.pos + 1, sp.pos + 4), canPick = revealed;
    var h = '<div class="sp-board"><div class="sp-mapcol"><div class="sp-bar"><div class="seg" role="group" aria-label="Map view"><button type="button" data-act="sp-view" data-v="avg" aria-pressed="' + (sp.view !== "orig") + '">Crowd average</button><button type="button" data-act="sp-view" data-v="orig" aria-pressed="' + (sp.view === "orig") + '">Individual Run</button></div><span class="note">' + esc(note) + "</span></div>" + SP.svg(q, list, opts) + "</div>";
    h += '<div class="sp-side">';
    if (!lodge) {
      h += '<span class="label">Up next</span>' + (up.length ? up.map(function (id, k) {
        return '<div class="sp-card"><button type="button" class="sp-pick" data-act="sp-pick" data-i="' + k + '"' + (canPick ? "" : " disabled") + ">" + esc(its[id].title) + "<small>" + (canPick ? "Ride this one next →" : "On deck") + '</small></button><button type="button" class="sp-skip" data-act="sp-skip" data-i="' + k + '" aria-label="Skip ' + esc(its[id].short) + '">Skip ✕</button></div>';
      }).join("") : '<p class="note">That’s every case. Next stop: the lodge!</p>') + (up.length && !canPick ? '<p class="note">Reveal this case, then pick one to ride next.</p>' : "");
    }
    h += '<span class="label" style="margin-top:6px">Trail log</span><div class="sp-log">' + (r.items.length ? r.items.map(function (x) {
      return '<button type="button" data-act="sp-hl" data-i="' + x.id + '" aria-pressed="' + (sp.hl === x.id) + '"><span class="sp-n">' + x.n + '</span><span style="flex:1">' + esc(x.label) + '</span><small class="muted">' + esc(SP.levelOf(q, x.y)) + "</small></button>";
    }).join("") : '<p class="note">Revealed cases show up here. Click one to spotlight it.</p>') + "</div></div></div>";
    el.innerHTML = h;
    var chip = $("#statusChip"), A = s.answers[q.id] || {};
    if (chip) {
      var k = spLocked(sp, A), here = present().length;
      chip.innerHTML = '<span class="dot' + (placing && st.open ? "" : " off") + '"></span>' + (lodge ? "At the lodge · " + r.items.length + " cases" : placing ? k + " of " + here + " locked in" : "Revealed · " + k + (k === 1 ? " spot" : " spots"));
    }
  }
  function spNext() {
    var st = curSt(), sp = st.sp, q = curQ();
    if (sp.pos >= sp.order.length - 1) { spLodge(); return; }
    sp.pos++; sp.phase = "place"; sp.hl = null; startVoting(st, q);
    sendState(true); saveSoon(); renderStage();
  }
  function spLodge() { var st = curSt(), sp = st.sp; sp.prev = sp.phase; sp.phase = "lodge"; sp.hl = null; st.open = false; st.endsAt = null; sendState(true); saveSoon(); renderStage(); }

  // The answer choices, big, for the projector (no vote counts)
  function optionCards(q) {
    return '<div class="optgrid">' + q.options.map(function (o, i) { return '<div class="optcard"><span class="letter">' + R.LETTERS[i] + "</span><span>" + esc(o) + "</span></div>"; }).join("") + "</div>";
  }
  function fmtClock(ms) { var t = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); }
  function fmtDur(sec) { return sec < 60 ? sec + "-second" : (sec / 60) + "-minute"; }
  function paintTimer() {
    var t = $("#timerTxt"); if (!t || !live) return;
    var st = curSt();
    if (curQ().type === "sl") { var bt = $("#bigTimer b"); if (bt && st.open && st.endsAt) bt.textContent = fmtClock(st.endsAt - Date.now()); t.textContent = ""; return; } t.textContent = st.open && st.endsAt ? " · " + Math.max(0, Math.ceil((st.endsAt - Date.now()) / 1000)) + "s" : "";
  }
  // The server is at its limit of people at once: say so plainly, once
  function checkFull(st, d) {
    if (st === "SUBSCRIBED") { live.full = false; return; }
    if (!/ERROR|TIMED|CLOSED/.test(st) || !PC.isFull(d)) return;
    live.full = true;
    if (live.toldFull) return; live.toldFull = true;
    var n = PC.capacity(live.srv);
    PC.modal("The connection is full", "<p>" + (live.srv.own ? "Your own " + (live.srv.mode === "firebase" ? "Firebase" : "Supabase") + " project handles about " + n + " devices at once, and it’s at that limit." : "Poller Crowd’s free shared connection handles about " + n + " people at once, counting every room using it right now, and it’s full.") +
      "</p><p>People already in can keep going. Anyone else will see “This room is full” and will get in automatically as spots open.</p>" +
      (live.srv.own ? "" : '<p>To stop this happening, <a href="setup.html" target="_blank" rel="noopener">set up your own free connection</a> (about 5 minutes). Then the limit is yours alone.</p>') +
      '<div class="modal-actions"><button type="button" class="btn primary" data-close>OK</button></div>');
  }
  function paintConn() {
    var c = $("#connChip"); if (!c || !live) return;
    var ok = live.status === "SUBSCRIBED" && live.hostStatus === "SUBSCRIBED", bad = /ERROR|TIMED|CLOSED/.test(live.status + live.hostStatus);
    c.innerHTML = '<span class="dot' + (ok ? "" : bad ? " off" : " wait") + '"></span>' + (ok ? "Live · room " + esc(live.s.code) : live.full ? "Connection full" : bad ? "Reconnecting…" : "Connecting…") + (live.srv.mode === "demo" ? " (demo)" : "");
    c.title = bad ? "Can't reach the server. Answers will arrive once it reconnects. If this keeps up, check Settings > Test connection." : "";
  }
  function paintCrowd() {
    var el = $("#crowd"); if (!el || !live) return;
    var ids = present(), s = live.s;
    $("#crowdLabel").textContent = "In the igloo · " + ids.length + (s.locked ? " · locked" : "");
    var pn = $("#peopleN"); if (pn) pn.textContent = ids.length;
    var key = ids.join(",") + "|" + ids.map(function (p) { var x = s.roster[p]; return x.k + x.v + x.l; }).join("");
    if (el.getAttribute("data-key") === key) return;
    el.setAttribute("data-key", key);
    var shown = ids.slice(0, 24);
    el.innerHTML = shown.map(function (p) { var x = s.roster[p]; return B.svg(x.k, x.v, x.l, 44); }).join("") + (ids.length > shown.length ? '<span class="more">+' + (ids.length - shown.length) + "</span>" : "") +
      (ids.length ? "" : '<span class="muted">Buddies show up here as people join.</span>');
  }
  function pendingCount() {
    if (!live) return 0;
    var s = live.s, n = 0;
    Object.keys(s.words).forEach(function (k) { n += s.words[k].filter(function (w) { return !w.ok && !w.hidden; }).length; });
    Object.keys(s.qa).forEach(function (k) { n += s.qa[k].filter(function (w) { return !w.ok && !w.hidden; }).length; });
    return n;
  }
  function paintModBadge() { var b = $("#modN"); if (!b) return; var n = pendingCount(); b.textContent = n; b.hidden = !n; }

  /* ---------- drawers: moderation & people ---------- */
  function drawer(title, body) {
    var old = $(".drawer"); if (old) old.remove();
    var d = document.createElement("aside"); d.className = "drawer"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", title);
    d.innerHTML = '<div class="modal-head"><h2>' + esc(title) + '</h2><button type="button" class="btn icon small" data-act="close-drawer" aria-label="Close">✕</button></div><div class="stack-16" id="drawerBody">' + body + "</div>";
    document.body.appendChild(d); d.querySelector("button").focus(); return d;
  }
  function modBody() {
    var s = live.s, q = curQ(), pend = [], shown = [];
    if (q.type === "wc") (s.words[q.id] || []).forEach(function (w) { if (!w.hidden) (w.ok ? shown : pend).push({ id: w.id, text: w.text, kind: "word" }); });
    if (q.type === "qa") (s.qa[q.id] || []).forEach(function (w) { if (!w.hidden) (w.ok ? shown : pend).push({ id: w.id, text: w.text, kind: "qa" }); });
    if (q.type !== "wc" && q.type !== "qa") return '<p class="muted">Moderation is for word clouds and Q&amp;A. This question doesn’t take typed answers.</p><p class="note">Swear words and slurs are always replaced with #!*&amp; automatically. Add your own banned words in Settings.</p>';
    return '<p class="note">Rude words are replaced with #!*&amp; automatically. ' + (q.moderate ? "This question holds new " + (q.type === "wc" ? "words" : "questions") + " for you to approve." : "Turn on “Hold for my approval” in the question editor to check everything first.") + "</p>" +
      '<span class="label">Waiting for approval · ' + pend.length + "</span>" + (pend.length ? '<button type="button" class="btn small" data-act="approve-all">Approve all</button>' : "") +
      pend.map(function (x) { return '<div class="mod-item"><span class="t">' + esc(x.text) + '</span><button type="button" class="btn small primary" data-mod="ok" data-k="' + x.kind + '" data-id="' + x.id + '">Show</button><button type="button" class="btn small" data-mod="hide" data-k="' + x.kind + '" data-id="' + x.id + '">Reject</button></div>'; }).join("") +
      '<span class="label">On screen · ' + shown.length + "</span>" +
      shown.map(function (x) { return '<div class="mod-item"><span class="t">' + esc(x.text) + '</span><button type="button" class="btn small" data-mod="hide" data-k="' + x.kind + '" data-id="' + x.id + '">Hide</button></div>'; }).join("");
  }
  function peopleBody() {
    var s = live.s, ids = Object.keys(s.roster).filter(function (p) { return s.kicked.indexOf(p) < 0; }), now = Date.now();
    ids.sort(function (a, b) { return (s.roster[b].seen || 0) - (s.roster[a].seen || 0); });
    return '<div class="controls"><button type="button" class="btn" data-act="lock">' + (s.locked ? "Unlock room" : "Lock room") + '</button></div><p class="note">' + (s.locked ? "Locked: nobody new can join. People already in can keep answering." : "Lock the room once everyone’s in, so nobody else can wander in.") + "</p>" +
      '<span class="label">People · ' + ids.length + "</span>" +
      (ids.length ? ids.map(function (p) {
        var x = s.roster[p], on = now - (x.seen || 0) < PRESENT_MS;
        return '<div class="person">' + B.svg(x.k, x.v, x.l, 40) + '<span class="t">' + esc(R.buddyName(x)) + '<br><small class="muted">' + (on ? "here" : "away") + '</small></span><button type="button" class="btn small danger" data-kick="' + p + '">Remove</button></div>';
      }).join("") : '<p class="muted">Nobody yet.</p>') +
      (s.kicked.length ? '<span class="label">Removed · ' + s.kicked.length + '</span><button type="button" class="btn small" data-act="unkick">Let removed people back in</button>' : "");
  }
  function refreshDrawer() {
    var d = $(".drawer"); if (!d) return;
    var t = d.getAttribute("aria-label");
    $("#drawerBody").innerHTML = t === "Moderation" ? modBody() : peopleBody();
  }

  /* =========================================================
     Results page
     ========================================================= */
  function renderResults(id) {
    var s = Store.session(id);
    if (needPhotos(s.questions)) PC.images.preload(s.questions).then(function () { if (view === "results") renderResults(id); });
    var hasQuiz = s.questions.some(function (q) { return q.type === "qz"; });
    app.innerHTML = topBar('<button type="button" class="btn" data-act="home">← Home</button>') +
      '<main class="page stack-16" style="gap:22px"><div><span class="label">Results</span><h1 style="font-size:38px">' + esc(s.title) + '</h1><p class="muted">' + fmtDate(s.startedAt) + " · room " + esc(s.code) + " · " + Object.keys(s.roster).length + " people" + (s.endedAt ? "" : " · still open") + '</p><p class="note" style="margin-top:6px">For checking understanding and sparking discussion, not for grades: answers are anonymous and nothing confirms who answered. <a href="privacy.html#grading" target="_blank" rel="noopener">Why?</a></p></div>' +
      '<div class="card stack-16"><h2 style="font-size:22px">Export</h2><div class="controls"><button type="button" class="btn primary" data-exp="pptx" data-id="' + s.id + '">PowerPoint (a slide per question)</button>' +
      '<button type="button" class="btn" data-exp="summary" data-id="' + s.id + '">Summary (print or save as PDF)</button><button type="button" class="btn" data-exp="csv" data-id="' + s.id + '">Spreadsheet (CSV)</button></div>' +
      '<p class="note">Answers are anonymous: exports show buddies and optional nicknames only, never names or emails.</p></div>' +
      s.questions.map(function (q, i) {
        var v = R.view(s, q, { reveal: true, limit: 100 });
        var im = q.image && PC.images.cached(q.image);
        return '<section class="card stack-16"><span class="label">' + (q.type === "sl" ? "Slide " + (i + 1) + " · Info slide" : "Question " + (i + 1) + " · " + R.TYPES[q.type].name + " · " + (v.data.total) + (v.data.total === 1 ? " person" : " people")) + '</span><h2 style="font-size:28px">' + esc(q.prompt) + "</h2>" +
          (im ? '<img class="photo-result" src="' + im + '" alt="' + esc(q.imageAlt || "Photo for this question") + '">' : "") + v.html + "</section>";
      }).join("") +
      (hasQuiz ? '<section class="card stack-16"><h2>Final quiz leaderboard</h2>' + (R.leaderboard(s, 10).map(function (x) { return '<div class="leader"><span class="rank">' + x.rank + "</span>" + B.svg(x.k, x.v, x.l, 44) + '<span class="who">' + esc(R.buddyName(x)) + '</span><span class="pts">' + x.pts + "</span></div>"; }).join("") || '<p class="muted">No quiz answers were revealed.</p>') + "</section>" : "") +
      '<div class="controls" style="justify-content:center;padding:8px 0 4px"><button type="button" class="btn primary big" data-act="home">← Back to Poller Crowd home</button></div>' +
      "</main>" + footer();
    finish();
  }

  /* =========================================================
     Settings
     ========================================================= */
  function openSettings() {
    var st = Store.settings(), site = PC.server.site(), own = PC.store.get("ownServer", {}) || {}, choice = PC.store.get("serverChoice", "site");
    if (choice === "site" && !site) choice = own.url ? "own" : "demo";
    var m = PC.modal("Settings", '<form class="stack-16" id="setForm" style="gap:22px">' +
      '<fieldset class="stack-16" style="gap:10px"><legend>Live connection</legend>' +
      '<label class="check"><input type="radio" name="srv" value="site"' + (choice === "site" ? " checked" : "") + (site ? "" : " disabled") + "> Poller Crowd’s shared server" + (site ? "" : ' <span class="muted">(not set up on this site yet)</span>') + "</label>" +
      '<label class="check"><input type="radio" name="srv" value="own"' + (choice === "own" ? " checked" : "") + "> My own free project <span class=\"muted\">(your own limit, nobody else’s sessions count)</span></label>" +
      '<div class="stack-16" id="ownBox" style="gap:12px;padding-left:30px">' +
      '<div role="radiogroup" aria-label="Which service" style="display:flex;flex-wrap:wrap;gap:8px 22px"><label class="check"><input type="radio" name="prov" value="supabase"' + (own.type !== "firebase" ? " checked" : "") + "> <b>Supabase</b> <span class=\"muted\">up to 200 at once</span></label>" +
      '<label class="check"><input type="radio" name="prov" value="firebase"' + (own.type === "firebase" ? " checked" : "") + "> <b>Firebase</b> <span class=\"muted\">up to 100 at once</span></label></div>" +
      '<div class="stack-16" id="sbBox" style="gap:10px"><label class="field"><span>Supabase Project URL</span><input class="input" name="url" placeholder="https://abcdefgh.supabase.co" value="' + esc(own.url || "") + '" autocomplete="off"></label>' +
      '<label class="field"><span>Publishable key (or legacy anon key)</span><input class="input" name="key" placeholder="sb_publishable_…" value="' + esc(own.key || "") + '" autocomplete="off"></label>' +
      '<p class="note">From your Supabase project: Project Settings → API Keys. These are public keys, safe to use in a web page.</p></div>' +
      '<div class="stack-16" id="fbBox" style="gap:10px"><label class="field"><span>Firebase Realtime Database URL</span><input class="input" name="fbUrl" placeholder="https://your-project-default-rtdb.firebaseio.com" value="' + esc(own.fbUrl || "") + '" autocomplete="off"></label>' +
      '<p class="note">From the Firebase console: Databases &amp; Storage → Realtime Database, the link at the top of the Data tab. You also paste a short set of rules once (it’s in the guide).</p></div>' +
      '<div class="controls"><button type="button" class="btn" data-test>Test connection</button><span id="testMsg" role="status"></span></div>' +
      '<p class="note"><a href="setup.html" target="_blank" rel="noopener">Step-by-step setup guide</a>, including how to let an AI assistant walk you through it.</p></div>' +
      '<label class="check"><input type="radio" name="srv" value="demo"' + (choice === "demo" ? " checked" : "") + "> Demo mode <span class=\"muted\">(people in other tabs of this browser, for trying things out)</span></label></fieldset>" +
      '<fieldset class="stack-16" style="gap:6px"><legend>New questions</legend><label class="check"><input type="checkbox" name="hold"' + (st.hold ? " checked" : "") + "> Hold word cloud and Q&amp;A answers for my approval by default</label>" +
      '<label class="check"><input type="checkbox" name="liveResults"' + (st.liveResults ? " checked" : "") + "> Show results on screen as they come in (you can hide them anytime)</label></fieldset>" +
      '<label class="field"><span>Extra banned words (one per line or separated by commas)</span><textarea class="input" name="banned" rows="3" placeholder="e.g. a nickname for a rival team">' + esc((st.banned || []).join("\n")) + '</textarea><span class="note">Common swear words and slurs are already blocked. These are added on top, on this computer.</span></label>' +
      '<fieldset class="stack-16" style="gap:8px"><legend>Your data</legend><p class="note">Question sets and results are saved only in this browser. Past sessions are deleted after ' + (+(PC.cfg.keepSessionsDays || 30)) + ' days. Back them up now and then: a backup file has every set and its photos, and <b>Import</b> brings them back on any computer.</p><div class="controls"><button type="button" class="btn small" data-act="backup-all">Back up all question sets</button><button type="button" class="btn small danger" data-wipe>Delete all past sessions</button></div></fieldset>' +
      '<div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn primary">Save</button></div></form>', { wide: true });
    var f = m.el.querySelector("#setForm");
    function syncOwn() {
      m.el.querySelector("#ownBox").style.opacity = f.elements.srv.value === "own" ? 1 : .5;
      var fb = f.elements.prov.value === "firebase";
      m.el.querySelector("#sbBox").hidden = fb; m.el.querySelector("#fbBox").hidden = !fb;
    }
    function ownFromForm() {
      return f.elements.prov.value === "firebase" ? { mode: "firebase", url: PC.cleanFbUrl(f.elements.fbUrl.value) } : { mode: "supabase", url: f.elements.url.value.trim().replace(/\/+$/, ""), key: f.elements.key.value.trim() };
    }
    f.addEventListener("change", syncOwn); syncOwn();
    m.el.querySelector("[data-test]").addEventListener("click", async function () {
      var msg = m.el.querySelector("#testMsg"); msg.innerHTML = '<span class="chip"><span class="dot wait"></span>Testing…</span>';
      var r = await PC.testServer(ownFromForm());
      msg.innerHTML = r.ok ? '<span class="chip"><span class="dot"></span>Connected! You’re all set.</span>' : '<span class="warm" style="font-weight:700">' + esc(r.why) + "</span>";
    });
    m.el.querySelector("[data-wipe]").addEventListener("click", async function () {
      if (!(await PC.confirm("Delete all past sessions?", "This removes every saved result on this computer. Question sets are kept.", "Delete them", true))) return;
      Store.sessions().forEach(function (x) { if (x.id !== PC.store.get("live")) Store.delSession(x.id); });
      PC.toast("Past sessions deleted."); if (view === "home") renderHome();
    });
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var url = f.elements.url.value.trim().replace(/\/+$/, ""), key = f.elements.key.value.trim(), srv = f.elements.srv.value;
      var prov = f.elements.prov.value, fbUrl = PC.cleanFbUrl(f.elements.fbUrl.value);
      if (srv === "own" && prov === "supabase" && (!/^https:\/\/.+/.test(url) || key.length < 20)) { PC.toast("Add your Supabase Project URL (https://…) and key, or pick another option."); return; }
      if (srv === "own" && prov === "firebase" && !PC.fbUrlOk(fbUrl)) { PC.toast("Add your Firebase Realtime Database URL (https://…firebaseio.com or …firebasedatabase.app)."); return; }
      PC.store.set("ownServer", url || key || fbUrl ? { type: prov, url: url, key: key, fbUrl: fbUrl } : null);
      PC.store.set("serverChoice", srv);
      Store.saveSettings({ hold: f.elements.hold.checked, liveResults: f.elements.liveResults.checked, banned: f.elements.banned.value.split(/[\n,]+/).map(function (x) { return x.trim(); }).filter(Boolean) });
      m.close(); PC.toast(live ? "Saved. The open room keeps its current connection." : "Settings saved.");
      if (view === "home") renderHome();
    });
  }

  /* =========================================================
     Import / export question sets
     ========================================================= */
  function downloadFile(name, text, type) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: type || "application/json" })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  window.PCDownload = downloadFile;
  function fileSafe(s) { return String(s || "poller-crowd").replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 60) || "poller-crowd"; }
  // Turn one set from a file into a fresh deck (new photo ids, only known question types, sane lengths)
  async function deckFromFile(d, pics, newIds) {
    var src = (d.questions || []).filter(function (q) { return q && R.TYPES[q.type]; });
    for (var i = 0; i < src.length; i++) { // save each photo once, even if several sets share it
      var pid = src[i].image;
      if (pid && !newIds[pid] && /^data:image\/(jpeg|png|webp|gif);base64,/.test(String(pics[pid] || ""))) newIds[pid] = await PC.images.save(pics[pid]);
    }
    var qs = src.map(function (q) {
      var n = R.blank(q.type); Object.keys(n).forEach(function (k) { if (k !== "id" && k !== "image" && k !== "imageAlt" && q[k] != null) n[k] = q[k]; });
      if (q.image && newIds[q.image]) { n.image = newIds[q.image]; n.imageAlt = String(q.imageAlt || "").slice(0, 160); }
      n.prompt = String(n.prompt || "").slice(0, 200); if (n.options) n.options = n.options.slice(0, 8).map(function (o) { return String(o || "").slice(0, 80); });
      return n;
    });
    return { id: PC.uid(8), title: String(d.title || "Imported set").slice(0, 80), questions: qs };
  }
  function importDeck() {
    var inp = document.createElement("input"); inp.type = "file"; inp.accept = ".pollercrowd,.json,application/json,text/plain";
    inp.onchange = async function () {
      try {
        var d = JSON.parse(await inp.files[0].text());
        var pics = d && d.images && typeof d.images === "object" ? d.images : {}, newIds = {};
        var sets = d && Array.isArray(d.sets) ? d.sets : d && Array.isArray(d.questions) ? [d] : null;
        if (!sets || !sets.length) throw 0;
        var made = [];
        for (var k = 0; k < sets.length && k < 200; k++) {
          if (!sets[k] || !Array.isArray(sets[k].questions)) continue;
          var nd = await deckFromFile(sets[k], pics, newIds); Store.saveDeck(nd); markBackedUp([nd.id]); made.push(nd.title);
        }
        if (!made.length) throw 0;
        PC.toast(made.length === 1 ? "Imported “" + made[0] + "”." : "Imported " + made.length + " question sets."); renderHome();
      } catch (e) { PC.toast("That file isn’t a Poller Crowd question set or backup."); }
    };
    inp.click();
  }

  /* ---------- backups: question sets live only in this browser ---------- */
  function markBackedUp(ids) { var b = PC.store.get("backedUp", {}); ids.forEach(function (id) { b[id] = Date.now(); }); PC.store.set("backedUp", b); }
  function isSample(d) { return /^Sample: /.test(d.title || ""); }
  function unbacked() { var b = PC.store.get("backedUp", {}); return Store.decks().filter(function (d) { return !isSample(d) && d.n > 0 && (d.updated || 0) > (b[d.id] || 0) + 2000; }); }
  async function packDecks(decks) {
    var pics = {}, sets = [];
    for (var i = 0; i < decks.length; i++) {
      var de = Store.deck(decks[i].id); if (!de) continue;
      await PC.images.preload(de.questions);
      de.questions.forEach(function (q) { if (q.image && PC.images.cached(q.image)) pics[q.image] = PC.images.cached(q.image); });
      sets.push({ title: de.title, questions: de.questions });
    }
    return { sets: sets, images: pics };
  }
  async function backupAll() {
    var decks = Store.decks(); if (!decks.length) { PC.toast("No question sets to back up yet."); return; }
    var p = await packDecks(decks), d = new Date();
    downloadFile("Poller Crowd backup " + d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") + ".pollercrowd",
      JSON.stringify({ app: "Poller Crowd", version: 1, backup: true, sets: p.sets, images: p.images }, null, 1));
    markBackedUp(decks.map(function (x) { return x.id; })); PC.store.del("backupSnooze");
    PC.toast("Backup downloaded: " + p.sets.length + (p.sets.length === 1 ? " set" : " sets") + ". Keep it somewhere safe, like a cloud drive."); if (view === "home") renderHome();
  }
  function backupBanner() {
    var u = unbacked(); if (!u.length) return "";
    var oldest = Math.min.apply(null, u.map(function (d) { return d.updated || Date.now(); })), snooze = PC.store.get("backupSnooze", 0);
    if (Date.now() < snooze) return "";
    if (u.length < 3 && Date.now() - oldest < 2 * 864e5) return ""; // don't nag about a set made a minute ago
    return '<div class="banner" style="align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px"><span><b>Back up your question sets.</b> They’re saved only in this browser, so clearing browser data or switching computers would lose them. ' +
      u.length + (u.length === 1 ? " set has" : " sets have") + ' changes that aren’t backed up.</span><span class="controls"><button type="button" class="btn small primary" data-act="backup-all">Download a backup</button><button type="button" class="btn small" data-act="backup-later">Remind me next week</button></span></div>';
  }

  /* =========================================================
     Clicks
     ========================================================= */
  document.addEventListener("click", async function (e) {
    var b = e.target.closest("[data-act],[data-exp],[data-mod],[data-kick],[data-qa-ans],[data-qa-hide]"); if (!b) return;
    var act = b.getAttribute("data-act"), id = b.getAttribute("data-id");
    if (b.hasAttribute("data-exp")) { var sx = Store.session(id); if (live && live.s.id === id) sx = live.s; window.PCExport[b.getAttribute("data-exp")](sx); return; }
    if (live && b.hasAttribute("data-mod")) {
      var k = b.getAttribute("data-k"), list = (k === "word" ? live.s.words : live.s.qa)[curQ().id] || [];
      list.forEach(function (x) { if (x.id === b.getAttribute("data-id")) { if (b.getAttribute("data-mod") === "ok") x.ok = true; else x.hidden = true; } });
      changedResults(); paintModBadge(); refreshDrawer(); if (k === "qa") sendState(false); return;
    }
    if (live && b.hasAttribute("data-kick")) {
      var p = b.getAttribute("data-kick"), x = live.s.roster[p];
      if (!(await PC.confirm("Remove this person?", "The " + esc(R.buddyName(x)) + " will be sent out of the room and can’t rejoin from that phone. Their answers so far stay in the results.", "Remove", true))) return;
      live.s.kicked.push(p); sendState(true); saveSoon(); refreshDrawer(); paintCrowd(); return;
    }
    if (live && (b.hasAttribute("data-qa-ans") || b.hasAttribute("data-qa-hide"))) {
      var qid = b.getAttribute("data-qa-ans") || b.getAttribute("data-qa-hide");
      (live.s.qa[curQ().id] || []).forEach(function (x) { if (x.id === qid) { if (b.hasAttribute("data-qa-ans")) x.answered = !x.answered; else x.hidden = true; } });
      changedResults(); sendState(false); return;
    }
    switch (act) {
      case "home": go("#"); break;
      case "settings": openSettings(); break;
      case "new-deck": var nd = { id: PC.uid(8), title: "New question set", questions: [] }; Store.saveDeck(nd); editQ = 0; go("#edit/" + nd.id); setTimeout(addQuestion, 50); break;
      case "edit": editQ = 0; go("#edit/" + id); break;
      case "dup": var dd = Store.deck(id); dd.id = PC.uid(8); dd.title = dd.title + " (copy)"; dd.questions.forEach(function (q) { q.id = PC.uid(8); }); Store.saveDeck(dd); renderHome(); break;
      case "del-deck": if (await PC.confirm("Delete this question set?", "“" + esc(Store.deck(id).title) + "” will be deleted from this computer. Past results are kept.", "Delete", true)) { Store.delDeck(id); renderHome(); } break;
      case "export-deck":
        var de = Store.deck(id); await PC.images.preload(de.questions);
        var pics = {}; de.questions.forEach(function (q) { if (q.image && PC.images.cached(q.image)) pics[q.image] = PC.images.cached(q.image); });
        downloadFile(fileSafe(de.title) + ".pollercrowd", JSON.stringify({ app: "Poller Crowd", version: 1, title: de.title, questions: de.questions, images: pics }, null, 1)); markBackedUp([id]); if (view === "home") renderHome(); break;
      case "import": importDeck(); break;
      case "backup-all": backupAll(); break;
      case "backup-later": PC.store.set("backupSnooze", Date.now() + 7 * 864e5); renderHome(); break;
      case "present": if (deck && view === "edit") Store.saveDeck(deck); startSession(id); break;
      case "resume": go("#live"); break;
      case "end-old": var oid = PC.store.get("live"), os = Store.session(oid); if (os && await PC.confirm("End this session?", "Everyone will see that it’s over. Results stay in Past sessions.", "End session")) { os.endedAt = Date.now(); Store.saveSession(os); PC.store.del("live"); renderHome(); } break;
      case "results": go("#results/" + id); break;
      case "del-session": if (await PC.confirm("Delete these results?", "This can’t be undone.", "Delete", true)) { if (live && live.s.id === id) stopLive(); Store.delSession(id); renderHome(); } break;
      case "add-q": addQuestion(); break;
      case "pick-q": editQ = +b.getAttribute("data-i"); refreshList(); renderQEdit(); break;
      case "q-up": case "q-down":
        var j = editQ + (act === "q-up" ? -1 : 1), qs = deck.questions, tmp = qs[editQ]; qs[editQ] = qs[j]; qs[j] = tmp; editQ = j; Store.saveDeck(deck); refreshList(); renderQEdit(); break;
      case "q-dup": var cp = JSON.parse(JSON.stringify(deck.questions[editQ])); cp.id = PC.uid(8); deck.questions.splice(editQ + 1, 0, cp); editQ++; Store.saveDeck(deck); refreshList(); renderQEdit(); break;
      case "q-del": if (await PC.confirm("Delete this question?", "", "Delete", true)) { deck.questions.splice(editQ, 1); editQ = Math.max(0, editQ - 1); Store.saveDeck(deck); renderEdit(); } break;
      case "q-type": var t = b.getAttribute("data-type"), cq = deck.questions[editQ]; if (cq.type !== t) { deck.questions[editQ] = R.convert(cq, t); if ((t === "wc" || t === "qa") && Store.settings().hold) deck.questions[editQ].moderate = true; Store.saveDeck(deck); refreshList(); renderQEdit(); } break;
      case "opt-add": deck.questions[editQ].options.push(""); Store.saveDeck(deck); renderQEdit(); var ins = $$("#qedit [data-opt]"); ins[ins.length - 1].focus(); break;
      case "opt-del":
        var oq = deck.questions[editQ], oi = +b.getAttribute("data-i"); oq.options.splice(oi, 1);
        if (oq.type === "mc" || oq.type === "qz") {
          oq.correct = R.corrects(oq).filter(function (x) { return x !== oi; }).map(function (x) { return x > oi ? x - 1 : x; });
          if (oq.type === "qz" && !oq.correct.length) oq.correct = [0];
        }
        Store.saveDeck(deck); refreshList(); renderQEdit(); break;
      case "photo-add": pickPhoto(); break;
      case "q-done": questionDone(); break;
      case "photo-del": delete deck.questions[editQ].image; delete deck.questions[editQ].imageAlt; Store.saveDeck(deck); renderQEdit(); break;
      case "photo-zoom": var zi = $(".q-media img"); if (zi) PC.modal(curQ().prompt, '<img src="' + zi.src + '" alt="' + esc(zi.alt) + '" style="width:100%;border-radius:16px;display:block">', { wide: true }); break;
      case "no-correct": deck.questions[editQ].correct = []; Store.saveDeck(deck); renderQEdit(); break;
      // ---- live ----
      case "prev": openQuestion(live.s.qi - 1); break;
      case "next":
        if (live.s.qi === live.s.questions.length - 1) { if (hasQuiz(live.s) && !live.s.podiumShown) openPodium(); else endSession(); }
        else openQuestion(live.s.qi + 1);
        break;
      case "podium-next": live.s.podium.step = nextStep(); sendState(true); saveSoon(); renderStage(); break;
      case "podium-back": live.s.podium = null; sendState(true); saveSoon(); renderStage(); break;
      case "race-start": raceStart(); break;
      case "race-end": if (live.s.race.state === "running") { if (await PC.confirm("End the race?", "People who haven’t finished will stop where they are. Then the podium!", "End the race")) raceEnd(); } else raceEnd(); break;
      case "end": endSession(); break;
      case "start": startVoting(curSt(), curQ()); sendState(true); saveSoon(); renderStage(); break;
      case "toggle-open": var so = curSt(); if (so.open) { so.open = false; so.endsAt = null; } else startVoting(so, curQ()); sendState(true); saveSoon(); renderStage(); break;
      case "toggle-results": curSt().hideResults = !curSt().hideResults; saveSoon(); renderStage(); break;
      case "sp-view": curSt().sp.view = b.getAttribute("data-v"); saveSoon(); renderResultsArea(); break;
      case "sp-hl": var hsp = curSt().sp, hi = +b.getAttribute("data-i"); hsp.hl = hsp.hl === hi ? null : hi; saveSoon(); renderResultsArea(); break;
      case "sp-reveal":
        var rst = curSt(), rsp = rst.sp, ridx = rsp.order[rsp.pos];
        rsp.phase = "revealed"; rsp.hl = null; rst.open = false; rst.endsAt = null; if (rsp.done.indexOf(ridx) < 0) rsp.done.push(ridx);
        sendState(true); saveSoon(); renderStage(); break;
      case "sp-next": spNext(); break;
      case "sp-pick":
        var psp = curSt().sp, pat = psp.pos + 1 + (+b.getAttribute("data-i"));
        if (pat < psp.order.length) { psp.order.splice(psp.pos + 1, 0, psp.order.splice(pat, 1)[0]); spNext(); } break;
      case "sp-skip":
        var ksp = curSt().sp, kat = ksp.pos + 1 + (+b.getAttribute("data-i"));
        if (kat < ksp.order.length) {
          var kid = ksp.order.splice(kat, 1)[0];
          if (ksp.order.length - (ksp.pos + 1) >= 3) { ksp.order.push(kid); PC.toast("Skipped: sent to the bottom of the pile."); } else PC.toast("Skipped.");
          saveSoon(); renderResultsArea();
        } break;
      case "sp-skipcur":
        if (!(await PC.confirm("Skip this case?", "It goes to the bottom of the pile, and spots already placed on it are cleared.", "Skip it"))) break;
        var cst = curSt(), csp = cst.sp, cq = curQ(), cid = csp.order[csp.pos], CA = live.s.answers[cq.id] || {};
        Object.keys(CA).forEach(function (pp) { if (CA[pp] && CA[pp][cid]) delete CA[pp][cid]; });
        csp.order.splice(csp.pos, 1); if (csp.order.length - csp.pos >= 3) csp.order.push(cid);
        if (csp.pos >= csp.order.length) { csp.pos = Math.max(0, csp.order.length - 1); spLodge(); break; }
        csp.phase = "place"; startVoting(cst, cq); sendState(true); saveSoon(); renderStage(); break;
      case "sp-lodge":
        var lsp = curSt().sp;
        if (lsp.phase === "place" && !(await PC.confirm("Hit the Lodge?", "The case on the lift right now won’t go on the map. You can keep riding afterward.", "Hit the Lodge"))) break;
        spLodge(); break;
      case "sp-ride":
        var est = curSt(), esp = est.sp;
        esp.phase = esp.prev === "place" ? "place" : "revealed"; if (esp.phase === "place") startVoting(est, curQ());
        sendState(true); saveSoon(); renderStage(); break;
      case "reveal": var sr = curSt(); sr.revealed = !sr.revealed; if (sr.revealed) { sr.open = false; sr.endsAt = null; sr.hideResults = false; } sendState(true); saveSoon(); renderStage(); break;
      case "people": drawer("People", peopleBody()); break;
      case "moderate": drawer("Moderation", modBody()); break;
      case "close-drawer": var dr = $(".drawer"); if (dr) dr.remove(); break;
      case "approve-all": var aq = curQ(); ((aq.type === "wc" ? live.s.words : live.s.qa)[aq.id] || []).forEach(function (x) { if (!x.hidden) x.ok = true; }); changedResults(); paintModBadge(); refreshDrawer(); sendState(false); break;
      case "lock": live.s.locked = !live.s.locked; sendState(true); saveSoon(); refreshDrawer(); paintCrowd(); break;
      case "unkick": live.s.kicked = []; sendState(true); saveSoon(); refreshDrawer(); break;
      case "copy-link": try { await navigator.clipboard.writeText(PC.joinUrl(live.s.code, live.s.fp, live.srv)); PC.toast("Join link copied."); } catch (x2) { PC.toast("Couldn’t copy. Long-press the QR code instead."); } break;
      case "more": moreMenu(); break;
    }
  });
  function moreMenu() {
    var s = live.s;
    var m = PC.modal("Room options", '<div class="stack-16" style="gap:10px">' +
      '<button type="button" class="btn block" data-m="fs">Full screen (projector)</button>' +
      '<button type="button" class="btn block" data-m="join">' + (s.showJoin ? "Hide" : "Show") + " the join panel</button>" +
      '<button type="button" class="btn block" data-m="lock">' + (s.locked ? "Unlock the room" : "Lock the room (no newcomers)") + "</button>" +
      '<button type="button" class="btn block" data-m="reset">Clear answers to this question</button>' +
      '<button type="button" class="btn block" data-m="jump">Jump to a question…</button>' +
      (hasQuiz(s) ? '<button type="button" class="btn block" data-m="podium">Show the competition podium</button>' : "") +
      '<button type="button" class="btn block" data-m="home">Leave this screen (room stays open)</button>' +
      '<button type="button" class="btn block danger" data-m="end">End the session</button>' +
      '<p class="note">Keyboard: → next, ← back, Space opens or closes answers, R shows or hides results, F full screen.</p></div>');
    m.el.addEventListener("click", async function (e) {
      var b = e.target.closest("[data-m]"); if (!b) return; var a = b.getAttribute("data-m"); m.close();
      if (a === "fs") toggleFS();
      if (a === "join") { s.showJoin = !s.showJoin; saveSoon(); $("#stage").classList.toggle("nojoin", !s.showJoin); }
      if (a === "lock") { s.locked = !s.locked; sendState(true); saveSoon(); paintCrowd(); PC.toast(s.locked ? "Room locked." : "Room unlocked."); }
      if (a === "reset" && await PC.confirm("Clear answers?", "All answers to this question will be deleted.", "Clear", true)) {
        var q = curQ(); delete s.answers[q.id]; delete s.words[q.id]; delete s.qa[q.id]; s.status[q.id] = null; delete s.status[q.id]; openQuestion(s.qi);
      }
      if (a === "jump") {
        var jm = PC.modal("Jump to a question", '<div class="qlist">' + s.questions.map(function (q, i) { return '<button type="button" class="qitem" data-j="' + i + '" aria-current="' + (i === s.qi) + '"><span class="num">' + (i + 1) + '</span><span class="t"><b>' + esc(q.prompt) + "</b><small>" + R.TYPES[q.type].name + "</small></span></button>"; }).join("") + "</div>");
        jm.el.addEventListener("click", function (ev) { var jb = ev.target.closest("[data-j]"); if (jb) { jm.close(); openQuestion(+jb.getAttribute("data-j")); } });
      }
      if (a === "home") go("#");
      if (a === "podium") openPodium();
      if (a === "end") endSession();
    });
  }
  /* ---------- self-paced race ---------- */
  // People move through the quiz race questions on their own phones. The teacher's screen
  // times each question from when the phone says it showed it, so nobody can fake a fast time,
  // and correct answers never leave this screen until the race is over.
  function raceState() {
    var s = live.s, r = s.race, res = {}, tot = {};
    var lb = R.leaderboard(s, 0, null, true); lb.forEach(function (x) { tot[x.pub] = [x.pts, x.rank]; });
    s.questions.forEach(function (q, i) {
      var A = s.answers[q.id] || {};
      Object.keys(A).forEach(function (p) { (res[p] = res[p] || []).push(i + ":" + (A[p].pts > 0 ? 1 : 0) + ":" + (A[p].pts || 0)); });
    });
    Object.keys(res).forEach(function (p) { res[p] = res[p].join(","); });
    return {
      state: r.state, n: s.questions.length, res: res, tot: tot, players: lb.length,
      qs: r.state === "lobby" ? [] : s.questions.map(function (q) { return { id: q.id, prompt: q.prompt, options: q.options, timer: q.timer || 20, multi: R.corrects(q).length > 1 ? 1 : 0 }; })
    };
  }
  function onRaceMessage(m, pub, now) {
    var s = live.s, r = s.race;
    if (r.state !== "running") return;
    var i = parseInt(m.i, 10); if (!(i >= 0 && i < s.questions.length)) return;
    var q = s.questions[i], starts = r.starts[pub] || (r.starts[pub] = {});
    if (m.t === "qs") { if (!starts[i]) { starts[i] = now; r.prog[pub] = Math.max(r.prog[pub] || 0, i); saveSoon(); } return; }
    if (m.t === "sa") {
      var A = s.answers[q.id] || (s.answers[q.id] = {});
      if (A[pub] || !starts[i]) return;
      var v = m.v, ms = now - starts[i], limit = (q.timer || 20) * 1000 + 2500;
      if (!Number.isInteger(v) || v < -1 || v >= q.options.length) return;
      A[pub] = v < 0 || ms > limit ? { c: v < 0 ? null : v, ms: ms, pts: 0 } : { c: v, ms: ms, pts: R.quizPoints(q, v, ms) };
      r.prog[pub] = Math.max(r.prog[pub] || 0, i + 1);
      sendState(false); saveSoon(); paintRaceSoon();
    }
  }
  var paintRaceSoon = PC.debounce(function () { if (view === "live" && live && live.s.mode === "self" && !live.s.podium) renderStage(); }, 400);
  function renderRace(box) {
    var s = live.s, r = s.race, n = s.questions.length;
    var players = Object.keys(s.roster).filter(function (p) { return s.kicked.indexOf(p) < 0; });
    var head = '<div style="display:flex;flex-direction:column;gap:10px"><div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;align-items:center"><span class="label">Self-paced quiz race · ' + n + (n === 1 ? " question" : " questions") + '</span><span class="chip" id="statusChip"></span></div>';
    if (r.state === "lobby") {
      box.innerHTML = head + '<h1 class="q-title">Get ready to race!</h1><p class="muted" style="font-size:20px">When you press Start, everyone races through the questions on their own phone. Faster right answers score more points.</p></div>' +
        '<div class="frozen"><h3 style="font-size:44px">' + players.length + (players.length === 1 ? " racer" : " racers") + ' ready</h3><p class="muted">Scan the code and pick a buddy.</p></div>' +
        '<div class="controls" id="ctrl"><button type="button" class="btn primary big" data-act="race-start"' + (players.length ? "" : " disabled") + '>Start the race</button></div>' +
        '<div class="crowd-row"><span class="label" id="crowdLabel">In the igloo · 0</span><div class="crowd" id="crowd"></div></div>';
      paintCrowd(); paintRaceChip(); return;
    }
    var lb = R.leaderboard(s, 0, null, true), done = players.filter(function (p) { return (r.prog[p] || 0) >= n; }).length;
    var perQ = s.questions.map(function (q) { return Object.keys(s.answers[q.id] || {}).length; });
    var maxQ = Math.max.apply(null, perQ.concat([1]));
    box.innerHTML = head + '<h1 class="q-title">' + (r.state === "running" ? "The race is on!" : "Race over!") + "</h1></div>" +
      '<div class="race-grid"><div class="stack-16" style="gap:8px"><span class="label">Leaderboard</span>' +
      (lb.length ? lb.slice(0, 8).map(function (x) {
        return '<div class="leader"><span class="rank">' + x.rank + "</span>" + B.svg(x.k, x.v, x.l, 44) + '<span class="who">' + esc(R.buddyName(x)) + '<small class="race-prog">' + Math.min(n, r.prog[x.pub] || 0) + " of " + n + '</small></span><span class="pts">' + x.pts + "</span></div>";
      }).join("") : '<p class="muted">Points show up here as answers come in.</p>') + "</div>" +
      '<div class="stack-16" style="gap:10px"><span class="label">Progress</span><div class="stat-row"><div class="stat"><span class="label">Finished</span><b>' + done + '</b><span class="muted">of ' + players.length + "</span></div></div>" +
      s.questions.map(function (q, i) { return '<div class="bar-row"><div class="bar-head" style="font-size:16px"><span class="bar-label"><span class="letter">' + (i + 1) + '</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(q.prompt) + '</span></span><span class="muted">' + perQ[i] + '</span></div><div class="track" style="height:12px"><div class="fill" style="width:' + Math.round(perQ[i] / maxQ * 100) + '%"></div></div></div>'; }).join("") +
      "</div></div>" +
      '<div class="controls" id="ctrl"><button type="button" class="btn primary big" data-act="race-end">' + (r.state === "running" ? "End the race & show the podium" : "Show the podium") + "</button></div>";
    paintRaceChip();
  }
  function paintRaceChip() {
    var c = $("#statusChip"); if (!c || !live) return; var r = live.s.race;
    c.innerHTML = '<span class="dot' + (r.state === "running" ? "" : r.state === "lobby" ? " wait" : " off") + '"></span>' + (r.state === "lobby" ? "Waiting to start" : r.state === "running" ? "Racing" : "Finished");
  }
  function raceStart() {
    var s = live.s, now = Date.now();
    s.race.state = "running"; s.race.startedAt = now;
    s.questions.forEach(function (q) { s.status[q.id] = { open: false, openedAt: now, revealed: false }; });
    sendState(true); saveSoon(); renderStage();
  }
  function raceEnd() {
    var s = live.s; s.race.state = "done";
    s.questions.forEach(function (q) { var st = s.status[q.id] || (s.status[q.id] = {}); st.revealed = true; if (!st.openedAt) st.openedAt = Date.now(); });
    openPodium();
  }

  /* ---------- competition podium ---------- */
  function hasQuiz(s) { return s.questions.some(function (q) { return q.type === "qz"; }); }
  function openPodium() {
    var s = live.s; s.podium = { step: 0 }; s.podiumShown = true;
    if (s.mode !== "self") { var st = curSt(); if (st.open) { st.open = false; st.endsAt = null; } }
    sendState(true); saveSoon(); renderStage();
  }
  // With fewer than 3 players, skip the empty steps
  function nextStep() {
    var s = live.s, step = s.podium.step, n = R.leaderboard(s, 0, null, true).length;
    if (step === 0) return n >= 3 ? 1 : n === 2 ? 2 : 3;
    return Math.min(3, step + 1);
  }
  function renderPodium(box) {
    var s = live.s, step = s.podium.step, lb = R.leaderboard(s, 0, null, true);
    var byRank = function (r) { return lb.filter(function (x) { return x.rank === r; }); };
    function spot(place, h) {
      var people = byRank(place), shown = step >= 4 - place && people.length;
      var who = shown ? people.map(function (x) { return '<div class="pod-who">' + B.svg(x.k, x.v, x.l, people.length > 1 ? 90 : 128) + '<b>' + esc(R.buddyName(x)) + '</b><span>' + x.pts + " pts</span></div>"; }).join("") :
        '<div class="pod-who pod-hidden"><span class="pod-q">?</span></div>';
      return '<div class="pod-spot p' + place + (shown ? " shown" : "") + '">' + (place === 1 && shown ? R.TROPHY : "") + who + '<div class="pod-block" style="height:' + h + 'px"><span>' + place + "</span></div></div>";
    }
    var next = { 1: "Reveal 3rd place", 2: "Reveal 2nd place", 3: "Reveal the winner!" }[nextStep()];
    var rest = step >= 3 ? lb.filter(function (x) { return x.rank > 3; }).slice(0, 7) : [];
    box.innerHTML = '<div style="display:flex;flex-direction:column;gap:6px;text-align:center"><span class="label">Competition results · ' + lb.length + (lb.length === 1 ? " player" : " players") + '</span><h1 class="q-title">' + (step >= 3 ? "Top of the iceberg!" : "And the winners are…") + "</h1></div>" +
      (lb.length ? '<div class="podium">' + spot(2, 150) + spot(1, 210) + spot(3, 110) + "</div>" : '<div class="frozen"><h3>No quiz answers yet</h3><p class="muted">Run a quiz race question first, then come back here.</p></div>') +
      (rest.length ? '<div class="pod-rest">' + rest.map(function (x) { return '<span class="chip">' + x.rank + ". " + B.svg(x.k, x.v, x.l, 26) + esc(R.buddyName(x)) + " · " + x.pts + "</span>"; }).join("") + "</div>" : "") +
      '<div class="controls" id="ctrl" style="justify-content:center"><button type="button" class="btn" data-act="podium-back">' + (s.mode === "self" ? "← Back to the race" : "← Back to questions") + '</button>' +
      (step < 3 && lb.length ? '<button type="button" class="btn primary big" data-act="podium-next">' + next + "</button>" : "") +
      '<button type="button" class="btn' + (step >= 3 || !lb.length ? " primary" : "") + '" data-act="end">End session</button></div>';
    if (step >= 3 && !box.getAttribute("data-confetti")) { box.setAttribute("data-confetti", "1"); confetti(box); }
    if (step < 3) box.removeAttribute("data-confetti");
  }
  function confetti(box) {
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var wrap = document.createElement("div"); wrap.className = "confetti"; wrap.setAttribute("aria-hidden", "true");
    var cols = ["#FFB547", "#EAF6FF", "#5FB6EC", "#6EE7A8", "#FF8FB1"], h = "";
    for (var i = 0; i < 70; i++) h += '<i style="left:' + (Math.random() * 100) + "%;background:" + cols[i % 5] + ";animation-delay:" + (Math.random() * 1.2).toFixed(2) + "s;animation-duration:" + (2.2 + Math.random() * 1.6).toFixed(2) + "s;" + (i % 3 ? "" : "border-radius:50%;") + '"></i>';
    wrap.innerHTML = h; box.appendChild(wrap); setTimeout(function () { wrap.remove(); }, 4500);
  }
  function toggleFS() { if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {}); }
  async function endSession() {
    if (!(await PC.confirm("End the session?", "Everyone will see a thank-you screen. You’ll go to the results, where you can export a PowerPoint, summary or spreadsheet.", "End session"))) return;
    var s = live.s; s.endedAt = Date.now(); Store.saveSession(s);
    sendState(true);
    setTimeout(function () { stopLive(); PC.store.del("live"); go("#results/" + s.id); }, 900);
  }
  document.addEventListener("keydown", function (e) {
    if (view !== "live" || !live || e.target.closest("input,textarea,select,[contenteditable]") || $(".modal") || e.metaKey || e.ctrlKey || e.altKey) return;
    var map = live.s.mode === "self" && !live.s.podium ? {} : live.s.podium ? { ArrowRight: "podium-next", " ": "podium-next" } : { ArrowRight: "next", ArrowLeft: "prev", " ": "toggle-open", r: "toggle-results", R: "toggle-results" };
    if (e.key === "f" || e.key === "F") { toggleFS(); return; }
    var act = map[e.key]; if (!act) return;
    var btn = $('#ctrl [data-act="' + act + '"]') || (act === "toggle-open" ? $('#ctrl [data-act="start"]') : null);
    if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
  });
  // Keep the room's data safe if the tab closes
  window.addEventListener("pagehide", function () { if (live) Store.saveSession(live.s); });

  route();
})();
