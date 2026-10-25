# Sunroom

**Live app:** [Book a Sunroom session](https://sunroom-studio-241026.undisputedvalue.chatgpt.site)

A small, full-stack booking app for a tanning studio with one bed. Visitors choose a date, session length, and time, then reserve the session with their name and email. The studio publishes availability from **Manage studio**. No accounts are needed. Google Calendar checks and Gemini notes use optional server credentials; the core app runs without them.

**New to the code?** Read the [step-by-step code guide](docs/code-guide.md) for the technologies, file map, request flow, database protection, integrations, and tests.

## Run locally

Requires **Node.js 22.13+** (Node 24 works) and npm. Windows, macOS, and Linux are supported. No Cloudflare account or separate database server is needed for local development.

```sh
npm ci
npm run build
npm run db:migrate
npm run dev
```

Open the Local URL printed by the server, normally **http://127.0.0.1:5173**. The first visit seeds ten days of sample availability once. Local data lives in `.wrangler/state` and survives browser refreshes and server restarts. Local and hosted data are separate.

`npm run db:migrate` tracks applied migrations and is safe to repeat. After a schema change, run `npm run db:generate`, build, and migrate again. To preview the production build locally, run `npm start` and open its printed URL.

## What it does

- Responsive React/TypeScript booking page with calendar and list views.
- Duration filters for common 10, 15, and 20 minute sessions.
- Host view to publish a date, start time, and duration (1–60 minutes), or remove an unbooked slot.
- Server validation of dates, times, durations, names, and email addresses.
- Atomic database protection against double bookings and overlapping availability for Bed 01.
- Booked sessions stay visible as unavailable, with live refresh every 20 seconds and on window focus.
- Confirmation screen with a prefilled Google Calendar link and a separate `.ics` download. The visitor reviews and saves the Google event; no email is sent.
- Read-only Google Calendar FreeBusy integration marks conflicting slots unavailable and rechecks at booking time.
- A receipt-protected Gemini endpoint generates a friendly note in a chat panel beside the booking confirmation, caches it per booking, and clearly labels the standard fallback if the model is unavailable. The panel stacks below the session on phones.
- One explicitly labelled studio time zone: **UTC**, independent of the visitor's device.

## Connect Google Calendar and Gemini

Follow [the integration setup guide](docs/integrations.md). Copy `.dev.vars.example` to `.dev.vars` and add the studio calendar ID, service account email/private key, and Gemini API key. Share the calendar with the service account using free/busy access. Use a Google AI Studio **Free** project without paid billing. Configure the same values as secret runtime variables when hosting.

No guest names, emails, booking dates or calendar event details are sent to Gemini. The UI shows a standard note immediately; the AI note loads after the booking is safely saved. Each receipt permits one generation attempt, with retries returning the cached result. Configured calendar errors block new bookings with 503 instead of treating unknown availability as free.

Google events can change immediately after the final check: external Calendar writes are not transactional with D1. This version reads availability and does not create Google Calendar events.

## Stack and choices

React 19 and TypeScript on Vinext (a Vite-based implementation of the Next.js App Router), deployed as a Cloudflare Worker. API handlers run on the server. Cloudflare D1 provides persistent SQLite storage; Drizzle defines the schema and generates committed SQL migrations. Local development uses the same SQL engine through Miniflare.

I chose a single deployment and a small SQL schema so the complete app can run locally without Docker or external credentials. NestJS and PostgreSQL would also work, but add infrastructure this one-resource app does not need.

Booking is **one conditional SQL update**, not a client-side availability check:

```sql
UPDATE slots
SET booked_at = ?, guest_name = ?, guest_email = ?
WHERE id = ? AND booked_at IS NULL AND starts_at > ?
RETURNING id, starts_at, duration;
```

D1 serializes writes. One request changes the row; concurrent losers receive HTTP **409**. Publishing uses an atomic `INSERT ... SELECT ... WHERE NOT EXISTS` interval check, so overlapping slots cannot be created concurrently. Adjacent sessions are allowed. Guest contact details are never returned by the availability API.

## API

| Method | Route                | Purpose                                                                           |
| ------ | -------------------- | --------------------------------------------------------------------------------- |
| GET    | `/api/slots`         | Future slots and their booked status; excludes guest details                      |
| POST   | `/api/slots`         | Publish `{ date: "YYYY-MM-DD", time: "HH:mm", duration: 15 }`                     |
| DELETE | `/api/slots/:id`     | Remove an unbooked slot; booked slots return 409                                  |
| POST   | `/api/bookings`      | Book `{ slotId, name, email }`; return confirmation                               |
| POST   | `/api/confirmations` | Generate/read a saved note with `{ slotId, token }`; requires the booking receipt |
| GET    | `/api/integrations`  | Configuration status only; never returns credentials                              |
| POST   | `/api/setup`         | Transactional one-time sample availability bootstrap                              |

Validation errors return 400, conflicts return 409, and successful creation returns 201. All API responses disable caching. The bootstrap never resets bookings or replenishes removed slots.

## Code map

- `app/sunroom.tsx`: page state, API requests, and the booking flow.
- `components/`: calendar, slot list, studio card, management view, and dialogs. The starter's optional `components/ui/` library is retained but not used by Sunroom.
- `app/api/`: small route handlers with server-side validation.
- `lib/booking.ts`: shared time formatting, date validation, and calendar export.
- `lib/api.ts`: database access, request validation, and error responses.
- `db/schema.ts` and `drizzle/`: schema and versioned SQL migrations.
- `lib/integrations/`: Google OAuth/FreeBusy and Gemini HTTP clients with validation and deadlines.
- `lib/reservations.ts` and `lib/confirmations.ts`: booking rechecks, receipt authorization and persistent generation caching.
- `tests/providers.test.mjs` and `tests/reservations.test.mjs`: provider contract and isolated SQLite integration tests.
- `tests/api.test.mjs`: HTTP integration coverage of bookings, publishing and confirmations.
- `scripts/`, `worker/`, and connector helpers: retained hosting starter infrastructure.

## Verify

```sh
npm run typecheck
npm test
npm run build
# With npm run dev running in another terminal:
npm run test:api
```

`npm test` runs 33 deterministic tests against fake provider HTTP responses, real isolated SQLite databases, and the Cloudflare Worker runtime. Coverage includes RSA JWT verification, token refresh, overlap boundaries, fail-closed calendar errors, stale availability, Gemini failure cases, receipt authorization, concurrent bookings, generation caching, Worker-compatible HTTP requests, rejecting redirects without forwarding credentials, and calendar links across UTC date boundaries without private booking data. It makes no external API calls.

GitHub Actions runs type checking, these tests, the production build, migrations, and the HTTP API tests on pushes and pull requests. CI never receives Google credentials or makes live model calls.

`npm run test:live` separately calls the real Google APIs using `.dev.vars`. Missing credentials are reported as **skipped**, not verified. Use a Free-tier AI Studio project; the Gemini live test makes one model request. See [the guide](docs/integrations.md) for a real busy-event check.

The HTTP integration test creates local test records (including one permanent sample booking per run). It refuses non-local URLs. It checks invalid input, overlapping slots, five simultaneous publishing requests, eight simultaneous booking requests (one succeeds, seven receive 409), booked-slot deletion protection, and absence of contact details in public responses.

If `GET /api/slots` fails, the HTTP test stops with the status and availability error before creating test records. A selected slot cannot enable Continue while availability cannot be verified. Check the error banner and retry after resolving the Calendar or database connection.

Manual browser checks cover publishing, selecting a session, booking, the disabled booked state, the confirmation screen, and the calendar download. Availability persists on disk, rather than in React state or localStorage.

## Deployment

The Sites hosting manifest is `.openai/hosting.json`. Sites provisions the D1 database and applies the committed migrations before deploying the Worker. There are no secrets in this repository. Google Calendar and Gemini credentials belong in secret runtime variables, not the manifest or source. Both features report an unconfigured state until credentials are supplied. Generated builds, local runtime state, credentials, and the local database are ignored by Git.

Source is published at [JordanceE/Booking-for-a-tan-saloon](https://github.com/JordanceE/Booking-for-a-tan-saloon). The Sites hosting repository is separate; its source commit and GitHub commit can differ while containing the same application files.

## AI tools used

Built with **OpenAI Codex** and the **Sites** starter/workflow. Codex assisted with the interface, TypeScript implementation, SQL race-condition handling, documentation, and checks. No other coding assistants were used. The confirmation endpoint calls `gemini-3.5-flash-lite`, which has a [free tier](https://ai.google.dev/gemini-api/docs/pricing). Use an unbilled AI Studio project to avoid charges. The model is never needed to reserve a slot, and no paid-only fallback model is used.

## With more time

Add host-only authorization and rate limiting, cancellation/rescheduling links, email delivery with an outbox, studio-configurable time zones, pagination, and automated browser tests. Future Calendar work could create events after bookings, reconcile external changes, and handle cancellations.

This follows the brief's no-login assumption: **studio management endpoints are open to visitors**, so this is an interview/demo app rather than a production access-control model. Guest email addresses are stored for the booking but not exposed by any read endpoint. Production use should add host authorization and a guest-data retention policy before accepting real customers.
