# 2026 World Cup Pool Picks

Static GitHub Pages site for Lucas' 2026 World Cup pool picks and current score.

## Public Site

After GitHub Pages is enabled, the site will be available at:

```text
https://ahdsr.github.io/world-cup-2026-pool/
```

## Update The Score

1. Open `data/results.json`.
2. Update `meta.lastUpdated` to the current timestamp.
3. Copy the current official group order into each active group:

```json
"A": {
  "currentOrder": ["Mexico", "Czechia", "South Korea", "South Africa"],
  "status": "live"
}
```

4. Update `topThirdGroups` with the current top-eight third-place groups, such as:

```json
["A", "B", "C", "D", "E", "F", "I", "J"]
```

5. As knockout rounds finish, update these arrays:

```json
"roundOf16": [],
"quarterFinalists": [],
"semifinalists": [],
"thirdPlaceMatch": [],
"finalists": []
```

6. At the end, update:

```json
"finals": {
  "champion": "",
  "runnerUp": "",
  "thirdPlace": ""
}
```

7. Run the test before publishing:

```bash
npm test
```

8. Commit and push:

```bash
git add data/results.json
git commit -m "Update pool score"
git push
```

The page calculates the score in the browser from `data/picks.json` and `data/results.json`.

## Local Preview

Run any small static server from this folder, for example:

```bash
python -m http.server 4173
```

Then open:

```text
http://localhost:4173/
```
