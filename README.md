# Kestrel

Internal project tracking dashboard (Customers / Tasks / Blockers / Updates), backed by Supabase. Formerly known as "Project Dashboard" / "dashboard-app" / "Compass".

## Local development

```
npm install
npm run dev
```

## Build

```
npm run build
```

Output goes to `dist/`.

## Deploying on Cloudflare Pages (Git integration)

When connecting this repo in Cloudflare Pages, use these build settings:

- Framework preset: **Vite**
- Build command: **npm run build**
- Build output directory: **dist**
- Root directory: **/** (leave default, unless you place this repo inside a subfolder)

## Supabase

This app talks to Supabase project `cmwabhhvrdqugiokfgbs`. Connection details (project URL + publishable key) are in `src/supabaseClient.ts` — these are safe to be public, they're the client-side publishable key, not a secret.

Login is restricted to @contactspace.com accounts in two layers: sign-in itself is blocked for other domains by the `hook_restrict_signin_to_allowlist` Auth Hook ("Before User Created"), and once signed in, data access is scoped by Row Level Security policies using the `is_company_user()` Postgres function. Admins can also block/unblock or remove individual users — see `block_dashboard_user`, `unblock_dashboard_user`, `delete_dashboard_user`, and `list_all_dashboard_users`.
