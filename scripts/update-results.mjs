import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

export const FIFA_TEAM_STATISTICS_URL =
  "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/statistics/team-statistics";
export const FIFA_STANDINGS_URL =
  "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/standings";
export const FIFA_GROUP_TIEBREAKERS_URL =
  "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/groups-how-teams-qualify-tie-breakers";
export const FIFA_SEASON_ID = "285023";
export const FIFA_CALENDAR_URL = `https://api.fifa.com/api/v3/calendar/matches?language=en&count=200&idSeason=${FIFA_SEASON_ID}`;
export const FIFA_TIMELINE_URL_TEMPLATE = "https://api.fifa.com/api/v3/timelines/{idMatch}?language=en";
export const FIFA_FDH_TEAM_STATS_URL_TEMPLATE = `https://fdh-api.fifa.com/v1/stats/season/${FIFA_SEASON_ID}/team/{idTeam}.json`;
export const FIFA_MEN_RANKING_URL = "https://inside.fifa.com/fifa-world-ranking/men";
export const FIFA_MEN_RANKING_API_URL_TEMPLATE =
  "https://inside.fifa.com/api/ranking-overview?locale=en&dateId={dateId}";

export const GROUP_IDS = "ABCDEFGHIJKL".split("");
export const STAGE_KEYS = [
  "roundOf16",
  "quarterFinalists",
  "semifinalists",
  "thirdPlaceMatch",
  "finalists",
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, "..");
const FIELD_LENGTH_METERS = 105;
const FIELD_WIDTH_METERS = 68;
const PASS_COMPLETION_PERCENT_DECIMALS = 1;

export function normalizeKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function localizedDescription(value) {
  return (
    asArray(value).find((item) => item.Locale === "en-GB")?.Description ??
    asArray(value).find((item) => item.Locale === "en")?.Description ??
    asArray(value)[0]?.Description ??
    ""
  );
}

function numberValue(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readJson(relativePath, fallback = null) {
  try {
    const text = await fs.readFile(resolve(ROOT_DIR, relativePath), "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (fallback !== null && error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(relativePath, value) {
  await fs.writeFile(resolve(ROOT_DIR, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "world-cup-2026-pool-updater",
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} (${url})`);
  }
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/json",
      "user-agent": "world-cup-2026-pool-updater",
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} (${url})`);
  }
  return response.text();
}

export function buildTeamIndexes(picks) {
  const teamToGroup = new Map();
  const knownTeams = new Map();
  const groupTeams = {};

  for (const [groupId, group] of Object.entries(picks.groups ?? {})) {
    groupTeams[groupId] = (group.teams ?? []).map((team) => team.name);
    for (const team of group.teams ?? []) {
      const key = normalizeKey(team.name);
      teamToGroup.set(key, groupId);
      knownTeams.set(key, team.name);
    }
  }

  return {
    groupTeams,
    knownTeams,
    teamToGroup,
  };
}

export function createTeamResolver(picks, aliases = {}) {
  const { knownTeams } = buildTeamIndexes(picks);
  const lookup = new Map(knownTeams);
  const aliasMap = aliases.aliases ?? aliases;

  for (const [alias, canonical] of Object.entries(aliasMap ?? {})) {
    lookup.set(normalizeKey(alias), canonical);
  }

  return (value) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    return lookup.get(normalizeKey(raw)) ?? raw;
  };
}

function scoreValue(match, side) {
  return numberValue(match?.[`${side}TeamScore`] ?? match?.[side]?.Score);
}

function fifaMatchState(match) {
  const status = numberValue(match?.MatchStatus);
  const hasScore = scoreValue(match, "Home") !== null && scoreValue(match, "Away") !== null;
  if (status === 0 || (numberValue(match?.OfficialityStatus) === 1 && hasScore)) return "post";
  if ([3, 5].includes(status)) return "in";
  return "pre";
}

function fifaMatchDetail(match, completed) {
  const statusText = localizedDescription(match?.MatchStatusDescription);
  if (statusText) return statusText;
  if (!completed) return "Scheduled";
  if (numberValue(match?.ResultType) === 2) return "FT-Pens";
  return "FT";
}

function winnerFromFifaMatch(match, homeTeam, awayTeam, homeScore, awayScore) {
  const winnerId = String(match?.Winner ?? "");
  const homeId = fifaTeamId(match?.Home);
  const awayId = fifaTeamId(match?.Away);

  if (winnerId && winnerId === homeId) return homeTeam;
  if (winnerId && winnerId === awayId) return awayTeam;
  if (homeScore !== null && awayScore !== null && homeScore !== awayScore) {
    return homeScore > awayScore ? homeTeam : awayTeam;
  }
  return "";
}

export function parseFifaMatch(match, resolveTeam = (value) => value) {
  const homeTeam = resolveTeam(fifaTeamName(match?.Home)) || match?.PlaceHolderA || "";
  const awayTeam = resolveTeam(fifaTeamName(match?.Away)) || match?.PlaceHolderB || "";
  const homeScore = scoreValue(match, "Home");
  const awayScore = scoreValue(match, "Away");
  const state = fifaMatchState(match);
  const completed = state === "post";
  const winner = completed ? winnerFromFifaMatch(match, homeTeam, awayTeam, homeScore, awayScore) : "";
  const loser = winner && winner === homeTeam ? awayTeam : winner ? homeTeam : "";
  const stage = localizedDescription(match?.StageName);
  const group = localizedDescription(match?.GroupName);

  return {
    id: String(match?.IdMatch ?? ""),
    name: [stage, group].filter(Boolean).join(" - "),
    shortName: `${awayTeam} at ${homeTeam}`,
    date: match?.Date ?? match?.MatchDate ?? "",
    state,
    completed,
    detail: fifaMatchDetail(match, completed),
    stage,
    group,
    matchNumber: numberValue(match?.MatchNumber),
    resultType: numberValue(match?.ResultType),
    officialityStatus: numberValue(match?.OfficialityStatus),
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    homePenaltyScore: numberValue(match?.HomeTeamPenaltyScore),
    awayPenaltyScore: numberValue(match?.AwayTeamPenaltyScore),
    winner,
    loser,
    source: "fifa",
  };
}

function isCountedMatch(match) {
  return (
    (match.state === "in" || match.state === "post" || match.completed) &&
    match.homeScore !== null &&
    match.awayScore !== null
  );
}

function samePair(match, override) {
  const matchTeams = [normalizeKey(match.homeTeam), normalizeKey(match.awayTeam)].sort().join("|");
  const overrideTeams = [normalizeKey(override.homeTeam), normalizeKey(override.awayTeam)].sort().join("|");
  return matchTeams === overrideTeams;
}

export function applyMatchOverrides(matches, manualOverrides = {}, resolveTeam = (value) => value) {
  const output = matches.map((match) => ({ ...match }));

  for (const override of asArray(manualOverrides.matches)) {
    const homeTeam = resolveTeam(override.homeTeam);
    const awayTeam = resolveTeam(override.awayTeam);
    const index = output.findIndex(
      (match) => (override.id && match.id === override.id) || samePair(match, { homeTeam, awayTeam }),
    );
    const patch = {
      ...(homeTeam ? { homeTeam } : {}),
      ...(awayTeam ? { awayTeam } : {}),
      ...(override.homeScore !== undefined ? { homeScore: numberValue(override.homeScore) } : {}),
      ...(override.awayScore !== undefined ? { awayScore: numberValue(override.awayScore) } : {}),
      ...(override.state ? { state: override.state } : {}),
      ...(override.completed !== undefined ? { completed: Boolean(override.completed) } : {}),
    };

    if (index >= 0) {
      output[index] = {
        ...output[index],
        ...patch,
      };
    } else {
      throw new Error(
        `Manual match override does not match an official FIFA match: ${override.id ?? `${homeTeam} vs ${awayTeam}`}`,
      );
    }
  }

  return output.map((match) => {
    if (!match.completed || match.homeScore === null || match.awayScore === null) return match;
    if (match.winner) return match;
    if (match.homeScore === match.awayScore) return match;
    const winner = match.homeScore > match.awayScore ? match.homeTeam : match.awayTeam;
    return {
      ...match,
      winner,
      loser: winner === match.homeTeam ? match.awayTeam : match.homeTeam,
    };
  });
}

function emptyStats(team) {
  return {
    team,
    played: 0,
    points: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
  };
}

function numericRecordValue(record, key) {
  const value = record?.[key];
  return Number.isFinite(value) ? value : null;
}

function decorateStats(stats, options = {}) {
  const { fairPlayPointsByTeam = {}, fifaRankByTeam = {} } = options;
  return stats.map((item) => {
    const fairPlayPoints = numericRecordValue(fairPlayPointsByTeam, item.team);
    const fifaRank = numericRecordValue(fifaRankByTeam, item.team);
    return {
      ...item,
      ...(fairPlayPoints !== null ? { fairPlayPoints } : {}),
      ...(fifaRank !== null ? { fifaRank } : {}),
    };
  });
}

function applyScore(home, away, homeScore, awayScore) {
  home.played += 1;
  away.played += 1;
  home.goalsFor += homeScore;
  home.goalsAgainst += awayScore;
  away.goalsFor += awayScore;
  away.goalsAgainst += homeScore;
  home.goalDifference = home.goalsFor - home.goalsAgainst;
  away.goalDifference = away.goalsFor - away.goalsAgainst;

  if (homeScore > awayScore) {
    home.points += 3;
  } else if (awayScore > homeScore) {
    away.points += 3;
  } else {
    home.points += 1;
    away.points += 1;
  }
}

function buildMiniTable(teams, matches) {
  const teamSet = new Set(teams.map((team) => normalizeKey(team)));
  const stats = new Map(teams.map((team) => [team, emptyStats(team)]));

  for (const match of matches) {
    if (!isCountedMatch(match)) continue;
    if (!teamSet.has(normalizeKey(match.homeTeam)) || !teamSet.has(normalizeKey(match.awayTeam))) {
      continue;
    }

    const home = stats.get(match.homeTeam) ?? emptyStats(match.homeTeam);
    const away = stats.get(match.awayTeam) ?? emptyStats(match.awayTeam);
    applyScore(home, away, match.homeScore, match.awayScore);
    stats.set(match.homeTeam, home);
    stats.set(match.awayTeam, away);
  }

  return stats;
}

function valueBuckets(items, values, direction = "desc") {
  const buckets = new Map();

  for (const item of items) {
    const value = values.get(item.team);
    const key = Number.isFinite(value) ? String(value) : "missing";
    if (!buckets.has(key)) buckets.set(key, { value, items: [] });
    buckets.get(key).items.push(item);
  }

  return [...buckets.values()].sort((a, b) => {
    const aMissing = !Number.isFinite(a.value);
    const bMissing = !Number.isFinite(b.value);
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;
    return direction === "asc" ? a.value - b.value : b.value - a.value;
  });
}

function sortStatsWithCriteria(items, criteria, index = 0) {
  if (items.length <= 1) return items;
  if (index >= criteria.length) {
    return items.slice().sort((a, b) => a.team.localeCompare(b.team));
  }

  const criterion = criteria[index];
  const values = criterion.values(items);
  const buckets = valueBuckets(items, values, criterion.direction);

  if (buckets.length === 1) {
    return sortStatsWithCriteria(items, criteria, index + 1);
  }

  return buckets.flatMap((bucket) => sortStatsWithCriteria(bucket.items, criteria, index + 1));
}

function directValues(items, key) {
  return new Map(items.map((item) => [item.team, Number(item[key])]));
}

function headToHeadValues(matches, key) {
  return (items) => {
    const miniTable = buildMiniTable(
      items.map((item) => item.team),
      matches,
    );
    return new Map(items.map((item) => [item.team, Number(miniTable.get(item.team)?.[key])]));
  };
}

export function sortGroupStats(stats, matches = [], options = {}) {
  const criteria = [
    { direction: "desc", values: (items) => directValues(items, "points") },
    { direction: "desc", values: headToHeadValues(matches, "points") },
    { direction: "desc", values: headToHeadValues(matches, "goalDifference") },
    { direction: "desc", values: headToHeadValues(matches, "goalsFor") },
    { direction: "desc", values: (items) => directValues(items, "goalDifference") },
    { direction: "desc", values: (items) => directValues(items, "goalsFor") },
    { direction: "asc", values: (items) => directValues(items, "fairPlayPoints") },
    { direction: "asc", values: (items) => directValues(items, "fifaRank") },
  ];

  return sortStatsWithCriteria(decorateStats(stats, options), criteria);
}

function compareThirdPlaceStats(a, b) {
  return (
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    Number(a.fairPlayPoints ?? 0) - Number(b.fairPlayPoints ?? 0) ||
    Number(a.fifaRank ?? Number.POSITIVE_INFINITY) -
      Number(b.fifaRank ?? Number.POSITIVE_INFINITY) ||
    a.groupId.localeCompare(b.groupId)
  );
}

export function buildGroupResults(matches, picks, options = {}) {
  const { groupTeams, teamToGroup } = buildTeamIndexes(picks);
  const groupState = Object.fromEntries(
    GROUP_IDS.map((groupId) => [
      groupId,
      {
        totalMatches: 0,
        countedMatches: 0,
        completedMatches: 0,
        liveMatches: 0,
        matches: [],
        stats: new Map((groupTeams[groupId] ?? []).map((team) => [team, emptyStats(team)])),
      },
    ]),
  );

  for (const match of matches) {
    const homeGroup = teamToGroup.get(normalizeKey(match.homeTeam));
    const awayGroup = teamToGroup.get(normalizeKey(match.awayTeam));
    if (!homeGroup || homeGroup !== awayGroup) continue;

    const group = groupState[homeGroup];
    group.totalMatches += 1;
    group.matches.push(match);

    if (!isCountedMatch(match)) continue;
    group.countedMatches += 1;
    if (match.completed) {
      group.completedMatches += 1;
    } else {
      group.liveMatches += 1;
    }

    const home = group.stats.get(match.homeTeam) ?? emptyStats(match.homeTeam);
    const away = group.stats.get(match.awayTeam) ?? emptyStats(match.awayTeam);
    applyScore(home, away, match.homeScore, match.awayScore);
    group.stats.set(match.homeTeam, home);
    group.stats.set(match.awayTeam, away);
  }

  return Object.fromEntries(
    GROUP_IDS.map((groupId) => {
      const group = groupState[groupId];
      const sortedStats = sortGroupStats([...group.stats.values()], group.matches, options);
      const status =
        group.countedMatches === 0
          ? "not-started"
          : group.completedMatches === group.totalMatches
            ? "final"
            : group.liveMatches > 0
              ? "live"
              : "active";

      return [
        groupId,
        {
          currentOrder: group.countedMatches > 0 ? sortedStats.map((item) => item.team) : [],
          status,
          stats: sortedStats,
        },
      ];
    }),
  );
}

export function selectTopThirdGroups(groups) {
  return Object.entries(groups)
    .map(([groupId, group]) => {
      const thirdTeam = group.currentOrder?.[2];
      const thirdStats = group.stats?.find((item) => item.team === thirdTeam);
      return thirdTeam && thirdStats ? { groupId, ...thirdStats } : null;
    })
    .filter(Boolean)
    .sort(compareThirdPlaceStats)
    .slice(0, 8)
    .map((item) => item.groupId);
}

export function isGroupStageFinal(groups) {
  return GROUP_IDS.every((groupId) => groups[groupId]?.status === "final");
}

function matchIsGroupStage(match, teamToGroup) {
  const homeGroup = teamToGroup.get(normalizeKey(match.homeTeam));
  const awayGroup = teamToGroup.get(normalizeKey(match.awayTeam));
  return Boolean(homeGroup && homeGroup === awayGroup);
}

function knownTeamName(team, knownTeams) {
  return knownTeams.get(normalizeKey(team)) ?? "";
}

function completedKnownWinner(match, knownTeams) {
  if (!match.completed) return "";
  return knownTeamName(match.winner, knownTeams);
}

function completedKnownLoser(match, knownTeams) {
  if (!match.completed) return "";
  return knownTeamName(match.loser, knownTeams);
}

export function buildKnockoutResults(matches, picks) {
  const { knownTeams, teamToGroup } = buildTeamIndexes(picks);
  const knockoutMatches = matches
    .filter((match) => !matchIsGroupStage(match, teamToGroup))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const roundOf32 = knockoutMatches.slice(0, 16);
  const roundOf16 = knockoutMatches.slice(16, 24);
  const quarterFinals = knockoutMatches.slice(24, 28);
  const semiFinals = knockoutMatches.slice(28, 30);
  const thirdPlaceMatch =
    knockoutMatches.find((match) => /semifinal/i.test(match.name) && /loser/i.test(match.name)) ??
    knockoutMatches[30];
  const final =
    knockoutMatches.find((match) => /semifinal/i.test(match.name) && /winner/i.test(match.name)) ??
    knockoutMatches[31];

  return {
    roundOf16: roundOf32.map((match) => completedKnownWinner(match, knownTeams)).filter(Boolean),
    quarterFinalists: roundOf16.map((match) => completedKnownWinner(match, knownTeams)).filter(Boolean),
    semifinalists: quarterFinals.map((match) => completedKnownWinner(match, knownTeams)).filter(Boolean),
    thirdPlaceMatch: semiFinals.map((match) => completedKnownLoser(match, knownTeams)).filter(Boolean),
    finalists: semiFinals.map((match) => completedKnownWinner(match, knownTeams)).filter(Boolean),
    finals: {
      champion: completedKnownWinner(final ?? {}, knownTeams),
      runnerUp: completedKnownLoser(final ?? {}, knownTeams),
      thirdPlace: completedKnownWinner(thirdPlaceMatch ?? {}, knownTeams),
    },
  };
}

function allTeamStats(groups) {
  return Object.values(groups)
    .flatMap((group) => group.stats ?? [])
    .filter((item) => item.played > 0);
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

export function computeBonusResults(groups, picks) {
  return buildBonusResults(groups, picks);
}

function buildBonusResults(groups, picks, fifaBonusResults = {}) {
  const base = Object.fromEntries((picks.bonus ?? []).map((item) => [item.id, []]));
  const stats = allTeamStats(groups);
  return {
    ...base,
    mostGoalsScored: leadersBy(stats, "goalsFor"),
    mostGoalsConceded: leadersBy(stats, "goalsAgainst"),
    ...fifaBonusResults,
  };
}

function fifaTeamName(team) {
  return team?.ShortClubName ?? localizedDescription(team?.TeamName) ?? team?.Abbreviation ?? "";
}

function fifaTeamId(team) {
  const id = team?.IdTeam ?? team?.idTeam ?? team?.Id ?? team?.id;
  return id === undefined || id === null ? "" : String(id);
}

const FIFA_CARD_WEIGHTS = new Map([
  [1, 1], // Yellow
  [2, 3], // Indirect red / second yellow
  [3, 4], // Direct red
]);

function bookingParticipantKey(booking, index) {
  if (booking?.IdPlayer) return `player:${booking.IdPlayer}`;
  if (booking?.IdCoach) return `coach:${booking.IdCoach}`;
  if (booking?.IdStaff) return `staff:${booking.IdStaff}`;
  return `booking:${index}`;
}

function participantFairPlayPoints(bookings) {
  const cards = asArray(bookings).map((booking) => numberValue(booking?.Card));
  const yellowCount = cards.filter((card) => card === 1).length;

  if (cards.includes(3) && yellowCount > 0) return 5;
  if (cards.includes(3)) return 4;
  if (cards.includes(2) || yellowCount >= 2) return 3;
  return cards.reduce((sum, card) => sum + (FIFA_CARD_WEIGHTS.get(card) ?? 0), 0);
}

function teamFairPlayPoints(bookings) {
  const participants = new Map();

  asArray(bookings).forEach((booking, index) => {
    const key = bookingParticipantKey(booking, index);
    participants.set(key, [...(participants.get(key) ?? []), booking]);
  });

  return [...participants.values()].reduce(
    (sum, participantBookings) => sum + participantFairPlayPoints(participantBookings),
    0,
  );
}

export function computeMostCardsFromFifaLiveMatches(matches, resolveTeam = (value) => value) {
  const cardPoints = computeCardPointsFromFifaLiveMatches(matches, resolveTeam);
  const max = Math.max(...Object.values(cardPoints), 0);
  if (max <= 0) return [];
  return Object.entries(cardPoints)
    .filter(([, total]) => total === max)
    .map(([team]) => team)
    .sort((a, b) => a.localeCompare(b));
}

export function computeCardPointsFromFifaLiveMatches(matches, resolveTeam = (value) => value) {
  const totals = new Map();

  for (const match of asArray(matches)) {
    for (const side of ["HomeTeam", "AwayTeam"]) {
      const team = match?.[side];
      const name = resolveTeam(fifaTeamName(team));
      if (!name) continue;
      const cardTotal = teamFairPlayPoints(team?.Bookings);
      totals.set(name, (totals.get(name) ?? 0) + cardTotal);
    }
  }

  return Object.fromEntries(
    [...totals.entries()]
      .filter(([, total]) => total > 0)
      .sort(([teamA], [teamB]) => teamA.localeCompare(teamB)),
  );
}

export function computeCardPointsFromFifaTeamStats(teamStats) {
  const totals = {};

  for (const item of asArray(teamStats)) {
    const team = item?.team;
    const stats = statEntriesToMap(item?.stats);
    const yellowCards = Number(stats.get("YellowCards") ?? 0);
    const directRedCards = Number(stats.get("DirectRedCards") ?? stats.get("RedCards") ?? 0);
    const indirectRedCards = Number(stats.get("IndirectRedCards") ?? 0);

    if (!team) continue;
    const total =
      (Number.isFinite(yellowCards) ? yellowCards : 0) +
      (Number.isFinite(directRedCards) ? directRedCards * 4 : 0) +
      (Number.isFinite(indirectRedCards) ? indirectRedCards * 3 : 0);
    if (total > 0) totals[team] = total;
  }

  return Object.fromEntries(Object.entries(totals).sort(([teamA], [teamB]) => teamA.localeCompare(teamB)));
}

function leadersFromFifaTeamStats(teamStats, statKey) {
  const rows = asArray(teamStats)
    .map((item) => {
      const stats = statEntriesToMap(item?.stats);
      return {
        team: item?.team,
        value: Number(stats.get(statKey) ?? 0),
      };
    })
    .filter((item) => item.team && Number.isFinite(item.value) && item.value > 0);
  const max = Math.max(...rows.map((item) => item.value), 0);
  if (max <= 0) return [];
  return rows
    .filter((item) => item.value === max)
    .map((item) => item.team)
    .sort((a, b) => a.localeCompare(b));
}

export function computeGoalBonusResultsFromFifaTeamStats(teamStats) {
  return {
    mostGoalsScored: leadersFromFifaTeamStats(teamStats, "Goals"),
    mostGoalsConceded: leadersFromFifaTeamStats(teamStats, "GoalsConceded"),
  };
}

function fifaMatchTeams(match) {
  return [match?.HomeTeam ?? match?.Home, match?.AwayTeam ?? match?.Away].filter(Boolean);
}

function buildFifaTeamLookup(matches, resolveTeam = (value) => value) {
  const teams = new Map();

  for (const match of asArray(matches)) {
    for (const team of fifaMatchTeams(match)) {
      const id = fifaTeamId(team);
      const name = resolveTeam(fifaTeamName(team));
      if (id && name) teams.set(id, name);
    }
  }

  return teams;
}

function startedFifaTeamIds(matches) {
  return [
    ...new Set(
      asArray(matches)
        .flatMap(fifaMatchTeams)
        .map(fifaTeamId)
        .filter(Boolean),
    ),
  ];
}

function timelineEvents(timeline) {
  return asArray(timeline?.Event ?? timeline?.Events ?? timeline?.events);
}

function isGoalTimelineEvent(event) {
  return numberValue(event?.Type) === 0 && numberValue(event?.Period) !== 9;
}

function coordinateValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function goalDistanceMeters(event) {
  const x = coordinateValue(event?.PositionX);
  const y = coordinateValue(event?.PositionY);
  if (x === null || y === null) return null;

  const distanceToNearestGoalLine = (Math.min(x, 100 - x) / 100) * FIELD_LENGTH_METERS;
  const distanceFromCenter = (Math.abs(y - 50) / 100) * FIELD_WIDTH_METERS;
  return Math.hypot(distanceToNearestGoalLine, distanceFromCenter);
}

export function computeFarthestGoalFromFifaTimelines(timelines, teamById = new Map()) {
  const leaders = [];
  let maxDistance = 0;

  for (const timeline of asArray(timelines)) {
    for (const event of timelineEvents(timeline)) {
      if (!isGoalTimelineEvent(event)) continue;
      const team = teamById.get(String(event?.IdTeam ?? ""));
      const distance = goalDistanceMeters(event);
      if (!team || distance === null) continue;

      if (distance > maxDistance + Number.EPSILON) {
        leaders.length = 0;
        leaders.push(team);
        maxDistance = distance;
      } else if (Math.abs(distance - maxDistance) <= Number.EPSILON) {
        leaders.push(team);
      }
    }
  }

  return [...new Set(leaders)].sort((a, b) => a.localeCompare(b));
}

function statEntriesToMap(stats) {
  const entries = Array.isArray(stats?.Stat) ? stats.Stat : Array.isArray(stats) ? stats : [];
  return new Map(
    entries
      .map((entry) => {
        if (Array.isArray(entry)) return [entry[0], entry[1]];
        return [entry?.Name ?? entry?.name ?? entry?.Key ?? entry?.key, entry?.Value ?? entry?.value];
      })
      .filter(([key]) => key),
  );
}

function roundedPassCompletionPercent(completed, passes) {
  const scale = 10 ** PASS_COMPLETION_PERCENT_DECIMALS;
  return Math.round((completed / passes) * 100 * scale) / scale;
}

export function computeBestPassCompletionFromFifaTeamStats(teamStats) {
  const leaders = [];
  let bestPercent = 0;

  for (const item of asArray(teamStats)) {
    const team = item?.team;
    const stats = statEntriesToMap(item?.stats);
    const passes = Number(stats.get("Passes"));
    const completed = Number(stats.get("PassesCompleted"));
    if (!team || !Number.isFinite(passes) || !Number.isFinite(completed) || passes <= 0) continue;

    const percent = roundedPassCompletionPercent(completed, passes);
    if (percent > bestPercent) {
      leaders.length = 0;
      leaders.push(team);
      bestPercent = percent;
    } else if (percent === bestPercent) {
      leaders.push(team);
    }
  }

  return [...new Set(leaders)].sort((a, b) => a.localeCompare(b));
}

function fifaMatchHasStarted(match) {
  return (
    [0, 3, 5].includes(numberValue(match?.MatchStatus)) ||
    (numberValue(match?.HomeTeamScore) !== null && numberValue(match?.AwayTeamScore) !== null)
  );
}

async function fetchFifaLiveMatch(match) {
  const url = `https://api.fifa.com/api/v3/live/football/${match.IdCompetition}/${match.IdSeason}/${match.IdStage}/${match.IdMatch}?language=en`;
  return fetchJson(url);
}

async function fetchFifaTimeline(match) {
  return fetchJson(FIFA_TIMELINE_URL_TEMPLATE.replace("{idMatch}", match.IdMatch));
}

async function fetchFifaTeamStats(idTeam, teamById) {
  const stats = await fetchJson(FIFA_FDH_TEAM_STATS_URL_TEMPLATE.replace("{idTeam}", idTeam));
  return {
    team: teamById.get(String(idTeam)) ?? "",
    stats,
  };
}

export async function fetchFifaBonusResults(resolveTeam = (value) => value, calendarMatches = null) {
  const sourceMatches = calendarMatches ?? (await fetchJson(FIFA_CALENDAR_URL)).Results;
  const matches = asArray(sourceMatches).filter(fifaMatchHasStarted);
  const teamById = buildFifaTeamLookup(matches, resolveTeam);
  const [liveMatches, timelines, teamStats] = await Promise.all([
    Promise.all(matches.map(fetchFifaLiveMatch)),
    Promise.all(matches.map(fetchFifaTimeline)),
    Promise.all(startedFifaTeamIds(matches).map((idTeam) => fetchFifaTeamStats(idTeam, teamById))),
  ]);

  return {
    ...computeGoalBonusResultsFromFifaTeamStats(teamStats),
    mostCards: computeCardPointsFromFifaTeamStats(teamStats),
    farthestGoal: computeFarthestGoalFromFifaTimelines(timelines, teamById),
    bestPassCompletion: computeBestPassCompletionFromFifaTeamStats(teamStats),
  };
}

function rankingDateIdsFromPage(html) {
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
  const source = nextDataMatch?.[1] ?? html;
  return [
    ...new Set(
      [...source.matchAll(/(?:id\d+|FRS_Male_Football_\d+)/g)].map((match) => match[0]),
    ),
  ];
}

function fifaRankingApiUrl(dateId) {
  return FIFA_MEN_RANKING_API_URL_TEMPLATE.replace("{dateId}", dateId);
}

export async function fetchFifaRankings(resolveTeam = (value) => value) {
  const html = await fetchText(FIFA_MEN_RANKING_URL);
  const dateIds = rankingDateIdsFromPage(html);

  for (const dateId of dateIds) {
    const apiUrl = fifaRankingApiUrl(dateId);
    const data = await fetchJson(apiUrl);
    const rankings = asArray(data.rankings);
    if (!rankings.length) continue;

    return {
      dateId,
      apiUrl,
      sourceUrl: FIFA_MEN_RANKING_URL,
      lastUpdateDate: rankings[0]?.lastUpdateDate ?? "",
      rankingsByTeam: Object.fromEntries(
        rankings
          .map((item) => {
            const team = resolveTeam(item?.rankingItem?.name);
            const rank = numberValue(item?.rankingItem?.rank);
            return team && rank !== null ? [team, rank] : null;
          })
          .filter(Boolean),
      ),
    };
  }

  return {
    sourceUrl: FIFA_MEN_RANKING_URL,
    rankingsByTeam: {},
  };
}

function buildBonusSources() {
  return {
    mostGoalsScored: {
      source: "FIFA team statistics: goals",
      sourceUrl: FIFA_TEAM_STATISTICS_URL,
      apiUrl: FIFA_FDH_TEAM_STATS_URL_TEMPLATE,
      update: "Automatic with each results update",
    },
    mostGoalsConceded: {
      source: "FIFA team statistics: goals conceded",
      sourceUrl: FIFA_TEAM_STATISTICS_URL,
      apiUrl: FIFA_FDH_TEAM_STATS_URL_TEMPLATE,
      update: "Automatic with each results update",
    },
    farthestGoal: {
      source: "FIFA match timelines: goal location coordinates",
      sourceUrl: FIFA_TEAM_STATISTICS_URL,
      apiUrl: FIFA_TIMELINE_URL_TEMPLATE,
      update: "Automatic with each results update",
    },
    bestPassCompletion: {
      source: "FIFA team statistics: passes completed divided by passes attempted",
      sourceUrl: FIFA_TEAM_STATISTICS_URL,
      apiUrl: FIFA_FDH_TEAM_STATS_URL_TEMPLATE,
      update: "Automatic with each results update",
    },
    mostCards: {
      source:
        "FIFA team statistics judged by Fair Play Points: yellow 1, indirect red 3, direct red 4, yellow plus direct red 5",
      sourceUrl: FIFA_TEAM_STATISTICS_URL,
      apiUrl: FIFA_FDH_TEAM_STATS_URL_TEMPLATE,
      update: "Automatic with each results update",
    },
  };
}

function stageOverride(manualOverrides, key) {
  return manualOverrides.knockout?.[key] ?? manualOverrides[key];
}

export function applyResultsOverrides(results, manualOverrides = {}) {
  const output = structuredClone(results);

  if (manualOverrides.meta?.status) output.meta.status = manualOverrides.meta.status;
  if (manualOverrides.meta?.sourceNote) output.meta.sourceNote = manualOverrides.meta.sourceNote;

  for (const [groupId, override] of Object.entries(manualOverrides.groups ?? {})) {
    if (!output.groups[groupId]) continue;
    if (Array.isArray(override.currentOrder) && override.currentOrder.length > 0) {
      output.groups[groupId].currentOrder = override.currentOrder;
    }
    if (override.status) output.groups[groupId].status = override.status;
  }

  if (Array.isArray(manualOverrides.topThirdGroups)) {
    output.topThirdGroups = manualOverrides.topThirdGroups;
  }

  for (const key of STAGE_KEYS) {
    const override = stageOverride(manualOverrides, key);
    if (Array.isArray(override)) output[key] = override;
  }

  for (const key of ["champion", "runnerUp", "thirdPlace"]) {
    if (manualOverrides.finals?.[key]) output.finals[key] = manualOverrides.finals[key];
  }

  for (const [key, value] of Object.entries(manualOverrides.bonus ?? {})) {
    if (Array.isArray(value) && value.length > 0) output.bonus[key] = value;
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length > 0
    ) {
      output.bonus[key] = value;
    }
  }

  return output;
}

function hasManualOverrideValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") {
    return Object.values(value).some(hasManualOverrideValue);
  }
  return Boolean(value);
}

function manualOverrideCount(manualOverrides = {}) {
  return Object.entries(manualOverrides)
    .filter(([key]) => key !== "meta")
    .reduce((count, [, value]) => count + (hasManualOverrideValue(value) ? 1 : 0), 0);
}

function serializedMatch(match) {
  return {
    id: match.id,
    source: match.source,
    date: match.date,
    state: match.state,
    completed: match.completed,
    detail: match.detail,
    stage: match.stage,
    group: match.group,
    matchNumber: match.matchNumber,
    resultType: match.resultType,
    officialityStatus: match.officialityStatus,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    ...(match.homePenaltyScore !== null ? { homePenaltyScore: match.homePenaltyScore } : {}),
    ...(match.awayPenaltyScore !== null ? { awayPenaltyScore: match.awayPenaltyScore } : {}),
    winner: match.winner,
    loser: match.loser,
  };
}

export function buildResultsFromFifaMatches(fifaMatches, options) {
  const {
    picks,
    aliases = {},
    manualOverrides = {},
    fifaBonusResults = {},
    fifaRankingResults = {},
    now = new Date().toISOString(),
    sourceUrl = FIFA_CALENDAR_URL,
  } = options;
  const resolveTeam = createTeamResolver(picks, aliases);
  const parsedMatches = fifaMatches.map((match) => parseFifaMatch(match, resolveTeam));
  const matches = applyMatchOverrides(parsedMatches, manualOverrides, resolveTeam);
  const groups = buildGroupResults(matches, picks, {
    fairPlayPointsByTeam: fifaBonusResults.mostCards,
    fifaRankByTeam: fifaRankingResults.rankingsByTeam,
  });
  const knockout = buildKnockoutResults(matches, picks);
  const topThirdGroups = isGroupStageFinal(groups) ? selectTopThirdGroups(groups) : [];
  const countedMatches = matches.filter(isCountedMatch).length;
  const liveMatches = matches.filter((match) => match.state === "in").length;
  const statusParts = [
    "Auto-updated from FIFA",
    `${countedMatches} live/final match${countedMatches === 1 ? "" : "es"} counted`,
  ];
  if (liveMatches > 0) statusParts.push(`${liveMatches} in progress`);
  const overridesCount = manualOverrideCount(manualOverrides);

  const results = {
    meta: {
      lastUpdated: now,
      status: `${statusParts.join(": ")}.`,
      source: "fifa",
      sourceUrl,
      sources: {
        matches: {
          source: "FIFA calendar/matches API",
          sourceUrl: FIFA_STANDINGS_URL,
          apiUrl: sourceUrl,
        },
        tiebreakers: {
          source: "FIFA World Cup 2026 group tiebreakers",
          sourceUrl: FIFA_GROUP_TIEBREAKERS_URL,
        },
        rankings: {
          source: "FIFA/Coca-Cola Men's World Ranking",
          sourceUrl: fifaRankingResults.sourceUrl ?? FIFA_MEN_RANKING_URL,
          apiUrl: fifaRankingResults.apiUrl ?? "",
          dateId: fifaRankingResults.dateId ?? "",
          lastUpdateDate: fifaRankingResults.lastUpdateDate ?? "",
        },
      },
      bonusSources: buildBonusSources(),
      manualOverrideCount: overridesCount,
      manualOverrideSource: overridesCount > 0 ? "data/manual-overrides.json" : "",
      sourceNote:
        "All match results, fixtures, knockout winners, group standings, and third-place rankings are computed from FIFA official match data. FIFA team statistics, timelines, and rankings are used for bonus answers and unresolved tiebreakers. Manual overrides are explicit official-correction patches only.",
    },
    matches: matches
      .filter(isCountedMatch)
      .map(serializedMatch)
      .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    fixtures: matches
      .filter((match) => !match.completed)
      .map(serializedMatch)
      .sort((a, b) => String(a.date).localeCompare(String(b.date))),
    groups,
    topThirdGroups,
    roundOf16: knockout.roundOf16,
    quarterFinalists: knockout.quarterFinalists,
    semifinalists: knockout.semifinalists,
    thirdPlaceMatch: knockout.thirdPlaceMatch,
    finalists: knockout.finalists,
    finals: knockout.finals,
    bonus: buildBonusResults(groups, picks, fifaBonusResults),
  };

  return applyResultsOverrides(results, manualOverrides);
}

export async function updateResults() {
  const [picks, aliases, manualOverrides] = await Promise.all([
    readJson("data/picks.json"),
    readJson("data/team-aliases.json", { aliases: {} }),
    readJson("data/manual-overrides.json", {}),
  ]);
  const calendar = await fetchJson(FIFA_CALENDAR_URL);
  const resolveTeam = createTeamResolver(picks, aliases);
  const [fifaBonusResults, fifaRankingResults] = await Promise.all([
    fetchFifaBonusResults(resolveTeam, calendar.Results),
    fetchFifaRankings(resolveTeam),
  ]);
  const results = buildResultsFromFifaMatches(calendar.Results ?? [], {
    picks,
    aliases,
    manualOverrides,
    fifaBonusResults,
    fifaRankingResults,
    now: new Date().toISOString(),
  });
  await writeJson("data/results.json", results);
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  updateResults()
    .then((results) => {
      console.log(results.meta.status);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
