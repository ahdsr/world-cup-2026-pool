# 2026 World Cup Pool Picks

Static GitHub Pages site for Lucas' 2026 World Cup pool picks, leaderboard, and current score.

## Public Site

```text
https://ahdsr.github.io/world-cup-2026-pool/
```

Useful routes:

```text
/#/entry/lucas
/#/leaderboard
```

## Leaderboard

Entries live in `data/entries.json`.

- `poolName` controls the navbar label.
- `prizePoolLabel` is currently `TBD`.
- Lucas is the real entry and points at `data/picks.json`.
- Sample entries are marked with `"sample": true` and can be replaced later with real pick files.

## Live Results

Run the ESPN updater locally:

```bash
node scripts/update-results.mjs
npm test
```

The updater writes `data/results.json` from ESPN's public scoreboard feed and computes:

- group orders
- top third-place groups
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
```
