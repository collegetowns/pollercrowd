/* Poller Crowd word filter.
   Catches common swear words and slurs (including tricks like "fuuuck", "sh1t", "f.u.c.k")
   and replaces them with grawlix like #!*&. It cannot catch everything; teachers can also
   hold words for approval and add their own banned words in Settings.
   The lists are stored in ROT13 so this file doesn't spell them out. */
(function () {
  "use strict";
  var SUB = ["shpx", "fuvg", "zbgureshpx", "spx", "shx", "fug"];
  var WORD = ["nff", "nffubyr", "nefr", "nefrubyr", "onfgneq", "ovgpu", "ovgpurf", "obyybpxf", "obbo", "obbof", "obbovrf", "pbpx", "pbpxf", "phz", "phag", "qvpx", "qvpxf", "qvpxurnq", "qvyqb", "qbhpur", "qbhpuront", "snt", "sntf", "snttbg", "wvmm", "avttre", "avttn", "avttnf", "cvff", "cvffrq", "cbea", "cbeab", "chffl", "chffvrf", "ergneq", "ergneqrq", "fyhg", "fyhgf", "gvgf", "gvggvrf", "gvggl", "gjng", "jnax", "jnaxre", "juber", "juberf", "fcvp", "puvax", "xvxr", "genaal", "qlxr", "tbbx", "jrgonpx", "obare", "ubeal", "oybjwbo", "unaqwbo", "zvys", "xlf", "fgsh", "jgs", "qnzavg", "tbqqnza", "ohyypenc", "fxnax", "gubg", "phpx", "vapry", "wnpxnff", "qhzonff", "fznegnff", "onqnff", "crqb", "anmv"];
  function rot13(s) { return s.replace(/[a-z]/g, function (c) { return String.fromCharCode((c.charCodeAt(0) - 97 + 13) % 26 + 97); }); }
  var LEET = { a: "a@4", b: "b8", e: "e3", g: "g9", i: "i1!|l", l: "l1|", o: "o0", s: "s$5z", t: "t7+", c: "ck(", k: "kc", u: "uv*", z: "zs" };
  function esc(c) { return c.replace(/[\\^$.*+?()[\]{}|\-]/g, "\\$&"); }
  function cls(ch) { var set = LEET[ch] || ch; return "[" + set.split("").map(esc).join("") + "]"; }
  // Build a pattern where each letter may repeat and (for longer words) be split by one . - _ * or space
  function pat(w) {
    var sep = w.length >= 4 ? "[\\s._*\\-]?" : "";
    return w.split("").map(function (ch) { return cls(ch) + "+"; }).join(sep);
  }
  var END = "(?:s|es|ed|er|ers|ing|in|y|ies|head|heads|face|faces|hole|holes|bag|bags|wad|wads)?";
  var LETTER = "a-z0-9@$!|+*";
  var reSub, reWord, custom = [];
  function build() {
    var subs = SUB.map(rot13).map(pat);
    var words = WORD.map(rot13).concat(custom).map(pat);
    reSub = new RegExp("(" + subs.join("|") + ")[a-z]*", "gi");
    // no lookbehind (older iPads): capture the character before the word instead
    reWord = new RegExp("(^|[^" + LETTER + "])((?:" + words.join("|") + ")" + END + ")(?=$|[^" + LETTER + "])", "gi");
  }
  var GRAWLIX = "#!*&@$%";
  function grawlix(s) {
    var out = "", n = 0;
    for (var i = 0; i < s.length; i++) out += /\s/.test(s[i]) ? s[i] : GRAWLIX[n++ % GRAWLIX.length];
    return out;
  }
  // real words that contain a caught spelling
  var ALLOW = { shiitake: 1, shiitakes: 1, scunthorpe: 1 };
  function wordAt(str, i, len) {
    var a = i, b = i + len;
    while (a > 0 && /[a-z]/i.test(str[a - 1])) a--;
    while (b < str.length && /[a-z]/i.test(str[b])) b++;
    return str.slice(a, b).toLowerCase();
  }
  function clean(text) {
    var s = String(text == null ? "" : text);
    var hit = false;
    s = s.replace(reSub, function (m, g, off, str) { if (ALLOW[wordAt(str, off, m.length)]) return m; hit = true; return grawlix(m); });
    s = s.replace(reWord, function (m, pre, w) { hit = true; return pre + grawlix(w); });
    // letters spelled out one at a time: "f u c k", "s.h.i.t"
    s = s.replace(/\b(?:[a-z0-9@$][\s._\-]){2,}[a-z0-9@$]\b/gi, function (m) {
      var joined = m.replace(/[\s._\-]/g, "");
      var test = joined.replace(reSub, "\u0000").replace(reWord, "$1\u0000");
      if (test.indexOf("\u0000") >= 0) { hit = true; return grawlix(m); }
      return m;
    });
    return { text: s, flagged: hit };
  }
  function setCustom(list) {
    custom = (list || []).map(function (w) { return String(w).toLowerCase().replace(/[^a-z0-9 ]/g, "").trim(); })
      .filter(function (w) { return w.length >= 2; });
    build();
  }
  build();
  window.PCFilter = { clean: clean, setCustom: setCustom, grawlix: grawlix };
})();
