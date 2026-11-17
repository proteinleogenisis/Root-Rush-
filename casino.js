/* Root Rush casino. Plain script: sets globalThis.RRCasino = {logic, mount}.
   Loads in Node (no document/window access at load time). See docs/economy-contract.md. */
(function () {
  "use strict";

  // ---------- tunables ----------
  var CHIPS = [10, 25, 50, 100];
  var MIN_BET = 10;
  var STACK_MAX = 12;          // most chips drawn in the bet pile
  var BIG_WIN_MULT = 5;        // toast when net win >= this many times the stake
  var BIG_WIN_COINS = 250;     // ...or this many coins
  var DEAL_STEP_MS = 260;      // stagger between dealt cards at the start of a hand
  var SLIDE_MS = 340;          // a card sliding from the shoe to its spot
  var DEALER_STEP_MS = 720;    // pause between dealer draws
  var REEL_STOP_MS = [1100, 1700, 2300];
  var WHEEL_SPIN_MS = 4200;    // wheel + ball spin, ball settles at the end
  var BALL_DROP_AT_MS = 3000;  // when the ball drops from the track into a pocket
  var WHEEL_TURNS = 4;         // full wheel turns during a spin
  var BALL_TURNS = 6;          // full ball turns (opposite way)
  var ZOOM_MS = 400;           // lobby <-> game zoom
  var COIN_POUR_BIG = 10;      // win of this many times the bet = a heavy coin shower
  var HILO_EDGE = 0.92;        // higher/lower: each guess is paid HILO_EDGE / P(win), so the house keeps 8%
  var HILO_MAX_MULT = 50;      // higher/lower: pot multiplier cap; reaching it cashes out by itself
  var BACC_BANKER_RETURN = 1.95; // baccarat: coins returned per coin on a winning Banker bet (0.95:1)
  var BACC_TIE_RETURN = 9;     // baccarat: coins returned per coin on a winning Tie bet (8:1)
  var BACC_STEP_MS = 620;      // pause between baccarat cards
  var VP_STEP_MS = 170;        // stagger between video poker cards flipping
  var DICE_TICKS = 9;          // faces the craps dice flash through while tumbling
  var DICE_TICK_MS = 100;      // time per flash (the tumble lasts DICE_TICKS * DICE_TICK_MS)

  // ---------- pure logic ----------
  var SUITS = ["♠", "♥", "♦", "♣"];

  function makeDeck(rng) {
    rng = rng || Math.random;
    var d = [], r, i;
    for (i = 0; i < 4; i++) for (r = 1; r <= 13; r++) d.push({ r: r, s: SUITS[i] });
    for (i = d.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = d[i]; d[i] = d[j]; d[j] = t;
    }
    return d;
  }

  function handValue(cards) {
    var total = 0, aces = 0;
    for (var i = 0; i < cards.length; i++) {
      var r = cards[i].r;
      if (r === 1) { aces++; total += 11; } else total += r >= 10 ? 10 : r;
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
  }
  function isBlackjack(cards) { return cards.length === 2 && handValue(cards) === 21; }
  function dealerShouldHit(cards) { return handValue(cards) < 17; }

  function settleBlackjack(player, dealer, bet) {
    var p = handValue(player), d = handValue(dealer);
    if (p > 21) return 0;
    var pb = isBlackjack(player), db = isBlackjack(dealer);
    if (pb && !db) return Math.floor(2.5 * bet);
    if (pb && db) return bet;
    if (db) return 0; // dealer blackjack beats any other hand, even a 3-card 21
    if (d > 21) return 2 * bet;
    if (p > d) return 2 * bet;
    if (p === d) return bet;
    return 0;
  }

  // Weights total 30. Three of a kind only. Exact return: see casino.test.mjs.
  var SLOT_SYMBOLS = [
    { sym: "🍒", weight: 12, pay3: 5 },
    { sym: "🍋", weight: 9, pay3: 10 },
    { sym: "🔔", weight: 6, pay3: 25 },
    { sym: "💎", weight: 3, pay3: 100 }
  ];
  function spinReels(rng) {
    rng = rng || Math.random;
    var total = 0, i;
    for (i = 0; i < SLOT_SYMBOLS.length; i++) total += SLOT_SYMBOLS[i].weight;
    var out = [];
    for (var k = 0; k < 3; k++) {
      var x = rng() * total, acc = 0, pick = SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1].sym;
      for (i = 0; i < SLOT_SYMBOLS.length; i++) {
        acc += SLOT_SYMBOLS[i].weight;
        if (x < acc) { pick = SLOT_SYMBOLS[i].sym; break; }
      }
      out.push(pick);
    }
    return out;
  }
  function slotPayout(reels, bet) {
    if (!reels || reels.length !== 3 || reels[0] !== reels[1] || reels[1] !== reels[2]) return 0;
    for (var i = 0; i < SLOT_SYMBOLS.length; i++) {
      if (SLOT_SYMBOLS[i].sym === reels[0]) return Math.floor(SLOT_SYMBOLS[i].pay3 * bet);
    }
    return 0;
  }

  var ROULETTE_REDS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  function rouletteColor(n) {
    if (n === 0) return "green";
    return ROULETTE_REDS.indexOf(n) >= 0 ? "red" : "black";
  }
  function roulettePayout(bet, n, amount) {
    if (!bet) return 0;
    switch (bet.type) {
      case "red": return n !== 0 && rouletteColor(n) === "red" ? 2 * amount : 0;
      case "black": return n !== 0 && rouletteColor(n) === "black" ? 2 * amount : 0;
      case "odd": return n !== 0 && n % 2 === 1 ? 2 * amount : 0;
      case "even": return n !== 0 && n % 2 === 0 ? 2 * amount : 0;
      case "number": return n === bet.value ? 36 * amount : 0;
    }
    return 0;
  }

  function rankOf(x) { return typeof x === "object" && x !== null ? x.r : x; }
  // Higher/lower. Every draw is an independent random card, so the odds are exact:
  // P(higher) = (13-a)/13, P(lower) = (a-1)/13, and the same rank loses.
  function hiloDraw(rng) {
    rng = rng || Math.random;
    return { r: 1 + Math.floor(rng() * 13), s: SUITS[Math.floor(rng() * 4)] };
  }
  // The pot multiplier a correct guess applies: HILO_EDGE / P(win). 0 means the guess is impossible.
  function hiloOdds(rank) {
    var a = rankOf(rank);
    return {
      higher: a < 13 ? HILO_EDGE * 13 / (13 - a) : 0,
      lower: a > 1 ? HILO_EDGE * 13 / (a - 1) : 0,
      same: HILO_EDGE * 13          // 1 in 13 chance, same house edge: ×11.96
    };
  }
  function hiloResult(cur, next, guess) {
    var a = rankOf(cur), b = rankOf(next);
    if (guess === "same") return a === b ? "win" : "lose";
    if (a === b) return "lose";
    if (guess === "higher") return b > a ? "win" : "lose";
    return b < a ? "win" : "lose";
  }

  // Video poker, Jacks or Better, 9/6 paytable. mult = coins returned per coin bet.
  var VP_PAYTABLE = [
    ["Royal Flush", 250], ["Straight Flush", 50], ["Four of a Kind", 25], ["Full House", 9], ["Flush", 6],
    ["Straight", 4], ["Three of a Kind", 3], ["Two Pair", 2], ["Jacks or Better", 1]
  ];
  function vpMult(name) {
    for (var i = 0; i < VP_PAYTABLE.length; i++) if (VP_PAYTABLE[i][0] === name) return VP_PAYTABLE[i][1];
    return 0;
  }
  function videoPokerRank(cards) {
    if (!cards || cards.length !== 5) return { name: "No win", mult: 0 };
    var cnt = {}, ranks = [], i, flush = true;
    for (i = 0; i < 5; i++) {
      cnt[cards[i].r] = (cnt[cards[i].r] || 0) + 1;
      ranks.push(cards[i].r);
      if (cards[i].s !== cards[0].s) flush = false;
    }
    ranks.sort(function (x, y) { return x - y; });
    var groups = Object.keys(cnt).map(function (k) { return cnt[k]; }).sort(function (x, y) { return y - x; });
    var wheel = ranks.join() === "1,10,11,12,13";
    var straight = groups.length === 5 && (ranks[4] - ranks[0] === 4 || wheel);
    var name = "No win";
    if (straight && flush && wheel) name = "Royal Flush";
    else if (straight && flush) name = "Straight Flush";
    else if (groups[0] === 4) name = "Four of a Kind";
    else if (groups[0] === 3 && groups[1] === 2) name = "Full House";
    else if (flush) name = "Flush";
    else if (straight) name = "Straight";
    else if (groups[0] === 3) name = "Three of a Kind";
    else if (groups[0] === 2 && groups[1] === 2) name = "Two Pair";
    else if (groups[0] === 2) {
      for (var k in cnt) if (cnt[k] === 2 && (+k === 1 || +k >= 11)) name = "Jacks or Better";
    }
    return { name: name, mult: vpMult(name) };
  }
  function videoPokerPayout(cards, bet) { return Math.floor(videoPokerRank(cards).mult * bet); }

  // Baccarat (punto banco). Cards are taken from the END of the deck array (like makeDeck().pop()).
  function baccaratValue(cards) {
    var t = 0;
    for (var i = 0; i < cards.length; i++) t += cards[i].r >= 10 ? 0 : cards[i].r;
    return t % 10;
  }
  // Banker's third-card rule. playerThird = baccarat value (0-9) of the player's third card, or null if the player stood.
  function baccaratBankerDraws(bTotal, playerThird) {
    if (bTotal >= 7) return false;
    if (playerThird === null) return bTotal <= 5;
    var p = playerThird;
    if (bTotal <= 2) return true;
    if (bTotal === 3) return p !== 8;
    if (bTotal === 4) return p >= 2 && p <= 7;
    if (bTotal === 5) return p >= 4 && p <= 7;
    return p === 6 || p === 7; // bTotal 6
  }
  function baccaratPlay(src) {
    var deck = Array.isArray(src) ? src : makeDeck(src);
    var p = [], b = [], deals = [];
    function give(hand, who) { var c = deck.pop(); hand.push(c); deals.push({ who: who, card: c }); }
    give(p, "p"); give(b, "b"); give(p, "p"); give(b, "b");
    var pt = baccaratValue(p), bt = baccaratValue(b), natural = pt >= 8 || bt >= 8;
    if (!natural) {
      var third = null;
      if (pt <= 5) { give(p, "p"); third = baccaratValue([p[2]]); }
      if (baccaratBankerDraws(bt, third)) give(b, "b");
    }
    pt = baccaratValue(p); bt = baccaratValue(b);
    return { player: p, banker: b, deals: deals, pTotal: pt, bTotal: bt, natural: natural, winner: pt > bt ? "player" : bt > pt ? "banker" : "tie" };
  }
  // Coins RETURNED (stake already taken). on and winner are "player" | "banker" | "tie".
  function baccaratPayout(on, winner, amount) {
    if (winner === "tie") return on === "tie" ? Math.floor(amount * BACC_TIE_RETURN) : (on === "player" || on === "banker" ? amount : 0);
    if (on !== winner) return 0;
    return on === "player" ? 2 * amount : Math.floor(amount * BACC_BANKER_RETURN + 1e-9);
  }

  // Craps, pass line only. state = {point: null | 4|5|6|8|9|10}. result: "win" | "lose" | "point" (point just set) | "roll" (keep rolling)
  function crapsStep(state, d1, d2) {
    var t = d1 + d2, pt = state && state.point ? state.point : null;
    if (!pt) {
      if (t === 7 || t === 11) return { result: "win", state: { point: null }, total: t };
      if (t === 2 || t === 3 || t === 12) return { result: "lose", state: { point: null }, total: t };
      return { result: "point", state: { point: t }, total: t };
    }
    if (t === pt) return { result: "win", state: { point: null }, total: t };
    if (t === 7) return { result: "lose", state: { point: null }, total: t };
    return { result: "roll", state: { point: pt }, total: t };
  }
  function crapsPayout(result, bet) { return result === "win" ? 2 * bet : 0; }

  // European wheel: real pocket order, clockwise from the zero. Pocket i is centred
  // (i + 0.5) * POCKET_DEG degrees clockwise from the top of the wheel.
  var WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  var POCKET_DEG = 360 / 37;
  function norm360(a) { return ((a % 360) + 360) % 360; }
  // Rotation (degrees, clockwise) of the wheel that puts pocket n under the pointer at the top.
  function wheelAngleFor(n) {
    var i = WHEEL_ORDER.indexOf(n);
    return i < 0 ? NaN : norm360(-(i + 0.5) * POCKET_DEG);
  }
  // Which number is under the pointer when the wheel is rotated by rot degrees.
  function pocketAt(rot) { return WHEEL_ORDER[Math.floor(norm360(-rot) / POCKET_DEG) % 37]; }
  function pt(r, a) { var t = a * Math.PI / 180; return (r * Math.sin(t)).toFixed(2) + " " + (-r * Math.cos(t)).toFixed(2); }
  function pocketFill(c) { return c === "red" ? "#b3141f" : c === "black" ? "#141414" : "#0b7a48"; }
  function wheelDefs() {
    return '<radialGradient id="czw-gold" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#fbe9a0"/><stop offset="1" stop-color="#a97a1c"/></radialGradient>' +
      '<radialGradient id="czw-cone" cx="38%" cy="34%" r="70%"><stop offset="0" stop-color="#9a8a78"/><stop offset=".35" stop-color="#5a3a1c"/><stop offset="1" stop-color="#1b0e06"/></radialGradient>' +
      '<radialGradient id="czw-shade" cx="50%" cy="50%" r="50%"><stop offset=".65" stop-color="#000" stop-opacity=".42"/><stop offset=".82" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></radialGradient>' +
      '<linearGradient id="czw-chrome" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#9a9a9a"/><stop offset=".55" stop-color="#f4f4f4"/><stop offset="1" stop-color="#6a6a6a"/></linearGradient>';
  }
  // The turning part of the wheel (pockets, numbers, cone), in a -114..114 box.
  function wheelInner() {
    var s = "", i, r0 = 58, r1 = 89;
    for (i = 0; i < 37; i++) {
      var n = WHEEL_ORDER[i], c = rouletteColor(n), a0 = i * POCKET_DEG, a1 = (i + 1) * POCKET_DEG, mid = (i + 0.5) * POCKET_DEG;
      s += '<path class="cz-pk" data-n="' + n + '" data-c="' + c + '" data-ang="' + mid.toFixed(3) + '" fill="' + pocketFill(c) +
        '" stroke="#d9b45a" stroke-width=".8" d="M' + pt(r0, a0) + " L" + pt(r1, a0) + " A" + r1 + " " + r1 + " 0 0 1 " + pt(r1, a1) +
        " L" + pt(r0, a1) + " A" + r0 + " " + r0 + " 0 0 0 " + pt(r0, a0) + ' Z"/>';
    }
    s += '<circle r="89" fill="url(#czw-shade)"/><circle r="89" fill="none" stroke="#f0d78a" stroke-width="1.4"/>';
    for (i = 0; i < 37; i++) {
      var m = (i + 0.5) * POCKET_DEG;
      s += '<text transform="rotate(' + m.toFixed(3) + ') translate(0 -82)" y="3" text-anchor="middle" font-size="9" font-weight="800" fill="#fff" font-family="inherit">' + WHEEL_ORDER[i] + "</text>";
    }
    s += '<circle r="58" fill="#3a2212" stroke="#d9b45a" stroke-width="1.5"/><circle r="47" fill="url(#czw-gold)"/><circle r="31" fill="url(#czw-cone)" stroke="#6b4a10" stroke-width="1"/>';
    for (i = 0; i < 4; i++) s += '<rect x="-2" y="-46" width="4" height="30" rx="2" fill="url(#czw-chrome)" stroke="#6b4a10" stroke-width=".5" transform="rotate(' + (i * 90 + 45) + ')"/>';
    s += '<circle r="9" fill="url(#czw-chrome)" stroke="#6b4a10"/><circle r="3" fill="#fff6c8"/>';
    return s;
  }
  function wheelSvg() {
    return '<svg viewBox="-114 -114 228 228" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>' + wheelDefs() + "</defs>" + wheelInner() + "</svg>";
  }

  // ---------- the High-Limit Salon bar (pretend drinks: they only change how the screen looks) ----------
  var DRINK_FADE_MS = 8 * 60 * 1000; // one serving wears off in this long (real time)
  var BUZZ_MAX = 8;                  // servings stop stacking here
  var DRINKS = [
    { id: "lager", name: "Imported Lager", icon: "🍺", serv: 1, price: 1000, tint: "#f5c542", note: "Ice cold, from Munich" , tone: "Warm glow", fx: { sw: 0.7, bl: 0.8, dv: 0.6, sy: 0.8, dk: 0.6, spd: 0.9, bub: 0 } },
    { id: "mojito", name: "Mint Mojito", icon: "🍹", serv: 1.5, price: 2500, tint: "#5be37d", note: "Fresh mint and white rum" , tone: "Breezy", fx: { sw: 1.1, bl: 0.6, dv: 0.7, sy: 1.25, dk: 0.4, spd: 1.3, bub: 0 } },
    { id: "wine", name: "Grand Cru Red", icon: "🍷", serv: 1.5, price: 4000, tint: "#c0213f", note: "A glass from a famous vineyard" , tone: "Heavy", fx: { sw: 0.8, bl: 1.2, dv: 0.9, sy: 1.45, dk: 1.5, spd: 0.7, bub: 0 } },
    { id: "martini", name: "Dry Martini", icon: "🍸", serv: 2, price: 6000, tint: "#9fd8ff", note: "Shaken, with an olive" , tone: "Seeing double", fx: { sw: 0.7, bl: 0.6, dv: 2.2, sy: 0.9, dk: 0.8, spd: 1, bub: 0 } },
    { id: "sake", name: "Junmai Daiginjo Sake", icon: "🍶", serv: 2, price: 8000, tint: "#f3eedc", note: "Polished rice, served chilled" , tone: "Dreamy", fx: { sw: 1.1, bl: 1.7, dv: 0.6, sy: 0.9, dk: 0.5, spd: 0.6, bub: 0 } },
    { id: "scotch", name: "18-Year Single Malt", icon: "🥃", serv: 2, price: 12000, tint: "#d98b2b", note: "Smoky, aged in oak" , tone: "Smoky", fx: { sw: 0.6, bl: 1.4, dv: 1, sy: 1, dk: 1.7, spd: 0.8, bub: 0 } },
    { id: "absinthe", name: "Green Fairy Absinthe", icon: "🧪", serv: 3, price: 18000, tint: "#7dff4a", note: "Strong. Everything turns green" , tone: "Trippy", fx: { sw: 2.1, bl: 0.9, dv: 1.3, sy: 1.35, dk: 0.8, spd: 2, bub: 0 } },
    { id: "tower", name: "Champagne Tower", icon: "🥂", serv: 4, price: 25000, tint: "#ffe08a", note: "A pyramid of glasses, poured from the top" , tone: "Bubbly", fx: { sw: 1.2, bl: 0.8, dv: 0.9, sy: 1.05, dk: 0.5, spd: 1.2, bub: 1 } },
    { id: "cognac", name: "Royal Reserve Cognac", icon: "🥃", serv: 3, price: 35000, tint: "#b5651d", note: "From a cellar older than the casino" , tone: "Royal haze", fx: { sw: 1.3, bl: 1.3, dv: 1.4, sy: 1.4, dk: 1.3, spd: 1, bub: 0 } },
    { id: "vintage", name: "1961 Vintage Champagne", icon: "🍾", serv: 5, price: 50000, tint: "#fff3b0", note: "One of the last bottles left" , tone: "Everything at once", fx: { sw: 2.1, bl: 1.7, dv: 2.2, sy: 1.45, dk: 1.7, spd: 2, bub: 1 } }
  ];
  // how many servings are still "in you" right now
  function buzzAt(st, now) {
    if (!st || !(+st.lvl > 0)) return 0;
    var left = +st.lvl - Math.max(0, now - (+st.t || 0)) / DRINK_FADE_MS;
    return left > 0 ? left : 0;
  }
  // a new drink stacks on top of what's left, up to BUZZ_MAX; its color tints the effect
  // the last drink sets the tone (its fx) and the color
  function drinkAdd(st, d, now) { return { lvl: Math.min(BUZZ_MAX, buzzAt(st, now) + d.serv), t: now, tint: d.tint, id: d.id }; }
  function buzzName(lvl) { return lvl < 0.3 ? "Sober" : lvl < 1.5 ? "Tipsy" : lvl < 3 ? "Buzzed" : lvl < 5 ? "Drunk" : "Wasted"; }
  function soberMinutes(lvl) { return Math.ceil(lvl * DRINK_FADE_MS / 60000); }

  var logic = {
    DRINKS: DRINKS, DRINK_FADE_MS: DRINK_FADE_MS, BUZZ_MAX: BUZZ_MAX, buzzAt: buzzAt, drinkAdd: drinkAdd, buzzName: buzzName, soberMinutes: soberMinutes,
    makeDeck: makeDeck, handValue: handValue, isBlackjack: isBlackjack,
    dealerShouldHit: dealerShouldHit, settleBlackjack: settleBlackjack,
    SLOT_SYMBOLS: SLOT_SYMBOLS, spinReels: spinReels, slotPayout: slotPayout,
    ROULETTE_REDS: ROULETTE_REDS, rouletteColor: rouletteColor, roulettePayout: roulettePayout,
    HILO_EDGE: HILO_EDGE, HILO_MAX_MULT: HILO_MAX_MULT, hiloOdds: hiloOdds, hiloDraw: hiloDraw, hiloResult: hiloResult,
    VP_PAYTABLE: VP_PAYTABLE, videoPokerRank: videoPokerRank, videoPokerPayout: videoPokerPayout,
    baccaratValue: baccaratValue, baccaratBankerDraws: baccaratBankerDraws, baccaratPlay: baccaratPlay, baccaratPayout: baccaratPayout,
    crapsStep: crapsStep, crapsPayout: crapsPayout,
    WHEEL_ORDER: WHEEL_ORDER, wheelAngleFor: wheelAngleFor, pocketAt: pocketAt, wheelSvg: wheelSvg
  };

  // ---------- styles ----------
  var CSS = [
    ".cz{width:100%;color:var(--ink)}",
    ".cz *{box-sizing:border-box}",
    ".cz button{min-height:44px;font:inherit;cursor:pointer}",
    ".cz-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;min-height:48px}",
    ".cz-title{font-size:20px;font-weight:800;letter-spacing:.02em}",
    ".cz-plaque{background:linear-gradient(180deg,#f9e08e,#d6a636 55%,#b98a24);color:#3a2408;border:2px solid #7a5513;border-radius:10px;padding:7px 16px;font-weight:800;font-size:18px;white-space:nowrap;box-shadow:0 2px 0 #6b4a10,0 0 14px rgba(232,192,90,.35),inset 0 1px 0 rgba(255,255,255,.6);text-shadow:0 1px 0 rgba(255,255,255,.45)}",
    ".cz-back{background:var(--card);border:1px solid var(--line);color:var(--ink);border-radius:99px;padding:8px 14px;font-weight:700;font-size:15px}",
    ".cz-back:disabled{opacity:.4}",
    ".cz-stage{transform-origin:50% 50%}",
    ".cz-outl{animation:cz-outl .4s ease-in both}@keyframes cz-outl{to{transform:scale(1.45);opacity:0}}",
    ".cz-ing{animation:cz-ing .4s ease-out both}@keyframes cz-ing{from{transform:scale(.86);opacity:0}to{transform:none;opacity:1}}",
    ".cz-outg{animation:cz-outg .35s ease-in both}@keyframes cz-outg{to{transform:scale(.9);opacity:0}}",
    ".cz-inl{animation:cz-inl .4s ease-out both}@keyframes cz-inl{from{transform:scale(1.25);opacity:0}to{transform:none;opacity:1}}",
    // lobby
    ".cz-room{position:relative;overflow:hidden;margin:0 auto;border-radius:14px;box-shadow:0 0 0 2px #7a5513,0 6px 24px rgba(0,0,0,.5);touch-action:pan-y}",
    "body.cz-fs{overflow:hidden}",
    "body.cz-fs .cz-room{position:fixed;inset:0;width:100vw!important;height:100dvh;margin:0;border-radius:0;box-shadow:none;z-index:6;background:#14031f}",
    "body.cz-fs .cz-roomsvg{width:100vw!important;height:100dvh!important}",
    "body.cz-fs .cz-head{position:fixed;top:10px;right:10px;left:auto;z-index:8;margin:0;min-height:0}",
    "body.cz-fs #cz-left{display:none}",
    "body.cz-fs .cz-look{bottom:calc(16px + env(safe-area-inset-bottom))}",
    ".cz-bar{background:linear-gradient(180deg,#1a0a10,#0b0408);border:1.5px solid #c9a24a;border-radius:16px;padding:16px 12px 14px;color:#f3e6c4}",
    ".cz-bar-h{text-align:center;margin-bottom:12px}.cz-bar-t{font-family:Cinzel,Georgia,serif;font-weight:700;font-size:22px;letter-spacing:.16em;text-transform:uppercase}",
    ".cz-bar-s{font-family:Cinzel,Georgia,serif;font-size:10px;letter-spacing:.32em;color:#d9b86a;text-transform:uppercase;margin-top:4px}",
    ".cz-buzz{margin:0 4px 14px}.cz-buzz-r{display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px}.cz-buzz-r span{font-family:Cinzel,Georgia,serif;font-weight:700;letter-spacing:.1em;color:#d9b86a}",
    ".cz-buzz-m{height:6px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden}.cz-buzz-m i{display:block;height:100%;background:linear-gradient(90deg,#d9b86a,#c0213f);border-radius:3px;transition:width .4s}",
    ".cz-drinks{display:flex;flex-direction:column;gap:8px}",
    ".cz-drink{display:flex;align-items:center;gap:10px;padding:10px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(217,184,106,.25);box-shadow:inset 3px 0 0 var(--tint)}",
    ".cz-dk-i{font-size:28px;width:36px;text-align:center}.cz-dk-b{flex:1;min-width:0}.cz-dk-n{font-family:Cinzel,Georgia,serif;font-weight:700;font-size:14px;letter-spacing:.04em}",
    ".cz-dk-d{font-size:12px;opacity:.7;margin-top:1px}.cz-dk-s{font-size:11px;color:#d9b86a;margin-top:3px;letter-spacing:.05em}",
    ".cz-dk-o{border:1px solid #d9b86a;background:linear-gradient(180deg,#3a2a10,#24190a);color:#ffe08a;border-radius:10px;padding:9px 10px;font:inherit;font-weight:800;font-size:13px;white-space:nowrap}",
    ".cz-dk-o:disabled{opacity:.35}",
    ".cz-bar-n{font-size:11px;opacity:.6;text-align:center;margin-top:12px;line-height:1.4}",
    ".cz-pano{display:flex;width:400%;transition:transform " + TURN_MS + "ms cubic-bezier(.2,.8,.2,1)}",
    ".cz-pv{width:25%;flex:none}",
    ".cz-pv .cz-roomsvg{box-shadow:none;border-radius:0}",
    ".cz-turn{position:absolute;top:34%;transform:translateY(-50%);width:40px;height:64px;border:0;border-radius:12px;background:rgba(10,0,20,.55);color:#fff;font:inherit;font-size:28px;font-weight:900;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 1.5px rgba(255,214,107,.6);z-index:2}",
    ".cz-turn.l{left:6px}.cz-turn.r{right:6px}.cz-turn:disabled{opacity:0;pointer-events:none}",
    ".cz-look{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);display:flex;gap:6px;align-items:center;padding:6px 10px;border-radius:999px;background:rgba(10,0,20,.62);color:#fff;font-size:12px;font-weight:800;white-space:nowrap;z-index:2}",
    ".cz-look i{width:7px;height:7px;border-radius:50%;background:#fff;opacity:.35;display:inline-block}.cz-look i.on{opacity:1;background:#ffd66b}",
    ".cz-roomsvg{width:100%;height:auto;max-width:100%;margin:0 auto;display:block;border-radius:14px;box-shadow:0 0 0 2px #7a5513,0 6px 24px rgba(0,0,0,.5);-webkit-tap-highlight-color:transparent}",
    ".cz-spot{cursor:pointer;outline:none}",
    ".cz-spot:focus-visible{outline:2px solid #ffe08a}",
    ".cz-vis:not(.can){opacity:.62}",
    ".cz-vis.can .cz-glow{opacity:.4;animation:cz-breathe 3.4s ease-in-out infinite}",
    ".cz-glow{opacity:0}",
    ".cz-spot.can .cz-glow{opacity:.4;animation:cz-breathe 3.4s ease-in-out infinite}",
    "@keyframes cz-breathe{0%,100%{opacity:.18}50%{opacity:.55}}",
    ".cz-neon{animation:cz-flick 6s linear infinite}",
    "@keyframes cz-flick{0%,88%,100%{opacity:1}89%{opacity:.6}90%{opacity:1}91.5%{opacity:.75}93%{opacity:1}}",
    ".cz-bulb{fill:#ffd96a;animation:cz-chase 1.2s linear infinite}",
    "@keyframes cz-chase{0%,100%{opacity:.25}20%{opacity:1}50%{opacity:.25}}",
    ".cz-sp{transform-box:fill-box;transform-origin:center;opacity:0;animation:cz-twinkle 7s ease-in-out infinite}",
    "@keyframes cz-twinkle{0%,70%,100%{opacity:0;transform:scale(.3)}80%{opacity:.9;transform:scale(1)}90%{opacity:0;transform:scale(.5)}}",
    ".cz-drift{opacity:0;animation:cz-drift 13s ease-in-out infinite}",
    "@keyframes cz-drift{0%{opacity:0;transform:translateY(0)}10%,60%{opacity:.9}100%{opacity:0;transform:translateY(-46px)}}",
    // patrons at the tables: a gentle bob, a hand that reaches for the table now and then
    ".cz-pp{transform-box:fill-box;transform-origin:50% 100%;animation:cz-bob 3.2s ease-in-out infinite}",
    "@keyframes cz-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.3px)}}",
    ".cz-hd{transform-box:fill-box;transform-origin:50% 100%;animation:cz-look 7s ease-in-out infinite}",
    "@keyframes cz-look{0%,40%,100%{transform:rotate(0)}48%,62%{transform:rotate(-9deg)}70%,88%{transform:rotate(7deg)}}",
    ".cz-hand{transform-box:fill-box;animation:cz-reach 5s ease-in-out infinite}",
    "@keyframes cz-reach{0%,55%,100%{transform:translate(0,0)}65%,80%{transform:translate(var(--rx,3px),-9px)}}",
    // blurred, living casino behind a game
    ".cz-bg{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;opacity:0;transition:opacity .5s;background:#3b0812}",
    ".cz-bg.on{opacity:1}",
    ".cz-bg svg{width:100%;height:100%;display:block;filter:blur(6px) brightness(.6) saturate(1.15);transform:scale(1.06)}",
    ".cz-bg .cz-glow{opacity:.35}",
    "@media (prefers-reduced-motion:reduce){.cz-pp,.cz-hd,.cz-hand{animation:none}}",
    // first-person floor: lights, beams, wins, confetti
    ".cz-bulb2{animation:cz-chase 2.4s linear infinite}",
    ".cz-bok{animation:cz-bokp 2.6s ease-in-out infinite}@keyframes cz-bokp{0%,100%{opacity:.35}50%{opacity:.95}}",
    ".cz-beam{animation:cz-sweep 9s ease-in-out infinite;mix-blend-mode:screen}@keyframes cz-sweep{0%,100%{transform:rotate(-16deg)}50%{transform:rotate(16deg)}}",
    ".cz-top{animation:cz-topp 1.6s ease-in-out infinite}@keyframes cz-topp{0%,100%{opacity:.55}50%{opacity:1}}",
    ".cz-scr{opacity:0;animation:cz-scrf 6s steps(1) infinite}@keyframes cz-scrf{0%,8%,16%,24%{opacity:.85}4%,12%,20%,28%,100%{opacity:0}}",
    ".cz-burst{transform-box:fill-box;transform-origin:center;opacity:0;animation:cz-burstp 6.5s ease-out infinite}@keyframes cz-burstp{0%{opacity:0;transform:scale(.2) rotate(0)}4%{opacity:1;transform:scale(1.1) rotate(10deg)}14%{opacity:1;transform:scale(1) rotate(25deg)}20%,100%{opacity:0;transform:scale(1.25) rotate(40deg)}}",
    ".cz-coin{opacity:0;animation:cz-coinp 6.5s ease-out infinite}@keyframes cz-coinp{0%{opacity:0;transform:translate(0,0)}3%{opacity:1}16%{opacity:1;transform:translate(var(--dx),-34px)}24%,100%{opacity:0;transform:translate(calc(var(--dx) * 1.4),10px)}}",
    ".cz-conf{animation:cz-confp 8s linear infinite}@keyframes cz-confp{0%{transform:translate(0,0) rotate(0)}100%{transform:translate(18px,720px) rotate(720deg)}}",
    ".cz-flk{animation:cz-flick 5s infinite}",
    ".cz-far *{animation:none!important}",
    ".cz-spin2{transform-box:fill-box;transform-origin:center;animation:cz-rot 6s linear infinite}",
    ".cz-dice{animation:cz-diceh 3.5s ease-in-out infinite}@keyframes cz-diceh{0%,70%,100%{transform:translateY(0)}80%{transform:translateY(-3px)}}",
    "@media (prefers-reduced-motion:reduce){.cz-beam,.cz-conf,.cz-burst,.cz-coin,.cz-scr,.cz-bok,.cz-bulb2,.cz-dice{animation:none}.cz-burst,.cz-coin{opacity:0}}",
    ".cz-spin{transform-box:fill-box;transform-origin:center;animation:cz-rot 40s linear infinite}",
    "@keyframes cz-rot{to{transform:rotate(360deg)}}",
    // game shell
    ".cz-game{background:radial-gradient(120% 90% at 50% 0%,#3a2012,#1b0e07);border:2px solid #7a5513;border-radius:18px;padding:10px;color:#f6eedb}",
    ".cz-game button{background:#2a1a10;color:#f6eedb;border:1px solid #7a5513;border-radius:12px}",
    ".cz-sub{font-size:12px;font-weight:700;color:#d9c79a;text-transform:uppercase;letter-spacing:.06em;margin:8px 0 6px}",
    ".cz-total{font-size:13px;color:#d9c79a}",
    ".cz-msg{border-radius:12px;padding:12px;font-weight:700;text-align:center;margin:10px 0;border:1px solid var(--line);background:var(--bg);color:var(--ink);line-height:1.35}",
    ".cz-msg.win{background:var(--goodbg);border-color:var(--good);color:var(--good)}",
    ".cz-msg.lose{background:var(--badbg);border-color:var(--bad);color:var(--bad)}",
    ".cz-betrow{display:flex;align-items:center;justify-content:center;gap:12px;margin:4px 0 2px}",
    ".cz-betrow .cz-sub{text-align:center;line-height:1.3}.cz-betrow .cz-sub b{font-size:18px;color:#ffe08a}.cz-betrow small{font-size:11px;opacity:.8}",
    ".cz-stack{position:relative;width:46px;height:64px;flex:none;align-self:flex-end}",
    ".cz-stack i{position:absolute;left:0;width:46px;height:15px;border-radius:50%;background:var(--chc);box-shadow:inset 0 0 0 2px rgba(255,255,255,.75),0 2px 0 rgba(0,0,0,.45);animation:cz-drop .25s ease-out both}",
    "@keyframes cz-drop{from{transform:translateY(-14px);opacity:0}to{transform:none;opacity:1}}",
    ".cz-clr{min-height:40px;padding:6px 12px;border-radius:20px;font-size:13px;font-weight:700}",
    ".cz-bets{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;margin:6px 0 10px}",
    ".cz-chb{position:relative;width:54px;height:54px;min-height:54px!important;border-radius:50%!important;padding:0;font-weight:800;font-size:16px;color:#fff!important;border:0!important;background:var(--chc,#2b6cb0)!important;box-shadow:inset 0 0 0 3px var(--chc,#2b6cb0),inset 0 0 0 5px rgba(255,255,255,.9),0 3px 0 rgba(0,0,0,.55);text-shadow:0 1px 2px rgba(0,0,0,.6)}",
    ".cz-chb::after{content:'';position:absolute;inset:7px;border-radius:50%;border:2px dashed rgba(255,255,255,.65);pointer-events:none}",
    ".cz-chb.on{transform:translateY(-4px);box-shadow:inset 0 0 0 3px var(--chc,#2b6cb0),inset 0 0 0 5px #fff,0 0 0 3px #ffe08a,0 0 14px rgba(255,224,138,.8)}",
    ".cz-chb:disabled{opacity:.35;cursor:not-allowed}",
    ".cz-allin{min-width:64px;height:44px;padding:0 12px;font-weight:800;border-radius:99px!important;background:linear-gradient(#f9e08e,#c8962b)!important;color:#3a2408!important;border:2px solid #7a5513!important}",
    ".cz-allin.on{box-shadow:0 0 0 3px #ffe08a,0 0 14px rgba(255,224,138,.8)}",
    ".cz-allin:disabled{opacity:.35}",
    ".d1{--chc:#9a9a9a}.d5{--chc:#c0392b}.d10{--chc:#2b6cb0}.d25{--chc:#1D9E75}.d50{--chc:#7a4fd0}.d100{--chc:#1c1c1c}",
    ".cz-go{width:100%;background:var(--hot)!important;border-color:#fff3!important;color:#fff!important;font-size:19px;font-weight:800;padding:14px;box-shadow:0 3px 0 rgba(0,0,0,.4)}",
    ".cz-go:disabled{opacity:.4}",
    ".cz-row{display:flex;gap:8px;margin-top:8px}",
    ".cz-row button{flex:1;font-weight:800;font-size:16px;padding:12px 6px}",
    ".cz-stand{border-color:var(--pow)!important;color:#7be0bd!important}",
    ".cz-dbl{border-color:var(--root)!important;color:#c0baff!important}",
    ".cz-row button:disabled{opacity:.35}",
    ".cz-broke{text-align:center;padding:18px 8px;color:#d9c79a;font-size:16px;line-height:1.4}",
    // cards
    ".cz-hand{--cw:56px;--ch:78px;position:absolute;left:0;right:0;display:flex;justify-content:center;align-items:center;min-height:var(--ch)}",
    ".cz-hand .cz-c+.cz-c{margin-left:-20px}",
    ".cz-c{width:var(--cw);height:var(--ch);perspective:600px;flex:0 0 auto}",
    ".cz-ci{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .3s ease}",
    ".cz-c.up .cz-ci{transform:rotateY(180deg)}",
    ".cz-c.noanim .cz-ci{transition:none}",
    ".cz-cb,.cz-cf{position:absolute;inset:0;border-radius:8px;backface-visibility:hidden;-webkit-backface-visibility:hidden;box-shadow:0 2px 5px rgba(0,0,0,.45)}",
    ".cz-cb{background:repeating-linear-gradient(45deg,#7a1020 0 5px,#a01c34 5px 10px);border:3px solid #fff}",
    ".cz-cf{transform:rotateY(180deg);background:#fff;color:#1d1d1b;border:1px solid #cfcdc4}",
    ".cz-c.red .cz-cf{color:#c0392b}",
    ".cz-val{position:absolute;right:4px;top:4px;padding:1px 6px;border-radius:8px;background:#1d1d1b;color:#fff;font-weight:800;font-size:calc(var(--cw)*.2);line-height:1.3;white-space:nowrap}",
    ".cz-cr{position:absolute;left:5px;top:3px;font-weight:800;font-size:calc(var(--cw)*.32);line-height:1}",
    ".cz-cs{position:absolute;left:5px;top:calc(var(--cw)*.36);font-size:calc(var(--cw)*.24);line-height:1}",
    ".cz-cm{position:absolute;right:calc(var(--cw)*.1);bottom:calc(var(--cw)*.06);font-size:calc(var(--cw)*.55);line-height:1}",
    "@keyframes cz-slide{0%{transform:translate(var(--dx),var(--dy)) rotate(-14deg) scale(.7);opacity:0}15%{opacity:1}100%{transform:none;opacity:1}}",
    // chips on the table
    ".cz-stack{position:relative;width:34px;flex:0 0 34px}",
    ".cz-stack.ghost{opacity:.55}",
    ".cz-stack b{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(100% + 3px);font-size:11px;color:#fff;white-space:nowrap;text-shadow:0 1px 2px #000}",
    ".cz-ch{position:absolute;left:0;width:34px;height:30px;border-radius:50%;background:var(--chc);box-shadow:inset 0 0 0 3px var(--chc),inset 0 0 0 5px rgba(255,255,255,.9),0 3px 0 rgba(0,0,0,.55)}",
    ".cz-ch::after{content:'';position:absolute;inset:5px 5px;border-radius:50%;border:2px dashed rgba(255,255,255,.6)}",
    ".cz-stack.toyou{animation:cz-toyou .75s ease-in both}@keyframes cz-toyou{to{transform:translateY(150px) scale(.85);opacity:0}}",
    ".cz-stack.tolose{animation:cz-tolose .75s ease-in both}@keyframes cz-tolose{to{transform:translateY(-190px) scale(.85);opacity:0}}",
    ".cz-stack.pop{animation:cz-popin .3s ease-out both}@keyframes cz-popin{from{transform:scale(.3);opacity:0}to{transform:none;opacity:1}}",
    // blackjack
    ".cz-bjt{position:relative;height:350px;max-width:358px;margin:0 auto}",
    ".cz-bjt>svg{position:absolute;inset:0;width:100%;height:100%}",
    ".cz-lbl{position:absolute;font-size:12px;font-weight:800;letter-spacing:.08em;color:#d6f0de;text-shadow:0 1px 2px #000;z-index:2}",
    ".cz-lbl-d{left:24px;top:24px}.cz-lbl-p{left:50%;transform:translateX(-50%);bottom:2px}",
    ".cz-hand-d{top:38px}.cz-hand-p{top:238px}",
    ".cz-betbox{position:absolute;left:0;right:0;top:168px;height:66px;display:flex;justify-content:center;align-items:flex-end;gap:10px;padding-bottom:7px;pointer-events:none}",
    ".cz-shoe{position:absolute;top:30px;right:26px;width:46px;height:60px;border-radius:6px 6px 14px 6px;background:linear-gradient(135deg,#111,#4a4a4a);border:2px solid #b98a24;transform:skewY(-6deg);box-shadow:0 3px 6px rgba(0,0,0,.6);z-index:1}",
    ".cz-shoe i{position:absolute;left:6px;right:6px;height:3px;background:#fff;opacity:.85;border-radius:2px}.cz-shoe i:nth-child(1){top:9px}.cz-shoe i:nth-child(2){top:15px}.cz-shoe i:nth-child(3){top:21px}",
    // roulette
    ".cz-wbox{position:relative;width:236px;height:236px;margin:2px auto 6px}",
    ".cz-wbox>svg,.cz-wheel svg{position:absolute;inset:0;width:100%;height:100%}",
    ".cz-wheel{position:absolute;inset:0}",
    ".cz-arm{position:absolute;inset:0;pointer-events:none}",
    ".cz-ball{position:absolute;left:50%;width:11px;height:11px;margin-left:-5.5px;margin-top:-5.5px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#d8d8d8 60%,#8a8a8a);box-shadow:0 1px 3px rgba(0,0,0,.7)}",
    ".cz-ball.jig{animation:cz-jig .45s ease-out}@keyframes cz-jig{0%{transform:translate(0,-5px)}35%{transform:translate(2px,2px)}65%{transform:translate(-1px,-1px)}100%{transform:none}}",
    ".cz-board{display:flex;gap:5px;align-items:center;justify-content:center;flex-wrap:wrap;min-height:34px;background:#0c0707;border:2px solid #7a5513;border-radius:10px;padding:4px 8px;margin-bottom:4px;font-size:13px;font-weight:700;color:#ffd96a}",
    ".cz-nc{display:inline-block;min-width:26px;padding:3px 5px;border-radius:7px;color:#fff;font-size:14px;font-weight:800;text-align:center}",
    ".cz-numchip{display:inline-block;min-width:34px;padding:3px 8px;border-radius:8px;color:#fff;font-size:18px;font-weight:800;margin-left:6px;text-align:center}",
    ".red.cz-nc,.red.cz-numchip,.cz-num.red{background:#b3141f}.black.cz-nc,.black.cz-numchip,.cz-num.black{background:#141414}.green.cz-nc,.green.cz-numchip,.cz-num.green{background:#0b7a48}",
    ".cz-lay{background:radial-gradient(#22995a,#0d5a31);border:3px solid #5a3218;border-radius:12px;padding:8px;box-shadow:inset 0 0 0 1px #e8c05a66}",
    ".cz-sel4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-bottom:6px}",
    ".cz-lay button{position:relative;font-weight:800;color:#fff;border:2px solid rgba(255,255,255,.45)!important;padding:0;min-height:44px;font-size:15px}",
    ".cz-sel4 button{background:rgba(0,0,0,.28)!important;font-size:14px}",
    ".cz-sel4 button.red{background:#b3141f!important}.cz-sel4 button.black{background:#141414!important}",
    ".cz-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:4px}",
    ".cz-zero{grid-column:1/-1}",
    ".cz-num{border-radius:8px!important}",
    ".cz-lay button:disabled{opacity:.7}",
    ".cz-on{border-color:#ffe08a!important;box-shadow:0 0 0 2px #ffe08a,0 0 10px rgba(255,224,138,.7)}",
    ".cz-hit{animation:cz-hit .6s ease-in-out 4 alternate}@keyframes cz-hit{from{box-shadow:0 0 0 0 #ffe08a}to{box-shadow:0 0 0 4px #ffe08a,0 0 16px #ffd54a}}",
    ".cz-plc{position:absolute;left:50%;top:50%;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;background:var(--chc);box-shadow:inset 0 0 0 2px var(--chc),inset 0 0 0 4px rgba(255,255,255,.92),0 2px 3px rgba(0,0,0,.6);font-style:normal;font-size:10px;font-weight:800;line-height:28px;text-align:center;color:#fff;pointer-events:none}",
    // slots
    ".cz-slm{position:relative;max-width:340px;margin:0 auto;background:linear-gradient(180deg,#d8283f,#8a0f22 60%,#6a0a19);border:3px solid #e8c05a;border-radius:22px 22px 14px 14px;padding:10px 12px 12px;box-shadow:0 0 0 3px #7a5513,0 8px 20px rgba(0,0,0,.5);overflow:hidden}",
    ".cz-bulbs{display:flex;justify-content:space-between;padding:0 4px;margin-bottom:6px}",
    ".cz-bulbs i{width:10px;height:10px;border-radius:50%;background:#ffd96a;box-shadow:0 0 6px #ffd96a;animation:cz-chase 1.2s linear infinite}",
    ".cz-slm.spinning .cz-bulbs i,.cz-slm.win .cz-bulbs i{animation-duration:.5s}",
    ".cz-slt{text-align:center;font-weight:900;letter-spacing:.18em;font-size:17px;color:#ffe9a0;text-shadow:0 0 8px #ff9a3c;margin-bottom:8px}",
    ".cz-slb{display:flex;gap:6px;align-items:center}",
    ".cz-wnd{position:relative;display:flex;gap:4px;flex:1;background:#0d0606;border:3px solid #e8c05a;border-radius:10px;padding:3px}",
    ".cz-reel{flex:1;height:186px;overflow:hidden;background:linear-gradient(90deg,#d9d2bd,#fffdf3 18%,#fffdf3 82%,#d9d2bd);border-radius:6px;position:relative}",
    ".cz-reel::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.5),transparent 30%,transparent 70%,rgba(0,0,0,.5));pointer-events:none}",
    ".cz-rs{display:flex;flex-direction:column}",
    ".cz-cell{height:62px;flex:0 0 62px;display:flex;align-items:center;justify-content:center;font-size:38px;line-height:1}",
    ".cz-rs.spin{animation:cz-roll .45s linear infinite;filter:blur(1.6px)}",
    "@keyframes cz-roll{from{transform:translateY(0)}to{transform:translateY(-50%)}}",
    ".cz-rs.land{animation:cz-land .3s ease-out}@keyframes cz-land{from{transform:translateY(-34px)}60%{transform:translateY(6px)}to{transform:none}}",
    ".cz-payline{position:absolute;left:3px;right:3px;top:50%;height:3px;margin-top:-1.5px;background:#ff3b3b;opacity:.6;box-shadow:0 0 6px #ff3b3b;pointer-events:none;z-index:2}",
    ".cz-slm.win .cz-payline{animation:cz-pl .5s ease-in-out 6 alternate}@keyframes cz-pl{from{opacity:.3}to{opacity:1;background:#ffe27a;box-shadow:0 0 14px #ffd54a}}",
    ".cz-slm.win .cz-reel.hit .cz-cell.mid{background:rgba(255,213,74,.4);animation:cz-hitc .5s ease-in-out 6 alternate}@keyframes cz-hitc{from{background:rgba(255,213,74,.15)}to{background:rgba(255,213,74,.55)}}",
    ".cz-lv{position:relative;width:44px;flex:0 0 44px;height:150px;touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none}",
    ".cz-lvbase{position:absolute;bottom:0;left:6px;width:32px;height:22px;border-radius:6px;background:linear-gradient(#bbb,#555);border:2px solid #333}",
    ".cz-lvs{position:absolute;left:50%;margin-left:-4px;bottom:18px;width:8px;border-radius:4px;background:linear-gradient(90deg,#bbb,#fff,#999);height:84px;transition:height .3s ease}",
    ".cz-lvb{position:absolute;left:50%;margin-left:-16px;width:32px;height:32px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ff9a9a,#d01c1c 55%,#7a0a0a);bottom:86px;transition:bottom .3s ease;box-shadow:0 3px 6px rgba(0,0,0,.5)}",
    ".cz-lv.drag .cz-lvs,.cz-lv.drag .cz-lvb{transition:none}",
    ".cz-pour{position:absolute;inset:0;overflow:hidden;pointer-events:none}",
    ".cz-cn{position:absolute;top:-26px;width:20px;height:20px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff4b0,#f0b72c 55%,#a8730f);border:2px solid #8a5d0a;animation:cz-fall 1.6s cubic-bezier(.45,.05,.85,.5) both}",
    "@keyframes cz-fall{from{transform:translateY(0) rotateY(0)}to{transform:translateY(var(--fy,380px)) rotateY(540deg)}}",
    ".cz-pay{display:flex;flex-wrap:wrap;gap:4px 12px;justify-content:center;font-size:12px;color:#d9c79a;margin-top:6px}",
    // higher/lower
    ".cz-hlt{position:relative;background:radial-gradient(120% 100% at 50% 20%,#1f7a8c,#0c3a47);border:6px solid #5a3218;border-radius:22px;padding:10px 10px 12px;box-shadow:inset 0 0 0 2px #e8c05a88}",
    ".cz-hlplate{width:150px;margin:0 auto 8px;text-align:center;font-weight:800;font-size:12px;letter-spacing:.14em;color:#3a2408;background:linear-gradient(#f9e08e,#b98a24);border:1px solid #6b4a10;border-radius:6px;padding:3px 0}",
    ".cz-hlrow{display:flex;justify-content:center;gap:14px}",
    ".cz-slot{display:flex;flex-direction:column;align-items:center;gap:4px}",
    ".cz-slot small{font-size:10px;font-weight:800;letter-spacing:.1em;color:#cfeaf0}",
    ".cz-cw{--cw:80px;--ch:112px;width:var(--cw);height:var(--ch);border-radius:9px;position:relative}",
    ".cz-cw.empty{border:2px dashed rgba(255,255,255,.35)}",
    ".cz-cw.slide .cz-c{animation:cz-hlin .4s ease-out both}@keyframes cz-hlin{from{transform:translateX(70px) rotate(8deg);opacity:0}to{transform:none;opacity:1}}",
    ".cz-pile{position:relative;--cw:80px;--ch:112px;width:var(--cw);height:var(--ch)}",
    ".cz-pile i{position:absolute;inset:0;border-radius:9px;background:repeating-linear-gradient(45deg,#7a1020 0 5px,#a01c34 5px 10px);border:3px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,.5)}",
    ".cz-pile i:nth-child(1){transform:translate(-3px,3px)}.cz-pile i:nth-child(2){transform:translate(-1.5px,1.5px)}",
    ".cz-hlmult{text-align:center;font-weight:900;font-size:28px;line-height:1.1;color:#ffe08a;text-shadow:0 2px 0 rgba(0,0,0,.45);margin:10px 0 2px;min-height:32px}",
    ".cz-hlhint{text-align:center;font-size:11px;font-weight:700;color:#cfeaf0;min-height:15px}",
    ".cz-hlsame{display:block;width:100%;margin-top:8px;padding:10px;border-radius:14px;border:2px solid #e9c25a;background:linear-gradient(#3a2a10,#24190a);color:#ffd66b;font:inherit;font-size:17px;font-weight:800}.cz-hlsame:disabled{opacity:.45}",
    ".cz-hlbtn small{display:block;font-size:13px;font-weight:800;opacity:.95;margin-top:1px}",
    // video poker
    ".cz-vpm{background:linear-gradient(180deg,#2c49a8,#101c4a);border:3px solid #e8c05a;border-radius:16px;padding:10px 8px 8px;box-shadow:0 0 0 3px #7a5513,0 8px 20px rgba(0,0,0,.5)}",
    ".cz-vpt{text-align:center;font-weight:900;letter-spacing:.14em;font-size:14px;color:#ffe9a0;text-shadow:0 0 8px #ff9a3c}",
    ".cz-vpp{display:grid;grid-auto-flow:column;grid-template-rows:repeat(5,auto);gap:1px 14px;font-size:12px;font-weight:700;background:#0a1233;border:2px solid #e8c05a88;border-radius:8px;padding:6px 8px;margin:8px 0 14px}",
    ".cz-vpp div{display:flex;justify-content:space-between;gap:6px;color:#9fb4ff;padding:1px 5px;border-radius:5px;white-space:nowrap}",
    ".cz-vpp div b{color:#ffe08a}",
    ".cz-vpp div.lit{background:linear-gradient(#ffe48a,#d9a62e);color:#3a2408;animation:cz-vlit .5s ease-in-out 6 alternate}.cz-vpp div.lit b{color:#3a2408}",
    "@keyframes cz-vlit{from{box-shadow:0 0 0 0 #ffe08a}to{box-shadow:0 0 12px 2px #ffd54a}}",
    ".cz-vph{display:flex;justify-content:center;gap:6px;padding-bottom:32px}",
    ".cz-vps{position:relative;width:56px;height:80px;cursor:pointer;-webkit-tap-highlight-color:transparent;outline:none}",
    ".cz-vps .cz-c{--cw:56px;--ch:80px;transition:transform .15s}",
    ".cz-vps.held .cz-c{transform:translateY(-8px)}",
    ".cz-vps.held .cz-cf{box-shadow:0 0 0 3px #ffe08a,0 0 12px rgba(255,224,138,.8)}",
    ".cz-held{display:none;position:absolute;left:0;right:0;bottom:-20px;text-align:center;font-style:normal;font-weight:900;font-size:11px;letter-spacing:.12em;color:#3a2408;background:linear-gradient(#f9e08e,#c8962b);border-radius:5px;padding:1px 0}",
    ".cz-vps.held .cz-held{display:block}",
    ".cz-dealin{animation:cz-vpin .28s ease-out both}@keyframes cz-vpin{from{transform:translateY(-26px) rotate(-6deg);opacity:0}to{transform:none;opacity:1}}",
    ".cz-vpbet{text-align:center;font-weight:800;font-size:12px;letter-spacing:.1em;color:#ffe9a0;margin-top:-4px}",
    // baccarat
    ".cz-bat{position:relative;background:radial-gradient(120% 100% at 50% 20%,#22995a,#0b4b2a);border:6px solid #5a3218;border-radius:22px;padding:34px 6px 12px;box-shadow:inset 0 0 0 2px #e8c05a88}",
    ".cz-bashoe{top:6px;right:auto;left:50%;margin-left:-23px;width:46px;height:44px}",
    ".cz-bacols{display:flex;gap:4px}",
    ".cz-bacol{flex:1;text-align:center;border:2px solid #e8c05a55;border-radius:12px;padding:6px 2px 8px;background:rgba(0,0,0,.14)}",
    ".cz-balbl{font-size:12px;font-weight:800;letter-spacing:.08em;color:#d6f0de;text-shadow:0 1px 2px #000;margin-bottom:6px}",
    ".cz-balbl.win{color:#3a2408;background:linear-gradient(#f9e08e,#c8962b);border-radius:6px;text-shadow:none;animation:cz-vlit .5s ease-in-out 6 alternate}",
    ".cz-bah{--cw:46px;--ch:64px;display:flex;justify-content:center;align-items:center;min-height:64px}",
    ".cz-bah .cz-c+.cz-c{margin-left:-12px}",
    ".cz-bz{display:grid;grid-template-columns:1fr .8fr 1fr;gap:6px;margin:10px 0 4px}",
    ".cz-bz button{position:relative;min-height:56px;font-weight:800;font-size:15px;color:#fff!important;border:2px solid rgba(255,255,255,.45)!important;padding:4px}",
    ".cz-bz button small{display:block;font-size:11px;font-weight:700;opacity:.85}",
    ".cz-bz .bp{background:#1d4f9a!important}.cz-bz .bt{background:#0b7a48!important}.cz-bz .bb{background:#b3141f!important}",
    ".cz-bz button:disabled{opacity:.6}",
    ".cz-dot{display:inline-block;width:20px;height:20px;border-radius:50%;color:#fff;font-size:11px;font-weight:800;line-height:20px;text-align:center}",
    ".cz-dot.p{background:#1d4f9a}.cz-dot.b{background:#b3141f}.cz-dot.t{background:#0b7a48}",
    // craps
    ".cz-crt{position:relative;background:radial-gradient(120% 100% at 50% 20%,#22995a,#0b4b2a);border:6px solid #5a3218;border-radius:22px;padding:10px 8px 12px;box-shadow:inset 0 0 0 2px #e8c05a88;overflow:hidden}",
    ".cz-dice{display:flex;justify-content:center;gap:24px;margin:8px 0 6px;min-height:76px;align-items:center}",
    ".cz-die{width:68px;height:68px;border-radius:13px;background:linear-gradient(145deg,#e0343e,#a1161f);box-shadow:inset 0 -4px 0 rgba(0,0,0,.25),inset 0 2px 0 rgba(255,255,255,.35),0 5px 9px rgba(0,0,0,.55);display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr);padding:10px;gap:1px}",
    ".cz-die i{border-radius:50%}.cz-die i.on{background:#fff;box-shadow:inset 0 -1px 1px rgba(0,0,0,.25)}",
    ".cz-die.roll{animation:cz-tumble .42s linear infinite}",
    "@keyframes cz-tumble{0%{transform:translateY(0) rotate(0)}25%{transform:translateY(-16px) rotate(95deg) scale(1.06)}50%{transform:translateY(0) rotate(185deg)}75%{transform:translateY(-9px) rotate(275deg) scale(1.03)}100%{transform:translateY(0) rotate(360deg)}}",
    ".cz-crtot{text-align:center;font-weight:900;font-size:18px;color:#ffe08a;min-height:24px;text-shadow:0 2px 0 rgba(0,0,0,.4)}",
    ".cz-pts{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin:8px 0}",
    ".cz-pts>div{position:relative;height:48px;display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,.45);border-radius:7px;color:#fff;font-weight:900;font-size:17px;background:rgba(0,0,0,.2)}",
    ".cz-pts>div.on{border-color:#ffe08a;box-shadow:0 0 0 2px #ffe08a,0 0 12px rgba(255,224,138,.7)}",
    ".cz-puck{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:#fff;color:#111;border:3px solid #111;box-shadow:0 3px 6px rgba(0,0,0,.6);font-weight:900;font-size:12px;display:flex;align-items:center;justify-content:center;animation:cz-popin .3s ease-out both}",
    ".cz-pass{display:flex;align-items:flex-end;justify-content:center;gap:14px;min-height:70px;border:2px solid #f0cf74;border-radius:10px;padding:6px 8px;color:#f0cf74;font-weight:900;letter-spacing:.2em;font-size:13px}",
    ".cz-pass span{align-self:center}",
    ".cz-stack.ghost{opacity:.55}",
    ".cz-pot{text-align:center;font-weight:800;font-size:16px;min-height:22px;color:#fff}",
    // ---- art-deco polish layer (visual only; later rules refine the ones above) ----
    ".cz-game{--cz-gold:#d9b86a;--cz-champ:#f3e6c4;--cz-felt:radial-gradient(130% 110% at 50% 40%,transparent 50%,rgba(0,0,0,.5)) padding-box,radial-gradient(rgba(255,255,255,.055) 1px,transparent 1.3px) 0 0/4px 4px padding-box,radial-gradient(rgba(0,0,0,.1) 1px,transparent 1.3px) 2px 2px/4px 4px padding-box}",
    ".cz-game{background:radial-gradient(72% 32% at 50% 0,rgba(255,226,150,.2),transparent 72%),radial-gradient(120% 90% at 50% 0,#3d2213,#1b0e07 75%);border:2px solid #7a5513;box-shadow:0 0 0 1px rgba(232,192,90,.5),0 0 0 2px #4a300c,0 10px 26px rgba(0,0,0,.55),inset 0 0 0 1px rgba(232,192,90,.28),inset 0 0 36px rgba(0,0,0,.55)}",
    ".cz-game button{background:linear-gradient(180deg,#3b2717,#1f130b);box-shadow:inset 0 1px 0 rgba(255,235,180,.22),0 2px 0 rgba(0,0,0,.4)}",
    ".cz-sub{font-family:Cinzel,Georgia,serif;letter-spacing:.1em}",
    // look left / right arrows: brass art-deco plates with a soft neon edge
    ".cz-turn{width:46px;height:68px;padding:0;overflow:hidden;border:2px solid transparent;border-radius:14px;color:#ffe08a;-webkit-tap-highlight-color:transparent;background:linear-gradient(180deg,#2e180a,#12050b 55%,#220c12) padding-box,linear-gradient(160deg,#fff3c2,#e8c05a 28%,#8a5d0a 52%,#f3d37a 78%,#a97a1c) border-box;box-shadow:0 0 0 1px rgba(7,3,12,.85),0 0 9px rgba(255,200,90,.5),0 0 20px rgba(255,60,160,.3),0 4px 8px rgba(0,0,0,.55),inset 0 0 9px rgba(232,192,90,.32);transition:transform .12s ease,box-shadow .12s ease}",
    ".cz-turn::before{content:'';position:absolute;inset:3px;border:1px solid rgba(217,184,106,.6);border-radius:10px;pointer-events:none}",
    ".cz-turn::after{content:'';position:absolute;top:-12%;bottom:-12%;left:0;width:42%;background:linear-gradient(100deg,transparent,rgba(255,244,200,.6),transparent);transform:translateX(-170%) skewX(-18deg);animation:cz-tshine 5.6s ease-in-out infinite;pointer-events:none}",
    ".cz-turn.r::after{animation-delay:2.8s}",
    "@keyframes cz-tshine{0%,62%{transform:translateX(-170%) skewX(-18deg)}100%{transform:translateX(340%) skewX(-18deg)}}",
    ".cz-turn>span{position:relative;z-index:1;filter:none}",
    ".cz-turn:active{transform:translateY(-50%) scale(.92);box-shadow:0 0 0 1px rgba(7,3,12,.85),0 0 5px rgba(255,200,90,.4),0 1px 3px rgba(0,0,0,.6),inset 0 4px 9px rgba(0,0,0,.75),inset 0 0 12px rgba(232,192,90,.45);background:linear-gradient(180deg,#120804,#2a1608 60%,#12050b) padding-box,linear-gradient(160deg,#a97a1c,#f3d37a 40%,#8a5d0a 70%,#e8c05a) border-box}",
    ".cz-look{padding:6px 13px;border:1px solid rgba(217,184,106,.75);background:linear-gradient(180deg,rgba(40,18,8,.88),rgba(10,0,20,.82));color:var(--cz-champ,#f3e6c4);font-family:Cinzel,Georgia,serif;font-weight:700;letter-spacing:.05em;box-shadow:0 0 0 1px rgba(7,3,12,.7),0 0 12px rgba(255,200,90,.28),0 0 18px rgba(255,60,160,.16),0 3px 8px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,235,180,.25)}",
    ".cz-look i{width:6px;height:6px;border-radius:0;transform:rotate(45deg);background:#d9b86a;opacity:.38;margin:0 1px}",
    ".cz-look i.on{opacity:1;background:#ffe08a;box-shadow:0 0 6px rgba(255,224,138,.9)}",
    // cards: paper face, framed back, soft shadow
    ".cz-cb,.cz-cf{border-radius:8px;box-shadow:0 2px 3px rgba(0,0,0,.5),0 6px 10px rgba(0,0,0,.28)}",
    ".cz-cf{background:linear-gradient(160deg,#ffffff,#f6f1e4 60%,#e9e2d0);border:1px solid #c9c4b4}",
    ".cz-cf::before{content:'';position:absolute;inset:2px;border:1px solid rgba(0,0,0,.09);border-radius:6px;pointer-events:none}",
    ".cz-cb,.cz-pile i{background:radial-gradient(circle at 50% 50%,#f0cf74 0 4px,#7a1020 5px 8px,transparent 9px),repeating-linear-gradient(45deg,rgba(255,255,255,.16) 0 1px,transparent 1px 7px),repeating-linear-gradient(-45deg,rgba(255,255,255,.16) 0 1px,transparent 1px 7px),linear-gradient(145deg,#b3223c,#6a0c1c);border:3px solid #fbf7ec}",
    ".cz-cb::before,.cz-pile i::before{content:'';position:absolute;inset:2px;border:1px solid rgba(240,207,116,.9);border-radius:5px;pointer-events:none}",
    ".cz-pile i{box-shadow:0 2px 3px rgba(0,0,0,.55),0 5px 8px rgba(0,0,0,.3)}",
    ".cz-vps.held .cz-cf{box-shadow:0 0 0 3px #ffe08a,0 0 12px rgba(255,224,138,.8),0 6px 10px rgba(0,0,0,.3)}",
    // chips: edge stripes, inner ring, gloss, shadow
    ".cz-chb,.cz-ch,.cz-stack i,.cz-plc{background:radial-gradient(circle at 34% 26%,rgba(255,255,255,.4),transparent 42%),radial-gradient(ellipse closest-side,var(--chc) 0 76%,rgba(255,255,255,.92) 77% 83%,transparent 84%),repeating-conic-gradient(#fff 0 11deg,var(--chc) 11deg 30deg)}",
    ".cz-chb{background:radial-gradient(circle at 34% 26%,rgba(255,255,255,.4),transparent 42%),radial-gradient(ellipse closest-side,var(--chc) 0 76%,rgba(255,255,255,.92) 77% 83%,transparent 84%),repeating-conic-gradient(#fff 0 11deg,var(--chc) 11deg 30deg)!important;box-shadow:0 3px 0 rgba(0,0,0,.6),0 6px 8px rgba(0,0,0,.45),inset 0 -3px 4px rgba(0,0,0,.35),inset 0 1px 1px rgba(255,255,255,.55)}",
    ".cz-chb.on{box-shadow:0 0 0 3px #ffe08a,0 0 14px rgba(255,224,138,.8),0 7px 8px rgba(0,0,0,.45),inset 0 -3px 4px rgba(0,0,0,.35),inset 0 1px 1px rgba(255,255,255,.55)}",
    ".cz-ch,.cz-stack i{box-shadow:0 3px 0 rgba(0,0,0,.6),0 5px 6px rgba(0,0,0,.35),inset 0 -2px 3px rgba(0,0,0,.3)}",
    ".cz-plc{box-shadow:0 2px 3px rgba(0,0,0,.65),inset 0 -2px 3px rgba(0,0,0,.35),inset 0 1px 1px rgba(255,255,255,.5)}",
    // felt tables: weave texture, vignette, wood rail, light pool
    ".cz-hlt,.cz-bat,.cz-crt,.cz-lay{background:var(--cz-felt),radial-gradient(120% 100% at 50% 20%,var(--fa,#22995a),var(--fb,#0b4b2a)) padding-box,linear-gradient(180deg,#94603a,#52301a 45%,#2a1409) border-box;border:6px solid transparent;box-shadow:0 0 0 1px rgba(232,192,90,.55),0 8px 16px rgba(0,0,0,.5),inset 0 0 0 2px rgba(232,192,90,.5),inset 0 0 0 4px rgba(0,0,0,.25),inset 0 0 36px rgba(0,0,0,.5)}",
    ".cz-hlt{--fa:#1f8a9e;--fb:#0a3340}",
    ".cz-lay{border-width:4px;--fa:#22995a;--fb:#0b4b2a}",
    ".cz-hlt::before,.cz-bat::before,.cz-crt::before{content:'';position:absolute;inset:0;border-radius:16px;pointer-events:none;background:radial-gradient(70% 34% at 50% 0,rgba(255,240,200,.16),transparent 75%)}",
    ".cz-pts>div{background:linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,.12));box-shadow:inset 0 0 0 1px rgba(232,192,90,.35),inset 0 2px 6px rgba(0,0,0,.35);font-family:Cinzel,Georgia,serif}",
    ".cz-pts>div.on{box-shadow:0 0 0 2px #ffe08a,0 0 12px rgba(255,224,138,.7),inset 0 0 0 1px rgba(232,192,90,.35)}",
    ".cz-pass{background:linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.05));box-shadow:inset 0 0 0 1px rgba(232,192,90,.4),0 0 8px rgba(240,207,116,.2);font-family:Cinzel,Georgia,serif}",
    ".cz-bacol{background:linear-gradient(180deg,rgba(0,0,0,.2),rgba(0,0,0,.08));border:2px solid rgba(232,192,90,.45);box-shadow:inset 0 0 0 1px rgba(0,0,0,.25),inset 0 3px 10px rgba(0,0,0,.3)}",
    ".cz-bacol:first-child{background:linear-gradient(180deg,rgba(40,90,200,.2),rgba(0,0,0,.1))}",
    ".cz-bacol:last-child{background:linear-gradient(180deg,rgba(200,30,50,.2),rgba(0,0,0,.1))}",
    ".cz-balbl{font-family:Cinzel,Georgia,serif;font-weight:700}",
    ".cz-lbl{font-family:Cinzel,Georgia,serif;font-weight:700}",
    ".cz-shoe{background:linear-gradient(135deg,#0b0b0b,#555 48%,#1a1a1a);border:2px solid #d9b45a;box-shadow:0 5px 9px rgba(0,0,0,.65),inset 0 1px 0 rgba(255,255,255,.3)}",
    ".cz-board{background:linear-gradient(180deg,#050303,#150b09);border:2px solid #b98a24;box-shadow:inset 0 0 0 1px rgba(0,0,0,.6),inset 0 2px 10px rgba(0,0,0,.8),0 0 8px rgba(232,192,90,.2)}",
    ".cz-hlplate{background:linear-gradient(180deg,#fff0a8,#e1b43c 45%,#a8761a);box-shadow:0 2px 4px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.6);font-family:Cinzel,Georgia,serif}",
    // roulette
    ".cz-lay button{background-image:linear-gradient(180deg,rgba(255,255,255,.16),rgba(0,0,0,.2))!important;background-color:rgba(0,0,0,.28)}",
    ".red.cz-nc,.red.cz-numchip,.cz-num.red{background-color:#b3141f}.cz-num.red{background-color:#c5192a}.cz-num.black{background-color:#1a1a1a}.cz-num.green{background-color:#0b8a50}",
    ".cz-sel4 button.red{background-color:#b3141f!important}.cz-sel4 button.black{background-color:#141414!important}",
    ".cz-nc,.cz-numchip{box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 2px 3px rgba(0,0,0,.5)}",
    ".cz-ball{background:radial-gradient(circle at 32% 28%,#fff 0 18%,#e8e8e8 30%,#9a9a9a 70%,#5a5a5a);box-shadow:0 2px 3px rgba(0,0,0,.75),0 0 5px rgba(255,255,255,.55)}",
    ".cz-sheen{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}",
    ".cz-wbox{filter:none}",
    // slots: chrome cabinet, lit marquee, glass over the reels
    ".cz-slm{border:4px solid transparent;background:linear-gradient(95deg,rgba(255,255,255,.1),transparent 22%,transparent 78%,rgba(0,0,0,.25)),linear-gradient(180deg,#e2283f,#8a0f22 60%,#5e0816) padding-box,linear-gradient(135deg,#fff7d6,#c8962b 26%,#fff1b0 48%,#8a5d0a 74%,#e8c05a) border-box;box-shadow:0 0 0 2px #5a3d0c,0 10px 22px rgba(0,0,0,.55),inset 0 0 0 1px rgba(255,235,180,.35),inset 0 -14px 24px rgba(0,0,0,.35)}",
    ".cz-slm::after{content:'';position:absolute;left:0;right:0;top:0;height:34%;border-radius:18px 18px 0 0;background:linear-gradient(180deg,rgba(255,255,255,.2),transparent);pointer-events:none}",
    ".cz-bulbs i{box-shadow:0 0 7px #ffd96a,0 0 2px #fff6c8,inset 0 -2px 2px rgba(150,90,0,.5)}",
    ".cz-slt{margin:0 6px 7px;padding:2px 0;font-family:Cinzel,Georgia,serif;background:linear-gradient(180deg,#2a0610,#12030a);border:1px solid #e8c05a;border-radius:8px;box-shadow:inset 0 0 12px rgba(255,150,60,.35),0 0 10px rgba(255,200,90,.3),0 1px 0 rgba(0,0,0,.5)}",
    ".cz-wnd{background:linear-gradient(180deg,#000,#1a0a0a);border-color:#e8c05a;box-shadow:inset 0 0 12px rgba(0,0,0,.9),0 0 0 1px #5a3d0c,0 2px 0 rgba(255,235,180,.25)}",
    ".cz-reel{background:linear-gradient(90deg,#cfc7ae,#fffdf3 16%,#fffdf3 84%,#cfc7ae);box-shadow:inset 0 0 10px rgba(0,0,0,.35)}",
    ".cz-reel::after{background:linear-gradient(112deg,rgba(255,255,255,.3) 0 16%,rgba(255,255,255,0) 17% 100%),linear-gradient(180deg,rgba(0,0,0,.52),transparent 30%,transparent 70%,rgba(0,0,0,.52))}",
    ".cz-lvbase{background:linear-gradient(90deg,#666,#f2f2f2 40%,#777);border:2px solid #2a2a2a;box-shadow:0 3px 4px rgba(0,0,0,.5)}",
    ".cz-lvs{background:linear-gradient(90deg,#888,#fff 45%,#777)}",
    ".cz-lvb{background:radial-gradient(circle at 34% 28%,#fff 0 8%,#ff9a9a 16%,#d01c1c 55%,#6a0808);box-shadow:0 4px 6px rgba(0,0,0,.55),inset 0 -3px 5px rgba(0,0,0,.35)}",
    ".cz-pay{font-family:Cinzel,Georgia,serif}",
    // video poker cabinet
    ".cz-vpm{position:relative;border:4px solid transparent;background:linear-gradient(180deg,#34509f,#0f1b4b 70%,#0a1233) padding-box,linear-gradient(135deg,#fff7d6,#c8962b 26%,#fff1b0 48%,#8a5d0a 74%,#e8c05a) border-box;box-shadow:0 0 0 2px #5a3d0c,0 10px 22px rgba(0,0,0,.55),inset 0 0 22px rgba(0,0,40,.6)}",
    ".cz-vpm::after{content:'';position:absolute;inset:0;border-radius:12px;pointer-events:none;background:linear-gradient(118deg,rgba(255,255,255,.14) 0 22%,rgba(255,255,255,0) 23%)}",
    ".cz-vpt{font-family:Cinzel,Georgia,serif}",
    ".cz-vpp{background:repeating-linear-gradient(180deg,rgba(255,255,255,.035) 0 1px,transparent 1px 3px),#08102e;box-shadow:inset 0 0 12px rgba(0,0,0,.8),0 1px 0 rgba(255,235,180,.25)}",
    // craps dice: rounded faces, shaded pips
    ".cz-die{border-radius:16px;background:radial-gradient(circle at 30% 24%,rgba(255,255,255,.35),transparent 45%),linear-gradient(145deg,#ea3a45,#a1161f 70%,#7c0e16);box-shadow:inset 0 -5px 0 rgba(0,0,0,.25),inset 0 2px 0 rgba(255,255,255,.4),inset 3px 0 0 rgba(255,255,255,.1),0 7px 8px rgba(0,0,0,.5)}",
    ".cz-die i.on{background:radial-gradient(circle at 34% 30%,#fff 0 30%,#f1ece0 55%,#bdb6a4);box-shadow:inset 0 -1px 2px rgba(0,0,0,.35),0 1px 1px rgba(0,0,0,.4)}",
    ".cz-puck{background:radial-gradient(circle at 34% 28%,#fff,#e4e4e4 70%,#aaa)}",
    // the Salon bar
    ".cz-bar{background:radial-gradient(70% 30% at 50% 0,rgba(255,200,120,.2),transparent 75%),linear-gradient(180deg,#26100a,#0b0408);box-shadow:0 0 0 1px rgba(232,192,90,.6),0 0 0 2px #3a2208,0 10px 24px rgba(0,0,0,.55),inset 0 0 0 1px rgba(232,192,90,.3),inset 0 0 30px rgba(0,0,0,.6)}",
    ".cz-bar-t{color:var(--cz-champ,#f3e6c4)}",
    ".cz-drink{background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.015));box-shadow:inset 3px 0 0 var(--tint),inset 0 1px 0 rgba(255,235,180,.15),0 3px 6px rgba(0,0,0,.35)}",
    ".cz-dk-o{background:linear-gradient(180deg,#4a3516,#24190a);box-shadow:inset 0 1px 0 rgba(255,235,180,.3),0 2px 0 rgba(0,0,0,.4)}",
    "@media (prefers-reduced-motion:reduce){.cz *{animation:none!important;transition:none!important}}"
  ].join("\n");

  function injectStyle() {
    if (document.getElementById("cz-style")) return;
    var s = document.createElement("style");
    s.id = "cz-style";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ---------- helpers ----------
  function rankLabel(r) { return r === 1 ? "A" : r === 11 ? "J" : r === 12 ? "Q" : r === 13 ? "K" : String(r); }
  function isRed(s) { return s === "♥" || s === "♦"; }
  var DEN = [[100, "d100"], [50, "d50"], [25, "d25"], [10, "d10"], [5, "d5"], [1, "d1"]];
  function denomClass(v) {
    for (var i = 0; i < DEN.length; i++) if (v >= DEN[i][0]) return DEN[i][1];
    return "d1";
  }
  function chipList(amount) {
    var out = [], a = amount;
    for (var i = 0; i < DEN.length && out.length < 9; i++) {
      while (a >= DEN[i][0] && out.length < 9) { out.push(DEN[i][1]); a -= DEN[i][0]; }
    }
    return out;
  }
  function stackHtml(amount, cls, id) {
    var l = chipList(amount);
    var h = '<div class="cz-stack ' + (cls || "") + '"' + (id ? ' id="' + id + '"' : "") + ' style="height:' + (30 + Math.max(0, l.length - 1) * 5) + 'px">';
    l.forEach(function (d, i) { h += '<i class="cz-ch ' + d + '" style="bottom:' + (i * 5) + 'px"></i>'; });
    return h + "<b>" + amount + "</b></div>";
  }
  function faceHtml(c) {
    return '<span class="cz-cr">' + rankLabel(c.r) + '</span><span class="cz-cs">' + c.s + '</span><span class="cz-cm">' + c.s + "</span>";
  }
  // Higher/Lower: letter cards get their number shown (A = 1, J = 11, Q = 12, K = 13).
  function hiloVal(c) { return c.r === 1 || c.r > 10 ? '<span class="cz-val">= ' + c.r + "</span>" : ""; }
  function hiloName(c) { return rankLabel(c.r) + c.s + (c.r === 1 || c.r > 10 ? " (" + c.r + ")" : ""); }
  function cardNode(c, hole) {
    var d = document.createElement("div");
    d.className = "cz-c" + (isRed(c.s) ? " red" : "");
    d.innerHTML = '<div class="cz-ci"><div class="cz-cb"></div><div class="cz-cf">' + (hole ? "" : faceHtml(c)) + "</div></div>";
    return d;
  }

  // ---------- the casino room (lobby) ----------
  var SPOT_NAMES = { bar: "The Salon bar", bj: "Blackjack", sl: "Slots", ro: "Roulette", hl: "Higher / Lower", ba: "Baccarat", vp: "Video Poker", cr: "Craps" };
  var LOBBY_H = 640;           // lobby drawing height (it is 360 wide)
  var FULL_MAX_W = 4000;       // screens up to this wide get the floor full screen (phones and iPads)
  var FULL_TOP_SHARE = 0.45;   // of the extra height on a tall phone, this share goes above the scene (ceiling), the rest below (floor)
  var HERO_Z = 0.3, HERO_X = 25;  // the two featured machines in the left view: distance and how far from the middle
  var AISLE_X = 64;              // the rows of machines further back along the sides
  var TITLE_SCALE = 0.82, TITLE_BACK = 0.6; // game title size (x the old neon size) and how dark the panel behind it is
  var SIDE_Z = 0.17, SIDE_X = 16, HL_SCALE = 0.58, BJ_SCALE = 0.75, SIDE_LABEL = 30; // straight ahead: blackjack and higher/lower side by side (distance, how far apart, table size, sign height)
  var STOOL_GAP = 93.3, ROPE_GAP = 268; // Salon: space between bar stools, and between the brass rope posts
  var LOOK = 1;               // which way you're looking: 0 left, 1 straight, 2 right, 3 the salon (kept while the app is open)
  // the back of the room (crowd, far machines) is blurred this much and covered by a haze this strong
  var DOF_FAR_BLUR = 3, DOF_HAZE = 0.45;
  var TURN_MS = 450;          // turning your head between the left / straight / right views
  var SWIPE_PX = 45;          // a sideways drag this long on the floor turns you
  var CONFETTI_N = 10;
  var JACKPOT_START = 1248903; // the jackpot sign starts here and ticks up while you watch
  var JACKPOT_TICK_MS = 140;   // how often it ticks
  var LOBBY_FIT_GAP = 32; // px kept free under the floor when it is shrunk to fit the screen (covers the page's bottom padding)

  // First-person casino floor in three views you turn between: look left (machine aisle),
  // straight (blackjack + higher/lower) and right (roulette, craps, baccarat).
  // Simple perspective: a world point (X, Y, z) lands at (VX + X / z, VY + Y / z); the floor is Y = EYE.
  // People only stand in the blurred back of the room; the games in focus are left clear.
  var SCENE_DIRS = ["l", "c", "r", "v"];
  var SCENE_NAMES = { l: "Slots · Video poker", c: "Blackjack · Higher/Lower", r: "Roulette · Craps · Baccarat", v: "High-Limit Salon" };
  // tall: drawing height that matches a tall phone; wide: drawing width that matches a wide screen (iPad landscape).
  // The games stay in the middle 360; extra width is more room on both sides (X0 .. X0 + WU).
  function sceneSvg(dir, can, tall, wide) {
    var s = [], i, k, BACK = [], H = LOBBY_H, TH = Math.max(LOBBY_H, tall || LOBBY_H), PAD = Math.round((TH - LOBBY_H) * FULL_TOP_SHARE);
    var WU = Math.max(360, Math.round(wide || 360)), PX = (WU - 360) / 2, X0 = -PX, XR = 360 + PX, MW2 = WU / 360;
    var VX = 180, VY = 250, EYE = 40;
    function r1(n) { return Math.round(n * 10) / 10; }
    function sx(X, z) { return r1(VX + X / z); }
    function sy(Y, z) { return r1(VY + Y / z); }
    function spotOpen(id) {
      return '<g class="cz-spot' + (can ? " can" : "") + '" data-a="open" data-v="' + id + '" role="button" tabindex="0" aria-label="' + SPOT_NAMES[id] + ", minimum bet " + MIN_BET + ' coins">';
    }
    function neon(cx, y, txt, col, size, delay) {
      return '<g class="cz-flk" style="animation-delay:' + delay + 's"><text x="' + cx + '" y="' + y + '" text-anchor="middle" font-size="' + size + '" font-weight="900" letter-spacing="1.2" fill="#fff" stroke="' + col + '" stroke-width="' + r1(size / 7) + '" paint-order="stroke" filter="url(#czl-neon)" font-family="inherit">' + txt + "</text></g>";
    }
    // Game titles: quiet and classy, like a real casino's table signs. Champagne serif capitals, wide letter
    // spacing, gold hairlines with small diamonds, a soft dark backing, and a short underline in the game's color. No glow.
    function plate(cx, y, txt, col, size) {
      var fs = r1(size * TITLE_SCALE), tw = txt.length * fs * 0.8, w = r1(tw + 64), h = r1(fs + 16), x0 = r1(cx - w / 2), top = r1(y - fs - 5);
      var lx1 = r1(cx - tw / 2 - 26), lx2 = r1(cx - tw / 2 - 8), rx1 = r1(cx + tw / 2 + 8), rx2 = r1(cx + tw / 2 + 26), ly = r1(y - fs * 0.36);
      function dia(x) { return '<path d="M' + x + " " + r1(ly - 2.2) + " L" + r1(x + 2.2) + " " + ly + " L" + x + " " + r1(ly + 2.2) + " L" + r1(x - 2.2) + " " + ly + 'Z" fill="#d9b86a"/>'; }
      return '<g class="cz-title2"><rect x="' + x0 + '" y="' + top + '" width="' + w + '" height="' + h + '" rx="3" fill="#07030c" fill-opacity="' + TITLE_BACK + '"/>' +
        '<line x1="' + lx1 + '" y1="' + ly + '" x2="' + lx2 + '" y2="' + ly + '" stroke="#d9b86a" stroke-width=".8"/><line x1="' + rx1 + '" y1="' + ly + '" x2="' + rx2 + '" y2="' + ly + '" stroke="#d9b86a" stroke-width=".8"/>' + dia(lx1) + dia(rx2) +
        '<text x="' + cx + '" y="' + y + '" text-anchor="middle" font-size="' + fs + '" font-weight="700" letter-spacing="' + r1(fs * 0.16) + '" fill="#f3e6c4" font-family="Cinzel, Georgia, \'Times New Roman\', serif">' + txt + "</text>" +
        '<rect x="' + r1(cx - 12) + '" y="' + r1(y + 4) + '" width="24" height="1.6" rx=".8" fill="' + col + '"/></g>';
    }
    // section heading in the same style, without the backing
    function heading(cy, txt, sub) {
      var fs = 20, tw = txt.length * fs * 0.8;
      return '<text x="180" y="' + cy + '" text-anchor="middle" font-size="' + fs + '" font-weight="700" letter-spacing="' + r1(fs * 0.2) + '" fill="#f3e6c4" font-family="Cinzel, Georgia, \'Times New Roman\', serif">' + txt + "</text>" +
        '<line x1="' + r1(180 - tw / 2 - 30) + '" y1="' + (cy - 7) + '" x2="' + r1(180 - tw / 2 - 8) + '" y2="' + (cy - 7) + '" stroke="#d9b86a" stroke-width=".8"/><line x1="' + r1(180 + tw / 2 + 8) + '" y1="' + (cy - 7) + '" x2="' + r1(180 + tw / 2 + 30) + '" y2="' + (cy - 7) + '" stroke="#d9b86a" stroke-width=".8"/>' +
        '<text x="180" y="' + (cy + 18) + '" text-anchor="middle" font-size="8.5" font-weight="600" letter-spacing="4" fill="#d9b86a" opacity=".85" font-family="Cinzel, Georgia, serif">' + sub + "</text>";
    }
    var PP = [["#2b6cb0", "#2a1a10", "#f1c7a0"], ["#c0392b", "#111", "#8d5a3b"], ["#1f8a5b", "#6b3f1f", "#e6b08a"], ["#7a4bc2", "#d9a441", "#f3d2b5"],
      ["#e07b24", "#3a2414", "#c58c62"], ["#d6d6d6", "#1d1d1d", "#6e432a"], ["#e0557e", "#7a2a12", "#f1c7a0"], ["#25303d", "#b9b9b9", "#e8b894"]];
    // a standing guest: body, head, hair (seen from the side/back, drawn soft in the blurred layer)
    function guest(x, y, i, sc) {
      var c = PP[i % PP.length];
      return '<g transform="translate(' + x + " " + y + ") scale(" + sc + ')"><path d="M-9 0 L-8 -26 Q0 -31 8 -26 L9 0 Z" fill="' + c[0] + '"/><rect x="-7" y="0" width="5" height="16" fill="#1b1b24"/><rect x="2" y="0" width="5" height="16" fill="#1b1b24"/>' +
        '<circle cy="-34" r="6.5" fill="' + c[2] + '"/><path d="M-6.5 -35 A6.5 6.5 0 0 1 6.5 -35 Q3 -39 -6.5 -35 Z" fill="' + c[1] + '"/></g>';
    }
    function chip(x, y, col, r) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + col + '" stroke="#fff" stroke-width="' + r1(r * 0.3) + '" stroke-dasharray="' + r1(r * 0.5) + " " + r1(r * 0.4) + '"/>'; }
    function stack(x, y, col, r, n) { var o = ""; for (var j = 0; j < n; j++) o += '<ellipse cx="' + x + '" cy="' + r1(y - j * r * 0.32) + '" rx="' + r + '" ry="' + r1(r * 0.42) + '" fill="' + col + '" stroke="#fff" stroke-width="' + r1(r * 0.12) + '"/>'; return o; }
    function card(x, y, w, face, red, rot) {
      var h = r1(w * 1.4), t = rot ? ' transform="rotate(' + rot + " " + r1(x + w / 2) + " " + r1(y + h / 2) + ')"' : "";
      if (!face) return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + r1(w * 0.12) + '" fill="#a01c34" stroke="#fff" stroke-width="' + r1(w * 0.06) + '"' + t + "/>";
      return '<g' + t + '><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + r1(w * 0.12) + '" fill="#fff" stroke="#bbb" stroke-width="' + r1(w * 0.03) + '"/><text x="' + r1(x + w / 2) + '" y="' + r1(y + h * 0.62) + '" text-anchor="middle" font-size="' + r1(w * 0.62) + '" font-weight="900" fill="' + (red ? "#c8102e" : "#141414") + '" font-family="inherit">' + face + "</text></g>";
    }
    function burst(cx, cy, sc, delay, col) {
      var b = '<g transform="translate(' + cx + " " + cy + ") scale(" + sc + ')"><g class="cz-burst" style="animation-delay:' + delay + 's">';
      for (var a = 0; a < 12; a++) b += '<path d="M-2.2 0 L0 -26 L2.2 0Z" fill="' + (a % 2 ? col : "#fff7c2") + '" transform="rotate(' + a * 30 + ')"/>';
      b += '<text y="4" text-anchor="middle" font-size="11" font-weight="900" fill="#fff" stroke="' + col + '" stroke-width="2.2" paint-order="stroke" font-family="inherit">WIN!</text></g>';
      for (a = 0; a < 6; a++) b += '<circle class="cz-coin" style="animation-delay:' + (delay + 0.1 + a * 0.07).toFixed(2) + "s;--dx:" + ((a - 2.5) * 9) + 'px" r="3.2" fill="#ffd23f" stroke="#a87400" stroke-width=".9"/>';
      return b + "</g>";
    }

    s.push('<svg class="cz-roomsvg" viewBox="' + X0 + " " + (-PAD) + " " + WU + " " + TH + '" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Casino floor, looking ' + (dir === "l" ? "left" : dir === "r" ? "right" : "straight ahead") + '">');
    s.push("<defs>",
      '<radialGradient id="czl-vig" cx="50%" cy="45%" r="75%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".55"/></radialGradient>',
      '<linearGradient id="czl-ceil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14031f"/><stop offset=".7" stop-color="#3c0b48"/><stop offset="1" stop-color="#6a1550"/></linearGradient>',
      '<linearGradient id="czl-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a0618"/><stop offset=".35" stop-color="#7a0f2a"/><stop offset="1" stop-color="#a3163a"/></linearGradient>',
      '<linearGradient id="czl-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>',
      '<linearGradient id="czl-haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3c0b48" stop-opacity="0"/><stop offset=".55" stop-color="#3c0b48" stop-opacity="' + DOF_HAZE + '"/><stop offset="1" stop-color="#3c0b48" stop-opacity="0"/></linearGradient>',
      '<radialGradient id="czl-felt" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#25b066"/><stop offset="1" stop-color="#0d5a31"/></radialGradient>',
      '<radialGradient id="czl-felt2" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#2fb3d1"/><stop offset="1" stop-color="#0d4558"/></radialGradient>',
      '<radialGradient id="czl-glow"><stop offset="0" stop-color="#ffe08a" stop-opacity=".9"/><stop offset="1" stop-color="#ffe08a" stop-opacity="0"/></radialGradient>',
      '<linearGradient id="czl-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f9e08e"/><stop offset="1" stop-color="#b98a24"/></linearGradient>',
      '<filter id="czl-neon" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
      '<filter id="czl-dof2" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="' + DOF_FAR_BLUR + '"/></filter>',
      wheelDefs(), "</defs>");

    // ---- room shell: ceiling with light rows, floor with carpet lines ----
    s.push('<rect x="' + X0 + '" y="' + (-PAD) + '" width="' + WU + '" height="' + (VY + PAD) + '" fill="#14031f"/><rect x="' + X0 + '" width="' + WU + '" height="' + VY + '" fill="url(#czl-ceil)"/><rect x="' + X0 + '" y="' + VY + '" width="' + WU + '" height="' + (TH - PAD - VY) + '" fill="url(#czl-floor)"/>');
    for (i = Math.floor(X0 / 30) - 6; i <= Math.ceil(XR / 30) + 6; i++) s.push('<line x1="' + (i * 30) + '" y1="0" x2="' + r1(VX + (i * 30 - VX) * 0.18) + '" y2="' + r1(VY * 0.82) + '" stroke="#ff9be0" stroke-opacity=".10"/>');
    [0.32, 0.45, 0.65, 0.95, 1.4].forEach(function (z, row) {
      for (var X = -165 - Math.ceil(PX * z / 55) * 55; X <= 165 + Math.ceil(PX * z / 55) * 55; X += 55) {
        var cx = sx(X, z), cy = sy(-62, z), r = r1(2.6 / z);
        if (cx < X0 - 10 || cx > XR + 10) continue;
        s.push('<circle class="cz-bulb2" style="animation-delay:' + ((row * 0.3 + X / 300 + 4) % 2).toFixed(2) + 's" cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#ffe7a8"/><circle cx="' + cx + '" cy="' + cy + '" r="' + r1(r * 3.2) + '" fill="url(#czl-glow)" opacity=".45"/>');
      }
    });
    for (i = -14 - Math.ceil(PX / 40); i <= 14 + Math.ceil(PX / 40); i++) s.push('<line x1="' + VX + '" y1="' + VY + '" x2="' + r1(VX + i * 60 * (TH - PAD - VY) / (H - VY)) + '" y2="' + (TH - PAD) + '" stroke="#ffcf6a" stroke-opacity=".09"/>');
    [0.1, 0.13, 0.17, 0.22, 0.29, 0.38, 0.5, 0.68, 0.95, 1.4].forEach(function (z) { var y = sy(EYE, z); if (y < H) s.push('<line x1="' + X0 + '" y1="' + y + '" x2="' + XR + '" y2="' + y + '" stroke="#ffcf6a" stroke-opacity=".08"/>'); });

    // ---- the blurred back of the room: machine lights, distant tables, and the crowd ----
    var seed = dir === "l" ? 3 : dir === "r" ? 7 : 1;
    var BOK = ["#ff4fa3", "#ffd23f", "#3ff0ff", "#9b5cff", "#4dff88", "#ff7a2f"];
    BACK.push('<rect x="' + X0 + '" y="' + (VY - 46) + '" width="' + WU + '" height="52" fill="#1a0322"/>');
    for (i = 0; i < Math.round(16 * MW2); i++) { // far machine cabinets
      var mx = r1(X0 + ((i * 23.3 + seed * 11) % (WU + 12)) - 6), mh = 30 + ((i * 7 + seed) % 14);
      BACK.push('<rect x="' + mx + '" y="' + (VY + 4 - mh) + '" width="15" height="' + mh + '" rx="2" fill="' + BOK[(i + seed) % BOK.length] + '" opacity=".85"/><rect x="' + (mx + 3) + '" y="' + (VY + 9 - mh) + '" width="9" height="7" fill="#fff6d6" opacity=".9"/>');
    }
    for (i = 0; i < Math.round(40 * MW2); i++) BACK.push('<circle cx="' + r1(X0 + (i * 37.7 + seed * 19) % WU) + '" cy="' + (VY - 42 + ((i * 13) % 30)) + '" r="' + (2 + (i % 4)) + '" fill="' + BOK[i % BOK.length] + '" opacity=".8"/>');
    [[-60, 1.5], [55, 1.6]].forEach(function (t, j) { // two distant tables
      var tx = sx(t[0] + seed * 4 - 12, t[1]), ty = sy(EYE, t[1]);
      BACK.push('<ellipse cx="' + tx + '" cy="' + r1(ty - 8) + '" rx="' + r1(22 / t[1]) + '" ry="' + r1(7 / t[1]) + '" fill="#0d6a3a" stroke="#5a3218" stroke-width="2"/>');
    });
    for (i = 0; i < Math.round(17 * MW2); i++) { // the crowd: guests standing around, small and soft
      var gz = 1.05 + ((i * 0.37 + seed * 0.13) % 0.9), gX = ((i * 47 + seed * 23) % (300 * MW2)) - 150 * MW2;
      BACK.push(guest(sx(gX, gz), sy(EYE, gz), i + seed, r1(0.85 / gz * 100) / 100));
    }
    s.push('<g class="cz-far"><g filter="url(#czl-dof2)">' + BACK.join("") + '</g><rect x="' + X0 + '" y="' + (VY - 70) + '" width="' + WU + '" height="130" fill="url(#czl-haze)"/></g>');

    // two slow light beams
    [[70, "#ff4fd8", 0], [290, "#3ff0ff", 4.1]].forEach(function (b) {
      s.push('<g class="cz-beam" style="transform-origin:' + b[0] + 'px 0px;animation-delay:-' + b[2] + 's"><path d="M' + (b[0] - 4) + " 0 L" + (b[0] + 4) + " 0 L" + (b[0] + 70) + " " + (H * 0.9) + " L" + (b[0] - 70) + " " + (H * 0.9) + 'Z" fill="' + b[1] + '" opacity=".12"/></g>');
    });

    function at(X, z) { return 'transform="translate(' + sx(X, z) + " " + sy(EYE, z) + ") scale(" + (1 / z).toFixed(3) + ')"'; }
    function skirt(rx, top, col) { return '<path d="M' + (-rx) + " " + (-top) + " L" + (-rx + 2) + " 0 L" + (rx - 2) + " 0 L" + rx + " " + (-top) + 'Z" fill="' + (col || "#3a1d0c") + '"/>'; }
    var LBL = [], ZONES = [];
    function zone(id, X, z, w, top) { ZONES.push([id, r1(sx(X, z) - w / 2 / z), r1(sy(EYE, z) - top / z), r1(w / z), r1(top / z + 12)]); }

    if (dir === "c") {
      // ---- the big sign ----
      s.push('<rect x="58" y="22" width="244" height="106" rx="16" fill="#0d0216" stroke="#ff4fa3" stroke-width="2.5" filter="url(#czl-neon)"/>');
      for (i = 0; i < 26; i++) s.push('<circle class="cz-bulb" style="animation-delay:' + (i * 0.08).toFixed(2) + 's" cx="' + (66 + i * 9.1) + '" cy="29" r="2.2"/><circle class="cz-bulb" style="animation-delay:' + (1.2 - i * 0.08).toFixed(2) + 's" cx="' + (66 + i * 9.1) + '" cy="121" r="2.2"/>');
      s.push(neon(180, 66, "ROOT RUSH", "#ff2e93", 32, 0));
      s.push('<text x="180" y="84" text-anchor="middle" font-size="12" font-weight="900" letter-spacing="9" fill="#bff9ff" stroke="#00d5ff" stroke-width="1.6" paint-order="stroke" filter="url(#czl-neon)" font-family="inherit">CASINO</text>');
      s.push('<rect x="96" y="91" width="168" height="24" rx="6" fill="#000" stroke="#ffd23f" stroke-opacity=".8"/><text x="104" y="107" font-size="8" font-weight="900" fill="#ffd23f" letter-spacing="1.5" font-family="inherit">JACKPOT</text>');
      s.push('<text id="czl-jp" x="256" y="108.5" text-anchor="end" font-size="14" font-weight="900" fill="#ffe86b" stroke="#ff9d00" stroke-width=".8" paint-order="stroke" filter="url(#czl-neon)" font-family="inherit">' + JACKPOT_START.toLocaleString("en-US") + "</text>");

      // ---- higher / lower: a card table further back with a big card and up/down arrows ----
      // blackjack (left) and higher/lower (right) side by side, same distance
      var zH = SIDE_Z, zJ = SIDE_Z;
      s.push("<g " + at(SIDE_X, zH) + '><g transform="scale(' + HL_SCALE + ')">', '<ellipse cx="0" cy="-2" rx="30" ry="8" fill="url(#czl-glow)" opacity=".5"/>', skirt(26, 13),
        '<ellipse cx="0" cy="-13" rx="27" ry="8" fill="#5a3218"/><ellipse cx="0" cy="-13.6" rx="24.5" ry="6.6" fill="url(#czl-felt2)"/>',
        // stand with the face-up card and the arrows, like a real game display
        '<rect x="-11" y="-44" width="22" height="30" rx="2.5" fill="#1a0a2e" stroke="#b45cff" stroke-width="1"/>',
        card(-6.5, -41, 13, "Q", true, 0),
        '<path d="M15 -36 L20 -29 L10 -29 Z" fill="#4dff88"/><path d="M15 -19 L20 -26 L10 -26 Z" fill="#ff5a6e"/>',
        '<path d="M-15 -36 L-10 -29 L-20 -29 Z" fill="#4dff88"/><path d="M-15 -19 L-10 -26 L-20 -26 Z" fill="#ff5a6e"/>',
        card(-20, -16.5, 6, "", false, -8), card(-13.5, -16.5, 6, "", false, -4), stack(14, -12, "#7a4bc2", 2.6, 4), "</g></g>");
      LBL.push(plate(sx(SIDE_X, zH), r1(sy(EYE, zH) - SIDE_LABEL / zH), "HIGHER · LOWER", "#b45cff", 12, 1.7));
      zone("hl", SIDE_X, zH, 32, 34);

      // ---- blackjack: empty seats waiting for you ----
      s.push("<g " + at(-SIDE_X, zJ) + '><g transform="scale(' + BJ_SCALE + ')">',
        // the table's padded front and body down toward the floor
        '<path d="M-21 -15.5 A21 8.5 0 0 0 21 -15.5 L21 -10 A21 8.5 0 0 1 -21 -10 Z" fill="#2a1408"/>',
        '<path d="M-21 -15.5 A21 8.5 0 0 0 21 -15.5 L21 -13.6 A21 8.5 0 0 1 -21 -13.6 Z" fill="#6b3a1c"/>',
        '<path d="M-21 -15.5 A21 8.5 0 0 0 21 -15.5 Z" fill="#5a3218"/><path d="M-19.2 -15.2 A19.2 7.3 0 0 0 19.2 -15.2 Z" fill="url(#czl-felt)"/>',
        '<path id="czl-bjarc" d="M-12 -12.6 Q0 -9.6 12 -12.6" fill="none"/><text font-size="1.3" font-weight="900" fill="#f0cf74" letter-spacing=".15" text-anchor="middle" font-family="inherit"><textPath href="#czl-bjarc" startOffset="50%">BLACKJACK PAYS 3 TO 2</textPath></text>',
        '<text x="0" y="-8.9" text-anchor="middle" font-size=".8" font-weight="800" fill="#f0cf74" opacity=".8" font-family="inherit">DEALER STANDS ON ALL 17</text>',
        // chip rack and shoe on the dealer side
        '<rect x="-6" y="-16.3" width="12" height="2.2" rx=".3" fill="#2a1508"/>');
      ["#c0392b", "#2b6cb0", "#1f8a5b", "#111", "#ffd23f", "#7a4bc2"].forEach(function (c, j) { s.push('<rect x="' + r1(-5.6 + j * 1.95) + '" y="-16" width="1.6" height="1.7" rx=".4" fill="' + c + '"/>'); });
      s.push('<rect x="9" y="-17.5" width="3.4" height="2.6" rx=".4" fill="#111" transform="rotate(-10 10.7 -16.2)"/>',
        // dealer's cards and three betting spots with cards dealt
        card(-2.6, -14.2, 1.9, "A", false, -4), card(-0.4, -14.2, 1.9, "", false, 3));
      [[-11.5, -10.6, -12], [0, -7.6, 0], [11.5, -10.6, 12]].forEach(function (p, j) {
        s.push('<ellipse cx="' + p[0] + '" cy="' + (p[1] + 2.2) + '" rx="1.6" ry=".8" fill="none" stroke="#f0cf74" stroke-width=".15"/>',
          card(r1(p[0] - 1.9), r1(p[1] - 1.4), 1.8, ["K", "9", "7"][j], j !== 1, p[2] * 0.6), card(r1(p[0] - 0.2), r1(p[1] - 1.2), 1.8, ["10", "A", "5"][j], j === 1, p[2] * 0.9),
          stack(p[0], r1(p[1] + 2.4), ["#c0392b", "#2b6cb0", "#1f8a5b"][j], 0.75, 3));
      });
      s.push("</g></g>");
      LBL.push(plate(sx(-SIDE_X, zJ), r1(sy(EYE, zJ) - SIDE_LABEL / zJ), "BLACKJACK", "#ffe14a", 12, 0.3));
      zone("bj", -SIDE_X, zJ, 32, 34);
      s.push(burst(sx(SIDE_X, zH), r1(sy(EYE, zH) - 24 / zH), 0.7, 0.5, "#b45cff"));
    }

    if (dir === "l") {
      // ---- an aisle of machines: slots on the left, video poker on the right ----
      var SLOTC = ["#ff2e63", "#9b30ff", "#ffb800", "#00c2b8", "#ff6a00", "#ff3fd2"];
      var VPC = ["#1d4fff", "#7a2bff", "#0aa0ff", "#2c2cc8", "#0fb5a8", "#5a3dff"];
      var ROWZ = [1.6, 1.1, 0.76, 0.52], MW = 32, MH = 64;
      var SYMS = [["7", "7", "7"], ["🍒", "🍒", "🍋"], ["🔔", "💎", "🔔"], ["BAR", "BAR", "7"], ["💎", "💎", "💎"]];
      var slot = function (c, n) {
        var sy3 = SYMS[n % SYMS.length], u = '<ellipse class="cz-top" style="animation-delay:-' + (n * 0.4).toFixed(1) + 's" cx="13" cy="0" rx="11" ry="5" fill="' + SLOTC[(n + 3) % SLOTC.length] + '"/>' +
          '<rect width="26" height="44" rx="2" fill="' + c + '"/><rect width="26" height="44" rx="2" fill="url(#czl-shade)"/><rect x="2" y="2" width="22" height="4" rx="1" fill="#1a0010"/>';
        for (var b = 0; b < 5; b++) u += '<circle class="cz-bulb" style="animation-delay:' + ((b * 0.2 + n * 0.13) % 1.2).toFixed(2) + 's" cx="' + (4.5 + b * 4.25) + '" cy="4" r="1.1"/>';
        u += '<rect x="3" y="8" width="20" height="13" rx="1" fill="#fff6d6"/>';
        for (b = 0; b < 3; b++) u += '<rect x="' + (3.8 + b * 6.4) + '" y="9" width="5.6" height="11" fill="#fff"/><text x="' + (6.6 + b * 6.4) + '" y="' + (sy3[b] === "BAR" ? 15.6 : 16.6) + '" text-anchor="middle" font-size="' + (sy3[b] === "BAR" ? 2.4 : sy3[b] === "7" ? 6.5 : 5) + '" font-weight="900" fill="' + (sy3[b] === "7" ? "#e0142c" : "#111") + '" font-family="inherit">' + sy3[b] + "</text>";
        if (n === 3) u += '<rect class="cz-scr" x="3" y="8" width="20" height="13" rx="1" fill="#ffe14a"/>';
        u += '<line x1="3" y1="14.5" x2="23" y2="14.5" stroke="#ff2b2b" stroke-width=".4"/><rect x="3" y="24" width="20" height="6" rx="1" fill="#1b0509"/>' +
          '<circle cx="7" cy="27" r="1.3" fill="#ffcd1f"/><circle cx="13" cy="27" r="1.3" fill="#3fd0ff"/><circle cx="19" cy="27" r="1.3" fill="#ff3b6b"/>' +
          '<rect x="2" y="34" width="22" height="8" rx="1" fill="#000" opacity=".35"/><line x1="27.5" y1="12" x2="27.5" y2="22" stroke="#ddd" stroke-width="1.1"/><circle cx="27.5" cy="11" r="1.8" fill="#e81b30"/>';
        return u;
      };
      var vpm = function (c, n) {
        var u = '<ellipse class="cz-top" style="animation-delay:-' + (n * 0.5).toFixed(1) + 's" cx="13" cy="0" rx="11" ry="5" fill="#3ff0ff"/>' +
          '<rect width="26" height="44" rx="2" fill="' + c + '"/><rect width="26" height="44" rx="2" fill="url(#czl-shade)"/>' +
          '<rect x="3" y="4" width="20" height="18" rx="1" fill="#0a1233" stroke="#ffd23f" stroke-width=".5"/>' +
          '<text x="13" y="7.6" text-anchor="middle" font-size="2" font-weight="900" fill="#ffd23f" font-family="inherit">JACKS OR BETTER</text>';
        var hand = [["A", 1], ["K", 1], ["Q", 1], ["J", 1], ["10", 1]];
        for (var b = 0; b < 5; b++) u += card(r1(4.2 + b * 3.6), 10, 3.1, hand[b][0], b % 2 === 0, 0);
        if (n === 2) u += '<rect class="cz-scr" x="3" y="4" width="20" height="18" rx="1" fill="#3ff0ff"/>';
        for (b = 0; b < 5; b++) u += '<rect x="' + (4.2 + b * 3.6) + '" y="25" width="3.1" height="2" rx=".5" fill="#ffd23f"/>';
        u += '<rect x="2" y="32" width="22" height="10" rx="1" fill="#000" opacity=".3"/>';
        return u;
      };
      var rowOf = function (X, unit, cols) {
        ROWZ.forEach(function (z, n) {
          var w = MW / z, h = MH / z, x = sx(X, z) - w / 2, y = sy(EYE, z) - h;
          s.push('<g transform="translate(' + r1(x) + " " + r1(y) + ") scale(" + (MW / 26 / z).toFixed(3) + " " + (MH / 44 / z).toFixed(3) + ')">' + unit(cols[n % cols.length], n) + "</g>");
        });
      };
      // stools in front of the machines, then the machines
      [-AISLE_X, AISLE_X].forEach(function (X) { ROWZ.forEach(function (z) { var x = sx(X + (X < 0 ? 12 : -12), z * 0.92), y = sy(EYE, z * 0.92); s.push('<ellipse cx="' + x + '" cy="' + r1(y - 9 / z) + '" rx="' + r1(6 / z) + '" ry="' + r1(2.4 / z) + '" fill="#7a0f2a" stroke="#e8c05a" stroke-width="' + r1(0.7 / z) + '"/><rect x="' + r1(x - 0.8 / z) + '" y="' + r1(y - 9 / z) + '" width="' + r1(1.6 / z) + '" height="' + r1(9 / z) + '" fill="#c9a24a"/>'); }); });
      rowOf(-AISLE_X, slot, SLOTC); rowOf(AISLE_X, vpm, VPC);
      // one big featured machine of each kind right in front of you, lit from behind
      var hero = function (X, unit, col, n, glow) {
        var z = HERO_Z, w = MW / z, h = MH / z, x = sx(X, z) - w / 2, y = sy(EYE, z) - h;
        s.push('<ellipse class="cz-top" cx="' + sx(X, z) + '" cy="' + r1(y + h * 0.45) + '" rx="' + r1(w * 0.72) + '" ry="' + r1(h * 0.56) + '" fill="' + glow + '" opacity=".22" filter="url(#czl-dof2)"/>',
          '<ellipse cx="' + sx(X, z) + '" cy="' + r1(y + h) + '" rx="' + r1(w * 0.62) + '" ry="' + r1(w * 0.12) + '" fill="#000" opacity=".45"/>',
          '<g transform="translate(' + r1(x) + " " + r1(y) + ") scale(" + (MW / 26 / z).toFixed(3) + " " + (MH / 44 / z).toFixed(3) + ')">' + unit(col, n) + "</g>");
        return { x: sx(X, z), top: r1(y) };
      };
      var hs = hero(-HERO_X, slot, "#ff2e63", 0, "#ff2e93"), hv = hero(HERO_X, vpm, "#1d4fff", 2, "#00d5ff");
      LBL.push(plate(hs.x, r1(hs.top - 16), "SLOTS", "#ff2e93", 21, 1.1), plate(hv.x, r1(hv.top - 16), "VIDEO POKER", "#00d5ff", 16, 3.3));
      s.push(heading(74, "MACHINES", "PULL · HOLD · WIN"));
      ZONES.push(["sl", 0, 120, 172, H - 170], ["vp", 188, 120, 172, H - 170]);
      s.push(burst(hs.x, r1(hs.top + 40), 1.1, 0.5, "#ff2e93"));
    }

    if (dir === "r") {
      s.push(heading(74, "TABLE GAMES", "SPIN · ROLL · BET"));
      // ---- baccarat (back left): kidney table with PLAYER / BANKER / TIE boxes ----
      var zB = 0.44, XB = -40;
      s.push("<g " + at(XB, zB) + ">", skirt(24, 12),
        '<ellipse cx="0" cy="-12" rx="25" ry="8" fill="#5a3218"/><ellipse cx="0" cy="-12.6" rx="22.5" ry="6.6" fill="url(#czl-felt)"/>',
        '<rect x="-19" y="-16" width="11" height="6" rx="1.5" fill="none" stroke="#9cd0ff" stroke-width=".6"/><text x="-13.5" y="-12" text-anchor="middle" font-size="2.6" font-weight="900" fill="#9cd0ff" font-family="inherit">PLAYER</text>',
        '<rect x="8" y="-16" width="11" height="6" rx="1.5" fill="none" stroke="#ffa3ad" stroke-width=".6"/><text x="13.5" y="-12" text-anchor="middle" font-size="2.6" font-weight="900" fill="#ffa3ad" font-family="inherit">BANKER</text>',
        '<ellipse cx="0" cy="-13" rx="4" ry="2" fill="none" stroke="#ffe08a" stroke-width=".5"/><text x="0" y="-12.2" text-anchor="middle" font-size="2.2" font-weight="900" fill="#ffe08a" font-family="inherit">TIE</text>',
        card(-17, -10.4, 3, "8", true, -6), card(-13.6, -10.4, 3, "K", false, 5), card(9.5, -10.4, 3, "6", false, -5), card(13, -10.4, 3, "Q", true, 6), "</g>");
      LBL.push(plate(sx(XB, zB), r1(sy(EYE, zB) - 30 / zB), "BACCARAT", "#ffb21f", 13, 3.9));
      zone("ba", XB, zB, 54, 32);
      // ---- craps (back right): long table, dice, pass line, point puck ----
      var zC = 0.44, XC = 40;
      s.push("<g " + at(XC, zC) + ">", skirt(26, 12, "#2a1308"),
        '<rect x="-27" y="-22" width="54" height="16" rx="8" fill="#5a3218"/><rect x="-24.5" y="-20.5" width="49" height="13" rx="6.5" fill="url(#czl-felt)"/>',
        '<path d="M-21 -10.5 Q0 -7.5 21 -10.5" fill="none" stroke="#fff" stroke-width=".7"/><text x="0" y="-8.4" text-anchor="middle" font-size="2" font-weight="900" fill="#fff" font-family="inherit">PASS LINE</text>');
      [4, 5, 6, 8, 9, 10].forEach(function (n, j) { s.push('<rect x="' + (-15 + j * 5) + '" y="-19.5" width="4.4" height="3.6" fill="none" stroke="#ffe08a" stroke-width=".35"/><text x="' + (-12.8 + j * 5) + '" y="-16.8" text-anchor="middle" font-size="2.4" font-weight="900" fill="#ffe08a" font-family="inherit">' + n + "</text>"); });
      s.push('<circle cx="10.2" cy="-21.4" r="1.6" fill="#fff" stroke="#111" stroke-width=".4"/><text x="10.2" y="-20.8" text-anchor="middle" font-size="1.2" font-weight="900" fill="#111" font-family="inherit">ON</text>',
        '<g class="cz-dice"><rect x="-8" y="-14.5" width="4" height="4" rx=".7" fill="#e8222f" transform="rotate(-14 -6 -12.5)"/><rect x="-2.5" y="-13.8" width="4" height="4" rx=".7" fill="#e8222f" transform="rotate(16 -.5 -11.8)"/>' +
        '<circle cx="-6.8" cy="-13.3" r=".45" fill="#fff"/><circle cx="-5.2" cy="-11.7" r=".45" fill="#fff"/><circle cx="-1.5" cy="-12.6" r=".45" fill="#fff"/><circle cx=".3" cy="-11.6" r=".45" fill="#fff"/><circle cx="-.6" cy="-11" r=".45" fill="#fff"/></g>',
        stack(14, -11, "#1f8a5b", 1.4, 4), "</g>");
      LBL.push(plate(sx(XC, zC), r1(sy(EYE, zC) - 30 / zC), "CRAPS", "#3dff7a", 13, 2.4));
      zone("cr", XC, zC, 58, 32);
      // ---- roulette (front): wheel on the left, number layout on the right ----
      var zR = 0.16;
      s.push("<g " + at(0, zR) + ">", skirt(30, 9),
        '<rect x="-31" y="-20" width="62" height="13" rx="4" fill="#5a3218"/><rect x="-29.5" y="-19" width="59" height="11" rx="3" fill="url(#czl-felt)"/>',
        '<g transform="translate(-19 -13.5) scale(1 .5)"><g transform="scale(.085)"><circle r="108" fill="#4a2a14" stroke="#e8c05a" stroke-width="6"/><circle r="97" fill="#101010"/><g class="cz-spin2">' + wheelInner() + "</g></g></g>");
      s.push('<rect x="-8" y="-18.2" width="2.2" height="9.4" fill="#0b7a48" stroke="#fff" stroke-width=".12"/><text x="-6.9" y="-12.8" text-anchor="middle" font-size="1.4" font-weight="900" fill="#fff" font-family="inherit">0</text>');
      for (k = 0; k < 36; k++) {
        var n = k + 1, col = Math.floor(k / 3), rw = 2 - (k % 3);
        s.push('<rect x="' + r1(-5.8 + col * 2.6) + '" y="' + r1(-18.2 + rw * 3.13) + '" width="2.6" height="3.13" fill="' + pocketFill(rouletteColor(n)) + '" stroke="#fff" stroke-width=".1"/><text x="' + r1(-4.5 + col * 2.6) + '" y="' + r1(-16.1 + rw * 3.13) + '" text-anchor="middle" font-size="1.1" font-weight="800" fill="#fff" font-family="inherit">' + n + "</text>");
      }
      s.push(stack(3.3, -14.4, "#ffd23f", 0.9, 3), stack(-2, -10.5, "#2b6cb0", 0.9, 2), '<rect x="-24" y="-8.6" width="48" height="1" fill="#e8c05a" opacity=".5"/>', "</g>");
      LBL.push(plate(VX, r1(sy(EYE, zR) - 26 / zR), "ROULETTE", "#ff3b3b", 18, 0.6));
      zone("ro", 0, zR, 64, 28);
      s.push(burst(sx(XC, zC), r1(sy(EYE, zC) - 24 / zC), 0.6, 2.2, "#3dff7a"));
    }


    if (dir === "v") {
      // ---- the High-Limit Salon: dark wood, gold, a lit back bar full of bottles, a marble bar with empty stools ----
      s.push('<rect x="' + X0 + '" y="' + (-PAD) + '" width="' + WU + '" height="' + TH + '" fill="#0b0408" opacity=".55"/>');
      s.push(heading(64, "HIGH-LIMIT SALON", "FINE SPIRITS · RARE VINTAGES"));
      // chandelier
      s.push('<g opacity=".95"><line x1="180" y1="' + (-PAD) + '" x2="180" y2="96" stroke="#c9a24a" stroke-width="1.2"/><path d="M140 104 Q180 128 220 104" fill="none" stroke="#d9b86a" stroke-width="1.6"/><path d="M152 112 Q180 132 208 112" fill="none" stroke="#d9b86a" stroke-width="1.2"/>');
      for (i = 0; i < 9; i++) s.push('<circle class="cz-bulb2" style="animation-delay:' + (i * 0.27).toFixed(2) + 's" cx="' + (144 + i * 9) + '" cy="' + (106 + Math.round(Math.sin(i / 8 * Math.PI) * 12)) + '" r="2" fill="#fff4cf"/><circle cx="' + (144 + i * 9) + '" cy="' + (106 + Math.round(Math.sin(i / 8 * Math.PI) * 12)) + '" r="7" fill="url(#czl-glow)" opacity=".5"/>');
      s.push("</g>");
      // back bar: wood wall, warm backlight, mirror, three shelves of bottles
      s.push('<defs><linearGradient id="czl-wood2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a1d0e"/><stop offset="1" stop-color="#1c0c05"/></linearGradient>' +
        '<radialGradient id="czl-amber" cx="50%" cy="55%" r="60%"><stop offset="0" stop-color="#ffb347" stop-opacity=".75"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>' +
        '<linearGradient id="czl-marble" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4efe6"/><stop offset=".6" stop-color="#d9d1c3"/><stop offset="1" stop-color="#b8ad9a"/></linearGradient></defs>');
      s.push('<rect x="22" y="150" width="316" height="196" rx="6" fill="url(#czl-wood2)" stroke="#c9a24a" stroke-width="1.6"/>',
        '<rect x="34" y="162" width="292" height="172" rx="3" fill="#120706"/><rect x="34" y="162" width="292" height="172" fill="url(#czl-amber)"/>');
      var BOT = ["#2e8b57", "#8b1a1a", "#d98b2b", "#f2e6b8", "#5a3d8a", "#1f5f8b", "#c0213f", "#7dff4a", "#b5651d", "#ffe08a"];
      [196, 254, 312].forEach(function (shy, row) {
        s.push('<rect x="34" y="' + shy + '" width="292" height="3" fill="#c9a24a"/>');
        for (var b = 0; b < 15; b++) {
          var bx = 42 + b * 19 + (row % 2) * 6, bh = 24 + ((b * 7 + row * 5) % 13), bc = BOT[(b + row * 3) % BOT.length];
          if (bx > 318) continue;
          s.push('<rect x="' + bx + '" y="' + (shy - bh) + '" width="9" height="' + bh + '" rx="2.5" fill="' + bc + '" opacity=".92"/><rect x="' + (bx + 2.5) + '" y="' + (shy - bh - 7) + '" width="4" height="8" rx="1" fill="' + bc + '"/>' +
            '<rect x="' + (bx + 1) + '" y="' + (shy - bh * 0.62) + '" width="7" height="7" fill="#f6ecd2" opacity=".85"/><rect x="' + (bx + 1.5) + '" y="' + (shy - bh + 2) + '" width="1.6" height="' + (bh - 6) + '" fill="#fff" opacity=".25"/>');
        }
      });
      // the bar counter: marble top, dark wood front with gold rail and panels
      s.push('<path d="M' + (X0 - 10) + ' 392 L' + (XR + 10) + ' 392 L' + (XR + 10) + ' 408 L' + (X0 - 10) + ' 408 Z" fill="url(#czl-marble)"/><rect x="' + (X0 - 10) + '" y="406" width="' + (WU + 20) + '" height="3" fill="#8f7a55"/>',
        '<rect x="' + (X0 - 10) + '" y="409" width="' + (WU + 20) + '" height="118" fill="url(#czl-wood2)"/><rect x="' + (X0 - 10) + '" y="452" width="' + (WU + 20) + '" height="5" rx="2" fill="#d9b86a"/>');
      for (i = Math.floor((X0 - 6) / 60); i < Math.ceil((XR - 6) / 60); i++) s.push('<rect x="' + (6 + i * 60) + '" y="418" width="48" height="28" rx="3" fill="none" stroke="#c9a24a" stroke-opacity=".55"/><rect x="' + (6 + i * 60) + '" y="466" width="48" height="50" rx="3" fill="none" stroke="#c9a24a" stroke-opacity=".55"/>');
      // drinks waiting on the bar
      s.push('<g transform="translate(70 392)"><path d="M-9 -26 L9 -26 L1 -12 L1 -2 L6 0 L-6 0 L-1 -2 L-1 -12 Z" fill="#9fd8ff" fill-opacity=".55" stroke="#fff" stroke-width=".8"/><circle cx="2" cy="-21" r="2.2" fill="#6b8e23"/></g>',
        '<g transform="translate(150 392)"><path d="M-4 -34 L4 -34 L3 -12 L1 -10 L1 -2 L5 0 L-5 0 L-1 -2 L-1 -10 L-3 -12 Z" fill="#ffe08a" fill-opacity=".75" stroke="#fff" stroke-width=".8"/><circle cx="0" cy="-26" r=".9" fill="#fff"/><circle cx="1" cy="-20" r=".7" fill="#fff"/></g>',
        '<g transform="translate(232 392)"><rect x="-9" y="-16" width="18" height="16" rx="2" fill="#d98b2b" fill-opacity=".6" stroke="#fff" stroke-width=".8"/><rect x="-6" y="-14" width="7" height="6" rx="1" fill="#e8f6ff" opacity=".8"/></g>',
        '<g transform="translate(300 392)"><rect x="-6" y="-52" width="12" height="40" rx="5" fill="#0f3d20"/><rect x="-3" y="-64" width="6" height="14" rx="1.5" fill="#0f3d20"/><rect x="-3.2" y="-66" width="6.4" height="6" rx="1" fill="#d9b86a"/><rect x="-6" y="-36" width="12" height="11" fill="#f2e6b8"/><rect x="-7" y="-12" width="14" height="12" rx="2" fill="#c9a24a" opacity=".85"/></g>');
      // empty stools in front of the bar
      // stools all along the bar (the same spacing keeps going on wide screens)
      for (k = Math.floor((X0 - 40) / STOOL_GAP) - 1; k <= Math.ceil((XR - 40) / STOOL_GAP) + 1; k++) {
        var x = r1(40 + k * STOOL_GAP);
        if (x < X0 - 30 || x > XR + 30) continue;
        s.push('<rect x="' + (x - 2) + '" y="540" width="4" height="70" fill="#c9a24a"/><ellipse cx="' + x + '" cy="610" rx="16" ry="4" fill="#8f7a55"/>',
          '<ellipse cx="' + x + '" cy="538" rx="26" ry="9" fill="#5a0d1e"/><ellipse cx="' + x + '" cy="534" rx="24" ry="7" fill="#8e1530"/><ellipse cx="' + (x - 6) + '" cy="532" rx="9" ry="2.4" fill="#fff" opacity=".18"/>');
      }
      // velvet ropes on brass posts all along the front, with the gap in the middle as the way in
      var posts = [];
      for (k = Math.floor((X0 - 46) / ROPE_GAP) - 1; k <= Math.ceil((XR - 46) / ROPE_GAP) + 1; k++) posts.push(46 + k * ROPE_GAP);
      posts = posts.filter(function (x) { return x > X0 - ROPE_GAP && x < XR + ROPE_GAP; });
      for (k = 0; k + 1 < posts.length; k++) {
        if (posts[k] === 46) continue; // the way in: no rope between the two middle posts
        var a1 = posts[k], a2 = posts[k + 1];
        s.push('<path d="M' + a1 + ' 600 Q' + r1((a1 + a2) / 2) + ' 618 ' + a2 + ' 600" fill="none" stroke="#8e1530" stroke-width="4"/>');
      }
      posts.forEach(function (x) { if (x >= X0 - 10 && x <= XR + 10) s.push('<rect x="' + (x - 2.5) + '" y="596" width="5" height="44" fill="#d9b86a"/><circle cx="' + x + '" cy="594" r="5" fill="#f3e6c4"/>'); });
      LBL.push(plate(180, 382, "THE BAR · ORDER A DRINK", "#d9b86a", 13, 0));
      ZONES.push(["bar", 0, 140, 360, 420]);
    }
    // confetti, a couple of sparkles, the vignette, the labels, and the tap zones on top
    var CONF = ["#ff2e93", "#ffd23f", "#3ff0ff", "#9b5cff", "#4dff88", "#ff7a2f", "#fff"];
    for (i = 0; i < CONFETTI_N; i++) s.push('<rect class="cz-conf" style="animation-delay:-' + ((i * 0.71 + seed) % 9).toFixed(2) + "s;animation-duration:" + (7 + (i % 5)) + 's" x="' + r1(X0 + (i * 47.3 + 11 + seed * 31) % WU) + '" y="-12" width="' + (3 + (i % 3)) + '" height="' + (5 + (i % 2) * 2) + '" rx="1" fill="' + CONF[i % CONF.length] + '"/>');
    [[30, 150, 0], [330, 160, 2.6]].forEach(function (p) { s.push('<g transform="translate(' + p[0] + " " + p[1] + ')"><path class="cz-sp" style="animation-delay:' + p[2] + 's" d="M0-7 L1.6-1.6 7 0 1.6 1.6 0 7-1.6 1.6-7 0-1.6-1.6Z" fill="#fff6c8"/></g>'); });
    s.push('<rect x="' + X0 + '" y="' + (-PAD) + '" width="' + WU + '" height="' + TH + '" fill="url(#czl-vig)" pointer-events="none"/>');
    s.push(LBL.join(""));
    ZONES.forEach(function (zn2) { s.push(spotOpen(zn2[0]) + '<rect x="' + zn2[1] + '" y="' + zn2[2] + '" width="' + zn2[3] + '" height="' + zn2[4] + '" fill="#000" fill-opacity="0.001"/></g>'); });
    s.push("</svg>");
    return s.join("");
  }
  // The blurred background behind an open game uses the straight-ahead view.
  function lobbySvg(can) { return sceneSvg("c", can); }

  // ---------- UI ----------
  function mount(el, api) {
    injectStyle();
    var tok = {};
    el.__czTok = tok;
    function live() { return el.__czTok === tok; }
    var reduce = false;
    try { reduce = !!(globalThis.matchMedia && globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { /* ignore */ }
    function ms(n) { return reduce ? 0 : n; }
    // Timers always run, even if the screen was re-mounted, so a bet that is in flight is always settled.
    function later(fn, t) { setTimeout(fn, t); }
    function snd(k) { try { api.sound(k); } catch (e) { /* ignore */ } }
    function toast(h) { try { api.toast(h); } catch (e) { /* ignore */ } }
    function pay(n, why) { n = Math.floor(n); if (n > 0) api.earn(n, why); }

    var view = "lobby", navBusy = false;
    var g = { bet: MIN_BET, all: false };
    var bj = { phase: "bet", deck: [], p: [], d: [], bet: 0, reveal: false, msg: "", win: null, visP: [], visD: [], anim: false };
    var sl = { phase: "bet", reels: [SLOT_SYMBOLS[0].sym, SLOT_SYMBOLS[1].sym, SLOT_SYMBOLS[2].sym], top: ["🍋", "🍒", "🔔"], bot: ["🔔", "🍋", "🍒"], stopped: [true, true, true], bet: 0, msg: "", win: null, lv: 0 };
    var ro = { phase: "bet", sel: null, n: null, bet: 0, rot: 0, brot: 0, msg: "", win: null, hist: [] };
    var hl = { phase: "bet", cur: null, streak: 0, mult: 1, bet: 0, msg: "", win: null };
    var vp = { phase: "bet", deck: [], hand: [], held: [false, false, false, false, false], bet: 0, rank: null, msg: "", win: null };
    var ba = { phase: "bet", on: "player", betOn: "player", bet: 0, res: null, msg: "", win: null, hist: [], visP: [], visB: [] };
    var cr = { phase: "bet", point: null, show: null, bet: 0, d: [4, 3], msg: "", win: null };

    el.innerHTML = '<div class="cz-bg" aria-hidden="true"></div><div class="cz"><div class="cz-head"><div id="cz-left"></div><div class="cz-plaque" id="cz-coins"></div></div><div class="cz-stage" id="cz-stage"></div></div>';
    var bgEl = el.firstChild, rootEl = el.children[1];
    var leftEl = rootEl.querySelector("#cz-left");
    var coinsEl = rootEl.querySelector("#cz-coins");
    var stage = rootEl.querySelector("#cz-stage");
    function $(sel) { return stage.querySelector(sel); }

    function updCoins() { coinsEl.textContent = "🪙 " + api.coins(); }
    function locked() {
      return (view === "bj" && bj.phase !== "bet" && bj.phase !== "done") ||
        (view === "sl" && sl.phase === "spin") ||
        (view === "ro" && ro.phase === "spin") ||
        (view === "hl" && (hl.phase === "play" || hl.phase === "reveal")) ||
        (view === "vp" && (vp.phase === "dealing" || vp.phase === "hold" || vp.phase === "drawing")) ||
        (view === "ba" && ba.phase === "deal") ||
        (view === "cr" && (cr.phase === "roll" || cr.phase === "point"));
    }
    function header() {
      leftEl.innerHTML = view === "lobby" ? '<div class="cz-title">🎰 Casino floor</div>' :
        '<button class="cz-back" data-a="back"' + (locked() ? " disabled" : "") + ">← Back to floor</button>";
    }

    function normBet() {
      var c = api.coins();
      if (g.all) return;
      if (g.bet > c) g.bet = c >= MIN_BET ? c : 0;
    }
    function curBet() { var c = api.coins(); return g.all ? c : Math.min(g.bet, c); }
    function canBet() { return api.coins() >= MIN_BET; }

    function betPicker() {
      normBet();
      // Chips stack: each tap adds that chip to the bet. Clear empties it.
      var c = api.coins(), b = curBet(), h = '<div class="cz-betrow"><div class="cz-stack" aria-hidden="true">' + stackHtml(b) + '</div><div class="cz-sub">Your bet: <b>' + b + "</b> coins" + (b < MIN_BET ? "<br><small>Tap chips to stack a bet</small>" : "") + '</div><button class="cz-clr" data-a="clear"' + (b ? "" : " disabled") + ">Clear</button></div><div class=\"cz-bets\">";
      CHIPS.forEach(function (v) {
        h += '<button class="cz-chb d' + v + '" data-a="chip" data-v="' + v + '" aria-label="Add ' + v + '"' + (g.all || b + v > c ? " disabled" : "") + ">+" + v + "</button>";
      });
      h += '<button class="cz-allin' + (g.all ? " on" : "") + '" data-a="allin"' + (c < MIN_BET ? " disabled" : "") + ">All in</button></div>";
      return h;
    }
    // A small pile of chips that matches the bet (biggest chips at the bottom).
    function stackHtml(b) {
      var out = [], left = b, i, k = 0;
      for (i = CHIPS.length - 1; i >= 0; i--) while (left >= CHIPS[i] && out.length < STACK_MAX) { out.push(CHIPS[i]); left -= CHIPS[i]; }
      return out.map(function (v) { return '<i class="d' + v + '" style="bottom:' + (k++ * 6) + 'px"></i>'; }).join("");
    }
    function goDis() { return curBet() < MIN_BET ? " disabled" : ""; }
    function broke() { return '<div class="cz-broke">😕 Out of coins: play a Rush to earn more.</div>'; }
    function takeBet(why) {
      var b = curBet();
      if (b < MIN_BET) return 0;
      if (!api.spend(b, why)) { toast("Not enough coins"); return 0; }
      snd("chip");
      return b;
    }
    function msgBox(m, win) {
      return m ? '<div class="cz-msg' + (win === true ? " win" : win === false ? " lose" : "") + '">' + m + "</div>" : "";
    }
    function settleFeel(stake, back, label) {
      var net = back - stake;
      if (back > stake) {
        snd("win");
        if (net >= stake * BIG_WIN_MULT || net >= BIG_WIN_COINS) toast("🎉 " + label + " +" + net + " coins!");
      } else if (back < stake) snd("lose");
    }
    function setHtml(sel, h) { var n = $(sel); if (n) n.innerHTML = h; }

    // ===== lobby =====
    function lobbyHtml() {
      var can = canBet();
      return '<div class="cz-room"><div class="cz-pano" style="transform:translateX(-' + (LOOK * 100 / SCENE_DIRS.length) + '%)">' +
        SCENE_DIRS.map(function (d) { return '<div class="cz-pv">' + sceneSvg(d, can, fullTall(), fullWide()) + "</div>"; }).join("") + "</div>" +
        '<button class="cz-turn l" data-a="turn" data-v="-1" aria-label="Look left"><span style="display:flex"><svg viewBox="0 0 28 44" width="28" height="44" aria-hidden="true"><defs><linearGradient id="czt-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c2"/><stop offset=".5" stop-color="#e8c05a"/><stop offset="1" stop-color="#a97a1c"/></linearGradient></defs><path d="M18 11 L9 22 L18 33" fill="none" stroke="url(#czt-g)" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 16 L18.5 22 L24 28" fill="none" stroke="#d9b86a" stroke-opacity=".75" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 4.6 L16.4 7 L14 9.4 L11.6 7Z M14 34.6 L16.4 37 L14 39.4 L11.6 37Z" fill="#f3d37a" transform="translate(0 0)"/></svg></span></button><button class="cz-turn r" data-a="turn" data-v="1" aria-label="Look right"><span style="display:flex;transform:scaleX(-1)"><svg viewBox="0 0 28 44" width="28" height="44" aria-hidden="true"><defs><linearGradient id="czt-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c2"/><stop offset=".5" stop-color="#e8c05a"/><stop offset="1" stop-color="#a97a1c"/></linearGradient></defs><path d="M18 11 L9 22 L18 33" fill="none" stroke="url(#czt-g)" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 16 L18.5 22 L24 28" fill="none" stroke="#d9b86a" stroke-opacity=".75" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 4.6 L16.4 7 L14 9.4 L11.6 7Z M14 34.6 L16.4 37 L14 39.4 L11.6 37Z" fill="#f3d37a" transform="translate(0 0)"/></svg></span></button>' +
        '<div class="cz-look" aria-live="polite"></div></div>';
    }
    // phones: the floor fills the whole screen; returns the drawing height that matches the screen's shape (0 = not full screen)
    function isFull() { return !!(globalThis.innerWidth && globalThis.innerWidth <= FULL_MAX_W); }
    function fullTall() { return isFull() ? Math.round(360 * globalThis.innerHeight / globalThis.innerWidth) : 0; }
    // a screen wider than the drawing's shape (iPad, landscape): draw more room on the sides instead of dark bars
    function fullWide() { return isFull() ? Math.round(LOBBY_H * globalThis.innerWidth / globalThis.innerHeight) : 0; }
    var drawnTall = 0;
    // ===== the salon bar =====
    function buzzNow() { try { return api.buzz ? api.buzz() : 0; } catch (e) { return 0; } }
    function barSkel() {
      return '<div class="cz-bar"><div class="cz-bar-h"><div class="cz-bar-t">The Salon Bar</div><div class="cz-bar-s">Fine spirits · rare vintages</div></div>' +
        '<div class="cz-buzz" id="bar-buzz"></div><div class="cz-drinks" id="bar-list"></div>' +
        '<div class="cz-bar-n">Pretend drinks: they only change how your screen looks for a while. Every serving wears off in about ' + Math.round(DRINK_FADE_MS / 60000) + ' minutes.</div></div>';
    }
    function barRefresh() {
      var lv = buzzNow(), k = Math.min(1, lv / 5), coins = api.coins();
      setHtml("#bar-buzz", '<div class="cz-buzz-r"><span>' + buzzName(lv) + "</span><b>" + (lv < 0.3 ? "Clear-headed" : "Sober in about " + soberMinutes(lv) + " min") + "</b></div>" +
        '<div class="cz-buzz-m"><i style="width:' + Math.round(k * 100) + '%"></i></div>');
      setHtml("#bar-list", DRINKS.map(function (d) {
        var dots = ""; for (var j = 0; j < Math.ceil(d.serv); j++) dots += j + 1 <= d.serv ? "●" : "◐";
        return '<div class="cz-drink" style="--tint:' + d.tint + '"><div class="cz-dk-i">' + d.icon + '</div><div class="cz-dk-b"><div class="cz-dk-n">' + d.name + '</div><div class="cz-dk-d">' + d.note + '</div>' +
          '<div class="cz-dk-s" title="servings">' + dots + " " + d.serv + (d.serv === 1 ? " serving" : " servings") + ' · <i>' + d.tone + "</i></div></div>" +
          '<button class="cz-dk-o" data-a="drink" data-v="' + d.id + '"' + (coins < d.price ? " disabled" : "") + ">🪙 " + d.price.toLocaleString("en-US") + "</button></div>";
      }).join(""));
    }
    function barOrder(id) {
      var d = null; DRINKS.forEach(function (x) { if (x.id === id) d = x; });
      if (!d || !api.spend(d.price, "salon " + d.id)) return;
      try { if (api.drink) api.drink(d); } catch (e) { /* ignore */ }
      updCoins(); snd("buy"); toast(d.icon + " Cheers!");
      barRefresh();
    }
    function lookUpdate() {
      var pano = stage.querySelector(".cz-pano"); if (!pano) return;
      pano.style.transform = "translateX(-" + (LOOK * 100 / SCENE_DIRS.length) + "%)";
      stage.querySelector(".cz-turn.l").disabled = LOOK === 0;
      stage.querySelector(".cz-turn.r").disabled = LOOK === SCENE_DIRS.length - 1;
      stage.querySelector(".cz-look").innerHTML = SCENE_DIRS.map(function (_, j) { return '<i class="' + (j === LOOK ? "on" : "") + '"></i>'; }).join("") + " " + SCENE_NAMES[SCENE_DIRS[LOOK]];
      // only the view you're looking at can be tabbed to / tapped
      stage.querySelectorAll(".cz-pv").forEach(function (pv, j) { pv.setAttribute("aria-hidden", j === LOOK ? "false" : "true"); pv.querySelectorAll(".cz-spot").forEach(function (g) { g.setAttribute("tabindex", j === LOOK ? "0" : "-1"); }); });
    }
    function turn(d) { var n = Math.max(0, Math.min(SCENE_DIRS.length - 1, LOOK + d)); if (n === LOOK) return; LOOK = n; snd("click"); lookUpdate(); }

    // ===== blackjack =====
    function bjSkel() {
      return '<div class="cz-game"><div class="cz-bjt" id="bj-t">' +
        '<svg viewBox="0 0 358 350" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>' +
        '<radialGradient id="czb-felt" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#24a05f"/><stop offset="1" stop-color="#0c5230"/></radialGradient>' +
        '<radialGradient id="czb-vig" cx="50%" cy="42%" r="70%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></radialGradient>' +
        '<radialGradient id="czb-pool" cx="50%" cy="0%" r="75%"><stop offset="0" stop-color="#fff3c8" stop-opacity=".26"/><stop offset="1" stop-color="#fff3c8" stop-opacity="0"/></radialGradient>' +
        '<linearGradient id="czb-rail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9a6438"/><stop offset=".45" stop-color="#5a3319"/><stop offset="1" stop-color="#2a1409"/></linearGradient>' +
        '<pattern id="czb-weave" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="none"/><circle cx="1" cy="1" r=".6" fill="#fff" fill-opacity=".07"/><circle cx="3" cy="3" r=".6" fill="#000" fill-opacity=".1"/></pattern>' +
        '<path id="czb-arc1" d="M44 130 Q179 172 314 130" fill="none"/><path id="czb-arc2" d="M64 156 Q179 192 294 156" fill="none"/></defs>' +
        '<path d="M8 14 H350 V266 A100 80 0 0 1 250 346 H108 A100 80 0 0 1 8 266 Z" fill="#000" fill-opacity=".38"/>' +
        '<path d="M8 8 H350 V260 A100 80 0 0 1 250 340 H108 A100 80 0 0 1 8 260 Z" fill="url(#czb-felt)"/>' +
        '<path d="M8 8 H350 V260 A100 80 0 0 1 250 340 H108 A100 80 0 0 1 8 260 Z" fill="url(#czb-weave)"/>' +
        '<path d="M8 8 H350 V260 A100 80 0 0 1 250 340 H108 A100 80 0 0 1 8 260 Z" fill="url(#czb-vig)"/>' +
        '<path d="M8 8 H350 V260 A100 80 0 0 1 250 340 H108 A100 80 0 0 1 8 260 Z" fill="url(#czb-pool)"/>' +
        '<path d="M8 8 H350 V260 A100 80 0 0 1 250 340 H108 A100 80 0 0 1 8 260 Z" fill="none" stroke="url(#czb-rail)" stroke-width="10" stroke-linejoin="round"/>' +
        '<path d="M3.5 3.5 H354.5 V260 A104.5 84.5 0 0 1 250 344.5 H108 A104.5 84.5 0 0 1 3.5 260 Z" fill="none" stroke="#ffe6b8" stroke-opacity=".38" stroke-width="1" stroke-linejoin="round"/>' +
        '<path d="M12.5 12.5 H345.5 V260 A95.5 75.5 0 0 1 250 335.5 H108 A95.5 75.5 0 0 1 12.5 260 Z" fill="none" stroke="#000" stroke-opacity=".4" stroke-width="1.2" stroke-linejoin="round"/>' +
        '<path d="M16 16 H342 V260 A92 72 0 0 1 250 332 H108 A92 72 0 0 1 16 260 Z" fill="none" stroke="#e8c05a" stroke-opacity=".75" stroke-width="1.5"/>' +
        '<text font-size="15" font-weight="900" fill="#f0cf74" letter-spacing="1.6" text-anchor="middle" font-family="inherit"><textPath href="#czb-arc1" startOffset="50%">BLACKJACK PAYS 3 TO 2</textPath></text>' +
        '<text font-size="9" font-weight="700" fill="#d3ecdb" letter-spacing="1.6" text-anchor="middle" font-family="inherit"><textPath href="#czb-arc2" startOffset="50%">DEALER STANDS ON ALL 17</textPath></text>' +
        '<circle cx="179" cy="202" r="29" fill="none" stroke="#e8c05a" stroke-opacity=".8" stroke-width="1.6" stroke-dasharray="4 3"/><circle cx="179" cy="202" r="24" fill="none" stroke="#e8c05a" stroke-opacity=".35" stroke-width=".8"/>' +
        '<g fill="#e8c05a" fill-opacity=".8"><path d="M52 177 l3 3 -3 3 -3 -3z"/><path d="M306 177 l3 3 -3 3 -3 -3z"/></g>' +
        "</svg>" +
        '<div class="cz-shoe" id="bj-shoe"><i></i><i></i><i></i></div>' +
        '<div class="cz-lbl cz-lbl-d" id="bj-dl">DEALER</div><div class="cz-hand cz-hand-d" id="bj-d"></div>' +
        '<div class="cz-betbox" id="bj-bet"></div>' +
        '<div class="cz-hand cz-hand-p" id="bj-p"></div><div class="cz-lbl cz-lbl-p" id="bj-pl">YOU</div></div>' +
        '<div id="bj-msg"></div><div id="bj-ctl"></div></div>';
    }
    function bjRestore() {
      var dh = $("#bj-d"), ph = $("#bj-p");
      bj.visP = []; bj.visD = [];
      bj.p.forEach(function (c) { var n = cardNode(c, false); n.className += " noanim up"; ph.appendChild(n); bj.visP.push(c); });
      bj.d.forEach(function (c, i) {
        var hole = i === 1 && !bj.reveal && bj.phase !== "bet" && bj.phase !== "done";
        var n = cardNode(c, hole); n.className += " noanim" + (hole ? "" : " up"); dh.appendChild(n);
        if (!hole) bj.visD.push(c);
      });
      bjRefresh();
    }
    function bjLabels() {
      var dl = $("#bj-dl"), pl = $("#bj-pl");
      if (dl) dl.textContent = "DEALER" + (bj.visD.length ? " · " + handValue(bj.visD) : "");
      if (pl) pl.textContent = "YOU" + (bj.visP.length ? " · " + handValue(bj.visP) : "");
    }
    function bjRefresh() {
      header();
      if (view !== "bj") return;
      bjLabels();
      if (!bj.anim) {
        var show = (bj.phase === "bet" || bj.phase === "done") ? (canBet() ? curBet() : 0) : bj.bet;
        setHtml("#bj-bet", show ? stackHtml(show, bj.phase === "bet" || bj.phase === "done" ? "ghost" : "") : "");
      }
      setHtml("#bj-msg", msgBox(bj.msg, bj.win));
      var h = "";
      if (bj.phase === "bet" || bj.phase === "done") {
        h = canBet() ? betPicker() + '<button class="cz-go" data-a="bj-deal"' + goDis() + '>' + (bj.phase === "done" ? "Deal again" : "Deal") + " (" + curBet() + ")</button>" : broke();
      } else {
        var play = bj.phase === "play", canDbl = play && bj.p.length === 2 && api.coins() >= bj.bet;
        h = '<div class="cz-row"><button data-a="bj-hit"' + (play ? "" : " disabled") + '>Hit</button><button class="cz-stand" data-a="bj-stand"' + (play ? "" : " disabled") + '>Stand</button><button class="cz-dbl" data-a="bj-dbl"' + (canDbl ? "" : " disabled") + ">Double</button></div>";
      }
      setHtml("#bj-ctl", h);
    }
    // slide a card from the shoe to its spot; face-up cards flip once they land
    function dealTo(handEl, c, hole, delay, onFlip, shoeSel) {
      var n = cardNode(c, hole);
      handEl.appendChild(n);
      var shoe = $(shoeSel || "#bj-shoe");
      if (shoe) {
        var a = n.getBoundingClientRect(), s = shoe.getBoundingClientRect();
        n.style.setProperty("--dx", (s.left + s.width / 2 - (a.left + a.width / 2)) + "px");
        n.style.setProperty("--dy", (s.top + s.height / 2 - (a.top + a.height / 2)) + "px");
      }
      n.style.animation = "cz-slide " + SLIDE_MS + "ms ease-out " + delay + "ms both";
      later(function () {
        if (!hole) n.classList.add("up");
        snd("click");
        if (onFlip) onFlip();
      }, ms(delay + SLIDE_MS));
      return n;
    }
    function bjPut(who, idx, slot) {
      var cards = who === "p" ? bj.p : bj.d, c = cards[idx];
      var hole = who === "d" && idx === 1 && !bj.reveal;
      dealTo($(who === "p" ? "#bj-p" : "#bj-d"), c, hole, ms(slot * DEAL_STEP_MS), function () {
        if (!hole) (who === "p" ? bj.visP : bj.visD).push(c);
        bjLabels();
      });
    }
    function bjDeal() {
      var b = takeBet("blackjack");
      if (!b) return refresh();
      bj.bet = b; bj.deck = makeDeck(); bj.reveal = false; bj.msg = ""; bj.win = null; bj.anim = false;
      bj.p = [bj.deck.pop(), bj.deck.pop()];
      bj.d = [bj.deck.pop(), bj.deck.pop()];
      bj.phase = "deal"; bj.visP = []; bj.visD = [];
      setHtml("#bj-p", ""); setHtml("#bj-d", "");
      updCoins(); bjRefresh();
      bjPut("p", 0, 0); bjPut("d", 0, 1); bjPut("p", 1, 2); bjPut("d", 1, 3);
      later(function () {
        if (isBlackjack(bj.p) || isBlackjack(bj.d)) { bj.phase = "dealer"; bjRefresh(); later(bjReveal, ms(500)); }
        else { bj.phase = "play"; bjRefresh(); }
      }, ms(3 * DEAL_STEP_MS + SLIDE_MS + 450));
    }
    function bjReveal() {
      bj.reveal = true; bj.phase = "dealer";
      var dh = $("#bj-d"), n = dh && dh.children[1];
      if (n) { n.querySelector(".cz-cf").innerHTML = faceHtml(bj.d[1]); n.classList.add("up"); }
      snd("click");
      bj.visD = bj.d.slice(0, 2);
      bjRefresh();
      later(bjDealerStep, ms(DEALER_STEP_MS));
    }
    function bjDealerStep() {
      if (handValue(bj.p) <= 21 && !isBlackjack(bj.p) && !isBlackjack(bj.d) && dealerShouldHit(bj.d)) {
        var c = bj.deck.pop(); bj.d.push(c);
        dealTo($("#bj-d"), c, false, 0, function () { bj.visD.push(c); bjLabels(); });
        later(bjDealerStep, ms(DEALER_STEP_MS));
      } else bjSettle();
    }
    function bjSettle() {
      var back = settleBlackjack(bj.p, bj.d, bj.bet);
      pay(back, "blackjack");
      var pv = handValue(bj.p), net = back - bj.bet;
      if (pv > 21) { bj.msg = "Bust! You lose " + bj.bet + " coins."; bj.win = false; }
      else if (isBlackjack(bj.p) && back > bj.bet) { bj.msg = "🃏 Blackjack! You win " + net + " coins."; bj.win = true; }
      else if (back > bj.bet) { bj.msg = (handValue(bj.d) > 21 ? "Dealer busts. " : "") + "You win " + net + " coins!"; bj.win = true; }
      else if (back === bj.bet) { bj.msg = "Push. Your " + bj.bet + " coins come back."; bj.win = null; }
      else { bj.msg = "Dealer wins. You lose " + bj.bet + " coins."; bj.win = false; }
      settleFeel(bj.bet, back, "Blackjack");
      bj.reveal = true; bj.phase = "done";
      bj.visD = bj.d.slice(); bj.visP = bj.p.slice();
      updCoins();
      // chips: winnings appear next to the bet, then everything slides to you (or to the dealer)
      bj.anim = true;
      setHtml("#bj-bet", stackHtml(bj.bet, "", "bj-s1") + (back > bj.bet ? stackHtml(back - bj.bet, "pop", "bj-s2") : ""));
      later(function () {
        var s1 = $("#bj-s1"), s2 = $("#bj-s2"), cls = back > 0 ? "toyou" : "tolose";
        if (s1) s1.classList.add(cls);
        if (s2) s2.classList.add("toyou");
        if (back > 0) snd("chip");
      }, ms(back > bj.bet ? 650 : 450));
      later(function () { bj.anim = false; bjRefresh(); }, ms(1600));
      bjRefresh();
    }
    function bjHit() {
      if (bj.phase !== "play") return;
      var c = bj.deck.pop(); bj.p.push(c);
      bj.phase = "hit";
      dealTo($("#bj-p"), c, false, 0, function () { bj.visP.push(c); bjLabels(); });
      bjRefresh();
      later(function () {
        if (handValue(bj.p) >= 21) { bj.phase = "dealer"; bjRefresh(); later(bjReveal, ms(250)); }
        else { bj.phase = "play"; bjRefresh(); }
      }, ms(SLIDE_MS + 420));
    }
    function bjStand() { if (bj.phase !== "play") return; bj.phase = "dealer"; snd("click"); bjReveal(); }
    function bjDouble() {
      if (bj.phase !== "play" || bj.p.length !== 2) return;
      if (!api.spend(bj.bet, "blackjack double")) { toast("Not enough coins"); return bjRefresh(); }
      snd("chip");
      bj.bet *= 2;
      var c = bj.deck.pop(); bj.p.push(c);
      bj.phase = "dealer"; updCoins();
      dealTo($("#bj-p"), c, false, 0, function () { bj.visP.push(c); bjLabels(); });
      bjRefresh();
      later(bjReveal, ms(SLIDE_MS + 500));
    }

    // ===== slots =====
    var CELL = 62;
    function reelStatic(i) {
      return '<div class="cz-cell">' + sl.top[i] + '</div><div class="cz-cell mid">' + sl.reels[i] + '</div><div class="cz-cell">' + sl.bot[i] + "</div>";
    }
    function reelSpin() {
      var strip = "", all = ["🍒", "🍋", "🔔", "💎", "🍒", "🍋", "🍒", "🔔"];
      for (var k = 0; k < 2; k++) all.forEach(function (s) { strip += '<div class="cz-cell">' + s + "</div>"; });
      return strip;
    }
    function slSkel() {
      var bulbs = "", i;
      for (i = 0; i < 12; i++) bulbs += '<i style="animation-delay:' + ((i * 0.1).toFixed(2)) + 's"></i>';
      var reels = "";
      for (i = 0; i < 3; i++) reels += '<div class="cz-reel' + '" id="sl-rl' + i + '"><div class="cz-rs" id="sl-r' + i + '">' + (sl.stopped[i] ? reelStatic(i) : reelSpin()) + "</div></div>";
      var pays = "";
      SLOT_SYMBOLS.forEach(function (s) { pays += "<span>" + s.sym + s.sym + s.sym + " ×" + s.pay3 + "</span>"; });
      return '<div class="cz-game"><div class="cz-slm" id="sl-m"><div class="cz-bulbs">' + bulbs + '</div><div class="cz-slt">LUCKY ROOTS</div>' +
        '<div class="cz-slb"><div class="cz-wnd">' + reels + '<div class="cz-payline"></div></div>' +
        '<div class="cz-lv" id="sl-lv" role="button" tabindex="0" aria-label="Pull the lever to spin"><i class="cz-lvs" id="sl-lvs"></i><i class="cz-lvb" id="sl-lvb"></i><i class="cz-lvbase"></i></div></div>' +
        '<div class="cz-pour" id="sl-pour"></div></div>' +
        '<div id="sl-msg"></div><div id="sl-ctl"></div>' +
        '<div class="cz-sub" style="margin-top:10px;text-align:center">Three of a kind pays</div><div class="cz-pay">' + pays + "</div></div>";
    }
    function slRestore() {
      var m = $("#sl-m");
      if (sl.phase === "spin" && m) {
        m.classList.add("spinning");
        for (var i = 0; i < 3; i++) if (!sl.stopped[i]) { var r = $("#sl-r" + i); if (r) r.className = "cz-rs spin"; }
      }
      slRefresh();
    }
    function slRefresh() {
      header();
      if (view !== "sl") return;
      setHtml("#sl-msg", msgBox(sl.msg, sl.win));
      var h;
      if (sl.phase === "spin") h = '<div class="cz-msg">Spinning…</div>';
      else h = canBet() ? betPicker() + '<button class="cz-go" data-a="sl-spin"' + goDis() + '>Spin (' + curBet() + ")</button>" : broke();
      setHtml("#sl-ctl", h);
    }
    function slReady() { return view === "sl" && (sl.phase === "bet" || sl.phase === "done") && canBet(); }
    function setLever(p, drag) {
      var lv = $("#sl-lv"), s = $("#sl-lvs"), b = $("#sl-lvb");
      if (!lv || !s || !b) return;
      lv.classList.toggle("drag", !!drag);
      var H = 84 - 56 * p;
      s.style.height = H + "px";
      b.style.bottom = (18 + H - 16) + "px";
    }
    function leverKick() { setLever(1, false); later(function () { setLever(0, false); }, 220); }
    function slSpin(fromDrag) {
      if (!slReady()) return;
      var b = takeBet("slots");
      if (!b) return slRefresh();
      sl.bet = b; sl.reels = spinReels(); sl.stopped = [false, false, false]; sl.phase = "spin"; sl.msg = ""; sl.win = null;
      // filler symbols above and below the payline (never a fake winning row)
      var pool = SLOT_SYMBOLS.map(function (s) { return s.sym; }), i;
      function rnd() { return pool[Math.floor(Math.random() * pool.length)]; }
      for (i = 0; i < 3; i++) { sl.top[i] = rnd(); sl.bot[i] = rnd(); }
      if (sl.top[0] === sl.top[1] && sl.top[1] === sl.top[2]) sl.top[2] = pool[(pool.indexOf(sl.top[2]) + 1) % pool.length];
      if (sl.bot[0] === sl.bot[1] && sl.bot[1] === sl.bot[2]) sl.bot[2] = pool[(pool.indexOf(sl.bot[2]) + 1) % pool.length];
      if (!fromDrag) leverKick();
      snd("spin"); updCoins(); slRefresh();
      var m = $("#sl-m");
      if (m) { m.classList.remove("win"); m.classList.add("spinning"); }
      for (i = 0; i < 3; i++) {
        var r = $("#sl-r" + i), rl = $("#sl-rl" + i);
        if (rl) rl.classList.remove("hit");
        if (r) { r.className = "cz-rs spin"; r.innerHTML = reelSpin(); }
      }
      [0, 1, 2].forEach(function (k) {
        later(function () {
          sl.stopped[k] = true; snd("click");
          var rr = $("#sl-r" + k);
          if (rr) { rr.className = "cz-rs land"; rr.innerHTML = reelStatic(k); }
          if (k === 2) slFinish();
        }, ms(REEL_STOP_MS[k]));
      });
    }
    function slFinish() {
      var back = slotPayout(sl.reels, sl.bet);
      pay(back, "slots");
      if (back > 0) { sl.msg = "🎉 Three of a kind! You win " + (back - sl.bet) + " coins!"; sl.win = true; }
      else { sl.msg = "No match. You lose " + sl.bet + " coins."; sl.win = false; }
      settleFeel(sl.bet, back, "Slots");
      sl.phase = "done"; updCoins();
      var m = $("#sl-m");
      if (m) {
        m.classList.remove("spinning");
        if (back > 0) {
          m.classList.add("win");
          for (var i = 0; i < 3; i++) { var rl = $("#sl-rl" + i); if (rl) rl.classList.add("hit"); }
          slPour(back >= COIN_POUR_BIG * sl.bet ? 40 : 12);
          later(function () { m.classList.remove("win"); }, ms(3300));
        }
      }
      slRefresh();
    }
    function slPour(count) {
      var p = $("#sl-pour");
      if (!p) return;
      var h = "";
      for (var i = 0; i < count; i++) {
        h += '<i class="cz-cn" style="left:' + (4 + Math.random() * 90).toFixed(1) + "%;animation-delay:" + (Math.random() * 1.1).toFixed(2) + "s;animation-duration:" + (1.1 + Math.random() * 0.7).toFixed(2) + 's"></i>';
      }
      p.innerHTML = h;
      later(function () { p.innerHTML = ""; }, ms(3000));
    }

    // ===== roulette =====
    var BALL_TRACK = 8.8, BALL_POCKET = 20.2;  // ball radius as % from the box edge (track ring, pocket floor)
    function roSkel() {
      var bowl = '<svg viewBox="-114 -114 228 228" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="czr-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a4a28"/><stop offset="1" stop-color="#2e170b"/></linearGradient></defs>' +
        '<linearGradient id="czr-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c2"/><stop offset=".35" stop-color="#c8962b"/><stop offset=".6" stop-color="#8a5d0a"/><stop offset="1" stop-color="#f3d37a"/></linearGradient><radialGradient id="czr-trk" cx="50%" cy="50%" r="50%"><stop offset=".86" stop-color="#201208"/><stop offset=".92" stop-color="#3a2514"/><stop offset="1" stop-color="#0f0a08"/></radialGradient>' +
        '<linearGradient id="czr-sh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
        '<circle r="111" cy="3" fill="#000" fill-opacity=".35"/>' +
        '<circle r="108" fill="url(#czr-wood)" stroke="url(#czr-rim)" stroke-width="3.4"/><circle r="104" fill="none" stroke="#000" stroke-opacity=".4" stroke-width="1"/><circle r="99" fill="url(#czr-trk)" stroke="#c8962b" stroke-width="1.5"/><circle r="89.5" fill="#201208"/>' +
        '<g fill="#e8c05a">' + [0, 45, 90, 135, 180, 225, 270, 315].map(function (a) { return '<path transform="rotate(' + a + ') translate(0 -94.5)" d="M0 -3.2 L2.2 0 L0 3.2 L-2.2 0Z"/>'; }).join("") + "</g>" +
        '<path d="M-8 -113 L8 -113 L0 -97Z" fill="#f4d577" stroke="#6b4a10" stroke-width="1.2"/></svg>';
      return '<div class="cz-game"><div class="cz-board" id="ro-board"></div><div class="cz-wbox">' + bowl +
        '<div class="cz-wheel" id="ro-wheel" style="transform:rotate(' + ro.rot + 'deg)">' + wheelSvg() + "</div>" +
        '<div class="cz-arm" id="ro-arm" style="transform:rotate(' + ro.brot + 'deg)"><i class="cz-ball" id="ro-ball" style="top:' + (ro.n === null ? BALL_TRACK : BALL_POCKET) + '%"></i></div></div>' +
        '<svg class="cz-sheen" viewBox="-114 -114 228 228" aria-hidden="true"><path d="M-84 -42 A94 94 0 0 1 12 -94 A112 112 0 0 0 -84 -42Z" fill="url(#czr-sh)"/></svg>' +
        '<div id="ro-msg"></div><div id="ro-lay"></div></div>';
    }
    function selLabel() {
      if (!ro.sel) return "Pick a bet below";
      return ro.sel.type === "number" ? "Number " + ro.sel.value : ro.sel.type[0].toUpperCase() + ro.sel.type.slice(1);
    }
    function isSel(type, value) { return ro.sel && ro.sel.type === type && (type !== "number" || ro.sel.value === value); }
    function roRefresh() {
      header();
      if (view !== "ro") return;
      var spinning = ro.phase === "spin", dis = spinning ? " disabled" : "";
      var board = "", past = ro.phase === "done" ? ro.hist.slice(1) : ro.hist;
      if (spinning) board = "🎡 No more bets… the ball is rolling";
      else {
        if (ro.n !== null && ro.phase === "done") board += 'Landed on <span class="cz-numchip ' + rouletteColor(ro.n) + '">' + ro.n + "</span>";
        else board += "Place your bet";
        if (past.length) {
          board += ' <span style="opacity:.7;margin-left:6px">last</span>';
          past.slice(0, 7).forEach(function (n) { board += '<span class="cz-nc ' + rouletteColor(n) + '">' + n + "</span>"; });
        }
      }
      setHtml("#ro-board", board);
      setHtml("#ro-msg", msgBox(ro.msg, ro.win));
      var bv = ro.phase === "spin" ? ro.bet : curBet(), plc = '<i class="cz-plc ' + denomClass(bv) + '">' + bv + "</i>";
      var h = '<div class="cz-sub" style="text-align:center">Your pick: ' + selLabel() + '</div><div class="cz-lay"><div class="cz-sel4">';
      [["red", "Red"], ["black", "Black"], ["odd", "Odd"], ["even", "Even"]].forEach(function (t) {
        h += '<button class="' + (t[0] === "red" || t[0] === "black" ? t[0] : "") + (isSel(t[0]) ? " cz-on" : "") + '" data-a="ro-pick" data-v="' + t[0] + '"' + dis + ">" + t[1] + (isSel(t[0]) && bv ? plc : "") + "</button>";
      });
      h += '</div><div class="cz-grid">';
      for (var n = 0; n <= 36; n++) {
        h += '<button class="cz-num ' + rouletteColor(n) + (n === 0 ? " cz-zero" : "") + (isSel("number", n) ? " cz-on" : "") + (ro.phase === "done" && ro.n === n ? " cz-hit" : "") + '" data-a="ro-num" data-v="' + n + '"' + dis + ">" + n + (isSel("number", n) && bv ? plc : "") + "</button>";
      }
      h += "</div></div>";
      if (!spinning) {
        h += (canBet() ? betPicker() + '<button class="cz-go" data-a="ro-spin"' + (ro.sel ? goDis() : " disabled") + ">Spin (" + curBet() + ")</button>" : broke());
        h += '<div class="cz-total" style="text-align:center;margin-top:8px">Red/black/odd/even pay ×2 (0 loses). A number pays ×36.</div>';
      }
      setHtml("#ro-lay", h);
    }
    function roSpin() {
      if (!ro.sel || ro.phase === "spin") return;
      var b = takeBet("roulette");
      if (!b) return roRefresh();
      ro.bet = b; ro.n = Math.floor(Math.random() * 37); ro.phase = "spin"; ro.msg = ""; ro.win = null;
      snd("spin"); updCoins(); roRefresh();
      // the wheel turns clockwise and ends with pocket n under the pointer; the ball goes round the other way
      var wa = wheelAngleFor(ro.n);
      var k = Math.ceil((ro.rot + 360 * WHEEL_TURNS - wa) / 360);
      var final = wa + 360 * k;
      var ballFinal = ro.brot - 360 * BALL_TURNS;
      ro.rot = final; ro.brot = ballFinal;
      var w = $("#ro-wheel"), arm = $("#ro-arm"), ball = $("#ro-ball");
      var ease = "transform " + WHEEL_SPIN_MS + "ms cubic-bezier(.12,.55,.18,1)";
      if (w && arm && ball) {
        ball.style.transition = "top .35s ease-out";
        ball.style.top = BALL_TRACK + "%";
        w.getBoundingClientRect();
        w.style.transition = ease; arm.style.transition = ease;
        w.style.transform = "rotate(" + final + "deg)";
        arm.style.transform = "rotate(" + ballFinal + "deg)";
        later(function () {
          ball.style.transition = "top .9s cubic-bezier(.3,0,.5,1)";
          ball.style.top = BALL_POCKET + "%";
          later(function () { snd("chip"); ball.classList.add("jig"); }, 800);
        }, ms(BALL_DROP_AT_MS));
      }
      later(function () {
        var back = roulettePayout(ro.sel, ro.n, ro.bet);
        pay(back, "roulette");
        var col = rouletteColor(ro.n);
        if (back > 0) { ro.msg = "You win " + (back - ro.bet) + " coins!"; ro.win = true; }
        else { ro.msg = col[0].toUpperCase() + col.slice(1) + " " + ro.n + ". You lose " + ro.bet + " coins."; ro.win = false; }
        settleFeel(ro.bet, back, "Roulette");
        ro.hist.unshift(ro.n);
        ro.phase = "done"; updCoins(); roRefresh();
      }, ms(WHEEL_SPIN_MS + 300));
    }

    // ===== higher / lower =====
    function hlPot() { return Math.floor(hl.bet * hl.mult); }
    function x2(m) { return "×" + m.toFixed(2); }
    function hlSkel() {
      return '<div class="cz-game"><div class="cz-hlt"><div class="cz-hlplate">HIGHER · LOWER</div><div class="cz-hlrow">' +
        '<div class="cz-slot"><div class="cz-pile"><i></i><i></i><i></i></div><small>DECK</small></div>' +
        '<div class="cz-slot"><div class="cz-cw empty" id="hl-cur"></div><small>CURRENT</small></div>' +
        '<div class="cz-slot"><div class="cz-cw" id="hl-next"></div><small>NEXT</small></div></div>' +
        '<div class="cz-hlmult" id="hl-mult"></div><div class="cz-pot" id="hl-pot"></div><div class="cz-hlhint" id="hl-hint"></div></div>' +
        '<div id="hl-msg"></div><div id="hl-ctl"></div></div>';
    }
    function hlShowCur(anim) {
      var cur = $("#hl-cur"), nx = $("#hl-next");
      if (cur) {
        cur.innerHTML = "";
        cur.classList.remove("slide");
        if (hl.cur) {
          cur.classList.remove("empty");
          var n = cardNode(hl.cur, false); n.className += " noanim up"; n.querySelector(".cz-cf").innerHTML += hiloVal(hl.cur); cur.appendChild(n);
          if (anim) { void cur.offsetWidth; cur.classList.add("slide"); }
        } else cur.classList.add("empty");
      }
      if (nx) {
        nx.innerHTML = "";
        if (hl.cur) { var b = cardNode({ r: 1, s: "♠" }, true); b.className += " noanim"; nx.appendChild(b); }
        else nx.className = "cz-cw empty";
        if (hl.cur) nx.className = "cz-cw";
      }
    }
    function hlRestore() { hlShowCur(false); hlRefresh(); }
    function hlRefresh() {
      header();
      if (view !== "hl") return;
      var inPlay = hl.phase === "play" || hl.phase === "reveal";
      setHtml("#hl-mult", inPlay ? "Pot " + x2(hl.mult) : "");
      setHtml("#hl-pot", inPlay ? hlPot() + " coins" : "");
      setHtml("#hl-hint", hl.phase === "done" ? "" : "Tie loses unless you pick Same · A=1 J=11 Q=12 K=13");
      setHtml("#hl-msg", msgBox(hl.msg, hl.win));
      var h = "";
      if (inPlay) {
        var dis = hl.phase === "reveal" ? " disabled" : "", o = hiloOdds(hl.cur);
        h = '<div class="cz-row"><button class="cz-stand cz-hlbtn" data-a="hl-higher"' + (!o.higher || dis ? " disabled" : "") + '>▲ Higher<small>' + (o.higher ? x2(o.higher) : "impossible") + '</small></button>' +
          '<button class="cz-dbl cz-hlbtn" data-a="hl-lower"' + (!o.lower || dis ? " disabled" : "") + ">▼ Lower<small>" + (o.lower ? x2(o.lower) : "impossible") + "</small></button></div>";
        h += '<button class="cz-hlbtn cz-hlsame" data-a="hl-same"' + dis + '>= Same rank<small>' + x2(o.same) + "</small></button>";
        h += '<button class="cz-go" style="margin-top:8px" data-a="hl-cash"' + (hl.streak < 1 || dis ? " disabled" : "") + ">Cash out " + (hl.streak < 1 ? "" : "(" + hlPot() + ")") + "</button>";
      } else {
        h = canBet() ? betPicker() + '<button class="cz-go" data-a="hl-start"' + goDis() + '>' + (hl.phase === "done" ? "Play again" : "Start") + " (" + curBet() + ")</button>" : broke();
      }
      setHtml("#hl-ctl", h);
    }
    function hlStart() {
      var b = takeBet("higher/lower");
      if (!b) return hlRefresh();
      hl.bet = b; hl.streak = 0; hl.mult = 1; hl.cur = hiloDraw(); hl.phase = "play"; hl.msg = ""; hl.win = null;
      updCoins(); hlShowCur(true); hlRefresh(); snd("click");
    }
    function hlGuess(guess) {
      if (hl.phase !== "play") return;
      var m = hiloOdds(hl.cur)[guess];
      if (!m) return;
      var nx = hiloDraw(), res = hiloResult(hl.cur, nx, guess);
      snd("click");
      hl.phase = "reveal"; hlRefresh();
      var slot = $("#hl-next"), card = slot && slot.firstChild;
      if (card) { card.querySelector(".cz-cf").innerHTML = faceHtml(nx) + hiloVal(nx); if (isRed(nx.s)) card.classList.add("red"); card.classList.remove("noanim"); void card.offsetWidth; card.classList.add("up"); }
      later(function () {
        hl.phase = "play";
        if (res === "lose") {
          var tie = nx.r === hl.cur.r;
          hl.cur = nx; hl.phase = "done"; hl.msg = (tie ? "Same rank, house wins! It was " : "Wrong! It was ") + hiloName(nx) + ". The pot is gone: you lose " + hl.bet + " coins.";
          hl.win = false; snd("lose");
        } else {
          hl.streak++; hl.cur = nx; hl.win = true; hl.mult = hl.mult * m;
          if (hl.mult >= HILO_MAX_MULT) { hl.mult = HILO_MAX_MULT; hlShowCur(true); return hlCash("Max pot reached! "); }
          hl.msg = "Right! Pot is now " + hlPot() + " coins.";
        }
        hlShowCur(true); hlRefresh();
      }, ms(SLIDE_MS + 650));
    }
    function hlCash(prefix) {
      if (hl.phase !== "play" || hl.streak < 1) return;
      var back = hlPot();
      pay(back, "higher/lower");
      hl.phase = "done"; hl.win = back >= hl.bet;
      hl.msg = (prefix || "") + "Cashed out " + back + " coins (" + (back >= hl.bet ? "+" : "") + (back - hl.bet) + ").";
      settleFeel(hl.bet, back, "Higher/Lower");
      updCoins(); hlRefresh();
    }

    // ===== video poker =====
    function vpSkel() {
      var slots = "", pay = "", i;
      for (i = 0; i < 5; i++) slots += '<div class="cz-vps" id="vp-s' + i + '" data-a="vp-hold" data-v="' + i + '" role="button" tabindex="0" aria-label="Card ' + (i + 1) + ', tap to hold"><div id="vp-c' + i + '"></div><em class="cz-held">HELD</em></div>';
      VP_PAYTABLE.forEach(function (r, k) { pay += '<div data-k="' + k + '"><span>' + r[0] + "</span><b>" + r[1] + "</b></div>"; });
      return '<div class="cz-game"><div class="cz-vpm"><div class="cz-vpt">★ JACKS OR BETTER ★</div><div class="cz-vpp" id="vp-pay">' + pay + "</div>" +
        '<div class="cz-vph">' + slots + '</div><div class="cz-vpbet" id="vp-bet"></div></div><div id="vp-msg"></div><div id="vp-ctl"></div></div>';
    }
    function vpPut(i, c, faceUp, anim, flipDelay) {
      var box = $("#vp-c" + i);
      if (!box) return;
      box.innerHTML = "";
      var n = cardNode(c, false);
      if (!anim) n.className += " noanim" + (faceUp ? " up" : "");
      else {
        n.classList.add("cz-dealin");
        n.style.animationDelay = flipDelay + "ms";
        later(function () { var b2 = $("#vp-c" + i), cn = b2 && b2.firstChild; if (cn) cn.classList.add("up"); snd("click"); }, ms(flipDelay + 300));
      }
      box.appendChild(n);
    }
    function vpRestore() {
      for (var i = 0; i < vp.hand.length; i++) vpPut(i, vp.hand[i], true, false);
      if (!vp.hand.length) for (var k = 0; k < 5; k++) { var bx = $("#vp-c" + k); if (bx) bx.innerHTML = '<div class="cz-c noanim"><div class="cz-ci"><div class="cz-cb"></div></div></div>'; }
      vpRefresh();
    }
    function vpRefresh() {
      header();
      if (view !== "vp") return;
      var holding = vp.phase === "hold" || vp.phase === "drawing", i;
      for (i = 0; i < 5; i++) { var s = $("#vp-s" + i); if (s) s.classList.toggle("held", holding && !!vp.held[i]); }
      var rows = $("#vp-pay") ? $("#vp-pay").children : [];
      for (i = 0; i < rows.length; i++) rows[i].classList.toggle("lit", vp.phase === "done" && !!vp.rank && vp.rank.mult > 0 && VP_PAYTABLE[i][0] === vp.rank.name);
      var shown = vp.phase === "bet" || vp.phase === "done" ? (canBet() ? curBet() : 0) : vp.bet;
      setHtml("#vp-bet", shown ? "BET " + shown : "");
      setHtml("#vp-msg", msgBox(vp.phase === "hold" ? "Tap the cards you want to HOLD, then press Draw." : vp.msg, vp.phase === "hold" ? null : vp.win));
      var h;
      if (vp.phase === "bet" || vp.phase === "done") h = canBet() ? betPicker() + '<button class="cz-go" data-a="vp-deal"' + goDis() + '>' + (vp.phase === "done" ? "Deal again" : "Deal") + " (" + curBet() + ")</button>" : broke();
      else h = '<button class="cz-go" data-a="vp-draw"' + (vp.phase === "hold" ? "" : " disabled") + ">" + (vp.phase === "hold" ? "Draw" : "…") + "</button>";
      setHtml("#vp-ctl", h);
    }
    function vpDeal() {
      if (vp.phase !== "bet" && vp.phase !== "done") return;
      var b = takeBet("video poker");
      if (!b) return vpRefresh();
      vp.bet = b; vp.deck = makeDeck(); vp.hand = []; vp.held = [false, false, false, false, false]; vp.rank = null; vp.msg = ""; vp.win = null;
      for (var i = 0; i < 5; i++) vp.hand.push(vp.deck.pop());
      vp.phase = "dealing"; updCoins();
      for (i = 0; i < 5; i++) vpPut(i, vp.hand[i], false, true, i * VP_STEP_MS);
      vpRefresh();
      later(function () { vp.phase = "hold"; vpRefresh(); }, ms(5 * VP_STEP_MS + 400));
    }
    function vpToggle(i) {
      if (vp.phase !== "hold" || !(i >= 0 && i < 5)) return;
      vp.held[i] = !vp.held[i]; snd("click"); vpRefresh();
    }
    function vpDraw() {
      if (vp.phase !== "hold") return;
      vp.phase = "drawing"; snd("click");
      var k = 0, i;
      for (i = 0; i < 5; i++) {
        if (vp.held[i]) continue;
        vp.hand[i] = vp.deck.pop();
        vpPut(i, vp.hand[i], false, true, k * VP_STEP_MS); k++;
      }
      vpRefresh();
      later(function () {
        vp.rank = videoPokerRank(vp.hand);
        var back = videoPokerPayout(vp.hand, vp.bet);
        pay(back, "video poker");
        if (back > 0) { vp.msg = (vp.rank.mult >= 4 ? "🎉 " : "") + vp.rank.name + "! " + (back > vp.bet ? "You win " + (back - vp.bet) + " coins!" : "Your bet comes back."); vp.win = back > vp.bet ? true : null; }
        else { vp.msg = "No win. You lose " + vp.bet + " coins."; vp.win = false; }
        settleFeel(vp.bet, back, "Video Poker");
        vp.phase = "done"; updCoins(); vpRefresh();
      }, ms(k * VP_STEP_MS + 450));
    }

    // ===== baccarat =====
    function baSkel() {
      return '<div class="cz-game"><div class="cz-bat"><div class="cz-shoe cz-bashoe" id="ba-shoe"><i></i><i></i><i></i></div>' +
        '<div class="cz-bacols"><div class="cz-bacol"><div class="cz-balbl" id="ba-pl">PLAYER</div><div class="cz-bah" id="ba-p"></div></div>' +
        '<div class="cz-bacol"><div class="cz-balbl" id="ba-bl">BANKER</div><div class="cz-bah" id="ba-b"></div></div></div></div>' +
        '<div class="cz-board" id="ba-board" style="margin-top:8px"></div><div id="ba-msg"></div><div id="ba-ctl"></div></div>';
    }
    function baRestore() {
      var ph = $("#ba-p"), bh = $("#ba-b");
      ba.visP = []; ba.visB = [];
      if (ba.res && ba.phase === "done") {
        ba.res.player.forEach(function (c) { var n = cardNode(c, false); n.className += " noanim up"; ph.appendChild(n); ba.visP.push(c); });
        ba.res.banker.forEach(function (c) { var n = cardNode(c, false); n.className += " noanim up"; bh.appendChild(n); ba.visB.push(c); });
      }
      baRefresh();
    }
    function baLabels() {
      var pl = $("#ba-pl"), bl = $("#ba-bl");
      if (pl) pl.textContent = "PLAYER" + (ba.visP.length ? " · " + baccaratValue(ba.visP) : "");
      if (bl) bl.textContent = "BANKER" + (ba.visB.length ? " · " + baccaratValue(ba.visB) : "");
    }
    function baRefresh() {
      header();
      if (view !== "ba") return;
      baLabels();
      var pl = $("#ba-pl"), bl = $("#ba-bl"), done = ba.phase === "done" && ba.res;
      if (pl) pl.classList.toggle("win", !!done && ba.res.winner === "player");
      if (bl) bl.classList.toggle("win", !!done && ba.res.winner === "banker");
      var board = ba.phase === "deal" ? "🃏 No more bets…" : "Place your bet";
      if (ba.hist.length) {
        board += ' <span style="opacity:.7;margin-left:6px">last</span> ';
        ba.hist.slice(0, 10).forEach(function (w) { board += '<span class="cz-dot ' + w[0] + '">' + w[0].toUpperCase() + "</span>"; });
      }
      setHtml("#ba-board", board);
      setHtml("#ba-msg", msgBox(ba.msg, ba.win));
      var h = "";
      if (ba.phase === "deal") h = '<div class="cz-msg">Dealing…</div>';
      else {
        var bv = curBet(), plc = bv >= MIN_BET ? '<i class="cz-plc ' + denomClass(bv) + '">' + bv + "</i>" : "";
        h = '<div class="cz-bz">' +
          '<button class="bp' + (ba.on === "player" ? " cz-on" : "") + '" data-a="ba-on" data-v="player">Player<small>pays 1 : 1</small>' + (ba.on === "player" ? plc : "") + "</button>" +
          '<button class="bt' + (ba.on === "tie" ? " cz-on" : "") + '" data-a="ba-on" data-v="tie">Tie<small>pays 8 : 1</small>' + (ba.on === "tie" ? plc : "") + "</button>" +
          '<button class="bb' + (ba.on === "banker" ? " cz-on" : "") + '" data-a="ba-on" data-v="banker">Banker<small>pays 0.95 : 1</small>' + (ba.on === "banker" ? plc : "") + "</button></div>";
        h += canBet() ? betPicker() + '<button class="cz-go" data-a="ba-deal"' + goDis() + '>Deal on ' + ba.on[0].toUpperCase() + ba.on.slice(1) + " (" + curBet() + ")</button>" : broke();
        h += '<div class="cz-total" style="text-align:center;margin-top:8px">Closest to 9 wins. A = 1, 10/J/Q/K = 0. Player or Banker bets push on a Tie.</div>';
      }
      setHtml("#ba-ctl", h);
    }
    function baDeal() {
      if (ba.phase === "deal") return;
      var b = takeBet("baccarat");
      if (!b) return baRefresh();
      ba.bet = b; ba.betOn = ba.on; ba.res = baccaratPlay(); ba.msg = ""; ba.win = null; ba.phase = "deal"; ba.visP = []; ba.visB = [];
      setHtml("#ba-p", ""); setHtml("#ba-b", "");
      updCoins(); baRefresh();
      var res = ba.res;
      res.deals.forEach(function (d, i) {
        later(function () {
          var hand = $(d.who === "p" ? "#ba-p" : "#ba-b");
          if (!hand) return;
          dealTo(hand, d.card, false, 0, function () { (d.who === "p" ? ba.visP : ba.visB).push(d.card); baLabels(); }, "#ba-shoe");
        }, ms(i * BACC_STEP_MS));
      });
      later(baSettle, ms(res.deals.length * BACC_STEP_MS + SLIDE_MS + 450));
    }
    function baSettle() {
      var r = ba.res, back = baccaratPayout(ba.betOn, r.winner, ba.bet);
      pay(back, "baccarat");
      var who = r.winner === "tie" ? "Tie " + r.pTotal + " - " + r.bTotal : (r.winner === "player" ? "Player " : "Banker ") + "wins " + (r.winner === "player" ? r.pTotal + " to " + r.bTotal : r.bTotal + " to " + r.pTotal);
      var pre = (r.natural ? "Natural! " : "") + who + ". ";
      if (back > ba.bet) { ba.msg = pre + "You win " + (back - ba.bet) + " coins!"; ba.win = true; }
      else if (back === ba.bet) { ba.msg = pre + "Push: your " + ba.bet + " coins come back."; ba.win = null; }
      else { ba.msg = pre + "You lose " + ba.bet + " coins."; ba.win = false; }
      settleFeel(ba.bet, back, "Baccarat");
      ba.hist.unshift(r.winner); if (ba.hist.length > 12) ba.hist.length = 12;
      ba.phase = "done"; updCoins(); baRefresh();
    }

    // ===== craps (pass line) =====
    var PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
    function dieFace(n) {
      var h = "";
      for (var i = 1; i <= 9; i++) h += "<i" + (PIPS[n].indexOf(i) >= 0 ? ' class="on"' : "") + "></i>";
      return h;
    }
    function crSkel() {
      var pts = "";
      [4, 5, 6, 8, 9, 10].forEach(function (p) { pts += '<div data-p="' + p + '">' + p + "</div>"; });
      return '<div class="cz-game"><div class="cz-crt"><div class="cz-balbl" style="text-align:center">CRAPS · PASS LINE</div>' +
        '<div class="cz-dice"><div class="cz-die" id="cr-d0" aria-hidden="true">' + dieFace(cr.d[0]) + '</div><div class="cz-die" id="cr-d1" aria-hidden="true">' + dieFace(cr.d[1]) + "</div></div>" +
        '<div class="cz-crtot" id="cr-tot"></div><div class="cz-pts" id="cr-pts">' + pts + '</div><div class="cz-pass" id="cr-pass"></div></div>' +
        '<div id="cr-msg"></div><div id="cr-ctl"></div></div>';
    }
    function crRestore() { crRefresh(); }
    function crRefresh() {
      header();
      if (view !== "cr") return;
      var pts = $("#cr-pts"), i;
      if (pts) for (i = 0; i < pts.children.length; i++) {
        var c = pts.children[i], on = cr.show === +c.getAttribute("data-p");
        c.classList.toggle("on", on);
        var pk = c.querySelector(".cz-puck");
        if (on && !pk) c.insertAdjacentHTML("beforeend", '<div class="cz-puck">ON</div>');
        if (!on && pk) pk.remove();
      }
      setHtml("#cr-tot", cr.phase === "bet" ? "Come-out roll" : cr.phase === "roll" ? "Rolling…" : "Rolled " + (cr.d[0] + cr.d[1]));
      var show = cr.phase === "bet" || cr.phase === "done" ? (canBet() ? curBet() : 0) : cr.bet;
      setHtml("#cr-pass", (show ? stackHtml(show, cr.phase === "bet" || cr.phase === "done" ? "ghost" : "") : "") + "<span>PASS LINE · pays 1 : 1</span>");
      setHtml("#cr-msg", msgBox(cr.msg, cr.win));
      var h;
      if (cr.phase === "bet" || cr.phase === "done") h = canBet() ? betPicker() + '<button class="cz-go" data-a="cr-roll"' + goDis() + '>Roll the dice (' + curBet() + ")</button>" : broke();
      else h = '<button class="cz-go" data-a="cr-roll"' + (cr.phase === "point" ? "" : " disabled") + ">" + (cr.phase === "point" ? "Roll again (no new bet)" : "Rolling…") + "</button>";
      if (cr.phase === "bet" || cr.phase === "done") h += '<div class="cz-total" style="text-align:center;margin-top:8px">Come-out: 7 or 11 wins, 2, 3 or 12 loses. Any other number is the point: roll it again before a 7.</div>';
      setHtml("#cr-ctl", h);
    }
    function crSetDice(a, b) {
      var d0 = $("#cr-d0"), d1 = $("#cr-d1");
      if (d0) d0.innerHTML = dieFace(a);
      if (d1) d1.innerHTML = dieFace(b);
    }
    function crRoll() {
      var fresh = cr.phase === "bet" || cr.phase === "done";
      if (!fresh && cr.phase !== "point") return;
      if (fresh) {
        var b = takeBet("craps");
        if (!b) return crRefresh();
        cr.bet = b; cr.point = null; cr.show = null; cr.msg = ""; cr.win = null; updCoins();
      }
      var a1 = 1 + Math.floor(Math.random() * 6), a2 = 1 + Math.floor(Math.random() * 6);
      cr.phase = "roll"; cr.msg = fresh ? "" : cr.msg; snd("spin");
      crRefresh();
      var d0 = $("#cr-d0"), d1 = $("#cr-d1"), t;
      if (d0) d0.classList.add("roll");
      if (d1) d1.classList.add("roll");
      for (t = 1; t <= DICE_TICKS; t++) later(function () { crSetDice(1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)); }, ms(t * DICE_TICK_MS));
      later(function () {
        var e0 = $("#cr-d0"), e1 = $("#cr-d1");
        if (e0) e0.classList.remove("roll");
        if (e1) e1.classList.remove("roll");
        cr.d = [a1, a2]; crSetDice(a1, a2); snd("chip");
        crResolve(a1, a2);
      }, ms((DICE_TICKS + 1) * DICE_TICK_MS));
    }
    function crResolve(a1, a2) {
      var st = crapsStep({ point: cr.point }, a1, a2), tot = a1 + a2;
      cr.point = st.state.point;
      if (st.result === "point") { cr.show = tot; cr.phase = "point"; cr.msg = "Point is " + tot + ". Roll " + tot + " again before a 7!"; cr.win = null; }
      else if (st.result === "roll") { cr.phase = "point"; cr.msg = "Rolled " + tot + ". Keep going: you need " + cr.show + ", a 7 loses."; cr.win = null; }
      else {
        var back = crapsPayout(st.result, cr.bet);
        pay(back, "craps");
        if (st.result === "win") { cr.msg = (cr.show ? "Made the point " + cr.show + "! " : "Natural " + tot + "! ") + "You win " + cr.bet + " coins."; cr.win = true; }
        else { cr.msg = (cr.show ? "Seven out! " : tot + " is craps. ") + "You lose " + cr.bet + " coins."; cr.win = false; }
        settleFeel(cr.bet, back, "Craps");
        cr.phase = "done"; updCoins();
      }
      crRefresh();
    }

    // ===== render + events =====
    function refresh() {
      if (!live()) return;
      updCoins();
      if (view === "bj") bjRefresh(); else if (view === "sl") slRefresh(); else if (view === "ro") roRefresh(); else if (view === "hl") hlRefresh(); else if (view === "vp") vpRefresh(); else if (view === "ba") baRefresh(); else if (view === "cr") crRefresh(); else header();
    }
    function render() {
      header(); updCoins();
      if (view === "lobby") stage.innerHTML = lobbyHtml();
      else if (view === "bj") { stage.innerHTML = bjSkel(); bjRestore(); }
      else if (view === "sl") { stage.innerHTML = slSkel(); slRestore(); }
      else if (view === "ro") { stage.innerHTML = roSkel(); roRefresh(); }
      else if (view === "vp") { stage.innerHTML = vpSkel(); vpRestore(); }
      else if (view === "ba") { stage.innerHTML = baSkel(); baRestore(); }
      else if (view === "cr") { stage.innerHTML = crSkel(); crRestore(); }
      else if (view === "bar") { stage.innerHTML = barSkel(); barRefresh(); }
      else { stage.innerHTML = hlSkel(); hlRestore(); }
      // While a game is open, the casino floor keeps living behind it, blurred
      try { document.body.classList.toggle("cz-fs", view === "lobby" && isFull()); } catch (e) { /* ignore */ }
      if (view === "lobby") {
        drawnTall = fullTall() + fullWide(); fitLobby(); lookUpdate();
        // the blurred floor stays behind the lobby until it has finished fading in, so the switch never shows a black frame
        later(function () { if (live() && view === "lobby" && !navBusy) { bgEl.classList.remove("on"); bgEl.innerHTML = ""; } }, ms(ZOOM_MS) + 80);
      } else bgFill(false);
    }
    // The blurred casino floor behind a game. now=true shows it at once (no fade from black) for a page switch.
    function bgFill(now) {
      if (!bgEl.innerHTML) bgEl.innerHTML = lobbySvg(false).replace('class="cz-roomsvg"', 'preserveAspectRatio="xMidYMid slice"').replace(/ data-a="open"/g, "");
      if (now) { bgEl.style.transition = "none"; bgEl.classList.add("on"); void bgEl.offsetWidth; bgEl.style.transition = ""; }
      else bgEl.classList.add("on");
    }
    // Shrink the floor so the whole thing fits on screen without scrolling (LOBBY_FIT_GAP px left below it)
    function fitLobby() {
      var room = stage.querySelector(".cz-room"), svgs = stage.querySelectorAll(".cz-roomsvg"); if (!room || !globalThis.innerHeight) return;
      if (isFull()) { room.style.width = ""; svgs.forEach(function (sv) { sv.style.width = ""; sv.style.height = ""; }); return; }
      // measure from the header and the stage's layout width: the stage itself may be mid zoom-animation (transformed)
      var head = rootEl.querySelector(".cz-head"), mt = parseFloat(getComputedStyle(stage).marginTop) || 0;
      var top = head.getBoundingClientRect().bottom + (globalThis.scrollY || 0) + mt, space = globalThis.innerHeight - top - LOBBY_FIT_GAP;
      var w = stage.clientWidth, h = w * LOBBY_H / 360;
      if (space > 200 && h > space) { h = space; w = h * 360 / LOBBY_H; }
      room.style.width = w + "px";
      svgs.forEach(function (sv) { sv.style.width = w + "px"; sv.style.height = h + "px"; });
    }
    var jp = JACKPOT_START, jpT = setInterval(function () {
      if (!live()) return clearInterval(jpT);
      jp += 1 + Math.floor(Math.random() * 37);
      var t = el.querySelector("#czl-jp"); if (t) t.textContent = jp.toLocaleString("en-US");
    }, JACKPOT_TICK_MS);
    try { globalThis.addEventListener("resize", function () { if (!live() || view !== "lobby") return; if (Math.abs(fullTall() + fullWide() - drawnTall) > 8) render(); else fitLobby(); }); } catch (e) { /* ignore */ }
    function go(v, from) {
      if (navBusy || !live() || v === view) return;
      if (v === "lobby" && locked()) return;
      navBusy = true;
      if (from && from.getBoundingClientRect) {
        var r = from.getBoundingClientRect(), s = stage.getBoundingClientRect();
        stage.style.transformOrigin = ((r.left + r.width / 2 - s.left) / s.width * 100) + "% " + ((r.top + r.height / 2 - s.top) / s.height * 100) + "%";
      }
      bgFill(true);
      stage.className = "cz-stage " + (v === "lobby" ? "cz-outg" : "cz-outl");
      snd("click");
      later(function () {
        navBusy = false;
        if (!live()) return;
        view = v;
        stage.style.transformOrigin = "";
        stage.className = "cz-stage " + (v === "lobby" ? "cz-inl" : "cz-ing");
        render();
        // drop the zoom class when it's done: a finished transform animation would still pin the full-screen floor inside the stage
        later(function () { if (live() && view === v) stage.className = "cz-stage"; }, ms(ZOOM_MS) + 60);
      }, ms(ZOOM_MS));
    }

    function act(t) {
      var a = t.getAttribute("data-a"), v = t.getAttribute("data-v");
      switch (a) {
        case "open": return go(v, t);
        case "turn": return turn(+v);
        case "drink": return barOrder(v);
        case "back": return go("lobby");
        case "chip": if (g.all) g.bet = 0; g.all = false; g.bet = Math.min(api.coins(), (g.bet || 0) + (+v)); snd("chip"); return refresh();
        case "clear": g.all = false; g.bet = 0; snd("click"); return refresh();
        case "allin": g.all = true; snd("chip"); return refresh();
        case "bj-deal": return bjDeal();
        case "bj-hit": return bjHit();
        case "bj-stand": return bjStand();
        case "bj-dbl": return bjDouble();
        case "sl-spin": return slSpin(false);
        case "ro-pick": if (ro.phase === "spin") return; ro.sel = { type: v }; snd("click"); return roRefresh();
        case "ro-num": if (ro.phase === "spin") return; ro.sel = { type: "number", value: +v }; snd("click"); return roRefresh();
        case "ro-spin": return roSpin();
        case "hl-start": return hlStart();
        case "hl-higher": return hlGuess("higher");
        case "hl-lower": return hlGuess("lower");
        case "hl-same": return hlGuess("same");
        case "hl-cash": return hlCash();
        case "vp-deal": return vpDeal();
        case "vp-draw": return vpDraw();
        case "vp-hold": return vpToggle(+v);
        case "ba-on": if (ba.phase === "deal") return; ba.on = v; snd("click"); return baRefresh();
        case "ba-deal": return baDeal();
        case "cr-roll": return crRoll();
      }
    }
    var swipe = null, swipeBlock = 0;
    rootEl.addEventListener("pointerdown", function (e) { if (view === "lobby" && e.target.closest && e.target.closest(".cz-pano")) swipe = { x: e.clientX, y: e.clientY }; });
    rootEl.addEventListener("pointerup", function (e) {
      if (!swipe) return; var dx = e.clientX - swipe.x, dy = e.clientY - swipe.y; swipe = null;
      if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.3) { swipeBlock = Date.now() + 400; turn(dx < 0 ? 1 : -1); }
    });
    rootEl.addEventListener("click", function (e) {
      if (Date.now() < swipeBlock) return;
      var t = e.target.closest ? e.target.closest("[data-a]") : null;
      if (!t || t.disabled || !live()) return;
      act(t);
    });
    rootEl.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var lv = e.target.closest && e.target.closest("#sl-lv");
      if (lv) { e.preventDefault(); return slSpin(false); }
      var t = e.target.closest ? e.target.closest("g[data-a],.cz-vps[data-a]") : null;
      if (t && live()) { e.preventDefault(); act(t); }
    });
    // slot lever: tap it, or drag it down
    var drag = null;
    rootEl.addEventListener("pointerdown", function (e) {
      var lv = e.target.closest && e.target.closest("#sl-lv");
      if (!lv || !slReady()) return;
      drag = { y: e.clientY, max: 0, lv: lv };
      try { lv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      e.preventDefault();
    });
    rootEl.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var dy = Math.max(0, Math.min(70, e.clientY - drag.y));
      drag.max = Math.max(drag.max, dy);
      setLever(dy / 70, true);
    });
    function dragEnd(e) {
      if (!drag) return;
      var d = drag; drag = null;
      var pulled = e.type === "pointerup" && (d.max < 6 || d.max >= 40);
      if (pulled && d.max >= 6) { setLever(0, false); slSpin(true); }
      else if (pulled) slSpin(false);
      else setLever(0, false);
    }
    rootEl.addEventListener("pointerup", dragEnd);
    rootEl.addEventListener("pointercancel", dragEnd);

    render();
  }

  globalThis.RRCasino = { logic: logic, mount: mount };
})();
