# How We Build Here — the AI-SDLC

> **📌 Keystone (Rule #1):** *You own every line that merges. If you can't explain and defend the diff, it doesn't merge.* "The AI wrote it" is never an answer.

This page is the operating manual for shipping work on this project. It implements the **AI-SDLC Team Blueprint**. The day-to-day loop below is the whole process — everything else on this page explains *why* each step exists and what enforces it.

**Audience:** every engineer on the team, junior and senior, AI-assisted or not. Read this page before your first ticket.

---

## 1. Why this process exists

This team is mostly junior and heavily AI-assisted, with **one part-time senior reviewer (the lead)** staffing the human gates. Without structure, that combination produces "vibe coding": the AI leads alone, shortcuts accumulate, code gets duplicated, and architectural decisions happen by accident.

This SDLC externalises a senior engineer's judgment into **process + automated rails**, so that:

- **The right path is the easy path; the wrong path is mechanically blocked or escalated.**
- **The human owns every line that merges.** AI implements; a person is accountable.
- **Conflicts are prevented, not resolved** — the system makes them rare and small.
- **Tests are the contract** that pins AI output to the spec.
- **Authored truth is the only source of truth** — specs, ADRs, and this page are authoritative; code maps and AI session memory are not.
- **CI is the authority; local hooks are only convenience.** Enforcement never depends on anyone's local config.
- **Ceremony scales with risk.** A typo and a schema migration do not travel the same path.
- **The process is living** — every gate rejection and near-miss becomes a new rail (lint rule, CI check, ADR, playbook line).

The test for every rule here: *can a junior violate it and still merge?* If yes, it's a suggestion, not a guardrail — and it gets moved into automation.

---

## 2. The platforms — who owns what

Each tool has exactly one job. **Link, never copy** — duplicating content between them guarantees drift.

| Platform | Owns | Does NOT own |
|---|---|---|
| **Jira** | The work ledger and gate workflow: one issue per unit of work (Epics → Stories → Tasks), assignee, risk tier, dependencies (`blocks`/`blocked-by`), WIP limits. Workflow states encode the lifecycle gates. | Specs, plans, ADRs — these are **linked** from the issue, never pasted in. |
| **GitHub** | Code, review, and the mechanical gates: PRs, branch protection, required status checks, CODEOWNERS, merge queue, AI review bot, CI. **Specs, plans, and ADRs live in-repo** (versioned, diff-reviewable, PR'd). | Work state, assignment, prioritisation. |
| **Confluence** (this space) | Team-facing instructions, onboarding, runbooks — narrative documentation that isn't tied to a specific code change. | Anything that gates a merge. |

**The link layer:** the Jira key goes in every branch name (`PROJ-123-short-slug`) and PR title. With the GitHub-for-Jira app, this gives full traceability — **Jira issue ↔ branch ↔ PR ↔ spec ↔ ADR** — and PR merges drive Jira transitions automatically. Every merged line traces back to an approved intent.

### The Jira workflow

```
Backlog → Spec/Plan Review ⛔ → (Arch/ADR Review ⛔, Tier 2 only) → In Progress → In Review ⛔ → Done
```

The ⛔ transitions are **permission-gated to the lead**. You cannot move your own ticket into `In Progress` — the lead approving your spec/plan is what unlocks implementation. This is structural, not honour-system.

---

## 3. Risk tiers — ceremony scales with risk

Every ticket gets a **Risk Tier** at triage. **The tier is assigned by the lead, not self-selected.** Tiering *up* is always free; tiering *down* requires lead sign-off. When in doubt, tier up.

| Tier | Triggers | Process |
|---|---|---|
| **Tier 0 — Trivial** | Copy change, config flip, doc edit, in-policy dependency bump. Isolated, no new surface. | No spec/plan. Branch → small PR → CI green → merge. Bypasses the lead (AI bot + peer merge) once graduation applies — but **never zero review**. |
| **Tier 1 — Standard** | Normal feature or fix inside the existing architecture. No new dependency, boundary, or migration. | **Combined spec+plan** (one lead gate) → build with TDD → PR → AI review → human review. |
| **Tier 2 — Significant** | New module, schema/migration, **any new dependency**, public API/contract change, cross-module edge, auth/security, money-touching code, large codemod/rename ("conflict bomb"). | Full spec **and** plan **and** an ADR, approved at the Arch/ADR gate. Lead closely involved throughout. |

---

## 4. The lifecycle — every change, stage by stage

### Stage 0 — Intake & triage

- All work starts as a **Jira ticket**. Don't start work that isn't a ticket.
- The lead assigns the **risk tier** at triage.
- Claiming a ticket = assigning yourself, **within your WIP limit** (see §7). Wire `blocks`/`blocked-by` so you never stack work on unmerged branches.

### Stage 1 — Spec (Tier 1–2)

- Run the **brainstorming → spec** skill with your AI agent. The output is a spec document in the repo (`docs/superpowers/specs/`), opened as a PR.
- The spec must show **search-before-build**: "I searched for prior art → reusing X / justified building new." Duplication is the classic junior+AI failure; this rail is mandatory.
- **Acceptance criteria must be explicit and testable.** "How will we know it's done?" is answered *before* any code exists. Untestable criteria = bounced at the gate.
- Link the spec from the Jira issue. **Link, never paste.**

### Stage 2 — Plan (Tier 1–2)

- Run the **writing-plans** skill. The plan includes: implementation steps, test plan, backward-compatibility note, and — critically — **PR slicing**.
- **Slicing is a gate:** a plan is not done until it is an ordered list of independently-mergeable slices, each targeting the **~400-line PR cap**. You brainstorm/spec **once** at the epic level; each slice is a small PR riding the approved spec. Small PRs are the *output* of a good plan, not a constraint fought after the fact.
- For Tier 1, spec and plan are reviewed together at **one combined gate**.

### Gate ⛔ — Lead approval

The `Spec/Plan Review → In Progress` Jira transition is lead-only. **Implementation does not start before it.** Tier 2 work additionally passes the **Arch/ADR Review** gate (see §5).

### Stage 3 — Implement

- Branch `PROJ-123-short-slug` off `main`. **One active branch per person.** Isolation is branch + CI, not local worktrees — no worktree fan-out.
- **TDD is the default:** every behaviour named in the spec gets a test. Prefer the pure-core pattern — business logic in isolated, unit-testable modules.
- **Backward compatible by default:** additive/optional schema and contract changes; expand-then-contract for migrations; never break a shipped client. If a change can't be backward compatible, **stop and escalate** before writing it.
- **No drive-by edits** — a PR changes only what its ticket needs.
- **Architecture stop-condition:** if you (or your agent) discover mid-build that you need an unapproved architectural decision — a new dependency, table, cross-module import, pattern — **halt and open an ADR**. You may not "just add it." The build will be red anyway (see §5).

### Stage 4 — Verify

CI runs the full **green suite**: typecheck, lint, unit/integration tests, build, architecture fitness functions, E2E smoke (Playwright per-PR for web; Maestro on-merge/nightly for mobile), and coverage-can't-drop.

- **A red gate is a stop, not a suggestion.** Never `--no-verify`, never bypass a hook, never merge red.
- **No human reviews a red PR.** The green suite is the floor, so human review time goes only to intent and design.

### Stage 5 — Review

1. **Open the PR from the template.** It must carry the **Jira key**, the **Risk tier**, the spec/plan link, the prior-art link, and the Definition-of-Done checklist. The `PR hygiene` CI check fails PRs missing any of these, and enforces the **~400-line cap** (override label exists only for scheduled stop-the-line refactors).
2. **AI first-pass review** runs on every PR — it catches the mechanical 80% (style, obvious bugs, duplication) before a human looks.
3. **Human review** by a code owner (CODEOWNERS routes it). **No self-merge, ever.** The reviewer's judgment focuses on what machines can't check: does the diff match the approved intent, and **are the tests real?** Tautological tests — tests that pass but prove nothing — are the classic junior+AI trap and a specific review check.

### Stage 6 — Integrate

- **Squash-merge only**, via the **merge queue**, with the branch required up-to-date (this stops "two PRs green alone, broken together").
- Branch is deleted on merge. The GitHub↔Jira link drives the ticket to **Done**.
- Merged in **hours, max a day**, from branch creation. A branch idle 2 days is flagged and closed — the long-lived branch is banned.

---

## 5. Architecture & decision control

The architecture defends itself **in CI, not in someone's head**:

- **Architecture-as-code.** Modules are tagged; the allowed dependency graph is declared once; CI **fails** any disallowed edge (module-boundary lint at error). If your agent suggests crossing a boundary, you get a red build, not a review comment.
- **New dependencies are always Tier 2** — ADR + lead approval. CI flags any `package.json` dependency addition. (Version bumps of existing deps go through Renovate/Dependabot as Tier 0.)
- **ADRs** (`docs/adr/`) record every architecturally significant decision, one page each: context / decision / consequences / alternatives rejected. Triggers: new dependency, new DB table/migration, new cross-module edge, new public API, auth/security change, any new pattern.
- **Golden paths.** Use the blessed generators/scaffolding for new services, pages, and tests. Doing it right is *running a generator* — faster than improvising, and correct by construction.
- **Design system rails** (front-end): all colour/spacing comes from the design-tokens package (no hardcoded values — lint-enforced); user-facing copy resolves from the message catalogue (no hardcoded strings); layout uses logical properties only; WCAG 2.2 AA token-contrast is a CI gate. Effect colour (confetti, particles, rarity) is the one sanctioned carve-out.

---

## 6. Definition of Ready & Definition of Done

**Definition of Ready** — a ticket may not enter `In Progress` until:

- [ ] Risk tier assigned (by the lead)
- [ ] Spec/plan approved (Tier 1–2)
- [ ] Acceptance criteria explicit and testable
- [ ] Dependencies identified (`blocks`/`blocked-by` wired)

**Definition of Done** — verified at the review gate, never self-declared (automatable items are CI-enforced; it lives in the PR template and every box is a real gate):

- [ ] Green suite passes (incl. E2E smoke)
- [ ] Acceptance criteria met and linked
- [ ] Architecture boundaries respected (CI)
- [ ] Backward compatibility respected (additive/optional; expand-then-contract)
- [ ] Tests are real (behaviour-covering, not tautological)
- [ ] Docs / help content / E2E regression suite updated if behaviour changed
- [ ] *If UI changed* — design tokens used, message-catalogue copy, direction-agnostic layout, WCAG-AA contrast holds
- [ ] **Promote-to-authored-truth done** — anything important discovered during the work landed in an ADR/spec/this space, not just in one person's AI session memory
- [ ] PR within the ~400-line size cap (or scheduled-refactor override)
- [ ] Jira ticket driven to Done by the merge

---

## 7. Working in parallel — the concurrency rules

These exist to prevent specific, well-known failure modes of parallel AI-assisted work: orphaned worktrees, weeks-stale branches, shared-file claim conflicts, and repo-wide rename conflict-bombs.

- **Trunk-based development.** One task → one branch → one small PR → merged same day → branch deleted. `main` is always green and releasable.
- **WIP limit: 1–2 per person** (everyone starts at 1). One active branch each.
- **Vertical slices, not horizontal layers.** You own a feature end-to-end; module boundaries double as concurrency boundaries, so parallel work rarely touches the same files.
- **Conflict bombs are legislated.** Large cross-cutting changes (renames, codemods, formatting sweeps) are **scheduled "stop-the-line" events** that land alone; everyone rebases after. Tier 2 by definition.
- **Minimise hot files** (barrels, route registries, hand-edited lists) — prefer directory-based discovery and generated files.
- **Conflict playbook:** rebase on `main` → if conflicts, re-run your agent on the conflicted files with *both* versions in context → **if you can't explain the resolution, escalate. Never guess.**

---

## 8. Escalation — "stop and ask a human"

Stopping is **expected and safe**, never a failure. Explicit triggers:

- Any **architecture / dependency / migration / auth / money-touching** change not already approved.
- Any **merge conflict you don't fully understand**.
- Any **spec ambiguity** — pick nothing; ask.
- Any time **the AI suggests something that contradicts these rules** — the rules win; surface it.
- Anything that **cannot be made backward compatible**.

Review turnaround is **batched, not interrupt-driven**: the lead reviews in ~2 fixed windows per day. Latency is bounded, not zero — plan around it (that's what the WIP limit and `blocks` links are for).

---

## 9. Working with AI — the rules of engagement

- **The agent configuration is shared, versioned code.** `CLAUDE.md`, the skills, templates, and generators are committed to the repo and identical for everyone. Clone the repo → your agent knows the rules. Don't maintain a private variant.
- **Source-of-truth taxonomy** — every "memory" surface has exactly one bucket:

| Category | Examples | Trust level |
|---|---|---|
| **Authored truth** | ADRs, specs, `ARCHITECTURE.md`, `CLAUDE.md`, Jira, this space | **The only authority** |
| **Derived index** | Code knowledge graph, Nx project graph | Never trusted as truth; regenerated in CI; a stale index is worse than none |
| **Episodic memory** | AI session memory, personal notes | Personal only — **promote** discoveries into authored truth, never rely on them |

- **You review everything the AI writes before it goes in a commit.** Rule #1 applies: if you can't explain the diff, it doesn't merge — and you shouldn't have committed it.
- Tests pin the AI to the spec: write (or approve) the tests first, then let the agent implement against them.

---

## 10. Onboarding & progressive autonomy

- **The repo is the onboarding.** Clone it, run the setup, and your agent already knows the conventions; the generators and templates exist. Day-1 productive, day-1 safe.
- **Everyone starts at max guardrails:** WIP = 1, Tier-0 tickets only, shadowed by the lead.
- **Autonomy is earned on evidence**, not tenure: e.g. N clean Tier-1 PRs with zero gate rejections unlocks peer-review rights for Tier 0/1. The concrete thresholds are set by the lead.
- **Weekly retro hardens the system:** every gate rejection and near-miss becomes a new rail — a lint rule, a CI check, an ADR, a line on this page. If a rail is wrong, fix the rail (and ADR it if it's Tier 2) — don't route around it.

---

## Quick reference — the loop on one screen

1. Pick a Jira ticket (tier assigned by the lead). Respect your WIP limit.
2. Spec + plan via the skills (Tier 1–2); output lands in the repo, linked from Jira.
3. ⛔ **Lead approves** → ticket moves to In Progress. Not before.
4. Branch `PROJ-123-slug` off `main`. One branch per person.
5. Implement with TDD. Small slices. Backward compatible. Halt on unapproved architecture.
6. Green suite + E2E must pass. Red = stop.
7. PR from the template: Jira key, tier, spec link, DoD checklist, ≤400 lines.
8. AI review → human review (no self-merge).
9. Squash-merge via the merge queue. Ticket auto-moves to Done. Branch deleted.

**When in doubt: tier up, stop, and ask.**
