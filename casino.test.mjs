import "./casino.js";

const L = globalThis.RRCasino.logic;
let passed = 0, failed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log("ok   " + name);
  } catch (e) {
    failed++;
    console.log("FAIL " + name + " :: " + e.message);
  }
}
function eq(a, b, what) {
  if (a !== b) throw new Error((what ? what + ": " : "") + "expected " + b + ", got " + a);
}
function truthy(v, what) { if (!v) throw new Error(what || "expected truthy"); }

const C = (r, s = "♠") => ({ r, s });
const A = 1, J = 11, Q = 12, K = 13;
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- deck ----
check("deck has 52 unique cards, ranks 1..13, four suits", () => {
  const d = L.makeDeck(mulberry32(1));
  eq(d.length, 52, "length");
  eq(new Set(d.map(c => c.r + c.s)).size, 52, "unique");
  eq(new Set(d.map(c => c.s)).size, 4, "suits");
  truthy(d.every(c => c.r >= 1 && c.r <= 13), "rank range");
});
check("deck is shuffled by rng and deterministic for a seed", () => {
  const a = L.makeDeck(mulberry32(7)).map(c => c.r + c.s).join();
  const b = L.makeDeck(mulberry32(7)).map(c => c.r + c.s).join();
  const c = L.makeDeck(mulberry32(8)).map(c => c.r + c.s).join();
  eq(a, b, "same seed");
  truthy(a !== c, "different seed differs");
});

// ---- handValue ----
check("handValue [A,K] = 21 (setup: 2 cards)", () => {
  const h = [C(A), C(K)]; eq(h.length, 2, "setup");
  eq(L.handValue(h), 21);
});
check("handValue [A,A,9] = 21", () => {
  const h = [C(A), C(A, "♥"), C(9)]; eq(h.length, 3, "setup");
  eq(L.handValue(h), 21);
});
check("handValue [A,A,A,8] = 21", () => {
  const h = [C(A), C(A, "♥"), C(A, "♦"), C(8)]; eq(h.length, 4, "setup");
  eq(L.handValue(h), 21);
});
check("handValue [K,Q,5] = 25 (bust)", () => {
  const h = [C(K), C(Q), C(5)]; eq(h.length, 3, "setup");
  eq(L.handValue(h), 25);
});
check("handValue [A,6] = 17 (soft)", () => {
  const h = [C(A), C(6)]; eq(h.length, 2, "setup");
  eq(L.handValue(h), 17);
});
check("handValue face cards count 10", () => {
  eq(L.handValue([C(J), C(Q)]), 20);
  eq(L.handValue([C(K), C(10)]), 20);
});

// ---- blackjack / dealer ----
check("isBlackjack: only exactly two cards totalling 21", () => {
  eq(L.isBlackjack([C(A), C(K)]), true);
  eq(L.isBlackjack([C(7), C(7), C(7)]), false, "3-card 21");
  eq(L.isBlackjack([C(K), C(9)]), false, "19");
});
check("dealerShouldHit stands on soft 17 and hard 17, hits 16", () => {
  const soft = [C(A), C(6)], hard = [C(10), C(7)], sixteen = [C(10), C(6)];
  eq(L.handValue(soft), 17, "setup soft"); eq(L.handValue(hard), 17, "setup hard"); eq(L.handValue(sixteen), 16, "setup 16");
  eq(L.dealerShouldHit(soft), false);
  eq(L.dealerShouldHit(hard), false);
  eq(L.dealerShouldHit(sixteen), true);
});

const BET = 10;
check("settleBlackjack: player bust -> 0", () => {
  const p = [C(K), C(Q), C(5)], d = [C(10), C(7)]; eq(L.handValue(p), 25, "setup");
  eq(L.settleBlackjack(p, d, BET), 0);
});
check("settleBlackjack: player blackjack vs non-blackjack -> 25", () => {
  const p = [C(A), C(K)], d = [C(10), C(9)]; eq(L.isBlackjack(p), true, "setup p"); eq(L.isBlackjack(d), false, "setup d");
  eq(L.settleBlackjack(p, d, BET), 25);
});
check("settleBlackjack: BJ pays floor(2.5*bet) for odd bet 25 -> 62", () => {
  eq(L.settleBlackjack([C(A), C(K)], [C(10), C(9)], 25), 62);
});
check("settleBlackjack: both blackjack -> 10", () => {
  const p = [C(A), C(K)], d = [C(A, "♥"), C(Q)]; eq(L.isBlackjack(p) && L.isBlackjack(d), true, "setup");
  eq(L.settleBlackjack(p, d, BET), 10);
});
check("settleBlackjack: 3-card 21 vs dealer blackjack -> 0 (real casino rule)", () => {
  const p = [C(7), C(7), C(7)], d = [C(A), C(K)]; eq(L.handValue(p) === 21 && !L.isBlackjack(p) && L.isBlackjack(d), true, "setup");
  eq(L.settleBlackjack(p, d, BET), 0);
});
check("settleBlackjack: dealer bust -> 20", () => {
  const p = [C(10), C(8)], d = [C(10), C(6), C(9)]; eq(L.handValue(d), 25, "setup");
  eq(L.settleBlackjack(p, d, BET), 20);
});
check("settleBlackjack: player higher -> 20", () => {
  const p = [C(10), C(9)], d = [C(10), C(8)]; eq(L.handValue(p), 19, "setup p"); eq(L.handValue(d), 18, "setup d");
  eq(L.settleBlackjack(p, d, BET), 20);
});
function tieCase(fn) {
  const p = [C(10), C(8)], d = [C(9), C(9, "♥")];
  eq(L.handValue(p), 18, "setup p"); eq(L.handValue(d), 18, "setup d");
  eq(fn(p, d, BET), 10, "tie returns the stake only");
}
check("settleBlackjack: tie -> 10", () => tieCase(L.settleBlackjack));
check("settleBlackjack: player lower -> 0", () => {
  const p = [C(10), C(7)], d = [C(10), C(9)]; eq(L.handValue(p), 17, "setup p"); eq(L.handValue(d), 19, "setup d");
  eq(L.settleBlackjack(p, d, BET), 0);
});
check("MUTATION: settleBlackjack mutant paying 2x on a tie is caught by the tie test", () => {
  const mutant = (p, d, b) => (L.handValue(p) === L.handValue(d) && L.handValue(p) <= 21 && !L.isBlackjack(p) ? 2 * b : L.settleBlackjack(p, d, b));
  let caught = false;
  try { tieCase(mutant); } catch (e) { caught = true; }
  eq(caught, true, "mutant should fail tieCase");
  tieCase(L.settleBlackjack); // and the real one still passes
});

// ---- roulette ----
const REAL_REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
check("ROULETTE_REDS is the real 18-number European red set", () => {
  eq(L.ROULETTE_REDS.length, 18, "setup count");
  eq(L.ROULETTE_REDS.every(n => REAL_REDS.has(n)), true);
});
check("rouletteColor: 0 green, all 36 others match real wheel", () => {
  eq(L.rouletteColor(0), "green");
  let reds = 0, blacks = 0;
  for (let n = 1; n <= 36; n++) {
    const want = REAL_REDS.has(n) ? "red" : "black";
    eq(L.rouletteColor(n), want, "n=" + n);
    want === "red" ? reds++ : blacks++;
  }
  eq(reds, 18, "reds"); eq(blacks, 18, "blacks");
});
check("roulettePayout: red / black", () => {
  eq(L.rouletteColor(1), "red", "setup"); eq(L.rouletteColor(2), "black", "setup");
  eq(L.roulettePayout({ type: "red" }, 1, 10), 20);
  eq(L.roulettePayout({ type: "red" }, 2, 10), 0);
  eq(L.roulettePayout({ type: "black" }, 2, 10), 20);
  eq(L.roulettePayout({ type: "black" }, 1, 10), 0);
});
check("roulettePayout: odd / even", () => {
  eq(L.roulettePayout({ type: "odd" }, 7, 10), 20);
  eq(L.roulettePayout({ type: "odd" }, 8, 10), 0);
  eq(L.roulettePayout({ type: "even" }, 8, 10), 20);
  eq(L.roulettePayout({ type: "even" }, 7, 10), 0);
});
check("roulettePayout: 0 loses red/black/odd/even", () => {
  eq(L.rouletteColor(0), "green", "setup");
  for (const t of ["red", "black", "odd", "even"]) eq(L.roulettePayout({ type: t }, 0, 10), 0, t);
});
check("roulettePayout: number hit 36x, miss 0, zero can be bet on", () => {
  eq(L.roulettePayout({ type: "number", value: 17 }, 17, 10), 360);
  eq(L.roulettePayout({ type: "number", value: 36 }, 36, 10), 360);
  eq(L.roulettePayout({ type: "number", value: 17 }, 18, 10), 0);
  eq(L.roulettePayout({ type: "number", value: 0 }, 0, 10), 360);
});

// ---- hi/lo ----
check("HILO_MULT matches the contract", () => {
  eq(L.HILO_MULT.join(), "1,1.5,2.2,3.3,5,7.5,11");
});
check("hiloResult win / lose / push (cards and plain ranks)", () => {
  const five = C(5), nine = C(9), five2 = C(5, "♥");
  eq(L.hiloResult(five, nine, "higher"), "win");
  eq(L.hiloResult(five, nine, "lower"), "lose");
  eq(L.hiloResult(nine, five, "lower"), "win");
  eq(L.hiloResult(nine, five, "higher"), "lose");
  eq(L.hiloResult(five, five2, "higher"), "push");
  eq(L.hiloResult(five, five2, "lower"), "push");
  eq(L.hiloResult(5, 9, "higher"), "win");
  eq(L.hiloResult(A, K, "higher"), "win", "ace is low");
});

// ---- slots ----
check("slot symbols: weights positive integers, pay3 positive", () => {
  truthy(L.SLOT_SYMBOLS.length >= 3, "at least 3 symbols");
  truthy(L.SLOT_SYMBOLS.every(s => s.sym && s.weight > 0 && s.pay3 > 0), "fields");
  eq(new Set(L.SLOT_SYMBOLS.map(s => s.sym)).size, L.SLOT_SYMBOLS.length, "unique");
});
check("slot expected return by exact enumeration is within 0.85..0.98", () => {
  const S = L.SLOT_SYMBOLS, W = S.reduce((a, s) => a + s.weight, 0), BETN = 100;
  eq(S.length > 0 && W > 0, true, "setup");
  let ev = 0, pTotal = 0;
  for (const a of S) for (const b of S) for (const c of S) {
    const p = (a.weight * b.weight * c.weight) / (W * W * W);
    pTotal += p;
    ev += p * L.slotPayout([a.sym, b.sym, c.sym], BETN) / BETN;
  }
  truthy(Math.abs(pTotal - 1) < 1e-9, "probabilities sum to 1, got " + pTotal);
  console.log("     (exact slot RTP = " + ev.toFixed(4) + ")");
  truthy(ev >= 0.85 && ev <= 0.98, "RTP " + ev);
});
check("slotPayout: three of a kind pays pay3*bet, mismatch pays 0, integer", () => {
  const s0 = L.SLOT_SYMBOLS[0], s1 = L.SLOT_SYMBOLS[1];
  eq(L.slotPayout([s0.sym, s0.sym, s0.sym], 10), s0.pay3 * 10);
  eq(L.slotPayout([s0.sym, s0.sym, s1.sym], 10), 0);
  eq(L.slotPayout([s0.sym, s1.sym, s0.sym], 10), 0);
  eq(Number.isInteger(L.slotPayout([s1.sym, s1.sym, s1.sym], 25)), true);
});
check("spinReels with a seeded rng is deterministic and returns known symbols", () => {
  const known = new Set(L.SLOT_SYMBOLS.map(s => s.sym));
  const a = L.spinReels(mulberry32(42)), b = L.spinReels(mulberry32(42));
  eq(a.length, 3, "setup length");
  eq(a.join(), b.join(), "same seed same reels");
  truthy(a.every(x => known.has(x)), "known symbols");
  const r = mulberry32(5); const seq = [];
  for (let i = 0; i < 20; i++) seq.push(L.spinReels(r).join("|"));
  truthy(new Set(seq).size > 1, "different spins differ");
});
check("spinReels draws by weight (rng=0 -> first symbol, rng~1 -> last symbol)", () => {
  const S = L.SLOT_SYMBOLS;
  eq(L.spinReels(() => 0).join(), [S[0].sym, S[0].sym, S[0].sym].join());
  eq(L.spinReels(() => 0.999999).join(), [S[S.length - 1].sym, S[S.length - 1].sym, S[S.length - 1].sym].join());
});
check("spinReels empirical frequencies track weights (200k draws, 1.5 pt tolerance)", () => {
  const S = L.SLOT_SYMBOLS, W = S.reduce((a, s) => a + s.weight, 0), r = mulberry32(99), cnt = {};
  let n = 0;
  for (let i = 0; i < 66666; i++) for (const x of L.spinReels(r)) { cnt[x] = (cnt[x] || 0) + 1; n++; }
  for (const s of S) truthy(Math.abs(cnt[s.sym] / n - s.weight / W) < 0.015, s.sym + " freq " + cnt[s.sym] / n);
});

// ---- module shape ----
check("RRCasino exposes mount and logic; loads without document", () => {
  eq(typeof globalThis.RRCasino.mount, "function");
  eq(typeof globalThis.document, "undefined", "no document in node");
});

console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
