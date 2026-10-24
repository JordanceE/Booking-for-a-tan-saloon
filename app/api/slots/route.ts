import { z } from "zod";
import { ApiError, body, database, handle, json } from "@/lib/api";
import { parseStudioTime } from "@/lib/booking";
export const dynamic = "force-dynamic";
export async function GET() {
  return handle(async () => {
    const result = await database()
      .prepare(
        "SELECT id, starts_at AS startsAt, duration, booked_at IS NOT NULL AS booked FROM slots WHERE starts_at > ? ORDER BY starts_at",
      )
      .bind(Date.now())
      .all();
    return json({
      slots: result.results.map((row) => ({
        ...row,
        booked: Boolean(row.booked),
      })),
      timeZone: "UTC",
    });
  });
}
export async function POST(request: Request) {
  return handle(async () => {
    const data = await body(
      request,
      z
        .object({
          date: z.string(),
          time: z.string(),
          duration: z.number().int().min(1).max(60),
        })
        .strict(),
    );
    const startsAt = parseStudioTime(data.date, data.time);
    if (startsAt === null)
      throw new ApiError(400, "Choose a valid date and time.");
    if (startsAt <= Date.now())
      throw new ApiError(400, "Please choose a time in the future.");
    if (startsAt > Date.now() + 366 * 86_400_000)
      throw new ApiError(400, "Publish a slot within the next year.");
    const id = crypto.randomUUID();
    // One statement prevents overlapping availability, including concurrent requests.
    const created = await database()
      .prepare(
        `INSERT INTO slots (id, starts_at, duration)
      SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM slots WHERE starts_at < ? AND starts_at + duration * 60000 > ?)
      RETURNING id`,
      )
      .bind(
        id,
        startsAt,
        data.duration,
        startsAt + data.duration * 60_000,
        startsAt,
      )
      .first();
    if (!created)
      throw new ApiError(
        409,
        "This time overlaps an existing session. Choose another time.",
      );
    return json(
      { slot: { id, startsAt, duration: data.duration, booked: false } },
      201,
    );
  });
}
