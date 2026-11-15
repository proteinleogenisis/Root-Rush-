# Economy contract: coins, casino, shop, profile

Root Rush is a static phone-first web app (GitHub Pages). `index.html` holds the app.
Two new plain-script files are loaded by `index.html` BEFORE its main `<script>`:
`casino.js` and `profile.js`. No modules, no build, no external libraries.
Each file must also load in Node for tests: wrap in an IIFE and attach to `globalThis`
(`globalThis.RRCasino = ...`), and touch `document` only inside functions that render.

Coins are fake. They are earned only by studying. Nothing is bought with real money.

## Shared `api` object (built in index.html, passed to both mount functions)

```
api.coins()            -> integer coins now
api.spend(n, why)      -> true and deducts + saves if coins >= n, else false (no change)
api.earn(n, why)       -> adds n (integer >= 0) and saves
api.sound(kind)        -> kind: "win" | "lose" | "click" | "chip" | "spin" | "buy" (may be a no-op)
api.toast(html)        -> short popup message
api.back()             -> return to the Home screen
// profile
api.stats()            -> {mastered, total, passedDays, runs, best}
api.owned()            -> array of cosmetic ids owned
api.equipped()         -> {slot: id}  (missing slot = nothing equipped)
api.buyItem(id)        -> true if bought (spends RRProfile.CATALOG price, adds to owned), else false
api.equip(slot, idOrNull)
```

Power-ups were removed from the game (Nov 14). Coins are spent only on casino bets and cosmetics.

## `globalThis.RRCasino`

```
RRCasino.mount(el, api)   // render the casino ROOM (lobby) into el; tapping a table/machine opens that game. Called each time the screen opens.
RRCasino.logic = {
  makeDeck(rng = Math.random)        -> 52 shuffled cards {r: 1..13, s: "♠"|"♥"|"♦"|"♣"}  (r 1 = ace, 11 J, 12 Q, 13 K)
  handValue(cards)                   -> best total: aces count 11 unless that busts, then 1. J/Q/K = 10.
  isBlackjack(cards)                 -> exactly 2 cards totalling 21
  dealerShouldHit(cards)             -> handValue < 17 (dealer stands on every 17)
  settleBlackjack(player, dealer, bet) -> coins RETURNED (stake already taken when the bet was placed):
        player bust -> 0; player blackjack and dealer not -> 2.5*bet (floor); both blackjack -> bet; dealer blackjack vs any other hand -> 0;
        dealer bust -> 2*bet; player higher -> 2*bet; tie -> bet; player lower -> 0
  SLOT_SYMBOLS                       -> array of {sym, weight, pay3}  (pay3 = multiplier for three of a kind)
  spinReels(rng = Math.random)       -> [sym, sym, sym] drawn by weight
  slotPayout(reels, bet)             -> coins returned (integer). Expected return between 0.85 and 0.98 of the bet
                                        (house keeps a small edge), checked by exact enumeration in tests.
  ROULETTE_REDS                      -> the 18 real red numbers of a European wheel (0..36)
  rouletteColor(n)                   -> "green" for 0, else "red" | "black"
  roulettePayout(bet, n, amount)     -> coins returned. bet = {type: "red"|"black"|"odd"|"even"|"number", value?}
        red/black/odd/even win -> 2*amount (0 always loses these); number hit -> 36*amount; else 0
  HILO_MULT                          -> [1, 1.5, 2.2, 3.3, 5, 7.5, 11]
  hiloResult(cur, next, guess)       -> "win" | "lose" | "push" (compare ranks; equal = push). guess "higher"|"lower"
}
```

Bets: chips 10, 25, 50, 100 and "All in". Minimum bet 10. Never bet more than `api.coins()`.
The bet is taken with `api.spend` when the round starts; winnings come back with `api.earn`.

## `globalThis.RRProfile`

```
RRProfile.CATALOG     -> [{id, slot, name, price, desc}]   slots: "hat","shades","outfit","chain","shoes","ride","place"
RRProfile.netWorth(ownedIds) -> sum of CATALOG prices of owned ids
RRProfile.avatarSVG({equipped, size, crop}) -> complete <svg> string (viewBox fixed, width/height = size, default 220)
RRProfile.mount(el, api)
```

Catalog (prices are fixed):
place: small room 150 · outfit: clean tee 100 ·
hat: cap 300, beanie 400, crown 5000 · shades: sunglasses 350, gold shades 1500 ·
outfit: hoodie 500, drip jacket 1200, suit 2500 · chain: silver chain 800, gold chain 3000, diamond chain 8000 ·
shoes: sneakers 400, designer kicks 2000 · ride: bike 700, sports car 9000 ·
place: city view 1000, penthouse 6000, yacht 12000 (default = broke on the road: road scene, ragged tee, worn shoes, free).
`RRProfile.status(ownedIds)` -> {name, line, level, next, toNext, frac}: Broke 0, Scraping by 100, Getting by 1000, Comfortable 5000, Rich 15000, Rolling in it 35000 (net worth).

The avatar does NOT change with study progress any more: only cosmetics change him.

## Look and feel

Use the app's CSS variables only: --bg --card --line --ink --mute --good --bad --hot --root --pow --goodbg --badbg.
Dark mode is the main mode. Phone width 390 px, tap targets >= 44 px, no horizontal scroll.
Animations smooth and short (200-700 ms), never flashing, and off under prefers-reduced-motion.
Each file injects its own `<style>` once, with every class prefixed (`cz-` casino, `pf-` profile).
