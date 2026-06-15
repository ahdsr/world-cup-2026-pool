# Marcin's 2026 World Cup Pool

Static GitHub Pages site for Marcin's 2026 World Cup pool picks, leaderboard, and current score.

## Product Backlog

See `BACKLOG.md` for MVP planning notes, commissioner dashboard ideas, pool type templates, and future "How to Play" pages.

## Public Site

```text
https://ahdsr.github.io/world-cup-2026-pool/
```

The root URL opens the leaderboard. Individual player pages use hash routes:

```text
/#/entry/lucas-sokolowski
/#/entry/adam-banaszek-1
/#/entry/andrew-d-2
/#/leaderboard
```

## Leaderboard

Entries live in `data/entries.json`.

- `poolName` controls the navbar label and main heading.
- `prizePoolLabel` is currently `$15,000,000`.
- `payouts` controls the visible payout cards: `$8,000,000`, `$4,000,000`, `$2,000,000`, `$1,000,000`.
- `celebrationQuote` on an entry shows a one-time animated quote only when that entry is ranked first.
- Each real entry points at a generated `data/picks*.json` file.
- Duplicate submissions use separate entry ids and labels, such as `adam-banaszek-1` / `Adam Banaszek (1)`.

## Importing Picks

Spreadsheet submissions can be re-imported from the configured files in `scripts/import-xlsx-picks.py`:

```bash
python scripts/import-xlsx-picks.py
```

The importer rebuilds `data/entries.json` and the generated `data/picks*.json` files from the Excel submissions.

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

`.github/workflows/update-results.yml` updates `data/results.json`, runs tests, and commits only when results changed.

The preferred live updater is the external Cloudflare cron worker in `workers/update-results-cron`, which dispatches the workflow every 15 minutes. The GitHub workflow also keeps a 15-minute schedule as a fallback. A concurrency guard prevents overlapping updater runs.

Cloudflare Worker commands:

```bash
npm install
npm run worker:deploy:dry-run
npm run worker:secret:github
npm run worker:deploy
```

See `workers/update-results-cron/README.md` for token setup and the optional manual trigger.

## Local Preview

Run any small static server from this folder:

```bash
python -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/#/leaderboard
http://127.0.0.1:4173/#/entry/lucas-sokolowski
http://127.0.0.1:4173/#/entry/adam-banaszek-1
http://127.0.0.1:4173/#/entry/andrew-d-2
```
