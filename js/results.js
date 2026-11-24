/* Poller Crowd — question types, result math and result views (shared by the teacher screen and exports). */
(function () {
  "use strict";
  var esc = function (s) { return window.PC.esc(s); };

  var TYPES = {
    mc: { name: "Multiple choice", hint: "Pick one answer", glyph: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="4" rx="1.5"/><rect x="3" y="10" width="12" height="4" rx="1.5"/><rect x="3" y="16" width="7" height="4" rx="1.5"/></svg>' },
    wc: { name: "Word cloud", hint: "Short words grow big", glyph: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.3 4.6 4.6 0 0 0 7 18.5z"/></svg>' },
    rs: { name: "Rating scale", hint: "1 to 5 or 1 to 10", glyph: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.2l2.7 5.5 6 .9-4.35 4.25 1.03 6L12 17l-5.38 2.85 1.03-6L3.3 9.6l6-.9z"/></svg>' },
    qa: { name: "Open Q&A", hint: "Questions + upvotes", glyph: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4.5h16v11.5H10l-6 4.5z"/><path d="M10 8.7a2 2 0 1 1 2.7 1.9c-.45.2-.7.55-.7 1.05v.35"/><path d="M12 13.9v.1"/></svg>' },
    qz: { name: "Quiz race", hint: "Competition: speed scores points", glyph: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M9.5 2.5h5M12 6V2.5M18.5 6.5l1.5-1.5"/></svg>' },
    rk: { name: "Ranking", hint: "Put items in order", glyph: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 6h10M10 12h7M10 18h4"/><path d="M4.5 4.5l1-.8v4.3M3.8 11.2a1.1 1.1 0 1 1 1.9.8L3.8 14.4h2.2M3.8 16.6h2.1l-1.1 1.3a1.15 1.15 0 1 1-1.1 1.6"/></svg>' },
    th: { name: "Thermometer", hint: "Slide between two poles", glyph: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13.6V5a2 2 0 1 1 4 0v8.6a4 4 0 1 1-4 0z"/><path d="M12 9v8"/><path d="M17.5 5h2.5M17.5 9h2.5"/></svg>' },
    sl: { name: "Info slide", hint: "Title, notes or a break", glyph: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M7 8.5h10M7 12h6M12 16v4M8.5 20h7"/></svg>' }
  };
  var LETTERS = "ABCDEFGH";

  // Correct answers are a list (older sets stored a single number)
  function corrects(q) {
    var c = q && q.correct;
    if (Array.isArray(c)) return c.filter(function (i) { return Number.isInteger(i); });
    return Number.isInteger(c) ? [c] : [];
  }
  function blank(type) {
    var q = { id: window.PC.uid(8), type: type, prompt: "" };
    if (type === "mc") { q.options = ["", "", "", ""]; q.correct = []; q.multi = false; q.timer = 0; }
    if (type === "qz") { q.options = ["", "", "", ""]; q.correct = [0]; q.timer = 20; }
    if (type === "rk") { q.options = ["", "", ""]; }
    if (type === "wc") { q.maxWords = 3; q.moderate = false; }
    if (type === "qa") { q.moderate = false; }
    if (type === "rs") { q.scaleMax = 5; q.lowLabel = "Not at all"; q.highLabel = "Very much"; }
    if (type === "th") { q.lowLabel = ""; q.highLabel = ""; }
    if (type === "sl") { q.body = ""; q.timer = 0; }
    return q;
  }
  // Convert a question to another type, keeping what carries over
  function convert(q, type) {
    var n = blank(type); n.id = q.id; n.prompt = q.prompt;
    if (q.image) { n.image = q.image; n.imageAlt = q.imageAlt; }
    if (n.lowLabel != null && (q.type === "rs" || q.type === "th")) { n.lowLabel = q.lowLabel; n.highLabel = q.highLabel; }
    if (type === "sl" && q.body) n.body = q.body;
    if (n.options && q.options) n.options = q.options.slice(0, 8).concat(n.options.slice(q.options.length)).slice(0, Math.max(q.options.length, type === "rk" ? 3 : 2));
    if (type === "mc" || type === "qz") {
      n.correct = corrects(q).filter(function (i) { return i < n.options.length; });
      if (type === "qz" && !n.correct.length) n.correct = [0];
    }
    return n;
  }
  function cleanOptions(q) { return (q.options || []).map(function (o) { return String(o || "").trim(); }).filter(Boolean); }
  function problems(q) {
    var p = [];
    if (!String(q.prompt || "").trim()) p.push(q.type === "sl" ? "Add a title." : "Add the question text.");
    if (q.type === "th" && (!String(q.lowLabel || "").trim() || !String(q.highLabel || "").trim())) p.push("Name both poles.");
    if (q.type === "mc" || q.type === "qz") { if (cleanOptions(q).length < 2) p.push("Add at least two answers."); }
    if (q.type === "rk" && cleanOptions(q).length < 2) p.push("Add at least two items to rank.");
    if (q.type === "qz" && !corrects(q).filter(function (i) { return String((q.options || [])[i] || "").trim(); }).length) p.push("Mark at least one correct answer.");
    return p;
  }

  /* ---------- result math ---------- */
  function normWord(w) { return String(w || "").toLowerCase().replace(/\s+/g, " ").trim(); }
  function compute(session, q) {
    var A = (session.answers && session.answers[q.id]) || {};
    var who = Object.keys(A);
    var r = { type: q.type, total: who.length };
    var opts = q.options || [];
    if (q.type === "mc" || q.type === "qz") {
      var counts = opts.map(function () { return 0; });
      who.forEach(function (p) {
        var v = A[p]; var picks = Array.isArray(v) ? v : [v && typeof v === "object" ? v.c : v];
        picks.forEach(function (i) { if (i >= 0 && i < counts.length) counts[i]++; });
      });
      var max = Math.max.apply(null, counts.concat([0]));
      r.rows = opts.map(function (o, i) {
        return { label: o, letter: LETTERS[i], count: counts[i], pct: r.total ? Math.round(counts[i] / r.total * 100) : 0, lead: counts[i] === max && max > 0, correct: corrects(q).indexOf(i) >= 0 };
      });
    }
    if (q.type === "rs") {
      var n = q.scaleMax || 5, c = []; for (var i = 1; i <= n; i++) c.push(0);
      var sum = 0;
      who.forEach(function (p) { var v = +A[p]; if (v >= 1 && v <= n) { c[v - 1]++; sum += v; } });
      r.counts = c; r.avg = r.total ? sum / r.total : 0; r.max = n;
    }
    if (q.type === "th") {
      var vals = [], bins = []; for (var b = 0; b < 20; b++) bins.push(0);
      who.forEach(function (p) { var v = +A[p]; if (v >= 0 && v <= 100) { vals.push(v); bins[Math.min(19, Math.floor(v / 5))]++; } });
      vals.sort(function (a, b) { return a - b; });
      r.total = vals.length; r.bins = bins;
      r.avg = vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : 0;
      r.median = vals.length ? (vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2) : 0;
      r.low = vals.length ? vals[Math.floor((vals.length - 1) * 0.25)] : 0; r.high = vals.length ? vals[Math.ceil((vals.length - 1) * 0.75)] : 0;
    }
    if (q.type === "sl") r.total = 0;
    if (q.type === "rk") {
      var k = opts.length, pos = opts.map(function () { return 0; }), pts = opts.map(function () { return 0; });
      who.forEach(function (p) {
        var order = A[p]; if (!Array.isArray(order)) return;
        order.forEach(function (item, place) { if (item >= 0 && item < k) { pos[item] += place + 1; pts[item] += k - place; } });
      });
      var maxPts = Math.max.apply(null, pts.concat([1]));
      r.rows = opts.map(function (o, i) { return { label: o, avg: r.total ? pos[i] / r.total : 0, points: pts[i], pct: Math.round(pts[i] / maxPts * 100) }; })
        .sort(function (a, b) { return r.total ? a.avg - b.avg : 0; });
    }
    if (q.type === "wc") {
      var words = ((session.words || {})[q.id] || []).filter(function (w) { return w.ok && !w.hidden; });
      var map = {};
      words.forEach(function (w) { var key = normWord(w.text); if (!key) return; map[key] = (map[key] || 0) + 1; });
      r.words = Object.keys(map).map(function (k) { return { text: k, count: map[k] }; }).sort(function (a, b) { return b.count - a.count || a.text.localeCompare(b.text); });
      r.total = Object.keys(words.reduce(function (s, w) { s[w.pub] = 1; return s; }, {})).length;
      r.entries = words.length;
      r.pending = ((session.words || {})[q.id] || []).filter(function (w) { return !w.ok && !w.hidden; }).length;
    }
    if (q.type === "qa") {
      var list = ((session.qa || {})[q.id] || []).filter(function (x) { return x.ok && !x.hidden; });
      r.items = list.map(function (x) { return { id: x.id, text: x.text, votes: (x.votes || []).length, answered: !!x.answered, at: x.at }; })
        .sort(function (a, b) { return (a.answered - b.answered) || (b.votes - a.votes) || (a.at - b.at); });
      r.total = Object.keys(list.reduce(function (s, x) { s[x.pub] = 1; return s; }, {})).length;
      r.pending = ((session.qa || {})[q.id] || []).filter(function (x) { return !x.ok && !x.hidden; }).length;
    }
    if (q.type === "qz") r.leaders = leaderboard(session, 10, q.id);
    return r;
  }
  // Cumulative quiz points across the session (up to and including question `uptoId` if given)
  function leaderboard(session, limit, uptoId, all) {
    var tot = {}, ids = [];
    for (var i = 0; i < session.questions.length; i++) {
      var q = session.questions[i]; if (q.type !== "qz") continue;
      var st = (session.status || {})[q.id] || {};
      if (st.revealed || (all && st.openedAt)) ids.push(q.id);
      if (q.id === uptoId) break;
    }
    ids.forEach(function (id) {
      var A = (session.answers || {})[id] || {};
      Object.keys(A).forEach(function (p) { var v = A[p]; tot[p] = (tot[p] || 0) + (v && v.pts || 0); });
    });
    var list = Object.keys(tot).map(function (p) { var r = (session.roster || {})[p] || {}; return { pub: p, pts: tot[p], k: r.k, v: r.v, l: r.l, nick: r.nick || "" }; })
      .sort(function (a, b) { return b.pts - a.pts; });
    list.forEach(function (x, i) { x.rank = i > 0 && list[i - 1].pts === x.pts ? list[i - 1].rank : i + 1; });
    return limit ? list.slice(0, limit) : list;
  }
  function quizPoints(q, choice, ms) {
    if (corrects(q).indexOf(choice) < 0) return 0;
    var total = (q.timer || 20) * 1000;
    var left = Math.max(0, total - ms);
    return 500 + Math.round(500 * left / total);
  }

  /* ---------- views ---------- */
  function buddyName(x) {
    var B = window.PCBuddies;
    return x.nick ? x.nick : B.describe(x.k, x.v, x.l);
  }
  function view(session, q, opts) {
    opts = opts || {};
    var r = compute(session, q), h = "";
    var st = (session.status || {})[q.id] || {};
    var reveal = opts.reveal != null ? opts.reveal : st.revealed;
    if (q.type === "mc" || q.type === "qz") {
      h = '<div class="bars">' + r.rows.map(function (row) {
        var isRight = reveal && row.correct;
        return '<div class="bar-row"><div class="bar-head"><span class="bar-label"><span class="letter' + (isRight ? " correct" : "") + '">' + row.letter + "</span><span>" + esc(row.label) + (isRight ? ' <span class="sr">(correct)</span> ✓' : "") +
          '</span></span><span class="bar-num">' + row.pct + "%<small>" + row.count + (row.count === 1 ? " vote" : " votes") + "</small></span></div>" +
          '<div class="track"><div class="fill' + (isRight ? " correct" : row.lead && !reveal ? " lead" : "") + '" style="width:' + row.pct + '%"></div></div></div>';
      }).join("") + "</div>";
      if (q.type === "qz" && reveal && r.leaders.length) {
        h = '<div class="quiz-split">' + h + '<div class="stack-16" style="gap:8px"><span class="label">Leaderboard</span>' + r.leaders.slice(0, 5).map(function (x) {
          return '<div class="leader"><span class="rank">' + x.rank + "</span>" + window.PCBuddies.svg(x.k, x.v, x.l, 44) + '<span class="who">' + esc(buddyName(x)) + '</span><span class="pts">' + x.pts + "</span></div>";
        }).join("") + "</div></div>";
      }
    }
    if (q.type === "rs") {
      var mx = Math.max.apply(null, r.counts.concat([1]));
      h = '<div class="stat-row"><div class="stat"><span class="label">Average</span><b>' + (r.total ? r.avg.toFixed(1) : "–") + '</b><span class="muted">out of ' + r.max + '</span></div><div class="stat"><span class="label">Responses</span><b>' + r.total + "</b></div></div>" +
        '<div class="hist" role="img" aria-label="Rating counts">' + r.counts.map(function (c, i) {
          return '<div class="col"><b>' + c + '</b><div class="colbar" style="height:' + Math.round(c / mx * 100) + '%"></div><span>' + (i + 1) + "</span></div>";
        }).join("") + '</div><div class="muted" style="display:flex;justify-content:space-between;font-weight:700"><span>1 · ' + esc(q.lowLabel || "") + "</span><span>" + r.max + " · " + esc(q.highLabel || "") + "</span></div>";
    }
    if (q.type === "th") {
      var mb = Math.max.apply(null, r.bins.concat([1])), avg = Math.round(r.avg);
      h = '<div class="stat-row"><div class="stat"><span class="label">Crowd average</span><b>' + (r.total ? avg + "°" : "–") + '</b><span class="muted">' + (r.total ? esc(lean(q, r.avg)) : "out of 100°") + "</span></div>" +
        '<div class="stat"><span class="label">Middle half of the room</span><b>' + (r.total ? r.low + "–" + r.high + "°" : "–") + '</b></div><div class="stat"><span class="label">Responses</span><b>' + r.total + "</b></div></div>" +
        '<div class="therm" role="img" aria-label="Where people placed it, from ' + esc(q.lowLabel || "") + " to " + esc(q.highLabel || "") + (r.total ? ". Average " + avg + " out of 100" : "") + '"><div class="therm-cols">' + r.bins.map(function (c, i) {
          return '<div class="tcol"><div class="tbar" style="height:' + Math.round(c / mb * 100) + "%;background:color-mix(in srgb, var(--warm) " + Math.round((i + 0.5) * 5) + '%, var(--glacier))">' + (c ? "<b>" + c + "</b>" : "") + "</div></div>";
        }).join("") + '</div><div class="therm-track">' + (r.total ? '<span class="therm-pin" style="left:' + r.avg.toFixed(1) + '%"><span>' + avg + "°</span></span>" : "") + "</div>" +
        '<div class="therm-ends"><span>❄ ' + esc(q.lowLabel || "") + "</span><span>" + esc(q.highLabel || "") + " 🔥</span></div></div>";
    }
    if (q.type === "sl") h = q.body ? '<p class="slide-body">' + esc(q.body).replace(/\n/g, "<br>") + "</p>" : "";
    if (q.type === "rk") {
      h = '<div class="bars">' + r.rows.map(function (row, i) {
        return '<div class="bar-row"><div class="bar-head"><span class="bar-label"><span class="letter">' + (i + 1) + "</span><span>" + esc(row.label) + '</span></span><span class="bar-num">' + (r.total ? row.avg.toFixed(1) : "–") + "<small>avg. place</small></span></div>" +
          '<div class="track"><div class="fill' + (i === 0 && r.total ? " lead" : "") + '" style="width:' + (r.total ? row.pct : 0) + '%"></div></div></div>';
      }).join("") + "</div>";
    }
    if (q.type === "wc") {
      if (!r.words.length) h = '<div class="frozen"><h3>Waiting for words…</h3><p class="muted">They’ll grow here as they come in.</p></div>';
      else {
        var top = r.words[0].count, pal = ["var(--ink)", "var(--label)", "var(--glacier)", "var(--muted)"];
        var shown = r.words.slice(0, 60);
        // shuffle deterministically so big words don't all sit at the start
        var mixed = shown.map(function (w, i) { return { w: w, i: i, s: (i * 7919) % 101 }; }).sort(function (a, b) { return a.s - b.s; });
        h = '<div class="cloud" aria-label="Word cloud">' + mixed.map(function (m) {
          var w = m.w, size = Math.round(20 + 76 * Math.sqrt(w.count / top));
          var color = m.i === 0 ? "var(--warm-text)" : pal[m.i % pal.length];
          return '<span style="font-size:' + size + "px;font-weight:" + (w.count / top > .45 ? 700 : 500) + ";color:" + color + '" title="' + w.count + '">' + esc(w.text) + "</span>";
        }).join("") + "</div>";
      }
    }
    if (q.type === "qa") {
      if (!r.items.length) h = '<div class="frozen"><h3>No questions yet</h3><p class="muted">People can ask from their phones and upvote each other’s.</p></div>';
      else h = '<div class="qa-list">' + r.items.slice(0, opts.limit || 12).map(function (x) {
        return '<div class="qa-item' + (x.answered ? " answered" : "") + '"><span class="qa-votes">' + x.votes + "<small>votes</small></span><span class=\"qa-text\">" + esc(x.text) + "</span>" +
          (opts.controls ? '<span class="controls"><button type="button" class="btn small" data-qa-ans="' + x.id + '">' + (x.answered ? "Unmark" : "Answered") + '</button><button type="button" class="btn small" data-qa-hide="' + x.id + '">Hide</button></span>' : "") + "</div>";
      }).join("") + "</div>";
    }
    return { html: h, data: r };
  }

  // Plain words for where the average sits
  function lean(q, avg) {
    if (avg <= 15) return "Way out by " + (q.lowLabel || "the cold pole");
    if (avg < 40) return "Leaning toward " + (q.lowLabel || "the cold pole");
    if (avg <= 60) return "Right in the middle";
    if (avg < 85) return "Leaning toward " + (q.highLabel || "the hot pole");
    return "Way out by " + (q.highLabel || "the hot pole");
  }
  function icon(k, w) { return TYPES[k] ? TYPES[k].glyph.replace(/width="20" height="20"/, 'width="' + (w || 20) + '" height="' + (w || 20) + '"') : ""; }
  var TROPHY = '<svg class="trophy" viewBox="0 0 64 64" aria-hidden="true"><path d="M21 10H11v5a10 10 0 0 0 10 10M43 10h10v5a10 10 0 0 1-10 10" fill="none" stroke="#1B2440" stroke-width="3.5" stroke-linecap="round"/><path d="M20 6h24v17a12 12 0 0 1-24 0z" fill="#FFB547" stroke="#1B2440" stroke-width="3.5" stroke-linejoin="round"/><path d="M32 12l2.2 4.4 4.8.7-3.5 3.4.8 4.8-4.3-2.3-4.3 2.3.8-4.8-3.5-3.4 4.8-.7z" fill="#FFF4D6"/><path d="M28 35h8v8h-8z" fill="#E8892B" stroke="#1B2440" stroke-width="3.5" stroke-linejoin="round"/><rect x="19" y="43" width="26" height="9" rx="2.5" fill="#FFB547" stroke="#1B2440" stroke-width="3.5"/></svg>';
  window.PCResults = { corrects: corrects, TROPHY: TROPHY, icon: icon, TYPES: TYPES, LETTERS: LETTERS, blank: blank, convert: convert, cleanOptions: cleanOptions, problems: problems, compute: compute, view: view, leaderboard: leaderboard, quizPoints: quizPoints, normWord: normWord, buddyName: buddyName, lean: lean };
})();
