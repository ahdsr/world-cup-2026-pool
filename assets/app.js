import { buildLeaderboardRows } from "./leaderboard.js";
import { actualAdvancersForGroup, scorePool } from "./scoring.js";

const app = document.querySelector("#app");

let appState = null;
let celebrationShown = false;

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "Not updated";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function parseRoute() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const parts = hash.split("/").filter(Boolean);
  if (parts[0] === "leaderboard") return { view: "leaderboard" };
  if (parts[0] === "entry" && parts[1]) return { view: "entry", entryId: parts[1] };
  return { view: "leaderboard" };
}

function entryHref(entryId) {
  return `#/entry/${encodeURIComponent(entryId)}`;
}

function teamFlag(picks, team) {
  if (!picks?.groups) return "";
  const found = Object.values(picks.groups)
    .flatMap((group) => group.teams)
    .find((item) => item.name === team);
  if (!found?.flagCode) return "";
  return `<img class="flag" src="https://flagcdn.com/w40/${escapeHtml(found.flagCode)}.png" alt="" loading="lazy" onload="this.dataset.loaded='true'" onerror="this.hidden=true" />`;
}

function teamPill(picks, team, className = "") {
  if (!team) return `<span class="empty">Not entered</span>`;
  return `<span class="team ${className}">${teamFlag(picks, team)}<span>${escapeHtml(team)}</span></span>`;
}

function statusPill(text, tone = "") {
  return `<span class="pill ${tone}">${escapeHtml(text)}</span>`;
}

function renderNav(entriesConfig, route) {
  const leaderboardActive = route.view === "leaderboard" ? "active" : "";

  return `
    <nav class="top-nav" aria-label="Primary">
      <a class="brand-link ${leaderboardActive}" href="#/leaderboard">
        ${escapeHtml(entriesConfig.poolName)}
      </a>
      <div class="nav-actions">
        <a class="nav-link ${leaderboardActive}" href="#/leaderboard" ${leaderboardActive ? 'aria-current="page"' : ""}>
          Leaderboard
        </a>
        <button class="share-button" type="button" data-share-button>Share</button>
        <span class="share-status" role="status" aria-live="polite"></span>
      </div>
    </nav>
  `;
}

function renderScoreCards(score) {
  const cards = [
    ["Group", score.subtotals.group],
    ["Knockout", score.subtotals.knockout],
    ["Finals", score.subtotals.finals],
    ["Bonus", score.subtotals.bonus],
  ];
  return `
    <section class="score-grid" aria-label="Score summary">
      <article class="score-card total">
        <span>Total score</span>
        <strong>${score.total}</strong>
      </article>
      ${cards
        .map(
          ([label, points]) => `
            <article class="score-card">
              <span>${label}</span>
              <strong>${points}</strong>
            </article>
          `,
        )
        .join("")}
    </section>
  `;
}

function renderGroups(picks, results, score) {
  return `
    <details class="panel" open>
      <summary>Group Picks</summary>
      <div class="groups-grid">
        ${Object.entries(picks.groups)
          .map(([groupId, group]) => {
            const scored = score.groups.find((item) => item.groupId === groupId);
            const currentOrder = results.groups?.[groupId]?.currentOrder ?? [];
            const advancers = actualAdvancersForGroup(results, groupId);
            return `
              <article class="group-card">
                <header>
                  <h3>Group ${groupId}</h3>
                  ${statusPill(`${scored?.points ?? 0} pts`, scored?.points ? "good" : "")}
                </header>
                <div class="comparison">
                  <div>
                    <h4>Pick</h4>
                    <ol>
                      ${group.predictedOrder
                        .map((team) => `<li>${teamPill(picks, team)}</li>`)
                        .join("")}
                    </ol>
                  </div>
                  <div>
                    <h4>Current</h4>
                    ${
                      currentOrder.length
                        ? `<ol>${currentOrder.map((team) => `<li>${teamPill(picks, team)}</li>`).join("")}</ol>`
                        : `<p class="muted">Not entered</p>`
                    }
                  </div>
                </div>
                <div class="mini-row">
                  <span>Advancer hits</span>
                  <strong>${scored?.advancementHits?.length ?? 0}/${group.predictedAdvancers.length}</strong>
                </div>
                <div class="mini-row">
                  <span>Current advancers</span>
                  <span>${advancers.length ? advancers.map((team) => teamPill(picks, team)).join("") : '<span class="empty">Not entered</span>'}</span>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    </details>
  `;
}

function renderThirdPlace(picks, results) {
  const rows = Object.entries(picks.thirdPlace).map(([groupId, item]) => {
    const active = results.topThirdGroups?.includes(groupId);
    return `
      <tr>
        <th>Group ${groupId}</th>
        <td>${teamPill(picks, item.team)}</td>
        <td>${item.selected ? statusPill("Selected", "good") : statusPill("Not selected")}</td>
        <td>${active ? statusPill("Current top 8", "good") : statusPill("Not entered")}</td>
      </tr>
    `;
  });

  return `
    <details class="panel">
      <summary>Third-Place Picks</summary>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Group</th>
              <th>Third-place team</th>
              <th>Pick</th>
              <th>Current status</th>
            </tr>
          </thead>
          <tbody>${rows.join("")}</tbody>
        </table>
      </div>
    </details>
  `;
}

function renderRound(picks, title, matches) {
  return `
    <section class="round">
      <h3>${escapeHtml(title)}</h3>
      <div class="match-list">
        ${matches
          .map(
            (match) => `
              <article class="match">
                <div>${match.teams.map((team) => teamPill(picks, team, team === match.winner ? "winner" : "")).join("")}</div>
                <strong>${teamPill(picks, match.winner, "winner")}</strong>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderKnockout(picks, score) {
  return `
    <details class="panel">
      <summary>Knockout Picks</summary>
      <div class="stage-score-list">
        ${score.knockout
          .map(
            (stage) => `
              <div class="mini-row">
                <span>${escapeHtml(stage.label)}</span>
                <strong>${stage.points} pts</strong>
              </div>
            `,
          )
          .join("")}
      </div>
      <div class="rounds">
        ${renderRound(picks, "Round of 32", picks.knockout.roundOf32)}
        ${renderRound(picks, "Round of 16", picks.knockout.roundOf16)}
        ${renderRound(picks, "Quarter-finals", picks.knockout.quarterFinals)}
        ${renderRound(picks, "Semi-finals", picks.knockout.semiFinals)}
      </div>
    </details>
  `;
}

function renderPodiumAndBonus(picks, results, score) {
  return `
    <details class="panel">
      <summary>Podium + Bonus</summary>
      <div class="podium">
        <article>
          <span>1st place</span>
          ${teamPill(picks, picks.podium.champion, "winner")}
        </article>
        <article>
          <span>2nd place</span>
          ${teamPill(picks, picks.podium.runnerUp)}
        </article>
        <article>
          <span>3rd place</span>
          ${teamPill(picks, picks.podium.thirdPlace)}
        </article>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Bonus</th>
              <th>Pick</th>
              <th>Official answer</th>
              <th>Points</th>
            </tr>
          </thead>
          <tbody>
            ${score.bonus
              .map(
                (item) => `
                  <tr>
                    <th>${escapeHtml(item.label)}</th>
                    <td>${teamPill(picks, item.pick)}</td>
                    <td>${
                      item.answers.length
                        ? item.answers.map((team) => teamPill(picks, team)).join("")
                        : '<span class="empty">Not entered</span>'
                    }</td>
                    <td><strong>${item.points}</strong></td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </details>
  `;
}

function renderEntryHeader(entry, picks, results, score, sample = false) {
  return `
    <header class="site-header">
      <span class="hero-year" aria-hidden="true">26</span>
      <div>
        <p class="eyebrow">${sample ? "Sample entry" : escapeHtml(picks.meta.owner)}</p>
        <h1>${escapeHtml(entry.name)}</h1>
      </div>
      <div class="meta">
        <span>${escapeHtml(appState?.entriesConfig?.poolName ?? picks.meta.title ?? "2026 World Cup Pool Picks")}</span>
        <span>Updated ${formatDate(results.meta?.lastUpdated)}</span>
        <strong>${score.total} pts</strong>
      </div>
    </header>
  `;
}

function renderRealEntry(entry, picks, results) {
  const score = scorePool(picks, results);
  return `
    ${renderEntryHeader(entry, picks, results, score)}
    ${renderScoreCards(score)}
    ${renderGroups(picks, results, score)}
    ${renderThirdPlace(picks, results)}
    ${renderKnockout(picks, score)}
    ${renderPodiumAndBonus(picks, results, score)}
    <footer>
      <span>Score file: <code>data/results.json</code></span>
      <span>Source: ${escapeHtml(picks.meta.sourceWorkbook)}</span>
    </footer>
  `;
}

function renderSampleEntry(entry, entriesConfig, results) {
  const score = {
    total: entry.score?.total ?? 0,
    subtotals: {
      group: entry.score?.subtotals?.group ?? 0,
      knockout: entry.score?.subtotals?.knockout ?? 0,
      finals: entry.score?.subtotals?.finals ?? 0,
      bonus: entry.score?.subtotals?.bonus ?? 0,
    },
  };
  const samplePicks = {
    meta: {
      title: entriesConfig.poolName,
      owner: entry.name,
    },
  };

  return `
    ${renderEntryHeader(entry, samplePicks, results, score, true)}
    ${renderScoreCards(score)}
    <section class="panel sample-panel">
      <div class="empty-state">
        <h2>${escapeHtml(entry.name)} is sample data</h2>
        <p>This placeholder keeps the leaderboard layout realistic until this entrant's real picks are added.</p>
      </div>
    </section>
  `;
}

function renderPayouts(entriesConfig) {
  const payouts = entriesConfig.payouts ?? [];
  if (!payouts.length) return "";

  return `
    <section class="payout-grid" aria-label="Prize payouts">
      ${payouts
        .map(
          (payout) => `
            <article class="payout-card">
              <span>${escapeHtml(payout.place)}</span>
              <strong>${escapeHtml(payout.amount)}</strong>
            </article>
          `,
        )
        .join("")}
    </section>
  `;
}

function renderLeaderboard(entriesConfig, rows, results) {
  return `
    <header class="site-header leaderboard-header">
      <span class="hero-year" aria-hidden="true">26</span>
      <div>
        <p class="eyebrow">Leaderboard</p>
        <h1>${escapeHtml(entriesConfig.poolName)}</h1>
      </div>
      <div class="meta">
        <span>Pool pot</span>
        <strong>${escapeHtml(entriesConfig.prizePoolLabel ?? "TBD")}</strong>
        <span>Updated ${formatDate(results.meta?.lastUpdated)}</span>
      </div>
    </header>
    ${renderPayouts(entriesConfig)}
    <section class="panel leaderboard-panel">
      <div class="leaderboard-title">
        <div>
          <h2>Current Standings</h2>
          <p>Totals update from the live results feed.</p>
        </div>
        ${statusPill(`${rows.length} entries`, "good")}
      </div>
      <div class="table-wrap">
        <table class="leaderboard-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Name</th>
              <th>Total</th>
              <th>Group</th>
              <th>Knockout</th>
              <th>Finals</th>
              <th>Bonus</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
                  <tr>
                    <td><strong>${row.rank}</strong></td>
                    <th>
                      <a class="entry-link" href="${entryHref(row.id)}">${escapeHtml(row.name)}</a>
                      ${row.sample ? statusPill("Sample") : ""}
                    </th>
                    <td><strong>${row.score.total}</strong></td>
                    <td>${row.score.subtotals.group}</td>
                    <td>${row.score.subtotals.knockout}</td>
                    <td>${row.score.subtotals.finals}</td>
                    <td>${row.score.subtotals.bonus}</td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderNotFound(entriesConfig, entryId) {
  return `
    <section class="error">
      <h1>Entry not found</h1>
      <p>No pool entry exists for <code>${escapeHtml(entryId)}</code>.</p>
      <p><a class="entry-link" href="#/leaderboard">Back to leaderboard</a></p>
    </section>
  `;
}

function setShareStatus(message) {
  const status = app.querySelector(".share-status");
  if (!status) return;

  status.textContent = message;
  window.setTimeout(() => {
    if (status.textContent === message) status.textContent = "";
  }, 2400);
}

function removeCelebrationToast(toast) {
  toast.classList.add("leaving");
  window.setTimeout(() => toast.remove(), 340);
}

function showLeaderCelebration(rows) {
  if (celebrationShown) return;

  const leadersWithQuotes = rows.filter((row) => row.rank === 1 && row.celebrationQuote);
  if (!leadersWithQuotes.length) return;

  celebrationShown = true;
  document.querySelector(".celebration-toast")?.remove();

  const toast = document.createElement("aside");
  toast.className = "celebration-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.innerHTML = `
    <div>
      <span>Top of the table</span>
      ${leadersWithQuotes
        .map(
          (leader) => `
            <p>
              <strong>${escapeHtml(leader.name)}</strong>
              <q>${escapeHtml(leader.celebrationQuote)}</q>
            </p>
          `,
        )
        .join("")}
    </div>
    <button type="button" aria-label="Dismiss celebration quote">X</button>
  `;

  document.body.append(toast);
  const dismiss = toast.querySelector("button");
  dismiss?.addEventListener("click", () => removeCelebrationToast(toast));
  window.setTimeout(() => {
    if (document.body.contains(toast)) removeCelebrationToast(toast);
  }, 7800);
}

async function shareCurrentPage() {
  const title = appState?.entriesConfig?.poolName ?? "Marcin's 2026 World Cup Pool";
  const url = window.location.href;
  const text = "View the latest standings and picks.";

  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      setShareStatus("Link copied");
      return;
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
  }

  window.prompt("Copy this link", url);
}

function renderRoute() {
  if (!appState) return;

  const route = parseRoute();
  const { entriesConfig, picksByPath, results } = appState;
  const rows = buildLeaderboardRows(entriesConfig, picksByPath, results);
  let content = "";

  if (route.view === "leaderboard") {
    content = renderLeaderboard(entriesConfig, rows, results);
  } else {
    const entry = entriesConfig.entries.find((item) => item.id === route.entryId);
    if (!entry) {
      content = renderNotFound(entriesConfig, route.entryId);
    } else if (entry.sample) {
      content = renderSampleEntry(entry, entriesConfig, results);
    } else {
      content = renderRealEntry(entry, picksByPath.get(entry.picksPath), results);
    }
  }

  app.innerHTML = `
    ${renderNav(entriesConfig, route)}
    ${content}
  `;

  app.querySelector("[data-share-button]")?.addEventListener("click", shareCurrentPage);
  showLeaderCelebration(rows);
}

async function start() {
  try {
    const [entriesConfig, results] = await Promise.all([
      loadJson("data/entries.json"),
      loadJson("data/results.json"),
    ]);
    const paths = [
      ...new Set(
        (entriesConfig.entries ?? [])
          .map((entry) => entry.picksPath)
          .filter(Boolean),
      ),
    ];
    const picksEntries = await Promise.all(
      paths.map(async (path) => [path, await loadJson(path)]),
    );

    appState = {
      entriesConfig,
      results,
      picksByPath: new Map(picksEntries),
    };

    document.title = entriesConfig.poolName;
    window.addEventListener("hashchange", renderRoute);
    renderRoute();
  } catch (error) {
    app.innerHTML = `
      <section class="error">
        <h1>Unable to load pool data</h1>
        <p>${escapeHtml(error.message)}</p>
      </section>
    `;
  }
}

start();
