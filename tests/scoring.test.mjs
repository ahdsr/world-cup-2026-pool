import assert from "node:assert/strict";
import { scorePool } from "../assets/scoring.js";
import picks from "../data/picks.json" with { type: "json" };
import baseResults from "../data/results.json" with { type: "json" };

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function emptyResults() {
  return clone(baseResults);
}

function groupOnly(groupId, order, topThirdGroups = []) {
  const results = emptyResults();
  results.groups[groupId].currentOrder = order;
  results.groups[groupId].status = "live";
  results.topThirdGroups = topThirdGroups;
  return results;
}

{
  const score = scorePool(picks, emptyResults());
  assert.equal(score.total, 0, "empty results should score zero");
}

{
  const score = scorePool(
    picks,
    groupOnly("A", ["Mexico", "Czechia", "South Korea", "South Africa"], ["A"]),
  );
  assert.equal(score.subtotals.group, 11, "exact top four with third-place advancer");
}

{
  const score = scorePool(
    picks,
    groupOnly("A", ["Mexico", "Czechia", "South Africa", "South Korea"], []),
  );
  assert.equal(score.subtotals.group, 7, "exact top two should add three-point rank bonus");
}

{
  const score = scorePool(
    picks,
    groupOnly("A", ["Czechia", "Mexico", "South Korea", "South Africa"], ["A"]),
  );
  assert.equal(score.subtotals.group, 6, "advancement hits should score even without rank bonus");
}

{
  const results = emptyResults();
  results.roundOf16 = picks.advancement.roundOf16.slice(0, 2);
  results.quarterFinalists = picks.advancement.quarterFinalists.slice(0, 1);
  results.semifinalists = picks.advancement.semifinalists.slice(0, 1);
  results.thirdPlaceMatch = picks.advancement.thirdPlaceMatch.slice(0, 1);
  results.finalists = picks.advancement.finalists.slice(0, 1);
  const score = scorePool(picks, results);
  assert.equal(score.subtotals.knockout, 3 * 2 + 5 + 7 + 9 + 10);
}

{
  const results = emptyResults();
  results.finals = {
    champion: picks.podium.champion,
    runnerUp: picks.podium.runnerUp,
    thirdPlace: picks.podium.thirdPlace,
  };
  const score = scorePool(picks, results);
  assert.equal(score.subtotals.finals, 50, "final podium should score 25 + 15 + 10");
}

{
  const results = emptyResults();
  results.bonus.mostGoalsScored = ["France", picks.bonus[0].pick];
  const score = scorePool(picks, results);
  assert.equal(score.subtotals.bonus, 5, "bonus ties should accept any matching answer");
}

console.log("All scoring tests passed.");
