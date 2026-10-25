import { ApiError } from "./errors.ts";
import { overlaps, type StudioCalendar } from "./integrations/calendar.ts";
import { STANDARD_CONFIRMATION } from "./integrations/gemini.ts";

export async function receiptHash(token: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export async function listSlots(
  db: D1Database,
  calendar: StudioCalendar,
  now = Date.now(),
) {
  const result = await db
    .prepare(
      "SELECT id, starts_at AS startsAt, duration, booked_at IS NOT NULL AS booked FROM slots WHERE starts_at > ? ORDER BY starts_at",
    )
    .bind(now)
    .all<{ id: string; startsAt: number; duration: number; booked: number }>();
  const rows = result.results;
  const end = rows.reduce(
    (latest, slot) => Math.max(latest, slot.startsAt + slot.duration * 60_000),
    now,
  );
  const busy = rows.length ? await calendar.busy(rows[0].startsAt, end) : [];
  return rows.map((slot) => ({
    ...slot,
    booked: Boolean(slot.booked),
    calendarBlocked: overlaps(
      slot.startsAt,
      slot.startsAt + slot.duration * 60_000,
      busy,
    ),
  }));
}
export async function reserveSlot(
  db: D1Database,
  calendar: StudioCalendar,
  guest: { slotId: string; name: string; email: string },
  now = Date.now(),
) {
  const candidate = await db
    .prepare(
      "SELECT id, starts_at AS startsAt, duration, booked_at AS bookedAt FROM slots WHERE id = ?",
    )
    .bind(guest.slotId)
    .first<{
      id: string;
      startsAt: number;
      duration: number;
      bookedAt: number | null;
    }>();
  if (!candidate || candidate.bookedAt !== null || candidate.startsAt <= now)
    throw new ApiError(
      409,
      "This session is no longer available. Please choose another time.",
    );
  // Never reuse the listing's busy result: external events may have changed since it loaded.
  const busy = await calendar.busy(
    candidate.startsAt,
    candidate.startsAt + candidate.duration * 60_000,
  );
  if (
    overlaps(
      candidate.startsAt,
      candidate.startsAt + candidate.duration * 60_000,
      busy,
    )
  )
    throw new ApiError(
      409,
      "The studio calendar is busy at this time. Please choose another session.",
    );
  const confirmationToken = Array.from(
    crypto.getRandomValues(new Uint8Array(32)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  const slot = await db
    .prepare(
      `UPDATE slots SET booked_at = ?, guest_name = ?, guest_email = ?, confirmation_token_hash = ?
    WHERE id = ? AND booked_at IS NULL AND starts_at > ? RETURNING id, starts_at AS startsAt, duration`,
    )
    .bind(
      Date.now(),
      guest.name,
      guest.email.toLowerCase(),
      await receiptHash(confirmationToken),
      guest.slotId,
      Date.now(),
    )
    .first<{ id: string; startsAt: number; duration: number }>();
  if (!slot)
    throw new ApiError(
      409,
      "This session is no longer available. Please choose another time.",
    );
  return {
    slot: { ...slot, booked: true, calendarBlocked: false },
    message: STANDARD_CONFIRMATION,
    confirmationToken,
  };
}
