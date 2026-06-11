import assert from "node:assert/strict";
import { buildLeaderboardRows } from "../assets/leaderboard.js";
import { scorePool } from "../assets/scoring.js";
import entries from "../data/entries.json" with { type: "json" };
import picks from "../data/picks.json" with { type: "json" };
import mikePicks from "../data/picks-mike-b.json" with { type: "json" };
import results from "../data/results.json" with { type: "json" };

const picksByPath = new Map([
  ["data/picks.json", picks],
  ["data/picks-mike-b.json", mikePicks],
]);
const rows = buildLeaderboardRows(entries, picksByPath, results);
const lucas = rows.find((row) => row.id === "lucas");
const mike = rows.find((row) => row.id === "mike-b");
const expectedLucasScore = scorePool(picks, results);
const expectedMikeScore = scorePool(mikePicks, results);

assert.ok(lucas, "Lucas should be present on the leaderboard");
assert.equal(lucas.score.total, expectedLucasScore.total, "Lucas row should use live scoring");
assert.deepEqual(
  lucas.score.subtotals,
  expectedLucasScore.subtotals,
  "Lucas row should expose scoring subtotals",
);

assert.ok(mike, "Mike B should be present on the leaderboard");
assert.equal(mike.score.total, expectedMikeScore.total, "Mike B row should use live scoring");
assert.deepEqual(
  mike.score.subtotals,
  expectedMikeScore.subtotals,
  "Mike B row should expose scoring subtotals",
);

for (let index = 1; index < rows.length; index += 1) {
  assert.ok(
    rows[index - 1].score.total >= rows[index].score.total,
    "leaderboard should sort by total descending",
  );
}

assert.equal(rows.some((row) => row.sample), false, "leaderboard should only show real entries");

console.log("Leaderboard tests passed.");
