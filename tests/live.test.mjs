import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createCalendar } from "../lib/integrations/calendar.ts";
import { calendarStatus } from "../lib/integrations/config.ts";
import { createAi } from "../lib/integrations/gemini.ts";
if (existsSync(".dev.vars")) process.loadEnvFile(".dev.vars");
const hasCalendar = calendarStatus(process.env) === "configured";
test(
  "LIVE Google Calendar accepts the service account and returns valid busy intervals",
  {
    skip: !hasCalendar
      ? "Google Calendar credentials are not configured"
      : false,
  },
  async () => {
    const start = Date.now(),
      end = start + 7 * 86_400_000;
    const busy = await createCalendar(process.env).busy(start, end);
    assert.ok(Array.isArray(busy));
    for (const interval of busy) assert.ok(interval.end > interval.start);
  },
);
test(
  "LIVE Gemini returns a real generated confirmation",
  {
    skip: !process.env.GEMINI_API_KEY?.trim()
      ? "Gemini API key is not configured"
      : false,
  },
  async () => {
    const response = await createAi(process.env, {
      timeoutMs: 15_000,
    }).confirmation();
    assert.equal(
      response.source,
      "gemini",
      "Gemini fell back; check the API key, project quota and model availability",
    );
    assert.ok(response.message.length >= 10);
  },
);
