# AGENTS.md

## Architecture
- `public/` — static frontend (no build step). Each page is an HTML file plus a script in `public/js/`. `js/app.js` is loaded first on every page and provides `api()`, `esc()`, date formatters, `badge()`, `toast()`, `ICONS`, and renders the nav + footer. Elements with `data-icon="name"` are replaced by the matching SVG from `ICONS`.
- `netlify/functions/*.mts` — one function per API resource, routed with `config.path` under `/api/*`. `api-not-found.mts` returns JSON 404s for unknown `/api/*` routes; add any new route to its `excludedPath`.
- `netlify/lib/http.ts` — shared `handle()` wrapper (method check, ApiError → JSON, Postgres unique violation → 409, no stack traces), UID normalization/validation.
- `db/schema.ts` + `db/index.ts` — Drizzle schema and client (`drizzle-orm/netlify-db`). Migrations live in `netlify/database/migrations/`; the second migration seeds demo data.
- `esp32/` — Arduino firmware calling `POST /api/verify-card` over HTTPS.

## Conventions
- API responses always have `success` and use snake_case keys (the ESP32 firmware and frontend depend on them: `authorized`, `name`, `room`, `reason`).
- UIDs are stored normalized: uppercase hex, no separators (`04A7B29183`).
- User IDs are `USR` + zero-padded number, generated in `register.mts` with a retry on collision. The Netlify DB HTTP driver is used without transactions, so multi-step writes are ordered to be safe and compensate on failure.
- `access_logs.source` is `READER`, `WEB_NFC` or `MANUAL`.
- Timestamps are `timestamptz` and returned as ISO strings; "today" stats take the browser's local midnight as `since`.
- Schema changes: edit `db/schema.ts`, then `npx drizzle-kit generate --name <change>`. Never edit applied migrations.
- Design: dark ink / ivory / brass palette, Cormorant Garamond (display), Hanken Grotesk (body), IBM Plex Mono (data). Tokens are CSS variables at the top of `public/css/styles.css`.

## Next steps
See the Roadmap in README.md — warden authentication is the top priority.
