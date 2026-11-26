/* Poller Crowd: Slopes question type.
   People place each item (a case, a policy, an example…) on a two-way map: left–right between
   two poles, and top–bottom across two or three levels. Items come up one at a time; the big
   screen reveals where the crowd landed and builds the map item by item.
   Shared by the presenter screen, phones and exports. */
(function () {
  "use strict";
  var PC = window.PC, esc = PC.esc;

  /* ---------- colors: CSS variables on screen, fixed colors in exported pictures ---------- */
  var VARS = { panel: "var(--panel)", panel2: "var(--panel2)", ink: "var(--ink)", muted: "var(--muted)", label: "var(--label)", glacier: "var(--glacier)",
    border: "var(--border)", border2: "var(--border2)", warm: "var(--warm)", warmInk: "var(--warm-ink)", live: "var(--live)", font: "var(--display)", body: "var(--body)" };
  var FONT = "Fredoka, Nunito, Arial, sans-serif", BODY = "Nunito, Arial, sans-serif";
  var PAL = {
    night: { panel: "#12305A", panel2: "#183B6B", ink: "#EAF6FF", muted: "#A9C7E8", label: "#9FD3F5", glacier: "#5FB6EC", border: "#3B6699", border2: "#234B7D", warm: "#FFB547", warmInk: "#0B1F3A", live: "#6EE7A8", font: FONT, body: BODY },
    day: { panel: "#FFFFFF", panel2: "#DCEEFB", ink: "#0B1F3A", muted: "#3E5F86", label: "#1E66A6", glacier: "#3A97DA", border: "#A9CFEA", border2: "#CFE6F7", warm: "#FFB547", warmInk: "#0B1F3A", live: "#0E7A48", font: FONT, body: BODY }
  };
  function fill(c) { return 'style="fill:' + c + '"'; }
  function stroke(c, w, dash) { return 'style="fill:none;stroke:' + c + ";stroke-width:" + (w || 2) + (dash ? ";stroke-dasharray:" + dash : "") + '"'; }
  function text(c, font, size, weight, extra) { return 'style="fill:' + c + ";font-family:" + font + ";font-size:" + size + "px;font-weight:" + (weight || 600) + (extra || "") + '"'; }

  /* ---------- the question's items and axes ---------- */
  // Each line is "Full name" or "Full name | short label for the map"
  function items(q) {
    return (q.items || []).map(function (line) {
      var s = String(line || ""), i = s.indexOf("|");
      var t = (i < 0 ? s : s.slice(0, i)).trim(), sh = (i < 0 ? "" : s.slice(i + 1)).trim();
      if (!t) return null;
      if (!sh) sh = t.length > 26 ? t.slice(0, 25).trim() + "…" : t;
      return { title: t, short: sh };
    }).filter(Boolean);
  }
  function cleanLines(q) { return (q.items || []).map(function (l) { return String(l || "").trim(); }).filter(function (l) { return l && l.split("|")[0].trim(); }); }
  // Top, optional middle, bottom. A blank middle just means two levels.
  function levels(q) { return (q.levels || []).slice(0, 3).map(function (l) { return String(l || "").trim(); }).filter(Boolean); }
  function upNext(q) { var n = parseInt(q.upNext, 10); return isNaN(n) ? 3 : PC.clamp(n, 0, 5); }
  function levelOf(q, y) { var L = levels(q); if (!L.length) return ""; return L[Math.min(L.length - 1, Math.floor(y * L.length))]; }
  function leanOf(q, x) {
    var lo = q.lowLabel || "the left", hi = q.highLabel || "the right";
    if (x < 0.2) return "All the way to " + lo;
    if (x < 0.4) return "Leaning " + lo;
    if (x <= 0.6) return "Middle ground";
    if (x <= 0.8) return "Leaning " + hi;
    return "All the way to " + hi;
  }
  function spreadOf(marks, a) { if (marks.length < 2) return 0; var s = 0; marks.forEach(function (m) { s += Math.hypot(m.x - a.x, m.y - a.y); }); return s / marks.length; }
  function agreeLabel(n, spread) { return n < 2 ? "One answer" : spread < 0.07 ? "Tight pack" : spread < 0.16 ? "Some spread" : "Big debate"; }

  /* ---------- results math ---------- */
  // Items revealed so far, in the order they were revealed, with the crowd average and everyone's spots
  function compute(session, q) {
    var st = ((session.status || {})[q.id] || {}).sp || {}, A = (session.answers || {})[q.id] || {}, its = items(q), people = {};
    var list = (st.done || []).map(function (idx, k) {
      var it = its[idx]; if (!it) return null;
      var marks = [];
      Object.keys(A).forEach(function (pub) {
        var a = A[pub] && A[pub][idx]; if (!a) return;
        var r = (session.roster || {})[pub] || {};
        var B = window.PCBuddies, who = r.nick || (B && r.k ? B.describe(r.k, r.v) : "");
        marks.push({ x: a[0] / 1000, y: a[1] / 1000, k: r.k, v: r.v, l: r.l, pub: pub, name: who }); people[pub] = 1;
      });
      if (!marks.length) return null;
      var a = { x: 0, y: 0 }; marks.forEach(function (m) { a.x += m.x; a.y += m.y; }); a.x /= marks.length; a.y /= marks.length;
      var sp = spreadOf(marks, a);
      return { id: idx, n: k + 1, title: it.title, label: it.short, x: a.x, y: a.y, marks: marks, spread: sp, agree: agreeLabel(marks.length, sp) };
    }).filter(Boolean);
    var multi = list.filter(function (x) { return x.marks.length > 1; }).sort(function (a, b) { return b.spread - a.spread; });
    return { type: "sp", total: Object.keys(people).length, items: list, debated: multi[0] || null, agreed: multi.length > 1 ? multi[multi.length - 1] : null };
  }

  /* ---------- the map (1000 × 640) ---------- */
  var MW = 1000, MH = 640, X0 = 158, X1 = 972, Y0 = 22, Y1 = 548;
  function PX(x) { return X0 + x * (X1 - X0); }
  function PY(y) { return Y0 + y * (Y1 - Y0); }
  function signIcon(i, n, C) {
    var kind = n === 2 ? (i === 0 ? 0 : 2) : i; // black diamond, blue square, green circle
    if (kind === 0) return '<path d="M0 -14 L14 0 L0 14 L-14 0 Z" ' + fill(C.ink) + "/>";
    if (kind === 1) return '<rect x="-11" y="-11" width="22" height="22" rx="2" ' + fill(C.glacier) + "/>";
    return '<circle r="12" ' + fill(C.live) + "/>";
  }
  function base(q, C, p) {
    var L = levels(q), n = Math.max(1, L.length), w = X1 - X0, h = Y1 - Y0, s = "";
    s += '<defs><clipPath id="' + p + 'c"><rect x="' + X0 + '" y="' + Y0 + '" width="' + w + '" height="' + h + '" rx="18"/></clipPath>' +
      '<linearGradient id="' + p + 'g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:' + C.panel2 + '"/><stop offset="1" style="stop-color:' + C.panel + '"/></linearGradient></defs>';
    s += '<g clip-path="url(#' + p + 'c)"><rect x="' + X0 + '" y="' + Y0 + '" width="' + w + '" height="' + h + '" style="fill:url(#' + p + 'g)"/>';
    // far peaks with snow caps, then the front slope
    s += '<path d="M158 250 L228 160 L278 196 L368 82 L438 160 L498 120 L576 52 L648 136 L718 96 L798 166 L870 86 L938 150 L972 128 L972 548 L158 548 Z" ' + fill(C.border2) + ' opacity=".75"/>';
    s += '<path d="M576 52 L554 82 L566 78 L576 90 L586 76 L600 84 Z M368 82 L348 108 L360 104 L370 114 L380 102 L392 108 Z M870 86 L852 110 L864 106 L874 116 L882 104 L894 110 Z" style="fill:#FFFFFF" opacity=".9"/>';
    s += '<path d="M158 304 Q330 236 500 280 T840 250 Q920 240 972 264 L972 548 L158 548 Z" ' + fill(C.panel) + "/>";
    s += '<path d="M158 304 Q330 236 500 280 T840 250 Q920 240 972 264" ' + stroke(C.border2, 2) + "/>";
    s += '<g opacity=".55"><path d="M290 312 Q330 372 280 422 T330 530" ' + stroke(C.border2, 3) + '/><path d="M298 312 Q338 372 288 422 T338 530" ' + stroke(C.border2, 3) + '/><path d="M720 274 Q670 334 730 394 T680 530" ' + stroke(C.border2, 3) + '/><path d="M728 274 Q678 334 738 394 T688 530" ' + stroke(C.border2, 3) + "/></g>";
    [[186, 540, 1], [208, 546, .8], [946, 540, 1], [924, 548, .75]].forEach(function (t) {
      s += '<g transform="translate(' + t[0] + " " + t[1] + ") scale(" + t[2] + ')" opacity=".45"><path d="M0 -26 L10 -8 L5 -8 L13 6 L-13 6 L-5 -8 L-10 -8 Z" ' + fill(C.live) + "/></g>";
    });
    s += "</g>";
    for (var i = 1; i < n; i++) s += '<line x1="' + X0 + '" y1="' + PY(i / n) + '" x2="' + X1 + '" y2="' + PY(i / n) + '" ' + stroke(C.border, 2, "8 8") + "/>";
    s += '<line x1="' + PX(.5) + '" y1="' + Y0 + '" x2="' + PX(.5) + '" y2="' + Y1 + '" ' + stroke(C.border, 2, "8 8") + "/>";
    s += '<rect x="' + X0 + '" y="' + Y0 + '" width="' + w + '" height="' + h + '" rx="18" ' + stroke(C.border, 2) + "/>";
    // trail-sign levels on the left
    L.forEach(function (lab, i) {
      var cy = PY((i + 0.5) / n), long = lab.length > 9;
      s += '<g transform="translate(76 ' + (cy - 14) + ')"><rect x="-68" y="-30" width="136" height="86" rx="14" ' + fill(C.panel2) + "/>" + signIcon(i, n, C) +
        '<text y="40" text-anchor="middle" ' + text(C.ink, C.font, long ? 15 : 20, 600, ";letter-spacing:.5px") + ">" + esc(lab.length > 14 ? lab.slice(0, 13) + "…" : lab) + "</text></g>";
    });
    // left–right axis
    var ay = 586;
    s += '<g style="fill:none;stroke:' + C.ink + ';stroke-width:3;stroke-linecap:round"><line x1="' + (X0 + 14) + '" y1="' + ay + '" x2="' + (X1 - 14) + '" y2="' + ay + '"/><path d="M' + (X0 + 26) + " " + (ay - 9) + " L" + (X0 + 12) + " " + ay + " L" + (X0 + 26) + " " + (ay + 9) + '"/><path d="M' + (X1 - 26) + " " + (ay - 9) + " L" + (X1 - 12) + " " + ay + " L" + (X1 - 26) + " " + (ay + 9) + '"/></g>';
    [.25, .5, .75].forEach(function (t) { s += '<line x1="' + PX(t) + '" y1="' + (ay - 7) + '" x2="' + PX(t) + '" y2="' + (ay + 7) + '" ' + stroke(C.ink, 2.5) + "/>"; });
    s += '<text x="' + X0 + '" y="' + (ay + 42) + '" ' + text(C.ink, C.font, 26, 600) + ">" + esc(q.lowLabel || "") + "</text>";
    s += '<text x="' + X1 + '" y="' + (ay + 42) + '" text-anchor="end" ' + text(C.ink, C.font, 26, 600) + ">" + esc(q.highLabel || "") + "</text>";
    s += '<text x="' + PX(.5) + '" y="' + (ay + 40) + '" text-anchor="middle" ' + text(C.muted, C.body, 19, 700) + ">middle ground</text>";
    return s;
  }
  function overlap(a, b) { var x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); return x * y; }
  // Find a spot for a w×h label near (X, Y) that keeps clear of every box in `avoid` (buddies, pins, other labels).
  // Tries close spots first, then farther ones joined by a short line. Returns null when nothing is clear and must is false.
  function spotFor(X, Y, w, h, gap, avoid, must) {
    var c = [], rings = [0, 34, 72, 116];
    rings.forEach(function (d) {
      var g = gap + d;
      c.push([g, -h / 2], [-g - w, -h / 2], [-w / 2, g], [-w / 2, -g - h], [g * .75, g * .55], [g * .75, -g * .55 - h], [-g * .75 - w, g * .55], [-g * .75 - w, -g * .55 - h]);
    });
    var best = null, bs = 1e15;
    for (var k = 0; k < c.length; k++) {
      var r = { x: X + c[k][0], y: Y + c[k][1], w: w, h: h }, sc = 0;
      if (r.x < X0 + 4 || r.x + w > X1 - 4 || r.y < Y0 + 4 || r.y + h > Y1 - 4) continue;
      for (var j = 0; j < avoid.length; j++) sc += overlap(r, avoid[j]);
      if (sc === 0) return r;
      sc = sc * 10 + k;
      if (sc < bs) { bs = sc; best = r; }
    }
    return must ? best || { x: Math.max(X0 + 4, Math.min(X - w / 2, X1 - 4 - w)), y: Math.max(Y0 + 4, Y - h - gap), w: w, h: h } : null;
  }
  function boxAround(x, y, r) { return { x: x - r, y: y - r, w: r * 2, h: r * 2 }; }
  function buddyBox(x, y, size) { return { x: x - size / 2, y: y - size / 2, w: size + 8, h: size + 8 }; }
  function layoutTags(list, avoid) {
    avoid = avoid.slice();
    list.forEach(function (it) { avoid.push(boxAround(PX(it.x), PY(it.y), 12)); });
    return list.map(function (it) {
      var X = PX(it.x), Y = PY(it.y), w = Math.round(66 + it.label.length * 12.2), h = 46;
      var r = spotFor(X, Y, w, h, 18, avoid, true);
      avoid.push({ x: r.x - 4, y: r.y - 4, w: r.w + 8, h: r.h + 8 });
      return { it: it, X: X, Y: Y, r: r };
    });
  }
  // Spread out buddies that land on top of each other (a small nudge only; the dashed line still runs to the average)
  function nudge(pts, size) {
    var min = size * .82, lim = size * .7;
    for (var it = 0; it < 30; it++) {
      var moved = false;
      for (var i = 0; i < pts.length; i++) for (var j = i + 1; j < pts.length; j++) {
        var a = pts[i], b = pts[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d >= min) continue;
        if (d < .01) { dx = (j % 2 ? 1 : -1); dy = .3; d = Math.hypot(dx, dy); }
        var push = (min - d) / 2 + .5, ux = dx / d, uy = dy / d;
        a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push; moved = true;
      }
      pts.forEach(function (p) {
        var ox = p.x - p.x0, oy = p.y - p.y0, o = Math.hypot(ox, oy);
        if (o > lim) { p.x = p.x0 + ox / o * lim; p.y = p.y0 + oy / o * lim; }
        p.x = Math.max(X0 + size / 2, Math.min(X1 - size / 2, p.x)); p.y = Math.max(Y0 + size / 2, Math.min(Y1 - size / 2, p.y));
      });
      if (!moved) break;
    }
    return pts;
  }
  function pin(x, y, n, C, r) { r = r || 18; return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" style="fill:' + C.warm + ";stroke:" + C.panel + ';stroke-width:3"/><text x="' + x + '" y="' + (y + r * 0.36) + '" text-anchor="middle" ' + text(C.warmInk, C.font, Math.round(r * 0.98), 700) + ">" + n + "</text>"; }
  function buddyAt(m, x, y, size) {
    var B = window.PCBuddies; if (!B) return "";
    return '<g transform="translate(' + (x - size / 2).toFixed(1) + " " + (y - size / 2).toFixed(1) + ')">' + B.svg(m.k, m.v, m.l, size) + "</g>";
  }
  // Where each buddy is drawn for a set of items (nudged apart so none hides another)
  function placeMarks(list, size) {
    var pts = [];
    list.forEach(function (it) { it.marks.forEach(function (m) { var x = PX(m.x), y = PY(m.y); pts.push({ it: it, m: m, x: x, y: y, x0: x, y0: y }); }); });
    return nudge(pts, size);
  }
  function marksFor(it, pts, C, size, badge) {
    var ax = PX(it.x), ay = PY(it.y), s = "", mine = pts.filter(function (p) { return p.it === it; });
    mine.forEach(function (p) { s += '<line x1="' + p.x + '" y1="' + p.y + '" x2="' + ax + '" y2="' + ay + '" ' + stroke(C.glacier, 2, "5 5") + ' opacity=".8"/>'; });
    mine.forEach(function (p) {
      var x = p.x, y = p.y; s += buddyAt(p.m, x, y, size);
      if (badge) s += '<circle cx="' + (x + size * .36) + '" cy="' + (y + size * .34) + '" r="11" style="fill:' + C.panel + ";stroke:" + C.ink + ';stroke-width:2"/><text x="' + (x + size * .36) + '" y="' + (y + size * .34 + 4.5) + '" text-anchor="middle" ' + text(C.ink, C.font, 13, 700) + ">" + it.n + "</text>";
    });
    s += '<circle cx="' + ax + '" cy="' + ay + '" r="15" style="fill:' + C.panel + ";stroke:" + C.ink + ';stroke-width:2.5;stroke-dasharray:4 3"/><text x="' + ax + '" y="' + (ay + 5.5) + '" text-anchor="middle" ' + text(C.ink, C.font, 15, 700) + ">" + it.n + "</text>";
    return s;
  }
  // Name tags beside each buddy, only where they fit without covering another buddy, an average or another name
  function nameTags(pts, list, C, size, faded) {
    var avoid = [], s = "", fs = size >= 44 ? 17 : 14, h = fs + 12;
    pts.forEach(function (p) { avoid.push(buddyBox(p.x, p.y, size)); });
    list.forEach(function (it) { avoid.push(boxAround(PX(it.x), PY(it.y), 17)); });
    pts.forEach(function (p) {
      var nm = String(p.m.name || "").trim(); if (!nm || (faded && faded(p.it))) return;
      if (nm.length > 18) nm = nm.slice(0, 17) + "…";
      var w = Math.round(nm.length * fs * .56 + 18), r = spotFor(p.x, p.y, w, h, size / 2 + 6, avoid, false);
      if (!r) return;
      avoid.push({ x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 });
      var lx = Math.max(r.x, Math.min(p.x, r.x + r.w)), ly = Math.max(r.y, Math.min(p.y, r.y + r.h)), far = Math.hypot(lx - p.x, ly - p.y) > size / 2 + 14;
      s += '<g class="sp-name">' + (far ? '<line x1="' + p.x + '" y1="' + p.y + '" x2="' + lx + '" y2="' + ly + '" ' + stroke(C.muted, 1.5) + ' opacity=".7"/>' : "") +
        '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" rx="' + (h / 2) + '" style="fill:' + C.panel2 + ";stroke:" + C.border + ';stroke-width:1.5" opacity=".95"/>' +
        '<text x="' + (r.x + r.w / 2) + '" y="' + (r.y + h / 2 + fs * .36) + '" text-anchor="middle" ' + text(C.ink, C.body, fs, 700) + ">" + esc(nm) + "</text></g>";
    });
    return s;
  }
  /* o: { pal: "night" | "day" (fixed colors for pictures; omit for on-screen theme colors),
          mode: "avg" | "orig", show: item id whose spots to show in avg mode, hl: item id to spotlight,
          pins: force numbered pins, attrs: extra svg attributes, id: unique prefix } */
  function svg(q, list, o) {
    o = o || {};
    var C = o.pal ? PAL[o.pal] : VARS, p = o.id || "sp" + Math.random().toString(36).slice(2, 8);
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + MW + " " + MH + '" ' + (o.attrs || "") + ' role="img" aria-label="' + esc("Map from " + (q.lowLabel || "") + " to " + (q.highLabel || "") + " across " + levels(q).join(", ")) + '">' + base(q, C, p);
    var total = 0; list.forEach(function (it) { total += it.marks.length; });
    if (o.mode === "orig") {
      var size = total > 140 ? 30 : total > 70 ? 38 : 50, dim = function (it) { return o.hl != null && o.hl !== it.id; };
      var pts = placeMarks(o.hl != null ? list.filter(function (it) { return it.id === o.hl; }) : list, size), all = o.hl != null ? placeMarks(list, size) : pts;
      // spotlighted case: others fade, and only its people get names
      list.forEach(function (it) { s += '<g opacity="' + (dim(it) ? .12 : 1) + '">' + marksFor(it, dim(it) ? all : pts, C, size, true) + "</g>"; });
      s += nameTags(pts, list.filter(function (it) { return !dim(it); }), C, size);
    } else {
      var avoid = [], shown = list.filter(function (it) { return o.show != null && o.show === it.id; });
      shown.forEach(function (it) {
        var sz = it.marks.length > 25 ? 44 : 58, sp = placeMarks([it], sz);
        sp.forEach(function (p) { avoid.push(buddyBox(p.x, p.y, sz)); });
        s += '<g class="sp-pop">' + marksFor(it, sp, C, sz, false) + "</g>";
      });
      if (o.pins || list.length > 12) list.forEach(function (it) { s += '<g opacity="' + (o.hl != null && o.hl !== it.id ? .2 : 1) + '"><title>' + esc(it.title) + "</title>" + pin(PX(it.x), PY(it.y), it.n, C) + "</g>"; });
      else layoutTags(list, avoid).forEach(function (L) {
        var r = L.r, it = L.it, cy = r.y + r.h / 2, lx = Math.max(r.x, Math.min(L.X, r.x + r.w)), ly = Math.max(r.y, Math.min(L.Y, r.y + r.h));
        s += '<g opacity="' + (o.hl != null && o.hl !== it.id ? .2 : 1) + '"' + (it.fresh ? ' class="sp-pop"' : "") + '><title>' + esc(it.title) + "</title>" +
          '<line x1="' + L.X + '" y1="' + L.Y + '" x2="' + lx + '" y2="' + ly + '" ' + stroke(C.glacier, 2) + "/>" +
          '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" rx="12" style="fill:' + C.panel2 + ";stroke:" + C.border + ';stroke-width:2"/>' +
          pin(r.x + 24, cy, it.n, C, 16) +
          '<text x="' + (r.x + 50) + '" y="' + (cy + 7.5) + '" ' + text(C.ink, C.font, 22, 600) + ">" + esc(it.label) + "</text>" +
          '<circle cx="' + L.X + '" cy="' + L.Y + '" r="8" style="fill:' + C.warm + ";stroke:" + C.panel + ';stroke-width:3"/></g>';
      });
    }
    return s + "</svg>";
  }

  /* ---------- phone map (600 × 560): big labels, tap to place ---------- */
  var PX0 = 18, PX1 = 582, PY0 = 18, PY1 = 466;
  function phoneSvg(q, spot, buddy) {
    var C = VARS, L = levels(q), n = Math.max(1, L.length), w = PX1 - PX0, h = PY1 - PY0, s = "";
    s += '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 560" id="spMap" role="img" aria-label="Map: tap where it belongs">';
    s += '<defs><clipPath id="phc"><rect x="' + PX0 + '" y="' + PY0 + '" width="' + w + '" height="' + h + '" rx="16"/></clipPath><linearGradient id="phg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:' + C.panel2 + '"/><stop offset="1" style="stop-color:' + C.panel + '"/></linearGradient></defs>';
    s += '<g clip-path="url(#phc)"><rect x="' + PX0 + '" y="' + PY0 + '" width="' + w + '" height="' + h + '" style="fill:url(#phg)"/>';
    s += '<path d="M18 190 L90 110 L150 150 L230 50 L300 120 L360 80 L440 40 L520 120 L582 90 L582 466 L18 466 Z" ' + fill(C.border2) + ' opacity=".75"/>';
    s += '<path d="M440 40 L424 64 L434 60 L442 70 L450 58 L460 64 Z M230 50 L214 72 L224 68 L232 78 L240 66 L250 72 Z" style="fill:#FFFFFF" opacity=".9"/>';
    s += '<path d="M18 250 Q160 196 300 232 T582 220 L582 466 L18 466 Z" ' + fill(C.panel) + "/></g>";
    for (var i = 1; i < n; i++) s += '<line x1="' + PX0 + '" y1="' + (PY0 + h * i / n) + '" x2="' + PX1 + '" y2="' + (PY0 + h * i / n) + '" ' + stroke(C.border, 2.5, "9 9") + "/>";
    s += '<line x1="' + (PX0 + w / 2) + '" y1="' + PY0 + '" x2="' + (PX0 + w / 2) + '" y2="' + PY1 + '" ' + stroke(C.border, 2.5, "9 9") + "/>";
    s += '<rect x="' + PX0 + '" y="' + PY0 + '" width="' + w + '" height="' + h + '" rx="16" ' + stroke(C.border, 2.5) + "/>";
    L.forEach(function (lab, i) {
      s += '<g transform="translate(' + (PX0 + 30) + " " + (PY0 + h * i / n + 34) + ')">' + signIcon(i, n, C) + '<text x="24" y="9" ' + text(C.ink, C.font, 28, 600) + ' opacity=".9">' + esc(lab) + "</text></g>";
    });
    s += '<g style="fill:none;stroke:' + C.ink + ';stroke-width:3;stroke-linecap:round"><line x1="' + (PX0 + 16) + '" y1="500" x2="' + (PX1 - 16) + '" y2="500"/><path d="M' + (PX0 + 28) + " 490 L" + (PX0 + 14) + " 500 L" + (PX0 + 28) + ' 510"/><path d="M' + (PX1 - 28) + " 490 L" + (PX1 - 14) + " 500 L" + (PX1 - 28) + ' 510"/></g>';
    s += '<text x="' + PX0 + '" y="546" ' + text(C.ink, C.font, 28, 600) + ">" + esc(q.lowLabel || "") + '</text><text x="' + PX1 + '" y="546" text-anchor="end" ' + text(C.ink, C.font, 28, 600) + ">" + esc(q.highLabel || "") + "</text>";
    if (spot) {
      var x = PX0 + spot[0] / 1000 * w, y = PY0 + spot[1] / 1000 * h;
      s += '<circle cx="' + x + '" cy="' + y + '" r="56" style="fill:' + C.panel + ";stroke:" + C.warm + ';stroke-width:5" opacity=".95"/>' + (buddy ? buddyAt(buddy, x, y, 96) : '<circle cx="' + x + '" cy="' + y + '" r="14" ' + fill(C.warm) + "/>");
    }
    return s + "</svg>";
  }
  // Where on the phone map a tap landed, as [0–1000, 0–1000]; null if outside it
  function phoneSpot(svgEl, clientX, clientY) {
    var r = svgEl.getBoundingClientRect(), sx = (clientX - r.left) / r.width * 600, sy = (clientY - r.top) / r.height * 560;
    if (sx < PX0 - 12 || sx > PX1 + 12 || sy < PY0 - 12 || sy > PY1 + 12) return null;
    return [Math.round(PC.clamp((sx - PX0) / (PX1 - PX0), 0, 1) * 1000), Math.round(PC.clamp((sy - PY0) / (PY1 - PY0), 0, 1) * 1000)];
  }

  /* ---------- results view (results page and printable summary) ---------- */
  function view(session, q) {
    var r = compute(session, q);
    if (!r.items.length) return { html: '<div class="frozen"><h3>No cases were revealed</h3><p class="muted">Cases show up here once they’re revealed on the big screen.</p></div>', data: r };
    var h = '<div class="stat-row"><div class="stat"><span class="label">Cases on the map</span><b>' + r.items.length + '</b></div><div class="stat"><span class="label">Most debated</span><b style="font-size:20px">' + (r.debated ? r.debated.n + ". " + esc(r.debated.label) : "–") +
      '</b></div><div class="stat"><span class="label">Most agreed</span><b style="font-size:20px">' + (r.agreed ? r.agreed.n + ". " + esc(r.agreed.label) : "–") + "</b></div></div>";
    // Class / Individuals switch that works without scripts (results page and printed summary)
    var g = "spv" + Math.random().toString(36).slice(2, 8);
    h += '<div class="sp-switch"><input type="radio" name="' + g + '" id="' + g + 'a" checked><input type="radio" name="' + g + '" id="' + g + 'b">' +
      '<div class="seg" role="group" aria-label="Map view"><label for="' + g + 'a">Class average</label><label for="' + g + 'b">Individuals</label></div>' +
      '<div class="sp-v sp-va">' + svg(q, r.items, {}) + '</div><div class="sp-v sp-vb">' + svg(q, r.items, { mode: "orig" }) + "</div></div>";
    h += '<div class="sp-list">' + r.items.map(function (it) {
      return '<div class="sp-row"><span class="sp-n">' + it.n + '</span><span class="t">' + esc(it.title) + '</span><span class="muted">' + esc(levelOf(q, it.y)) + " · " + esc(leanOf(q, it.x)) + " · " + it.marks.length + (it.marks.length === 1 ? " answer" : " answers") + " · " + it.agree + "</span></div>";
    }).join("") + "</div>";
    return { html: h, data: r };
  }

  // A map picture for exports
  function png(q, list, pal, mode, scale) {
    return new Promise(function (ok) {
      var s = svg(q, list, { pal: pal, mode: mode, id: "x" + mode, pins: list.length > 12, attrs: 'width="' + MW + '" height="' + MH + '"' });
      var img = new Image(), url = URL.createObjectURL(new Blob([s], { type: "image/svg+xml" }));
      img.onload = function () { var k = scale || 2, c = document.createElement("canvas"); c.width = MW * k; c.height = MH * k; var g = c.getContext("2d"); g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); try { ok(c.toDataURL("image/png")); } catch (e) { ok(null); } };
      img.onerror = function () { URL.revokeObjectURL(url); ok(null); };
      img.src = url;
    });
  }

  window.PCSlopes = { upNext: upNext, items: items, cleanLines: cleanLines, levels: levels, levelOf: levelOf, leanOf: leanOf, agreeLabel: agreeLabel, compute: compute, svg: svg, phoneSvg: phoneSvg, phoneSpot: phoneSpot, view: view, png: png };
})();
