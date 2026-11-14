/* Root Rush casino. Plain script: sets globalThis.RRCasino = {logic, mount}.
   Loads in Node (no document/window access at load time). See docs/economy-contract.md. */
(function () {
  "use strict";

  // ---------- tunables ----------
  var CHIPS = [10, 25, 50, 100];
  var MIN_BET = 10;
  var BIG_WIN_MULT = 5;        // toast when net win >= this many times the stake
  var BIG_WIN_COINS = 250;     // ...or this many coins
  var DEAL_STEP_MS = 130;      // stagger between dealt cards
  var DEALER_STEP_MS = 550;    // pause between dealer draws
  var REEL_STOP_MS = [800, 1150, 1500];
  var WHEEL_SPIN_MS = 2000;

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

  var logic = {
    makeDeck: makeDeck, handValue: handValue, isBlackjack: isBlackjack,
    dealerShouldHit: dealerShouldHit, settleBlackjack: settleBlackjack,
    SLOT_SYMBOLS: SLOT_SYMBOLS, spinReels: spinReels, slotPayout: slotPayout,
    ROULETTE_REDS: ROULETTE_REDS, rouletteColor: rouletteColor, roulettePayout: roulettePayout,
    HILO_MULT: HILO_MULT, hiloResult: hiloResult
  };

  // ---------- styles ----------
  var CSS = [
    ".cz{width:100%}",
    ".cz *{box-sizing:border-box}",
    ".cz button{min-height:44px}",
    ".cz-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px}",
    ".cz-title{font-size:22px;font-weight:700}",
    ".cz-coins{background:var(--card);border:1px solid var(--line);border-radius:99px;padding:8px 14px;font-weight:700;font-size:18px;white-space:nowrap}",
    ".cz-tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}",
    ".cz-tabs::-webkit-scrollbar{display:none}",
    ".cz-tab{flex:0 0 auto;padding:10px 12px;font-size:14px;font-weight:700;border-radius:99px;color:var(--mute)}",
    ".cz-tab.on{background:var(--root);border-color:var(--root);color:#fff}",
    ".cz-card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px;margin-bottom:12px}",
    ".cz-sub{font-size:12px;font-weight:700;color:var(--mute);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}",
    ".cz-hand{display:flex;gap:6px;flex-wrap:wrap;min-height:76px;align-items:center}",
    ".cz-pc{width:52px;height:72px;border-radius:9px;background:#fff;color:#1d1d1b;border:1px solid #cfcdc4;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:700;font-size:20px;line-height:1.05;box-shadow:0 2px 4px rgba(0,0,0,.25)}",
    ".cz-pc.red{color:#c0392b}",
    ".cz-pc.back{background:repeating-linear-gradient(45deg,var(--root),var(--root) 6px,#5a52b8 6px,#5a52b8 12px);border-color:#fff;color:transparent}",
    ".cz-pc.big{width:92px;height:128px;font-size:36px}",
    ".cz-in{animation:cz-slide .35s ease both}",
    "@keyframes cz-slide{from{transform:translate(40px,-30px) rotate(8deg);opacity:0}to{transform:none;opacity:1}}",
    ".cz-total{font-size:13px;color:var(--mute);margin-top:6px}",
    ".cz-msg{border-radius:12px;padding:12px;font-weight:700;text-align:center;margin:10px 0;border:1px solid var(--line);background:var(--bg);line-height:1.35}",
    ".cz-msg.win{background:var(--goodbg);border-color:var(--good);color:var(--good)}",
    ".cz-msg.lose{background:var(--badbg);border-color:var(--bad);color:var(--bad)}",
    ".cz-bets{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 10px}",
    ".cz-chip{flex:1 1 56px;border-radius:99px;font-weight:700;border-color:var(--root);color:var(--root);padding:10px 4px}",
    ".cz-chip.on{background:var(--root);color:#fff}",
    ".cz-chip:disabled{opacity:.35;cursor:not-allowed}",
    ".cz-go{width:100%;background:var(--hot);border-color:var(--hot);color:#fff;font-size:19px;font-weight:700;padding:14px}",
    ".cz-go:disabled{opacity:.4}",
    ".cz-row{display:flex;gap:8px;margin-top:8px}",
    ".cz-row button{flex:1;font-weight:700;font-size:16px;padding:12px 6px}",
    ".cz-stand{border-color:var(--pow);color:var(--pow)}",
    ".cz-dbl{border-color:var(--root);color:var(--root)}",
    ".cz-row button:disabled{opacity:.35}",
    ".cz-broke{text-align:center;padding:18px 8px;color:var(--mute);font-size:16px;line-height:1.4}",
    ".cz-machine{display:flex;gap:8px;justify-content:center;background:var(--bg);border:2px solid var(--hot);border-radius:16px;padding:12px}",
    ".cz-reel{width:84px;height:84px;overflow:hidden;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:48px;border:1px solid var(--line)}",
    ".cz-reel.stop .cz-sym{animation:cz-pop .3s ease}",
    "@keyframes cz-pop{from{transform:translateY(-30px)}to{transform:none}}",
    ".cz-strip{display:flex;flex-direction:column;align-self:flex-start;animation:cz-roll .5s linear infinite}",
    ".cz-strip span{height:84px;line-height:84px;text-align:center;font-size:48px;flex:0 0 84px}",
    "@keyframes cz-roll{from{transform:translateY(0)}to{transform:translateY(-50%)}}",
    ".cz-pay{display:flex;flex-wrap:wrap;gap:4px 12px;justify-content:center;font-size:12px;color:var(--mute);margin-top:10px}",
    ".cz-wheelbox{position:relative;width:200px;height:200px;margin:4px auto 10px}",
    ".cz-wheel{width:200px;height:200px;border-radius:50%;border:4px solid var(--line);position:relative}",
    ".cz-wheel::after{content:'';position:absolute;inset:38%;border-radius:50%;background:var(--card);border:2px solid var(--line)}",
    ".cz-ptr{position:absolute;top:-8px;left:50%;width:18px;height:18px;margin-left:-9px;border-radius:50%;background:#fff;box-shadow:0 0 0 2px var(--hot),0 2px 6px rgba(0,0,0,.5);z-index:2}",
    ".cz-res{text-align:center;font-weight:700;font-size:15px;margin-bottom:4px}",
    ".cz-numchip{display:inline-block;min-width:44px;padding:6px 10px;border-radius:10px;color:#fff;font-size:22px;font-weight:700;margin-left:6px}",
    ".cz-num.red,.cz-numchip.red{background:#c0392b}.cz-num.black,.cz-numchip.black{background:#1a1a1a}.cz-num.green,.cz-numchip.green{background:var(--pow)}",
    ".cz-sel4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-bottom:8px}",
    ".cz-sel4 button{font-weight:700;padding:10px 2px;font-size:15px}",
    ".cz-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:5px}",
    ".cz-num{color:#fff;border:2px solid transparent;font-weight:700;font-size:15px;padding:0;min-height:44px}",
    ".cz-zero{grid-column:1/-1}",
    ".cz-on{border-color:var(--hot)!important;box-shadow:0 0 0 2px var(--hot)}",
    ".cz-sel4 .cz-on{background:var(--hot);color:#fff}",
    ".cz-streak{display:flex;gap:4px;margin:8px 0}",
    ".cz-streak span{flex:1;text-align:center;font-size:11px;font-weight:700;padding:6px 0;border-radius:6px;background:var(--bg);color:var(--mute);border:1px solid var(--line)}",
    ".cz-streak span.on{background:var(--hot);border-color:var(--hot);color:#fff}",
    ".cz-center{display:flex;justify-content:center;margin:6px 0}",
    ".cz-pot{text-align:center;font-weight:700;font-size:16px}",
    ".cz-shop{display:flex;gap:12px;align-items:center}",
    ".cz-ico{font-size:34px;width:48px;text-align:center}",
    ".cz-shop .cz-i{flex:1;min-width:0}",
    ".cz-shop b{display:block;font-size:16px}",
    ".cz-shop small{display:block;font-size:13px;color:var(--mute);line-height:1.3}",
    ".cz-buy{flex:0 0 auto;min-width:92px;background:var(--root);border-color:var(--root);color:#fff;font-weight:700}",
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
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ---------- UI ----------
  function mount(el, api) {
    injectStyle();
    var tok = {};
    el.__czTok = tok;
    function live() { return el.__czTok === tok; }
    function later(fn, ms) { setTimeout(function () { if (live()) fn(); }, ms); }
    function snd(k) { try { api.sound(k); } catch (e) { /* ignore */ } }
    function toast(h) { try { api.toast(h); } catch (e) { /* ignore */ } }
    function pay(n, why) { n = Math.floor(n); if (n > 0) api.earn(n, why); }

    var tab = "bj";
    var TABS = [["bj", "Blackjack"], ["sl", "Slots"], ["ro", "Roulette"], ["hl", "Higher/Lower"], ["shop", "Shop"]];
    var g = { bet: MIN_BET, all: false };
    var seen = new Set();

    var bj = { phase: "bet", deck: [], p: [], d: [], bet: 0, reveal: false, msg: "", win: null };
    var sl = { phase: "bet", reels: [SLOT_SYMBOLS[0].sym, SLOT_SYMBOLS[1].sym, SLOT_SYMBOLS[2].sym], stopped: [true, true, true], bet: 0, msg: "", win: null };
    var ro = { phase: "bet", sel: null, n: null, bet: 0, rot: 0, msg: "", win: null };
    var hl = { phase: "bet", deck: [], cur: null, streak: 0, bet: 0, msg: "", win: null };
    var shopMsg = "";

    el.innerHTML = '<div class="cz"><div class="cz-head"><div class="cz-title">🎰 Casino</div><div class="cz-coins" id="cz-coins"></div></div>' +
      '<div class="cz-tabs" id="cz-tabs"></div><div id="cz-body"></div></div>';
    var rootEl = el.firstChild;
    var coinsEl = rootEl.querySelector("#cz-coins");
    var tabsEl = rootEl.querySelector("#cz-tabs");
    var bodyEl = rootEl.querySelector("#cz-body");

    function updCoins() { coinsEl.textContent = "🪙 " + api.coins(); }

    function normBet() {
      var c = api.coins();
      if (g.all) return;
      if (g.bet > c) {
        g.bet = MIN_BET;
        for (var i = 0; i < CHIPS.length; i++) if (CHIPS[i] <= c) g.bet = CHIPS[i];
      }
    }
    function curBet() { var c = api.coins(); return g.all ? c : Math.min(g.bet, c); }

    function betPicker() {
      normBet();
      var c = api.coins(), b = curBet(), h = '<div class="cz-sub">Your bet: ' + b + ' coins</div><div class="cz-bets">';
      CHIPS.forEach(function (v) {
        h += '<button class="cz-chip' + (!g.all && b === v ? " on" : "") + '" data-a="chip" data-v="' + v + '"' + (c < v ? " disabled" : "") + ">" + v + "</button>";
      });
      h += '<button class="cz-chip' + (g.all ? " on" : "") + '" data-a="allin"' + (c < MIN_BET ? " disabled" : "") + ">All in</button></div>";
      return h;
    }
    function broke() {
      return '<div class="cz-broke">😕 Out of coins: play a Rush to earn more.</div>';
    }
    function canBet() { return api.coins() >= MIN_BET; }

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
      // back = coins returned. Plays sound/toast. Returns message text parts.
      var net = back - stake;
      if (back > stake) {
        snd("win");
        if (net >= stake * BIG_WIN_MULT || net >= BIG_WIN_COINS) toast("🎉 " + label + " +" + net + " coins!");
      } else if (back < stake) snd("lose");
    }

    // ----- blackjack -----
    function cardHtml(c, hidden, key, idx) {
      var fresh = !seen.has(key);
      var cls = "cz-pc" + (hidden ? " back" : isRed(c.s) ? " red" : "") + (fresh ? " cz-in" : "");
      var st = "";
      if (fresh) { seen.add(key); st = ' style="animation-delay:' + (bjDelay++ * DEAL_STEP_MS) + 'ms"'; }
      return '<div class="' + cls + '"' + st + ">" + (hidden ? "?" : "<span>" + rankLabel(c.r) + "</span><span>" + c.s + "</span>") + "</div>";
    }
    var bjDelay = 0;
    function bjHand(cards, who, hideSecond) {
      var h = "";
      cards.forEach(function (c, i) {
        var hid = hideSecond && i === 1;
        h += cardHtml(c, hid, who + i + (hid ? "h" : ""), i);
      });
      return h;
    }
    function bjDraw() {
      bjDelay = 0;
      var hideHole = !bj.reveal && bj.phase !== "bet";
      var h = '<div class="cz-card"><div class="cz-sub">Dealer' + (bj.phase !== "bet" ? " · " + (hideHole ? handValue([bj.d[0]]) : handValue(bj.d)) : "") + '</div><div class="cz-hand">' +
        (bj.phase === "bet" ? '<span class="cz-total">Place your bet and deal.</span>' : bjHand(bj.d, "d", hideHole)) + "</div>";
      h += '<div class="cz-sub" style="margin-top:12px">You' + (bj.phase !== "bet" ? " · " + handValue(bj.p) : "") + '</div><div class="cz-hand">' +
        (bj.phase === "bet" ? "" : bjHand(bj.p, "p", false)) + "</div>";
      h += msgBox(bj.msg, bj.win);
      if (bj.phase === "play") {
        var canDbl = bj.p.length === 2 && api.coins() >= bj.bet;
        h += '<div class="cz-sub">Bet: ' + bj.bet + '</div><div class="cz-row"><button data-a="bj-hit">Hit</button><button class="cz-stand" data-a="bj-stand">Stand</button><button class="cz-dbl" data-a="bj-dbl"' + (canDbl ? "" : " disabled") + ">Double</button></div>";
      } else if (bj.phase === "bet" || bj.phase === "done") {
        h += canBet() ? betPicker() + '<button class="cz-go" data-a="bj-deal">' + (bj.phase === "done" ? "Deal again" : "Deal") + " (" + curBet() + ")</button>" : broke();
      }
      return h + "</div>";
    }
    function bjDeal() {
      var b = takeBet("blackjack");
      if (!b) return draw();
      bj.bet = b; bj.deck = makeDeck(); bj.reveal = false; bj.msg = ""; bj.win = null;
      seen.clear();
      bj.p = [bj.deck.pop(), bj.deck.pop()];
      bj.d = [bj.deck.pop(), bj.deck.pop()];
      bj.phase = "play";
      updCoins(); draw();
      if (isBlackjack(bj.p) || isBlackjack(bj.d)) { bj.phase = "dealer"; later(function () { bjReveal(); }, 700); }
    }
    function bjReveal() { bj.reveal = true; bj.phase = "dealer"; draw(); later(bjDealerStep, DEALER_STEP_MS); }
    function bjDealerStep() {
      if (handValue(bj.p) <= 21 && !isBlackjack(bj.p) && !isBlackjack(bj.d) && dealerShouldHit(bj.d)) {
        bj.d.push(bj.deck.pop()); snd("click"); draw(); later(bjDealerStep, DEALER_STEP_MS);
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
      updCoins(); draw();
    }
    function bjHit() {
      if (bj.phase !== "play") return;
      bj.p.push(bj.deck.pop()); snd("click");
      if (handValue(bj.p) >= 21) { bj.phase = "dealer"; draw(); later(function () { bjReveal(); }, 400); }
      else draw();
    }
    function bjStand() { if (bj.phase !== "play") return; bj.phase = "dealer"; snd("click"); bjReveal(); }
    function bjDouble() {
      if (bj.phase !== "play" || bj.p.length !== 2) return;
      if (!api.spend(bj.bet, "blackjack double")) { toast("Not enough coins"); return draw(); }
      snd("chip");
      bj.bet *= 2;
      bj.p.push(bj.deck.pop());
      bj.phase = "dealer"; updCoins(); draw();
      later(function () { bjReveal(); }, 500);
    }

    // ----- slots -----
    function reelInner(i) {
      if (sl.stopped[i]) return '<span class="cz-sym">' + sl.reels[i] + "</span>";
      var strip = "";
      for (var k = 0; k < 2; k++) SLOT_SYMBOLS.forEach(function (s) { strip += "<span>" + s.sym + "</span>"; });
      return '<div class="cz-strip">' + strip + "</div>";
    }
    function slDraw() {
      var h = '<div class="cz-card"><div class="cz-machine">';
      for (var i = 0; i < 3; i++) h += '<div class="cz-reel' + (sl.stopped[i] ? " stop" : "") + '" data-reel="' + i + '">' + reelInner(i) + "</div>";
      h += "</div>" + msgBox(sl.msg, sl.win);
      if (sl.phase === "spin") h += '<div class="cz-msg">Spinning…</div>';
      else h += canBet() ? betPicker() + '<button class="cz-go" data-a="sl-spin">Spin (' + curBet() + ")</button>" : broke();
      h += '<div class="cz-sub" style="margin-top:12px">Three of a kind pays</div><div class="cz-pay">';
      SLOT_SYMBOLS.forEach(function (s) { h += "<span>" + s.sym + s.sym + s.sym + " ×" + s.pay3 + "</span>"; });
      return h + "</div></div>";
    }
    function slSpin() {
      var b = takeBet("slots");
      if (!b) return draw();
      sl.bet = b; sl.reels = spinReels(); sl.stopped = [false, false, false]; sl.phase = "spin"; sl.msg = ""; sl.win = null;
      snd("spin"); updCoins(); draw();
      [0, 1, 2].forEach(function (i) {
        later(function () {
          sl.stopped[i] = true; snd("click");
          if (tab === "sl") {
            var r = bodyEl.querySelector('[data-reel="' + i + '"]');
            if (r) { r.className = "cz-reel stop"; r.innerHTML = reelInner(i); }
          }
          if (i === 2) slFinish();
        }, REEL_STOP_MS[i]);
      });
    }
    function slFinish() {
      var back = slotPayout(sl.reels, sl.bet);
      pay(back, "slots");
      if (back > 0) { sl.msg = "🎉 Three of a kind! You win " + (back - sl.bet) + " coins!"; sl.win = true; }
      else { sl.msg = "No match. You lose " + sl.bet + " coins."; sl.win = false; }
      settleFeel(sl.bet, back, "Slots");
      sl.phase = "done"; updCoins(); draw();
    }

    // ----- roulette -----
    function wheelBg() {
      var s = 360 / 37, parts = [];
      for (var i = 0; i < 37; i++) {
        var c = rouletteColor(i);
        parts.push((c === "red" ? "#c0392b" : c === "black" ? "#1a1a1a" : "#1D9E75") + " " + (i * s) + "deg " + ((i + 1) * s) + "deg");
      }
      return "conic-gradient(" + parts.join(",") + ")";
    }
    function selLabel() {
      if (!ro.sel) return "Pick a bet below";
      return ro.sel.type === "number" ? "Number " + ro.sel.value : ro.sel.type[0].toUpperCase() + ro.sel.type.slice(1);
    }
    function isSel(type, value) { return ro.sel && ro.sel.type === type && (type !== "number" || ro.sel.value === value); }
    function roDraw() {
      var spinning = ro.phase === "spin";
      var h = '<div class="cz-card"><div class="cz-wheelbox"><div class="cz-ptr"></div><div class="cz-wheel" id="cz-wheel" style="background:' + wheelBg() + ";transform:rotate(" + ro.rot + 'deg)"></div></div>';
      if (ro.n !== null && ro.phase === "done") h += '<div class="cz-res">Landed on <span class="cz-numchip ' + rouletteColor(ro.n) + '">' + ro.n + "</span></div>";
      h += msgBox(ro.msg, ro.win);
      if (spinning) h += '<div class="cz-msg">Spinning…</div>';
      else {
        h += '<div class="cz-sub">Your pick: ' + selLabel() + '</div><div class="cz-sel4">';
        ["red", "black", "odd", "even"].forEach(function (t) {
          h += '<button class="' + (isSel(t) ? "cz-on" : "") + '" data-a="ro-pick" data-v="' + t + '">' + t[0].toUpperCase() + t.slice(1) + "</button>";
        });
        h += '</div><div class="cz-grid">';
        for (var n = 0; n <= 36; n++) {
          h += '<button class="cz-num ' + rouletteColor(n) + (n === 0 ? " cz-zero" : "") + (isSel("number", n) ? " cz-on" : "") + '" data-a="ro-num" data-v="' + n + '">' + n + "</button>";
        }
        h += '</div><div style="height:10px"></div>';
        h += canBet() ? betPicker() + '<button class="cz-go" data-a="ro-spin"' + (ro.sel ? "" : " disabled") + ">Spin (" + curBet() + ")</button>" : broke();
        h += '<div class="cz-total" style="text-align:center;margin-top:8px">Red/black/odd/even pay ×2 (0 loses). A number pays ×36.</div>';
      }
      return h + "</div>";
    }
    function roSpin() {
      if (!ro.sel) return;
      var b = takeBet("roulette");
      if (!b) return draw();
      ro.bet = b; ro.n = Math.floor(Math.random() * 37); ro.phase = "spin"; ro.msg = ""; ro.win = null;
      snd("spin"); updCoins(); draw();
      var s = 360 / 37, center = (ro.n + 0.5) * s;
      var final = (Math.floor(ro.rot / 360) + 5) * 360 - center;
      if (final <= ro.rot) final += 360;
      var w = bodyEl.querySelector("#cz-wheel");
      if (w) {
        w.getBoundingClientRect();
        w.style.transition = "transform " + WHEEL_SPIN_MS + "ms cubic-bezier(.15,.6,.15,1)";
        w.style.transform = "rotate(" + final + "deg)";
      }
      ro.rot = final;
      later(function () {
        var back = roulettePayout(ro.sel, ro.n, ro.bet);
        pay(back, "roulette");
        var col = rouletteColor(ro.n);
        if (back > 0) { ro.msg = "You win " + (back - ro.bet) + " coins!"; ro.win = true; }
        else { ro.msg = col[0].toUpperCase() + col.slice(1) + " " + ro.n + ". You lose " + ro.bet + " coins."; ro.win = false; }
        settleFeel(ro.bet, back, "Roulette");
        ro.phase = "done"; updCoins(); draw();
      }, WHEEL_SPIN_MS + 150);
    }

    // ----- higher / lower -----
    function hlPot() { return Math.floor(hl.bet * HILO_MULT[hl.streak]); }
    function hlDraw() {
      var h = '<div class="cz-card">';
      if (hl.phase === "bet") h += '<div class="cz-total" style="text-align:center">Guess if the next card is higher or lower. Each right guess raises your pot. Cash out any time.</div>';
      else {
        h += '<div class="cz-center">' + hlCard(hl.cur) + "</div>";
        h += '<div class="cz-streak">' + HILO_MULT.map(function (m, i) { return '<span class="' + (i === hl.streak ? "on" : "") + '">×' + m + "</span>"; }).join("") + "</div>";
        if (hl.phase === "play") h += '<div class="cz-pot">Pot: ' + hlPot() + " coins</div>";
      }
      h += msgBox(hl.msg, hl.win);
      if (hl.phase === "play") {
        var r = hl.cur.r;
        h += '<div class="cz-row"><button class="cz-stand" data-a="hl-higher"' + (r === 13 ? " disabled" : "") + '>▲ Higher</button><button class="cz-dbl" data-a="hl-lower"' + (r === 1 ? " disabled" : "") + ">▼ Lower</button></div>";
        h += '<button class="cz-go" style="margin-top:8px" data-a="hl-cash"' + (hl.streak < 1 ? " disabled" : "") + ">Cash out " + (hl.streak < 1 ? "" : "(" + hlPot() + ")") + "</button>";
      } else {
        h += canBet() ? betPicker() + '<button class="cz-go" data-a="hl-start">' + (hl.phase === "done" ? "Play again" : "Start") + " (" + curBet() + ")</button>" : broke();
      }
      return h + "</div>";
    }
    function hlCard(c) {
      return '<div class="cz-pc big' + (isRed(c.s) ? " red" : "") + '"><span>' + rankLabel(c.r) + "</span><span>" + c.s + "</span></div>";
    }
    function hlNext() { if (hl.deck.length < 2) hl.deck = makeDeck(); return hl.deck.pop(); }
    function hlStart() {
      var b = takeBet("higher/lower");
      if (!b) return draw();
      hl.bet = b; hl.deck = makeDeck(); hl.streak = 0; hl.cur = hlNext(); hl.phase = "play"; hl.msg = ""; hl.win = null;
      updCoins(); draw();
    }
    function hlGuess(guess) {
      if (hl.phase !== "play") return;
      var nx = hlNext(), res = hiloResult(hl.cur, nx, guess);
      snd("click");
      if (res === "push") { hl.cur = nx; hl.msg = "Same rank: push. Drawing again."; hl.win = null; return draw(); }
      if (res === "lose") {
        hl.cur = nx; hl.phase = "done"; hl.msg = "Wrong! It was " + rankLabel(nx.r) + nx.s + ". The pot is gone: you lose " + hl.bet + " coins.";
        hl.win = false; snd("lose"); return draw();
      }
      hl.streak++; hl.cur = nx; hl.win = true;
      if (hl.streak >= HILO_MULT.length - 1) return hlCash("Top of the ladder! ");
      hl.msg = "Right! Pot is now " + hlPot() + " coins.";
      draw();
    }
    function hlCash(prefix) {
      if (hl.phase !== "play" || hl.streak < 1) return;
      var back = hlPot();
      pay(back, "higher/lower");
      hl.phase = "done"; hl.win = true;
      hl.msg = (prefix || "") + "Cashed out " + back + " coins (+" + (back - hl.bet) + ").";
      settleFeel(hl.bet, back, "Higher/Lower");
      updCoins(); draw();
    }

    // ----- shop -----
    function shopDraw() {
      var list = [];
      try { list = api.powerups() || []; } catch (e) { list = []; }
      var h = msgBox(shopMsg.text || "", shopMsg.win);
      list.forEach(function (p) {
        h += '<div class="cz-card cz-shop"><div class="cz-ico">' + p.icon + '</div><div class="cz-i"><b>' + esc(p.name) + "</b><small>" + esc(p.desc) + "</small><small>You own " + p.owned + '</small></div><button class="cz-buy" data-a="buy" data-v="' + esc(p.key) + '">🪙 ' + p.price + "</button></div>";
      });
      return h;
    }
    function buy(key) {
      var list = api.powerups() || [], name = key;
      list.forEach(function (p) { if (p.key === key) name = p.name; });
      if (api.buyPowerup(key)) { snd("buy"); shopMsg = { text: "Bought " + esc(name) + "!", win: true }; }
      else { snd("lose"); shopMsg = { text: "Not enough coins", win: false }; }
      updCoins(); draw();
    }

    // ----- render + events -----
    function draw() {
      if (!live()) return;
      updCoins();
      tabsEl.innerHTML = TABS.map(function (t) {
        return '<button class="cz-tab' + (t[0] === tab ? " on" : "") + '" data-a="tab" data-v="' + t[0] + '">' + t[1] + "</button>";
      }).join("");
      bodyEl.innerHTML = tab === "bj" ? bjDraw() : tab === "sl" ? slDraw() : tab === "ro" ? roDraw() : tab === "hl" ? hlDraw() : shopDraw();
    }

    rootEl.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("[data-a]") : null;
      if (!t || t.disabled || !live()) return;
      var a = t.getAttribute("data-a"), v = t.getAttribute("data-v");
      switch (a) {
        case "tab": tab = v; snd("click"); return draw();
        case "chip": g.all = false; g.bet = +v; snd("chip"); return draw();
        case "allin": g.all = true; snd("chip"); return draw();
        case "bj-deal": return bjDeal();
        case "bj-hit": return bjHit();
        case "bj-stand": return bjStand();
        case "bj-dbl": return bjDouble();
        case "sl-spin": return slSpin();
        case "ro-pick": ro.sel = { type: v }; snd("click"); return draw();
        case "ro-num": ro.sel = { type: "number", value: +v }; snd("click"); return draw();
        case "ro-spin": return roSpin();
        case "hl-start": return hlStart();
        case "hl-higher": return hlGuess("higher");
        case "hl-lower": return hlGuess("lower");
        case "hl-cash": return hlCash();
        case "buy": return buy(v);
      }
    });

    draw();
  }

  globalThis.RRCasino = { logic: logic, mount: mount };
})();
