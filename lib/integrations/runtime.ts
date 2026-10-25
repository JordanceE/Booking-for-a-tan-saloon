import { env } from "cloudflare:workers";
import { createCalendar } from "./calendar.ts";
import { createAi } from "./gemini.ts";
import { integrationStatus, type IntegrationEnv } from "./config.ts";

// One studio connection per Worker isolate; only short-lived OAuth tokens are cached.
let current:
  | {
      config: string;
      calendar: ReturnType<typeof createCalendar>;
      ai: ReturnType<typeof createAi>;
    }
  | undefined;
export function providers() {
  const settings: IntegrationEnv = {
    GOOGLE_CALENDAR_ID: env.GOOGLE_CALENDAR_ID,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
    GEMINI_API_KEY: env.GEMINI_API_KEY,
  };
  const config = JSON.stringify(settings);
  if (!current || current.config !== config)
    current = {
      config,
      calendar: createCalendar(settings),
      ai: createAi(settings),
    };
  return {
    calendar: current.calendar,
    ai: current.ai,
    status: integrationStatus(settings),
  };
}
