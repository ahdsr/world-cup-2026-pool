import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { basename } from "node:path";
import { scorePool } from "../assets/scoring.js";
import entries from "../data/entries.json" with { type: "json" };
import results from "../data/results.json" with { type: "json" };

const GROUP_IDS = "ABCDEFGHIJKL".split("");
const BONUS_IDS = [
  "mostGoalsScored",
  "mostGoalsConceded",
  "farthestGoal",
  "bestPassCompletion",
  "mostCards",
];
const KNOCKOUT_COUNTS = {
  roundOf16: 16,
  quarterFinalists: 8,
  semifinalists: 4,
  finalists: 2,
  thirdPlaceMatch: 2,
};
const RETIRED_TEST_ENTRANTS = [
  { id: "mike-b", name: "Mike B", picksPath: "data/picks-mike-b.json" },
  { id: "tata", name: "Tata", picksPath: "data/picks-tata.json" },
];

function sameMembers(actual, expected, message) {
  assert.deepEqual([...actual].sort(), [...expected].sort(), message);
}

function unique(values) {
  return new Set(values).size === values.length;
}

function winners(matches) {
  return matches.map((match) => match.winner);
}

function losers(matches) {
  return matches.map((match) => match.teams.find((team) => team !== match.winner));
}

const dataFiles = await fs.readdir("data");
const pickFiles = dataFiles
  .filter((file) => /^picks(?:-|\.json)/.test(file) && file.endsWith(".json"))
  .map((file) => `data/${file}`)
  .sort();
const entryPaths = (entries.entries ?? []).map((entry) => entry.picksPath).filter(Boolean).sort();

for (const retired of RETIRED_TEST_ENTRANTS) {
  assert.ok(!pickFiles.includes(retired.picksPath), `${retired.name} test picks should not exist`);
  assert.ok(!entryPaths.includes(retired.picksPath), `${retired.name} should not be on the leaderboard`);
  assert.ok(!entries.entries.some((entry) => entry.id === retired.id), `${retired.name} id should stay retired`);
  assert.ok(!entries.entries.some((entry) => entry.name === retired.name), `${retired.name} name should stay retired`);
}

assert.deepEqual(
  entryPaths,
  pickFiles,
  "every generated picks JSON file should be represented on the leaderboard",
);

const entryIds = entries.entries.map((entry) => entry.id);
const entryNames = entries.entries.map((entry) => entry.name);
assert.ok(unique(entryIds), "entry ids should be unique");
assert.ok(unique(entryPaths), "entry pick paths should be unique");
assert.ok(unique(entryNames), "entry display names should be unique");

for (const entry of entries.entries) {
  const picks = JSON.parse(await fs.readFile(entry.picksPath, "utf8"));
  const label = `${entry.name} (${basename(entry.picksPath)})`;
  const teamNames = new Set(
    Object.values(picks.groups ?? {}).flatMap((group) => (group.teams ?? []).map((team) => team.name)),
  );

  assert.equal(picks.meta?.owner, entry.name, `${label} owner should match entry name`);
  assert.deepEqual(Object.keys(picks.groups ?? {}), GROUP_IDS, `${label} should include all groups A-L`);
  assert.deepEqual(
    picks.bonus?.map((item) => item.id),
    BONUS_IDS,
    `${label} should include all bonus questions in the expected order`,
  );

  for (const bonus of picks.bonus ?? []) {
    assert.ok(teamNames.has(bonus.pick), `${label} bonus pick "${bonus.pick}" should be a tournament team`);
  }

  const selectedThirdPlaceGroups = Object.values(picks.thirdPlace ?? {}).filter((item) => item.selected);
  assert.equal(selectedThirdPlaceGroups.length, 8, `${label} should select exactly eight third-place advancers`);

  for (const groupId of GROUP_IDS) {
    const group = picks.groups[groupId];
    const thirdPlace = picks.thirdPlace?.[groupId];
    const groupTeams = (group.teams ?? []).map((team) => team.name);
    assert.equal(groupTeams.length, 4, `${label} Group ${groupId} should have four teams`);
    assert.ok(unique(groupTeams), `${label} Group ${groupId} teams should be unique`);
    sameMembers(group.predictedOrder, groupTeams, `${label} Group ${groupId} predicted order should use its teams`);
    assert.equal(
      thirdPlace?.team,
      group.predictedOrder[2],
      `${label} Group ${groupId} third-place pick should be the predicted third-place team`,
    );

    const expectedAdvancers = [
      group.predictedOrder[0],
      group.predictedOrder[1],
      ...(thirdPlace?.selected ? [group.predictedOrder[2]] : []),
    ];
    assert.deepEqual(
      group.predictedAdvancers,
      expectedAdvancers,
      `${label} Group ${groupId} advancers should match top two plus selected third-place team`,
    );
  }

  assert.deepEqual(
    picks.advancement.roundOf16,
    winners(picks.knockout.roundOf32),
    `${label} Round of 16 advancement should match Round of 32 winners`,
  );
  assert.deepEqual(
    picks.advancement.quarterFinalists,
    winners(picks.knockout.roundOf16),
    `${label} quarter-finalists should match Round of 16 winners`,
  );
  assert.deepEqual(
    picks.advancement.semifinalists,
    winners(picks.knockout.quarterFinals),
    `${label} semi-finalists should match quarter-final winners`,
  );
  assert.deepEqual(
    picks.advancement.finalists,
    winners(picks.knockout.semiFinals),
    `${label} finalists should match semi-final winners`,
  );
  assert.deepEqual(
    picks.advancement.thirdPlaceMatch,
    losers(picks.knockout.semiFinals),
    `${label} third-place teams should match semi-final losers`,
  );

  for (const [key, expectedCount] of Object.entries(KNOCKOUT_COUNTS)) {
    assert.equal(picks.advancement[key]?.length, expectedCount, `${label} ${key} count should be ${expectedCount}`);
    assert.ok(unique(picks.advancement[key]), `${label} ${key} teams should be unique`);
  }

  assert.equal(picks.podium.champion, picks.knockout.final.winner, `${label} champion should match final winner`);
  assert.equal(
    picks.podium.runnerUp,
    picks.knockout.final.teams.find((team) => team !== picks.knockout.final.winner),
    `${label} runner-up should match final loser`,
  );
  assert.equal(
    picks.podium.thirdPlace,
    picks.knockout.thirdPlace.winner,
    `${label} third place should match third-place match winner`,
  );

  const score = scorePool(picks, results);
  assert.equal(
    score.total,
    score.subtotals.group + score.subtotals.knockout + score.subtotals.finals + score.subtotals.bonus,
    `${label} total should equal subtotal sum`,
  );
}

console.log("Picks audit tests passed.");
