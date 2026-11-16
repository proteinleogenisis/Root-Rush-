/* Root Rush homework checker. Plain script: sets globalThis.RRSolve = {solve, parse}.
   Loads in Node (no DOM). Exact answers for Chapter 5 work: roots, rational exponents,
   simplest radical form (incl. rationalizing), like radicals, and equations like
   2(x + 3)^3 - 5 = 49. Variables are assumed positive. */
(function () {
  "use strict";
  var MAX_INT = 1e15;        // bigger numbers than this fall back to decimals
  var MAX_TERMS = 40;        // largest sum we keep exact
  var DECIMALS = 2;          // decimal answer shown to this many places (homework rounds to two)

  function Fail(msg) { this.msg = msg; }

  // ---------- rationals ----------
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a; }
  function Q(n, d) {
    if (d === undefined) d = 1;
    if (d === 0) throw new Fail("Dividing by zero");
    if (d < 0) { n = -n; d = -d; }
    var g = gcd(n, d) || 1; n /= g; d /= g;
    if (Math.abs(n) > MAX_INT || d > MAX_INT || !Number.isInteger(n) || !Number.isInteger(d)) throw new Fail("big");
    return { n: n, d: d };
  }
  function qadd(a, b) { return Q(a.n * b.d + b.n * a.d, a.d * b.d); }
  function qmul(a, b) { return Q(a.n * b.n, a.d * b.d); }
  function qdiv(a, b) { return Q(a.n * b.d, a.d * b.n); }
  function qneg(a) { return { n: -a.n, d: a.d }; }
  function qfloor(a) { return Math.floor(a.n / a.d); }
  function qeq(a, b) { return a.n === b.n && a.d === b.d; }
  function qstr(a) { return a.d === 1 ? String(a.n) : a.n + "/" + a.d; }

  function factor(n) {
    var f = {}, p = 2;
    while (n > 1 && p * p <= n) { while (n % p === 0) { f[p] = (f[p] || 0) + 1; n /= p; } p += p === 2 ? 1 : 2; }
    if (n > 1) f[n] = (f[n] || 0) + 1;
    return f;
  }

  // ---------- exact values ----------
  // A monomial: k (rational) * product of primes^e (0 < e < 1) * product of vars^e (any rational).
  // A value is a sum of monomials with distinct (rad, vars) parts.
  function mono(k, rad, vars) { return { k: k, rad: rad || {}, vars: vars || {} }; }
  function monoKey(m) {
    var a = Object.keys(m.rad).sort(function (x, y) { return x - y; }).map(function (p) { return p + "^" + qstr(m.rad[p]); });
    var b = Object.keys(m.vars).sort().map(function (v) { return v + "^" + qstr(m.vars[v]); });
    return a.join("*") + "|" + b.join("*");
  }
  function collect(terms) {
    var map = {}, order = [];
    terms.forEach(function (m) {
      if (m.k.n === 0) return;
      var key = monoKey(m);
      if (map[key]) map[key].k = qadd(map[key].k, m.k); else { map[key] = mono(m.k, m.rad, m.vars); order.push(key); }
    });
    var out = order.map(function (k) { return map[k]; }).filter(function (m) { return m.k.n !== 0; });
    if (out.length > MAX_TERMS) throw new Fail("big");
    return out;
  }
  function rat(q) { return [mono(q)]; }
  // Build a monomial from k and a list of (prime, rational exponent) pieces: whole parts move into k.
  function normMono(k, primeExps, vars) {
    var rad = {};
    Object.keys(primeExps).forEach(function (p) {
      var e = primeExps[p]; if (e.n === 0) return;
      var w = qfloor(e), fr = qadd(e, Q(-w));
      var pw = Math.pow(+p, Math.abs(w));
      if (pw > MAX_INT) throw new Fail("big");
      k = w >= 0 ? qmul(k, Q(pw)) : qdiv(k, Q(pw));
      if (fr.n !== 0) rad[p] = fr;
    });
    var vv = {};
    Object.keys(vars || {}).forEach(function (v) { if (vars[v].n !== 0) vv[v] = vars[v]; });
    return mono(k, rad, vv);
  }
  function mulMono(a, b) {
    var pe = {}, vars = {};
    [a.rad, b.rad].forEach(function (r) { Object.keys(r).forEach(function (p) { pe[p] = pe[p] ? qadd(pe[p], r[p]) : r[p]; }); });
    [a.vars, b.vars].forEach(function (r) { Object.keys(r).forEach(function (v) { vars[v] = vars[v] ? qadd(vars[v], r[v]) : r[v]; }); });
    return normMono(qmul(a.k, b.k), pe, vars);
  }
  function vmul(A, B) {
    var t = [];
    A.forEach(function (a) { B.forEach(function (b) { t.push(mulMono(a, b)); }); });
    if (t.length > MAX_TERMS * 4) throw new Fail("big");
    return collect(t);
  }
  function vadd(A, B) { return collect(A.concat(B)); }
  function vneg(A) { return A.map(function (m) { return mono(qneg(m.k), m.rad, m.vars); }); }
  function isZero(A) { return A.length === 0; }
  function asRational(A) {
    if (A.length === 0) return Q(0);
    if (A.length === 1 && !Object.keys(A[0].rad).length && !Object.keys(A[0].vars).length) return A[0].k;
    return null;
  }
  // monomial ^ (a/b): exact unless an even root of a negative
  function powMono(m, q) {
    var sign = m.k.n < 0 ? -1 : 1;
    if (sign < 0 && q.d % 2 === 0) throw new Fail("notreal");
    if (m.k.n === 0) { if (q.n <= 0) throw new Fail("Dividing by zero"); return mono(Q(0)); }
    var pe = {};
    function addP(p, e) { pe[p] = pe[p] ? qadd(pe[p], e) : e; }
    var fn = factor(Math.abs(m.k.n)), fd = factor(m.k.d);
    Object.keys(fn).forEach(function (p) { addP(p, qmul(Q(fn[p]), q)); });
    Object.keys(fd).forEach(function (p) { addP(p, qmul(Q(-fd[p]), q)); });
    Object.keys(m.rad).forEach(function (p) { addP(p, qmul(m.rad[p], q)); });
    var vars = {};
    Object.keys(m.vars).forEach(function (v) { vars[v] = qmul(m.vars[v], q); });
    var k = Q(sign < 0 && Math.abs(q.n) % 2 === 1 ? -1 : 1);
    return normMono(k, pe, vars);
  }
  function vpow(A, q) {
    if (A.length === 0) { if (q.n <= 0) throw new Fail("Dividing by zero"); return []; }
    if (A.length === 1) return [powMono(A[0], q)];
    if (q.d === 1 && q.n >= 0 && q.n <= 8) { var r = rat(Q(1)); for (var i = 0; i < q.n; i++) r = vmul(r, A); return r; }
    if (q.d === 1 && q.n < 0) return vdiv(rat(Q(1)), vpow(A, Q(-q.n)));
    throw new Fail("inexact");
  }
  function vdiv(A, B) {
    if (B.length === 0) throw new Fail("Dividing by zero");
    if (B.length === 1) return vmul(A, [powMono(B[0], Q(-1))]);
    if (B.length === 2) { // conjugate: (a + b)(a - b) = a^2 - b^2
      var conj = [B[0], mono(qneg(B[1].k), B[1].rad, B[1].vars)], den = vmul(B, conj);
      if (den.length === 1) return vdiv(vmul(A, conj), den);
    }
    throw new Fail("inexact");
  }
  function hasVars(A) { return A.some(function (m) { return Object.keys(m.vars).length > 0; }); }
  function numOf(A, env) {
    var s = 0;
    A.forEach(function (m) {
      var v = m.k.n / m.k.d;
      Object.keys(m.rad).forEach(function (p) { v *= Math.pow(+p, m.rad[p].n / m.rad[p].d); });
      Object.keys(m.vars).forEach(function (x) { v *= Math.pow(env && x in env ? env[x] : NaN, m.vars[x].n / m.vars[x].d); });
      s += v;
    });
    return s;
  }

  // ---------- parsing ----------
  var SUP = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-" };
  function tokenize(s) {
    s = s.replace(/[−–—]/g, "-").replace(/[×·•∙]/g, "*").replace(/÷/g, "/").replace(/\s+/g, "");
    var t = [], i = 0;
    while (i < s.length) {
      var c = s[i], m;
      if (SUP[c]) { // superscript run: before a radical it is the index, otherwise a power
        var run = ""; while (i < s.length && SUP[s[i]]) run += SUP[s[i++]];
        if (s[i] === "√") { t.push({ k: "rad", n: +run }); i++; } else { t.push({ k: "op", v: "^" }); t.push({ k: "num", v: run.replace("-", ""), neg: run[0] === "-" }); }
        continue;
      }
      if ((m = /^\d+(\.\d+)?|^\.\d+/.exec(s.slice(i)))) { t.push({ k: "num", v: m[0] }); i += m[0].length; continue; }
      if ((m = /^(sqrt|cbrt|root)/i.exec(s.slice(i)))) { t.push({ k: "fn", v: m[0].toLowerCase() }); i += m[0].length; continue; }
      if (c === "√") { t.push({ k: "rad", n: 2 }); i++; continue; }
      if (c === "∛") { t.push({ k: "rad", n: 3 }); i++; continue; }
      if (c === "∜") { t.push({ k: "rad", n: 4 }); i++; continue; }
      if (/[a-zA-Z]/.test(c)) { t.push({ k: "var", v: c.toLowerCase() }); i++; continue; }
      if ("+-*/^()=,".indexOf(c) >= 0) { t.push({ k: "op", v: c }); i++; continue; }
      throw new Fail("I can't read “" + c + "”");
    }
    return t;
  }
  function parse(src) {
    var t = tokenize(src), i = 0;
    function peek() { return t[i]; }
    function isOp(v) { return t[i] && t[i].k === "op" && t[i].v === v; }
    function eat(v) { if (!isOp(v)) throw new Fail(v === ")" ? "A “(” is missing its “)”" : "Something is missing near the end"); i++; }
    function startsAtom() { var p = t[i]; return p && (p.k === "num" || p.k === "var" || p.k === "fn" || p.k === "rad" || (p.k === "op" && p.v === "(")); }
    function expr() {
      var a = [term()];
      while (isOp("+") || isOp("-")) { var neg = t[i].v === "-"; i++; var b = term(); a.push(neg ? { t: "neg", x: b } : b); }
      return a.length === 1 ? a[0] : { t: "add", a: a };
    }
    function term() {
      var a = unary();
      for (;;) {
        if (isOp("*")) { i++; a = { t: "mul", a: a, b: unary() }; }
        else if (isOp("/")) { i++; a = { t: "div", a: a, b: unary() }; }
        else if (startsAtom()) a = { t: "mul", a: a, b: power(), imp: true };
        else return a;
      }
    }
    function unary() { if (isOp("-")) { i++; return { t: "neg", x: unary() }; } if (isOp("+")) { i++; return unary(); } return power(); }
    function power() {
      var b = atom();
      if (isOp("^")) { i++; var e = unary(); return { t: "pow", b: b, e: e }; }
      return b;
    }
    function atom() {
      var p = peek();
      if (!p) throw new Fail("Something is missing near the end");
      if (p.k === "num") { i++; var n = { t: "num", v: p.v }; return p.neg ? { t: "neg", x: n } : n; }
      if (p.k === "var") { i++; return { t: "var", v: p.v }; }
      if (p.k === "rad") { i++; return { t: "root", n: { t: "num", v: String(p.n) }, x: unary() }; }
      if (p.k === "fn") {
        i++; eat("(");
        if (p.v === "root") { var idx = expr(); eat(","); var x = expr(); eat(")"); return { t: "root", n: idx, x: x }; }
        var y = expr(); eat(")"); return { t: "root", n: { t: "num", v: p.v === "sqrt" ? "2" : "3" }, x: y };
      }
      if (p.k === "op" && p.v === "(") { i++; var e = expr(); eat(")"); return { t: "par", x: e }; }
      throw new Fail("Something is missing before “" + p.v + "”");
    }
    var L = expr(), R = null;
    if (isOp("=")) { i++; R = expr(); }
    if (i < t.length) throw new Fail("I can't read the part starting at “" + (t[i].v || "") + "”");
    return { L: L, R: R };
  }
  function strip(n) { while (n.t === "par") n = n.x; return n; }
  function hasX(n, x) {
    switch (n.t) {
      case "var": return n.v === x;
      case "num": return false;
      case "add": return n.a.some(function (y) { return hasX(y, x); });
      case "neg": case "par": return hasX(n.x, x);
      case "root": return hasX(n.n, x) || hasX(n.x, x);
      case "pow": return hasX(n.b, x) || hasX(n.e, x);
      default: return hasX(n.a, x) || hasX(n.b, x);
    }
  }
  function varsIn(n, out) {
    out = out || {};
    if (n.t === "var") out[n.v] = 1;
    ["a", "b", "x", "n", "e"].forEach(function (k) { if (n[k] && typeof n[k] === "object" && !Array.isArray(n[k])) varsIn(n[k], out); });
    if (n.t === "add") n.a.forEach(function (y) { varsIn(y, out); });
    return out;
  }

  // ---------- exact + decimal evaluation ----------
  function numQ(v) { var p = v.split("."); if (p.length === 1) return Q(+v); return Q(+(p[0] + p[1]), Math.pow(10, p[1].length)); }
  function exact(n) {
    switch (n.t) {
      case "num": return rat(numQ(n.v));
      case "var": var vs = {}; vs[n.v] = Q(1); return [mono(Q(1), {}, vs)];
      case "par": return exact(n.x);
      case "neg": return vneg(exact(n.x));
      case "add": return n.a.reduce(function (s, y) { return vadd(s, exact(y)); }, []);
      case "mul": return vmul(exact(n.a), exact(n.b));
      case "div": return vdiv(exact(n.a), exact(n.b));
      case "pow": { var e = asRational(exact(n.e)); if (!e) throw new Fail("inexact"); return vpow(exact(n.b), e); }
      case "root": { var k = asRational(exact(n.n)); if (!k || k.d !== 1 || k.n < 2) throw new Fail("A root's index must be a whole number 2 or more"); return vpow(exact(n.x), Q(1, k.n)); }
    }
  }
  function rpow(b, e, den) { // real power; odd roots of negatives stay real
    if (b < 0) { if (den && den % 2 === 1) { var r = Math.pow(-b, e); var num = Math.round(e * den); return num % 2 ? -r : r; } return NaN; }
    return Math.pow(b, e);
  }
  function deno(n) { try { var q = asRational(exact(n)); return q ? q.d : 0; } catch (e) { return 0; } }
  function dec(n, env) {
    switch (n.t) {
      case "num": return +n.v;
      case "var": return env && n.v in env ? env[n.v] : NaN;
      case "par": return dec(n.x, env);
      case "neg": return -dec(n.x, env);
      case "add": return n.a.reduce(function (s, y) { return s + dec(y, env); }, 0);
      case "mul": return dec(n.a, env) * dec(n.b, env);
      case "div": return dec(n.a, env) / dec(n.b, env);
      case "pow": return rpow(dec(n.b, env), dec(n.e, env), deno(n.e));
      case "root": { var k = dec(n.n, env); return rpow(dec(n.x, env), 1 / k, k); }
    }
  }

  // ---------- display ----------
  var IDX = { 3: "∛", 4: "∜" };
  function radHtml(index, inner) {
    var sym = index === 2 ? "√" : '<sup class="hk-ix">' + index + "</sup>√";
    return '<span class="hk-r">' + sym + '<span class="hk-ov">' + inner + "</span></span>";
  }
  function supNum(q) { return "<sup>" + qstr(q) + "</sup>"; }
  function lcm(a, b) { return a / gcd(a, b) * b; }
  // one monomial, sign handled by caller; returns {num, den} html pieces
  function monoParts(m) {
    var k = { n: Math.abs(m.k.n), d: m.k.d }, idx = 1, inside = [], outN = [], outD = [];
    Object.keys(m.rad).forEach(function (p) { idx = lcm(idx, m.rad[p].d); });
    Object.keys(m.vars).forEach(function (v) { var e = m.vars[v], fr = qadd(e, Q(-qfloor(e))); if (fr.n) idx = lcm(idx, fr.d); });
    var radicand = 1;
    Object.keys(m.rad).forEach(function (p) { radicand *= Math.pow(+p, m.rad[p].n * idx / m.rad[p].d); });
    if (radicand > 1) inside.push(String(radicand));
    Object.keys(m.vars).sort().forEach(function (v) {
      var e = m.vars[v], w = qfloor(e), fr = qadd(e, Q(-w));
      if (w > 0) outN.push(v + (w > 1 ? "<sup>" + w + "</sup>" : ""));
      if (w < 0) outD.push(v + (w < -1 ? "<sup>" + (-w) + "</sup>" : ""));
      if (fr.n) { var p = fr.n * idx / fr.d; inside.push(v + (p > 1 ? "<sup>" + p + "</sup>" : "")); }
    });
    var radS = inside.length ? radHtml(idx, inside.join("")) : "";
    var num = (k.n !== 1 || (!radS && !outN.length) ? String(k.n) : "") + outN.join("") + radS;
    var den = (k.d !== 1 ? String(k.d) : "") + outD.join("");
    return { num: num, den: den };
  }
  function fmt(A) {
    if (!A.length) return "0";
    // plain numbers first, like homework answers (2 + √3)
    var plainN = function (m) { return !Object.keys(m.rad).length && !Object.keys(m.vars).length; };
    A = A.filter(plainN).concat(A.filter(function (m) { return !plainN(m); }));
    return A.map(function (m, i) {
      var p = monoParts(m), neg = m.k.n < 0, body = p.den ? p.num + "/" + p.den : p.num;
      return (i === 0 ? (neg ? "−" : "") : (neg ? " − " : " + ")) + body;
    }).join("");
  }
  // exponent form, e.g. 7·3^(1/4)
  function fmtExp(A) {
    return A.map(function (m, i) {
      var neg = m.k.n < 0, k = { n: Math.abs(m.k.n), d: m.k.d }, parts = [];
      Object.keys(m.rad).forEach(function (p) { parts.push(p + supNum(m.rad[p])); });
      Object.keys(m.vars).sort().forEach(function (v) { var e = m.vars[v]; parts.push(v + (qeq(e, Q(1)) ? "" : supNum(e))); });
      var ks = qstr(k), body = (ks === "1" && parts.length ? "" : ks + (parts.length ? "·" : "")) + parts.join("·");
      return (i === 0 ? (neg ? "−" : "") : (neg ? " − " : " + ")) + body;
    }).join("");
  }
  function hasRadical(A) {
    return A.some(function (m) {
      return Object.keys(m.rad).length || Object.keys(m.vars).some(function (v) { return m.vars[v].d !== 1; });
    });
  }
  function decStr(v) {
    if (!isFinite(v)) return "";
    var r = +v.toFixed(DECIMALS);
    return (r < 0 ? "−" : "") + Math.abs(r).toString();
  }

  // pretty-print what was typed, so the student can see it was read right
  function show(n, ctx) {
    switch (n.t) {
      case "num": return n.v;
      case "var": return n.v;
      case "par": return "(" + show(n.x) + ")";
      case "neg": return "−" + wrapIf(n.x, ["add"]);
      case "add": return n.a.map(function (y, i) { if (y.t === "neg") return " − " + wrapIf(y.x, ["add"]); return (i ? " + " : "") + show(y); }).join("");
      case "mul": return wrapIf(n.a, ["add"]) + (n.imp && !(n.a.t === "num" && n.b.t === "num") ? "" : " · ") + wrapIf(n.b, ["add"]);
      case "div": return wrapIf(n.a, ["add", "mul"]) + " / " + wrapIf(n.b, ["add", "mul", "div"]);
      case "pow": return wrapIf(n.b, ["add", "mul", "div", "neg", "pow", "root"]) + "<sup>" + show(strip(n.e)) + "</sup>";
      case "root": { var k = strip(n.n), kk = k.t === "num" ? +k.v : 0; return radHtml(kk || show(k), show(strip(n.x))); }
    }
  }
  function wrapIf(n, kinds) { return kinds.indexOf(n.t) >= 0 ? "(" + show(n) + ")" : show(n); }

  // ---------- solving ----------
  var ROOTNAME = { 2: "square", 3: "cube", 4: "fourth", 5: "fifth", 6: "sixth" };
  function rootName(n) { return (ROOTNAME[n] || n + "th") + " root"; }
  function fmtVals(list) { return list.map(fmt).join(" or "); }
  function solveEq(L, R) {
    var vs = Object.keys(varsIn({ t: "add", a: [L, R] }));
    if (vs.length !== 1) throw new Fail(vs.length ? "I can only solve for one letter at a time" : "There's no letter to solve for");
    var x = vs[0];
    if (hasX(L, x) && hasX(R, x)) throw new Fail("Put the " + x + " on one side only (e.g. move everything to the left)");
    if (!hasX(L, x)) { var tmp = L; L = R; R = tmp; }
    var vals = [exact(R)], steps = [], node = strip(L), noReal = "", guard = 0;
    function line(cap) { steps.push({ m: show(node) + " = " + (vals.length ? fmtVals(vals) : "?"), c: cap }); }
    while (!(node.t === "var") && guard++ < 30) {
      if (node.t === "add") {
        var withX = node.a.filter(function (y) { return hasX(y, x); });
        if (withX.length !== 1) throw new Fail("I can't solve this kind yet (" + x + " appears in more than one term)");
        var rest = node.a.filter(function (y) { return !hasX(y, x); }), restV = exact({ t: "add", a: rest });
        vals = vals.map(function (v) { return vadd(v, vneg(restV)); });
        var c = fmt(restV), neg = restV.length === 1 && restV[0].k.n < 0;
        node = strip(withX[0]); line(neg ? "Add " + c.replace("−", "") + " to both sides" : "Subtract " + c + " from both sides");
      } else if (node.t === "neg") {
        vals = vals.map(vneg); node = strip(node.x); line("Multiply both sides by −1");
      } else if (node.t === "mul") {
        var cx = hasX(node.a, x) ? node.b : node.a, xx = hasX(node.a, x) ? node.a : node.b;
        if (hasX(cx, x)) throw new Fail("I can't solve this kind yet (" + x + " is multiplied by itself)");
        var cv = exact(cx); vals = vals.map(function (v) { return vdiv(v, cv); });
        node = strip(xx); line("Divide both sides by " + fmt(cv));
      } else if (node.t === "div") {
        if (hasX(node.a, x) && !hasX(node.b, x)) { var dv = exact(node.b); vals = vals.map(function (v) { return vmul(v, dv); }); node = strip(node.a); line("Multiply both sides by " + fmt(dv)); }
        else if (!hasX(node.a, x)) { var nv = exact(node.a); vals = vals.map(function (v) { return vdiv(nv, v); }); node = strip(node.b); line("Flip both sides"); }
        else throw new Fail("I can't solve this kind yet");
      } else if (node.t === "pow" || node.t === "root") {
        var q, base;
        if (node.t === "pow") { if (hasX(node.e, x)) throw new Fail("I can't solve for a letter in the exponent"); q = asRational(exact(node.e)); base = node.b; }
        else { var k = asRational(exact(node.n)); q = Q(1, k.n); base = node.x; }
        if (!q || q.n === 0) throw new Fail("I can't solve this kind yet");
        // base^(a/b) = v  ->  base = v^(b/a); an even a means ± and needs v >= 0; an even b needs v >= 0
        var a = Math.abs(q.n), b = q.d, inv = Q(q.d, q.n), out = [];
        vals.forEach(function (v) {
          var nv2 = numOf(v);
          if ((a % 2 === 0 || b % 2 === 0) && nv2 < -1e-12) { noReal = a % 2 === 0 ? "An even power can't be negative" : "An even root can't be negative"; return; }
          var r = vpow(v, inv); out.push(r);
          if (a % 2 === 0 && !isZero(r)) out.push(vneg(r));
        });
        vals = dedupe(out); node = strip(base);
        var cap = q.n === 1 ? "Raise both sides to the power " + b + " to undo the " + rootName(b)
          : q.d === 1 ? "Take the " + rootName(a) + " of both sides" + (a % 2 === 0 ? " (even power: ±)" : "")
          : "Raise both sides to the power " + qstr(inv) + (a % 2 === 0 ? " (even top number: ±)" : "");
        if (!vals.length) break;
        line(cap);
      } else throw new Fail("I can't solve this kind yet");
    }
    if (!vals.length) return { x: x, sols: [], steps: steps, noReal: noReal || "No real solution" };
    // check each answer in the original equation (catches extraneous ones)
    var good = [], bad = [];
    vals.forEach(function (v) {
      var env = {}; env[x] = numOf(v);
      var l = dec(L, env), r = dec(R, env), ok = isFinite(l) && isFinite(r) && Math.abs(l - r) <= 1e-7 * Math.max(1, Math.abs(l), Math.abs(r));
      (ok ? good : bad).push(v);
    });
    return { x: x, sols: good, bad: bad, steps: steps, noReal: good.length ? "" : (bad.length ? "Every answer fails the check, so no solution" : noReal) };
  }
  function dedupe(list) { var seen = {}, out = []; list.forEach(function (v) { var k = v.map(monoKey).join("+") + v.map(function (m) { return qstr(m.k); }).join(","); if (!seen[k]) { seen[k] = 1; out.push(v); } }); return out; }

  // Main entry: returns {ok, kind, typed, answer, alt, decimal, steps, note} or {ok:false, msg}
  function solve(src) {
    src = String(src || "").trim();
    if (!src) return { ok: false, msg: "" };
    try {
      var P = parse(src), typed = P.R ? show(P.L) + " = " + show(P.R) : show(P.L);
      if (P.R) {
        var S = solveEq(P.L, P.R), x = S.x;
        if (!S.sols.length) return { ok: true, kind: "solve", typed: typed, answer: "No real solution", note: S.noReal, steps: S.steps };
        var ans, dv = S.sols.map(function (v) { return numOf(v); });
        if (S.sols.length === 2 && fmt(S.sols[0]) === fmt(vneg(S.sols[1]))) ans = x + " = ±" + fmt(S.sols[0].length === 1 && S.sols[0][0].k.n < 0 ? S.sols[1] : S.sols[0]);
        else if (S.sols.length === 2 && (function () { var c = asRational(vadd(S.sols[0], S.sols[1])); return c && c.n !== 0 && S.sols.some(hasRadical); })()) {
          var half = rat(qdiv(asRational(vadd(S.sols[0], S.sols[1])), Q(2))), dif = vadd(S.sols[0], vneg(half));
          if (dif.length === 1 && dif[0].k.n < 0) dif = vneg(dif);
          ans = x + " = " + fmt(half) + " ± " + fmt(dif);
        }
        else ans = S.sols.map(function (v) { return x + " = " + fmt(v); }).join(" or ");
        var anyRad = S.sols.some(hasRadical);
        return { ok: true, kind: "solve", typed: typed, answer: ans, decimal: anyRad ? dv.map(function (v) { return x + " ≈ " + decStr(v); }).join(" or ") : "",
          steps: S.steps, note: S.bad && S.bad.length ? "Checked: " + S.bad.map(function (v) { return x + " = " + fmt(v); }).join(", ") + " doesn't work in the original (extraneous)." : "" };
      }
      var d = dec(P.L, {});
      var E;
      try { E = exact(P.L); } catch (e) {
        if (e instanceof Fail && e.msg === "notreal") return { ok: true, kind: "eval", typed: typed, answer: "Not a real number", note: "An even root of a negative number isn't real." };
        if (e instanceof Fail && (e.msg === "inexact" || e.msg === "big") && isFinite(d)) return { ok: true, kind: "eval", typed: typed, answer: "≈ " + decStr(d), note: "" };
        throw e;
      }
      var r = asRational(E), ans2 = fmt(E), alt = hasRadical(E) ? fmtExp(E) : "";
      var decimal = hasVars(E) ? "" : (r && r.d === 1 ? "" : decStr(d));
      return { ok: true, kind: "eval", typed: typed, answer: ans2, alt: alt && alt !== ans2 ? alt : "", decimal: decimal,
        note: hasVars(E) ? "Assumes the letters are positive." : "" };
    } catch (e) {
      if (e instanceof Fail) return { ok: false, msg: e.msg === "notreal" ? "That has an even root of a negative: not a real number." : e.msg === "big" ? "Those numbers are too big for me." : e.msg === "inexact" ? "I can't simplify that one exactly." : e.msg };
      return { ok: false, msg: "I couldn't read that." };
    }
  }

  globalThis.RRSolve = { solve: solve, parse: parse };
})();
