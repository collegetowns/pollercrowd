/* Poller Crowd — question types, result math and result views (shared by the teacher screen and exports). */
(function () {
  "use strict";
  var esc = function (s) { return window.PC.esc(s); };

  var TYPES = {
    mc: { name: "Multiple choice", hint: "Pick one answer", glyph: "A" },
    wc: { name: "Word cloud", hint: "Short words grow big", glyph: "W" },
    rs: { name: "Rating scale", hint: "1 to 5 or 1 to 10", glyph: "5" },
    qa: { name: "Open Q&A", hint: "Questions + upvotes", glyph: "?" },
    qz: { name: "Quiz race", hint: "Timed, with a leaderboard", glyph: "Q" },
    rk: { name: "Ranking", hint: "Put items in order", glyph: "#" }
  };
  var LETTERS = "ABCDEFGH";

  function blank(type) {
    var q = { id: window.PC.uid(8), type: type, prompt: "" };
    if (type === "mc") { q.options = ["", "", "", ""]; q.correct = null; q.multi = false; q.timer = 0; }
    if (type === "qz") { q.options = ["", "", "", ""]; q.correct = 0; q.timer = 20; }
    if (type === "rk") { q.options = ["", "", ""]; }
    if (type === "wc") { q.maxWords = 3; q.moderate = false; }
    if (type === "qa") { q.moderate = false; }
    if (type === "rs") { q.scaleMax = 5; q.lowLabel = "Not at all"; q.highLabel = "Very much"; }
    return q;
  }
  // Convert a question to another type, keeping what carries over
  function convert(q, type) {
    var n = blank(type); n.id = q.id; n.prompt = q.prompt;
    if (n.options && q.options) n.options = q.options.slice(0, 8).concat(n.options.slice(q.options.length)).slice(0, Math.max(q.options.length, type === "rk" ? 3 : 2));
    if (type === "qz" && (q.correct == null || q.correct >= n.options.length)) n.correct = 0;
    if (type === "mc" && q.correct != null) n.correct = q.correct < n.options.length ? q.correct : null;
    return n;
  }
  function cleanOptions(q) { return (q.options || []).map(function (o) { return String(o || "").trim(); }).filter(Boolean); }
  function problems(q) {
    var p = [];
    if (!String(q.prompt || "").trim()) p.push("Add the question text.");
    if (q.type === "mc" || q.type === "qz") { if (cleanOptions(q).length < 2) p.push("Add at least two answers."); }
    if (q.type === "rk" && cleanOptions(q).length < 2) p.push("Add at least two items to rank.");
    if (q.type === "qz" && (q.correct == null || !String((q.options || [])[q.correct] || "").trim())) p.push("Mark the correct answer.");
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
        return { label: o, letter: LETTERS[i], count: counts[i], pct: r.total ? Math.round(counts[i] / r.total * 100) : 0, lead: counts[i] === max && max > 0, correct: q.correct === i };
      });
    }
    if (q.type === "rs") {
      var n = q.scaleMax || 5, c = []; for (var i = 1; i <= n; i++) c.push(0);
      var sum = 0;
      who.forEach(function (p) { var v = +A[p]; if (v >= 1 && v <= n) { c[v - 1]++; sum += v; } });
      r.counts = c; r.avg = r.total ? sum / r.total : 0; r.max = n;
    }
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
  function leaderboard(session, limit, uptoId) {
    var tot = {}, ids = [];
    for (var i = 0; i < session.questions.length; i++) {
      var q = session.questions[i]; if (q.type !== "qz") continue;
      var st = (session.status || {})[q.id] || {};
      if (st.revealed) ids.push(q.id);
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
    if (choice !== q.correct) return 0;
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
      if (!r.items.length) h = '<div class="frozen"><h3>No questions yet</h3><p class="muted">Students can ask from their phones and upvote each other’s.</p></div>';
      else h = '<div class="qa-list">' + r.items.slice(0, opts.limit || 12).map(function (x) {
        return '<div class="qa-item' + (x.answered ? " answered" : "") + '"><span class="qa-votes">' + x.votes + "<small>votes</small></span><span class=\"qa-text\">" + esc(x.text) + "</span>" +
          (opts.controls ? '<span class="controls"><button type="button" class="btn small" data-qa-ans="' + x.id + '">' + (x.answered ? "Unmark" : "Answered") + '</button><button type="button" class="btn small" data-qa-hide="' + x.id + '">Hide</button></span>' : "") + "</div>";
      }).join("") + "</div>";
    }
    return { html: h, data: r };
  }

  window.PCResults = { TYPES: TYPES, LETTERS: LETTERS, blank: blank, convert: convert, cleanOptions: cleanOptions, problems: problems, compute: compute, view: view, leaderboard: leaderboard, quizPoints: quizPoints, normWord: normWord, buddyName: buddyName };
})();
