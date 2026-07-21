# Project Dashboard

Internal project tracking dashboard (Customers / Tasks / Blockers / Updates), backed by Supabase.

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

Login is restricted to @contactspace.com accounts via Row Level Security policies on the database (not by blocking sign-in itself) — see the `is_company_user()` Postgres function.
