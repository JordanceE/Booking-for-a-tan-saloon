import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";

export function testDatabase(t) {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync(new URL("../../drizzle/", import.meta.url))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    sqlite.exec(
      readFileSync(new URL("../../drizzle/" + file, import.meta.url), "utf8"),
    );
  }
  t.after(() => sqlite.close());
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let parameters = [];
      return {
        bind(...values) {
          parameters = values;
          return this;
        },
        async first() {
          return statement.get(...parameters) ?? null;
        },
        async all() {
          return { results: statement.all(...parameters) };
        },
        async run() {
          const result = statement.run(...parameters);
          return { meta: { changes: Number(result.changes) } };
        },
      };
    },
  };
  function slot(offset = 0, duration = 15) {
    const id = crypto.randomUUID();
    const startsAt = Date.now() + 2 * 86_400_000 + offset * 60_000;
    sqlite
      .prepare("INSERT INTO slots (id, starts_at, duration) VALUES (?, ?, ?)")
      .run(id, startsAt, duration);
    return { id, startsAt, duration };
  }
  return { db, sqlite, slot };
}
export const reply = (body, status = 200) => Response.json(body, { status });
export const abortingFetch = async (_url, init) =>
  new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new Error("Aborted")), {
      once: true,
    });
  });
