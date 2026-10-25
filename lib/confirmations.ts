import { ApiError } from "./errors.ts";
import { receiptHash } from "./reservations.ts";
import {
  STANDARD_CONFIRMATION,
  type StudioAi,
  type Confirmation,
} from "./integrations/gemini.ts";

interface ConfirmationRow {
  confirmationMessage: string | null;
  confirmationSource: string | null;
  confirmationState: string | null;
}
export async function bookingConfirmation(
  db: D1Database,
  ai: StudioAi,
  slotId: string,
  token: string,
): Promise<Confirmation & { pending: boolean }> {
  const hash = await receiptHash(token);
  const row = await db
    .prepare(
      `SELECT confirmation_message AS confirmationMessage, confirmation_source AS confirmationSource,
    confirmation_state AS confirmationState FROM slots WHERE id = ? AND booked_at IS NOT NULL AND confirmation_token_hash = ?`,
    )
    .bind(slotId, hash)
    .first<ConfirmationRow>();
  if (!row) throw new ApiError(403, "This booking receipt is not valid.");
  const cached = (
    value: ConfirmationRow,
  ): Confirmation & { pending: boolean } => ({
    message: value.confirmationMessage ?? STANDARD_CONFIRMATION,
    source: value.confirmationSource === "gemini" ? "gemini" : "fallback",
    pending: value.confirmationState === "pending",
  });
  if (row.confirmationState !== null) return cached(row);
  // Claim before contacting Gemini. Replays and simultaneous callers cannot spend extra quota.
  const claimed = await db
    .prepare(
      `UPDATE slots SET confirmation_state = 'pending', confirmation_message = ?, confirmation_source = 'fallback'
    WHERE id = ? AND confirmation_token_hash = ? AND confirmation_state IS NULL RETURNING id`,
    )
    .bind(STANDARD_CONFIRMATION, slotId, hash)
    .first();
  if (!claimed) {
    const latest = await db
      .prepare(
        `SELECT confirmation_message AS confirmationMessage, confirmation_source AS confirmationSource,
      confirmation_state AS confirmationState FROM slots WHERE id = ? AND confirmation_token_hash = ?`,
      )
      .bind(slotId, hash)
      .first<ConfirmationRow>();
    return cached(latest!);
  }
  let confirmation: Confirmation;
  try {
    confirmation = await ai.confirmation();
  } catch {
    confirmation = { message: STANDARD_CONFIRMATION, source: "fallback" };
  }
  await db
    .prepare(
      `UPDATE slots SET confirmation_state = 'complete', confirmation_message = ?, confirmation_source = ?
    WHERE id = ? AND confirmation_token_hash = ?`,
    )
    .bind(confirmation.message, confirmation.source, slotId, hash)
    .run();
  return { ...confirmation, pending: false };
}
