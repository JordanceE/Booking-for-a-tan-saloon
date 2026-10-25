# Connect Google Calendar and Gemini

Both integrations run on the server. Visitors do not need Google accounts. The app still supports local development without credentials, with calendar checks disabled and standard confirmation notes.

## 1. Prepare the local credentials file

Copy `.dev.vars.example` to `.dev.vars` in the project root. This file is ignored by Git. Do not paste credentials into chat, commit them, or put them in `.openai/hosting.json`.

## 2. Connect the studio calendar

1. In [Google Cloud Console](https://console.cloud.google.com/), select or create a project and enable **Google Calendar API**.
2. Open **IAM & Admin → Service Accounts**, create an account, then open **Keys → Add key → Create new key → JSON**. Keep the downloaded key private.
3. In Google Calendar, open the studio calendar's **Settings and sharing → Share with specific people or groups**. Add the JSON file's `client_email` with **See only free/busy (hide details)** access. Domain-wide delegation is not needed.
4. Under **Integrate calendar**, copy the **Calendar ID**. Use the actual ID, not `primary` (which would refer to the service account).
5. Fill these values in `.dev.vars`:

```dotenv
GOOGLE_CALENDAR_ID="the-calendar-id"
GOOGLE_SERVICE_ACCOUNT_EMAIL="the-client_email-value-from-your-JSON"
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="the-private_key-value-from-your-JSON"
```

The private key must include its BEGIN/END lines. Keep it on one quoted line with literal `\n` escapes as in the downloaded JSON. The app accepts literal escapes or real newlines.

Only the Google Calendar **FreeBusy API** is called. Event titles, descriptions and attendees are neither read nor returned to visitors. The same calendar applies to the single studio bed.

## 3. Add free-tier Gemini confirmations

1. Create a key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Use a project on the **Free** tier with no paid billing enabled. The app never upgrades a project or falls back to a paid-only model. Google's current model availability and quotas apply.
3. Add `GEMINI_API_KEY="your-key"` to `.dev.vars`.

The app uses `gemini-2.5-flash-lite`, which has a [free tier](https://ai.google.dev/gemini-api/docs/pricing). No guest name, email, booking date, or Google event information is sent to Gemini. The model receives a fixed request to write a short studio confirmation.

## 4. Apply and verify

Restart the local server after editing `.dev.vars`. Open **Manage studio** to check whether both integrations are configured. Configuration status does not claim the credentials have been verified.

Create an event marked **Busy** in the studio calendar that overlaps a published slot. Refresh Sunroom: the slot should be marked **Calendar busy** and disabled. A booking request also rechecks Google immediately before reservation. Events that only touch a slot's start or end do not overlap.

Make a booking at a free time. The confirmation opens immediately with the standard note, then updates after the backend calls Gemini. The protected `POST /api/confirmations` response reports `source: "gemini"` when generation succeeds and `source: "fallback"` otherwise. Each booking permits at most one generation attempt; retries return the saved result.

For hosting, configure the same four values as **secret runtime environment variables** in Sites and redeploy the saved app version. If working with Codex, fill the ignored local file and say it is ready; Codex can transfer the named values without printing them. Never share the downloaded key or API key in a public repository.

## Tests

`npm test` runs deterministic provider and database tests with isolated SQLite databases and fake Google/Gemini HTTP responses. These tests do not spend API credits or access a real calendar. `npm run test:live` makes read-only real Google calls and one Gemini request using your configured free-tier project. Live tests skip providers whose credentials are absent; a skipped test is not verification of that provider.

Google Calendar is queried without a busy-result cache, including at booking time. If it is configured but cannot be checked, new bookings fail with 503 rather than assuming the calendar is empty. An event created externally after the final check remains an unavoidable race: this demo does not write or lock Google Calendar events.

AI timeouts, blocked responses, rate limits and provider errors use the standard message without losing the booking. A Worker interruption during generation may leave the saved standard note in place; generation is not retried automatically.

References: [Google FreeBusy API](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query), [service account authorization](https://developers.google.com/identity/protocols/oauth2/service-account), [Gemini API](https://ai.google.dev/gemini-api/docs/text-generation).
