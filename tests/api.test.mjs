import test from "node:test";
import assert from "node:assert/strict";

const origin = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin))
  throw new Error(
    "Integration tests write sample bookings. Use a local test server.",
  );
async function call(path, method = "GET", body) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}
const futureDate = (offset) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

test("API flow: publish, validate, handle races, retain booking and protect personal data", async () => {
  // Find a free test time, even when this test has run before on the same local database.
  let created;
  for (let day = 30; day < 360; day++) {
    created = await call("/api/slots", "POST", {
      date: futureDate(day),
      time: "08:00",
      duration: 15,
    });
    if (created.status === 201) break;
    assert.equal(created.status, 409);
  }
  assert.equal(created.status, 201);
  const slot = created.body.slot;
  const date = new Date(slot.startsAt).toISOString().slice(0, 10);

  const invalid = await call("/api/bookings", "POST", {
    slotId: slot.id,
    name: "Test Visitor",
    email: "bad-email",
  });
  assert.equal(invalid.status, 400);
  assert.equal(
    (await call("/api/slots")).body.slots.find((s) => s.id === slot.id).booked,
    false,
  );

  const overlap = await call("/api/slots", "POST", {
    date,
    time: "08:10",
    duration: 15,
  });
  assert.equal(overlap.status, 409);
  const publishRace = await Promise.all(
    Array.from({ length: 5 }, () =>
      call("/api/slots", "POST", { date, time: "08:30", duration: 15 }),
    ),
  );
  assert.equal(publishRace.filter((r) => r.status === 201).length, 1);
  assert.equal(publishRace.filter((r) => r.status === 409).length, 4);
  const temporary = publishRace.find((r) => r.status === 201).body.slot;
  assert.equal(
    (await call(`/api/slots/${temporary.id}`, "DELETE")).status,
    200,
  );

  const bookingRace = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      call("/api/bookings", "POST", {
        slotId: slot.id,
        name: `Test Visitor ${i}`,
        email: `test${i}@example.com`,
      }),
    ),
  );
  assert.equal(
    bookingRace.filter((r) => r.status === 201).length,
    1,
    "Exactly one visitor gets the session",
  );
  assert.equal(bookingRace.filter((r) => r.status === 409).length, 7);
  const read = await call("/api/slots");
  const booked = read.body.slots.find((s) => s.id === slot.id);
  assert.equal(booked.booked, true);
  assert.deepEqual(
    Object.keys(booked).sort(),
    ["booked", "duration", "id", "startsAt", "calendarBlocked"].sort(),
  );
  assert.equal(JSON.stringify(read.body).includes("@example.com"), false);
  assert.equal((await call(`/api/slots/${slot.id}`, "DELETE")).status, 409);
  const receipt = bookingRace.find((r) => r.status === 201).body
    .confirmationToken;
  assert.match(receipt, /^[a-f0-9]{64}$/);
  assert.equal(
    (
      await call("/api/confirmations", "POST", {
        slotId: slot.id,
        token: "0".repeat(64),
      })
    ).status,
    403,
  );
  const notes = await Promise.all(
    Array.from({ length: 5 }, () =>
      call("/api/confirmations", "POST", { slotId: slot.id, token: receipt }),
    ),
  );
  assert.ok(notes.every((r) => r.status === 200 || r.status === 202));
  const savedNote = await call("/api/confirmations", "POST", {
    slotId: slot.id,
    token: receipt,
  });
  assert.equal(savedNote.status, 200);
  assert.ok(["gemini", "fallback"].includes(savedNote.body.source));
  assert.ok(savedNote.body.message.length > 10);
  assert.equal(
    JSON.stringify((await call("/api/slots")).body).includes(receipt),
    false,
  );

  assert.equal(
    (
      await call("/api/slots", "POST", {
        date: "2020-01-01",
        time: "10:00",
        duration: 15,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/api/slots", "POST", {
        date: futureDate(20),
        time: "25:00",
        duration: 15,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/api/slots", "POST", {
        date: futureDate(20),
        time: "10:00",
        duration: 0,
      })
    ).status,
    400,
  );
});
