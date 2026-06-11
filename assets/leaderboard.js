import { scorePool } from "./scoring.js";

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
