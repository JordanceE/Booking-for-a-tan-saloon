import { database, handle, json } from "@/lib/api";
/** One-time, explicit demo bootstrap. It never resets or replenishes existing data. */
export async function POST() {
  return handle(async () => {
    const db = database();
    if (
      await db.prepare("SELECT key FROM settings WHERE key = 'demo_v1'").first()
    )
      return json({ ready: true });
    const base = new Date();
    base.setUTCHours(0, 0, 0, 0);
    const statements: D1PreparedStatement[] = [];
    for (let day = 1; day <= 10; day++) {
      for (const [index, minute] of [
        540, 570, 615, 660, 780, 825, 870, 930,
      ].entries()) {
        const startsAt = base.getTime() + day * 86_400_000 + minute * 60_000;
        const duration = [15, 10, 20, 15, 10, 20, 15, 20][index];
        statements.push(
          db
            .prepare(
              `INSERT INTO slots (id, starts_at, duration)
          SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'demo_v1')
          AND NOT EXISTS (SELECT 1 FROM slots WHERE starts_at < ? AND starts_at + duration * 60000 > ?)`,
            )
            .bind(
              crypto.randomUUID(),
              startsAt,
              duration,
              startsAt + duration * 60_000,
              startsAt,
            ),
        );
      }
    }
    statements.push(
      db.prepare(
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('demo_v1', 'ready')",
      ),
    );
    await db.batch(statements);
    return json({ ready: true });
  });
}
