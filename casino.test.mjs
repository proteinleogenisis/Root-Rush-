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
check("hi/lo tunables: edge 0.92, cap 50 (setup)", () => {
  eq(L.HILO_EDGE, 0.92); eq(L.HILO_MAX_MULT, 50);
  eq(typeof L.hiloOdds, "function"); eq(L.HILO_MULT, undefined, "old fixed ladder is gone");
});
check("hiloResult win / lose, and the same rank LOSES (cards and plain ranks)", () => {
  const five = C(5), nine = C(9), five2 = C(5, "♥");
  eq(L.hiloResult(five, nine, "higher"), "win");
  eq(L.hiloResult(five, nine, "lower"), "lose");
  eq(L.hiloResult(nine, five, "lower"), "win");
  eq(L.hiloResult(nine, five, "higher"), "lose");
  eq(L.hiloResult(five, five2, "higher"), "lose", "tie, higher");
  eq(L.hiloResult(five, five2, "lower"), "lose", "tie, lower");
  eq(L.hiloResult(7, 7, "higher"), "lose"); eq(L.hiloResult(7, 7, "lower"), "lose");
  eq(L.hiloResult(5, 9, "higher"), "win");
  eq(L.hiloResult(A, K, "higher"), "win", "ace is low");
});
check("hiloOdds: exact multipliers, impossible guesses are 0", () => {
  const near = (x, y) => Math.abs(x - y) < 1e-9;
  truthy(near(L.hiloOdds(1).higher, 0.92 * 13 / 12), "Higher on A");
  truthy(near(L.hiloOdds(2).lower, 0.92 * 13), "Lower on 2 = 11.96");
  eq(L.hiloOdds(2).lower.toFixed(2), "11.96");
  eq(L.hiloOdds(1).higher.toFixed(2), "1.00");
  eq(L.hiloOdds(1).lower, 0, "Lower on A impossible");
  eq(L.hiloOdds(13).higher, 0, "Higher on K impossible");
  eq(L.hiloOdds(C(13)).lower.toFixed(2), (0.92 * 13 / 12).toFixed(2), "accepts a card");
});
check("hi/lo house edge: expected value of any single guess is <= HILO_EDGE", () => {
  for (let a = 1; a <= 13; a++) {
    const o = L.hiloOdds(a);
    for (const g of ["higher", "lower"]) {
      let wins = 0;
      for (let b = 1; b <= 13; b++) if (L.hiloResult(a, b, g) === "win") wins++;
      const ev = (wins / 13) * o[g];
      truthy(ev <= L.HILO_EDGE + 1e-9, "EV " + ev + " for " + g + " on " + a);
      if (wins > 0) truthy(Math.abs(ev - L.HILO_EDGE) < 1e-9, "EV is exactly the edge when possible");
      else eq(o[g], 0, "no win possible -> disabled");
    }
  }
});
check("hiloDraw: uniform rank 1..13 and a real suit", () => {
  const rng = mulberry32(5), seen = new Set(), counts = Array(14).fill(0);
  for (let i = 0; i < 13000; i++) {
    const c = L.hiloDraw(rng);
    truthy(c.r >= 1 && c.r <= 13 && Number.isInteger(c.r), "rank " + c.r);
    truthy(["♠", "♥", "♦", "♣"].includes(c.s), "suit");
    counts[c.r]++; seen.add(c.s);
  }
  eq(seen.size, 4);
  for (let r = 1; r <= 13; r++) truthy(counts[r] > 850 && counts[r] < 1150, "rank " + r + " count " + counts[r]);
  eq(L.hiloDraw(() => 0.9999).r, 13); eq(L.hiloDraw(() => 0).r, 1);
});

// ---- video poker ----
const S = (r, s) => ({ r, s });
const hand = (...rs) => rs.map(([r, s]) => S(r, s));
check("videoPokerRank: setup, paytable 9/6", () => {
  eq(L.VP_PAYTABLE.map(r => r[0] + "=" + r[1]).join(), "Royal Flush=250,Straight Flush=50,Four of a Kind=25,Full House=9,Flush=6,Straight=4,Three of a Kind=3,Two Pair=2,Jacks or Better=1");
});
check("videoPokerRank: every hand category", () => {
  const t = (cards, name, mult) => { const r = L.videoPokerRank(cards); eq(r.name, name); eq(r.mult, mult, name + " mult"); };
  t(hand([10, "♠"], [11, "♠"], [12, "♠"], [13, "♠"], [1, "♠"]), "Royal Flush", 250);
  t(hand([1, "♥"], [13, "♥"], [12, "♥"], [11, "♥"], [10, "♥"]), "Royal Flush", 250);
  t(hand([5, "♦"], [6, "♦"], [7, "♦"], [8, "♦"], [9, "♦"]), "Straight Flush", 50);
  t(hand([1, "♣"], [2, "♣"], [3, "♣"], [4, "♣"], [5, "♣"]), "Straight Flush", 50);
  t(hand([9, "♠"], [9, "♥"], [9, "♦"], [9, "♣"], [2, "♠"]), "Four of a Kind", 25);
  t(hand([2, "♠"], [2, "♥"], [2, "♦"], [2, "♣"], [1, "♠"]), "Four of a Kind", 25);
  t(hand([4, "♠"], [4, "♥"], [4, "♦"], [9, "♣"], [9, "♠"]), "Full House", 9);
  t(hand([4, "♠"], [4, "♥"], [9, "♦"], [9, "♣"], [9, "♠"]), "Full House", 9);
  t(hand([2, "♥"], [5, "♥"], [9, "♥"], [11, "♥"], [13, "♥"]), "Flush", 6);
  t(hand([1, "♥"], [5, "♥"], [9, "♥"], [11, "♥"], [13, "♥"]), "Flush", 6);
  t(hand([4, "♠"], [5, "♥"], [6, "♦"], [7, "♣"], [8, "♠"]), "Straight", 4);
  t(hand([1, "♠"], [2, "♥"], [3, "♦"], [4, "♣"], [5, "♠"]), "Straight", 4);
  t(hand([10, "♠"], [11, "♥"], [12, "♦"], [13, "♣"], [1, "♠"]), "Straight", 4);
  t(hand([8, "♠"], [8, "♥"], [8, "♦"], [2, "♣"], [13, "♠"]), "Three of a Kind", 3);
  t(hand([8, "♠"], [8, "♥"], [3, "♦"], [3, "♣"], [13, "♠"]), "Two Pair", 2);
  t(hand([2, "♠"], [2, "♥"], [3, "♦"], [3, "♣"], [4, "♠"]), "Two Pair", 2);
  t(hand([11, "♠"], [11, "♥"], [3, "♦"], [6, "♣"], [13, "♠"]), "Jacks or Better", 1);
  t(hand([1, "♠"], [1, "♥"], [3, "♦"], [6, "♣"], [13, "♠"]), "Jacks or Better", 1);
  t(hand([12, "♠"], [12, "♥"], [3, "♦"], [6, "♣"], [9, "♠"]), "Jacks or Better", 1);
  t(hand([13, "♠"], [13, "♥"], [3, "♦"], [6, "♣"], [9, "♠"]), "Jacks or Better", 1);
});
check("videoPokerRank: near misses are not wins", () => {
  const t = (cards, name, mult) => { const r = L.videoPokerRank(cards); eq(r.name, name); eq(r.mult, mult); };
  t(hand([10, "♠"], [10, "♥"], [3, "♦"], [6, "♣"], [9, "♠"]), "No win", 0);       // pair of tens
  t(hand([2, "♠"], [2, "♥"], [3, "♦"], [6, "♣"], [9, "♠"]), "No win", 0);
  t(hand([13, "♠"], [1, "♥"], [2, "♦"], [3, "♣"], [4, "♠"]), "No win", 0);        // K-A-2-3-4 does not wrap
  t(hand([12, "♠"], [13, "♥"], [1, "♦"], [2, "♣"], [3, "♠"]), "No win", 0);
  t(hand([2, "♠"], [5, "♠"], [9, "♠"], [11, "♠"], [13, "♥"]), "No win", 0);       // four of a suit
  t(hand([2, "♠"], [3, "♥"], [4, "♦"], [5, "♣"], [7, "♠"]), "No win", 0);         // gap straight
  t(hand([2, "♠"], [3, "♠"], [4, "♠"], [5, "♠"], [7, "♠"]), "Flush", 6);
  t(hand([9, "♠"], [10, "♠"], [11, "♠"], [12, "♠"], [13, "♠"]), "Straight Flush", 50); // king-high, not royal
  eq(L.videoPokerRank([]).mult, 0);
});
check("videoPokerPayout: pair of jacks returns the bet; bet * mult otherwise", () => {
  const jj = hand([11, "♠"], [11, "♥"], [3, "♦"], [6, "♣"], [13, "♠"]);
  eq(L.videoPokerPayout(jj, 50), 50);
  eq(L.videoPokerPayout(hand([10, "♠"], [11, "♠"], [12, "♠"], [13, "♠"], [1, "♠"]), 20), 5000);
  eq(L.videoPokerPayout(hand([2, "♠"], [5, "♥"], [9, "♦"], [11, "♣"], [13, "♠"]), 100), 0);
});
check("video poker: dealt-and-held-nothing return stays well below 100%", () => {
  const rng = mulberry32(11); let ret = 0; const N = 40000;
  for (let i = 0; i < N; i++) ret += L.videoPokerPayout(L.makeDeck(rng).slice(0, 5), 100);
  truthy(ret / (N * 100) < 0.6, "hold-nothing return " + (ret / (N * 100)));
});

// ---- baccarat ----
// Deals are taken from the END of the array: dealing order is P1, B1, P2, B2, then third cards.
const deckFor = (...ranks) => ranks.slice().reverse().map(r => S(r, "♠"));
check("baccaratValue: faces and tens are 0, ace 1, total mod 10", () => {
  eq(L.baccaratValue([S(10, "♠"), S(11, "♠")]), 0);
  eq(L.baccaratValue([S(13, "♠"), S(12, "♠"), S(1, "♠")]), 1);
  eq(L.baccaratValue([S(7, "♠"), S(8, "♠")]), 5);
  eq(L.baccaratValue([S(9, "♠"), S(9, "♥")]), 8);
  eq(L.baccaratValue([S(4, "♠"), S(5, "♦"), S(9, "♥")]), 8);
  eq(L.baccaratValue([]), 0);
});
check("baccaratBankerDraws: the whole tableau", () => {
  const D = L.baccaratBankerDraws;
  for (let b = 0; b <= 9; b++) {
    eq(D(b, null), b <= 5, "player stood, banker " + b);
    for (let p = 0; p <= 9; p++) {
      let want;
      if (b <= 2) want = true; else if (b === 3) want = p !== 8; else if (b === 4) want = p >= 2 && p <= 7;
      else if (b === 5) want = p >= 4 && p <= 7; else if (b === 6) want = p === 6 || p === 7; else want = false;
      eq(D(b, p), want, "banker " + b + " vs player third " + p);
    }
  }
});
check("baccaratPlay: natural stops everything", () => {
  const r = L.baccaratPlay(deckFor(4, 3, 4, 2, 9, 9)); // P 4+4=8 natural, B 3+2=5
  eq(r.natural, true); eq(r.player.length, 2); eq(r.banker.length, 2);
  eq(r.pTotal, 8); eq(r.bTotal, 5); eq(r.winner, "player");
  const r2 = L.baccaratPlay(deckFor(1, 4, 2, 5, 7, 7)); // P 1+2=3, B 4+5=9 natural: player does NOT draw
  eq(r2.natural, true); eq(r2.player.length, 2); eq(r2.winner, "banker");
});
check("baccaratPlay: player 6-7 stands, banker draws on 0-5 only", () => {
  const a = L.baccaratPlay(deckFor(3, 2, 3, 3, 9, 9)); // P 6 stands; B 2+3=5 draws the 9 -> 4
  eq(a.player.length, 2); eq(a.banker.length, 3); eq(a.bTotal, 4); eq(a.pTotal, 6); eq(a.winner, "player");
  const b = L.baccaratPlay(deckFor(3, 3, 4, 3, 9, 9)); // P 7 stands; B 6 stands
  eq(b.player.length, 2); eq(b.banker.length, 2); eq(b.winner, "player");
});
check("baccaratPlay: banker total 3 stands when player's third card is 8, draws otherwise", () => {
  // P 1+2=3 draws; B 1+2=3. Player's third card is 8.
  const stand = L.baccaratPlay(deckFor(1, 1, 2, 2, 8, 9));
  eq(stand.player.length, 3); eq(stand.banker.length, 2, "banker 3 stands vs 8"); eq(stand.pTotal, 1); eq(stand.bTotal, 3); eq(stand.winner, "banker");
  const draw = L.baccaratPlay(deckFor(1, 1, 2, 2, 7, 9));
  eq(draw.player.length, 3); eq(draw.banker.length, 3, "banker 3 draws vs 7"); eq(draw.bTotal, 2); eq(draw.pTotal, 0);
});
check("baccaratPlay: banker 6 draws only on player third 6 or 7; 4 on 2..7; 5 on 4..7", () => {
  // player starts with 10 + K = 0 so always draws a third card
  const mk = (b1, b2, third, bankerThird) => L.baccaratPlay(deckFor(10, b1, 13, b2, third, bankerThird));
  eq(mk(2, 4, 6, 1).banker.length, 3, "6 vs 6"); eq(mk(2, 4, 7, 1).banker.length, 3, "6 vs 7");
  eq(mk(2, 4, 5, 1).banker.length, 2, "6 vs 5"); eq(mk(2, 4, 8, 1).banker.length, 2, "6 vs 8");
  eq(mk(1, 3, 2, 1).banker.length, 3, "4 vs 2"); eq(mk(1, 3, 1, 1).banker.length, 2, "4 vs A");
  eq(mk(1, 3, 8, 1).banker.length, 2, "4 vs 8");
  eq(mk(2, 3, 4, 1).banker.length, 3, "5 vs 4"); eq(mk(2, 3, 3, 1).banker.length, 2, "5 vs 3");
  eq(mk(3, 4, 9, 1).banker.length, 2, "7 stands");
});
check("baccaratPlay: tie, deal order, and random decks always resolve consistently", () => {
  const t = L.baccaratPlay(deckFor(3, 4, 4, 3, 9, 9)); // 7 v 7
  eq(t.winner, "tie"); eq(t.deals.map(d => d.who).join(""), "pbpb");
  const rng = mulberry32(21); const wins = { player: 0, banker: 0, tie: 0 }; const N = 20000;
  for (let i = 0; i < N; i++) {
    const r = L.baccaratPlay(L.makeDeck(rng));
    eq(r.deals.length, r.player.length + r.banker.length);
    eq(L.baccaratValue(r.player), r.pTotal); eq(L.baccaratValue(r.banker), r.bTotal);
    truthy(r.player.length >= 2 && r.player.length <= 3 && r.banker.length >= 2 && r.banker.length <= 3);
    wins[r.winner]++;
  }
  // real baccarat: banker ~45.9%, player ~44.6%, tie ~9.5%
  truthy(wins.banker > wins.player, "banker wins more often than player");
  truthy(wins.tie / N > 0.08 && wins.tie / N < 0.11, "tie rate " + wins.tie / N);
});
check("baccaratPayout: player 1:1, banker 0.95:1 floored, tie 8:1, pushes on tie", () => {
  const P = L.baccaratPayout;
  eq(P("player", "player", 100), 200); eq(P("player", "banker", 100), 0); eq(P("player", "tie", 100), 100, "push");
  eq(P("banker", "banker", 100), 195); eq(P("banker", "banker", 10), 19, "floored"); eq(P("banker", "banker", 25), 48);
  eq(P("banker", "player", 100), 0); eq(P("banker", "tie", 100), 100, "push");
  eq(P("tie", "tie", 100), 900); eq(P("tie", "player", 100), 0); eq(P("tie", "banker", 100), 0);
});
check("baccarat house edge: banker and player bets return less than 1 in simulation", () => {
  const rng = mulberry32(99); const N = 60000; let bank = 0, play = 0;
  for (let i = 0; i < N; i++) {
    const r = L.baccaratPlay(L.makeDeck(rng));
    bank += L.baccaratPayout("banker", r.winner, 100); play += L.baccaratPayout("player", r.winner, 100);
  }
  truthy(bank / (N * 100) < 1.0 && bank / (N * 100) > 0.97, "banker return " + bank / (N * 100));
  truthy(play / (N * 100) < 1.0 && play / (N * 100) > 0.97, "player return " + play / (N * 100));
});

// ---- craps ----
check("crapsStep: come-out 7/11 win, 2/3/12 lose, others set the point", () => {
  const roll = (a, b) => L.crapsStep({ point: null }, a, b);
  for (const [a, b] of [[3, 4], [1, 6], [5, 2], [5, 6], [6, 5]]) { const r = roll(a, b); eq(r.result, "win"); eq(r.state.point, null); }
  for (const [a, b] of [[1, 1], [1, 2], [2, 1], [6, 6]]) { const r = roll(a, b); eq(r.result, "lose"); eq(r.state.point, null); }
  for (const [a, b, p] of [[2, 2, 4], [2, 3, 5], [3, 3, 6], [4, 4, 8], [4, 5, 9], [5, 5, 10]]) { const r = roll(a, b); eq(r.result, "point"); eq(r.state.point, p); }
  eq(L.crapsStep(null, 3, 4).result, "win", "no state = come-out");
});
check("crapsStep: with a point, hitting it wins, a 7 loses, anything else rolls on", () => {
  const st = { point: 6 };
  const w = L.crapsStep(st, 2, 4); eq(w.result, "win"); eq(w.state.point, null);
  const l = L.crapsStep(st, 3, 4); eq(l.result, "lose"); eq(l.state.point, null);
  const c = L.crapsStep(st, 1, 1); eq(c.result, "roll"); eq(c.state.point, 6);
  eq(L.crapsStep({ point: 4 }, 6, 6).result, "roll", "12 means nothing once a point is on");
  eq(L.crapsStep({ point: 10 }, 5, 6).result, "roll", "11 means nothing once a point is on");
  eq(st.point, 6, "input state is not mutated");
});
check("craps pass line: exact win chance 244/495, so it returns ~98.6%", () => {
  let win = 0;
  const ways = {}; for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) ways[a + b] = (ways[a + b] || 0) + 1;
  for (let t = 2; t <= 12; t++) {
    const a = Math.min(6, t - 1), r = L.crapsStep({ point: null }, a, t - a);
    if (r.result === "win") win += ways[t] / 36;
    else if (r.result === "point") win += (ways[t] / 36) * (ways[t] / (ways[t] + 6));
  }
  truthy(Math.abs(win - 244 / 495) < 1e-12, "win chance " + win);
  eq(L.crapsPayout("win", 50), 100); eq(L.crapsPayout("lose", 50), 0); eq(L.crapsPayout("roll", 50), 0);
  truthy(2 * win < 1, "house keeps an edge");
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

// ---- roulette wheel drawing vs the paid number ----
const REAL_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const POCKETS = [...L.wheelSvg().matchAll(/data-n="(\d+)" data-c="(\w+)" data-ang="([\d.]+)" fill="(#[0-9a-f]+)"/g)]
  .map(m => ({ n: +m[1], c: m[2], ang: +m[3], fill: m[4] }));
const mod360 = a => ((a % 360) + 360) % 360;
check("wheel order: 37 unique numbers 0-36 in the real European order", () => {
  eq(L.WHEEL_ORDER.length, 37, "length");
  eq(new Set(L.WHEEL_ORDER).size, 37, "unique");
  truthy(L.WHEEL_ORDER.every(n => Number.isInteger(n) && n >= 0 && n <= 36), "range");
  eq(L.WHEEL_ORDER.join(), REAL_ORDER.join(), "order");
});
check("the drawn wheel has 37 pockets in that same order, clockwise", () => {
  eq(POCKETS.length, 37, "pockets drawn");
  eq(POCKETS.map(p => p.n).join(), REAL_ORDER.join(), "drawn order");
  POCKETS.forEach((p, i) => truthy(Math.abs(p.ang - (i + 0.5) * 360 / 37) < 0.01, "pocket " + p.n + " angle " + p.ang));
});
check("pocket colours drawn match rouletteColor (0 green, 18 red, 18 black)", () => {
  const fillOf = {};
  POCKETS.forEach(p => {
    eq(p.c, L.rouletteColor(p.n), "colour of " + p.n);
    if (fillOf[p.c] === undefined) fillOf[p.c] = p.fill; else eq(p.fill, fillOf[p.c], "fill of " + p.c);
  });
  eq(new Set(Object.values(fillOf)).size, 3, "three distinct fills");
  eq(POCKETS.filter(p => p.c === "red").length, 18); eq(POCKETS.filter(p => p.c === "black").length, 18);
  eq(POCKETS.filter(p => p.c === "green").length, 1);
});
check("wheelAngleFor(n) puts pocket n under the pointer, for every n", () => {
  for (let n = 0; n <= 36; n++) {
    const a = L.wheelAngleFor(n);
    truthy(a >= 0 && a < 360, "range for " + n + ": " + a);
    eq(L.pocketAt(a), n, "pocketAt(wheelAngleFor(" + n + "))");
    for (const extra of [360, 1440, -720]) eq(L.pocketAt(a + extra), n, "full turns of " + n);
    const p = POCKETS.find(q => q.n === n);
    const d = mod360(p.ang + a); // data-ang is printed to 3 decimals
    truthy(Math.min(d, 360 - d) < 0.01, "drawn pocket " + n + " centre ends at the top");
  }
});
check("pocketAt stays on the same pocket across its whole width and changes at the edges", () => {
  for (let n = 0; n <= 36; n++) {
    const a = L.wheelAngleFor(n), half = 360 / 37 / 2;
    eq(L.pocketAt(a + half * 0.9), n, "just inside, " + n); eq(L.pocketAt(a - half * 0.9), n, "just inside the other side, " + n);
  }
  truthy(L.pocketAt(L.wheelAngleFor(5) + 360 / 37) !== 5, "next pocket differs");
});

// ---- module shape ----
check("RRCasino exposes mount and logic; loads without document", () => {
  eq(typeof globalThis.RRCasino.mount, "function");
  eq(typeof globalThis.document, "undefined", "no document in node");
});

console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
