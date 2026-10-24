import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

// Wrangler tracks applied filenames in D1; this command is safe to repeat.
const root = process.cwd();
const built = JSON.parse(readFileSync("dist/server/wrangler.json", "utf8"));
mkdirSync(".sites-runtime", { recursive: true });
const config = {
  name: "sunroom-local-migrations",
  compatibility_date: built.compatibility_date,
  d1_databases: built.d1_databases.map((db) => ({
    ...db,
    migrations_dir: path.join(root, "drizzle"),
  })),
};
const configPath = path.join(root, ".sites-runtime", "local-migrations.json");
writeFileSync(configPath, JSON.stringify(config));
const result = spawnSync(
  process.execPath,
  [
    "--import",
    "./scripts/sites-env.mjs",
    "./node_modules/wrangler/bin/wrangler.js",
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--config",
    configPath,
    "--persist-to",
    ".wrangler/state",
  ],
  { stdio: "inherit", env: { ...process.env, CI: "true" } },
);
process.exit(result.status ?? 1);
