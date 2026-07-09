const STAGE_LABELS = {
  roundOf16: "Round of 16",
  quarterFinalists: "Quarter-finals",
  semifinalists: "Semi-finals",
  thirdPlaceMatch: "3rd-place match",
  finalists: "Final",
};

const CARD_BONUS_ID = "mostCards";
const CARD_BONUS_LABEL = "Most red & yellow cards";

export function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function sameTeam(a, b) {
  return normalizeName(a) === normalizeName(b);
}

function includesTeam(list, team) {
  return Array.isArray(list) && list.some((item) => sameTeam(item, team));
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function teamValueFromRecord(record, team) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;

  for (const [key, value] of Object.entries(record)) {
    if (sameTeam(key, team)) return value;
  }
  return null;
}

function cardLeadersFromRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return { leaders: [], max: 0 };

  const entries = Object.entries(record)
    .map(([team, value]) => [team, Number(value)])
    .filter(([, value]) => Number.isFinite(value) && value > 0);
  const max = Math.max(...entries.map(([, value]) => value), 0);
  return {
    leaders: entries
      .filter(([, value]) => value === max)
      .map(([team]) => team)
      .sort((a, b) => a.localeCompare(b)),
    max,
  };
}

export function actualAdvancersForGroup(results, groupId) {
  const groupResult = results?.groups?.[groupId];
  const currentOrder = asArray(groupResult?.currentOrder);
  if (currentOrder.length === 0) return [];

  const advancers = currentOrder.slice(0, 2);
  if (includesTeam(results?.topThirdGroups ?? [], groupId) && currentOrder[2]) {
    advancers.push(currentOrder[2]);
  }
  return advancers;
}

export function scoreGroup(groupId, groupPick, results, rules) {
  const currentOrder = asArray(results?.groups?.[groupId]?.currentOrder);
  const actualAdvancers = actualAdvancersForGroup(results, groupId);
  const predictedAdvancers = asArray(groupPick?.predictedAdvancers);
  const predictedOrder = asArray(groupPick?.predictedOrder);

  const advancementHits = predictedAdvancers.filter((team) =>
    includesTeam(actualAdvancers, team),
  );
  const advancementPoints = advancementHits.length * rules.groupAdvancement;

  const topFourExact =
    currentOrder.length >= 4 &&
    predictedOrder.slice(0, 4).every((team, index) => sameTeam(team, currentOrder[index]));
  const topTwoExact =
    currentOrder.length >= 2 &&
    predictedOrder.slice(0, 2).every((team, index) => sameTeam(team, currentOrder[index]));

  const rankBonus = topFourExact
    ? rules.exactTopFourBonus
    : topTwoExact
      ? rules.exactTopTwoBonus
      : 0;

  return {
    groupId,
    points: advancementPoints + rankBonus,
    advancementPoints,
    rankBonus,
    advancementHits,
    currentOrder,
    predictedOrder,
  };
}

function scoreStage(stageKey, predictedTeams, actualTeams, rules) {
  const hits = asArray(predictedTeams).filter((team) => includesTeam(actualTeams, team));
  const points = hits.length * rules[stageKey];
  return {
    stageKey,
    label: STAGE_LABELS[stageKey] ?? stageKey,
    hits,
    points,
    perTeam: rules[stageKey],
  };
}

function scoreFinalPosition(label, predicted, actual, points) {
  const hit = Boolean(predicted && actual && sameTeam(predicted, actual));
  return {
    label,
    predicted,
    actual,
    hit,
    points: hit ? points : 0,
  };
}

function scoreBonus(picks, results, rules) {
  return asArray(picks.bonus).map((item) => {
    if (item.id === CARD_BONUS_ID) {
      const cardScores = results?.bonus?.[item.id];
      const cardPoints = Number(teamValueFromRecord(cardScores, item.pick) ?? 0);
      const { leaders, max } = cardLeadersFromRecord(cardScores);
      const hit = includesTeam(leaders, item.pick);
      const leaderText = leaders.length
        ? `${leaders.join(", ")} (${max} Fair Play pts)`
        : "Not entered";
      return {
        id: item.id,
        label: CARD_BONUS_LABEL,
        pick: item.pick,
        answers: leaders,
        answerText: `${leaderText}; ${item.pick}: ${cardPoints}`,
        hit,
        points: hit ? rules.bonus : 0,
      };
    }

    const answers = asArray(results?.bonus?.[item.id]);
    const hit = includesTeam(answers, item.pick);
    return {
      id: item.id,
      label: item.label,
      pick: item.pick,
      answers,
      hit,
      points: hit ? rules.bonus : 0,
    };
  });
}

export function scorePool(picks, results) {
  const rules = picks.scoringRules;
  const groupBreakdown = Object.entries(picks.groups).map(([groupId, groupPick]) =>
    scoreGroup(groupId, groupPick, results, rules),
  );

  const knockoutBreakdown = [
    scoreStage("roundOf16", picks.advancement.roundOf16, results.roundOf16, rules),
    scoreStage(
      "quarterFinalists",
      picks.advancement.quarterFinalists,
      results.quarterFinalists,
      rules,
    ),
    scoreStage("semifinalists", picks.advancement.semifinalists, results.semifinalists, rules),
    scoreStage(
      "thirdPlaceMatch",
      picks.advancement.thirdPlaceMatch,
      results.thirdPlaceMatch,
      rules,
    ),
    scoreStage("finalists", picks.advancement.finalists, results.finalists, rules),
  ];

  const finalsBreakdown = [
    scoreFinalPosition("Champion", picks.podium.champion, results.finals?.champion, rules.champion),
    scoreFinalPosition("Runner-up", picks.podium.runnerUp, results.finals?.runnerUp, rules.runnerUp),
    scoreFinalPosition("Third place", picks.podium.thirdPlace, results.finals?.thirdPlace, rules.thirdPlace),
  ];

  const bonusBreakdown = scoreBonus(picks, results, rules);

  const groupPoints = groupBreakdown.reduce((sum, item) => sum + item.points, 0);
  const knockoutPoints = knockoutBreakdown.reduce((sum, item) => sum + item.points, 0);
  const finalsPoints = finalsBreakdown.reduce((sum, item) => sum + item.points, 0);
  const bonusPoints = bonusBreakdown.reduce((sum, item) => sum + item.points, 0);

  return {
    total: groupPoints + knockoutPoints + finalsPoints + bonusPoints,
    subtotals: {
      group: groupPoints,
      knockout: knockoutPoints,
      finals: finalsPoints,
      bonus: bonusPoints,
    },
    groups: groupBreakdown,
    knockout: knockoutBreakdown,
    finals: finalsBreakdown,
    bonus: bonusBreakdown,
  };
}
