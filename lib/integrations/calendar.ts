import { SignJWT, importPKCS8 } from "jose";
import { z } from "zod";
import { ApiError } from "../errors.ts";
import { calendarStatus, type IntegrationEnv } from "./config.ts";
import { providerJson, type ProviderOptions } from "./http.ts";

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_FREEBUSY_URL =
  "https://www.googleapis.com/calendar/v3/freeBusy";
export const CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.freebusy";
export type BusyInterval = { start: number; end: number };
export const overlaps = (start: number, end: number, busy: BusyInterval[]) =>
  busy.some((interval) => start < interval.end && end > interval.start);
export interface StudioCalendar {
  busy(start: number, end: number): Promise<BusyInterval[]>;
}

const tokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive(),
});
const calendarSchema = z.object({
  errors: z.array(z.unknown()).optional(),
  busy: z
    .array(
      z.object({
        start: z.string().datetime({ offset: true }),
        end: z.string().datetime({ offset: true }),
      }),
    )
    .max(50_000)
    .optional(),
});
const busySchema = z.object({ calendars: z.record(calendarSchema) });

export function createCalendar(
  env: IntegrationEnv,
  options: ProviderOptions = {},
): StudioCalendar {
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const timeout = options.timeoutMs ?? 5000;
  let token: { value: string; expiresAt: number } | undefined;
  let pendingToken: Promise<string> | undefined;
  let keyPromise: ReturnType<typeof importPKCS8> | undefined;

  async function accessToken(): Promise<string> {
    if (token && token.expiresAt > now() + 60_000) return token.value;
    if (pendingToken) return pendingToken;
    pendingToken = (async () => {
      keyPromise ??= importPKCS8(
        env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, "\n"),
        "RS256",
      );
      const issuedAt = Math.floor(now() / 1000);
      const assertion = await new SignJWT({ scope: CALENDAR_SCOPE })
        .setProtectedHeader({ alg: "RS256", typ: "JWT" })
        .setIssuer(env.GOOGLE_SERVICE_ACCOUNT_EMAIL!.trim())
        .setAudience(GOOGLE_TOKEN_URL)
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + 3600)
        .sign(await keyPromise);
      const data = tokenSchema.parse(
        await providerJson(
          fetcher,
          GOOGLE_TOKEN_URL,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
              assertion,
            }).toString(),
          },
          timeout,
        ),
      );
      token = {
        value: data.access_token,
        expiresAt: now() + Math.min(data.expires_in, 3600) * 1000,
      };
      return token.value;
    })();
    try {
      return await pendingToken;
    } finally {
      pendingToken = undefined;
    }
  }

  return {
    async busy(start, end) {
      const status = calendarStatus(env);
      if (status === "not_configured") return [];
      if (status === "incomplete")
        throw new ApiError(
          503,
          "The studio calendar connection needs attention. Please try again later.",
        );
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
        throw new ApiError(400, "Invalid calendar interval.");
      try {
        const data = busySchema.parse(
          await providerJson(
            fetcher,
            GOOGLE_FREEBUSY_URL,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${await accessToken()}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                timeMin: new Date(start).toISOString(),
                timeMax: new Date(end).toISOString(),
                timeZone: "UTC",
                items: [{ id: env.GOOGLE_CALENDAR_ID!.trim() }],
              }),
            },
            timeout,
          ),
        );
        const calendar = data.calendars[env.GOOGLE_CALENDAR_ID!.trim()];
        if (!calendar || calendar.errors?.length || !calendar.busy)
          throw new Error("Calendar is not accessible");
        return calendar.busy.map((interval) => {
          const start = Date.parse(interval.start),
            end = Date.parse(interval.end);
          if (end <= start) throw new Error("Malformed calendar interval");
          return { start, end };
        });
      } catch {
        // A provider failure must never be interpreted as an empty calendar.
        token = undefined;
        throw new ApiError(
          503,
          "We couldn't check the studio calendar. Please try again shortly.",
        );
      }
    },
  };
}
