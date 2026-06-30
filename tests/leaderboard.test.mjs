import assert from "node:assert/strict";
import { buildLeaderboardRows, buildPoolAnalytics, buildTodayOutlook } from "../assets/leaderboard.js";
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

{
  const analytics = buildPoolAnalytics(entries, picksByPath, results, rows);
  assert.equal(analytics.payoutPlaces, 4, "analytics should use configured payout places");
  assert.equal(analytics.rows.length, rows.length, "analytics should include every leaderboard row");
  assert.ok(analytics.aliveCount > 0, "at least one entry should still be alive");

  for (const row of analytics.rows) {
    assert.ok(
      row.maxPossible >= row.currentTotal,
      `${row.name} max possible should not be below current score`,
    );
    assert.equal(
      row.maxPossible,
      row.currentTotal + row.remaining.total,
      `${row.name} max possible should include remaining ceiling`,
    );
    assert.ok(
      row.ceilingRank >= 1 && row.ceilingRank <= rows.length,
      `${row.name} should have a valid ceiling rank`,
    );
  }
}

{
  const outlookResults = structuredClone(results);
  outlookResults.fixtures = [
    {
      id: "today-england-ghana",
      date: "2026-06-23T20:00:00.000Z",
      state: "pre",
      completed: false,
      detail: "Scheduled",
      homeTeam: "England",
      awayTeam: "Ghana",
      homeScore: 0,
      awayScore: 0,
    },
  ];
  const outlook = buildTodayOutlook(
    entries,
    picksByPath,
    outlookResults,
    "lucas-czuchraj",
    new Date("2026-06-23T12:00:00.000"),
  );

  assert.ok(outlook, "today outlook should be built for a real entry");
  assert.equal(outlook.matches.length, 1, "today outlook should include today's fixture");
  assert.equal(outlook.totalScenarioCount, 3, "one actionable match should create three outcomes");
  assert.equal(outlook.bestScenarios.length, 3, "today outlook should rank available scenarios");
  assert.ok(
    outlook.bestScenarios.every((scenario) => scenario.outcomes.length === 1),
    "each scenario should describe the required match outcome",
  );
}

console.log("Leaderboard tests passed.");
