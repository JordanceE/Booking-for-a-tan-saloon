import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  check,
  index,
} from "drizzle-orm/sqlite-core";

export const slots = sqliteTable(
  "slots",
  {
    id: text("id").primaryKey(),
    startsAt: integer("starts_at").notNull(),
    duration: integer("duration").notNull(),
    bookedAt: integer("booked_at"),
    guestName: text("guest_name"),
    guestEmail: text("guest_email"),
    confirmationTokenHash: text("confirmation_token_hash"),
    confirmationMessage: text("confirmation_message"),
    confirmationSource: text("confirmation_source"),
    confirmationState: text("confirmation_state"),
  },
  (table) => [
    index("slots_start_idx").on(table.startsAt),
    check("duration_range", sql`${table.duration} between 1 and 60`),
    check(
      "booking_complete",
      sql`(${table.bookedAt} is null and ${table.guestName} is null and ${table.guestEmail} is null) or (${table.bookedAt} is not null and ${table.guestName} is not null and ${table.guestEmail} is not null)`,
    ),
  ],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
