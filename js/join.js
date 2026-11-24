/* Poller Crowd — phone app for people joining a room. */
(function () {
  "use strict";
  var PC = window.PC, B = window.PCBuddies, F = window.PCFilter, $ = PC.$, esc = PC.esc;
  var app = $("#app");
  var LETTERS = "ABCDEFGH";
  var LOOKS = [["none", "None"], ["beanie", "Beanie"], ["sunglasses", "Shades"], ["glasses", "Glasses"], ["beard", "Beard"]];

  // This phone's private id (never shown to anyone). The teacher only sees a one-way hash of it.
  var dev = PC.store.get("dev"); if (!dev) { dev = PC.uid(18); PC.store.set("dev", dev); }
  var me = null; // public id
  var params = new URLSearchParams(location.search);
  var code = PC.normCode(params.get("r")), fp = params.get("f") || null;
  var srv = PC.server.unpack(params.get("s"), params.get("k")) || (params.get("demo") ? { mode: "demo" } : (PC.server.site() || { mode: "demo" }));

  var conn = null, state = null, lastSeq = 0, gotAt = 0, status = "connecting";
  var room = null; // saved per room: { b: {k,v,l}, nick, ans: {}, words: {}, asked: {}, ups: {}, rank: {} }
  var screen = "code", picking = null, drafts = {}, sending = {}, lastHi = 0;

  function loadRoom() { room = PC.store.get("room." + code, null) || { b: null, nick: "", ans: {}, words: {}, asked: {}, ups: {}, rank: {} }; }
  function saveRoom() { PC.store.set("room." + code, room); }
  // forget rooms from more than a week ago
  PC.store.keys("room.").forEach(function (k) { var r = PC.store.get(k); if (r && r.at && Date.now() - r.at > 7 * 864e5) PC.store.del(k); });

  /* ---------- sending ---------- */
  async function send(msg, tries) {
    msg.dev = dev;
    tries = tries || 0;
    try { await conn.toHost(msg); return true; }
    catch (e) {
      if (tries < 3) { await new Promise(function (r) { setTimeout(r, 800 * (tries + 1)); }); return send(msg, tries + 1); }
      PC.toast("Couldn’t reach the presenter’s screen. Check your Wi-Fi and try again.", 4000);
      return false;
    }
  }
  function sayHi() {
    if (!room.b) return;
    lastHi = Date.now();
    send({ t: "hi", b: room.b, nick: room.nick });
  }

  /* ---------- connecting ---------- */
  async function start() {
    me = await PC.hashId(dev);
    if (!code) { screen = "code"; render(); return; }
    loadRoom(); room.at = Date.now(); saveRoom();
    screen = room.b ? "main" : "pick";
    if (srv.mode === "supabase" && !window.supabase) { screen = "error"; render(); return; }
    conn = PC.connect(srv);
    conn.join(code, "student", {
      onState: onState,
      onStatus: function (st) {
        var was = status; status = st;
        if (st === "SUBSCRIBED") { send({ t: "sync" }); if (room.b) sayHi(); }
        if (was !== st) paintStatus();
      }
    });
    render();
    setInterval(function () {
      if (document.hidden) return;
      if (!state && status === "SUBSCRIBED") send({ t: "sync" });
      else if (room.b && state && !state.ended) send({ t: "ping" });
    }, 25000);
    setTimeout(function () { if (!state) { paintStatus(); render(); } }, 8000);
    setInterval(tickTimer, 250);
    document.addEventListener("visibilitychange", function () { if (!document.hidden && conn) { send({ t: "sync" }); if (room.b) send({ t: "ping" }); } });
  }
  async function onState(msg) {
    if (!(await PC.verifyState(msg, code, fp))) return; // not from this room's teacher
    var d; try { d = JSON.parse(msg.d); } catch (e) { return; }
    if (!d || d.v <= lastSeq) return;
    lastSeq = d.v; gotAt = Date.now();
    var prevQ = state && state.q && state.q.id;
    state = d;
    if (d.q && d.q.left != null) d.q.endsLocal = gotAt + d.q.left;
    // the teacher didn't get our hello (or reloaded): say it again
    if (room.b && !d.roster[me] && !d.locked && !d.ended && Date.now() - lastHi > 4000) sayHi();
    if (d.q && prevQ && d.q.id !== prevQ && navigator.vibrate && screen === "main" && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) { try { navigator.vibrate(60); } catch (e) {} }
    render();
  }

  /* ---------- screens ---------- */
  function header() {
    var r = state && state.roster && state.roster[me], mine = r ? r.split(".") : room && room.b ? [room.b.k, room.b.v, room.b.l] : null;
    return '<div class="phone-top"><span class="chip" id="status"></span><span class="controls" style="gap:8px">' +
      (mine && screen === "main" ? '<button type="button" class="me" data-act="change-buddy" aria-label="Change my buddy" title="Change my buddy">' + B.svg(mine[0], +mine[1], mine[2], 36) + "</button>" : "") +
      '<button type="button" class="btn icon" data-theme-btn="icon"></button></span></div>';
  }
  function footer() { return '<footer id="credits" style="margin-top:auto"></footer>'; }
  function paintStatus() {
    var el = $("#status"); if (!el) return;
    var ok = status === "SUBSCRIBED" && state, bad = /ERROR|TIMED|CLOSED/.test(status);
    el.innerHTML = '<span class="dot' + (ok ? "" : bad ? " off" : " wait") + '"></span>' + (code ? esc(code.replace("-", " ")) : "Poller Crowd") +
      (ok ? "" : bad ? " · reconnecting…" : state ? "" : " · connecting…");
  }
  var holding = false, heldRender = false;
  function release() { if (!holding) return; holding = false; if (heldRender) { heldRender = false; render(); } }
  app.addEventListener("pointerdown", function (e) { if (e.target.id === "thIn") holding = true; });
  app.addEventListener("touchstart", function (e) { if (e.target.id === "thIn") holding = true; }, { passive: true });
  ["pointerup", "pointercancel", "touchend", "touchcancel"].forEach(function (ev) { document.addEventListener(ev, function () { setTimeout(release, 0); }, { passive: true }); });
  function render() {
    if (holding) { heldRender = true; return; }
    var focusId = document.activeElement && document.activeElement.id, selStart = document.activeElement && document.activeElement.selectionStart;
    var h;
    if (screen === "code") h = codeScreen();
    else if (screen === "error") h = header() + '<div class="wait-card"><h1>Couldn’t load</h1><p class="muted">Part of the page didn’t load. Check your connection and reload.</p></div>';
    else if (state && state.kicked && state.kicked.indexOf(me) >= 0) h = header() + waitCard("You’ve left this room", "The presenter removed this phone from the room.", false);
    else if (state && state.ended) h = header() + waitCard("Thanks for coming in from the cold!", "This session has ended. You can close this page.", true);
    else if (screen === "pick") h = pickScreen();
    else if (!state) h = header() + waitCard("Finding the igloo…", status === "SUBSCRIBED" ? "Waiting for the presenter’s screen. Make sure the room is open on the projector." : "Connecting to the room…", true) + (Date.now() - gotAt > 8000 ? '<p class="note" style="text-align:center">Still waiting? Double-check the room code, or scan the QR code again.</p>' : "");
    else if (state.locked && !state.roster[me]) h = header() + waitCard("This room is locked", "The presenter has closed the doors for now. Ask them to unlock it.", false);
    else if (state.podium) h = header() + podiumScreen();
    else if (state.self) h = header() + raceScreen();
    else h = header() + questionScreen();
    app.innerHTML = '<div class="phone">' + h + footer() + "</div>";
    PC.initThemeButtons(); paintStatus();
    var c = $("#credits"); if (c) PC.credits(c, { compact: true });
    if (focusId && $("#" + focusId)) { var el = $("#" + focusId); el.focus(); try { if (selStart != null) el.setSelectionRange(selStart, selStart); } catch (e) {} }
  }
  function waitCard(title, text, igloo) {
    return '<div class="wait-card">' + (igloo ? PC.igloo(200) : "") + "<h1 style=\"font-size:28px\">" + esc(title) + '</h1><p class="muted">' + esc(text) + "</p></div>";
  }

  function codeScreen() {
    return '<div class="phone-top"><a class="brand" href="index.html">' + PC.logo(36) + '<span class="brand-name" style="font-size:22px">Poller Crowd</span></a><button type="button" class="btn icon" data-theme-btn="icon"></button></div>' +
      '<div style="align-self:center">' + PC.igloo(250) + '</div><div style="text-align:center"><h1 style="font-size:32px">Come in from the cold</h1><p class="muted">Type the room code from the big screen.</p></div>' +
      '<form id="codeForm" class="stack-16"><label class="field"><span class="label">Room code</span><input id="codeIn" class="input" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="IGLOO 482" style="text-align:center;font:700 30px var(--display);letter-spacing:3px;min-height:64px" value="' + esc(drafts.code || "") + '"></label>' +
      '<p class="warm" id="codeErr" role="alert" style="font-weight:700;min-height:1.2em"></p><button class="btn primary big block" type="submit">Next: pick your buddy</button></form>' +
      '<p class="note" style="text-align:center">No app or account needed. Answers are anonymous.</p>';
  }

  function takenCombos() {
    var t = {}; if (!state) return t;
    Object.keys(state.roster).forEach(function (p) { if (p !== me) t[state.roster[p]] = (t[state.roster[p]] || 0) + 1; });
    return t;
  }
  function freePattern(k, l, taken) { for (var i = 0; i < 4; i++) if (!taken[k + "." + i + "." + l]) return i; return -1; }
  function pickScreen() {
    var taken = takenCombos();
    if (!picking) picking = room.b ? { k: room.b.k, l: room.b.l, v: room.b.v, chosen: true } : { k: "penguin", l: "none", v: null };
    var k = picking.k, l = picking.l;
    var free = freePattern(k, l, taken), allUsed = free < 0;
    var v = picking.v != null && (allUsed || !taken[k + "." + picking.v + "." + l]) ? picking.v : (allUsed ? 0 : free);
    picking.v = v;
    var count = {}; Object.keys(taken).forEach(function (c) { var kk = c.split(".")[0]; count[kk] = (count[kk] || 0) + taken[c]; });
    var others = count[k] || 0, name = B.NAMES[k];
    var note = !others ? "You’re the first " + name.toLowerCase() + "! " + B.PATTERNS[v] + " pattern." :
      allUsed ? "Every pattern with this look is taken. Try another look, or pick any pattern." :
      others + (others === 1 ? " classmate" : " classmates") + " picked " + name.toLowerCase() + ". Yours is one of a kind: " + B.PATTERNS[v] + (l === "none" ? "." : " with " + B.LOOKS.filter(function (x) { return x[0] === l; })[0][1].toLowerCase() + ".");
    return header() +
      '<div><h1 style="font-size:30px">Pick your buddy</h1><p class="muted" style="font-size:15px">Your buddy joins the crowd on the big screen. Answers stay anonymous.</p></div>' +
      '<div class="pick-card"><div class="big">' + B.svg(k, v, l, 94) + '</div><div class="stack-16" style="gap:8px;min-width:0"><b style="font-family:var(--display);font-size:22px;line-height:1.1">' + esc(name) + '</b><span class="note" aria-live="polite">' + esc(note) + "</span>" +
      '<div class="swatches" role="radiogroup" aria-label="Color pattern">' + [0, 1, 2, 3].map(function (i) {
        var t = !allUsed && taken[k + "." + i + "." + l], c = B.swatch(k, i);
        return '<button type="button" class="swatch" role="radio" aria-checked="' + (i === v) + '" aria-label="' + B.PATTERNS[i] + " pattern" + (t ? " (taken)" : "") + '"' + (t ? " disabled" : "") + ' data-pat="' + i + '" style="background:linear-gradient(135deg,' + c[0] + " 50%," + c[1] + ' 50%)"></button>';
      }).join("") + "</div></div></div>" +
      '<div class="stack-16" style="gap:6px"><span class="label">Add a look</span><div class="looks" role="radiogroup" aria-label="Look">' + LOOKS.map(function (x) {
        var fv = freePattern(k, x[0], taken);
        return '<button type="button" class="look" role="radio" aria-checked="' + (x[0] === l) + '" data-look="' + x[0] + '">' + B.svg(k, fv < 0 ? v : fv, x[0], 38, x[1]) + "<span>" + x[1] + "</span></button>";
      }).join("") + "</div></div>" +
      '<div class="tiles" role="radiogroup" aria-label="Buddies">' + B.ORDER.map(function (kk) {
        var n = count[kk] || 0, fv2 = freePattern(kk, "none", taken);
        return '<button type="button" class="tile" role="radio" aria-checked="' + (kk === k) + '" aria-label="' + B.NAMES[kk] + (n ? ", " + n + " picked" : "") + '" data-kind="' + kk + '">' + B.svg(kk, kk === k ? v : (fv2 < 0 ? 0 : fv2), kk === k ? l : "none", 46, B.NAMES[kk]) + (n ? '<span class="count">' + n + "</span>" : "") + "</button>";
      }).join("") + "</div>" +
      '<label class="field"><span>Nickname <span class="muted">(optional, only shows on quiz leaderboards; pick a fun one, not your real name)</span></span><input id="nickIn" class="input" maxlength="16" autocomplete="off" placeholder="Stay anonymous" value="' + esc(drafts.nick != null ? drafts.nick : room.nick || "") + '"></label>' +
      '<button type="button" class="btn primary big block" data-act="enter">' + (room.b ? "Save my buddy" : "Into the igloo →") + "</button>";
  }

  /* ---------- question screens ---------- */
  function questionScreen() {
    var q = state.q, h = "";
    var mine = room.ans[q.id];
    if (q.type === "sl") return slideScreen(q);
    h += '<div class="stack-16" style="gap:6px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="label">Question ' + (q.i + 1) + " of " + q.n + '</span><span class="timer" id="timer"></span></div>' +
      '<h1 style="font-size:27px">' + esc(q.prompt) + "</h1>" + (q.photo ? '<p class="note" style="font-weight:700">Look up: there’s a photo on the big screen.</p>' : "") + "</div>";
    var closed = !q.open;
    if (q.type === "mc" || q.type === "qz") {
      var picked = Array.isArray(mine) ? mine : mine != null ? [mine] : [];
      var draft = q.multi ? (drafts["m" + q.id] || picked) : picked;
      var locked = q.type === "qz" && mine != null;
      if ((q.type === "qz" || q.timer) && !q.started) {
        h += '<div class="wait-card"><h2>Get ready…</h2><p class="muted">' + (q.type === "qz" ? "The race starts when the presenter presses Start. Faster correct answers score more!" : "You’ll have " + q.timer + " seconds once the presenter presses Start.") + "</p></div>";
        return h;
      }
      h += '<div class="stack-16" style="gap:10px" role="' + (q.multi ? "group" : "radiogroup") + '" aria-label="Answers">' + q.options.map(function (o, i) {
        var on = draft.indexOf(i) >= 0, right = q.revealed && (q.correct || []).indexOf(i) >= 0;
        return '<button type="button" class="opt" ' + (q.multi ? 'aria-pressed="' + on + '"' : 'role="radio" aria-checked="' + on + '"') + ' data-opt="' + i + '"' + (closed || locked ? " disabled" : "") + (right ? ' style="border-color:var(--live)"' : "") + '><span class="letter' + (right ? " correct" : "") + '">' + LETTERS[i] + "</span><span>" + esc(o) + (right ? " ✓" : "") + "</span></button>";
      }).join("") + "</div>";
      if (q.multi && q.open) h += '<button type="button" class="btn primary big block" data-act="send-multi"' + (draft.length ? "" : " disabled") + ">" + (mine ? "Update my answer" : "Send my answer") + "</button>";
      h += statusLine(q, mine, q.type === "qz" ? "Locked in! Watch the big screen." : q.multi ? "Answer sent. You can change it until answers close." : "Answer sent. Tap another to change it.");
      if (q.type === "qz" && q.revealed) h += quizResult(q, mine);
    }
    if (q.type === "rs") {
      var n = q.scaleMax || 5;
      h += '<div class="scale" role="radiogroup" aria-label="Rating" style="grid-template-columns:repeat(' + (n > 5 ? 5 : n) + ',minmax(0,1fr))">' + Array.from({ length: n }, function (_, i) {
        return '<button type="button" role="radio" aria-checked="' + (mine === i + 1) + '" data-rate="' + (i + 1) + '"' + (closed ? " disabled" : "") + ">" + (i + 1) + "</button>";
      }).join("") + '</div><div class="muted" style="display:flex;justify-content:space-between;font-weight:700;font-size:14px"><span>1 · ' + esc(q.lowLabel || "") + "</span><span>" + n + " · " + esc(q.highLabel || "") + "</span></div>";
      h += statusLine(q, mine, "Rating sent. Tap another number to change it.");
    }
    if (q.type === "th") {
      var tv = drafts["t" + q.id] != null ? drafts["t" + q.id] : mine != null ? mine : 50;
      h += '<div class="th-pick"><div class="th-val" id="thVal" aria-hidden="true">' + tv + "°<small>" + esc(leanWords(q, tv)) + "</small></div>" +
        '<input type="range" class="th-range" id="thIn" min="0" max="100" step="1" value="' + tv + '" aria-label="Where it sits, from 0 (' + esc(q.lowLabel || "") + ") to 100 (" + esc(q.highLabel || "") + ')" aria-valuetext="' + tv + " out of 100, " + esc(leanWords(q, tv)) + '"' + (closed ? " disabled" : "") + ">" +
        '<div class="th-ends"><span>❄ ' + esc(q.lowLabel || "") + "</span><span>" + esc(q.highLabel || "") + " 🔥</span></div></div>";
      if (q.open) h += '<button type="button" class="btn primary big block" data-act="send-th"' + (mine != null && drafts["t" + q.id] == null ? " disabled" : "") + ">" + (mine != null ? "Update my answer" : "Lock it in") + "</button>";
      h += statusLine(q, mine, "Sent! Slide and update it until answers close.");
    }
    if (q.type === "rk") {
      var order = drafts["r" + q.id] || room.rank[q.id] || q.options.map(function (_, i) { return i; });
      if (order.length !== q.options.length) order = q.options.map(function (_, i) { return i; });
      drafts["r" + q.id] = order;
      h += '<p class="note">Put your top choice first. Use the arrows to move items.</p><div class="stack-16" style="gap:8px">' + order.map(function (item, pos) {
        return '<div class="rank-item"><span class="pos">' + (pos + 1) + '</span><span class="txt">' + esc(q.options[item]) + '</span><button type="button" class="btn icon small" data-up="' + pos + '" aria-label="Move ' + esc(q.options[item]) + ' up"' + (pos === 0 || closed ? " disabled" : "") + '>↑</button><button type="button" class="btn icon small" data-down="' + pos + '" aria-label="Move ' + esc(q.options[item]) + ' down"' + (pos === order.length - 1 || closed ? " disabled" : "") + ">↓</button></div>";
      }).join("") + "</div>";
      if (q.open) h += '<button type="button" class="btn primary big block" data-act="send-rank">' + (mine ? "Update my ranking" : "Send my ranking") + "</button>";
      h += statusLine(q, mine, "Ranking sent. You can change it until answers close.");
    }
    if (q.type === "wc") {
      var words = room.words[q.id] || [], max = q.maxWords || 1, left = max - words.length;
      if (q.open && left > 0) h += '<form id="wordForm" class="stack-16" style="gap:8px"><label class="field"><span>Your word' + (max > 1 ? " (" + left + " left)" : "") + '</span><div style="display:flex;gap:10px"><input id="wordIn" class="input" maxlength="25" autocomplete="off" autocapitalize="none" placeholder="Type a word" value="' + esc(drafts.w || "") + '" style="font:600 22px var(--display)"><button class="btn primary" type="submit">Send</button></div></label><div style="display:flex;justify-content:space-between;gap:10px"><span class="note">No names or personal info, please.</span><span class="note" id="wordCount"></span></div></form>';
      if (words.length) h += '<div class="stack-16" style="gap:8px"><span class="note">You sent</span><div class="controls">' + words.map(function (w) { return '<span class="chip" style="background:var(--inv-bg);color:var(--inv-ink);font:600 17px var(--display)">' + esc(w) + "</span>"; }).join("") + "</div></div>";
      h += q.open ? (left > 0 ? "" : '<div class="sent">✓ All your words are in. Watch them grow on the big screen!</div>') : '<div class="sent" style="color:var(--muted)">Answers are closed.</div>';
    }
    if (q.type === "qa") {
      var asked = room.asked[q.id] || 0, ups = room.ups[q.id] || {};
      if (q.open && asked < 3) h += '<form id="askForm" class="stack-16" style="gap:8px"><label class="field"><span>Ask a question (anonymous)</span><textarea id="askIn" class="input" rows="2" maxlength="160" placeholder="What’s still foggy?">' + esc(drafts.a || "") + '</textarea></label><span class="note">Don’t include your name or anything personal about you or anyone else.</span><button class="btn primary block" type="submit">Send question</button></form>';
      else if (q.open) h += '<div class="sent">You’ve asked 3 questions. Upvote the ones you want answered!</div>';
      var list = q.qa || [];
      h += '<div class="stack-16" style="gap:8px"><span class="label">Questions from the room · ' + list.length + "</span>" + (list.length ? list.map(function (x) {
        var on = !!ups[x.id];
        return '<div class="qa-item' + (x.a ? " answered" : "") + '"><span class="qa-text" style="font-size:17px">' + esc(x.text) + (x.a ? ' <small class="muted">(answered)</small>' : "") + '</span><button type="button" class="btn small' + (on ? " primary" : "") + '" data-up-q="' + x.id + '" aria-pressed="' + on + '" aria-label="Upvote"' + (closed ? " disabled" : "") + ">▲ " + x.n + "</button></div>";
      }).join("") : '<p class="muted">No questions yet. Be the first!</p>') + "</div>" +
        (q.open ? "" : '<div class="sent" style="color:var(--muted)">Questions are closed.</div>');
    }
    return h;
  }
  function leanWords(q, v) {
    if (v <= 10) return "All the way to " + (q.lowLabel || "cold");
    if (v < 40) return "Closer to " + (q.lowLabel || "cold");
    if (v <= 60) return "Somewhere in the middle";
    if (v < 90) return "Closer to " + (q.highLabel || "hot");
    return "All the way to " + (q.highLabel || "hot");
  }
  function slideScreen(q) {
    return '<div class="wait-card" style="gap:14px">' + PC.igloo(120) + '<h1 style="font-size:28px">' + esc(q.prompt) + "</h1>" +
      (q.body ? '<p style="font-size:18px;font-weight:700;margin:0">' + esc(q.body).replace(/\n/g, "<br>") + "</p>" : "") +
      (q.timer && q.started ? (q.done ? '<p class="th-val" style="font-size:30px">Time’s up!</p>' : '<p class="th-val" id="timer" aria-live="off"></p>') : "") +
      '<p class="muted" style="margin:0">Nothing to answer here. Eyes on the big screen!</p></div>';
  }
  function ordinal(n) { var s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function podiumScreen() {
    var p = state.podium, mine = p.scores && p.scores[me], h = '<div class="wait-card" style="gap:10px">';
    if (p.step < 3) h += '<h1 style="font-size:30px">Drumroll…</h1><p class="muted">Watch the big screen for the podium!</p>';
    else if (mine) h += window.PCResults.TROPHY.replace('class="trophy"', 'class="trophy" style="width:' + (mine[0] <= 3 ? 90 : 60) + 'px;height:' + (mine[0] <= 3 ? 90 : 60) + 'px"') +
      '<h1 style="font-size:30px">' + (mine[0] === 1 ? "You won!" : mine[0] <= 3 ? "You’re on the podium!" : "Great racing!") + '</h1><p style="font-size:19px">You finished <b>' + ordinal(mine[0]) + "</b> of " + p.n + " with <b>" + mine[1] + "</b> points.</p>";
    else h += '<h1 style="font-size:28px">Top of the iceberg!</h1><p class="muted">Thanks for playing along.</p>';
    h += "</div>";
    var top = (p.top || []).slice().sort(function (a, b) { return a.rank - b.rank; });
    if (top.length) h += '<div class="stack-16" style="gap:8px"><span class="label">Podium</span>' + top.map(function (x) { var c = x.b.split("."); return '<div class="leader"><span class="rank">' + x.rank + "</span>" + B.svg(c[0], +c[1], c[2], 40) + '<span class="who">' + esc(x.nick || B.describe(c[0], +c[1], c[2])) + '</span><span class="pts">' + x.pts + "</span></div>"; }).join("") + "</div>";
    return h;
  }
  function statusLine(q, mine, sentText) {
    if (mine != null && !(Array.isArray(mine) && !mine.length)) return '<div class="sent">✓ ' + esc(sentText) + "</div>";
    if (!q.open && !q.revealed) return '<div class="sent" style="color:var(--muted)">Answers are closed.</div>';
    return "";
  }
  function quizResult(q, mine) {
    var s = q.scores && q.scores[me];
    var right = (q.correct || []).indexOf(mine) >= 0;
    var h = '<div class="wait-card" style="gap:6px"><h2 style="font-size:26px">' + (mine == null ? "No answer this time" : right ? "Correct! +" + (s ? s[3] : 0) : "Not this time") + "</h2>";
    if (s) h += '<p class="muted" style="font-size:18px">You have <b style="color:var(--ink)">' + s[0] + "</b> points · place " + s[1] + " of " + s[2] + "</p>";
    return h + "</div>";
  }
  /* ---------- self-paced race ---------- */
  // room.race = { i: current question, shown: {i: when it appeared here}, ans: {i: choice or -1 for time's up} }
  var advanceTimer = null;
  function raceData() { if (!room.race) room.race = { i: 0, shown: {}, ans: {} }; return room.race; }
  function myResults() {
    var out = {}, str = state.self.res && state.self.res[me];
    if (str) str.split(",").forEach(function (x) { var p = x.split(":"); out[+p[0]] = { ok: p[1] === "1", pts: +p[2] }; });
    return out;
  }
  function raceScreen() {
    var S = state.self, rd = raceData(), mine = myResults(), tot = S.tot && S.tot[me];
    var score = '<div class="race-score"><span>Score</span><b>' + (tot ? tot[0] : 0) + "</b>" + (tot ? "<span>place " + tot[1] + " of " + S.players + "</span>" : "") + "</div>";
    if (S.state === "lobby") return '<div class="wait-card"><h1 style="font-size:30px">Get ready to race!</h1><p class="muted">When the presenter presses Start, you’ll race through ' + "the questions on your own. Faster right answers score more!</p></div>";
    if (S.state === "done") return score + '<div class="wait-card"><h1 style="font-size:28px">Race over!</h1><p class="muted">Watch the big screen for the podium.</p></div>' + resultList(S, mine);
    var i = rd.i;
    if (i >= S.qs.length) return score + '<div class="wait-card"><h1 style="font-size:28px">You finished!</h1><p class="muted">Nice racing. Wait for everyone else, then watch the big screen.</p></div>' + resultList(S, mine);
    var q = S.qs[i];
    if (!rd.shown[i]) { rd.shown[i] = Date.now(); saveRoom(); send({ t: "qs", i: i }); }
    var picked = rd.ans[i];
    var h = score + '<div class="stack-16" style="gap:6px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="label">Question ' + (i + 1) + " of " + S.qs.length + '</span><span class="timer" id="timer"></span></div>' +
      '<div class="race-dots" aria-hidden="true">' + S.qs.map(function (_, j) { var r = mine[j]; return '<i class="' + (j === i ? "now" : r ? (r.ok ? "ok" : "no") : rd.ans[j] != null ? "wait" : "") + '"></i>'; }).join("") + "</div>" +
      '<h1 style="font-size:26px">' + esc(q.prompt) + "</h1>" + (q.multi ? '<p class="note">More than one answer is right. Pick any one of them.</p>' : "") + "</div>";
    if (picked != null) {
      h += '<div class="wait-card"><h2 style="font-size:28px">' + (picked < 0 ? "Time’s up!" : "Locked in!") + '</h2><p class="muted">Next question coming up…</p></div>';
      scheduleAdvance();
      return h;
    }
    h += '<div class="stack-16" style="gap:10px" role="radiogroup" aria-label="Answers">' + q.options.map(function (o, k) {
      return '<button type="button" class="opt" role="radio" aria-checked="false" data-race="' + k + '"><span class="letter">' + LETTERS[k] + "</span><span>" + esc(o) + "</span></button>";
    }).join("") + "</div>";
    return h;
  }
  function resultList(S, mine) {
    var rows = S.qs.map(function (q, j) { var r = mine[j]; return '<div class="leader" style="padding:8px 12px"><span class="rank" style="font-size:18px">' + (j + 1) + '</span><span class="who" style="font-size:15px">' + esc(q.prompt) + '</span><span class="pts" style="font-size:18px">' + (r ? (r.ok ? "✓ " + r.pts : "✗") : "…") + "</span></div>"; }).join("");
    return '<div class="stack-16" style="gap:6px"><span class="label">Your answers</span>' + rows + "</div>";
  }
  function scheduleAdvance() {
    if (advanceTimer) return;
    advanceTimer = setTimeout(function () { advanceTimer = null; var rd = raceData(); if (rd.ans[rd.i] != null) { rd.i++; saveRoom(); render(); } }, 1300);
  }
  function raceAnswer(k) {
    var rd = raceData(), i = rd.i; if (rd.ans[i] != null) return;
    rd.ans[i] = k; saveRoom(); render();
    send({ t: "sa", i: i, v: k });
  }
  function raceTick() {
    var S = state && state.self; if (!S || S.state !== "running" || state.podium) return;
    var rd = raceData(), i = rd.i, q = S.qs[i]; if (!q || rd.ans[i] != null || !rd.shown[i]) return;
    var left = rd.shown[i] + q.timer * 1000 - Date.now(), t = $("#timer");
    if (t) t.textContent = Math.max(0, Math.ceil(left / 1000)) + "s";
    if (left <= 0) raceAnswer(-1);
  }

  function tickTimer() {
    raceTick();
    var t = $("#timer"); if (!t || !state || !state.q) return;
    var q = state.q;
    if (q.open && q.endsLocal) { var sLeft = Math.max(0, Math.ceil((q.endsLocal - Date.now()) / 1000)); t.textContent = q.type === "sl" ? Math.floor(sLeft / 60) + ":" + String(sLeft % 60).padStart(2, "0") : sLeft + "s"; }
    else t.textContent = "";
  }

  /* ---------- actions ---------- */
  function answer(value) {
    var q = state.q;
    room.ans[q.id] = value; saveRoom(); render();
    send({ t: "ans", q: q.id, v: value });
  }
  app.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b || b.disabled) return;
    var q = state && state.q;
    if (b.hasAttribute("data-kind")) { picking.k = b.getAttribute("data-kind"); picking.l = "none"; picking.v = null; render(); return; }
    if (b.hasAttribute("data-look")) { picking.l = b.getAttribute("data-look"); picking.v = null; render(); return; }
    if (b.hasAttribute("data-pat")) { picking.v = +b.getAttribute("data-pat"); render(); return; }
    var act = b.getAttribute("data-act");
    if (act === "enter") {
      var nick = ($("#nickIn").value || "").trim().slice(0, 16), cl = F.clean(nick);
      if (cl.flagged) { PC.toast("Let’s pick a friendlier nickname."); return; }
      room.b = { k: picking.k, v: picking.v, l: picking.l }; room.nick = nick; saveRoom();
      screen = "main"; picking = null; delete drafts.nick; sayHi(); render(); return;
    }
    if (act === "change-buddy") { screen = "pick"; picking = null; render(); return; }
    if (b.hasAttribute("data-race")) { raceAnswer(+b.getAttribute("data-race")); return; }
    if (!q) return;
    if (b.hasAttribute("data-opt")) {
      var i = +b.getAttribute("data-opt");
      if (q.multi) { var d = (drafts["m" + q.id] || (Array.isArray(room.ans[q.id]) ? room.ans[q.id].slice() : [])); var at = d.indexOf(i); if (at >= 0) d.splice(at, 1); else d.push(i); d.sort(); drafts["m" + q.id] = d; render(); }
      else answer(i);
      return;
    }
    if (act === "send-multi") { answer((drafts["m" + q.id] || []).slice()); return; }
    if (b.hasAttribute("data-rate")) { answer(+b.getAttribute("data-rate")); return; }
    if (b.hasAttribute("data-up") || b.hasAttribute("data-down")) {
      var o = drafts["r" + q.id], p = +(b.getAttribute("data-up") || b.getAttribute("data-down")), np = b.hasAttribute("data-up") ? p - 1 : p + 1;
      var tmp = o[p]; o[p] = o[np]; o[np] = tmp; render();
      var again = $('[data-' + (b.hasAttribute("data-up") ? "up" : "down") + '="' + np + '"]'); if (again && !again.disabled) again.focus();
      return;
    }
    if (act === "send-th") { var tvv = drafts["t" + q.id] != null ? drafts["t" + q.id] : room.ans[q.id] != null ? room.ans[q.id] : 50; delete drafts["t" + q.id]; answer(tvv); return; }
    if (act === "send-rank") { var ord = drafts["r" + q.id].slice(); room.rank[q.id] = ord; answer(ord); return; }
    if (b.hasAttribute("data-up-q")) {
      var id = b.getAttribute("data-up-q"), ups = room.ups[q.id] || (room.ups[q.id] = {});
      var on = !ups[id]; if (on) ups[id] = 1; else delete ups[id]; saveRoom();
      (q.qa || []).forEach(function (x) { if (x.id === id) x.n += on ? 1 : -1; }); render();
      send({ t: "up", q: q.id, id: id, on: on });
    }
  });
  app.addEventListener("input", function (e) {
    var id = e.target.id;
    if (id === "codeIn") drafts.code = e.target.value;
    if (id === "nickIn") drafts.nick = e.target.value;
    if (id === "wordIn") { drafts.w = e.target.value; var wc = $("#wordCount"); if (wc) wc.textContent = e.target.value.length + " / 25"; }
    if (id === "askIn") drafts.a = e.target.value;
    if (id === "thIn" && state && state.q) {
      var v = +e.target.value, qq = state.q; drafts["t" + qq.id] = v;
      var tv = $("#thVal"); if (tv) tv.innerHTML = v + "°<small>" + esc(leanWords(qq, v)) + "</small>";
      e.target.setAttribute("aria-valuetext", v + " out of 100, " + leanWords(qq, v));
      var sb = $('[data-act="send-th"]'); if (sb) sb.disabled = false;
    }
  });
  app.addEventListener("submit", function (e) {
    e.preventDefault();
    if (e.target.id === "codeForm") {
      var c = PC.normCode($("#codeIn").value);
      if (!c || PC.WORDS.indexOf(c.split("-")[0]) < 0) { $("#codeErr").textContent = "That doesn’t look like a room code. It’s a word and three numbers, like IGLOO 482."; return; }
      var url = new URL(location.href); url.searchParams.set("r", c); history.replaceState(null, "", url);
      code = c; fp = null; start(); return;
    }
    var q = state && state.q; if (!q) return;
    if (e.target.id === "wordForm") {
      var raw = ($("#wordIn").value || "").replace(/\s+/g, " ").trim();
      if (!raw) return;
      if (raw.split(" ").length > 3) { PC.toast("Keep it short: up to 3 words."); return; }
      var w = F.clean(raw).text;
      var list = room.words[q.id] || (room.words[q.id] = []); list.push(w); saveRoom();
      drafts.w = ""; render(); var wi = $("#wordIn"); if (wi) wi.focus();
      send({ t: "word", q: q.id, w: raw });
    }
    if (e.target.id === "askForm") {
      var t = ($("#askIn").value || "").replace(/\s+/g, " ").trim();
      if (t.length < 3) { PC.toast("Type your question first."); return; }
      room.asked[q.id] = (room.asked[q.id] || 0) + 1; saveRoom();
      drafts.a = ""; render(); PC.toast(q.moderate ? "Sent! It shows up once the presenter approves it." : "Question sent!");
      send({ t: "ask", q: q.id, text: t });
    }
  });
  window.addEventListener("pagehide", function () { if (conn && room && room.b) { try { conn.toHost({ t: "bye", dev: dev }); } catch (e) {} } });

  start();
})();
