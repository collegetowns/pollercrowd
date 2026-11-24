/* Poller Crowd — shared core used by every page.
   - PC.store: safe localStorage
   - PC.theme: Polar Night / Polar Day
   - PC.server / PC.connect: Supabase Realtime or same-browser demo mode
   - PC.keys: teacher signing keys; room codes come from the teacher's key so phones can
     check that screen updates really come from the teacher
   - PC.qrSVG, PC.modal, PC.toast, PC.credits, PC.feedback, analytics */
(function () {
  "use strict";
  var CFG = window.POLLER_CROWD_CONFIG || {};
  var PC = {};
  // Rooms need the browser's secure features, which only work on https:// pages
  if (location.protocol === "http:" && !/^(localhost|127\.|\[::1\])/.test(location.hostname)) {
    location.replace("https://" + location.host + location.pathname + location.search + location.hash);
  }
  PC.secure = !!(window.isSecureContext && window.crypto && crypto.subtle);

  /* ---------- small helpers ---------- */
  PC.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  PC.$ = function (sel, root) { return (root || document).querySelector(sel); };
  PC.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  PC.uid = function (n) {
    var a = new Uint8Array(n || 12); crypto.getRandomValues(a);
    return b64url(a).slice(0, Math.ceil((n || 12) * 4 / 3));
  };
  PC.clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  PC.debounce = function (fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; };

  function b64url(bytes) {
    var s = ""; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function unb64url(str) {
    str = String(str).replace(/-/g, "+").replace(/_/g, "/"); while (str.length % 4) str += "=";
    var s = atob(str), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a;
  }
  PC.b64url = b64url; PC.unb64url = unb64url;
  async function sha256(bytes) { return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)); }
  PC.sha256 = sha256;
  PC.hashId = async function (text) { return b64url(await sha256(new TextEncoder().encode(text))).slice(0, 10); };

  /* ---------- storage ---------- */
  PC.store = {
    get: function (k, d) { try { var v = localStorage.getItem("pc." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("pc." + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem("pc." + k); } catch (e) {} },
    keys: function (prefix) {
      var out = []; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf("pc." + prefix) === 0) out.push(k.slice(3)); } } catch (e) {}
      return out;
    }
  };

  /* ---------- theme ---------- */
  PC.theme = {
    get: function () { return PC.store.get("theme", "night"); },
    apply: function (t) { document.documentElement.setAttribute("data-theme", t === "day" ? "day" : "night"); },
    set: function (t) { PC.store.set("theme", t); PC.theme.apply(t); PC.$$("[data-theme-btn]").forEach(syncThemeBtn); },
    toggle: function () { PC.theme.set(PC.theme.get() === "day" ? "night" : "day"); }
  };
  PC.theme.apply(PC.theme.get());
  var MOON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
  var SUN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  PC.icons = { moon: MOON, sun: SUN };
  /* Two kinds of theme control: data-theme-btn="seg" (two labelled buttons) or "icon" */
  function syncThemeBtn(el) {
    var day = PC.theme.get() === "day";
    if (el.getAttribute("data-theme-btn") === "icon") {
      el.innerHTML = day ? MOON : SUN;
      el.setAttribute("aria-label", day ? "Switch to Polar Night" : "Switch to Polar Day");
      el.title = el.getAttribute("aria-label");
    } else {
      el.innerHTML = '<button type="button" data-t="night" aria-pressed="' + !day + '">' + MOON + 'Polar Night</button>' +
        '<button type="button" data-t="day" aria-pressed="' + day + '">' + SUN + 'Polar Day</button>';
    }
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-theme-btn]"); if (!b) return;
    if (b.getAttribute("data-theme-btn") === "icon") PC.theme.toggle();
    else { var t = e.target.closest("[data-t]"); if (t) PC.theme.set(t.getAttribute("data-t")); }
  });
  PC.initThemeButtons = function () { PC.$$("[data-theme-btn]").forEach(function (el) { if (el.getAttribute("data-theme-btn") === "seg") { el.classList.add("seg"); el.setAttribute("role", "group"); el.setAttribute("aria-label", "Theme"); } syncThemeBtn(el); }); };

  /* ---------- brand ---------- */
  PC.logo = function (w) {
    w = w || 44;
    return '<svg width="' + w + '" height="' + Math.round(w * 0.7) + '" viewBox="0 0 40 28" aria-hidden="true"><path d="M4 26 A16 16 0 0 1 36 26 Z" fill="#EAF6FF" stroke="#7FB5DE" stroke-width="1.5"/><path d="M6 20 H34 M10 14 H30 M13 26 V20 M27 26 V20 M20 20 V14" stroke="#A9CFEA" stroke-width="1.5" fill="none"/><path d="M16 26 V21 A4 4 0 0 1 24 21 V26 Z" fill="#FFB547"/></svg>';
  };
  PC.igloo = function (w) {
    return '<svg width="' + w + '" viewBox="0 0 240 140" aria-hidden="true"><ellipse cx="120" cy="128" rx="116" ry="12" fill="#CFE6F7" opacity=".55"/><defs><clipPath id="pcDome"><path d="M30 126 A90 90 0 0 1 210 126 Z"/></clipPath></defs><path d="M30 126 A90 90 0 0 1 210 126 Z" fill="#FFFFFF" stroke="#7FB5DE" stroke-width="2"/><g clip-path="url(#pcDome)" stroke="#A9CFEA" stroke-width="2" fill="none"><path d="M20 104 H220 M20 82 H220 M20 60 H220"/><path d="M60 126 V104 M100 126 V104 M140 126 V104 M180 126 V104 M80 104 V82 M120 104 V82 M160 104 V82 M200 104 V82 M60 82 V60 M100 82 V60 M140 82 V60 M180 82 V60 M120 60 V36"/></g><path d="M98 126 V104 A22 22 0 0 1 142 104 V126 Z" fill="#FFB547"/><path d="M106 126 V108 A14 14 0 0 1 134 108 V126 Z" fill="#E8892B"/></svg>';
  };

  /* ---------- toast & modal ---------- */
  var toastTimer;
  PC.toast = function (msg, ms) {
    var t = PC.$("#pc-toast");
    if (!t) { t = document.createElement("div"); t.id = "pc-toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || 2600);
  };
  PC.modal = function (title, bodyHTML, opts) {
    opts = opts || {};
    var prev = document.activeElement;
    var m = document.createElement("div");
    m.className = "modal";
    m.innerHTML = '<div class="modal-box' + (opts.wide ? " wide" : "") + '" role="dialog" aria-modal="true" aria-labelledby="pcmt"><div class="modal-head"><h2 id="pcmt">' + PC.esc(title) +
      '</h2><button type="button" class="btn icon small" data-close aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><div class="modal-body">' + bodyHTML + "</div></div>";
    document.body.appendChild(m);
    function close() { m.remove(); document.removeEventListener("keydown", onKey); if (prev && prev.focus) prev.focus(); if (opts.onClose) opts.onClose(); }
    function onKey(e) { if (e.key === "Escape") close(); }
    m.addEventListener("click", function (e) { if (e.target === m || e.target.closest("[data-close]")) close(); });
    document.addEventListener("keydown", onKey);
    var f = m.querySelector("input,select,textarea,button:not([data-close])"); if (f) setTimeout(function () { f.focus(); }, 30);
    return { el: m, close: close };
  };
  PC.confirm = function (title, text, okLabel, danger) {
    return new Promise(function (resolve) {
      var done = false;
      var m = PC.modal(title, '<p>' + text + '</p><div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn ' + (danger ? "danger" : "primary") + '" data-ok>' + PC.esc(okLabel || "OK") + "</button></div>",
        { onClose: function () { if (!done) resolve(false); } });
      m.el.querySelector("[data-ok]").addEventListener("click", function () { done = true; m.close(); resolve(true); });
    });
  };

  /* ---------- QR code ---------- */
  PC.qrSVG = function (text) {
    var q = qrcode(0, "M"); q.addData(text, "Byte"); q.make();
    var n = q.getModuleCount(), d = "";
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += "M" + c + " " + r + "h1v1h-1z";
    return '<svg viewBox="0 0 ' + n + " " + n + '" shape-rendering="crispEdges" role="img" aria-label="QR code to join this room"><path d="' + d + '" fill="#0B1F3A"/></svg>';
  };

  /* ---------- server settings ---------- */
  // Which server a page uses: the site's own (config.js), a teacher's own Supabase (Settings), or demo.
  // Firebase Realtime Database URLs look like https://NAME-default-rtdb.firebaseio.com
  // or https://NAME-default-rtdb.REGION.firebasedatabase.app
  PC.fbUrlOk = function (u) { return /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.(firebaseio\.com|firebasedatabase\.app)$/.test(String(u || "")); };
  PC.cleanFbUrl = function (u) { return String(u || "").trim().replace(/\/+$/, "").replace(/^http:/, "https:").toLowerCase(); };
  PC.server = {
    site: function () {
      if (CFG.supabaseUrl && CFG.supabaseKey) return { mode: "supabase", url: CFG.supabaseUrl.replace(/\/+$/, ""), key: CFG.supabaseKey, own: false };
      if (CFG.firebaseUrl && PC.fbUrlOk(PC.cleanFbUrl(CFG.firebaseUrl))) return { mode: "firebase", url: PC.cleanFbUrl(CFG.firebaseUrl), own: false };
      return null;
    },
    own: function () {
      var o = PC.store.get("ownServer", null); if (!o) return null;
      if (o.type === "firebase") return PC.fbUrlOk(o.fbUrl) ? { mode: "firebase", url: o.fbUrl, own: true } : null;
      return o.url && o.key ? { mode: "supabase", url: o.url.replace(/\/+$/, ""), key: o.key, own: true } : null;
    },
    // What a saved session remembers about its server, and back again
    save: function (srv) { return srv.mode === "demo" ? "demo" : !srv.own ? "site" : srv.mode === "firebase" ? { type: "firebase", url: srv.url } : { url: srv.url, key: srv.key }; },
    load: function (x) {
      if (x === "demo") return { mode: "demo" };
      if (x === "site" || !x) return PC.server.site() || { mode: "demo" };
      if (x.type === "firebase") return { mode: "firebase", url: x.url, own: true };
      return { mode: "supabase", url: x.url, key: x.key, own: true };
    },
    current: function () {
      var choice = PC.store.get("serverChoice", "site");
      if (choice === "demo") return { mode: "demo" };
      if (choice === "own" && PC.server.own()) return PC.server.own();
      return PC.server.site() || PC.server.own() || { mode: "demo" };
    },
    // Short form for links: a *.supabase.co project becomes just its ref
    pack: function (srv) {
      if (srv && srv.mode === "firebase" && srv.own) return { s: "fb:" + srv.url.replace(/^https:\/\//, "") };
      if (!srv || srv.mode !== "supabase" || !srv.own) return null;
      var m = /^https:\/\/([a-z0-9]{8,40})\.supabase\.co$/.exec(srv.url);
      return { s: m ? m[1] : srv.url, k: srv.key };
    },
    unpack: function (s, k) {
      if (s && /^fb:/.test(s)) { var fu = PC.cleanFbUrl("https://" + s.slice(3)); return PC.fbUrlOk(fu) ? { mode: "firebase", url: fu, own: true } : null; }
      if (!s || !k) return null;
      var url = /^[a-z0-9]{8,40}$/.test(s) ? "https://" + s + ".supabase.co" : s;
      if (!/^https:\/\//.test(url)) return null;
      return { mode: "supabase", url: url, key: k, own: true };
    }
  };

  /* ---------- connections ---------- */
  // conn = PC.connect(server); conn.join(code, role, handlers)
  //   handlers.onState(msg)  (students), handlers.onMessage(msg) (teacher), handlers.onStatus(status, detail)
  //   conn.broadcast(msg)    teacher -> everyone (websocket)
  //   conn.toHost(msg)       student -> teacher only (HTTP, so nobody else receives it)
  var clients = {};
  function sbClient(srv) {
    var k = srv.url + "|" + srv.key;
    if (!clients[k]) {
      clients[k] = window.supabase.createClient(srv.url, srv.key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        realtime: { params: { eventsPerSecond: 20 } }
      });
    }
    return clients[k];
  }
  PC.connect = function (srv) {
    return srv.mode === "supabase" ? supabaseConn(srv) : srv.mode === "firebase" ? firebaseConn(srv) : demoConn();
  };
  function topic(code, part) { return "pc-" + String(code).toLowerCase() + "-" + part; }

  function supabaseConn(srv) {
    var sb = sbClient(srv), room = null, host = null, sendHost = null, closed = false;
    return {
      mode: "supabase",
      join: function (code, role, h) {
        h = h || {};
        room = sb.channel(topic(code, "room"), { config: { broadcast: { self: false, ack: false } } });
        if (role === "student") room.on("broadcast", { event: "s" }, function (p) { if (h.onState) h.onState(p.payload); });
        room.subscribe(function (status, err) { if (!closed && h.onStatus) h.onStatus(status, err); });
        if (role === "teacher") {
          host = sb.channel(topic(code, "host"), { config: { broadcast: { self: false } } });
          host.on("broadcast", { event: "m" }, function (p) { if (h.onMessage) h.onMessage(p.payload); });
          host.subscribe(function (status, err) { if (!closed && h.onHostStatus) h.onHostStatus(status, err); });
        } else {
          sendHost = sb.channel(topic(code, "host"));
        }
      },
      broadcast: function (msg) {
        if (!room) return Promise.resolve("error");
        return room.send({ type: "broadcast", event: "s", payload: msg });
      },
      toHost: async function (msg) {
        if (!sendHost) throw new Error("not joined");
        try {
          if (sendHost.httpSend) { await sendHost.httpSend("m", msg); return true; }
        } catch (e) {
          // Older Realtime servers: fall back to the batch REST endpoint
          if (!/404|v2\.97/.test(String(e && e.message))) throw e;
        }
        var r = await sendHost.send({ type: "broadcast", event: "m", payload: msg });
        if (r !== "ok") throw new Error("send " + r);
        return true;
      },
      close: function () {
        closed = true;
        try { if (room) sb.removeChannel(room); if (host) sb.removeChannel(host); if (sendHost) sb.removeChannel(sendHost); } catch (e) {}
      }
    };
  }
  /* Firebase Realtime Database. The SDK loads only when a room uses Firebase.
     Layout: pc/<room>/s/<id> = latest signed state from the teacher (older ones are removed)
             pc/<room>/m/<id> = messages from phones; the teacher reads and deletes each one
     Everything is stored as a JSON string in "j" so any message shape is allowed. */
  var fbLoading = null, fbApps = {};
  function loadScript(src) {
    return new Promise(function (res, rej) { var el = document.createElement("script"); el.src = src; el.onload = res; el.onerror = function () { rej(new Error("Couldn’t load " + src)); }; document.head.appendChild(el); });
  }
  PC.loadFirebase = function () {
    if (window.firebase && window.firebase.database) return Promise.resolve();
    if (!fbLoading) fbLoading = loadScript("vendor/firebase-app.js").then(function () { return loadScript("vendor/firebase-database.js"); })
      .catch(function (e) { fbLoading = null; throw e; });
    return fbLoading;
  };
  function fbDb(url) {
    if (!fbApps[url]) fbApps[url] = window.firebase.initializeApp({ databaseURL: url }, "pc" + Object.keys(fbApps).length);
    return fbApps[url].database();
  }
  function fbPack(msg) { return { j: JSON.stringify(msg), t: window.firebase.database.ServerValue.TIMESTAMP }; }
  function firebaseConn(srv) {
    var db = null, base = null, h = {}, role = null, closed = false, listeners = [], lastState = null;
    var ready = PC.loadFirebase().then(function () { db = fbDb(srv.url); });
    function status(st, d) { if (closed) return; if (h.onStatus) h.onStatus(st, d); if (h.onHostStatus) h.onHostStatus(st, d); }
    function listen(ref, ev, fn) { ref.on(ev, fn, function (err) { status("CHANNEL_ERROR", err); }); listeners.push([ref, ev, fn]); }
    return {
      mode: "firebase",
      join: function (code, r, handlers) {
        h = handlers || {}; role = r;
        ready.then(function () {
          if (closed) return;
          base = db.ref("pc/" + String(code).toLowerCase());
          var up = false, timer = setTimeout(function () { if (!up) status("TIMED_OUT"); }, 15000);
          listen(db.ref(".info/connected"), "value", function (snap) {
            if (snap.val() === true) {
              up = true; clearTimeout(timer);
              if (role === "teacher") base.onDisconnect().remove(); // tidy up if the teacher's tab closes
              status("SUBSCRIBED");
            } else if (up) status("CLOSED");
          });
          if (role === "teacher") {
            // Clear states left by an earlier visit, then read and delete phone messages as they arrive
            base.child("s").once("value").then(function (snap) { var u = {}; snap.forEach(function (c) { u[c.key] = null; }); if (Object.keys(u).length) return base.child("s").update(u); }).catch(function () {});
            listen(base.child("m"), "child_added", function (snap) {
              var v = snap.val(); snap.ref.remove().catch(function () {});
              if (v && typeof v.j === "string" && h.onMessage) { try { h.onMessage(JSON.parse(v.j)); } catch (e) {} }
            });
          } else {
            listen(base.child("s").limitToLast(1), "child_added", function (snap) {
              var v = snap.val();
              if (v && typeof v.j === "string" && h.onState) { try { h.onState(JSON.parse(v.j)); } catch (e) {} }
            });
          }
        }, function (e) { status("CHANNEL_ERROR", e); });
      },
      broadcast: function (msg) {
        if (!base) return Promise.resolve("error");
        var ref = base.child("s").push(), prev = lastState; lastState = ref;
        return ref.set(fbPack(msg)).then(function () { if (prev) prev.remove().catch(function () {}); return "ok"; }, function () { return "error"; });
      },
      toHost: async function (msg) {
        await ready;
        if (!base) throw new Error("not joined");
        await base.child("m").push(fbPack(msg));
        return true;
      },
      close: function () {
        closed = true;
        listeners.forEach(function (l) { try { l[0].off(l[1], l[2]); } catch (e) {} });
        if (base && role === "teacher") { try { base.onDisconnect().cancel(); base.remove().catch(function () {}); } catch (e) {} }
      }
    };
  }
  PC.firebaseRules = JSON.stringify({ rules: { pc: { $room: {
    ".read": true, ".write": "!newData.exists()",
    s: { $id: { ".write": true, ".validate": "newData.child('j').isString() && newData.child('j').val().length < 100000" } },
    m: { $id: { ".write": "!data.exists() || !newData.exists()", ".validate": "newData.child('j').isString() && newData.child('j').val().length < 8000" } }
  } } } }, null, 2);

  // Demo mode: every tab of this browser on this site shares messages. Good for trying the app.
  function demoConn() {
    var room = null, host = null;
    return {
      mode: "demo",
      join: function (code, role, h) {
        h = h || {};
        room = new BroadcastChannel(topic(code, "room"));
        if (role === "student") room.onmessage = function (e) { if (h.onState) h.onState(e.data); };
        if (role === "teacher") { host = new BroadcastChannel(topic(code, "host")); host.onmessage = function (e) { if (h.onMessage) h.onMessage(e.data); }; }
        else host = new BroadcastChannel(topic(code, "host"));
        setTimeout(function () { if (h.onStatus) h.onStatus("SUBSCRIBED"); if (h.onHostStatus) h.onHostStatus("SUBSCRIBED"); }, 30);
      },
      broadcast: function (msg) { room.postMessage(msg); return Promise.resolve("ok"); },
      toHost: function (msg) { host.postMessage(msg); return Promise.resolve(true); },
      close: function () { try { room.close(); host.close(); } catch (e) {} }
    };
  }
  // Settings > Test connection
  PC.testServer = function (srv) {
    if (srv.mode === "firebase") return testFirebase(srv);
    return new Promise(function (resolve) {
      if (!/^https:\/\/.+/.test(srv.url || "")) return resolve({ ok: false, why: "The Project URL should start with https://" });
      var sb, ch, done = false;
      try { sb = window.supabase.createClient(srv.url, srv.key, { auth: { persistSession: false, autoRefreshToken: false } }); }
      catch (e) { return resolve({ ok: false, why: "That URL or key doesn't look right." }); }
      var t = setTimeout(function () { finish({ ok: false, why: "No answer after 12 seconds. If your project is paused, open supabase.com/dashboard, pick the project and press Restore, then try again." }); }, 12000);
      function finish(r) { if (done) return; done = true; clearTimeout(t); try { sb.removeChannel(ch); } catch (e) {} resolve(r); }
      ch = sb.channel("pc-test-" + PC.uid(6));
      ch.subscribe(function (status, err) {
        if (status === "SUBSCRIBED") finish({ ok: true });
        else if (status === "CHANNEL_ERROR") finish({ ok: false, why: "The server turned us away" + (err && err.message ? " (" + err.message + ")" : "") + ". Check the key, and that Realtime > Settings allows public access." });
        else if (status === "TIMED_OUT") finish({ ok: false, why: "Timed out. If your project is paused, restore it in the Supabase dashboard." });
      });
    });
  };

  function testFirebase(srv) {
    return new Promise(function (resolve) {
      if (!PC.fbUrlOk(srv.url)) return resolve({ ok: false, why: "That doesn’t look like a Realtime Database URL. It should look like https://your-project-default-rtdb.firebaseio.com (copy it from the top of the Data tab)." });
      var done = false, t = setTimeout(function () { finish({ ok: false, why: "No answer after 15 seconds. Check the URL. On the free plan, it may also mean 100 devices are already connected." }); }, 15000);
      function finish(r) { if (done) return; done = true; clearTimeout(t); resolve(r); }
      PC.loadFirebase().then(function () {
        var ref = fbDb(srv.url).ref("pc/test-" + PC.uid(6).toLowerCase() + "/m").push();
        return ref.set(fbPack({ t: "test" })).then(function () { return ref.remove(); });
      }).then(function () { finish({ ok: true }); }, function (e) {
        var m = String(e && (e.code || e.message) || e);
        finish({ ok: false, why: /permission/i.test(m) ? "Connected, but your database rules don’t allow Poller Crowd yet. Paste the rules from the setup guide into Realtime Database → Rules and press Publish." : "Couldn’t connect (" + m + ")." });
      });
    });
  }

  /* ---------- teacher keys & room codes ---------- */
  var WORDS = ["IGLOO", "FROST", "FLAKE", "POLAR", "CHILL", "NORTH", "SLEET", "ICICLE", "TUNDRA", "AURORA", "SLED", "MITTEN",
    "SCARF", "COCOA", "PARKA", "CRISP", "FJORD", "ORCA", "WALRUS", "PUFFIN", "OTTER", "NARWHAL", "PENGUIN", "SEAL",
    "HUSKY", "CARIBOU", "MOOSE", "LYNX", "BERG", "FLURRY", "DRIFT", "POWDER", "SKATE", "SNOWY", "WINTER", "ARCTIC",
    "CRYSTAL", "COMET", "MOON", "STAR", "NOVA", "PINE", "CEDAR", "SPRUCE", "CABIN", "LODGE", "EMBER", "CANDLE",
    "QUILT", "SOCKS", "BEANIE", "KAYAK", "CANOE", "PEBBLE", "GLOW", "BREEZE", "MAPLE", "BIRCH", "OWL", "FOX",
    "BEAR", "WHALE", "ROBIN", "SPARK"];
  PC.WORDS = WORDS;
  async function codeFromKey(pubB64) {
    var h = await sha256(unb64url(pubB64));
    return { code: WORDS[h[9] % 64] + "-" + (((h[10] << 8) | h[11]) % 900 + 100), fp: b64url(h.slice(0, 9)) };
  }
  PC.keys = {
    // A fresh key pair for each room; the room code is derived from the public key
    create: async function () {
      var kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
      var pub = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)));
      var jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
      var id = await codeFromKey(pub);
      return { pub: pub, jwk: jwk, code: id.code, fp: id.fp, priv: kp.privateKey };
    },
    load: async function (saved) {
      var priv = await crypto.subtle.importKey("jwk", saved.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
      return Object.assign({}, saved, { priv: priv });
    },
    sign: async function (keys, text) {
      var sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.priv, new TextEncoder().encode(text));
      return b64url(new Uint8Array(sig));
    }
  };
  var pubCache = {};
  // Returns true only if msg was signed by the key that matches this room (code + optional fingerprint)
  PC.verifyState = async function (msg, code, fp) {
    try {
      if (!msg || typeof msg.d !== "string" || !msg.pk || !msg.sig) return false;
      var id = pubCache[msg.pk];
      if (!id) {
        var key = await crypto.subtle.importKey("raw", unb64url(msg.pk), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
        var c = await codeFromKey(msg.pk);
        id = pubCache[msg.pk] = { key: key, code: c.code, fp: c.fp };
      }
      if (id.code !== code) return false;
      if (fp && id.fp !== fp) return false;
      return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, id.key, unb64url(msg.sig), new TextEncoder().encode(msg.d));
    } catch (e) { return false; }
  };
  PC.normCode = function (s) {
    s = String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    var m = /^([A-Z]+)(\d{3})$/.exec(s);
    return m ? m[1] + "-" + m[2] : null;
  };

  /* ---------- links ---------- */
  PC.siteBase = function () { return location.href.replace(/[?#].*$/, "").replace(/[^/]*$/, ""); };
  PC.joinUrl = function (code, fp, srv) {
    var u = PC.siteBase() + "join.html?r=" + encodeURIComponent(code) + "&f=" + encodeURIComponent(fp);
    var p = PC.server.pack(srv); if (p) u += "&s=" + encodeURIComponent(p.s) + (p.k ? "&k=" + encodeURIComponent(p.k) : "");
    if (srv && srv.mode === "demo") u += "&demo=1";
    return u;
  };

  /* ---------- footer credits & feedback ---------- */
  PC.credits = function (el, opts) {
    opts = opts || {};
    el.className = "credits";
    el.innerHTML = '<span>Powered by <a href="' + PC.esc(CFG.homeUrl || "https://www.collegetowns.org") + '" target="_blank" rel="noopener">College Towns</a></span>' +
      '<span class="sep" aria-hidden="true">·</span><span>Find more free apps in the <a href="' + PC.esc(CFG.appLockerUrl || CFG.homeUrl || "#") + '" target="_blank" rel="noopener">College Towns App Locker</a></span>' +
      (opts.compact ? "" : '<span class="sep" aria-hidden="true">·</span><button type="button" class="linkbtn" data-feedback>Feedback or bug?</button><span class="sep" aria-hidden="true">·</span><a href="privacy.html">Privacy</a>');
  };
  document.addEventListener("click", function (e) { if (e.target.closest("[data-feedback]")) { e.preventDefault(); PC.feedback(); } });
  PC.feedback = function (where) {
    var m = PC.modal("Feedback or bug?",
      '<form class="stack-16" id="pcfb" novalidate><p class="muted">Spotted something broken, or have an idea? Send it in. Every note gets read.</p>' +
      '<fieldset><legend>What is it?</legend><div class="grid2">' +
      '<label class="check"><input type="radio" name="kind" value="Bug" checked> Something\'s broken</label>' +
      '<label class="check"><input type="radio" name="kind" value="Idea"> An idea or feature</label>' +
      '<label class="check"><input type="radio" name="kind" value="Wording"> Wording or content</label>' +
      '<label class="check"><input type="radio" name="kind" value="Other"> Something else</label></div></fieldset>' +
      '<label class="field"><span>Where?</span><select class="input" name="where"><option>Presenter’s screen</option><option>Phone (joining)</option><option>Buddies</option><option>Exports (CSV, summary, PowerPoint)</option><option>Setup or Supabase</option><option>Other</option></select></label>' +
      '<label class="field"><span>What happened, or what would you like?*</span><textarea class="input" name="what" rows="4" required placeholder="What you did, what you expected, what happened instead"></textarea></label>' +
      '<div class="grid2"><label class="field"><span>Your name (optional)</span><input class="input" name="name" autocomplete="name"></label>' +
      '<label class="field"><span>Your email (optional, for a reply)</span><input class="input" name="email" type="email" autocomplete="email"></label></div>' +
      '<input name="_gotcha" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-5000px">' +
      '<label class="check"><input type="checkbox" name="device" checked> Include my browser and device type (helps with bugs)</label>' +
      '<div id="pcfbmsg" role="status"></div><div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Continue</button></div></form>');
    var f = m.el.querySelector("#pcfb");
    if (where) f.elements.where.value = where;
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = function (n) { return (f.elements[n].value || "").trim(); };
      var msg = m.el.querySelector("#pcfbmsg");
      if (v("_gotcha")) return;
      if (!v("what")) { msg.innerHTML = '<p class="warm">Please describe it in a sentence or two.</p>'; f.elements.what.focus(); return; }
      var to = ""; try { to = atob(CFG.feedbackTo || "").split("").reverse().join(""); } catch (x) {}
      var kind = f.elements.kind.value;
      var subject = "Poller Crowd " + kind.toLowerCase() + ": " + v("what").slice(0, 60);
      var body = ["Type: " + kind, "Where: " + v("where"), "", v("what"), "", "From: " + (v("name") || "(anonymous)"), "Reply to: " + (v("email") || "(not given)")];
      if (f.elements.device.checked) body.push("", "Device: " + navigator.userAgent, "Page: " + location.pathname, "Screen: " + screen.width + "x" + screen.height);
      body = body.join("\n");
      var gmail = "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(to) + "&su=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
      var mailto = "mailto:" + encodeURIComponent(to) + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
      msg.innerHTML = '<div class="banner">Almost done! Open your email, then press Send:</div><div class="modal-actions" style="justify-content:flex-start">' +
        '<a class="btn primary" href="' + gmail + '" target="_blank" rel="noopener">Send with Gmail ↗</a><a class="btn" href="' + mailto + '">Send with my email app</a></div>';
    });
  };

  /* ---------- privacy-friendly visitor counts (GoatCounter) ---------- */
  if (CFG.goatcounterCode && /^[a-z0-9-]+$/i.test(CFG.goatcounterCode) && !/^(localhost|127\.)/.test(location.hostname)) {
    window.goatcounter = { path: location.pathname || "/" }; // never send ?r=ROOM-CODE or keys
    var gs = document.createElement("script");
    gs.async = true; gs.src = "https://gc.zgo.at/count.js";
    gs.setAttribute("data-goatcounter", "https://" + CFG.goatcounterCode + ".goatcounter.com/count");
    document.head.appendChild(gs);
  }

  /* ---------- photos for questions (kept in this browser's IndexedDB, not localStorage) ---------- */
  var dbp = null, imgCache = {};
  function idb() {
    if (!dbp) dbp = new Promise(function (ok, fail) {
      var r = indexedDB.open("pollercrowd", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("images"); };
      r.onsuccess = function () { ok(r.result); }; r.onerror = function () { fail(r.error); };
    });
    return dbp;
  }
  function tx(mode, fn) { return idb().then(function (db) { return new Promise(function (ok, fail) { var t = db.transaction("images", mode), st = t.objectStore("images"), res = fn(st); t.oncomplete = function () { ok(res && res.result); }; t.onerror = function () { fail(t.error); }; }); }); }
  PC.images = {
    // Shrinks a photo to at most 1600px and saves it; returns its id
    add: function (file) {
      return new Promise(function (ok, fail) {
        var url = URL.createObjectURL(file), img = new Image();
        img.onload = function () {
          var max = 1600, sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
          var c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
          var g = c.getContext("2d"); g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          PC.images.save(c.toDataURL("image/jpeg", 0.85)).then(ok, fail);
        };
        img.onerror = function () { URL.revokeObjectURL(url); fail(new Error("not an image")); };
        img.src = url;
      });
    },
    save: function (dataUrl, id) {
      id = id || "img_" + PC.uid(9);
      imgCache[id] = dataUrl;
      return tx("readwrite", function (st) { return st.put(dataUrl, id); }).then(function () { return id; });
    },
    cached: function (id) { return id ? imgCache[id] : null; },
    get: function (id) {
      if (!id) return Promise.resolve(null);
      if (imgCache[id]) return Promise.resolve(imgCache[id]);
      return tx("readonly", function (st) { return st.get(id); }).then(function (v) { if (v) imgCache[id] = v; return v || null; }).catch(function () { return null; });
    },
    // Load every photo used by these questions; resolves once they're ready to draw
    preload: function (questions) { return Promise.all((questions || []).map(function (q) { return PC.images.get(q.image); })); },
    keepOnly: function (ids) {
      Object.keys(imgCache).forEach(function (k) { ids[k] = 1; }); // never remove photos added or used during this visit
      return tx("readwrite", function (st) {
        var r = st.openCursor(); r.onsuccess = function () { var c = r.result; if (!c) return; if (!ids[c.key]) c.delete(); c.continue(); };
      }).catch(function () {});
    }
  };

  // If something goes wrong, say so instead of failing silently
  window.addEventListener("unhandledrejection", function (e) {
    console.error(e.reason);
    if (PC.toast) PC.toast("Something went wrong: " + ((e.reason && e.reason.message) || e.reason || "unknown error") + ". Try reloading the page.", 6000);
  });

  PC.cfg = CFG;
  window.PC = PC;
})();
