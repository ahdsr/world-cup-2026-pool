import assert from "node:assert/strict";
import { renderScoreCards, renderSourceFooter } from "../assets/app.js";
import results from "../data/results.json" with { type: "json" };

{
  const html = renderScoreCards({
    total: 42,
    subtotals: {
      group: 12,
      knockout: 10,
      finals: 15,
      bonus: 5,
    },
  });

  assert.match(html, /Total score/);
  assert.match(html, /<strong>42<\/strong>/);
  assert.match(html, /<span>Group<\/span>\s*<strong>12<\/strong>/);
  assert.match(html, /<span>Knockout<\/span>\s*<strong>10<\/strong>/);
  assert.match(html, /<span>Finals<\/span>\s*<strong>15<\/strong>/);
  assert.match(html, /<span>Bonus<\/span>\s*<strong>5<\/strong>/);
}

{
  const footer = renderSourceFooter({
    meta: {
      source: "fifa",
      sourceUrl: "https://api.fifa.com/api/v3/calendar/matches?language=en&count=200&idSeason=285023",
      sources: {
        matches: {
          sourceUrl: "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/standings",
        },
        tiebreakers: {
          sourceUrl:
            "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/groups-how-teams-qualify-tie-breakers",
        },
        rankings: {
          sourceUrl: "https://inside.fifa.com/fifa-world-ranking/men",
        },
      },
      bonusSources: results.meta.bonusSources,
    },
  });

  assert.match(footer, /FIFA results feed/);
  assert.match(footer, /FIFA standings/);
  assert.match(footer, /FIFA tiebreakers/);
  assert.match(footer, /FIFA rankings/);
  assert.doesNotMatch(footer, /ESPN/i);
}

console.log("UI render tests passed.");
