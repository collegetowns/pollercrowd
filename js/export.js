/* Poller Crowd — exports: spreadsheet (CSV), printable summary, PowerPoint. */
(function () {
  "use strict";
  var PC = window.PC, R = window.PCResults, B = window.PCBuddies;
  function fileSafe(s) { return String(s || "poller-crowd").replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 60) || "poller-crowd"; }
  function dateStr(t) { return new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }); }
  function stamp(t) { var d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function download(name, data, type) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: type });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }
  // Blend two hex colors (for the thermometer bars)
  function mix(a, b, t) { var A = parseInt(a, 16), Bn = parseInt(b, 16), out = 0; for (var k = 16; k >= 0; k -= 8) out |= Math.round(((A >> k) & 255) * (1 - t) + ((Bn >> k) & 255) * t) << k; return ("000000" + out.toString(16)).slice(-6).toUpperCase(); }
  function people(s) { return Object.keys(s.roster || {}).length; }

  /* ---------- CSV ---------- */
  function csvCell(v) { v = v == null ? "" : String(v); return /[",\n\r]/.test(v) || /^[=+\-@]/.test(v) ? '"' + (/^[=+\-@]/.test(v) ? "'" : "") + v.replace(/"/g, '""') + '"' : v; }
  function csv(s) {
    var rows = [["Poller Crowd results"], ["Session", s.title], ["Date", dateStr(s.startedAt)], ["Room", s.code], ["Participants", people(s)],
      ["Note", "Anonymous answers for checking understanding. Not suitable for grading: nothing confirms who answered."], [],
      ["Question #", "Type", "Question", "Answer / item / word", "Count", "Percent of participants", "Notes"]];
    s.questions.forEach(function (q, i) {
      if (q.type === "sl") return;
      var r = R.compute(s, q), T = R.TYPES[q.type].name, n = i + 1;
      if (q.type === "mc" || q.type === "qz") r.rows.forEach(function (x) { rows.push([n, T, q.prompt, x.letter + ". " + x.label, x.count, x.pct + "%", x.correct ? "Correct answer" : ""]); });
      if (q.type === "rs") { r.counts.forEach(function (c, j) { rows.push([n, T, q.prompt, String(j + 1), c, r.total ? Math.round(c / r.total * 100) + "%" : "0%", j === 0 ? q.lowLabel : j === r.max - 1 ? q.highLabel : ""]); }); rows.push([n, T, q.prompt, "Average", r.total ? r.avg.toFixed(2) : "", "", r.total + " responses"]); }
      if (q.type === "th") {
        if (r.total) { rows.push([n, T, q.prompt, "Average (0 = " + q.lowLabel + ", 100 = " + q.highLabel + ")", r.avg.toFixed(1), "", r.total + " responses"]); rows.push([n, T, q.prompt, "Median", r.median, "", "Middle half: " + r.low + " to " + r.high]); }
        r.bins.forEach(function (c, j) { rows.push([n, T, q.prompt, (j * 5) + "–" + (j === 19 ? 100 : j * 5 + 4), c, r.total ? Math.round(c / r.total * 100) + "%" : "0%", j === 0 ? q.lowLabel : j === 19 ? q.highLabel : ""]); });
      }
      if (q.type === "rk") r.rows.forEach(function (x, j) { rows.push([n, T, q.prompt, x.label, x.points, "", "Overall place " + (j + 1) + "; average place " + (r.total ? x.avg.toFixed(2) : "–")]); });
      if (q.type === "wc") r.words.forEach(function (w) { rows.push([n, T, q.prompt, w.text, w.count, "", ""]); });
      if (q.type === "qa") r.items.forEach(function (x) { rows.push([n, T, q.prompt, x.text, x.votes, "", x.answered ? "Answered" : ""]); });
      if (q.type === "sp") r.items.forEach(function (x) {
        rows.push([n, T, q.prompt, x.n + ". " + x.title, x.marks.length, people(s) ? Math.round(x.marks.length / people(s) * 100) + "%" : "",
          window.PCSlopes.levelOf(q, x.y) + " · " + window.PCSlopes.leanOf(q, x.x) + " · " + x.agree + " · left–right " + Math.round(x.x * 100) + " (0 = " + q.lowLabel + ", 100 = " + q.highLabel + "), top–bottom " + Math.round(x.y * 100) + " (0 = top)"]);
      });
      if ((r.rows && !r.rows.length) || (r.words && !r.words.length) || (r.items && !r.items.length)) rows.push([n, T, q.prompt, "(no responses)", "", "", ""]);
    });
    var lb = R.leaderboard(s, 0);
    if (lb.length) { rows.push([], ["Quiz leaderboard"], ["Place", "Buddy", "Nickname", "Points"]); lb.forEach(function (x) { rows.push([x.rank, B.describe(x.k, x.v, x.l), x.nick, x.pts]); }); }
    var text = "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n");
    download(fileSafe(s.title) + " results " + stamp(s.startedAt) + ".csv", text, "text/csv;charset=utf-8");
  }

  /* ---------- Printable summary ---------- */
  function summary(s) {
    var e = PC.esc;
    var body = s.questions.map(function (q, i) {
      var v = R.view(s, q, { reveal: true, limit: 50 });
      var im = q.image && PC.images.cached(q.image);
      return '<section><p class="label">' + (q.type === "sl" ? "Slide " + (i + 1) + " · Info slide" : "Question " + (i + 1) + " · " + R.TYPES[q.type].name + " · " + v.data.total + (v.data.total === 1 ? " person" : " people")) + "</p><h2>" + e(q.prompt) + "</h2>" +
        (im ? '<img src="' + im + '" alt="' + e(q.imageAlt || "Photo for this question") + '" style="display:block;max-width:100%;max-height:300px;border-radius:12px;margin:0 0 16px">' : "") + v.html + "</section>";
    }).join("");
    var lb = R.leaderboard(s, 10);
    if (lb.length) body += "<section><h2>Final quiz leaderboard</h2>" + lb.map(function (x) { return '<div class="leader"><span class="rank">' + x.rank + "</span>" + B.svg(x.k, x.v, x.l, 40) + '<span class="who">' + e(R.buddyName(x)) + '</span><span class="pts">' + x.pts + "</span></div>"; }).join("") + "</section>";
    var css = "";
    try { PC.$$('link[rel="stylesheet"]').forEach(function (l) { css += '<link rel="stylesheet" href="' + l.href + '">'; }); } catch (x) {}
    var html = '<!doctype html><html lang="en" data-theme="day"><head><meta charset="utf-8"><title>' + e(s.title) + " · Poller Crowd summary</title>" + css +
      "<style>body{background:#fff;color:#0B1F3A;font-size:15px}main{max-width:880px;margin:0 auto;padding:28px 24px}section{break-inside:avoid;page-break-inside:avoid;border-top:2px solid #CFE6F7;padding:22px 0}h1{font-size:34px}h2{font-size:24px;margin:6px 0 16px}" +
      ".label{color:#1E66A6}.cloud{min-height:0}.bar-head{font-size:17px}.bar-num{font-size:20px}.qa-text{font-size:16px}.frozen{min-height:0;padding:18px}.noprint{margin:12px 0 0}@media print{.noprint{display:none}main{padding:0}}</style></head><body><main>" +
      '<p class="label">Poller Crowd summary</p><h1>' + e(s.title) + '</h1><p class="muted">' + dateStr(s.startedAt) + " · room " + e(s.code) + " · " + people(s) + ' people · answers are anonymous · for checking understanding, not for grading</p><p class="noprint controls"><a class="btn" href="' + PC.siteBase() + 'host.html">← Back to Poller Crowd</a><button class="btn primary" onclick="print()">Print or save as PDF</button></p>' +
      body + '<p class="noprint controls" style="margin-top:20px"><a class="btn primary" href="' + PC.siteBase() + 'host.html">← Back to Poller Crowd</a><button class="btn" onclick="print()">Print or save as PDF</button></p><p class="muted" style="margin-top:20px">Made with Poller Crowd · Powered by College Towns</p></main></body></html>';
    var w = window.open("", "_blank");
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
    else download(fileSafe(s.title) + " summary " + stamp(s.startedAt) + ".html", html, "text/html");
  }

  /* ---------- PowerPoint ---------- */
  var pptxLoading = null;
  function loadPptx() {
    if (window.PptxGenJS) return Promise.resolve();
    if (!pptxLoading) pptxLoading = new Promise(function (ok, fail) {
      var sc = document.createElement("script"); sc.src = "vendor/pptxgen.bundle.js"; sc.onload = ok; sc.onerror = function () { pptxLoading = null; fail(new Error("load")); }; document.head.appendChild(sc);
    });
    return pptxLoading;
  }
  function svgToPng(svg, px) {
    return new Promise(function (ok) {
      var img = new Image(), url = URL.createObjectURL(new Blob([svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ')], { type: "image/svg+xml" }));
      img.onload = function () { var c = document.createElement("canvas"); c.width = c.height = px; c.getContext("2d").drawImage(img, 0, 0, px, px); URL.revokeObjectURL(url); ok(c.toDataURL("image/png")); };
      img.onerror = function () { URL.revokeObjectURL(url); ok(null); };
      img.src = url;
    });
  }
  // Word cloud drawn on a canvas (spiral placement) so it can go on a slide
  async function cloudPng(words, C) {
    try { await document.fonts.load('600 40px "Fredoka"'); } catch (e) {}
    var W = 1600, H = 760, c = document.createElement("canvas"); c.width = W; c.height = H;
    var g = c.getContext("2d"), placed = [], top = words.length ? words[0].count : 1;
    var cols = [C.ink, C.label, C.glacier, C.muted];
    words.slice(0, 60).forEach(function (w, i) {
      var size = Math.round(28 + 110 * Math.sqrt(w.count / top));
      g.font = (w.count / top > .45 ? 700 : 500) + " " + size + 'px "Fredoka", "Nunito", sans-serif';
      var tw = g.measureText(w.text).width, th = size * 0.95;
      for (var t = 0; t < 2200; t += 1) {
        var a = t * 0.35, rr = 4 * a;
        var x = W / 2 + rr * Math.cos(a) * 1.6 - tw / 2, y = H / 2 + rr * Math.sin(a) - th / 2;
        if (x < 10 || y < 10 || x + tw > W - 10 || y + th > H - 10) continue;
        var box = { x: x - 8, y: y - 4, w: tw + 16, h: th + 8 };
        if (placed.some(function (p) { return !(box.x + box.w < p.x || p.x + p.w < box.x || box.y + box.h < p.y || p.y + p.h < box.y); })) continue;
        placed.push(box); g.fillStyle = i === 0 ? C.warm : cols[i % cols.length]; g.textBaseline = "top"; g.fillText(w.text, x, y); break;
      }
    });
    return c.toDataURL("image/png");
  }
  function imgSize(src) { return new Promise(function (ok) { var i = new Image(); i.onload = function () { ok([i.naturalWidth, i.naturalHeight]); }; i.onerror = function () { ok([4, 3]); }; i.src = src; }); }
  async function pptx(s) {
    PC.toast("Making your PowerPoint…", 8000);
    await PC.images.preload(s.questions);
    try { await loadPptx(); } catch (e) { PC.toast("Couldn’t load the PowerPoint maker. Check your connection and try again."); return; }
    var day = PC.theme.get() === "day";
    var C = day ? { bg: "EEF6FD", panel: "FFFFFF", panel2: "DCEEFB", ink: "0B1F3A", muted: "3E5F86", label: "1E66A6", glacier: "3A97DA", warm: "FFB547", warmText: "A85A06", live: "0E7A48" }
      : { bg: "0B1F3A", panel: "12305A", panel2: "183B6B", ink: "EAF6FF", muted: "A9C7E8", label: "9FD3F5", glacier: "5FB6EC", warm: "FFB547", warmText: "FFB547", live: "6EE7A8" };
    var hex = function (k) { return "#" + C[k]; };
    var p = new window.PptxGenJS();
    p.layout = "LAYOUT_WIDE"; p.title = s.title; p.company = "Poller Crowd"; p.author = "Poller Crowd";
    var H = "Arial Rounded MT Bold", BODY = "Arial"; // installed with Office on Windows and Mac
    function base(label) {
      var sl = p.addSlide(); sl.background = { color: C.bg };
      if (label) sl.addText(label.toUpperCase(), { x: 0.6, y: 0.35, w: 9, h: 0.4, fontFace: BODY, fontSize: 13, bold: true, color: C.label, charSpacing: 2 });
      sl.addText("Poller Crowd · " + s.code, { x: 9.2, y: 6.95, w: 3.6, h: 0.35, fontFace: BODY, fontSize: 10, color: C.muted, align: "right" });
      return sl;
    }
    var logo = await svgToPng(PC.logo(200).replace(/width="\d+" height="\d+"/, 'width="400" height="280"'), 400);
    // Title slide
    var t = p.addSlide(); t.background = { color: C.bg };
    if (logo) t.addImage({ data: logo, x: 0.8, y: 0.8, w: 1.6, h: 1.6 });
    t.addText("Poller Crowd", { x: 2.6, y: 1.05, w: 8, h: 0.6, fontFace: H, fontSize: 28, bold: true, color: C.ink });
    t.addText("Warm up the lecture", { x: 2.6, y: 1.6, w: 8, h: 0.4, fontFace: BODY, fontSize: 16, bold: true, color: C.warmText });
    t.addText(s.title, { x: 0.8, y: 2.9, w: 11.7, h: 1.4, fontFace: H, fontSize: 44, bold: true, color: C.ink, valign: "top" });
    t.addText(dateStr(s.startedAt) + "  ·  " + people(s) + " people  ·  " + s.questions.length + " questions", { x: 0.8, y: 4.4, w: 11.7, h: 0.5, fontFace: BODY, fontSize: 18, color: C.muted });
    t.addText("Anonymous answers for checking understanding, not for grading.", { x: 0.8, y: 4.9, w: 11.7, h: 0.4, fontFace: BODY, fontSize: 14, italic: true, color: C.muted });
    var buddies = Object.keys(s.roster || {}).slice(0, 14);
    for (var bi = 0; bi < buddies.length; bi++) {
      var r0 = s.roster[buddies[bi]], png = await svgToPng(B.svg(r0.k, r0.v, r0.l, 240), 240);
      if (png) t.addImage({ data: png, x: 0.8 + bi * 0.82, y: 5.6, w: 0.75, h: 0.75 });
    }
    for (var i = 0; i < s.questions.length; i++) {
      var q = s.questions[i], r = R.compute(s, q);
      var sl = base(q.type === "sl" ? "Slide " + (i + 1) : "Question " + (i + 1) + " · " + R.TYPES[q.type].name + " · " + r.total + (r.total === 1 ? " person" : " people"));
      sl.addText(q.prompt, { x: 0.6, y: 0.75, w: 12.1, h: 1.1, fontFace: H, fontSize: 30, bold: true, color: C.ink, valign: "top", fit: "shrink" });
      var area = { x: 0.6, y: 2.0, w: 12.1, h: 4.8 }, photo = q.image && PC.images.cached(q.image);
      if (photo) {
        // photo on the left, results on the right
        var sz = await imgSize(photo), bw = 5.4, bh = 4.6, k = Math.min(bw / sz[0], bh / sz[1]), pw = sz[0] * k, ph = sz[1] * k;
        sl.addImage({ data: photo, x: 0.6 + (bw - pw) / 2, y: 2.0 + (bh - ph) / 2, w: pw, h: ph, altText: q.imageAlt || "" });
        area = { x: 6.3, y: 2.0, w: 6.4, h: 4.8 };
      }
      if (q.type === "sl") {
        if (q.body) sl.addText(q.body, { x: area.x, y: area.y, w: area.w, h: 4.4, fontFace: BODY, fontSize: 24, color: C.ink, valign: "top", fit: "shrink" });
        continue;
      }
      if (q.type === "sp" && r.items.length) {
        var SPX = window.PCSlopes, pal = day ? "day" : "night", mw = Math.min(area.w * 0.64, area.h * 1000 / 640), mh = mw * 640 / 1000;
        var mapAvg = await SPX.png(q, r.items, pal, "avg");
        if (mapAvg) sl.addImage({ data: mapAvg, x: area.x, y: area.y, w: mw, h: mh, altText: "Crowd average for each case" });
        var lx = area.x + mw + 0.3, lw = area.x + area.w - lx;
        sl.addText(r.items.slice(0, 16).map(function (x) { return { text: x.n + ". " + x.label + "\n", options: { breakLine: false } }; }), { x: lx, y: area.y, w: lw, h: area.h, fontFace: BODY, fontSize: r.items.length > 10 ? 12 : 15, color: C.ink, valign: "top", fit: "shrink" });
        if (r.items.length > 16) sl.addText("+ " + (r.items.length - 16) + " more in the spreadsheet export", { x: lx, y: 6.55, w: lw, h: 0.35, fontFace: BODY, fontSize: 11, color: C.muted });
        var mapInd = await SPX.png(q, r.items, pal, "orig");
        if (mapInd) {
          var ind = base("Question " + (i + 1) + " · Slopes · Individual Run");
          ind.addText(q.prompt, { x: 0.6, y: 0.75, w: 12.1, h: 0.9, fontFace: H, fontSize: 26, bold: true, color: C.ink, valign: "top", fit: "shrink" });
          var iw = Math.min(12.1, 5.0 * 1000 / 640);
          ind.addImage({ data: mapInd, x: 0.6 + (12.1 - iw) / 2, y: 1.75, w: iw, h: iw * 640 / 1000, altText: "Each person's spot for each case" });
        }
        continue;
      }
      if (!r.total) { sl.addText("No responses", { x: area.x, y: 3.6, w: area.w, h: 0.8, fontFace: H, fontSize: 28, color: C.muted, align: "center" }); continue; }

      if (q.type === "mc" || q.type === "qz") {
        sl.addChart(p.ChartType.bar, [{ name: "Votes", labels: r.rows.map(function (x) { return x.letter + ". " + x.label + (x.correct ? "  ✓" : ""); }), values: r.rows.map(function (x) { return x.count; }) }],
          Object.assign({}, area, { barDir: "bar", catAxisOrientation: "maxMin", chartColors: r.rows.map(function (x) { return x.correct ? C.live : x.lead && q.correct == null ? C.warm : C.glacier; }), showValue: true, dataLabelColor: C.ink, dataLabelFontSize: 16, dataLabelFontFace: BODY,
            catAxisLabelColor: C.ink, catAxisLabelFontSize: 18, catAxisLabelFontFace: BODY, valAxisHidden: true, valGridLine: { style: "none" }, catAxisLineShow: false, barGapWidthPct: 45, showLegend: false }));
        if (q.type === "qz" && r.leaders.length) {
          sl.addText("Top: " + r.leaders.slice(0, 3).map(function (x) { return x.rank + ". " + R.buddyName(x) + " (" + x.pts + ")"; }).join("   "), { x: 0.6, y: 6.5, w: 8.6, h: 0.4, fontFace: BODY, fontSize: 13, color: C.muted });
        }
      }
      if (q.type === "rs") {
        var rw = photo ? area.w : 8.6;
        sl.addChart(p.ChartType.bar, [{ name: "Ratings", labels: r.counts.map(function (_, j) { return String(j + 1); }), values: r.counts }],
          { x: area.x, y: photo ? 2.7 : 2.0, w: rw, h: photo ? 3.9 : 4.6, barDir: "col", chartColors: [C.glacier], showValue: true, dataLabelColor: C.ink, dataLabelFontSize: 16, catAxisLabelColor: C.ink, catAxisLabelFontSize: 18, valAxisHidden: true, valGridLine: { style: "none" }, barGapWidthPct: 40, showLegend: false });
        if (photo) sl.addText("Average " + r.avg.toFixed(1) + " out of " + r.max, { x: area.x, y: 2.0, w: area.w, h: 0.6, fontFace: H, fontSize: 24, bold: true, color: C.ink });
        else sl.addText([{ text: "Average\n", options: { fontSize: 16, bold: true, color: C.label } }, { text: r.avg.toFixed(1), options: { fontSize: 64, bold: true, color: C.ink, fontFace: H } }, { text: "\nout of " + r.max, options: { fontSize: 16, color: C.muted } }],
          { x: 9.6, y: 2.4, w: 3.1, h: 2.6, fontFace: BODY, align: "center", valign: "middle", fill: { color: C.panel2 } });
        sl.addText("1 = " + (q.lowLabel || "") + "    " + r.max + " = " + (q.highLabel || ""), { x: area.x, y: 6.55, w: rw, h: 0.35, fontFace: BODY, fontSize: 12, color: C.muted });
      }
      if (q.type === "th") {
        sl.addChart(p.ChartType.bar, [{ name: "People", labels: r.bins.map(function (_, j) { return j % 4 === 0 ? String(j * 5) : ""; }), values: r.bins }],
          { x: area.x, y: 2.7, w: area.w, h: 3.5, barDir: "col", chartColors: r.bins.map(function (_, j) { return mix(C.glacier, C.warm, (j + 0.5) / 20); }), showValue: false, catAxisLabelColor: C.muted, catAxisLabelFontSize: 12, valAxisHidden: true, valGridLine: { style: "none" }, barGapWidthPct: 25, showLegend: false });
        sl.addText("Crowd average " + Math.round(r.avg) + "°  ·  " + R.lean(q, r.avg) + "  ·  middle half " + r.low + "–" + r.high + "°", { x: area.x, y: 2.0, w: area.w, h: 0.6, fontFace: H, fontSize: photo ? 18 : 24, bold: true, color: C.ink, fit: "shrink" });
        sl.addText([{ text: "❄ 0 = " + (q.lowLabel || ""), options: { align: "left" } }], { x: area.x, y: 6.3, w: area.w / 2, h: 0.4, fontFace: BODY, fontSize: 14, bold: true, color: C.muted });
        sl.addText("100 = " + (q.highLabel || "") + " 🔥", { x: area.x + area.w / 2, y: 6.3, w: area.w / 2, h: 0.4, fontFace: BODY, fontSize: 14, bold: true, color: C.muted, align: "right" });
      }
      if (q.type === "rk") {
        var rows = [[{ text: "Place", options: { bold: true, color: C.label } }, { text: "Item", options: { bold: true, color: C.label } }, { text: "Average place", options: { bold: true, color: C.label } }]]
          .concat(r.rows.map(function (x, j) { return [String(j + 1), x.label, x.avg.toFixed(1)]; }));
        sl.addTable(rows, { x: area.x, y: 2.1, w: area.w, colW: photo ? [1.0, 3.6, 1.8] : [1.4, 8.2, 2.5], fontFace: BODY, fontSize: 20, color: C.ink, fill: { color: C.panel }, border: { type: "solid", pt: 1, color: C.panel2 }, rowH: 0.6 });
      }
      if (q.type === "wc") {
        var img = await cloudPng(r.words, { ink: hex("ink"), label: hex("label"), glacier: hex("glacier"), muted: hex("muted"), warm: hex("warmText") });
        sl.addImage({ data: img, x: area.x, y: 2.0, w: area.w, h: area.w * 760 / 1600 });
      }
      if (q.type === "qa") {
        var qrows = [[{ text: "Votes", options: { bold: true, color: C.label } }, { text: "Question", options: { bold: true, color: C.label } }]]
          .concat(r.items.slice(0, 9).map(function (x) { return [String(x.votes), x.text + (x.answered ? "  (answered)" : "")]; }));
        sl.addTable(qrows, { x: area.x, y: 2.0, w: area.w, colW: photo ? [1.0, 5.4] : [1.3, 10.8], fontFace: BODY, fontSize: 16, color: C.ink, fill: { color: C.panel }, border: { type: "solid", pt: 1, color: C.panel2 } });
        if (r.items.length > 9) sl.addText("+ " + (r.items.length - 9) + " more in the spreadsheet export", { x: 0.6, y: 6.55, w: 8, h: 0.35, fontFace: BODY, fontSize: 12, color: C.muted });
      }
    }
    var lb = R.leaderboard(s, 8);
    if (lb.length) {
      var ls = base("Final quiz leaderboard");
      ls.addText("Top of the iceberg", { x: 0.6, y: 0.75, w: 12, h: 0.9, fontFace: H, fontSize: 32, bold: true, color: C.ink });
      for (var k = 0; k < lb.length; k++) {
        var x = lb[k], col = k < 4 ? 0 : 1, row = k % 4, X = 0.6 + col * 6.2, Y = 1.9 + row * 1.15;
        ls.addShape(p.ShapeType.roundRect, { x: X, y: Y, w: 5.9, h: 1.0, fill: { color: C.panel }, line: { color: C.panel }, rectRadius: 0.15 });
        ls.addText(String(x.rank), { x: X + 0.1, y: Y, w: 0.7, h: 1.0, fontFace: H, fontSize: 26, bold: true, color: C.warmText, align: "center", valign: "middle" });
        var bp = await svgToPng(B.svg(x.k, x.v, x.l, 240), 240); if (bp) ls.addImage({ data: bp, x: X + 0.85, y: Y + 0.1, w: 0.8, h: 0.8 });
        ls.addText(R.buddyName(x), { x: X + 1.8, y: Y, w: 2.9, h: 1.0, fontFace: BODY, fontSize: 18, bold: true, color: C.ink, valign: "middle" });
        ls.addText(String(x.pts), { x: X + 4.6, y: Y, w: 1.2, h: 1.0, fontFace: H, fontSize: 22, bold: true, color: C.ink, align: "right", valign: "middle" });
      }
    }
    var end = p.addSlide(); end.background = { color: C.bg };
    end.addText("Thanks for coming in from the cold!", { x: 0.6, y: 2.6, w: 12.1, h: 1, fontFace: H, fontSize: 36, bold: true, color: C.ink, align: "center" });
    end.addText("Made with Poller Crowd · Powered by College Towns", { x: 0.6, y: 3.7, w: 12.1, h: 0.5, fontFace: BODY, fontSize: 16, color: C.muted, align: "center" });
    try { await p.writeFile({ fileName: fileSafe(s.title) + " " + stamp(s.startedAt) + ".pptx" }); PC.toast("PowerPoint downloaded."); }
    catch (e) { console.error(e); PC.toast("Couldn’t save the PowerPoint. Try again, or use the summary instead."); }
  }

  window.PCExport = { csv: csv, summary: summary, pptx: pptx };
})();
