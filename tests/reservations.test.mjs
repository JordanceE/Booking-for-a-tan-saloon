import test from "node:test";
import assert from "node:assert/strict";
import { reserveSlot, listSlots } from "../lib/reservations.ts";
import { bookingConfirmation } from "../lib/confirmations.ts";
import { STANDARD_CONFIRMATION } from "../lib/integrations/gemini.ts";
import { ApiError } from "../lib/errors.ts";
import { isAvailable, slotStatus } from "../lib/booking.ts";
import { testDatabase } from "./support/fixtures.mjs";
const free = { busy: async () => [] };
const guest = (id) => ({
  slotId: id,
  name: "Test Guest",
  email: "GUEST@example.com",
});

test("availability marks Google conflicts without leaking event or guest details", async (t) => {
  const { db, slot } = testDatabase(t);
  const a = slot(),
    b = slot(30);
  const slots = await listSlots(db, {
    busy: async () => [
      { start: a.startsAt, end: a.startsAt + a.duration * 60_000 },
    ],
  });
  assert.equal(slots.find((s) => s.id === a.id).calendarBlocked, true);
  assert.equal(slots.find((s) => s.id === b.id).calendarBlocked, false);
  assert.equal(isAvailable(slots[0]), false);
  assert.equal(slotStatus(slots[0]), "Calendar busy");
  assert.deepEqual(
    Object.keys(slots[0]).sort(),
    ["id", "startsAt", "duration", "booked", "calendarBlocked"].sort(),
  );
});
test("a newly added Google event is rechecked at booking time, even after a free listing", async (t) => {
  const { db, sqlite, slot } = testDatabase(t);
  const s = slot();
  let calls = 0;
  const calendar = {
    busy: async () =>
      ++calls === 1 ? [] : [{ start: s.startsAt, end: s.startsAt + 60_000 }],
  };
  assert.equal((await listSlots(db, calendar))[0].calendarBlocked, false);
  await assert.rejects(
    reserveSlot(db, calendar, guest(s.id)),
    (e) => e.status === 409,
  );
  assert.equal(
    sqlite.prepare("SELECT booked_at FROM slots WHERE id = ?").get(s.id)
      .booked_at,
    null,
  );
  assert.equal(calls, 2);
});
test("calendar failures cannot consume a slot", async (t) => {
  const { db, sqlite, slot } = testDatabase(t);
  const s = slot();
  await assert.rejects(
    reserveSlot(
      db,
      {
        busy: async () => {
          throw new ApiError(503, "Calendar unavailable");
        },
      },
      guest(s.id),
    ),
    (e) => e.status === 503,
  );
  assert.equal(
    sqlite.prepare("SELECT booked_at FROM slots WHERE id = ?").get(s.id)
      .booked_at,
    null,
  );
});
test("back-to-back Google events permit a booking; the receipt is random and stored only as a hash", async (t) => {
  const { db, sqlite, slot } = testDatabase(t);
  const s = slot();
  const result = await reserveSlot(
    db,
    {
      busy: async () => [
        { start: s.startsAt - 60_000, end: s.startsAt },
        {
          start: s.startsAt + s.duration * 60_000,
          end: s.startsAt + (s.duration + 1) * 60_000,
        },
      ],
    },
    guest(s.id),
  );
  assert.match(result.confirmationToken, /^[a-f0-9]{64}$/);
  const stored = sqlite
    .prepare(
      "SELECT confirmation_token_hash, guest_email FROM slots WHERE id = ?",
    )
    .get(s.id);
  assert.notEqual(stored.confirmation_token_hash, result.confirmationToken);
  assert.equal(stored.guest_email, "guest@example.com");
});
test("eight competing bookings still produce one reservation after calendar checks", async (t) => {
  const { db, slot } = testDatabase(t);
  const s = slot();
  const result = await Promise.allSettled(
    Array.from({ length: 8 }, () => reserveSlot(db, free, guest(s.id))),
  );
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    result.filter((r) => r.status === "rejected" && r.reason.status === 409)
      .length,
    7,
  );
});
test("confirmation requires the actual booking receipt and rejects a slot ID alone", async (t) => {
  const { db, slot } = testDatabase(t);
  const s = slot();
  let calls = 0;
  const ai = {
    confirmation: async () => {
      calls++;
      return { source: "gemini", message: "Hello from Sunroom!" };
    },
  };
  await assert.rejects(
    bookingConfirmation(db, ai, s.id, "0".repeat(64)),
    (e) => e.status === 403,
  );
  await reserveSlot(db, free, guest(s.id));
  await assert.rejects(
    bookingConfirmation(db, ai, s.id, "0".repeat(64)),
    (e) => e.status === 403,
  );
  assert.equal(calls, 0);
});
test("simultaneous AI requests make one model call, and later requests return the persisted note", async (t) => {
  const { db, sqlite, slot } = testDatabase(t);
  const s = slot();
  const booked = await reserveSlot(db, free, guest(s.id));
  let calls = 0;
  const ai = {
    confirmation: async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        source: "gemini",
        message: "Your sunny moment is reserved. See you soon!",
      };
    },
  };
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      bookingConfirmation(db, ai, s.id, booked.confirmationToken),
    ),
  );
  assert.equal(calls, 1);
  assert.ok(results.some((r) => r.source === "gemini"));
  const cached = await bookingConfirmation(
    db,
    ai,
    s.id,
    booked.confirmationToken,
  );
  assert.equal(cached.source, "gemini");
  assert.equal(cached.pending, false);
  assert.equal(calls, 1);
  assert.equal(
    sqlite
      .prepare("SELECT confirmation_state FROM slots WHERE id = ?")
      .get(s.id).confirmation_state,
    "complete",
  );
});
test("AI errors keep the booking, save a fallback and do not retry a failing provider", async (t) => {
  const { db, sqlite, slot } = testDatabase(t);
  const s = slot();
  const booked = await reserveSlot(db, free, guest(s.id));
  let calls = 0;
  const ai = {
    confirmation: async () => {
      calls++;
      throw new Error("Provider unavailable");
    },
  };
  const first = await bookingConfirmation(
    db,
    ai,
    s.id,
    booked.confirmationToken,
  );
  const second = await bookingConfirmation(
    db,
    ai,
    s.id,
    booked.confirmationToken,
  );
  assert.equal(first.message, STANDARD_CONFIRMATION);
  assert.deepEqual(first, second);
  assert.equal(calls, 1);
  assert.ok(
    sqlite.prepare("SELECT booked_at FROM slots WHERE id = ?").get(s.id)
      .booked_at,
  );
});
