import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportPKCS8, jwtVerify } from "jose";
import {
  createCalendar,
  overlaps,
  GOOGLE_TOKEN_URL,
  GOOGLE_FREEBUSY_URL,
  CALENDAR_SCOPE,
} from "../lib/integrations/calendar.ts";
import {
  calendarStatus,
  integrationStatus,
} from "../lib/integrations/config.ts";
import {
  createAi,
  GEMINI_URL,
  STANDARD_CONFIRMATION,
} from "../lib/integrations/gemini.ts";
import { reply, abortingFetch } from "./support/fixtures.mjs";
import { googleCalendarUrl, calendarFile } from "../lib/booking.ts";

const pair = await generateKeyPair("RS256", { extractable: true });
const credentials = {
  GOOGLE_CALENDAR_ID: "studio@example.invalid",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "test@project.iam.gserviceaccount.com",
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: await exportPKCS8(pair.privateKey),
};
const start = Date.parse("2027-01-10T09:00:00Z"),
  end = start + 15 * 60_000;
const busyBody = (busy = []) => ({
  calendars: { [credentials.GOOGLE_CALENDAR_ID]: { busy } },
});
const note =
  "Your Sunroom session is reserved. We look forward to welcoming you!";
const geminiBody = (text = note, finishReason = "STOP") => ({
  candidates: [{ finishReason, content: { parts: [{ text }] } }],
});

test("Google Calendar links preserve UTC session times across midnight and exclude private booking data", () => {
  const slot = {
    id: "private-slot-id",
    startsAt: Date.parse("2026-12-31T23:50:00Z"),
    duration: 20,
    booked: true,
    guestName: "Private Guest",
    guestEmail: "private@example.invalid",
    confirmationToken: "private-receipt",
  };
  const url = new URL(googleCalendarUrl(slot));
  assert.equal(url.origin, "https://calendar.google.com");
  assert.equal(url.pathname, "/calendar/render");
  assert.equal(url.searchParams.get("action"), "TEMPLATE");
  assert.equal(url.searchParams.get("dates"), "20261231T235000Z/20270101T001000Z");
  assert.equal(url.searchParams.get("ctz"), "UTC");
  assert.equal(url.searchParams.get("text"), "Sunroom tanning session");
  assert.equal(url.searchParams.get("location"), "Sunroom Studio - Bed 01");
  assert.match(url.searchParams.get("details"), /5 minutes/);
  assert.equal(decodeURIComponent(url.toString()).includes("private"), false);
});

test("downloadable calendar fallback keeps the same session dates as the Google link", () => {
  const slot = {
    id: "export-test",
    startsAt: Date.parse("2027-01-31T23:45:00Z"),
    duration: 30,
    booked: true,
  };
  const [start, end] = new URL(googleCalendarUrl(slot)).searchParams.get("dates").split("/");
  const file = calendarFile(slot);
  assert.equal(start, "20270131T234500Z");
  assert.equal(end, "20270201T001500Z");
  assert.ok(file.includes(`DTSTART:${start}\r\n`));
  assert.ok(file.includes(`DTEND:${end}\r\n`));
});

test("configuration distinguishes disabled, partial and complete calendar credentials without exposing secrets", () => {
  assert.equal(calendarStatus({}), "not_configured");
  assert.equal(calendarStatus({ GOOGLE_CALENDAR_ID: "id" }), "incomplete");
  assert.equal(calendarStatus(credentials), "configured");
  const status = integrationStatus({
    ...credentials,
    GEMINI_API_KEY: "private-key",
  });
  assert.deepEqual(Object.keys(status).sort(), ["ai", "calendar", "model"]);
  assert.equal(JSON.stringify(status).includes("private-key"), false);
});
test("unconfigured calendar makes no provider calls; partial configuration fails closed", async () => {
  let calls = 0;
  const fetch = async () => {
    calls++;
    throw new Error("Unexpected call");
  };
  assert.deepEqual(await createCalendar({}, { fetch }).busy(start, end), []);
  await assert.rejects(
    createCalendar({ GOOGLE_CALENDAR_ID: "id" }, { fetch }).busy(start, end),
    (e) => e.status === 503,
  );
  assert.equal(calls, 0);
});
test("half-open overlap handles enclosing, partial, all-day, and adjacent intervals", () => {
  assert.equal(
    overlaps(start, end, [{ start: start - 1, end: start + 1 }]),
    true,
  );
  assert.equal(overlaps(start, end, [{ start: end - 1, end: end + 1 }]), true);
  assert.equal(
    overlaps(start, end, [
      { start: start - 86_400_000, end: end + 86_400_000 },
    ]),
    true,
  );
  assert.equal(
    overlaps(start, end, [
      { start: start - 60_000, end: start },
      { start: end, end: end + 60_000 },
    ]),
    false,
  );
});
test("Google JWT is signed correctly, has the narrow scope, and shared token refresh is cached", async () => {
  let now = Date.now(),
    tokenCalls = 0,
    busyCalls = 0;
  const fetch = async (url, init) => {
    assert.equal(init.redirect, "manual");
    if (url === GOOGLE_TOKEN_URL) {
      tokenCalls++;
      const form = new URLSearchParams(init.body);
      assert.equal(
        form.get("grant_type"),
        "urn:ietf:params:oauth:grant-type:jwt-bearer",
      );
      const { payload } = await jwtVerify(
        form.get("assertion"),
        pair.publicKey,
        {
          issuer: credentials.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          audience: GOOGLE_TOKEN_URL,
          currentDate: new Date(now),
        },
      );
      assert.equal(payload.scope, CALENDAR_SCOPE);
      assert.equal(payload.exp - payload.iat, 3600);
      assert.equal(payload.sub, undefined);
      return reply({
        access_token: "test-token",
        token_type: "Bearer",
        expires_in: 3600,
      });
    }
    assert.equal(url, GOOGLE_FREEBUSY_URL);
    assert.equal(init.headers.Authorization, "Bearer test-token");
    const body = JSON.parse(init.body);
    assert.deepEqual(body.items, [{ id: credentials.GOOGLE_CALENDAR_ID }]);
    assert.equal(body.timeMin, new Date(start).toISOString());
    assert.equal(body.timeMax, new Date(end).toISOString());
    busyCalls++;
    return reply(
      busyBody([
        {
          start: "2027-01-10T10:00:00+01:00",
          end: "2027-01-10T10:15:00+01:00",
        },
      ]),
    );
  };
  const calendar = createCalendar(
    {
      ...credentials,
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:
        credentials.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\n/g, "\\n"),
    },
    { fetch, now: () => now },
  );
  const results = await Promise.all(
    Array.from({ length: 6 }, () => calendar.busy(start, end)),
  );
  assert.equal(tokenCalls, 1);
  assert.equal(busyCalls, 6);
  assert.deepEqual(results[0], [{ start, end }]);
  now += 3_600_000;
  await calendar.busy(start, end);
  assert.equal(tokenCalls, 2);
});
for (const [name, response] of [
  ["HTTP failure", () => reply({}, 503)],
  [
    "per-calendar permission error",
    () =>
      reply({
        calendars: {
          [credentials.GOOGLE_CALENDAR_ID]: {
            errors: [{ reason: "notFound" }],
            busy: [],
          },
        },
      }),
  ],
  ["missing requested calendar", () => reply({ calendars: {} })],
  [
    "missing busy data",
    () => reply({ calendars: { [credentials.GOOGLE_CALENDAR_ID]: {} } }),
  ],
  ["invalid timestamps", () => reply(busyBody([{ start: "bad", end: "bad" }]))],
  [
    "negative interval",
    () =>
      reply(
        busyBody([
          { start: "2027-01-10T10:00:00Z", end: "2027-01-10T09:00:00Z" },
        ]),
      ),
  ],
])
  test(`calendar ${name} blocks booking checks with a sanitized 503`, async () => {
    const calendar = createCalendar(credentials, {
      fetch: async (url) =>
        url === GOOGLE_TOKEN_URL
          ? reply({
              access_token: "test",
              token_type: "Bearer",
              expires_in: 3600,
            })
          : response(),
    });
    await assert.rejects(
      calendar.busy(start, end),
      (e) => e.status === 503 && !e.message.includes("studio@example"),
    );
  });
test("calendar timeout is bounded and fails closed", async () => {
  const calendar = createCalendar(credentials, {
    timeoutMs: 10,
    fetch: async (url, init) =>
      url === GOOGLE_TOKEN_URL
        ? reply({
            access_token: "test",
            token_type: "Bearer",
            expires_in: 3600,
          })
        : abortingFetch(url, init),
  });
  await assert.rejects(calendar.busy(start, end), (e) => e.status === 503);
});
test("Gemini endpoint uses a fixed private prompt, authenticates in a header, and returns generated plain text", async () => {
  let calls = 0;
  const ai = createAi(
    { GEMINI_API_KEY: "test-secret" },
    {
      fetch: async (url, init) => {
        calls++;
        assert.equal(url, GEMINI_URL);
        assert.equal(url.includes("test-secret"), false);
        assert.equal(init.headers["x-goog-api-key"], "test-secret");
        const body = JSON.parse(init.body);
        assert.equal(body.generationConfig.maxOutputTokens, 120);
        assert.equal(
          /@|guest_name|guest_email|calendar_id/.test(init.body),
          false,
        );
        return reply(geminiBody());
      },
    },
  );
  assert.deepEqual(await ai.confirmation(), {
    message: note,
    source: "gemini",
  });
  assert.equal(calls, 1);
});
test("Gemini is optional and performs no call without a key", async () => {
  assert.deepEqual(
    await createAi(
      {},
      {
        fetch: async () => {
          throw new Error("Must not call");
        },
      },
    ).confirmation(),
    { message: STANDARD_CONFIRMATION, source: "fallback" },
  );
});
for (const [name, fetch] of [
  ["rate limit", async () => reply({}, 429)],
  ["provider failure", async () => reply({}, 500)],
  ["malformed JSON", async () => new Response("bad")],
  ["blocked or missing candidates", async () => reply({ candidates: [] })],
  [
    "truncated text",
    async () => reply(geminiBody("Some truncated note", "MAX_TOKENS")),
  ],
  ["empty response", async () => reply(geminiBody(""))],
  [
    "unwanted link",
    async () => reply(geminiBody("Go to https://example.com to confirm.")),
  ],
  ["timeout", abortingFetch],
])
  test(`Gemini ${name} returns the standard confirmation`, async () => {
    const result = await createAi(
      { GEMINI_API_KEY: "test" },
      { fetch, timeoutMs: 10 },
    ).confirmation();
    assert.equal(result.source, "fallback");
    assert.equal(result.message, STANDARD_CONFIRMATION);
  });
