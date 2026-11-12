# Root Rush

Root Rush is a phone-first study game for an Algebra 2 class (St. Vrain Valley Schools, Big Ideas Algebra 2, Chapter 5: Rational Exponents and Radical Functions). It is live on GitHub Pages at https://proteinleogenisis.github.io/Root-Rush-/ and is used as a home-screen app on an iPhone and an iPad.

## How the student learns (follow these)
- Visual and interactive beats text. Prefer step-by-step reveals, color-coded math, and quick feedback.
- Calculators are allowed in class. Teach what to type and what the answer means, but homework and tests say "show your steps", so walkthroughs must show the written lines.
- Spot-the-mistake questions are not on tests. They are removed from play on purpose; do not add them back.
- Each day must be learned before moving on: skills are mastered, then a final quiz unlocks the next day.
- Rush for a day uses only that day's skills.
- When the student sends a new homework photo, check that every problem type on it is covered by a question generator and a Learn lesson, then add what is missing.

## Files
- `index.html`: the whole app (HTML, CSS, JS in one file). No build step.
- `icon.png`, `apple-touch-icon.png`, `manifest.webmanifest`: home-screen icon and app manifest.

## Code map (all in index.html)
- `GEN`: question generators, one per skill key. Each returns `{q, ex, c, w, why, walk}`; `walk` is an array of `[mathHtml, caption]` steps shown when an answer is wrong. Types: default multiple choice, `words` (text choices), `order` (tap steps in order, uses `steps` and `tiles`), `line` (number-line estimate), `spot` (unused in play).
- `TAGS`: display name per skill key. `LESSONS`: skill keys per day (`"5.1"`, `"5.2"`). `DAYS`, `DAY_ORDER`, `ROAD`: day metadata, order, and roadmap.
- `SKILLS`: rule card and example per skill for the home skill list.
- `LEARN51`, `LEARN52` (via `LEARNS`): Learn lessons, each mapped to homework problems, with step reveals and a "Your turn" check.
- `LT`, `LT52`: lightning-round true/false items for 5.1 and 5.2.
- Mastery: each skill has `xp` 0 to 100 (+20 right, +25 at combo x3 or more, -10 miss; Boost doubles gains; Shield blocks a loss). At 100 a skill is mastered (`m: true`) and skipped in runs.
- Final quiz: unlocked when every skill in a day is mastered. Two questions per skill, no timer, 80% to pass. Passing sets `passed[day]` and unlocks the next day. Missed skills drop to 60 xp.
- Quick review: after a day is passed, its skills come back on a spaced schedule (2, 4, 8, 16 days, max 30). Right pushes the next review out, a miss brings it back tomorrow.
- Rush: 180 seconds, lightning round at 90 seconds left for 20 seconds, double points in the last 10 seconds, ghost of the day's best score.
- Calculator: built-in bottom sheet (`cEval` parser handles odd roots of negatives and implicit multiplication).
- Music: procedural Web Audio tracks in `TRACKS` (chill, dream, drive, pulse, blast, boss, arcade). Auto mode picks by screen and game state in `musWant()`. Settings sheet holds sound, music tracks, and volume.
- Storage: `localStorage` keys prefixed `rootrush_` (skills, bestBy, passed, learnedBy, day streak, hist, music settings). `initCloud()` syncs through the Claude artifact runtime only when it exists; on GitHub Pages progress stays on each device.

## Adding a new day (for example 5.3)
1. Add generators to `GEN`, each with a `walk`.
2. Add their keys to `TAGS`, `LESSONS["5.3"]`, and rule cards to `SKILLS` (with `L:"5.3"`).
3. Add `DAYS["5.3"]`, append `"5.3"` to `DAY_ORDER`, update `ROAD`, and set `LATEST`.
4. Add a `LEARN53` lesson list and register it in `LEARNS`.
5. Add lightning items and make `ltNext()` pick that day's list.
6. Test, then push.

## Testing
Headless Chrome with Playwright works well: load `file://.../index.html` at a 390x844 viewport, start runs, answer through `pickIdx`, and check `pageerror` events. Also stress each generator a few thousand times to confirm four distinct answer choices and no `undefined` or `NaN` in `walk`.

## Deploying
Push to `main`. GitHub Pages serves from `main` at the repo root and updates in about a minute.
