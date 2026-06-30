import { normalizeName, scorePool } from "./scoring.js";

const EMPTY_SUBTOTALS = {
  group: 0,
  knockout: 0,
  finals: 0,
  bonus: 0,
};

function cleanScore(score) {
  const subtotals = {
    ...EMPTY_SUBTOTALS,
    ...(score?.subtotals ?? {}),
  };
  const total =
    Number.isFinite(score?.total) ?
      score.total :
      subtotals.group + subtotals.knockout + subtotals.finals + subtotals.bonus;

  return {
    total,
    subtotals,
  };
}

export function scoreEntry(entry, picksByPath, results) {
  if (entry.sample) {
    return cleanScore(entry.score);
  }

  const picks = picksByPath.get(entry.picksPath);
  if (!picks) {
    return cleanScore();
  }

  return scorePool(picks, results);
}

export function buildLeaderboardRows(entriesConfig, picksByPath, results) {
  let lastScore = null;
  let lastRank = 0;

  return (entriesConfig.entries ?? [])
    .map((entry) => ({
      ...entry,
      score: scoreEntry(entry, picksByPath, results),
    }))
    .sort((a, b) => {
      if (b.score.total !== a.score.total) return b.score.total - a.score.total;
      return a.name.localeCompare(b.name);
    })
    .map((entry, index) => {
      const rank = entry.score.total === lastScore ? lastRank : index + 1;
      lastScore = entry.score.total;
      lastRank = rank;
      return {
        ...entry,
        rank,
      };
    });
}

function validDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameLocalDay(value, today) {
  const date = validDate(value);
  if (!date) return false;
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function matchKey(match) {
  return match.id || `${match.date}|${match.homeTeam}|${match.awayTeam}`;
}

function todayOpenMatches(results, today) {
  const seen = new Set();
  return [...(results.fixtures ?? []), ...(results.matches ?? [])]
    .filter((match) => !match.completed && sameLocalDay(match.date, today))
    .filter((match) => {
      const key = matchKey(match);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function teamGroupMap(picks) {
  const teams = new Map();
  for (const [groupId, group] of Object.entries(picks?.groups ?? {})) {
    for (const team of group.teams ?? []) {
      teams.set(normalizeName(team.name), groupId);
    }
  }
  return teams;
}

function matchGroup(match, teams) {
  const homeGroup = teams.get(normalizeName(match.homeTeam));
  const awayGroup = teams.get(normalizeName(match.awayTeam));
  return homeGroup && homeGroup === awayGroup ? homeGroup : "";
}

function cloneValue(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function finiteScore(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function adjustScore(home, away, homeScore, awayScore, direction) {
  const multiplier = direction === "remove" ? -1 : 1;
  home.played += multiplier;
  away.played += multiplier;
  home.goalsFor += homeScore * multiplier;
  home.goalsAgainst += awayScore * multiplier;
  away.goalsFor += awayScore * multiplier;
  away.goalsAgainst += homeScore * multiplier;

  if (homeScore > awayScore) {
    home.points += 3 * multiplier;
  } else if (awayScore > homeScore) {
    away.points += 3 * multiplier;
  } else {
    home.points += 1 * multiplier;
    away.points += 1 * multiplier;
  }

  for (const item of [home, away]) {
    item.played = Math.max(0, item.played);
    item.points = Math.max(0, item.points);
    item.goalsFor = Math.max(0, item.goalsFor);
    item.goalsAgainst = Math.max(0, item.goalsAgainst);
    item.goalDifference = item.goalsFor - item.goalsAgainst;
  }
}

function compareStats(a, b) {
  return (
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    a.team.localeCompare(b.team)
  );
}

function groupStatsMap(group) {
  return new Map((group?.stats ?? []).map((item) => [normalizeName(item.team), item]));
}

function representativeScore(match, outcome) {
  const currentHome = match.state === "in" ? finiteScore(match.homeScore) : 0;
  const currentAway = match.state === "in" ? finiteScore(match.awayScore) : 0;

  if (outcome === "home") {
    return [Math.max(currentHome, currentAway + 1, 1), currentAway];
  }
  if (outcome === "away") {
    return [currentHome, Math.max(currentAway, currentHome + 1, 1)];
  }

  const drawScore = match.state === "in" ? Math.max(currentHome, currentAway) : 1;
  return [drawScore, drawScore];
}

function applyScenarioMatch(results, match, outcome, groupId) {
  const group = results.groups?.[groupId];
  if (!group) return;

  const stats = groupStatsMap(group);
  const home = stats.get(normalizeName(match.homeTeam));
  const away = stats.get(normalizeName(match.awayTeam));
  if (!home || !away) return;

  if (match.state === "in") {
    adjustScore(home, away, finiteScore(match.homeScore), finiteScore(match.awayScore), "remove");
  }

  const [homeScore, awayScore] = representativeScore(match, outcome);
  adjustScore(home, away, homeScore, awayScore, "add");

  group.stats = [...stats.values()].sort(compareStats);
  group.currentOrder = group.stats.map((item) => item.team);
  if (group.status === "not-started") group.status = "active";
}

function leadersBy(stats, key) {
  if (stats.length === 0) return [];
  const max = Math.max(...stats.map((item) => item[key]));
  if (max <= 0) return [];
  return stats
    .filter((item) => item[key] === max)
    .map((item) => item.team)
    .sort((a, b) => a.localeCompare(b));
}

function recomputeScoreBonuses(results) {
  const stats = Object.values(results.groups ?? {})
    .flatMap((group) => group.stats ?? [])
    .filter((item) => item.played > 0);
  results.bonus = {
    ...(results.bonus ?? {}),
    mostGoalsScored: leadersBy(stats, "goalsFor"),
    mostGoalsConceded: leadersBy(stats, "goalsAgainst"),
  };
}

function outcomeLabel(match, outcome) {
  if (outcome === "draw") return `${match.homeTeam} and ${match.awayTeam} draw`;
  return `${outcome === "home" ? match.homeTeam : match.awayTeam} win`;
}

function* outcomeCombinations(matches, index = 0, current = []) {
  if (index >= matches.length) {
    yield current;
    return;
  }

  for (const outcome of ["home", "draw", "away"]) {
    yield* outcomeCombinations(matches, index + 1, [...current, outcome]);
  }
}

function passedEntrants(currentRows, scenarioRows, player) {
  const scenarioPlayer = scenarioRows.find((row) => row.id === player.id);
  if (!scenarioPlayer) return [];

  return currentRows
    .filter((row) => row.rank < player.rank)
    .filter((row) => {
      const scenarioOpponent = scenarioRows.find((item) => item.id === row.id);
      return scenarioOpponent && scenarioPlayer.rank < scenarioOpponent.rank;
    })
    .map((row) => row.name);
}

export function buildTodayOutlook(entriesConfig, picksByPath, results, entryId, today = new Date()) {
  const entry = (entriesConfig.entries ?? []).find((item) => item.id === entryId);
  if (!entry || entry.sample) return null;

  const picks = picksByPath.get(entry.picksPath);
  if (!picks) return null;

  const currentRows = buildLeaderboardRows(entriesConfig, picksByPath, results);
  const currentPlayer = currentRows.find((row) => row.id === entryId);
  if (!currentPlayer) return null;

  const teams = teamGroupMap(picks);
  const matches = todayOpenMatches(results, today);
  const actionableMatches = matches
    .map((match) => ({ ...match, groupId: matchGroup(match, teams) }))
    .filter((match) => match.groupId);
  const totalScenarioCount = 3 ** actionableMatches.length;

  if (!actionableMatches.length || totalScenarioCount > 729) {
    return {
      entry,
      currentRank: currentPlayer.rank,
      currentTotal: currentPlayer.score.total,
      matches,
      actionableMatches,
      totalScenarioCount,
      tooManyScenarios: totalScenarioCount > 729,
      scenarios: [],
      improvingScenarios: [],
      bestScenarios: [],
      mustHaveOutcomes: [],
    };
  }

  const scenarios = [];
  for (const outcomes of outcomeCombinations(actionableMatches)) {
    const scenarioResults = cloneValue(results);
    actionableMatches.forEach((match, index) => {
      applyScenarioMatch(scenarioResults, match, outcomes[index], match.groupId);
    });
    recomputeScoreBonuses(scenarioResults);

    const scenarioRows = buildLeaderboardRows(entriesConfig, picksByPath, scenarioResults);
    const scenarioPlayer = scenarioRows.find((row) => row.id === entryId);
    if (!scenarioPlayer) continue;

    scenarios.push({
      rank: scenarioPlayer.rank,
      total: scenarioPlayer.score.total,
      pointGain: scenarioPlayer.score.total - currentPlayer.score.total,
      rankGain: currentPlayer.rank - scenarioPlayer.rank,
      outcomes: outcomes.map((outcome, index) => ({
        type: outcome,
        label: outcomeLabel(actionableMatches[index], outcome),
        match: actionableMatches[index],
      })),
      passedNames: passedEntrants(currentRows, scenarioRows, currentPlayer),
    });
  }

  const sortScenarios = (a, b) =>
    a.rank - b.rank || b.total - a.total || b.pointGain - a.pointGain;
  const improvingScenarios = scenarios
    .filter((scenario) => scenario.rankGain > 0)
    .sort(sortScenarios);
  const bestScenarios = scenarios.slice().sort(sortScenarios).slice(0, 5);
  const mustHaveOutcomes = actionableMatches
    .map((match, index) => {
      const first = improvingScenarios[0]?.outcomes[index];
      if (!first) return null;
      const required = improvingScenarios.every((scenario) => scenario.outcomes[index].type === first.type);
      return required ? { match, outcome: first } : null;
    })
    .filter(Boolean);

  return {
    entry,
    currentRank: currentPlayer.rank,
    currentTotal: currentPlayer.score.total,
    matches,
    actionableMatches,
    totalScenarioCount,
    tooManyScenarios: false,
    scenarios,
    improvingScenarios,
    bestScenarios,
    mustHaveOutcomes,
  };
}

const KNOCKOUT_CEILING_STAGES = [
  { key: "roundOf16", label: "Round of 16" },
  { key: "quarterFinalists", label: "Quarter-finals" },
  { key: "semifinalists", label: "Semi-finals" },
  { key: "thirdPlaceMatch", label: "3rd-place match" },
  { key: "finalists", label: "Final" },
];

const FINAL_CEILING_STAGES = [
  { key: "champion", label: "Champion" },
  { key: "runnerUp", label: "Runner-up" },
  { key: "thirdPlace", label: "Third place" },
];

function stageRemaining(maxPoints, currentPoints, settled) {
  if (settled) return 0;
  return Math.max(0, maxPoints - currentPoints);
}

function groupRemaining(groupPick, groupScore, groupResult, rules) {
  if (groupResult?.status === "final") return 0;

  const maxAdvancement =
    (groupPick?.predictedAdvancers?.length ?? 0) * rules.groupAdvancement;
  const maxRankBonus = rules.exactTopFourBonus;
  return stageRemaining(maxAdvancement + maxRankBonus, groupScore?.points ?? 0, false);
}

function knockoutRemaining(picks, score, results, rules) {
  return KNOCKOUT_CEILING_STAGES.reduce((sum, stage) => {
    const predictedCount = picks.advancement?.[stage.key]?.length ?? 0;
    const actualCount = results?.[stage.key]?.length ?? 0;
    const stageScore = score.knockout?.find((item) => item.stageKey === stage.key);
    const maxPoints = predictedCount * rules[stage.key];
    const settled = predictedCount > 0 && actualCount >= predictedCount;
    return sum + stageRemaining(maxPoints, stageScore?.points ?? 0, settled);
  }, 0);
}

function finalsRemaining(score, results, rules) {
  return FINAL_CEILING_STAGES.reduce((sum, stage) => {
    const finalScore = score.finals?.find((item) => item.label === stage.label);
    const settled = Boolean(results?.finals?.[stage.key]);
    return sum + stageRemaining(rules[stage.key], finalScore?.points ?? 0, settled);
  }, 0);
}

function bonusRemaining(picks, score, rules) {
  return (picks.bonus ?? []).reduce((sum, item) => {
    const bonusScore = score.bonus?.find((scored) => scored.id === item.id);
    return sum + stageRemaining(rules.bonus, bonusScore?.points ?? 0, false);
  }, 0);
}

function remainingBreakdown(picks, score, results) {
  const rules = picks.scoringRules;
  const group = Object.entries(picks.groups ?? {}).reduce((sum, [groupId, groupPick]) => {
    const groupScore = score.groups?.find((item) => item.groupId === groupId);
    return sum + groupRemaining(groupPick, groupScore, results?.groups?.[groupId], rules);
  }, 0);
  const knockout = knockoutRemaining(picks, score, results, rules);
  const finals = finalsRemaining(score, results, rules);
  const bonus = bonusRemaining(picks, score, rules);

  return {
    group,
    knockout,
    finals,
    bonus,
    total: group + knockout + finals + bonus,
  };
}

function rankByValue(rows, valueKey) {
  let lastValue = null;
  let lastRank = 0;
  return rows
    .slice()
    .sort((a, b) => {
      if (b[valueKey] !== a[valueKey]) return b[valueKey] - a[valueKey];
      return a.name.localeCompare(b.name);
    })
    .map((row, index) => {
      const rank = row[valueKey] === lastValue ? lastRank : index + 1;
      lastValue = row[valueKey];
      lastRank = rank;
      return [row.id, rank];
    });
}

export function buildPoolAnalytics(entriesConfig, picksByPath, results, rows) {
  const leaderboardRows = rows ?? buildLeaderboardRows(entriesConfig, picksByPath, results);
  const payoutPlaces = Math.max(1, entriesConfig.payouts?.length ?? 4);
  const leaderTotal = leaderboardRows[0]?.score.total ?? 0;
  const payoutCutoff =
    leaderboardRows[Math.min(payoutPlaces, leaderboardRows.length) - 1]?.score.total ?? 0;

  const analyticsRows = leaderboardRows.map((row) => {
    const picks = picksByPath.get(row.picksPath);
    const remaining = picks ? remainingBreakdown(picks, row.score, results) : { total: 0 };
    const maxPossible = row.score.total + remaining.total;

    return {
      id: row.id,
      name: row.name,
      rank: row.rank,
      currentTotal: row.score.total,
      currentGapToLeader: Math.max(0, leaderTotal - row.score.total),
      remaining,
      maxPossible,
      canWin: maxPossible >= leaderTotal,
      canReachPayout: maxPossible >= payoutCutoff,
      payoutPlaces,
    };
  });

  const ceilingRanks = new Map(rankByValue(analyticsRows, "maxPossible"));
  const maxChaserScore = Math.max(
    ...analyticsRows.filter((row) => row.rank !== 1).map((row) => row.maxPossible),
    0,
  );
  const leaders = analyticsRows.filter((row) => row.rank === 1);
  const leaderNames = leaders.map((row) => row.name);
  const topCeiling = analyticsRows
    .slice()
    .sort((a, b) => {
      if (b.maxPossible !== a.maxPossible) return b.maxPossible - a.maxPossible;
      return a.name.localeCompare(b.name);
    })[0];

  return {
    payoutPlaces,
    leaderTotal,
    payoutCutoff,
    leaderNames,
    topCeiling,
    leaderClinched: leaders.some((leader) => leader.currentTotal > maxChaserScore),
    aliveCount: analyticsRows.filter((row) => row.canWin).length,
    payoutAliveCount: analyticsRows.filter((row) => row.canReachPayout).length,
    rows: analyticsRows.map((row) => ({
      ...row,
      ceilingRank: ceilingRanks.get(row.id) ?? row.rank,
    })),
  };
}
