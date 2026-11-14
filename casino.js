/* Root Rush casino. Plain script: sets globalThis.RRCasino = {logic, mount}.
   Loads in Node (no document/window access at load time). See docs/economy-contract.md. */
(function () {
  "use strict";

  // ---------- tunables ----------
  var CHIPS = [10, 25, 50, 100];
  var MIN_BET = 10;
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

  var HILO_MULT = [1, 1.5, 2.2, 3.3, 5, 7.5, 11];
  function rankOf(x) { return typeof x === "object" && x !== null ? x.r : x; }
  function hiloResult(cur, next, guess) {
    var a = rankOf(cur), b = rankOf(next);
    if (a === b) return "push";
    if (guess === "higher") return b > a ? "win" : "lose";
    return b < a ? "win" : "lose";
  }

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
      '<radialGradient id="czw-cone" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#5a3a1c"/><stop offset="1" stop-color="#1b0e06"/></radialGradient>';
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
    for (i = 0; i < 37; i++) {
      var m = (i + 0.5) * POCKET_DEG;
      s += '<text transform="rotate(' + m.toFixed(3) + ') translate(0 -82)" y="3" text-anchor="middle" font-size="9" font-weight="800" fill="#fff" font-family="inherit">' + WHEEL_ORDER[i] + "</text>";
    }
    s += '<circle r="58" fill="#3a2212" stroke="#d9b45a" stroke-width="1.5"/><circle r="47" fill="url(#czw-gold)"/><circle r="31" fill="url(#czw-cone)" stroke="#6b4a10" stroke-width="1"/>';
    for (i = 0; i < 4; i++) s += '<rect x="-2" y="-46" width="4" height="30" rx="2" fill="#f3d37a" transform="rotate(' + (i * 90 + 45) + ')"/>';
    s += '<circle r="9" fill="url(#czw-gold)" stroke="#6b4a10"/><circle r="3" fill="#fff6c8"/>';
    return s;
  }
  function wheelSvg() {
    return '<svg viewBox="-114 -114 228 228" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>' + wheelDefs() + "</defs>" + wheelInner() + "</svg>";
  }

  var logic = {
    makeDeck: makeDeck, handValue: handValue, isBlackjack: isBlackjack,
    dealerShouldHit: dealerShouldHit, settleBlackjack: settleBlackjack,
    SLOT_SYMBOLS: SLOT_SYMBOLS, spinReels: spinReels, slotPayout: slotPayout,
    ROULETTE_REDS: ROULETTE_REDS, rouletteColor: rouletteColor, roulettePayout: roulettePayout,
    HILO_MULT: HILO_MULT, hiloResult: hiloResult,
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
    ".cz-room{display:flex;justify-content:center}",
    ".cz-roomsvg{width:100%;height:auto;max-height:calc(100vh - 150px);max-height:calc(100dvh - 150px);display:block;border-radius:14px;box-shadow:0 0 0 2px #7a5513,0 6px 24px rgba(0,0,0,.5);-webkit-tap-highlight-color:transparent}",
    ".cz-spot{cursor:pointer;outline:none}",
    ".cz-spot:focus-visible{outline:2px solid #ffe08a}",
    ".cz-spot:not(.can){opacity:.62}",
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
    ".cz-lad{display:flex;align-items:flex-end;gap:4px;height:74px;margin:12px 4px 4px}",
    ".cz-lad span{flex:1;text-align:center;font-size:11px;font-weight:800;padding-top:4px;border-radius:6px 6px 2px 2px;background:rgba(0,0,0,.35);color:#9bc3cc;border:1px solid rgba(255,255,255,.18);transition:background .3s,color .3s,box-shadow .3s}",
    ".cz-lad span.lit{background:linear-gradient(#ffe48a,#d9a62e);color:#3a2408;border-color:#fff3b0;box-shadow:0 0 12px rgba(255,214,90,.7)}",
    ".cz-lad span.now{box-shadow:0 0 0 2px #fff,0 0 16px rgba(255,214,90,.95)}",
    ".cz-pot{text-align:center;font-weight:800;font-size:16px;min-height:22px;color:#fff}",
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
  function cardNode(c, hole) {
    var d = document.createElement("div");
    d.className = "cz-c" + (isRed(c.s) ? " red" : "");
    d.innerHTML = '<div class="cz-ci"><div class="cz-cb"></div><div class="cz-cf">' + (hole ? "" : faceHtml(c)) + "</div></div>";
    return d;
  }

  // ---------- the casino room (lobby) ----------
  var SPOT_NAMES = { bj: "Blackjack", sl: "Slots", ro: "Roulette", hl: "Higher / Lower" };

  function lobbySvg(can) {
    var i, k, x, n, s = [];
    function spotOpen(id) {
      return '<g class="cz-spot' + (can ? " can" : "") + '" data-a="open" data-v="' + id + '" role="button" tabindex="0" aria-label="' + SPOT_NAMES[id] + ", minimum bet " + MIN_BET + ' coins">';
    }
    function plaque(cx, y, w, name) {
      return '<rect x="' + (cx - w / 2) + '" y="' + y + '" width="' + w + '" height="30" rx="8" fill="url(#czl-gold)" stroke="#6b4a10" stroke-width="1.5"/>' +
        '<text x="' + cx + '" y="' + (y + 13) + '" text-anchor="middle" font-size="11.5" font-weight="800" fill="#3a2408" font-family="inherit">' + name + "</text>" +
        '<text x="' + cx + '" y="' + (y + 25) + '" text-anchor="middle" font-size="9.5" font-weight="700" fill="#5a3b0c" font-family="inherit">min bet ' + MIN_BET + "</text>";
    }
    s.push('<svg class="cz-roomsvg" viewBox="0 0 360 500" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Root Rush Casino floor">');
    s.push("<defs>",
      '<pattern id="czl-carpet" width="30" height="30" patternUnits="userSpaceOnUse"><rect width="30" height="30" fill="#8a1426"/><path d="M15 2L28 15 15 28 2 15Z" fill="none" stroke="#d3a950" stroke-opacity=".5" stroke-width="1.1"/><path d="M15 9L21 15 15 21 9 15Z" fill="#650d1b"/><circle cx="0" cy="0" r="2.2" fill="#d3a950" fill-opacity=".45"/><circle cx="30" cy="0" r="2.2" fill="#d3a950" fill-opacity=".45"/><circle cx="0" cy="30" r="2.2" fill="#d3a950" fill-opacity=".45"/><circle cx="30" cy="30" r="2.2" fill="#d3a950" fill-opacity=".45"/></pattern>',
      '<radialGradient id="czl-vig" cx="50%" cy="50%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".55"/></radialGradient>',
      '<radialGradient id="czl-felt" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#22995a"/><stop offset="1" stop-color="#0d5a31"/></radialGradient>',
      '<radialGradient id="czl-felt2" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#2a93ad"/><stop offset="1" stop-color="#0d4558"/></radialGradient>',
      '<linearGradient id="czl-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f9e08e"/><stop offset="1" stop-color="#b98a24"/></linearGradient>',
      '<linearGradient id="czl-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b3f22"/><stop offset="1" stop-color="#2e170b"/></linearGradient>',
      '<linearGradient id="czl-mach" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e0314a"/><stop offset="1" stop-color="#7a0c1e"/></linearGradient>',
      '<radialGradient id="czl-glow"><stop offset="0" stop-color="#ffe08a" stop-opacity=".9"/><stop offset="1" stop-color="#ffe08a" stop-opacity="0"/></radialGradient>',
      '<filter id="czl-neon" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
      wheelDefs(), "</defs>");
    // carpet, wall, trim
    s.push('<rect width="360" height="500" fill="url(#czl-carpet)"/><rect width="360" height="500" fill="url(#czl-vig)"/>');
    s.push('<rect width="360" height="66" fill="url(#czl-wood)"/><rect y="66" width="360" height="3" fill="url(#czl-gold)"/>');
    for (i = 0; i < 9; i++) s.push('<rect x="' + (10 + i * 40) + '" y="10" width="22" height="50" rx="3" fill="#000" fill-opacity=".18"/>');
    s.push('<circle cx="22" cy="40" r="6" fill="#ffe9a0"/><circle cx="22" cy="40" r="16" fill="url(#czl-glow)" opacity=".6"/><circle cx="338" cy="40" r="6" fill="#ffe9a0"/><circle cx="338" cy="40" r="16" fill="url(#czl-glow)" opacity=".6"/>');
    s.push('<rect x="5" y="5" width="350" height="490" rx="10" fill="none" stroke="url(#czl-gold)" stroke-width="3"/><rect x="10" y="10" width="340" height="480" rx="7" fill="none" stroke="#e8c05a" stroke-opacity=".4" stroke-width="1"/>');
    // neon sign
    s.push('<g class="cz-neon"><rect x="52" y="9" width="256" height="50" rx="12" fill="#14060a" stroke="#ff5fa2" stroke-width="2" filter="url(#czl-neon)"/>' +
      '<text x="180" y="35" text-anchor="middle" font-size="25" font-weight="900" letter-spacing="2.5" fill="#ff7ab5" stroke="#ffb0d3" stroke-width=".6" filter="url(#czl-neon)" font-family="inherit">ROOT RUSH</text>' +
      '<text x="180" y="52" text-anchor="middle" font-size="12" font-weight="800" letter-spacing="8" fill="#6ff3ff" filter="url(#czl-neon)" font-family="inherit">CASINO</text></g>');

    // slots
    s.push(spotOpen("sl"));
    s.push('<ellipse class="cz-glow" cx="180" cy="124" rx="170" ry="62" fill="url(#czl-glow)"/>');
    s.push('<rect x="18" y="74" width="324" height="124" fill="#000" fill-opacity="0.001"/>');
    var faces = [["🍒", "🍒", "🍋"], ["🔔", "💎", "🔔"], ["🍋", "🍒", "💎"]];
    for (i = 0; i < 3; i++) {
      x = 30 + i * 106;
      s.push('<rect x="' + x + '" y="82" width="78" height="86" rx="9" fill="url(#czl-mach)" stroke="#e8c05a" stroke-width="2"/>');
      for (k = 0; k < 6; k++) s.push('<circle class="cz-bulb" cx="' + (x + 9 + k * 12) + '" cy="89" r="2.4" style="animation-delay:' + ((k * 0.2 + i * 0.07).toFixed(2)) + 's"/>');
      s.push('<rect x="' + (x + 8) + '" y="96" width="62" height="10" rx="3" fill="#2a0610"/><text x="' + (x + 39) + '" y="104.5" text-anchor="middle" font-size="8" font-weight="800" fill="#ffd96a" letter-spacing="2" font-family="inherit">777</text>');
      s.push('<rect x="' + (x + 8) + '" y="109" width="62" height="34" rx="4" fill="#fff7dc"/>');
      for (k = 0; k < 3; k++) {
        s.push('<rect x="' + (x + 10 + k * 20) + '" y="111" width="18" height="30" rx="2" fill="#fff" stroke="#cfc4a0"/><text x="' + (x + 19 + k * 20) + '" y="132" text-anchor="middle" font-size="15">' + faces[i][k] + "</text>");
      }
      s.push('<line x1="' + (x + 8) + '" y1="126" x2="' + (x + 70) + '" y2="126" stroke="#ff3b3b" stroke-width="1.2" opacity=".85"/>');
      s.push('<rect x="' + (x + 10) + '" y="150" width="58" height="12" rx="3" fill="#1b0509"/><circle cx="' + (x + 22) + '" cy="156" r="3" fill="#f0b72c"/><circle cx="' + (x + 33) + '" cy="157" r="3" fill="#f0b72c"/>');
      s.push('<line x1="' + (x + 83) + '" y1="102" x2="' + (x + 83) + '" y2="126" stroke="#d8d8d8" stroke-width="2.5"/><circle cx="' + (x + 83) + '" cy="98" r="5" fill="#e03030" stroke="#7a0a0a"/>');
    }
    s.push(plaque(180, 170, 150, "SLOTS"));
    s.push("</g>");

    // blackjack (half-moon)
    s.push(spotOpen("bj"));
    s.push('<ellipse class="cz-glow" cx="100" cy="268" rx="100" ry="76" fill="url(#czl-glow)"/>');
    s.push('<rect x="10" y="206" width="180" height="158" fill="#000" fill-opacity="0.001"/>');
    s.push('<path d="M18 218 A82 82 0 0 0 182 218 Z" fill="url(#czl-felt)" stroke="#5a3218" stroke-width="9" stroke-linejoin="round"/>');
    s.push('<path d="M25 221 A75 75 0 0 0 175 221" fill="none" stroke="#e8c05a" stroke-width="1.2" stroke-opacity=".8"/>');
    s.push('<path id="czl-bjarc" d="M38 236 Q100 268 162 236" fill="none"/><text font-size="8.5" font-weight="800" fill="#f0cf74" letter-spacing=".8" text-anchor="middle" font-family="inherit"><textPath href="#czl-bjarc" startOffset="50%">BLACKJACK PAYS 3 TO 2</textPath></text>');
    s.push('<g transform="translate(100 224)"><rect x="-15" y="0" width="13" height="18" rx="2" fill="#fff" transform="rotate(-8)"/><rect x="2" y="0" width="13" height="18" rx="2" fill="#fff" transform="rotate(7)"/><text x="8.5" y="13" font-size="9" fill="#c0392b" text-anchor="middle" transform="rotate(7)">♥</text></g>');
    s.push('<g transform="translate(100 262)"><rect x="-17" y="0" width="15" height="21" rx="2" fill="#fff" transform="rotate(-6)"/><rect x="2" y="0" width="15" height="21" rx="2" fill="#fff" transform="rotate(8)"/><text x="-9.5" y="15" font-size="10" text-anchor="middle" transform="rotate(-6)">♠</text><text x="9.5" y="16" font-size="10" fill="#c0392b" text-anchor="middle" transform="rotate(8)">♦</text></g>');
    s.push('<ellipse cx="52" cy="266" rx="9" ry="5" fill="none" stroke="#e8c05a" stroke-dasharray="2 2"/><circle cx="52" cy="268" r="5" fill="#c0392b" stroke="#fff"/><circle cx="52" cy="264" r="5" fill="#2b6cb0" stroke="#fff"/><circle cx="52" cy="260" r="5" fill="#1c1c1c" stroke="#fff"/>');
    [[55, 314], [100, 322], [145, 314]].forEach(function (p) { s.push('<circle cx="' + p[0] + '" cy="' + p[1] + '" r="7.5" fill="#3b0a14" stroke="#e8c05a" stroke-width="1.5"/>'); });
    s.push(plaque(100, 334, 124, "BLACKJACK"));
    s.push("</g>");

    // roulette
    s.push(spotOpen("ro"));
    s.push('<ellipse class="cz-glow" cx="276" cy="262" rx="90" ry="70" fill="url(#czl-glow)"/>');
    s.push('<rect x="196" y="206" width="158" height="158" fill="#000" fill-opacity="0.001"/>');
    s.push('<rect x="208" y="216" width="136" height="92" rx="10" fill="url(#czl-felt)" stroke="#5a3218" stroke-width="7"/><rect x="214" y="222" width="124" height="80" rx="6" fill="none" stroke="#e8c05a" stroke-opacity=".7"/>');
    s.push('<g transform="translate(246 262) scale(.29)"><circle r="108" fill="#4a2a14" stroke="#e8c05a" stroke-width="5"/><circle r="97" fill="#101010"/><g class="cz-spin">' + wheelInner() + "</g></g>");
    s.push('<rect x="288" y="223" width="50" height="10" rx="2" fill="#0b7a48" stroke="#fff" stroke-opacity=".5" stroke-width=".6"/>');
    for (n = 1; n <= 18; n++) {
      s.push('<rect x="' + (288 + ((n - 1) % 3) * 17) + '" y="' + (235 + Math.floor((n - 1) / 3) * 11.5) + '" width="16" height="10.5" rx="2" fill="' + pocketFill(rouletteColor(n)) + '" stroke="#fff" stroke-opacity=".5" stroke-width=".6"/>');
    }
    s.push('<circle cx="304" cy="262" r="4.5" fill="#e8c05a" stroke="#fff"/><circle cx="321" cy="274" r="4.5" fill="#2b6cb0" stroke="#fff"/>');
    [[225, 320], [276, 322], [327, 320]].forEach(function (p) { s.push('<circle cx="' + p[0] + '" cy="' + p[1] + '" r="6.5" fill="#3b0a14" stroke="#e8c05a" stroke-width="1.5"/>'); });
    s.push(plaque(276, 334, 124, "ROULETTE"));
    s.push("</g>");

    // higher / lower
    s.push(spotOpen("hl"));
    s.push('<ellipse class="cz-glow" cx="180" cy="408" rx="150" ry="52" fill="url(#czl-glow)"/>');
    s.push('<rect x="40" y="368" width="280" height="126" fill="#000" fill-opacity="0.001"/>');
    s.push('<rect x="52" y="378" width="256" height="58" rx="29" fill="url(#czl-felt2)" stroke="#5a3218" stroke-width="8"/><rect x="60" y="386" width="240" height="42" rx="21" fill="none" stroke="#e8c05a" stroke-opacity=".7"/>');
    s.push('<rect x="84" y="396" width="20" height="26" rx="3" fill="#a01c34" stroke="#fff" transform="translate(-2 2)"/><rect x="84" y="396" width="20" height="26" rx="3" fill="#a01c34" stroke="#fff"/>');
    s.push('<g transform="translate(150 394)"><rect width="22" height="30" rx="3" fill="#fff"/><text x="11" y="14" font-size="11" font-weight="800" text-anchor="middle" fill="#1d1d1b">K</text><text x="11" y="26" font-size="11" text-anchor="middle" fill="#1d1d1b">♣</text></g>');
    s.push('<g transform="translate(184 394)"><rect width="22" height="30" rx="3" fill="#a01c34" stroke="#fff"/></g>');
    s.push('<text x="236" y="412" font-size="13" fill="#ffe08a" text-anchor="middle" font-weight="800" font-family="inherit">▲</text><text x="236" y="426" font-size="13" fill="#ffe08a" text-anchor="middle" font-weight="800" font-family="inherit">▼</text><text x="272" y="420" font-size="14" fill="#ffe08a" text-anchor="middle" font-weight="800" font-family="inherit">x11</text>');
    [[100, 446], [180, 450], [260, 446]].forEach(function (p) { s.push('<circle cx="' + p[0] + '" cy="' + p[1] + '" r="7" fill="#3b0a14" stroke="#e8c05a" stroke-width="1.5"/>'); });
    s.push(plaque(180, 460, 150, "HIGHER / LOWER"));
    s.push("</g>");

    // decor: plants, sparkles, drifting chips
    [[26, 468], [334, 468]].forEach(function (p) {
      s.push('<g transform="translate(' + p[0] + " " + p[1] + ')"><path d="M-9 4 L9 4 L6 18 L-6 18Z" fill="#6b3f22" stroke="#e8c05a" stroke-width="1"/><circle cx="0" cy="-4" r="9" fill="#1f7a3c"/><circle cx="-7" cy="0" r="6" fill="#2a9a4c"/><circle cx="7" cy="0" r="6" fill="#2a9a4c"/></g>');
    });
    [[70, 200, 0], [300, 196, 2.4], [150, 358, 4.1], [30, 270, 5.3], [210, 205, 6.2]].forEach(function (p) {
      s.push('<g transform="translate(' + p[0] + " " + p[1] + ')"><path class="cz-sp" style="animation-delay:' + p[2] + 's" d="M0-6 L1.5-1.5 6 0 1.5 1.5 0 6-1.5 1.5-6 0-1.5-1.5Z" fill="#ffe9a0"/></g>');
    });
    [[46, 360, 1], [340, 380, 6.5], [190, 195, 9]].forEach(function (p) {
      s.push('<g transform="translate(' + p[0] + " " + p[1] + ')"><g class="cz-drift" style="animation-delay:' + p[2] + 's"><circle r="4.5" fill="#c0392b" stroke="#fff" stroke-width="1.2"/><circle r="2" fill="none" stroke="#fff" stroke-dasharray="1 1.4"/></g></g>');
    });
    s.push("</svg>");
    return s.join("");
  }

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
    var hl = { phase: "bet", deck: [], cur: null, streak: 0, bet: 0, msg: "", win: null };

    el.innerHTML = '<div class="cz"><div class="cz-head"><div id="cz-left"></div><div class="cz-plaque" id="cz-coins"></div></div><div class="cz-stage" id="cz-stage"></div></div>';
    var rootEl = el.firstChild;
    var leftEl = rootEl.querySelector("#cz-left");
    var coinsEl = rootEl.querySelector("#cz-coins");
    var stage = rootEl.querySelector("#cz-stage");
    function $(sel) { return stage.querySelector(sel); }

    function updCoins() { coinsEl.textContent = "🪙 " + api.coins(); }
    function locked() {
      return (view === "bj" && bj.phase !== "bet" && bj.phase !== "done") ||
        (view === "sl" && sl.phase === "spin") ||
        (view === "ro" && ro.phase === "spin") ||
        (view === "hl" && (hl.phase === "play" || hl.phase === "reveal"));
    }
    function header() {
      leftEl.innerHTML = view === "lobby" ? '<div class="cz-title">🎰 Casino floor</div>' :
        '<button class="cz-back" data-a="back"' + (locked() ? " disabled" : "") + ">← Back to floor</button>";
    }

    function normBet() {
      var c = api.coins();
      if (g.all) return;
      if (g.bet > c) {
        g.bet = MIN_BET;
        for (var i = 0; i < CHIPS.length; i++) if (CHIPS[i] <= c) g.bet = CHIPS[i];
      }
    }
    function curBet() { var c = api.coins(); return g.all ? c : Math.min(g.bet, c); }
    function canBet() { return api.coins() >= MIN_BET; }

    function betPicker() {
      normBet();
      var c = api.coins(), b = curBet(), h = '<div class="cz-sub" style="text-align:center">Your bet: ' + b + ' coins</div><div class="cz-bets">';
      CHIPS.forEach(function (v) {
        h += '<button class="cz-chb d' + v + (!g.all && b === v ? " on" : "") + '" data-a="chip" data-v="' + v + '" aria-label="Bet ' + v + '"' + (c < v ? " disabled" : "") + ">" + v + "</button>";
      });
      h += '<button class="cz-allin' + (g.all ? " on" : "") + '" data-a="allin"' + (c < MIN_BET ? " disabled" : "") + ">All in</button></div>";
      return h;
    }
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
    function lobbyHtml() { return '<div class="cz-room">' + lobbySvg(canBet()) + "</div>"; }

    // ===== blackjack =====
    function bjSkel() {
      return '<div class="cz-game"><div class="cz-bjt" id="bj-t">' +
        '<svg viewBox="0 0 358 350" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>' +
        '<radialGradient id="czb-felt" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#24a05f"/><stop offset="1" stop-color="#0c5230"/></radialGradient>' +
        '<path id="czb-arc1" d="M44 130 Q179 172 314 130" fill="none"/><path id="czb-arc2" d="M64 156 Q179 192 294 156" fill="none"/></defs>' +
        '<path d="M8 8 H350 V260 A100 80 0 0 1 250 340 H108 A100 80 0 0 1 8 260 Z" fill="url(#czb-felt)" stroke="#5a3218" stroke-width="10" stroke-linejoin="round"/>' +
        '<path d="M16 16 H342 V260 A92 72 0 0 1 250 332 H108 A92 72 0 0 1 16 260 Z" fill="none" stroke="#e8c05a" stroke-opacity=".75" stroke-width="1.5"/>' +
        '<text font-size="15" font-weight="900" fill="#f0cf74" letter-spacing="1.6" text-anchor="middle" font-family="inherit"><textPath href="#czb-arc1" startOffset="50%">BLACKJACK PAYS 3 TO 2</textPath></text>' +
        '<text font-size="9" font-weight="700" fill="#d3ecdb" letter-spacing="1.6" text-anchor="middle" font-family="inherit"><textPath href="#czb-arc2" startOffset="50%">DEALER STANDS ON ALL 17</textPath></text>' +
        '<circle cx="179" cy="202" r="29" fill="none" stroke="#e8c05a" stroke-opacity=".8" stroke-width="1.6" stroke-dasharray="4 3"/>' +
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
        h = canBet() ? betPicker() + '<button class="cz-go" data-a="bj-deal">' + (bj.phase === "done" ? "Deal again" : "Deal") + " (" + curBet() + ")</button>" : broke();
      } else {
        var play = bj.phase === "play", canDbl = play && bj.p.length === 2 && api.coins() >= bj.bet;
        h = '<div class="cz-row"><button data-a="bj-hit"' + (play ? "" : " disabled") + '>Hit</button><button class="cz-stand" data-a="bj-stand"' + (play ? "" : " disabled") + '>Stand</button><button class="cz-dbl" data-a="bj-dbl"' + (canDbl ? "" : " disabled") + ">Double</button></div>";
      }
      setHtml("#bj-ctl", h);
    }
    // slide a card from the shoe to its spot; face-up cards flip once they land
    function dealTo(handEl, c, hole, delay, onFlip) {
      var n = cardNode(c, hole);
      handEl.appendChild(n);
      var shoe = $("#bj-shoe");
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
      else h = canBet() ? betPicker() + '<button class="cz-go" data-a="sl-spin">Spin (' + curBet() + ")</button>" : broke();
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
        '<circle r="108" fill="url(#czr-wood)" stroke="#e8c05a" stroke-width="3"/><circle r="99" fill="#0f0a08" stroke="#8c6a2a" stroke-width="1.5"/><circle r="89.5" fill="#201208"/>' +
        '<path d="M-8 -113 L8 -113 L0 -97Z" fill="#f4d577" stroke="#6b4a10" stroke-width="1.2"/></svg>';
      return '<div class="cz-game"><div class="cz-board" id="ro-board"></div><div class="cz-wbox">' + bowl +
        '<div class="cz-wheel" id="ro-wheel" style="transform:rotate(' + ro.rot + 'deg)">' + wheelSvg() + "</div>" +
        '<div class="cz-arm" id="ro-arm" style="transform:rotate(' + ro.brot + 'deg)"><i class="cz-ball" id="ro-ball" style="top:' + (ro.n === null ? BALL_TRACK : BALL_POCKET) + '%"></i></div></div>' +
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
        h += (canBet() ? betPicker() + '<button class="cz-go" data-a="ro-spin"' + (ro.sel ? "" : " disabled") + ">Spin (" + curBet() + ")</button>" : broke());
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
    function hlPot() { return Math.floor(hl.bet * HILO_MULT[hl.streak]); }
    function hlSkel() {
      var lad = HILO_MULT.map(function (m, i) { return '<span style="height:' + (26 + i * 8) + 'px;transition-delay:' + (i * 60) + 'ms">×' + m + "</span>"; }).join("");
      return '<div class="cz-game"><div class="cz-hlt"><div class="cz-hlplate">HIGHER · LOWER</div><div class="cz-hlrow">' +
        '<div class="cz-slot"><div class="cz-pile"><i></i><i></i><i></i></div><small>DECK</small></div>' +
        '<div class="cz-slot"><div class="cz-cw empty" id="hl-cur"></div><small>CURRENT</small></div>' +
        '<div class="cz-slot"><div class="cz-cw" id="hl-next"></div><small>NEXT</small></div></div>' +
        '<div class="cz-lad" id="hl-lad">' + lad + '</div><div class="cz-pot" id="hl-pot"></div></div>' +
        '<div id="hl-msg"></div><div id="hl-ctl"></div></div>';
    }
    function hlShowCur(anim) {
      var cur = $("#hl-cur"), nx = $("#hl-next");
      if (cur) {
        cur.innerHTML = "";
        cur.classList.remove("slide");
        if (hl.cur) {
          cur.classList.remove("empty");
          var n = cardNode(hl.cur, false); n.className += " noanim up"; cur.appendChild(n);
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
      var lad = $("#hl-lad");
      if (lad) {
        for (var i = 0; i < lad.children.length; i++) {
          var lit = hl.phase !== "bet" && !(hl.phase === "done" && hl.win === false) && i <= hl.streak;
          lad.children[i].classList.toggle("lit", lit);
          lad.children[i].classList.toggle("now", lit && i === hl.streak && (hl.phase === "play" || hl.phase === "reveal"));
        }
      }
      setHtml("#hl-pot", hl.phase === "play" || hl.phase === "reveal" ? "Pot: " + hlPot() + " coins" : hl.phase === "bet" ? "Guess if the next card is higher or lower" : "");
      setHtml("#hl-msg", msgBox(hl.msg, hl.win));
      var h = "";
      if (hl.phase === "play" || hl.phase === "reveal") {
        var dis = hl.phase === "reveal" ? " disabled" : "", r = hl.cur.r;
        h = '<div class="cz-row"><button class="cz-stand" data-a="hl-higher"' + (r === 13 || dis ? " disabled" : "") + '>▲ Higher</button><button class="cz-dbl" data-a="hl-lower"' + (r === 1 || dis ? " disabled" : "") + ">▼ Lower</button></div>";
        h += '<button class="cz-go" style="margin-top:8px" data-a="hl-cash"' + (hl.streak < 1 || dis ? " disabled" : "") + ">Cash out " + (hl.streak < 1 ? "" : "(" + hlPot() + ")") + "</button>";
      } else {
        h = canBet() ? betPicker() + '<button class="cz-go" data-a="hl-start">' + (hl.phase === "done" ? "Play again" : "Start") + " (" + curBet() + ")</button>" : broke();
      }
      setHtml("#hl-ctl", h);
    }
    function hlNext() { if (hl.deck.length < 2) hl.deck = makeDeck(); return hl.deck.pop(); }
    function hlStart() {
      var b = takeBet("higher/lower");
      if (!b) return hlRefresh();
      hl.bet = b; hl.deck = makeDeck(); hl.streak = 0; hl.cur = hlNext(); hl.phase = "play"; hl.msg = ""; hl.win = null;
      updCoins(); hlShowCur(true); hlRefresh(); snd("click");
    }
    function hlGuess(guess) {
      if (hl.phase !== "play") return;
      var nx = hlNext(), res = hiloResult(hl.cur, nx, guess);
      snd("click");
      hl.phase = "reveal"; hlRefresh();
      var slot = $("#hl-next"), card = slot && slot.firstChild;
      if (card) { card.querySelector(".cz-cf").innerHTML = faceHtml(nx); if (isRed(nx.s)) card.classList.add("red"); card.classList.remove("noanim"); void card.offsetWidth; card.classList.add("up"); }
      later(function () {
        hl.phase = "play";
        if (res === "push") { hl.cur = nx; hl.msg = "Same rank: push. Drawing again."; hl.win = null; }
        else if (res === "lose") {
          hl.cur = nx; hl.phase = "done"; hl.msg = "Wrong! It was " + rankLabel(nx.r) + nx.s + ". The pot is gone: you lose " + hl.bet + " coins.";
          hl.win = false; snd("lose");
        } else {
          hl.streak++; hl.cur = nx; hl.win = true;
          if (hl.streak >= HILO_MULT.length - 1) { hlShowCur(true); return hlCash("Top of the ladder! "); }
          hl.msg = "Right! Pot is now " + hlPot() + " coins.";
        }
        hlShowCur(true); hlRefresh();
      }, ms(SLIDE_MS + 650));
    }
    function hlCash(prefix) {
      if (hl.phase !== "play" || hl.streak < 1) return;
      var back = hlPot();
      pay(back, "higher/lower");
      hl.phase = "done"; hl.win = true;
      hl.msg = (prefix || "") + "Cashed out " + back + " coins (+" + (back - hl.bet) + ").";
      settleFeel(hl.bet, back, "Higher/Lower");
      updCoins(); hlRefresh();
    }

    // ===== render + events =====
    function refresh() {
      if (!live()) return;
      updCoins();
      if (view === "bj") bjRefresh(); else if (view === "sl") slRefresh(); else if (view === "ro") roRefresh(); else if (view === "hl") hlRefresh(); else header();
    }
    function render() {
      header(); updCoins();
      if (view === "lobby") stage.innerHTML = lobbyHtml();
      else if (view === "bj") { stage.innerHTML = bjSkel(); bjRestore(); }
      else if (view === "sl") { stage.innerHTML = slSkel(); slRestore(); }
      else if (view === "ro") { stage.innerHTML = roSkel(); roRefresh(); }
      else { stage.innerHTML = hlSkel(); hlRestore(); }
    }
    function go(v, from) {
      if (navBusy || !live() || v === view) return;
      if (v === "lobby" && locked()) return;
      navBusy = true;
      if (from && from.getBoundingClientRect) {
        var r = from.getBoundingClientRect(), s = stage.getBoundingClientRect();
        stage.style.transformOrigin = ((r.left + r.width / 2 - s.left) / s.width * 100) + "% " + ((r.top + r.height / 2 - s.top) / s.height * 100) + "%";
      }
      stage.className = "cz-stage " + (v === "lobby" ? "cz-outg" : "cz-outl");
      snd("click");
      later(function () {
        navBusy = false;
        if (!live()) return;
        view = v;
        stage.style.transformOrigin = "";
        stage.className = "cz-stage " + (v === "lobby" ? "cz-inl" : "cz-ing");
        render();
      }, ms(ZOOM_MS));
    }

    function act(t) {
      var a = t.getAttribute("data-a"), v = t.getAttribute("data-v");
      switch (a) {
        case "open": return go(v, t);
        case "back": return go("lobby");
        case "chip": g.all = false; g.bet = +v; snd("chip"); return refresh();
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
        case "hl-cash": return hlCash();
      }
    }
    rootEl.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("[data-a]") : null;
      if (!t || t.disabled || !live()) return;
      act(t);
    });
    rootEl.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var lv = e.target.closest && e.target.closest("#sl-lv");
      if (lv) { e.preventDefault(); return slSpin(false); }
      var t = e.target.closest ? e.target.closest("g[data-a]") : null;
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
