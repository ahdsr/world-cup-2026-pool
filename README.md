# Marcin's 2026 World Cup Pool

Static GitHub Pages site for Marcin's 2026 World Cup pool picks, leaderboard, and current score.

## Public Site

```text
https://ahdsr.github.io/world-cup-2026-pool/
```

The root URL opens the leaderboard. Individual player pages use hash routes:

```text
/#/entry/lucas
/#/entry/mike-b
/#/entry/marcin
/#/entry/tata
/#/entry/rana
/#/leaderboard
```

## Leaderboard

Entries live in `data/entries.json`.

- `poolName` controls the navbar label and main heading.
- `prizePoolLabel` is currently `$15,000,000`.
- `payouts` controls the visible payout cards: `$8,000,000`, `$4,000,000`, `$2,000,000`, `$1,000,000`.
- `celebrationQuote` on an entry shows a one-time animated quote only when that entry is ranked first.
- Lucas points at `data/picks.json`.
- Mike B points at `data/picks-mike-b.json`.
- Marcin points at `data/picks-marcin.json`.
- Tata points at `data/picks-tata.json`.
- Rana points at `data/picks-rana.json`.

## Live Results

Run the ESPN updater locally:

```bash
node scripts/update-results.mjs
npm test
```

The updater writes `data/results.json` from ESPN's public scoreboard feed and computes:

- group orders
- top third-place groups, withheld until the group stage is final
- knockout advancement arrays
- final podium
- score-derived bonuses for most goals scored and most goals conceded

Manual-only data and official corrections belong in `data/manual-overrides.json`.
Use that file for deeper FIFA tiebreakers, score corrections, and bonus categories not available from match scores.

## GitHub Actions

`.github/workflows/update-results.yml` runs every five minutes and can also be triggered manually.
It updates `data/results.json`, runs tests, and commits only when results changed.

## Local Preview

Run any small static server from this folder:

```bash
python -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/#/leaderboard
http://127.0.0.1:4173/#/entry/lucas
http://127.0.0.1:4173/#/entry/mike-b
http://127.0.0.1:4173/#/entry/marcin
http://127.0.0.1:4173/#/entry/tata
http://127.0.0.1:4173/#/entry/rana
```
