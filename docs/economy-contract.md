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
RRCasino.mount(el, api)   // render the casino ROOM (lobby) into el; tapping a table/machine opens that game (blackjack, slots, roulette, higher/lower, video poker, baccarat, craps). Called each time the screen opens.
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
  HILO_EDGE = 0.92, HILO_MAX_MULT = 50 -> higher/lower tunables
  hiloDraw(rng)                      -> an independent random card {r: 1..13 uniform, s}; no deck, so the odds are exact
  hiloOdds(rank | card)              -> {higher, lower}: the pot multiplier a correct guess applies = HILO_EDGE / P(win), with
                                        P(higher) = (13-a)/13, P(lower) = (a-1)/13. 0 = impossible guess (Higher on K, Lower on A).
                                        Shown to 2 decimals; the pot is kept unrounded and floored to whole coins when paid.
  hiloResult(cur, next, guess)       -> "win" | "lose" (same rank LOSES). guess "higher"|"lower"
        Pot = bet * product of the multipliers; Cash out after >= 1 win; reaching HILO_MAX_MULT cashes out by itself.
  VP_PAYTABLE                        -> [[name, mult]] Jacks or Better 9/6: Royal 250, Straight Flush 50, Four of a Kind 25, Full House 9,
                                        Flush 6, Straight 4, Three of a Kind 3, Two Pair 2, Jacks or Better 1
  videoPokerRank(cards5)             -> {name, mult} ("No win", 0 when nothing). Ace plays low (A-2-3-4-5) and high (10-J-Q-K-A); K-A-2 does not wrap.
  videoPokerPayout(cards5, bet)      -> coins returned = bet * mult
  baccaratValue(cards)               -> sum mod 10 (A = 1, 2..9 face value, 10/J/Q/K = 0)
  baccaratBankerDraws(bTotal, playerThird|null) -> the punto banco banker rule (playerThird = baccarat value of the player's 3rd card, null if player stood)
  baccaratPlay(deckArray | rng)      -> {player, banker, deals:[{who:"p"|"b",card}], pTotal, bTotal, natural, winner:"player"|"banker"|"tie"};
                                        cards are popped from the END of a deck array; deal order P, B, P, B, then player 3rd, banker 3rd
  baccaratPayout(on, winner, amount) -> coins returned: Player 2x, Banker floor(1.95x), Tie 9x; Player/Banker bets push (amount back) on a tie
  crapsStep(state{point}, d1, d2)    -> {result:"win"|"lose"|"point"|"roll", state:{point}, total}; pass line only
  crapsPayout(result, bet)           -> 2*bet on "win" (1:1), else 0

