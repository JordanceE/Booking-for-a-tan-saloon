# Sunroom

**Live app:** [Book a Sunroom session](https://sunroom-studio-241026.undisputedvalue.chatgpt.site)

A small, full-stack booking app for a tanning studio with one bed. Visitors choose a date, session length, and time, then reserve the session with their name and email. The studio publishes availability from **Manage studio**. No accounts or API keys are needed to run it locally.

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
- Confirmation screen and a downloadable `.ics` calendar event. No email is sent.
- One explicitly labelled studio time zone: **UTC**, independent of the visitor's device.

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

| Method | Route            | Purpose                                                       |
| ------ | ---------------- | ------------------------------------------------------------- |
| GET    | `/api/slots`     | Future slots and their booked status; excludes guest details  |
| POST   | `/api/slots`     | Publish `{ date: "YYYY-MM-DD", time: "HH:mm", duration: 15 }` |
| DELETE | `/api/slots/:id` | Remove an unbooked slot; booked slots return 409              |
| POST   | `/api/bookings`  | Book `{ slotId, name, email }`; return confirmation           |
| POST   | `/api/setup`     | Transactional one-time sample availability bootstrap          |

Validation errors return 400, conflicts return 409, and successful creation returns 201. All API responses disable caching. The bootstrap never resets bookings or replenishes removed slots.

## Code map

- `app/sunroom.tsx`: page state, API requests, and the booking flow.
- `components/`: calendar, slot list, studio card, management view, and dialogs. The starter's optional `components/ui/` library is retained but not used by Sunroom.
- `app/api/`: small route handlers with server-side validation.
- `lib/booking.ts`: shared time formatting, date validation, and calendar export.
- `lib/api.ts`: database access, request validation, and error responses.
- `db/schema.ts` and `drizzle/`: schema and versioned SQL migrations.
- `tests/api.test.mjs`: integration coverage of concurrent booking and publishing.
- `scripts/`, `worker/`, and connector helpers: retained hosting starter infrastructure.

## Verify

```sh
npm run typecheck
npm run build
# With npm run dev running in another terminal:
npm run test:api
```

The integration test creates local test records (including one permanent sample booking per run). It refuses non-local URLs. It checks invalid input, overlapping slots, five simultaneous publishing requests, eight simultaneous booking requests (one succeeds, seven receive 409), booked-slot deletion protection, and absence of contact details in public responses.

Manual browser checks cover publishing, selecting a session, booking, the disabled booked state, the confirmation screen, and the calendar download. Availability persists on disk, rather than in React state or localStorage.

## Deployment

The Sites hosting manifest is `.openai/hosting.json`. Sites provisions the D1 database and applies the committed migrations before deploying the Worker. There are no secrets in this repository, and no optional external APIs are required. Generated builds, local runtime state, credentials, and the local database are ignored by Git.

To publish the repository to your own GitHub account, create an empty repository, then add that URL as a new remote and push `main`. Keep the existing hosting remote if you want to retain Sites publishing.

## AI tools used

Built with **OpenAI Codex** and the **Sites** starter/workflow. Codex assisted with the interface, TypeScript implementation, SQL race-condition handling, documentation, and checks. No other coding assistants were used. There is no LLM in the runtime booking path and no paid model/API dependency. The optional Google Calendar and AI integrations were intentionally left out to focus on a complete core flow.

## With more time

Add host-only authorization and rate limiting, cancellation/rescheduling links, email delivery with an outbox, studio-configurable time zones, pagination, and automated browser tests. Google Calendar free/busy checks could block conflicting times before bookings; an optional LLM confirmation endpoint should have a deterministic fallback.

This follows the brief's no-login assumption: **studio management endpoints are open to visitors**, so this is an interview/demo app rather than a production access-control model. Guest email addresses are stored for the booking but not exposed by any read endpoint. Production use should add host authorization and a guest-data retention policy before accepting real customers.

