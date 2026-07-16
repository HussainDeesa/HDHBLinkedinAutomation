# LinkedIn Automation

A self-hosted, single-user / small-team web app for managing LinkedIn outreach
campaigns — account management, lead search & import, multi-step campaign
sequences (connect → wait → message), templates, a live activity log, and a
background automation worker built on Playwright with a stealth plugin.

---

## ⚠️ Disclaimer — read this first

> **Automating LinkedIn violates [LinkedIn's User Agreement](https://www.linkedin.com/legal/user-agreement).**
> Using this software can get your LinkedIn account **temporarily restricted or
> permanently banned**, and may expose you to legal liability.
>
> This project is provided **as-is, for educational and authorized internal use
> only**, with **no warranty**. You are solely responsible for how you use it,
> including compliance with LinkedIn's terms, anti-spam and data-protection laws
> (e.g. GDPR, CAN-SPAM), and obtaining the consent of the people you contact.
>
> Use conservative limits, keep a human in the loop, and only use a LinkedIn
> account you are willing to lose. The authors accept no responsibility for
> account bans, data loss, or any other consequences.

The app shows this disclaimer in a **blocking first-run modal** that must be
acknowledged before use.

---

## Tech stack

| Layer        | Choice                                                      |
| ------------ | ----------------------------------------------------------- |
| Framework    | Next.js 14 (App Router, TypeScript strict)                  |
| Database     | Prisma + SQLite (swappable to Postgres)                     |
| UI           | Tailwind CSS + shadcn/ui + lucide icons                     |
| Automation   | Playwright + playwright-extra + puppeteer stealth plugin    |
| Queue        | In-process, DB-backed job table + poll loop (no Redis)      |
| Realtime     | Server-Sent Events (`/api/activity/stream`)                 |
| Auth         | NextAuth (credentials provider)                             |
| Validation   | Zod                                                         |
| Crypto       | AES-256-GCM for stored LinkedIn passwords & cookies         |

---

## Quick start

```bash
npm install
npx playwright install chromium       # download the browser
cp .env.example .env                  # then edit the secrets (see below)
npx prisma migrate dev                # create the SQLite DB + tables
npx prisma db seed                    # app user, settings, sample templates

npm run dev                           # Next.js app  → http://localhost:3000
npm run worker                        # background worker (separate terminal)
```

Log in with the seeded credentials (`SEED_USER_EMAIL` / `SEED_USER_PASSWORD`,
defaults `admin@example.com` / `changeme123`).

### Required environment variables (`.env`)

```ini
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="..."     # openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3000"
ENCRYPTION_KEY="..."      # openssl rand -hex 32  (exactly 64 hex chars)
SEED_USER_EMAIL="admin@example.com"
SEED_USER_PASSWORD="changeme123"
```

Generate the secrets:

```bash
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
```

> `ENCRYPTION_KEY` **must be 64 hex characters** (32 bytes). If you change it
> later, previously stored LinkedIn passwords/cookies can no longer be
> decrypted and accounts must be re-added.

---

## How it works

```
┌────────────┐     enqueue Job        ┌─────────────┐
│ Next.js    │  ───────────────────▶  │  SQLite /   │
│ web server │                        │  Postgres   │
│ (API + UI) │  ◀─── SSE poll ──────  │  (Job,      │
└────────────┘                        │  Activity)  │
      ▲                               └─────────────┘
      │ SSE                                  ▲
      │                                      │ poll + write
┌────────────┐   Playwright + stealth   ┌────┴────────┐
│  Browser   │  ◀────────────────────   │   Worker    │
│ (operator) │                          │  process    │
└────────────┘                          └─────────────┘
                                               │
                                          LinkedIn.com
```

- The **web app** handles all CRUD and enqueues one-off work (search runs,
  logins) into a `Job` table. It never drives the browser directly.
- The **worker** (`npm run worker`) is a standalone Node process. It:
  - drains the `Job` queue (searches, interactive logins),
  - polls `CampaignLead` rows that are `pending` and due (`nextActionAt <= now`),
  - respects per-account daily connect/message limits (reset at the account's
    local midnight),
  - schedules the next step using each step's `delayDays`,
  - drives **one Playwright browser context per LinkedIn account**, reused
    across actions, with the stealth plugin, randomized viewport, human-like
    mouse movement and randomized delays (2–8s between actions, 8–20s between
    profiles),
  - writes every action to the `Activity` table, which the UI streams live.
- **CAPTCHA / checkpoint detection** pauses the account and surfaces an alert.
- **Selector failures** dump the page HTML + a screenshot to `logs/` for
  review (all LinkedIn selectors live in `src/lib/linkedin/selectors.ts`).

### First-time account login (2FA / CAPTCHA)

Adding an account stores its credentials (password encrypted at rest). Click
**Login** on the Accounts page — this enqueues a **headed** login job. The
worker opens a visible Chromium window so you can complete 2FA / solve a
CAPTCHA by hand; the session cookies are then saved (encrypted) and reused.
Run the worker on a machine with a display for this step (set
`headless = false` in Settings, the default).

---

## Pages

| Route         | What it does                                                            |
| ------------- | ----------------------------------------------------------------------- |
| `/`           | Dashboard — stat cards, live activity, active campaigns, limit usage    |
| `/accounts`   | Add / login / pause / delete LinkedIn accounts, status & daily counts   |
| `/searches`   | Build & save people searches, run them to populate leads                |
| `/leads`      | Filter/sort/search leads, CSV import & export, bulk → add to campaign   |
| `/campaigns`  | Campaign list, 5-step create wizard, per-lead detail + start/pause      |
| `/templates`  | Connection-note & message templates with live preview + 300-char meter  |
| `/activity`   | Live + filterable activity log, color-coded, CSV export                 |
| `/settings`   | Daily limits, delays, headless toggle, default proxy, DB backup/restore |

---

## Project layout

```
prisma/            schema.prisma, seed.ts
src/
  app/             routes (auth, dashboard pages) + /api routes
  components/      ui/ (shadcn primitives) + feature components
  lib/
    linkedin/      browser, auth, search, connect, message, selectors, utils
    queue/         index (enqueue), worker (engine), jobs/
    prisma.ts crypto.ts sse.ts activity.ts limits.ts api.ts client.ts csv.ts
  workers/start.ts standalone worker entrypoint
sessions/          encrypted Playwright session state (gitignored)
logs/              DOM/screenshot dumps on selector failure (gitignored)
```

---

## Switching to Postgres

1. In `prisma/schema.prisma`, change the datasource:
   ```prisma
   datasource db { provider = "postgresql"; url = env("DATABASE_URL") }
   ```
2. Point `DATABASE_URL` at your Postgres instance.
3. `npx prisma migrate dev && npx prisma db seed`.

A ready-to-use `docker-compose.yml` (Postgres + web + worker) is included —
set `NEXTAUTH_SECRET` and `ENCRYPTION_KEY` in your environment, then
`docker compose up --build`. (Interactive headed login is best run on the host.)

---

## Production notes

- Run the worker under a supervisor: `pm2 start "npm run worker" --name li-worker`.
- Keep daily limits conservative (the defaults are 20 connects / 50 messages).
- `sessions/` and `logs/` may contain sensitive data — they are gitignored;
  back them up securely or not at all.
- Settings → **Backup** downloads the SQLite DB; **Restore** replaces it
  (a `.pre-restore` safety copy is kept). Restart the app + worker afterward.

---

## Security

- App access requires login (NextAuth credentials, bcrypt-hashed passwords).
- LinkedIn passwords **and** session cookies are encrypted at rest with
  AES-256-GCM (`ENCRYPTION_KEY`).
- Passwords and cookies are never written to logs.
- All API routes require an authenticated session; request bodies are validated
  with Zod.

---

## Screenshots

_Add screenshots here once running:_

| Dashboard | Campaign builder | Activity log |
| --- | --- | --- |
| ![Dashboard](docs/screenshot-dashboard.png) | ![Campaigns](docs/screenshot-campaign.png) | ![Activity](docs/screenshot-activity.png) |

---

## License

Provided as-is for educational purposes. No warranty. Use at your own risk and
in compliance with all applicable terms and laws.
