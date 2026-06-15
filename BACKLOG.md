# Product Backlog

This backlog tracks the path from the current static World Cup pool site toward a self-managed pool creation product.

## MVP Direction

Build the first version around one clear promise:

> Let a commissioner create a polished private sports pool, invite players, collect picks, and run a trusted leaderboard without touching spreadsheets or code.

The initial commercial wedge should stay focused on admin-paid pool hosting. Do not collect player entry fees or distribute prize money in the MVP.

## Current Pool Enhancements

| Priority | Feature | Notes |
| --- | --- | --- |
| P0 | Projections page | Added as `/#/projections`. Continue improving mathematical "still alive" logic. |
| P0 | Explain scoring | Add a per-entry view that explains why each entrant has their current points. |
| P1 | Scenario explorer | Let users select hypothetical winners for upcoming matches and see projected leaderboard movement. |
| P1 | Commissioner summary page | Internal dashboard showing entries, missing picks, latest update time, payout setup, overrides, and import status. |
| P1 | Public rules page | Show scoring rules, prize structure, lock rules, update source, and tiebreakers in plain language. |
| P2 | Share cards | Generate shareable leaderboard/projection summary cards after major updates. |
| P2 | Audit log display | Surface result overrides, manual corrections, and scoring-rule changes. |

## SaaS MVP Features

| Priority | Feature | User Value |
| --- | --- | --- |
| P0 | Pool creator account | Lets commissioners own and manage pools. |
| P0 | Create pool wizard | Guides setup through event, pool type, scoring, privacy, and invite settings. |
| P0 | Pool templates | Starts from common pool formats instead of blank configuration. |
| P0 | Invite link and access code | Makes joining easy for friends, offices, and fundraisers. |
| P0 | Pick entry flow | Mobile-first pick forms with save progress, validation, and deadline warnings. |
| P0 | Pick locking | Locks picks by match, stage, or tournament deadline. |
| P0 | Leaderboard | Current standings, rank, scoring subtotals, payout positions, and entrant detail pages. |
| P0 | Results updater | Scheduled sports-data sync with manual override support. |
| P0 | Admin-paid subscription | Charge pool creators for hosting; players join free. |
| P1 | Commissioner dashboard | Central control panel for participants, rules, picks, updates, and overrides. |
| P1 | Manual pick entry | Lets commissioners add offline or late paper entries before lock. |
| P1 | Export tools | CSV exports for entries, picks, standings, and payout tracking. |
| P1 | Email reminders | Deadline reminders, missing pick notices, and leaderboard update emails. |
| P1 | Player notifications | Send opt-in email/SMS/push-style updates when players move positions, enter payout range, fall out of contention, or have important picks coming up. |
| P1 | Pool conversation feed | Let pool members post comments, reactions, and friendly chirps during the tournament. |
| P1 | Branding | Pool logo, colors, sponsor block, and custom share text. |
| P1 | Pool customization | Let commissioners make each pool feel unique with images, colors, display text, and group-specific visual settings. |
| P2 | Organization pools | Departments, teams, divisions, and multi-pool management. |
| P2 | Custom domain | Premium white-label option for companies and fundraisers. |
| P3 | Side bet challenges | Let pool members propose friendly side challenges on upcoming matches or tournament outcomes, with strict controls and no money handling in the initial version. |

## Pool Type Templates

Users should be able to choose common pool types per tournament. Each template should include default rules, sample scoring, recommended lock settings, and a "How to Play" page.

| Template | Best For | How It Works |
| --- | --- | --- |
| World Cup Full Predictor | Serious tournament pools | Players predict group order, advancing teams, knockout advancement, podium, and bonuses. |
| World Cup Match Pick'em | Casual office pools | Players pick each match winner/draw, with optional exact-score bonuses. |
| World Cup Knockout Bracket | Simple playoff-style pools | Players fill the knockout bracket after the group stage is set. |
| World Cup Survivor | Smaller groups and recurring engagement | Players pick one team per round or matchday and cannot reuse teams. |
| March Madness Bracket | Mainstream bracket pools | Players fill a bracket before the tournament, using round-weighted scoring. |
| NFL Pick'em | Weekly football pools | Players pick game winners each week, with confidence or spread options later. |
| NFL Survivor | Simple recurring pool | Players pick one team per week and are eliminated after a loss. |
| NHL/NBA Playoff Bracket | Playoff pools | Players predict series winners and finals outcomes. |
| F1 Race Predictor | Season-long pools | Players predict podiums, fastest lap, constructor/team outcomes, and season standings. |

## How To Play Pages

Each pool template should generate a public explainer page that a commissioner can share before players enter picks.

Minimum content:

- Pool objective: what players are trying to predict.
- Entry deadline and lock behavior.
- Step-by-step pick instructions.
- Scoring table with examples.
- Tie rules and payout positions.
- Pick reveal policy.
- Result source and update cadence.
- Commissioner contact or dispute process.

Suggested routes for a future full app:

```text
/templates
/templates/world-cup-full-predictor
/templates/world-cup-match-pickem
/pools/:poolSlug/how-to-play
/pools/:poolSlug/commissioner
```

## Pool Customization

Commissioners should be able to personalize a pool without design skills. Customization should be easy, constrained, and safe enough that the pool still looks polished.

MVP options:

- Pool logo or group avatar.
- Hero/background image for the pool homepage.
- Primary and accent color picker with accessible contrast checks.
- Preset visual themes, such as office, friends, fundraiser, corporate, national team, dark mode, and clean classic.
- Custom pool name, tagline, welcome message, and commissioner note.
- Prize/payout card labels.
- Sponsor or company block for fundraisers and office pools.
- Optional group photo or celebration image.
- Share-card image style for social/WhatsApp updates.

Guardrails:

- Use curated theme presets before allowing fully custom design.
- Automatically check text contrast against selected colors.
- Provide image crop tools for mobile and desktop.
- Keep uploaded images out of scoring, audit, and rules surfaces where clarity matters most.
- Let commissioners preview leaderboard, pick entry, projections, and "How to Play" pages before publishing.

## Notifications And Chirping

Pool members should feel the tournament moving in real time. Notifications and conversation should make the pool more social without turning the product into a noisy chat app.

### Player Notifications

MVP notification triggers:

- Rank change after a completed match.
- Player moves into or out of a payout position.
- Player becomes mathematically eliminated from first place.
- Player becomes unable to reach payout range.
- Player takes the lead or ties for first.
- Big swing alert when a match result causes a major leaderboard move.
- Pick deadline reminders.
- Missing pick reminders.
- Commissioner announcements.

Delivery channels:

- Email for MVP.
- SMS as a paid/premium option because message costs scale with pool size.
- Web push or PWA notifications later.
- Optional Slack/Teams/WhatsApp integrations later for office and friend groups.

Controls:

- Players must opt in to notification channels.
- Players can choose quiet mode, daily digest, or major alerts only.
- Commissioners can turn notifications on/off by pool.
- Notifications should never reveal hidden picks before lock.

### Pool Conversation Feed

MVP concept:

- A pool-specific feed attached to the leaderboard and projections pages.
- Members can post comments, chirps, reactions, and match-day thoughts.
- Posts can include text, simple reactions, and optional GIF/image support later.
- System posts can announce major leaderboard events, such as "Patryk moved into first" or "Rana is back in payout range."
- Commissioner can pin announcements.

Moderation and safety:

- Commissioner can delete posts.
- Commissioner can mute or remove members.
- Allow a "friendly chirping" tone, but include basic abuse reporting and blocked-word controls for public/corporate pools.
- Corporate/fundraiser pools can disable the feed or limit it to commissioner announcements.
- Keep conversation separate from official scoring and audit logs.

## Side Bet Challenges

Pool members may want to make friendly side challenges against each other as the tournament unfolds. This should be treated carefully because real-money wagering can create legal, payment, age, tax, and compliance issues.

MVP-safe concept:

- Let a player propose a side challenge to another player or to the pool.
- Challenges can be tied to upcoming matches, group outcomes, player rankings, or tournament outcomes.
- Examples:
  - "Canada beats Switzerland."
  - "Brazil wins Group C."
  - "I finish ahead of Mike B after the group stage."
  - "Spain reaches the final."
- Other users can accept, decline, or comment.
- The app tracks the challenge terms, participants, outcome, and bragging-rights result.
- No money collection, escrow, payout processing, or settlement in the MVP.

Possible challenge types:

- Match winner.
- Exact score.
- Total goals over/under.
- Team advances from group.
- Team reaches a stage.
- Player-vs-player leaderboard finish.
- Payout-position finish.
- Custom commissioner-approved challenge.

Controls:

- Commissioners can enable or disable side challenges per pool.
- Commissioners can require approval before a challenge goes live.
- Players can only challenge members of the same private pool.
- Hidden picks must not be exposed through suggested challenge text.
- Add clear labels such as "friendly challenge" or "bragging rights" if the product is not handling money.
- If real-money side bets are ever considered, they must be handled as a separate regulated product discovery track.

## Differentiators To Protect

- Clear commissioner workflow, not just a leaderboard.
- No-app-required mobile web experience.
- Transparent scoring and audit history.
- Pool-type templates with plain-language rules.
- Pool customization that makes each group feel like it has its own event.
- Social features that make private pools feel alive: alerts, reactions, and friendly chirping.
- Optional side challenges for bragging rights around matches, outcomes, and player-vs-player races.
- Projection tools: max possible points, still alive, payout reach, and future scenario explorer.
- Fundraiser and office-friendly setup without handling prize money in MVP.

## Open Product Questions

- Should pool templates be editable before launch, after launch, or both?
- Should picks be hidden until each category locks, or revealed after the first deadline?
- Should duplicate entries be allowed by default?
- Should the commissioner be able to manually override pick locks?
- Which events should be supported immediately after World Cup 2026?
- Should subscriptions be per pool, per tournament, or monthly by commissioner?
