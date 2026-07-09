import assert from "node:assert/strict";
import {
  FIFA_CALENDAR_URL,
  buildResultsFromFifaMatches,
  computeBestPassCompletionFromFifaTeamStats,
  computeCardPointsFromFifaLiveMatches,
  computeCardPointsFromFifaTeamStats,
  computeFarthestGoalFromFifaTimelines,
  computeGoalBonusResultsFromFifaTeamStats,
  computeMostCardsFromFifaLiveMatches,
  createTeamResolver,
  parseFifaMatch,
  sortGroupStats,
} from "../scripts/update-results.mjs";
import aliases from "../data/team-aliases.json" with { type: "json" };
import picks from "../data/picks.json" with { type: "json" };

const TEAM_IDS = {
  Mexico: "43911",
  "South Africa": "43883",
  "South Korea": "43822",
  "Korea Republic": "43822",
  Czechia: "43995",
  Germany: "43948",
  Paraguay: "43940",
  Switzerland: "43971",
  Colombia: "43926",
};

function localized(description) {
  return [{ Locale: "en-GB", Description: description }];
}

function fifaTeam(name) {
  return {
    IdTeam: TEAM_IDS[name] ?? `team-${name}`,
    TeamName: localized(name),
    ShortClubName: name,
    Abbreviation: name.slice(0, 3).toUpperCase(),
  };
}

function fifaMatchFixture({
  id,
  matchNumber = 1,
  date = "2026-06-11T19:00:00Z",
  stage = "First Stage",
  group = "Group A",
  completed = true,
  state = completed ? "post" : "pre",
  resultType = completed ? 1 : 0,
  home,
  away,
  homeScore = completed ? 0 : null,
  awayScore = completed ? 0 : null,
  homePenaltyScore = null,
  awayPenaltyScore = null,
  winner = "",
}) {
  const homeTeam = home ? fifaTeam(home) : null;
  const awayTeam = away ? fifaTeam(away) : null;
  const winnerTeam = winner === home ? homeTeam : winner === away ? awayTeam : null;
  const matchStatus = completed ? 0 : state === "in" ? 3 : 1;

  return {
    IdCompetition: "17",
    IdSeason: "285023",
    IdStage: stage === "First Stage" ? "289273" : "knockout",
    IdMatch: id,
    MatchNumber: matchNumber,
    Date: date,
    StageName: localized(stage),
    GroupName: group ? localized(group) : [],
    Home: homeTeam,
    Away: awayTeam,
    HomeTeamScore: homeScore,
    AwayTeamScore: awayScore,
    HomeTeamPenaltyScore: homePenaltyScore,
    AwayTeamPenaltyScore: awayPenaltyScore,
    Winner: winnerTeam?.IdTeam ?? null,
    MatchStatus: matchStatus,
    ResultType: resultType,
    OfficialityStatus: completed ? 1 : 0,
  };
}

{
  const resolveTeam = createTeamResolver(picks, aliases);
  const parsed = parseFifaMatch(
    fifaMatchFixture({
      id: "alias",
      completed: false,
      home: "Korea Republic",
      away: "Czechia",
      homeScore: null,
      awayScore: null,
    }),
    resolveTeam,
  );
  assert.equal(parsed.homeTeam, "South Korea", "Korea Republic should normalize to South Korea");
  assert.equal(parsed.source, "fifa", "parsed match should carry FIFA provenance");
}

{
  const results = buildResultsFromFifaMatches(
    [
      fifaMatchFixture({
        id: "group-a-1",
        home: "Mexico",
        away: "South Africa",
        homeScore: 2,
        awayScore: 0,
        winner: "Mexico",
      }),
      fifaMatchFixture({
        id: "group-a-2",
        matchNumber: 2,
        date: "2026-06-12T02:00:00Z",
        completed: false,
        home: "Korea Republic",
        away: "Czechia",
        homeScore: null,
        awayScore: null,
      }),
    ],
    {
      picks,
      aliases,
      fifaRankingResults: { rankingsByTeam: { Mexico: 14, "South Africa": 61 } },
      now: "2026-06-11T18:00:00.000Z",
    },
  );

  assert.equal(results.meta.source, "fifa");
  assert.equal(results.meta.sourceUrl, FIFA_CALENDAR_URL);
  assert.match(results.meta.status, /Auto-updated from FIFA/);
  assert.doesNotMatch(JSON.stringify(results.meta), /ESPN/i);
  assert.deepEqual(results.matches.map((match) => match.source), ["fifa"]);
  assert.deepEqual(
    results.fixtures.map((match) => match.id),
    ["group-a-2"],
    "scheduled FIFA matches should be exposed separately from counted matches",
  );
  assert.deepEqual(
    results.topThirdGroups,
    [],
    "third-place groups should be withheld until the full group stage is final",
  );
  assert.deepEqual(results.bonus.mostGoalsScored, ["Mexico"]);
  assert.deepEqual(results.bonus.mostGoalsConceded, ["South Africa"]);
}

{
  const ordered = sortGroupStats(
    [
      { team: "Mexico", played: 3, points: 4, goalsFor: 6, goalsAgainst: 1, goalDifference: 5 },
      { team: "South Africa", played: 3, points: 4, goalsFor: 3, goalsAgainst: 3, goalDifference: 0 },
    ],
    [
      {
        completed: true,
        state: "post",
        homeTeam: "Mexico",
        awayTeam: "South Africa",
        homeScore: 0,
        awayScore: 1,
      },
    ],
  );

  assert.deepEqual(
    ordered.map((item) => item.team),
    ["South Africa", "Mexico"],
    "FIFA head-to-head criteria should resolve teams tied on points before overall goal difference",
  );
}

{
  const fairPlayOrder = sortGroupStats(
    [
      { team: "Germany", played: 3, points: 4, goalsFor: 3, goalsAgainst: 3, goalDifference: 0 },
      { team: "Paraguay", played: 3, points: 4, goalsFor: 3, goalsAgainst: 3, goalDifference: 0 },
    ],
    [],
    { fairPlayPointsByTeam: { Germany: 2, Paraguay: 6 } },
  );
  assert.deepEqual(
    fairPlayOrder.map((item) => item.team),
    ["Germany", "Paraguay"],
    "lower FIFA Fair Play Points should win the discipline tiebreaker",
  );

  const rankingOrder = sortGroupStats(
    [
      { team: "Germany", played: 3, points: 4, goalsFor: 3, goalsAgainst: 3, goalDifference: 0 },
      { team: "Paraguay", played: 3, points: 4, goalsFor: 3, goalsAgainst: 3, goalDifference: 0 },
    ],
    [],
    { fairPlayPointsByTeam: { Germany: 2, Paraguay: 2 }, fifaRankByTeam: { Germany: 11, Paraguay: 47 } },
  );
  assert.deepEqual(
    rankingOrder.map((item) => item.team),
    ["Germany", "Paraguay"],
    "FIFA ranking should be the final unresolved tiebreaker when supplied",
  );
}

{
  const parsed = parseFifaMatch(
    fifaMatchFixture({
      id: "shootout",
      stage: "Round of 16",
      group: "",
      resultType: 2,
      home: "Switzerland",
      away: "Colombia",
      homeScore: 0,
      awayScore: 0,
      homePenaltyScore: 4,
      awayPenaltyScore: 3,
      winner: "Switzerland",
    }),
    createTeamResolver(picks, aliases),
  );

  assert.equal(parsed.detail, "FT-Pens");
  assert.equal(parsed.winner, "Switzerland");
  assert.equal(parsed.loser, "Colombia");
  assert.equal(parsed.homePenaltyScore, 4);
  assert.equal(parsed.awayPenaltyScore, 3);
}

{
  const resolveTeam = createTeamResolver(picks, aliases);
  const fifaMatches = [
    {
      HomeTeam: {
        ShortClubName: "USA",
        Bookings: [
          { Card: 1, IdPlayer: "usa-second-yellow" },
          { Card: 2, IdPlayer: "usa-second-yellow" },
        ],
      },
      AwayTeam: {
        ShortClubName: "Korea Republic",
        Bookings: [{ Card: 1 }, { Card: 1 }, { Card: 1 }, { Card: 1 }, { Card: 1 }],
      },
    },
    {
      HomeTeam: {
        ShortClubName: "South Africa",
        Bookings: [
          { Card: 1, IdPlayer: "south-africa-direct-red" },
          { Card: 3, IdPlayer: "south-africa-direct-red" },
        ],
      },
      AwayTeam: {
        ShortClubName: "USA",
        Bookings: [{ Card: 3 }],
      },
    },
  ];
  const cardPoints = computeCardPointsFromFifaLiveMatches(fifaMatches, resolveTeam);
  const mostCards = computeMostCardsFromFifaLiveMatches(fifaMatches, resolveTeam);

  assert.deepEqual(cardPoints, {
    "South Africa": 5,
    "South Korea": 5,
    "United States": 7,
  });
  assert.deepEqual(mostCards, ["United States"]);
}

{
  const goalBonuses = computeGoalBonusResultsFromFifaTeamStats([
    { team: "France", stats: [["Goals", 14], ["GoalsConceded", 2]] },
    { team: "Argentina", stats: [["Goals", 14], ["GoalsConceded", 5]] },
    { team: "Germany", stats: [["Goals", 11], ["GoalsConceded", 5]] },
    { team: "Iraq", stats: [["Goals", 1], ["GoalsConceded", 12]] },
    { team: "Tunisia", stats: [["Goals", 2], ["GoalsConceded", 12]] },
  ]);

  assert.deepEqual(goalBonuses, {
    mostGoalsScored: ["Argentina", "France"],
    mostGoalsConceded: ["Iraq", "Tunisia"],
  });
}

{
  const cardPoints = computeCardPointsFromFifaTeamStats([
    { team: "Egypt", stats: [["YellowCards", 12], ["DirectRedCards", 0], ["IndirectRedCards", 0]] },
    { team: "Paraguay", stats: [["YellowCards", 9], ["DirectRedCards", 1], ["IndirectRedCards", 0]] },
    { team: "South Africa", stats: [["YellowCards", 5], ["DirectRedCards", 2], ["IndirectRedCards", 0]] },
  ]);

  assert.deepEqual(cardPoints, {
    Egypt: 12,
    Paraguay: 13,
    "South Africa": 13,
  });
}

{
  const farthestGoal = computeFarthestGoalFromFifaTimelines(
    [
      {
        Event: [
          { Type: 0, IdTeam: "43850", PositionX: 29.29916, PositionY: 53.839553 },
          { Type: 0, IdTeam: "43924", PositionX: 90, PositionY: 50 },
          { Type: 0, IdTeam: "43924", PositionX: 1, PositionY: 50, Period: 9 },
        ],
      },
    ],
    new Map([
      ["43850", "Cape Verde"],
      ["43924", "Brazil"],
    ]),
  );

  assert.deepEqual(farthestGoal, ["Cape Verde"]);
}

{
  const bestPassCompletion = computeBestPassCompletionFromFifaTeamStats([
    { team: "Spain", stats: [["Passes", 1000], ["PassesCompleted", 911]] },
    { team: "Portugal", stats: [["Passes", 1001], ["PassesCompleted", 912]] },
    { team: "Brazil", stats: [["Passes", 1000], ["PassesCompleted", 910]] },
  ]);

  assert.deepEqual(
    bestPassCompletion,
    ["Portugal", "Spain"],
    "FIFA team pass totals should include teams tied at displayed pass completion precision",
  );
}

{
  const events = Object.entries(picks.groups).map(([groupId, group], index) =>
    fifaMatchFixture({
      id: `group-${groupId}-complete`,
      matchNumber: index + 1,
      group: `Group ${groupId}`,
      date: `2026-06-${String(11 + index).padStart(2, "0")}T17:00:00Z`,
      home: group.teams[0].name,
      away: group.teams[2].name,
      homeScore: 1,
      awayScore: 0,
      winner: group.teams[0].name,
    }),
  );
  const results = buildResultsFromFifaMatches(events, {
    picks,
    aliases,
    now: "2026-06-27T23:00:00.000Z",
  });

  assert.equal(
    results.topThirdGroups.length,
    8,
    "third-place groups should populate when every group in the FIFA feed is final",
  );
}

{
  const results = buildResultsFromFifaMatches(
    [
      fifaMatchFixture({
        id: "r32-1",
        matchNumber: 81,
        stage: "Round of 32",
        group: "",
        date: "2026-06-29T20:30:00Z",
        home: "Germany",
        away: "Paraguay",
        homeScore: 3,
        awayScore: 1,
        winner: "Germany",
      }),
    ],
    {
      picks,
      aliases,
      now: "2026-06-29T23:00:00.000Z",
    },
  );

  assert.deepEqual(results.roundOf16, ["Germany"], "Round of 32 winner should reach Round of 16");
}

{
  assert.throws(
    () =>
      buildResultsFromFifaMatches([], {
        picks,
        aliases,
        manualOverrides: {
          matches: [
            {
              id: "manual-only",
              homeTeam: "Mexico",
              awayTeam: "South Africa",
              homeScore: 99,
              awayScore: 0,
            },
          ],
        },
      }),
    /does not match an official FIFA match/,
    "manual match overrides should not create synthetic production scores",
  );
}

{
  const results = buildResultsFromFifaMatches(
    [
      fifaMatchFixture({
        id: "group-a-1",
        home: "Mexico",
        away: "South Africa",
        homeScore: 2,
        awayScore: 0,
        winner: "Mexico",
      }),
    ],
    {
      picks,
      aliases,
      fifaBonusResults: {
        mostCards: {
          Mexico: 2,
        },
      },
      manualOverrides: {
        bonus: {
          mostCards: [],
        },
      },
    },
  );

  assert.deepEqual(
    results.bonus.mostCards,
    { Mexico: 2 },
    "empty manual bonus placeholders should not erase automatic FIFA bonus results",
  );
}

console.log("Updater tests passed.");
