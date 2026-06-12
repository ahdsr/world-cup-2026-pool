# Results Cron Worker

Cloudflare Worker that dispatches `.github/workflows/update-results.yml` every 15 minutes.

The worker is intentionally small: it does not fetch ESPN or edit files directly. It triggers the existing GitHub Actions updater, which fetches ESPN, runs tests, and commits `data/results.json` only when results changed.

## Setup

1. Create a GitHub token that can dispatch workflows for `ahdsr/world-cup-2026-pool`.
   - Fine-grained token: grant Actions read/write access for this repo.
   - Classic token: use `repo` scope.
2. Install and authenticate Wrangler.
3. From this folder, add the token as a Cloudflare secret:

```bash
wrangler secret put GITHUB_TOKEN
```

4. Deploy the worker:

```bash
wrangler deploy
```

## Schedule

`wrangler.toml` runs the worker every 15 minutes:

```toml
[triggers]
crons = ["*/15 * * * *"]
```

The GitHub workflow also keeps a 15-minute schedule as a fallback. A workflow concurrency guard prevents overlapping updater runs.

## Optional Manual Trigger

The worker exposes `/run` for a manual dispatch only after a `RUN_TOKEN` secret is set:

```bash
wrangler secret put RUN_TOKEN
```

Then call:

```bash
curl -H "Authorization: Bearer $RUN_TOKEN" https://<worker-url>/run
```
