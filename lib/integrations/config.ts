export const GEMINI_MODEL = "gemini-3.5-flash-lite";

export interface IntegrationEnv {
  GOOGLE_CALENDAR_ID?: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?: string;
  GEMINI_API_KEY?: string;
}
export type ConfigurationStatus =
  "not_configured" | "incomplete" | "configured";
export function calendarStatus(env: IntegrationEnv): ConfigurationStatus {
  const present = [
    env.GOOGLE_CALENDAR_ID,
    env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  ].filter((value) => value?.trim()).length;
  return present === 0
    ? "not_configured"
    : present === 3
      ? "configured"
      : "incomplete";
}
export function integrationStatus(env: IntegrationEnv) {
  return {
    calendar: calendarStatus(env),
    ai: env.GEMINI_API_KEY?.trim()
      ? ("configured" as const)
      : ("not_configured" as const),
    model: GEMINI_MODEL,
  };
}
