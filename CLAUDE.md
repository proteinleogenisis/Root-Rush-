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
- Mastery: each skill has `xp` 0 to 100 (+20 right, +25 at combo x3 or more, -15 miss (`MX_LOSS`); Boost doubles gains; Shield blocks a loss). At 100 a skill is mastered (`m: true`) and skipped in runs.
- Final quiz: unlocked when every skill in a day is mastered. Two questions per skill, no timer, 80% to pass. Passing sets `passed[day]` and unlocks the next day. Missed skills drop to 60 xp.
- Quick review: after a day is passed, its skills come back on a spaced schedule (2, 4, 8, 16 days, max 30). Right pushes the next review out, a miss brings it back tomorrow.
- Rush: 180 seconds, starts instantly (no 3-2-1). Lightning round is due at 90 seconds left but only starts after the current question is answered (`st.ltPending`, checked in `next()`); a wrong lightning answer locks the buttons for `LT_WRONG_LOCK` (5) seconds. Double points in the last 10 seconds, ghost of the day's best score.
- "I don't know" button (`idk()`, top right of the question card in Rush/quiz, hidden in lightning): counts as a miss but costs `IDK_LOSS` (10) mastery instead of 15, and opens the walkthrough.
- Paper (`tape`, `tpAdd`, `tpRender`): inside the calculator, every "=" answer is saved newest-first; tap one to put it back in the calculator, × removes, Clear empties. Earlier questions' answers dim under "Earlier". (The finger-drawing paper was removed at the student's request.)
- Weak-skill training (`weakSkill`, `showTrain`, `#train` section): after a Rush or Mastery run, a skill with at least `WEAK_MIN_TRIES` of its last `WEAK_WINDOW` answers, accuracy at most `WEAK_MAX_ACC` and `WEAK_GAP` below the day's other skills (need `WEAK_MIN_OTHERS` with data) gets a training page; cooldown `WEAK_COOLDOWN_RUNS`.
- Real life (`REAL`, `renderReal`, `#real` on Home): one practical use per skill, each with a moving picture that reacts to its sliders or buttons (the student wants to SEE it, not only read numbers). A card unlocks when its skill is mastered (or the day is passed) and animates once (`rlSeen`). When all are open and the quiz isn't passed, a final-quiz prompt shows. New days need a `REAL` entry per skill and a `RL_TEASER` line.
- `LESSON_SKILL`: which skill(s) each Learn lesson trains, by lesson position. Every skill has a lesson. New lessons must be appended (learnedBy stores lesson indexes).
- Calculator: built-in bottom sheet (`cEval` parser handles odd roots of negatives and implicit multiplication).
- Music: procedural Web Audio tracks in `TRACKS` (chill, dream, drive, pulse, blast, boss, arcade). Auto mode picks by screen and game state in `musWant()`. Settings sheet holds sound, music tracks, and volume.
- Accounts: `ACCT_URL` = https://root-rush-accounts.netlify.app/api/account (code in `server/`, Netlify site `root-rush-accounts`, Netlify Blobs store `rootrush`; scrypt-hashed passwords, bearer tokens). Make account uploads this device's save; sign in merges the account save into the device (per skill, the record with more attempts wins) and pushes back. Pulls again when the app comes back to the foreground. Redeploy server: `cd server && npm install && npx -y netlify-cli@17.38.1 deploy --prod`.
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

## Project history and handoff (from the original chat, Nov 11–12, 2026)
This project started in a Claude chat and moved here. Read this before changing anything.

### Where the student is
- Unit 5, Day 2 (5.2) as of Nov 12. Homework 5.1 and 5.2 are both covered by generators and Learn lessons.
- Next class topic: 5.3 Graphing Radical Functions, then 5.4 Solving Radical Equations and Inequalities, then review and the unit test. St. Vrain's pacing skips 5.5 and 5.6.
- The student plays on an iPhone (dark mode) and an iPad from the home-screen icon on the GitHub Pages site. Progress is per device.

### Homework coverage map
- 5.1 #1–4 evaluate by hand → `bottom`, `neg`. #7–10 calculator values → `entry` (numeric variant). #11–14 solve xⁿ = k, isolate, shifted → `sols`, `iso`, `shift`, `order`. Estimating roots → `line`. (#5–6 were error-correction; skipped by request.)
- 5.2 #1–4 exponent rules incl. power of a quotient and negative exponents → `rules` (6 variants). #5–8 multiply/divide radicals incl. mixed indexes like ⁶√2·⁶√2 → `radmul`. #9–12 roots of variables incl. fractions and |z| → `vars`. Simplest form → `simp`. #13–14 like radicals incl. exponent form → `like`. (The error problem is covered conceptually by `like`.)

### What was built, in order, and why
1. Concept quizzes in chat → turned into Root Rush (named by the student's request for a competitive game against himself).
2. Ghost race (smooth, steady pace toward best score), combo, speed bonus, power-ups (Freeze, Shield, Double, Boost), rematches (missed type returns 2–4 questions later), day streak with freezes. Researched Kahoot, Gimkit, Duolingo, and spaced/interleaved practice.
3. Questions changed from "what do you type" to "what do you do" (the student works out the numbers himself).
4. Homepage with day switcher, skills with mastery bars, recent runs chart, roadmap, Learn lessons (step reveals plus "Your turn" check that repeats until right).
5. Built-in calculator (behaves like a real one: 8 ^ 2 / 3 gives 21.33, so parentheses habits matter).
6. Mastery made achievable (xp meter instead of 9-of-10), mastered skills skipped, final quiz gates the next day, spaced quick review after a day is passed.
7. Step-by-step walkthrough on every wrong answer, highlighting the step where the student went wrong.
8. Music: 7 procedural tracks with Auto mode, volume, toggle in the top bar, settings sheet.

### Corrections the student made (do not repeat these mistakes)
- Wording must be unambiguous. "In 64^(2/5), the 2 tells you which root" confused him; now "you take the square root". Spot-the-mistake asked for "the mistake" when later lines were also wrong; it was then removed entirely.
- Evaluating a root gives the positive value (16^(1/4) = 2); ± only when solving an equation (x⁴ = 16). Lightning has items that drill this.
- Music was too quiet at first; track levels are balanced around 0.15 RMS before the compressor. Phones block audio until the first tap; music starts on the first tap anywhere (no splash screen; he asked to remove it).
- An emailed .html attachment does not run on iPad (previews don't run JavaScript). That is why the app lives on GitHub Pages.

### How to work with the student
- He is on his phone most of the time. Keep replies short, lead with what changed, and give the live link.
- Test every change in headless Chrome before pushing, including generator stress tests.
- He asks to "make a better prompt and then execute": write a short improved spec, show it, then build it.

### Nov 13 changes
Accounts, scratch paper, weak-skill training, lightning lockout and timing, no countdown, -15 per miss, simplest-form method (now the pair method: break into small primes, each pair escapes the root; the student rejected memorizing a list of perfect squares), new Estimating lesson for 5.1, one-time Day 2 mastery reset (`reset52_v1`).

### Nov 13 later
Read-aloud (TTS) was built and then removed at the student's request; don't add it back unasked. Home has tabs (Today, Real life, Skills, Progress).

### Ideas not built yet (he picked spaced review first; ask before building the others)
- Type-your-own-answer questions (closer to real tests than multiple choice).
- Unit 5 mock test mode with a timer and a review list at the end.
- Day 3 for 5.3 with interactive graphs (sliders for shifts and stretches of y = √x).
- A homework check-in each time a new worksheet photo arrives.
