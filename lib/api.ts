import { env } from "cloudflare:workers";
import { z } from "zod";
import { ApiError } from "./errors.ts";
export { ApiError } from "./errors.ts";
export function database() {
  if (!env.DB)
    throw new ApiError(
      503,
      "The studio is temporarily offline. Please try again shortly.",
    );
  return env.DB;
}
export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function body<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  const raw = await request.text();
  if (raw.length > 8192) throw new ApiError(413, "That request is too large.");
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "Please send valid JSON.");
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success)
    throw new ApiError(
      400,
      parsed.error.issues[0]?.message ?? "Please check the details.",
    );
  return parsed.data;
}
export async function handle(action: () => Promise<Response>) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ApiError)
      return json({ error: error.message }, error.status);
    console.error(
      "Studio request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}
