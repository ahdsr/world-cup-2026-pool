import assert from "node:assert/strict";
import {
  FIFA_CALENDAR_URL,
  normalizeKey,
} from "../scripts/update-results.mjs";
import aliases from "../data/team-aliases.json" with { type: "json" };
import picks from "../data/picks.json" with { type: "json" };
import results from "../data/results.json" with { type: "json" };

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

function rawTeamName(team) {
  return team?.ShortClubName ?? localizedDescription(team?.TeamName) ?? team?.Abbreviation ?? "";
}

const aliasLookup = new Map();
for (const group of Object.values(picks.groups ?? {})) {
  for (const team of group.teams ?? []) aliasLookup.set(normalizeKey(team.name), team.name);
}
for (const [alias, canonical] of Object.entries(aliases.aliases ?? aliases)) {
  aliasLookup.set(normalizeKey(alias), canonical);
}

function resolveTeam(value) {
  const raw = String(value ?? "").trim();
  return aliasLookup.get(normalizeKey(raw)) ?? raw;
}

function teamId(team) {
  const id = team?.IdTeam ?? team?.idTeam ?? team?.Id ?? team?.id;
  return id === undefined || id === null ? "" : String(id);
}

function rawScore(match, side) {
  return numberValue(match?.[`${side}TeamScore`] ?? match?.[side]?.Score);
}

function rawState(match) {
  const status = numberValue(match?.MatchStatus);
  const hasScore = rawScore(match, "Home") !== null && rawScore(match, "Away") !== null;
  if (status === 0 || (numberValue(match?.OfficialityStatus) === 1 && hasScore)) return "post";
  if ([3, 5].includes(status)) return "in";
  return "pre";
}

function rawWinner(match, homeTeam, awayTeam, homeScore, awayScore) {
  const winnerId = String(match?.Winner ?? "");
  if (winnerId && winnerId === teamId(match?.Home)) return homeTeam;
  if (winnerId && winnerId === teamId(match?.Away)) return awayTeam;
  if (homeScore !== null && awayScore !== null && homeScore !== awayScore) {
    return homeScore > awayScore ? homeTeam : awayTeam;
  }
  return "";
}

function officialMatchValue(match) {
  const homeTeam = resolveTeam(rawTeamName(match.Home)) || match.PlaceHolderA || "";
  const awayTeam = resolveTeam(rawTeamName(match.Away)) || match.PlaceHolderB || "";
  const homeScore = rawScore(match, "Home");
  const awayScore = rawScore(match, "Away");
  const state = rawState(match);
  const completed = state === "post";
  const winner = completed ? rawWinner(match, homeTeam, awayTeam, homeScore, awayScore) : "";

  return {
    id: String(match.IdMatch ?? ""),
    state,
    completed,
    stage: localizedDescription(match.StageName),
    group: localizedDescription(match.GroupName),
    matchNumber: numberValue(match.MatchNumber),
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    homePenaltyScore: numberValue(match.HomeTeamPenaltyScore),
    awayPenaltyScore: numberValue(match.AwayTeamPenaltyScore),
    winner,
    loser: winner && winner === homeTeam ? awayTeam : winner ? homeTeam : "",
  };
}

function counted(match) {
  return (
    (match.state === "in" || match.state === "post" || match.completed) &&
    match.homeScore !== null &&
    match.awayScore !== null
  );
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

const response = await fetch(FIFA_CALENDAR_URL, {
  headers: {
    accept: "application/json",
    "user-agent": "world-cup-2026-pool-live-audit",
  },
});
assert.equal(response.ok, true, `FIFA calendar request should succeed: ${response.status}`);
const calendar = await response.json();
const officialMatches = asArray(calendar.Results).map(officialMatchValue);
const officialCounted = officialMatches.filter(counted);
const officialFixtures = officialMatches.filter((match) => !match.completed);

assert.equal(results.meta.source, "fifa");
assert.equal(results.meta.sourceUrl, FIFA_CALENDAR_URL);
assert.equal(results.matches.length, officialCounted.length, "site counted match count should match FIFA");
assert.equal(results.fixtures.length, officialFixtures.length, "site fixture count should match FIFA");

const siteById = new Map(results.matches.map((match) => [match.id, match]));
for (const official of officialCounted) {
  const site = siteById.get(official.id);
  assert.ok(site, `site should include FIFA match ${official.id}`);
  assert.equal(site.source, "fifa", `${official.id} should carry FIFA source`);
  assert.equal(site.homeTeam, official.homeTeam, `${official.id} home team should match FIFA`);
  assert.equal(site.awayTeam, official.awayTeam, `${official.id} away team should match FIFA`);
  assert.equal(site.homeScore, official.homeScore, `${official.id} home score should match FIFA`);
  assert.equal(site.awayScore, official.awayScore, `${official.id} away score should match FIFA`);
  assert.equal(site.winner, official.winner, `${official.id} winner should match FIFA`);
  assert.equal(site.loser, official.loser, `${official.id} loser should match FIFA`);
  if (official.homePenaltyScore !== null) {
    assert.equal(site.homePenaltyScore, official.homePenaltyScore, `${official.id} home penalties should match FIFA`);
  }
  if (official.awayPenaltyScore !== null) {
    assert.equal(site.awayPenaltyScore, official.awayPenaltyScore, `${official.id} away penalties should match FIFA`);
  }
}

const fixtureById = new Map(results.fixtures.map((match) => [match.id, match]));
for (const official of officialFixtures) {
  const site = fixtureById.get(official.id);
  assert.ok(site, `site should include FIFA fixture ${official.id}`);
  assert.equal(site.homeTeam, official.homeTeam, `${official.id} fixture home team should match FIFA`);
  assert.equal(site.awayTeam, official.awayTeam, `${official.id} fixture away team should match FIFA`);
}

const teamToGroup = new Map();
for (const [groupId, group] of Object.entries(picks.groups ?? {})) {
  for (const team of group.teams ?? []) teamToGroup.set(normalizeKey(team.name), groupId);
}

const independentGroups = Object.fromEntries(
  Object.entries(picks.groups ?? {}).map(([groupId, group]) => [
    groupId,
    new Map((group.teams ?? []).map((team) => [team.name, emptyStats(team.name)])),
  ]),
);

for (const match of officialCounted) {
  const homeGroup = teamToGroup.get(normalizeKey(match.homeTeam));
  const awayGroup = teamToGroup.get(normalizeKey(match.awayTeam));
  if (!homeGroup || homeGroup !== awayGroup) continue;
  const stats = independentGroups[homeGroup];
  const home = stats.get(match.homeTeam) ?? emptyStats(match.homeTeam);
  const away = stats.get(match.awayTeam) ?? emptyStats(match.awayTeam);
  applyScore(home, away, match.homeScore, match.awayScore);
  stats.set(match.homeTeam, home);
  stats.set(match.awayTeam, away);
}

for (const [groupId, stats] of Object.entries(independentGroups)) {
  const siteStats = new Map((results.groups[groupId]?.stats ?? []).map((item) => [item.team, item]));
  for (const [team, expected] of stats) {
    const actual = siteStats.get(team);
    assert.ok(actual, `Group ${groupId} should include ${team}`);
    for (const key of ["played", "points", "goalsFor", "goalsAgainst", "goalDifference"]) {
      assert.equal(actual[key], expected[key], `Group ${groupId} ${team} ${key} should match raw FIFA matches`);
    }
  }
}

function officialWinners(stageName) {
  return officialCounted
    .filter((match) => match.stage === stageName)
    .sort((a, b) => Number(a.matchNumber ?? 0) - Number(b.matchNumber ?? 0))
    .map((match) => match.winner)
    .filter(Boolean);
}

function sameMembers(actual, expected, label) {
  assert.deepEqual(actual.slice().sort(), expected.slice().sort(), label);
}

sameMembers(results.roundOf16, officialWinners("Round of 32"), "Round of 32 winners should match FIFA");
sameMembers(results.quarterFinalists, officialWinners("Round of 16"), "Round of 16 winners should match FIFA");
sameMembers(results.semifinalists, officialWinners("Quarter-final"), "Quarter-final winners should match FIFA");

console.log("Live FIFA accuracy tests passed.");
