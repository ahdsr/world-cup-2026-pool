import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

export const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=200&dates=20260611-20260719";
export const FIFA_TEAM_STATISTICS_URL =
  "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/statistics/team-statistics";
export const FIFA_SEASON_ID = "285023";
export const FIFA_CALENDAR_URL = `https://api.fifa.com/api/v3/calendar/matches?language=en&count=200&idSeason=${FIFA_SEASON_ID}`;

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

function competitorName(competitor) {
  return (
    competitor?.team?.displayName ??
    competitor?.team?.shortDisplayName ??
    competitor?.team?.name ??
    competitor?.team?.abbreviation ??
    ""
  );
}

export function parseEspnEvent(event, resolveTeam = (value) => value) {
  const competition = event?.competitions?.[0] ?? {};
  const status = competition.status?.type ?? event?.status?.type ?? {};
  const competitors = competition.competitors ?? [];
  const parsedCompetitors = competitors.map((competitor) => ({
    team: resolveTeam(competitorName(competitor)),
    homeAway: competitor.homeAway ?? "",
    score: numberValue(competitor.score),
    winner: Boolean(competitor.winner),
  }));
  const home = parsedCompetitors.find((item) => item.homeAway === "home") ?? parsedCompetitors[0] ?? {};
  const away =
    parsedCompetitors.find((item) => item.homeAway === "away") ??
    parsedCompetitors.find((item) => item !== home) ??
    {};
  const state = status.state ?? "pre";
  const completed = Boolean(status.completed) || state === "post";
  const winnerCompetitor = parsedCompetitors.find((item) => item.winner);
  let winner = winnerCompetitor?.team ?? "";
  let loser = "";

  if (!winner && completed && home.score !== null && away.score !== null && home.score !== away.score) {
    winner = home.score > away.score ? home.team : away.team;
  }

  if (winner && completed) {
    loser = parsedCompetitors.find((item) => item.team && item.team !== winner)?.team ?? "";
  }

  return {
    id: event?.id ?? competition.id ?? "",
    name: event?.name ?? "",
    shortName: event?.shortName ?? "",
    date: event?.date ?? competition.date ?? "",
    state,
    completed,
    detail: status.detail ?? status.description ?? "",
    homeTeam: home.team ?? "",
    awayTeam: away.team ?? "",
    homeScore: home.score,
    awayScore: away.score,
    winner,
    loser,
    competitors: parsedCompetitors,
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
    } else if (homeTeam && awayTeam) {
      output.push({
        id: override.id ?? `manual-${homeTeam}-${awayTeam}`,
        name: `${awayTeam} at ${homeTeam}`,
        shortName: "Manual",
        date: override.date ?? "",
        detail: "Manual override",
        state: override.state ?? "post",
        completed: override.completed ?? true,
        homeTeam,
        awayTeam,
        homeScore: numberValue(override.homeScore),
        awayScore: numberValue(override.awayScore),
        winner: "",
        loser: "",
        competitors: [],
      });
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

function compareStats(a, b) {
  return (
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    a.team.localeCompare(b.team)
  );
}

export function buildGroupResults(matches, picks) {
  const { groupTeams, teamToGroup } = buildTeamIndexes(picks);
  const groupState = Object.fromEntries(
    GROUP_IDS.map((groupId) => [
      groupId,
      {
        totalMatches: 0,
        countedMatches: 0,
        completedMatches: 0,
        liveMatches: 0,
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
      const sortedStats = [...group.stats.values()].sort(compareStats);
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
    .sort((a, b) => compareStats(a, b) || a.groupId.localeCompare(b.groupId))
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
    ...fifaBonusResults,
    mostGoalsScored: leadersBy(stats, "goalsFor"),
    mostGoalsConceded: leadersBy(stats, "goalsAgainst"),
  };
}

function fifaTeamName(team) {
  return team?.ShortClubName ?? localizedDescription(team?.TeamName) ?? team?.Abbreviation ?? "";
}

function countableFifaCard(booking) {
  return [1, 2, 3].includes(numberValue(booking?.Card));
}

export function computeMostCardsFromFifaLiveMatches(matches, resolveTeam = (value) => value) {
  const totals = new Map();

  for (const match of asArray(matches)) {
    for (const side of ["HomeTeam", "AwayTeam"]) {
      const team = match?.[side];
      const name = resolveTeam(fifaTeamName(team));
      if (!name) continue;
      const cardCount = asArray(team?.Bookings).filter(countableFifaCard).length;
      totals.set(name, (totals.get(name) ?? 0) + cardCount);
    }
  }

  const max = Math.max(...totals.values(), 0);
  if (max <= 0) return [];
  return [...totals.entries()]
    .filter(([, total]) => total === max)
    .map(([team]) => team)
    .sort((a, b) => a.localeCompare(b));
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

export async function fetchFifaBonusResults(resolveTeam = (value) => value) {
  const calendar = await fetchJson(FIFA_CALENDAR_URL);
  const matches = asArray(calendar.Results).filter(fifaMatchHasStarted);
  const liveMatches = await Promise.all(matches.map(fetchFifaLiveMatch));

  return {
    mostCards: computeMostCardsFromFifaLiveMatches(liveMatches, resolveTeam),
  };
}

function buildBonusSources(sourceUrl = ESPN_SCOREBOARD_URL) {
  return {
    mostGoalsScored: {
      source: "ESPN match scores",
      sourceUrl,
      update: "Automatic with each results update",
    },
    mostGoalsConceded: {
      source: "ESPN match scores",
      sourceUrl,
      update: "Automatic with each results update",
    },
    farthestGoal: {
      source: "Official match reports/FIFA statistics when available",
      sourceUrl: FIFA_TEAM_STATISTICS_URL,
      update: "Manual override required",
    },
    bestPassCompletion: {
      source: "FIFA team statistics: Distribution, Passing Accuracy",
      sourceUrl: FIFA_TEAM_STATISTICS_URL,
      update: "Manual override required until FIFA exposes the aggregate value in a stable API",
    },
    mostCards: {
      source: "FIFA live match bookings",
      sourceUrl: FIFA_TEAM_STATISTICS_URL,
      apiUrl: FIFA_CALENDAR_URL,
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
  }

  return output;
}

export function buildResultsFromEvents(events, options) {
  const {
    picks,
    aliases = {},
    manualOverrides = {},
    fifaBonusResults = {},
    now = new Date().toISOString(),
    sourceUrl = ESPN_SCOREBOARD_URL,
  } = options;
  const resolveTeam = createTeamResolver(picks, aliases);
  const parsedMatches = events.map((event) => parseEspnEvent(event, resolveTeam));
  const matches = applyMatchOverrides(parsedMatches, manualOverrides, resolveTeam);
  const groups = buildGroupResults(matches, picks);
  const knockout = buildKnockoutResults(matches, picks);
  const topThirdGroups = isGroupStageFinal(groups) ? selectTopThirdGroups(groups) : [];
  const countedMatches = matches.filter(isCountedMatch).length;
  const liveMatches = matches.filter((match) => match.state === "in").length;
  const statusParts = [
    "Auto-updated from ESPN",
    `${countedMatches} live/final match${countedMatches === 1 ? "" : "es"} counted`,
  ];
  if (liveMatches > 0) statusParts.push(`${liveMatches} in progress`);

  const results = {
    meta: {
      lastUpdated: now,
      status: `${statusParts.join(": ")}.`,
      source: "espn",
      sourceUrl,
      bonusSources: buildBonusSources(sourceUrl),
      sourceNote:
        "Group standings are computed from ESPN match scores. FIFA live bookings are used for most-card bonus results. Third-place qualifier scoring is withheld until the group stage is final unless manually overridden.",
    },
    matches: matches
      .filter(isCountedMatch)
      .map((match) => ({
        id: match.id,
        date: match.date,
        state: match.state,
        completed: match.completed,
        detail: match.detail,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        winner: match.winner,
        loser: match.loser,
      }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    fixtures: matches
      .filter((match) => !match.completed)
      .map((match) => ({
        id: match.id,
        date: match.date,
        state: match.state,
        completed: match.completed,
        detail: match.detail,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
      }))
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
  const response = await fetch(ESPN_SCOREBOARD_URL);
  if (!response.ok) {
    throw new Error(`ESPN scoreboard request failed: ${response.status} ${response.statusText}`);
  }
  const scoreboard = await response.json();
  const resolveTeam = createTeamResolver(picks, aliases);
  const fifaBonusResults = await fetchFifaBonusResults(resolveTeam);
  const results = buildResultsFromEvents(scoreboard.events ?? [], {
    picks,
    aliases,
    manualOverrides,
    fifaBonusResults,
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
