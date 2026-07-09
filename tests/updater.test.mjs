import assert from "node:assert/strict";
import {
  buildResultsFromEvents,
  computeBestPassCompletionFromFifaTeamStats,
  computeCardPointsFromFifaLiveMatches,
  computeCardPointsFromFifaTeamStats,
  computeFarthestGoalFromFifaTimelines,
  computeMostCardsFromFifaLiveMatches,
  createTeamResolver,
  parseEspnEvent,
} from "../scripts/update-results.mjs";
import aliases from "../data/team-aliases.json" with { type: "json" };
import picks from "../data/picks.json" with { type: "json" };

function eventFixture({
  id,
  name,
  date = "2026-06-11T17:00Z",
  state = "post",
  completed = true,
  home,
  away,
  homeScore,
  awayScore,
  winner,
}) {
  return {
    id,
    name,
    shortName: `${away} at ${home}`,
    date,
    status: {
      type: {
        state,
        completed,
        description: completed ? "Full Time" : state === "in" ? "In Progress" : "Scheduled",
      },
    },
    competitions: [
      {
        competitors: [
          {
            homeAway: "home",
            score: String(homeScore ?? 0),
            winner: winner === home,
            team: { displayName: home },
          },
          {
            homeAway: "away",
            score: String(awayScore ?? 0),
            winner: winner === away,
            team: { displayName: away },
          },
        ],
      },
    ],
  };
}

{
  const resolveTeam = createTeamResolver(picks, aliases);
  const parsed = parseEspnEvent(
    eventFixture({
      id: "alias",
      name: "Czech Republic at South Korea",
      state: "pre",
      completed: false,
      home: "South Korea",
      away: "Czech Republic",
      homeScore: 0,
      awayScore: 0,
    }),
    resolveTeam,
  );
  assert.equal(parsed.awayTeam, "Czechia", "Czech Republic should normalize to Czechia");
}

{
  const results = buildResultsFromEvents(
    [
      eventFixture({
        id: "group-a-1",
        name: "South Africa at Mexico",
        home: "Mexico",
        away: "South Africa",
        homeScore: 2,
        awayScore: 0,
        winner: "Mexico",
      }),
      eventFixture({
        id: "group-a-2",
        name: "Czech Republic at South Korea",
        state: "pre",
        completed: false,
        home: "South Korea",
        away: "Czech Republic",
        homeScore: 0,
        awayScore: 0,
      }),
    ],
    {
      picks,
      aliases,
      now: "2026-06-11T18:00:00.000Z",
    },
  );

  assert.deepEqual(results.groups.A.currentOrder, [
    "Mexico",
    "Czechia",
    "South Korea",
    "South Africa",
  ]);
  assert.deepEqual(
    results.fixtures.map((match) => match.id),
    ["group-a-2"],
    "scheduled matches should be exposed separately from counted matches",
  );
  assert.deepEqual(
    results.topThirdGroups,
    [],
    "third-place groups should be withheld until the full group stage is final",
  );
  assert.deepEqual(results.bonus.mostGoalsScored, ["Mexico"]);
  assert.deepEqual(results.bonus.mostGoalsConceded, ["South Africa"]);
  assert.match(
    results.meta.bonusSources.mostCards.source,
    /FIFA team statistics/,
    "bonus metadata should identify the FIFA cards source",
  );
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
  const mostCards = computeMostCardsFromFifaLiveMatches(
    fifaMatches,
    resolveTeam,
  );

  assert.deepEqual(
    cardPoints,
    {
      "South Africa": 5,
      "South Korea": 5,
      "United States": 7,
    },
    "FIFA bookings should be normalized through team aliases and weighted into Fair Play Points",
  );
  assert.deepEqual(
    mostCards,
    ["United States"],
    "FIFA bookings should be normalized through team aliases and weighted for card bonus leaders",
  );
}

{
  const cardPoints = computeCardPointsFromFifaTeamStats([
    {
      team: "Egypt",
      stats: [
        ["YellowCards", 12],
        ["DirectRedCards", 0],
        ["IndirectRedCards", 0],
      ],
    },
    {
      team: "Paraguay",
      stats: [
        ["YellowCards", 9],
        ["DirectRedCards", 1],
        ["IndirectRedCards", 0],
      ],
    },
    {
      team: "South Africa",
      stats: [
        ["YellowCards", 5],
        ["DirectRedCards", 2],
        ["IndirectRedCards", 0],
      ],
    },
  ]);

  assert.deepEqual(
    cardPoints,
    {
      Egypt: 12,
      Paraguay: 13,
      "South Africa": 13,
    },
    "FIFA team stats should produce Fair Play Points from yellow, direct red, and indirect red totals",
  );
}

{
  const farthestGoal = computeFarthestGoalFromFifaTimelines(
    [
      {
        Event: [
          { Type: 0, IdTeam: "43850", PositionX: 29.29916, PositionY: 53.839553 },
          { Type: 0, IdTeam: "43924", PositionX: 90, PositionY: 50 },
        ],
      },
    ],
    new Map([
      ["43850", "Cape Verde"],
      ["43924", "Brazil"],
    ]),
  );

  assert.deepEqual(
    farthestGoal,
    ["Cape Verde"],
    "FIFA goal coordinates should identify the team with the farthest goal",
  );
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
    eventFixture({
      id: `group-${groupId}-complete`,
      name: `${group.teams[2].name} at ${group.teams[0].name}`,
      date: `2026-06-${String(11 + index).padStart(2, "0")}T17:00Z`,
      home: group.teams[0].name,
      away: group.teams[2].name,
      homeScore: 1,
      awayScore: 0,
      winner: group.teams[0].name,
    }),
  );
  const results = buildResultsFromEvents(events, {
    picks,
    aliases,
    now: "2026-06-27T23:00:00.000Z",
  });

  assert.equal(
    results.topThirdGroups.length,
    8,
    "third-place groups should populate when every group in the feed is final",
  );
}

{
  const results = buildResultsFromEvents(
    [
      eventFixture({
        id: "r32-1",
        name: "Third Place Group A/B/C/D/F at Group E Winner",
        date: "2026-06-29T20:30Z",
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
  const results = buildResultsFromEvents(
    [
      eventFixture({
        id: "group-a-1",
        name: "South Africa at Mexico",
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
      now: "2026-06-11T18:00:00.000Z",
      manualOverrides: {
        groups: {
          A: {
            currentOrder: ["Mexico", "South Korea", "Czechia", "South Africa"],
            status: "official",
          },
        },
        topThirdGroups: [],
        bonus: {
          mostCards: {
            Uruguay: 7,
          },
        },
      },
    },
  );

  assert.deepEqual(results.groups.A.currentOrder, [
    "Mexico",
    "South Korea",
    "Czechia",
    "South Africa",
  ]);
  assert.equal(results.groups.A.status, "official");
  assert.deepEqual(results.topThirdGroups, []);
  assert.deepEqual(results.bonus.mostCards, { Uruguay: 7 });
}

{
  const results = buildResultsFromEvents(
    [
      eventFixture({
        id: "group-a-1",
        name: "South Africa at Mexico",
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
