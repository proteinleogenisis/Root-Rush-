// Typed answers (Nov 17, the student's request): Rush questions with a math answer are typed on a keypad instead of tapped.
// RRType.canType(c)            -> true when the answer c (the generator's HTML) is plain math that can be typed and checked
// RRType.check(typed, c)       -> {ok, msg}: ok when the typed value equals c AND is written at least as simply as c
// RRType.render(typed)         -> HTML for showing what's been typed (exponents as superscripts)
// Plain script: loads in the page and in Node (tests: node typed.test.mjs).
(function () {
  "use strict";
  var NOREAL = "No real";
  var VAL_TOL = 1e-9, DEC_TOL = 0.0051, PTS = 16;
  var SUPN = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };

  // The generator's answer HTML -> plain typed-style text
  function plain(c) {
    return String(c).replace(/<sup>([^<]*)<\/sup>/g, function (m, x) { return /^[0-9a-z]$/i.test(x) ? "^" + x : "^(" + x + ")"; })
      .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
  }
  function isNoReal(s) { return /^(not a real number|no real solutions?|no real)$/i.test(String(s).trim()); }

  function tokenize(s) {
    var t = [], i = 0;
    s = s.replace(/[−–]/g, "-").replace(/[×·*]/g, "*").replace(/÷/g, "/").replace(/\s+/g, " ");
    while (i < s.length) {
      var ch = s[i];
      if (ch === " ") { i++; continue; }
      if (/[0-9.]/.test(ch)) { var j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; var num = s.slice(i, j); if ((num.match(/\./g) || []).length > 1 || num === ".") throw 0; t.push({ k: "num", v: num }); i = j; continue; }
      if (SUPN[ch]) { var idx = ""; while (i < s.length && SUPN[s[i]]) idx += SUPN[s[i++]]; if (s[i] !== "√") throw 0; i++; t.push({ k: "root", n: +idx }); continue; }
      if (ch === "√") { t.push({ k: "root", n: 2 }); i++; continue; }
      if (ch === "∛") { t.push({ k: "root", n: 3 }); i++; continue; }
      if (ch === "∜") { t.push({ k: "root", n: 4 }); i++; continue; }
      if (/[a-z]/i.test(ch)) { t.push({ k: "var", v: ch.toLowerCase() }); i++; continue; }
      if ("+-*/^()|".indexOf(ch) >= 0) { t.push({ k: "op", v: ch }); i++; continue; }
      throw 0;
    }
    return t;
  }

  // Grammar: expr = term (+|- term)*; term = imp (*|/ imp)*; imp = unary primaryStart*  (juxtaposition binds tighter than / ,
  // so "x^4 / 3|y|" means x^4 / (3|y|), the way the textbook writes it); unary = -unary | power; power = atom (^ unary)?
  function parse(src) {
    var t = tokenize(src), i = 0, absDepth = 0;
    function peek() { return t[i]; }
    function isOp(v) { return t[i] && t[i].k === "op" && t[i].v === v; }
    function startsAtom() { var p = t[i]; if (!p) return false; if (p.k !== "op") return true; return p.v === "(" || (p.v === "|" && absDepth === 0); }
    function expr() { var a = term(); while (isOp("+") || isOp("-")) { var o = t[i++].v; a = { t: o, a: a, b: term() }; } return a; }
    function term() { var a = imp(); while (isOp("*") || isOp("/")) { var o = t[i++].v; a = { t: o, a: a, b: imp() }; } return a; }
    function imp() { var a = unary(); while (startsAtom()) a = { t: "jx", a: a, b: power() }; return a; }
    function unary() { if (isOp("-")) { i++; return { t: "neg", a: unary() }; } if (isOp("+")) { i++; return unary(); } return power(); }
    function power() { var b = atom(); if (isOp("^")) { i++; return { t: "pow", a: b, b: unary() }; } return b; }
    function atom() {
      var p = peek(); if (!p) throw 0;
      if (p.k === "num") { i++; return { t: "num", v: +p.v, s: p.v }; }
      if (p.k === "var") { i++; return { t: "var", v: p.v }; }
      if (p.k === "root") { i++; return { t: "root", n: p.n, a: power() }; }
      if (isOp("(")) { i++; var e = expr(); if (!isOp(")")) throw 0; i++; return { t: "par", a: e }; }
      if (isOp("|")) { i++; absDepth++; var x = expr(); absDepth--; if (!isOp("|")) throw 0; i++; return { t: "abs", a: x }; }
      throw 0;
    }
    var e = expr(); if (i !== t.length) throw 0; return e;
  }

  function root(x, n) { if (x < 0) return n % 2 ? -Math.pow(-x, 1 / n) : NaN; return Math.pow(x, 1 / n); }
  // a^(p/q) with a negative base works when q is odd (as on the homework: (−27)^(2/3) = 9)
  function pow(a, b, bn) {
    if (a >= 0 || Number.isInteger(b)) return Math.pow(a, b);
    var f = fracOf(bn); if (!f) return NaN;
    var r = root(a, f.d); return Math.pow(r, f.n);
  }
  function fracOf(n) { // literal p/q (or -p/q, or an integer) exponent
    while (n.t === "par") n = n.a;
    if (n.t === "neg") { var g = fracOf(n.a); return g && { n: -g.n, d: g.d }; }
    if (n.t === "num" && Number.isInteger(n.v)) return { n: n.v, d: 1 };
    if (n.t === "/" ) { var a = fracOf(n.a), b = fracOf(n.b); if (a && b && b.d === 1 && a.d === 1) return { n: a.n, d: b.n }; }
    return null;
  }
  function ev(n, env) {
    switch (n.t) {
      case "num": return n.v;
      case "var": return env[n.v];
      case "par": return ev(n.a, env);
      case "abs": return Math.abs(ev(n.a, env));
      case "neg": return -ev(n.a, env);
      case "+": return ev(n.a, env) + ev(n.b, env);
      case "-": return ev(n.a, env) - ev(n.b, env);
      case "*": case "jx": return ev(n.a, env) * ev(n.b, env);
      case "/": return ev(n.a, env) / ev(n.b, env);
      case "pow": return pow(ev(n.a, env), ev(n.b, env), n.b);
      case "root": return root(ev(n.a, env), n.n);
    }
    return NaN;
  }
  function vars(n, out) { if (!n) return out; if (n.t === "var") out[n.v] = 1; vars(n.a, out); if (n.b && typeof n.b === "object") vars(n.b, out); return out; }
  // How much is still left to do: every operation, root, power and absolute value counts once (parentheses are free)
  function cost(n) {
    if (!n || typeof n !== "object") return 0;
    var own = n.t === "par" || n.t === "num" || n.t === "var" ? 0 : 1;
    if (n.t === "pow") return own + cost(n.a) + (fracOf(n.b) ? 0 : cost(n.b));
    return own + cost(n.a) + cost(n.b);
  }
  // Not simplest: a root of a whole number that still has a perfect power inside (√98 = 7√2), an exponent fraction that
  // isn't reduced (2^(2/4)), a negative exponent, or a decimal when the exact answer isn't one
  function notSimple(n) {
    if (!n || typeof n !== "object") return "";
    if (n.t === "root") { var x = n.a; while (x.t === "par") x = x.a; if (x.t === "num" && Number.isInteger(x.v)) { for (var p = 2; Math.pow(p, n.n) <= x.v; p++) if (x.v % Math.pow(p, n.n) === 0) return "There's still a perfect power inside the root."; if (x.v === 1 || x.v === 0) return "That root can be worked out."; } }
    if (n.t === "pow") { var f = fracOf(n.b); if (f && f.n < 0) return "No negative exponents in the final answer."; if (f && f.d > 1) { var g = gcd(f.n, f.d); if (g > 1) return "Reduce the exponent fraction."; } }
    if (n.t === "/") { var fa = fracOf(n.a), fb = fracOf(n.b); if (fa && fb && fa.d === 1 && fb.d === 1 && gcd(fa.n, fb.n) > 1) return "Reduce the fraction."; }
    return notSimple(n.a) || notSimple(n.b);
  }
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a; }
  function hasDecimal(s) { return /\d\.\d|\.\d/.test(s); }

  // An answer is a set: "x = ±2", "x = 14 or x = 2", "2, −2"
  function parts(s) {
    s = String(s).replace(/[−–]/g, "-");
    var out = [];
    s.split(/\bor\b|,|\band\b/).forEach(function (piece) {
      piece = piece.replace(/^\s*[a-z](\s*\(\s*x\s*\))?\s*=\s*/i, "").trim();
      if (!piece) return;
      if (/^±/.test(piece)) { var r = piece.slice(1); out.push(r); out.push("-(" + r + ")"); }
      else out.push(piece);
    });
    return out;
  }
  function pointsFor(vs) { // fixed, spread-out sample points incl. negatives so |y| vs y is caught
    var names = Object.keys(vs), P = [];
    for (var k = 0; k < PTS; k++) { var env = {}; names.forEach(function (v, j) { var x = 0.37 + ((k * 7 + j * 3) % 23) * 0.43; env[v] = (k + j) % 2 ? -x : x; }); P.push(env); }
    return P;
  }
  function sameVal(A, B, decimals) {
    var vs = {}; vars(A, vs); vars(B, vs);
    var P = Object.keys(vs).length ? pointsFor(vs) : [{}], any = false;
    for (var k = 0; k < P.length; k++) {
      var a = ev(A, P[k]), b = ev(B, P[k]);
      if (isNaN(b)) { if (!isNaN(a) && Object.keys(vs).length === 0) return false; continue; }
      if (isNaN(a) || !isFinite(a)) return false;
      var tol = decimals ? DEC_TOL : VAL_TOL * Math.max(1, Math.abs(b));
      if (Math.abs(a - b) > tol) return false; any = true;
    }
    return any;
  }

  // Inequality answers (domain/range): "x ≥ −3"; also read the other way round ("−3 ≤ x")
  var FLIP = { "≥": "≤", "≤": "≥", "<": ">", ">": "<" };
  function rel(s) {
    s = String(s).replace(/>=/g, "≥").replace(/<=/g, "≤");
    var m = /^\s*([a-z])\s*([≥≤<>])\s*(.+)$/i.exec(s); if (m) return { v: m[1].toLowerCase(), op: m[2], r: m[3] };
    m = /^\s*(.+?)\s*([≥≤<>])\s*([a-z])\s*$/i.exec(s); if (m) return { v: m[3].toLowerCase(), op: FLIP[m[2]], r: m[1] };
    return null;
  }
  // The fixed start shown in front of the typing box: "g(x) = " or "y = " (the student types only the right side)
  function prefix(c) { var m = /^\s*([a-z]\s*\(\s*x\s*\)|y)\s*=/i.exec(plain(c)); return m ? m[1].replace(/\s+/g, "") + " = " : ""; }
  function canType(c) {
    var s = plain(c); if (!s) return false;
    if (isNoReal(s)) return true;
    if (/[a-z]{3,}/i.test(s.replace(/\bor\b|\band\b/g, ""))) return false; // words
    if (/ \^ \(/.test(s)) return false; // "which keypresses" answers stay as choices
    var R = rel(s); if (R) { try { parse(R.r); return true; } catch (e) { return false; } }
    try { var ps = parts(s); if (!ps.length) return false; ps.forEach(function (x) { var n = parse(x); var v = vars(n, {}); if (!Object.keys(v).length && isNaN(ev(n, {}))) throw 0; }); return true; } catch (e) { return false; }
  }

  // A fraction typed right after ^ is the whole exponent: 7^1/4 means 7^(1/4), the way it shows on the keypad
  function expFrac(u) { return u.replace(/\^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)(?![0-9a-z.|(√∛∜])/gi, "^($1/$2)"); }
  function check(typed, c) {
    var s = plain(c), u = expFrac(String(typed || "").trim());
    if (!u) return { ok: false, empty: true, msg: "Type an answer first." };
    if (isNoReal(s) || isNoReal(u)) return { ok: isNoReal(s) && isNoReal(u) };
    var R = rel(s);
    if (R) {
      var G = rel(u); if (!G) return { ok: false, retry: true, msg: "Write it as an inequality, like " + R.v + " ≥ 2." };
      var rv, gv; try { rv = parse(R.r); } catch (e) { return { ok: false }; } try { gv = parse(G.r); } catch (e) { return { ok: false, retry: true, msg: "That can't be read." }; }
      return { ok: G.v === R.v && G.op === R.op && sameVal(gv, rv, false) };
    }
    var want, got;
    try { want = parts(s).map(parse); } catch (e) { return { ok: false }; }
    try { got = parts(u).map(parse); } catch (e) { return { ok: false, retry: true, msg: "That can't be read. Check the parentheses." }; }
    var dec = hasDecimal(s);
    if (got.length !== want.length) {
      // right numbers but one is missing: the classic forgot-the-± slip; it's simply wrong
      return { ok: false };
    }
    var used = [];
    for (var a = 0; a < got.length; a++) {
      var hit = -1;
      for (var b = 0; b < want.length; b++) if (used.indexOf(b) < 0 && sameVal(got[a], want[b], dec)) { hit = b; break; }
      if (hit < 0) {
        if (!dec && hasDecimal(u) && want.some(function (w) { return sameVal(got[a], w, true); })) return { ok: false, retry: true, msg: "Close, but give the exact answer, not a decimal." };
        return { ok: false };
      }
      used.push(hit);
    }
    // the value is right; is it written simply enough? (a retry, not a miss)
    if (!dec && hasDecimal(u) && got.some(function (g, k) { return !Number.isInteger(ev(g, {})) && /√|∛|∜|\^/.test(s); })) return { ok: false, retry: true, msg: "Same value, but give the exact answer, not a decimal." };
    for (var k = 0; k < got.length; k++) {
      var why = notSimple(want[used[k]]) ? "" : notSimple(got[k]); if (why) return { ok: false, retry: true, msg: "Right value, but not the simplest form. " + why };
      if (cost(got[k]) > cost(want[used[k]])) return { ok: false, retry: true, msg: "Right value, but simplify it all the way." };
    }
    return { ok: true };
  }

  // What's been typed, shown nicely: ^(…) and ^n as superscripts
  function esc(x) { return x.replace(/[&<>]/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]; }); }
  function render(s) {
    s = String(s || ""); var out = "", i = 0;
    while (i < s.length) {
      if (s[i] === "^") {
        i++; var sup = "";
        if (s[i] === "(") { var d = 0, j = i; for (; j < s.length; j++) { if (s[j] === "(") d++; else if (s[j] === ")") { d--; if (!d) break; } } sup = s.slice(i + 1, j); i = j + 1; if (j >= s.length) { out += "<sup>" + render(sup) + "<span class=\"ty-open\">)</span></sup>"; continue; } }
        else { var m = (/^-?[0-9.]+\/[0-9.]*(?![0-9a-z.|(√∛∜])/i.exec(s.slice(i)) || /^-?[0-9a-z.]*/i.exec(s.slice(i)))[0]; sup = m; i += m.length; }
        out += "<sup>" + (sup ? render(sup) : "<span class=\"ty-caret\">□</span>") + "</sup>"; continue;
      }
      out += esc(s[i] === "-" ? "−" : s[i]); i++;
    }
    return out;
  }

  globalThis.RRType = { prefix: prefix, canType: canType, check: check, render: render, plain: plain, parse: parse, NOREAL: NOREAL };
})();
