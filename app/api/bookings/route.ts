import { z } from "zod";
import { ApiError, body, database, handle, json } from "@/lib/api";
export async function POST(request: Request) {
  return handle(async () => {
    const data = await body(
      request,
      z
        .object({
          slotId: z.string().uuid("Please choose a session."),
          name: z
            .string()
            .trim()
            .min(2, "Please enter your full name.")
            .max(100, "Please use a shorter name."),
          email: z
            .string()
            .trim()
            .email("Please enter a valid email address.")
            .max(254),
        })
        .strict(),
    );
    const now = Date.now();
    // Only the first caller can change this row from unbooked to booked.
    const slot = await database()
      .prepare(
        `UPDATE slots SET booked_at = ?, guest_name = ?, guest_email = ?
      WHERE id = ? AND booked_at IS NULL AND starts_at > ?
      RETURNING id, starts_at AS startsAt, duration`,
      )
      .bind(now, data.name, data.email.toLowerCase(), data.slotId, now)
      .first();
    if (!slot)
      throw new ApiError(
        409,
        "This session is no longer available. Please choose another time.",
      );
    return json(
      {
        slot: { ...slot, booked: true },
        message: `You're booked, ${data.name.split(" ")[0]}! We look forward to seeing you at Sunroom.`,
      },
      201,
    );
  });
}
