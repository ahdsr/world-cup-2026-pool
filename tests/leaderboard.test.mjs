import assert from "node:assert/strict";
import { buildLeaderboardRows } from "../assets/leaderboard.js";
import { scorePool } from "../assets/scoring.js";
import entries from "../data/entries.json" with { type: "json" };
import picks from "../data/picks.json" with { type: "json" };
import results from "../data/results.json" with { type: "json" };

const picksByPath = new Map([["data/picks.json", picks]]);
const rows = buildLeaderboardRows(entries, picksByPath, results);
const lucas = rows.find((row) => row.id === "lucas");
const expectedLucasScore = scorePool(picks, results);

assert.ok(lucas, "Lucas should be present on the leaderboard");
assert.equal(lucas.score.total, expectedLucasScore.total, "Lucas row should use live scoring");
assert.deepEqual(
  lucas.score.subtotals,
  expectedLucasScore.subtotals,
  "Lucas row should expose scoring subtotals",
);

for (let index = 1; index < rows.length; index += 1) {
  assert.ok(
    rows[index - 1].score.total >= rows[index].score.total,
    "leaderboard should sort by total descending",
  );
}

const sample = rows.find((row) => row.sample);
assert.ok(sample, "sample rows should be included for layout testing");
assert.equal(
  sample.score.total,
  sample.score.subtotals.group +
    sample.score.subtotals.knockout +
    sample.score.subtotals.finals +
    sample.score.subtotals.bonus,
  "sample row total should match its subtotals",
);

console.log("Leaderboard tests passed.");
