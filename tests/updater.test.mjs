import assert from "node:assert/strict";
import {
  buildResultsFromEvents,
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
  assert.deepEqual(results.topThirdGroups, ["A"]);
  assert.deepEqual(results.bonus.mostGoalsScored, ["Mexico"]);
  assert.deepEqual(results.bonus.mostGoalsConceded, ["South Africa"]);
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
          mostCards: ["Uruguay"],
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
  assert.deepEqual(results.bonus.mostCards, ["Uruguay"]);
}

console.log("Updater tests passed.");
