import { expect, test } from "@playwright/test";
import crypto from "node:crypto";

const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";
const testDatabaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, "").toLowerCase();
if (!testDatabaseName.includes("test")) {
  throw new Error(`Refusing to run rate-limit integration coverage against non-test database: ${testDatabaseName}`);
}
process.env.DATABASE_URL = testDatabaseUrl;
process.env.RATE_LIMIT_STORE = "postgres";

const [{ consumeRateLimitKey, ensureRateLimitStore }, { pool }] = await Promise.all([
  import("../../src/server/rate-limit.js"),
  import("../../server/src/db/pool.js"),
]);

test("atomically enforces a shared PostgreSQL rate limit under concurrency", async () => {
  const key = `e2e:rate-limit:${crypto.randomUUID()}`;
  try {
    await ensureRateLimitStore();
    const results = await Promise.all(
      Array.from({ length: 24 }, () => consumeRateLimitKey(key, { limit: 20, windowMs: 60_000 }))
    );

    expect(results.filter((result) => !result.limited)).toHaveLength(20);
    expect(results.filter((result) => result.limited)).toHaveLength(4);

    const persisted = await pool.query("SELECT count FROM rate_limit_buckets WHERE key = $1", [key]);
    expect(Number(persisted.rows[0]?.count)).toBe(20);
  } finally {
    await pool.query("DELETE FROM rate_limit_buckets WHERE key = $1", [key]);
  }
});
