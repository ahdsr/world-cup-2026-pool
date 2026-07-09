import assert from "node:assert/strict";
import { scorePool } from "../assets/scoring.js";
import picks from "../data/picks.json" with { type: "json" };

function emptyResults() {
  return {
    meta: {
      lastUpdated: "",
      status: "test fixture",
      sourceNote: "",
    },
    groups: Object.fromEntries(
      Object.keys(picks.groups).map((groupId) => [
        groupId,
        {
          currentOrder: [],
          status: "not-started",
        },
      ]),
    ),
    topThirdGroups: [],
    roundOf16: [],
    quarterFinalists: [],
    semifinalists: [],
    thirdPlaceMatch: [],
    finalists: [],
    finals: {
      champion: "",
      runnerUp: "",
      thirdPlace: "",
    },
    bonus: Object.fromEntries(picks.bonus.map((item) => [item.id, []])),
  };
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
  const groupId = "A";
  const groupPick = picks.groups[groupId];
  const score = scorePool(
    picks,
    groupOnly(groupId, groupPick.predictedOrder, [groupId]),
  );
  assert.equal(
    score.subtotals.group,
    groupPick.predictedAdvancers.length * picks.scoringRules.groupAdvancement +
      picks.scoringRules.exactTopFourBonus,
    "exact top four with third-place advancer",
  );
}

{
  const groupId = "A";
  const groupPick = picks.groups[groupId];
  const [first, second, third, fourth] = groupPick.predictedOrder;
  const score = scorePool(
    picks,
    groupOnly(groupId, [first, second, fourth, third], []),
  );
  assert.equal(
    score.subtotals.group,
    2 * picks.scoringRules.groupAdvancement + picks.scoringRules.exactTopTwoBonus,
    "exact top two should add three-point rank bonus",
  );
}

{
  const groupId = "A";
  const groupPick = picks.groups[groupId];
  const [first, second, third, fourth] = groupPick.predictedOrder;
  const score = scorePool(
    picks,
    groupOnly(groupId, [second, first, third, fourth], [groupId]),
  );
  assert.equal(
    score.subtotals.group,
    groupPick.predictedAdvancers.length * picks.scoringRules.groupAdvancement,
    "advancement hits should score even without rank bonus",
  );
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

{
  const results = emptyResults();
  const cardsPick = picks.bonus.find((item) => item.id === "mostCards").pick;
  results.bonus.mostCards = {
    Egypt: 9,
    [cardsPick]: 4,
  };
  const score = scorePool(picks, results);
  const cardScore = score.bonus.find((item) => item.id === "mostCards");
  assert.equal(cardScore.points, 0, "cards should not score unless the pick leads on Fair Play Points");
  assert.equal(
    score.subtotals.bonus,
    0,
    "card Fair Play Points should not be added directly to the bonus subtotal",
  );
}

{
  const results = emptyResults();
  const cardsPick = picks.bonus.find((item) => item.id === "mostCards").pick;
  results.bonus.mostCards = {
    Egypt: 9,
    [cardsPick]: 9,
  };
  const score = scorePool(picks, results);
  const cardScore = score.bonus.find((item) => item.id === "mostCards");
  assert.equal(cardScore.points, 5, "cards should award the normal bonus when the pick is a leader");
}

console.log("All scoring tests passed.");
