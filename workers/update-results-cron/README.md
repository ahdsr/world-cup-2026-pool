# Results Cron Worker

Cloudflare Worker that dispatches `.github/workflows/update-results.yml` every 15 minutes.

The worker is intentionally small: it does not fetch FIFA or edit files directly. It triggers the existing GitHub Actions updater, which fetches FIFA official data, runs tests, and commits `data/results.json` only when results changed.

## Setup

1. Create a GitHub token that can dispatch workflows for `ahdsr/world-cup-2026-pool`.
   - Fine-grained token: grant Actions read/write access for this repo.
   - Classic token: use `repo` scope.
2. Install dependencies from the repository root:

```bash
npm install
```

3. Authenticate Wrangler:

```bash
npx wrangler login
```

4. From the repository root, add the token as a Cloudflare secret:

```bash
npm run worker:secret:github
```

5. Deploy the worker:

```bash
npm run worker:deploy
```

## Schedule

`wrangler.toml` runs the worker every 15 minutes:

```toml
[triggers]
crons = ["*/15 * * * *"]
```

The GitHub workflow also keeps a staggered 15-minute fallback schedule at `:07`, `:22`, `:37`, and `:52`. A workflow concurrency guard prevents overlapping updater runs, and the workflow syncs to the latest `main` before generating results.

## Optional Manual Trigger

The worker exposes `/run` for a manual dispatch only after a `RUN_TOKEN` secret is set:

```bash
npm run worker:secret:run
```

Then call:

```bash
curl -H "Authorization: Bearer $RUN_TOKEN" https://<worker-url>/run
```
