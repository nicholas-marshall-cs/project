# Project Dashboard — Full Build Summary

**Last updated:** 2026-07-21
**Purpose of this document:** a complete, self-contained record of the custom project-tracking dashboard built for Nick (contactspace.com), covering why it exists, how it's built, exactly what's in the database, how access is locked down, what the automated daily tasks do, and what's still open. Written so it can be dropped into the repo (or a fresh Claude conversation) and used as full context without needing to re-derive anything from chat history.

---

## 1. Why this exists

The original plan was a Google Sheets-based tracker, but no Google Sheets connector is available. Rather than settle for a spreadsheet, this was built as a proper multi-user web app: Postgres database with real row-level auth, a React frontend, and free-tier hosting — scalable to at least 5 editors, no ongoing cost.

Stack chosen after ruling out alternatives: Airtable (5-editor cap on free tier), Notion (single-editor free tier), Smartsheet (no longer free). Landed on:

- **Database + Auth:** Supabase (Postgres, free tier)
- **Frontend:** React + TypeScript + Vite (single-page app)
- **Hosting:** Cloudflare Pages (free, deploys from GitHub on push)
- **Source control:** GitHub, repo `nicholas-marshall-cs/project`

The core complaint driving the latest phase of work: stakeholders felt Nick "neglected to update things daily." The fix isn't just automation — it's a system that forces a daily touchpoint even when nothing changed, while keeping Nick in control of what actually goes live (nothing is auto-published to the visible status feed).

---

## 2. Architecture overview

```
Slack ─┐
       ├─► Scheduled task (slack-sync) ──► Supabase (tasks/blockers/updates/spotlight)
Jira ──┘                                         ▲
                                                  │
Slack + Jira ──► Scheduled task (daily-status-drafts) ──► Supabase (status_drafts, "Review" queue)
                                                  │
                                    Nick approves/dismisses in-app
                                                  │
                                                  ▼
                                    React dashboard (Cloudflare Pages)
                                    ◄── reads/writes via Supabase client SDK, RLS-gated
```

- Two Claude scheduled tasks do the automated data gathering (details in section 6).
- The React app (`dashboard-app`) is the only thing end users touch. It talks directly to Supabase using the public "publishable" key — safe to expose because all access is gated by Postgres Row Level Security (RLS), not by hiding the key.
- Access is currently locked to **one email address**: `nick@contactspace.com`. No one else can complete login, not just "can't see data" — enforced at the Supabase Auth level (section 5).

---

## 3. Repository

- **GitHub repo:** `github.com/nicholas-marshall-cs/project` (private assumed — verify)
- **Local clone (as of this update):** `C:\dev\project` (moved out of the OneDrive-synced `C:\Users\nick\OneDrive\Documents\SE\Project\Project-Dashboard\project\dashboard-app` folder — OneDrive was intermittently locking `.git\index.lock`, blocking commits. The repo root now sits directly at `C:\dev\project`, no `dashboard-app` subfolder — that name only ever referred to the old local clone directory, not a path inside the repo itself.)
- **Commit history (confirmed via `git log`, oldest → newest):**
  1. `076745b` Initial project dashboard app
  2. `79333b7` Add customer roadmap/milestones, spotlight tab, richer task/blocker fields
  3. `a8d1f20` UI overhaul: sidebar nav, overview dashboard, card-based customers, kanban tasks
  4. `7e70bc1` / `3e43b39` Add live Status feed to Overview
  5. `56afe07` Rename Spotlight to Status, add per-customer status history
  6. `4229467` Add Review tab for daily status approvals
  7. Review tab diff view: `previous_text`/`previous_owner` snapshot comparison ("yesterday vs today") plus a `suggested_action` callout for task/milestone suggestions — see section 6 and section 7 for details.
  8. Actionable suggestions: `suggested_type`/`suggested_status` columns + one-click "Add as task/milestone" / "Dismiss" buttons on the suggestion callout — approving writes directly to `tasks` or `customers.milestones` from the app (Nick's click), never from the scheduled task. See section 4/6/7.

### Note on an earlier, separate repo
There was a previous dashboard attempt in a different repo, `project-dashboard` (not `project`). That repo was deliberately left untouched as a fallback/backup. This document and everything below concerns the `project` repo only. Claude has no GitHub connector/read access to verify `project-dashboard`'s contents — check `github.com/nicholas-marshall-cs/project-dashboard/commits/main` directly if you need to confirm it's intact.

### Repo file layout (confirmed via directory listing)
```
project/                   (repo root — was "dashboard-app" locally under OneDrive; now C:\dev\project)
├── README.md
├── PROJECT_SUMMARY.md  — this file (previously untracked in git; now committed so it survives clones)
├── index.html
├── package.json / package-lock.json
├── vite.config.ts, tsconfig*.json, .oxlintrc.json
├── public/
│   ├── favicon.svg
│   └── icons.svg
└── src/
    ├── main.tsx           — React entry point
    ├── App.tsx            — session handling, routes to Login or Dashboard
    ├── App.css            — full design system (CSS variables + component styles)
    ├── index.css
    ├── Login.tsx           — magic-link email login form
    ├── Dashboard.tsx       — the entire app UI (all tabs, all CRUD)
    ├── supabaseClient.ts   — Supabase client init + constants
    ├── types.ts            — TypeScript interfaces for all tables
    └── assets/ (hero.png, vite.svg)
```

### package.json dependencies (confirmed current)
```json
"dependencies": {
  "@supabase/supabase-js": "^2.110.7",
  "lucide-react": "^1.25.0",
  "react": "^19.2.7",
  "react-dom": "^19.2.7"
},
"devDependencies": {
  "@types/node": "^24.13.2",
  "@types/react": "^19.2.17",
  "@types/react-dom": "^19.2.3",
  "@vitejs/plugin-react": "^6.0.3",
  "oxlint": "^1.71.0",
  "typescript": "~6.0.2",
  "vite": "^8.1.1"
}
```
Scripts: `npm run dev`, `npm run build` (runs `tsc -b && vite build`, outputs to `dist/`), `npm run lint` (oxlint), `npm run preview`.

### Local git status note (resolved)
The old OneDrive-synced clone (`...\Project-Dashboard\project\dashboard-app`) repeatedly showed nearly every file as "modified" with 0-byte diffs under `git diff -w` — a line-ending/OneDrive-sync artifact, not real content drift — and eventually threw a stale `.git\index.lock` that blocked commits entirely (OneDrive syncing a live `.git` directory can lock files git needs mid-operation). Fixed by cloning fresh to `C:\dev\project`, outside any synced folder. If similar phantom-diff or lock issues reappear, that's the fix: don't keep `.git` inside a cloud-sync folder (OneDrive, Dropbox, etc.).

---

## 4. Supabase — database schema (live, confirmed via direct query)

**Project ID:** `cmwabhhvrdqugiokfgbs` · **Project name:** "Project Dashboard"
**Client connection** (in `src/supabaseClient.ts`, safe to be public):
```ts
SUPABASE_URL = 'https://cmwabhhvrdqugiokfgbs.supabase.co'
SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_SanORzgTEJP_X-Kttogm4Q_vjGsvwiv'
```

All tables below are in the `public` schema, RLS enabled on all of them **except `sync_state` — flagged, not yet fixed, see below.**

### `customers` (7 rows)
| column | type | notes |
|---|---|---|
| id | uuid, PK | default `gen_random_uuid()` |
| name | text, unique | |
| created_at | timestamptz | default `now()` |
| legacy_id | text, unique, nullable | ties back to the original spreadsheet row |
| owner | text, nullable | |
| type | text, nullable | |
| notes | text, nullable | |
| demo, agreement, handover, roadmap_disc, roadmap_doc, go_live, api_workshop, training, mo_conclusion | date, nullable | the 9 roadmap milestone dates |
| milestones | jsonb, default `'[]'` | array of `{key, label, date?, completed}` |
| jira_epic_key | text, nullable | e.g. `PROJ-809` |

Current 7 customers: **Aeroflow, Facile, Jangl, LegalZoom, McQueens Dairies, Trust Bank, Vertu Motors.**

### `tasks` (8 rows)
id (uuid PK), customer_id (FK → customers), title (text), status (text, default `'Open'`, CHECK in `('To Do','Open','In Progress','Done')`), owner (text, nullable), created_at, updated_at.

### `blockers` (5 rows)
id (uuid PK), customer_id (FK), title (text), type (text, nullable), detail (text, nullable), resolved_at (timestamptz, nullable — null means still open), created_at.

### `updates` (115 rows)
id (uuid PK), customer_id (FK), text (text), author (text, default `'Slack Sync'`), is_system (boolean, default false), created_at.
Note: this is currently a flat, ever-growing log fed by `slack-sync` for anything that isn't a status directive or an auto-closeable task/blocker confirmation. Flagged by Nick as feeling like "a junk area" — not yet redesigned; the Review-tab work (section 6/7) addressed the *status* side of the daily-touchpoint complaint, not this feed. Worth revisiting if it keeps growing unchecked.

### `spotlight` (16 rows) — the live "Status" feed shown on the dashboard
id (uuid PK), customer_id (FK), text (text), owner (text, nullable — `'Us' | 'Customer' | 'Both'`, who currently has the ball), created_at.
**Convention: never UPDATE or DELETE existing rows — always INSERT a new one**, so status history over time is preserved and queryable per customer.

### `allowed_users` (1 row) — the access allowlist
email (text, PK), added_at (timestamptz, default now()). Currently contains only `nick@contactspace.com`. **RLS is enabled with zero policies defined** — meaning this table is completely unreadable/unwritable via the API by anyone, including authenticated users. It can only be edited via the Supabase Dashboard SQL editor (as project owner). This is intentional: the allowlist itself must not be exposed or editable through the app.

### `status_drafts` (8 rows) — the Review queue
id (uuid PK), customer_id (FK), proposed_text (text), proposed_owner (text, default `'Both'`, CHECK in `('Us','Customer','Both')`), source_summary (text, nullable), status (text, default `'pending'`, CHECK in `('pending','approved','dismissed')`), created_at, reviewed_at (nullable), reviewed_by (nullable), **previous_text (text, nullable)**, **previous_owner (text, nullable)**, **suggested_action (text, nullable)**, **suggested_type (text, nullable, CHECK in `('task','milestone')` or null)**, **suggested_status (text, nullable, CHECK in `('applied','dismissed')` or null)**.

The bolded columns were added across this update:
- `previous_text` / `previous_owner` — a snapshot of the most recent `spotlight` entry at the moment the draft was generated, so the Review tab can render an explicit "yesterday vs today" diff instead of just showing today's text in isolation.
- `suggested_action` / `suggested_type` — an optional, lightweight suggestion (e.g. "Training session for Aeroflow", type `milestone`) surfaced alongside the draft. Written as a short label — usable verbatim as a task title or milestone label — not a full sentence. The scheduled task only ever proposes these; it never writes to `tasks` or `customers.milestones` itself.
- `suggested_status` — null until Nick clicks a button in the app. `'applied'` means the suggestion was written to `tasks` (if `suggested_type = 'task'`) or appended to that customer's `customers.milestones` jsonb array (if `'milestone'`), with `key` auto-generated and `completed: false`, for Nick to date/complete later like any other milestone. `'dismissed'` means he declined it. This is tracked independently of the status draft's own `status`/`reviewed_*` fields — approving or dismissing the *status text* and acting on the *suggestion* are two separate decisions, and the suggestion stays actionable in "Recently reviewed" even after the status itself has been approved.

### `sync_state` (6 rows) — **RLS disabled, flagged, not fixed**
Used internally by the scheduled tasks to track sync cursors/state. Supabase's advisor flagged this table as fully exposed (readable/writable via the public API key by anyone) because RLS is off. Not remediated yet — needs a decision on the right policy (likely the same `is_company_user()` pattern as every other table) before running:
```sql
ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;
-- then add a policy, e.g.:
-- CREATE POLICY company_users_all_sync_state ON public.sync_state FOR ALL USING (is_company_user()) WITH CHECK (is_company_user());
```

### Data import
All historical data (7 customers, 6 original tasks, 5 blockers, 11 spotlight rows, 113 updates) was migrated from an uploaded spreadsheet (`Project Dashboard.xlsx`, itself originally built via Claude Projects). Row counts were verified to match the source exactly at import time.

---

## 5. Access control — how login lockdown works

Access went through three tightening stages before landing on the current state:

1. **Domain-suffix check** (`@contactspace.com`) — client-side only, easily bypassed, superseded.
2. **Allowlist-table RLS check** — `is_company_user()` looks up the caller's JWT email in `allowed_users`. This blocks *data access* for non-allowed users but doesn't block them from *completing sign-in* — they'd just see an empty app.
3. **Before-User-Created Auth Hook** (current, final state) — blocks sign-in itself. This was explicitly requested by Nick: "I want to be blunt... not make it available at all," meaning a hard block, not just a data-visibility restriction.

### Current live SQL (confirmed via direct query against the DB)

```sql
create or replace function public.is_company_user()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.allowed_users where email = (auth.jwt() ->> 'email')
  );
$$;
```

```sql
create or replace function public.hook_restrict_signin_to_allowlist(event jsonb)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  email text;
  is_allowed int;
begin
  email := lower(event->'user'->>'email');

  select count(*) into is_allowed
  from public.allowed_users
  where lower(allowed_users.email) = email;

  if is_allowed > 0 then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'message', 'This dashboard is not yet available to your account.',
      'http_code', 403
    )
  );
end;
$$;
```

This hook is wired up manually via **Supabase Dashboard → Authentication → Hooks → "Before User Created"** — there is no API/connector tool for this step, it was done by Nick in the dashboard UI. Grants: `execute` granted to `supabase_auth_admin`, revoked from `authenticated, anon, public`.

### RLS policies (confirmed live, one per table, all identical pattern)
`customers`, `tasks`, `blockers`, `updates`, `spotlight`, `status_drafts`, `notes` each have a single policy `company_users_all_<table>`, `FOR ALL`, `USING (is_company_user())`, `WITH CHECK (is_company_user())`. `allowed_users` has RLS enabled with no policies (fully locked). `sync_state` has RLS **disabled** — see section 4, not yet fixed.

### Cloudflare Access — added then removed
Cloudflare Access (Zero Trust) was set up in front of the Pages site as an extra login layer, then deliberately removed. Reasoning: Access only protects the *frontend static site*, not the Supabase API itself — the publishable key is embedded in the public JS bundle regardless. Stacking Access on top created double-login friction (Nick called it "frustrating") without adding real protection, and worse, could create a false sense of security if RLS were ever loosened to allow the `anon` role (someone could bypass Access entirely by hitting the Supabase REST API directly, e.g. with curl). **RLS tied to an authenticated JWT is the actual security boundary here — this reasoning should hold if access requirements are revisited later.**

### Login flow (`src/Login.tsx` + `src/App.tsx`)
Supabase magic-link (email OTP) via `supabase.auth.signInWithOtp`. `App.tsx` checks `supabase.auth.getSession()` on load and subscribes to `onAuthStateChange`; renders `<Login />` if no session, `<Dashboard session={session} />` if there is one.

---

## 6. Automated scheduled tasks (confirmed live via task list)

Both are Claude scheduled tasks, running server-side, no manual trigger needed day to day.

### `slack-sync--project-dashboard`
- **Schedule:** `0 6 * * *` (06:04 AM daily, with jitter)
- **What it does:** reads each customer's Slack channel for new messages/replies since the last run, and per message:
  1. **Status directive** (highest priority): a message starting with `Status:` / `Status (Us):` / `Status (Customer):` / `Status (Both):` is parsed and inserted directly as a new `spotlight` row (never edits existing rows).
  2. If a message plainly and un-negated confirms completion of an existing open task/blocker ("done", "closed", "resolved") — auto-applies: `tasks.status = 'Done'` or `blockers.resolved_at = now()`.
  3. If task/blocker-relevant but no confident match — logs as a new row in `updates` (never auto-creates new tasks/blockers).
  4. Irrelevant small talk — ignored, not logged.
- **Channel → customer mapping:** `proj-aeroflow`→Aeroflow, `live-facile`→Facile, `proj-legalzoom`→LegalZoom, `proj-mcqueens-dairies`→McQueens Dairies, `proj-trust`→Trust Bank, `proj-vertu`→Vertu Motors. (Jangl has no assigned channel yet.)
- Produces a run summary of what was auto-applied vs. logged.
- Full prompt lives at `C:\Users\nick\Claude\Scheduled\slack-sync--project-dashboard\SKILL.md`.
- **Known open complaint:** the `updates` table this feeds is a flat, ever-growing log — Nick described it as feeling like "a junk area." Not yet redesigned (see `updates` table note in section 4).

### `daily-status-drafts`
- **Schedule:** `30 6 * * *` (06:38 AM daily, with jitter) — runs right after the Slack sync so it has fresh data.
- **Why it exists:** direct response to the "neglected to update things daily" feedback. Guarantees a status check-in every single day per customer — even a "confirmed unchanged" heartbeat — without auto-publishing anything. Nick reviews and approves each one in the app's **Review** tab.
- **Per-customer logic (updated):**
  1. Skip if a `status_drafts` row with `status='pending'` already exists for that customer (don't pile up unreviewed drafts).
  2. Pull last 24–48h of Slack activity from the mapped channel.
  3. Pull Jira child tasks under the customer's epic via JQL `parent = <epic_key> ORDER BY updated DESC`, applying the confirmed noise filter: **ignore any task with an empty description AND status = 'To Do'** (unstarted template boilerplate) — everything else counts as signal. Jira calls are issued **sequentially, not in parallel** — the Atlassian MCP connector was observed returning duplicated/wrong-customer data when multiple `searchJiraIssuesUsingJql`/`getJiraIssue` calls were batched together in one turn; each call's returned issue key is verified against what was requested before the data is used.
  4. Checks the most recent `spotlight` and `status_drafts` entries for continuity — the exact text/owner of the latest `spotlight` row is captured verbatim (not paraphrased) so it can be snapshotted into the new draft's `previous_text`/`previous_owner` columns.
  5. Also checks open `tasks` and `customers.milestones` for the customer; if something gathered from Slack/Jira clearly isn't tracked yet (a newly-confirmed date, a new piece of work, a milestone being locked in), writes ONE short, label-shaped suggestion: `suggested_action` (e.g. "Training session for Aeroflow", not a full sentence) + `suggested_type` (`'task'` or `'milestone'`) — both null together on most days, never forced, never one without the other.
  6. Writes exactly one new `status_drafts` row: `proposed_text`/`proposed_owner`/`source_summary` as before, plus `previous_text`, `previous_owner` (snapshot from step 4), and `suggested_action`/`suggested_type` (from step 5, or both null). `suggested_status` is always left null by this task.
  7. Never writes to `tasks`, `blockers`, `customers.milestones`, or `spotlight` directly — only inserts into `status_drafts`. The live `spotlight` feed only gets written to when Nick clicks **Approve** in the app. Task/milestone creation from a suggestion is a one-click action Nick takes in the Review tab (**"Add as task/milestone"** / **"Dismiss"** on the suggestion callout) — the scheduled task never creates a task or milestone under any circumstance.
- **Customer → Slack channel → Jira epic mapping** (confirmed 1:1 match via JQL search):
  | Customer | Slack channel | Jira epic |
  |---|---|---|
  | Aeroflow | #proj-aeroflow | PROJ-809 |
  | Facile | #live-facile | PROJ-182 |
  | LegalZoom | #proj-legalzoom | PROJ-639 |
  | McQueens Dairies | #proj-mcqueens-dairies | PROJ-841 |
  | Trust Bank | #proj-trust | PROJ-518 |
  | Vertu Motors | #proj-vertu | PROJ-670 |
  | Jangl | *(no known channel)* | PROJ-559 |
- Full prompt lives at `C:\Users\nick\Claude\Scheduled\daily-status-drafts\SKILL.md`.

### Outstanding for both tasks
Click **"Run now"** once on each from the Scheduled section so Slack/Jira/Supabase tool access gets pre-approved and stored on the task — otherwise the first live run can pause on a permission prompt instead of completing automatically.

---

## 7. Frontend app structure (`Dashboard.tsx`, confirmed against live file)

Single component tree, tab-based nav. Tabs (`type Tab`):

```ts
'overview' | 'review' | 'customers' | 'tasks' | 'blockers' | 'status' | 'updates' | 'notes' | 'users'
```

- **Overview** — stat cards (customer count, open tasks, open blockers, upcoming go-lives), a live Status feed table (latest spotlight entry per customer), upcoming go-lives list, customer progress card grid.
- **Review** — lists pending `status_drafts` as editable `DraftCard`s. Each card shows, above the editable text: an explicit **"yesterday vs today" diff** (`previous_text`/`previous_owner` vs `proposed_text`/`proposed_owner`, with an arrow icon if changed or an equals icon if not — amber accent for changed, green for unchanged), and, if present, a **suggestion callout** (`SuggestionBlock` component — lightbulb icon, amber tint) with its own **"Add as task/milestone"** and **"Dismiss"** buttons, independent of the main draft's approve/dismiss. Clicking "Add as task" inserts into `tasks`; "Add as milestone" appends `{key: 'm_'+timestamp, label: suggested_action, completed: false}` to that customer's `customers.milestones` jsonb array (date left blank — Nick fills it in via the existing milestone date field in Customers). Either action sets `suggested_status` on the draft to `'applied'`; the callout then renders as a resolved, checkmarked confirmation instead of buttons. "Dismiss" on the suggestion sets `suggested_status = 'dismissed'` and renders muted with an X. The status-text approve button reads "Confirm" instead of "Approve" when nothing actually changed. **Approve** inserts into `spotlight` + marks the draft `approved`, `reviewed_by`, `reviewed_at`; **Dismiss** marks `dismissed`. Nav shows a badge with the pending count. A "Recently reviewed" section shows past decisions below — `SuggestionBlock` also renders there, so a suggestion attached to an already-approved/dismissed draft (e.g. Nick approved the status first, dealt with the suggestion later) is still actionable, not lost.
- **Customers** — card grid; click to expand into notes, the 9-stage milestone grid (toggleable), and a per-customer Status subsection (last 5 history entries + inline add-status form).
- **Tasks** — kanban board grouped by status column.
- **Blockers** — card list, left-border colour coded, resolve toggle.
- **Status** (renamed from "Spotlight") — add-status form (Us/Customer/Both selector + text) plus the full historical feed table.
- **Updates** — plain log view. Flagged by Nick as feeling like clutter; not yet redesigned (see section 4/6 notes on `updates`).
- **Notes** — freeform per-customer notes, separate from status.
- **Users** (admin only) — manage `allowed_users` (email, role).

Key state/functions in `Dashboard.tsx`: `loadAll()` (parallel fetch of all tables), CRUD helpers (`addCustomer`, `addTask`, `setTaskStatus`, `addBlocker`, `toggleBlockerResolved`, `addUpdateNote`, `addNote`, `addSpotlight`, `toggleMilestone`/`updateMilestone`, `approveDraft`, `dismissDraft`, user-management helpers). Milestone stage list (`STAGES`) covers: Demo, Agreement signed, Handover, Roadmap discussion, Roadmap doc sent, Go live, API workshop, Training, MO conclusion.

`StatusDraft` type (`src/types.ts`) now includes `previous_text: string | null`, `previous_owner: string | null`, `suggested_action: string | null` alongside the original fields.

Styling: `App.css` is a full CSS-variable-based design system (`--bg, --surface, --border, --text, --text-muted, --text-faint, --accent, --accent-light, --accent-text, --green, --red, --red-bg, --amber, --amber-bg, --radius, --radius-sm, --shadow`) built across several redesign passes — sidebar shell, stat cards, customer cards, kanban, blocker cards, feed/status table, draft cards, and now the draft-diff/suggestion blocks (`.draft-diff`, `.draft-diff.changed`, `.draft-diff.unchanged`, `.draft-diff-row`, `.draft-diff-sep`, `.draft-suggestion`).

---

## 8. Hosting / deployment

- **Cloudflare Pages**, connected via GitHub Git integration (auto-deploys on push to `main`).
- Build settings: Framework preset **Vite** (not VitePress — that's an unrelated docs generator), build command `npm run build`, output directory `dist`, root directory `/`.
- Earlier direct-upload deploys (drag-and-drop `dist/`) were used before Git integration was set up; Git integration is now the standing method.

---

## 9. Known open items / not yet verified

- **`sync_state` table has RLS disabled** — flagged by Supabase's advisor as fully exposed via the public API key. Not remediated; needs a policy decision (see section 4).
- **`updates` tab / table feels like "a junk area"** (Nick's words) — a flat, ever-growing log fed by `slack-sync` for anything that isn't a clean status directive or auto-closeable task/blocker. The Review-tab diff/suggestion work addressed the *status* side of the daily-touchpoint complaint; this separate feed hasn't been tightened yet. Worth a follow-up pass if it keeps growing unchecked.
- **Confirm `daily-status-drafts` produces sensible output** with the new diff/suggestion fields after a few more live runs — worth periodically sanity-checking the `suggested_action` notes and owner classification in the Review tab.
- **Pre-approve tool access** on both scheduled tasks via "Run now" if not already done (see section 6).
- **`README.md` is slightly stale** — it currently describes access as "restricted to @contactspace.com accounts... via RLS," which was true at an earlier stage but is now superseded by the single-email allowlist + sign-in-blocking auth hook (section 5). Worth a quick update if the README is meant to be a reliable reference.
- **Jangl has no assigned Slack channel** — both scheduled tasks will simply skip Slack signal for Jangl until one is mapped (Jira signal still works via PROJ-559).
- **No GitHub connector exists** in this environment — all git push/pull operations must be run manually by Nick from his local clone; nothing here executes git directly.
- **Verify the `project-dashboard` repo (the earlier, separate attempt) is untouched**, if that still matters — Claude has no read access to confirm this, only Nick can check via GitHub directly.
- **Local clone moved from OneDrive to `C:\dev\project`** to resolve recurring `.git\index.lock` failures and phantom line-ending diffs caused by OneDrive syncing a live `.git` directory. If a similar repo needs to be cloned again in future, clone outside any cloud-sync folder from the start.

---

## 10. Quick reference

- Supabase project: `cmwabhhvrdqugiokfgbs` ("Project Dashboard")
- GitHub repo: `nicholas-marshall-cs/project`
- Local clone: `C:\dev\project` (moved off OneDrive — see section 3/9)
- Live site: Cloudflare Pages, auto-deployed from `main`
- Allowed login: `nick@contactspace.com` only, hard-blocked at sign-in for anyone else
- Scheduled tasks: `slack-sync--project-dashboard` (06:04 daily), `daily-status-drafts` (06:38 daily)
