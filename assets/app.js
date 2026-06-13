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
  const backLink =
    route.view === "entry" ?
      '<a class="nav-link" href="#/leaderboard">Back to Leaders</a>' :
      "";

  return `
    <nav class="top-nav" aria-label="Primary">
      <div class="nav-left">
        ${backLink}
      </div>
      <div class="nav-actions">
        <button class="share-button" type="button" data-share-button>Share</button>
        <span class="share-status" role="status" aria-live="polite"></span>
      </div>
    </nav>
  `;
}

function syncTopNavScrollState() {
  app.querySelector(".top-nav")?.classList.toggle("is-scrolled", window.scrollY > 8);
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
            const currentBlock = currentOrder.length
              ? `
                  <div>
                    <h4>Current</h4>
                    <ol>${currentOrder.map((team) => `<li>${teamPill(picks, team)}</li>`).join("")}</ol>
                  </div>
                `
              : "";
            const currentAdvancersRow = advancers.length
              ? `
                <div class="mini-row">
                  <span>Current advancers</span>
                  <span>${advancers.map((team) => teamPill(picks, team)).join('<span class="team-separator">&amp;</span>')}</span>
                </div>
              `
              : "";
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
                  ${currentBlock}
                </div>
                <div class="mini-row">
                  <span>Advancer hits</span>
                  <strong>${scored?.advancementHits?.length ?? 0}/${group.predictedAdvancers.length}</strong>
                </div>
                ${currentAdvancersRow}
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
  const quote = entry.quote ?? entry.celebrationQuote ?? (sample ? "Sample entry" : picks.meta.owner);

  return `
    <header class="site-header entry-header">
      <span class="hero-year" aria-hidden="true">26</span>
      <div>
        <p class="eyebrow player-quote">${escapeHtml(quote)}</p>
        <h1>${escapeHtml(entry.name)}</h1>
      </div>
      <div class="meta">
        <span>${escapeHtml(appState?.entriesConfig?.poolName ?? picks.meta.title ?? "2026 World Cup Pool Picks")}</span>
        <span>Updated ${formatDate(results.meta?.lastUpdated)}</span>
      </div>
    </header>
  `;
}

function renderRealEntry(entry, picks, results) {
  const score = scorePool(picks, results);
  return `
    ${renderEntryHeader(entry, picks, results, score)}
    ${renderScoreCards(score)}
    <section class="entry-details-surface" aria-label="Pick details">
      ${renderGroups(picks, results, score)}
      ${renderThirdPlace(picks, results)}
      ${renderKnockout(picks, score)}
      ${renderPodiumAndBonus(picks, results, score)}
    </section>
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

function formatList(items) {
  const values = items.filter(Boolean);
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function renderMatchChange(match) {
  const home = escapeHtml(match.homeTeam);
  const away = escapeHtml(match.awayTeam);
  const homeScore = Number.isFinite(match.homeScore) ? match.homeScore : "-";
  const awayScore = Number.isFinite(match.awayScore) ? match.awayScore : "-";
  const score = `${homeScore}-${awayScore}`;
  const isLive = match.state === "in" && !match.completed;

  if (isLive) {
    return `Live: ${home} ${score} ${away}`;
  }

  if (match.winner) {
    return `${escapeHtml(match.winner)} beat ${escapeHtml(match.loser)} ${score}`;
  }

  return `${home} drew ${away} ${score}`;
}

function formatUpdateDate(value) {
  if (!value) return "Undated";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Undated";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatUpdateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function groupLatestUpdates(rows, results) {
  const groups = new Map();
  const addUpdate = (dateValue, html) => {
    const date = dateValue || results.meta?.lastUpdated || "";
    const key = formatUpdateDate(date);
    const time = formatUpdateTime(date);
    const item = { html, time };
    const group = groups.get(key) ?? { date, items: [] };
    group.items.push(item);
    groups.set(key, group);
  };

  for (const match of results.matches ?? []) {
    addUpdate(match.date, renderMatchChange(match));
  }

  const leaders = rows.filter((row) => row.rank === 1);
  if (leaders.length) {
    addUpdate(
      results.meta?.lastUpdated,
      `${escapeHtml(formatList(leaders.map((leader) => leader.name)))} ${leaders.length === 1 ? "leads" : "share first"} with ${leaders[0].score.total} points`,
    );
  }

  const activeGroups = Object.entries(results.groups ?? {}).filter(([, group]) => group.status !== "not-started");
  for (const [groupId, group] of activeGroups.slice(0, 2)) {
    const topTwo = (group.currentOrder ?? []).slice(0, 2);
    if (topTwo.length) {
      addUpdate(results.meta?.lastUpdated, `Group ${escapeHtml(groupId)} top two: ${escapeHtml(formatList(topTwo))}`);
    }
  }

  const topScorers = results.bonus?.mostGoalsScored ?? [];
  if (topScorers.length) {
    addUpdate(results.meta?.lastUpdated, `Most goals so far: ${escapeHtml(formatList(topScorers))}`);
  }

  if (groups.size === 0) {
    addUpdate(results.meta?.lastUpdated, escapeHtml(results.meta?.status ?? "No matches have been counted yet."));
  }

  return [...groups.values()].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function renderLatestUpdates(rows, results) {
  const updateGroups = groupLatestUpdates(rows, results);

  return `
    <aside class="latest-updates-panel" aria-label="Latest updates">
      <div>
        <h2>Latest Updates</h2>
        <p>${escapeHtml(results.meta?.status ?? "Latest standings update")}</p>
      </div>
      <div class="latest-update-list">
        ${updateGroups
          .map(
            (group, index) => `
              <details class="latest-update-day" ${index === 0 ? "open" : ""}>
                <summary>
                  <span>${escapeHtml(formatUpdateDate(group.date))}</span>
                  ${statusPill(`${group.items.length} update${group.items.length === 1 ? "" : "s"}`)}
                </summary>
                <ul>
                  ${group.items
                    .map(
                      (item) => `
                        <li>
                          <time>${escapeHtml(item.time || "Update")}</time>
                          <span>${item.html}</span>
                        </li>
                      `,
                    )
                    .join("")}
                </ul>
              </details>
            `,
          )
          .join("")}
      </div>
    </aside>
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
    <section class="leaderboard-layout">
      <div class="leaderboard-main">
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
                        <th>
                          <span class="rank-badge">${row.rank}</span>
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
      </div>
      <div class="leaderboard-updates">
        <div class="leaderboard-prizes">
          ${renderPayouts(entriesConfig)}
        </div>
        ${renderLatestUpdates(rows, results)}
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
  syncTopNavScrollState();
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
    window.addEventListener("scroll", syncTopNavScrollState, { passive: true });
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
