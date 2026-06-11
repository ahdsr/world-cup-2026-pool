import assert from "node:assert/strict";
import { buildLeaderboardRows } from "../assets/leaderboard.js";
import { scorePool } from "../assets/scoring.js";
import entries from "../data/entries.json" with { type: "json" };
import results from "../data/results.json" with { type: "json" };

const picksByPath = new Map(
  await Promise.all(
    entries.entries
      .filter((entry) => entry.picksPath)
      .map(async (entry) => [
        entry.picksPath,
        (await import(`../${entry.picksPath}`, { with: { type: "json" } })).default,
      ]),
  ),
);
const rows = buildLeaderboardRows(entries, picksByPath, results);

for (const entry of entries.entries) {
  const row = rows.find((item) => item.id === entry.id);
  assert.ok(row, `${entry.name} should be present on the leaderboard`);

  if (entry.picksPath) {
    const entryPicks = picksByPath.get(entry.picksPath);
    const expectedScore = scorePool(entryPicks, results);

    assert.equal(row.score.total, expectedScore.total, `${entry.name} row should use live scoring`);
    assert.deepEqual(
      row.score.subtotals,
      expectedScore.subtotals,
      `${entry.name} row should expose scoring subtotals`,
    );
  }
}

for (let index = 1; index < rows.length; index += 1) {
  assert.ok(
    rows[index - 1].score.total >= rows[index].score.total,
    "leaderboard should sort by total descending",
  );
}

assert.equal(rows.some((row) => row.sample), false, "leaderboard should only show real entries");

console.log("Leaderboard tests passed.");
