// @ts-nocheck
import "dotenv/config";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { subscriptionPlans } from "../src/lib/subscriptionPlans.ts";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const STALE_BUSINESS_PLAN_DESCRIPTION = "برای شرکت‌هایی که چند نفر همزمان روی بار، سند، مشتری، چک و استعلام نرخ کار می‌کنند و دید مدیریتی دقیق‌تری می‌خواهند.";
const CURRENT_BUSINESS_PLAN_DESCRIPTION = subscriptionPlans.find((plan) => plan.id === "business")?.description || "";
const RETIRED_TABLES = [
  "cheques",
  "compliance_meetings",
  "meeting_required_documents",
  "ai_business_search_index",
  "organization_ai_memory",
  "organization_ai_memory_items",
];

const mode = process.argv[2] || "fresh";
const isCurrentSchemaMode = mode === "current-schema";
if (!["fresh", "current-schema"].includes(mode)) {
  throw new Error(`Unknown migration verification mode: ${mode}`);
}

const defaultFreshUrl = "postgres://postgres@localhost:5432/logisticplus_migration_fresh_test";
const defaultCurrentUrl = "postgres://postgres@localhost:5432/logisticplus_migration_current_test";
const databaseUrl = isCurrentSchemaMode
  ? process.env.MIGRATION_CURRENT_TEST_DATABASE_URL || process.env.MIGRATION_TEST_DATABASE_URL || defaultCurrentUrl
  : process.env.MIGRATION_TEST_DATABASE_URL || defaultFreshUrl;
const adminUrl = process.env.POSTGRES_ADMIN_URL || withDatabase(databaseUrl, "postgres");
const keepDatabase = process.env.KEEP_MIGRATION_TEST_DB === "true";

function withDatabase(connectionString: string, databaseName: string) {
  const parsed = new URL(connectionString);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

function getDatabaseName(connectionString: string) {
  const parsed = new URL(connectionString);
  const databaseName = parsed.pathname.replace(/^\//, "");
  if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
    throw new Error(`Unsafe migration test database name: ${databaseName}`);
  }
  const lowered = databaseName.toLowerCase();
  if (!lowered.includes("test") || (!lowered.includes("migration") && !lowered.includes("fresh"))) {
    throw new Error(`Refusing to reset non-migration test database: ${databaseName}`);
  }
  return databaseName;
}

async function resetDatabase() {
  const databaseName = getDatabaseName(databaseUrl);
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [databaseName]
    );
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await admin.query(`CREATE DATABASE ${databaseName}`);
  } finally {
    await admin.end();
  }
}

async function dropDatabase() {
  if (keepDatabase) return;
  const databaseName = getDatabaseName(databaseUrl);
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [databaseName]
    );
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
  } finally {
    await admin.end();
  }
}

async function applyCurrentSchemaSnapshot() {
  const schema = await fs.readFile(path.join(rootDir, "db", "schema.sql"), "utf8");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(schema);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

function runMigrationCommand() {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/migrate.ts", "up"], {
      cwd: rootDir,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`scripts/migrate.ts exited with code ${code}`));
    });
  });
}

async function tableExists(client, tableName: string) {
  const result = await client.query("SELECT to_regclass($1) AS name", [`public.${tableName}`]);
  return Boolean(result.rows[0]?.name);
}

async function indexExists(client, indexName: string) {
  const result = await client.query("SELECT to_regclass($1) AS name", [`public.${indexName}`]);
  return Boolean(result.rows[0]?.name);
}

async function columnExists(client, tableName: string, columnName: string) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1
         AND column_name = $2
     ) AS exists`,
    [tableName, columnName]
  );
  return Boolean(result.rows[0]?.exists);
}

async function expectMutationBlocked(client, sql: string, params: unknown[]) {
  try {
    await client.query(sql, params);
  } catch {
    return;
  }
  throw new Error(`Expected audit_logs mutation to be blocked: ${sql}`);
}

async function verifySchema() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const requiredTables = [
      "organizations",
      "app_users",
      "customers",
      "shipments",
      "documents",
      "subscription_plans",
      "organization_subscriptions",
      "permissions",
      "roles",
      "change_logs",
      "audit_logs",
    ];
    for (const tableName of requiredTables) {
      if (!(await tableExists(client, tableName))) {
        throw new Error(`Missing required table after migrations: ${tableName}`);
      }
    }

    for (const tableName of RETIRED_TABLES) {
      if (await tableExists(client, tableName)) {
        throw new Error(`Retired feature table still exists after migrations: ${tableName}`);
      }
    }

    for (const columnName of ["meeting_id", "cheque_id"]) {
      if (await columnExists(client, "documents", columnName)) {
        throw new Error(`Retired feature column still exists after migrations: documents.${columnName}`);
      }
    }

    const retiredPermissions = await client.query(
      `SELECT key
       FROM permissions
       WHERE LOWER(key) = ANY($1::text[])`,
      [["cheques.manage", "compliance.manage"]]
    );
    if (retiredPermissions.rowCount > 0) {
      throw new Error(`Retired permissions still exist after migrations: ${retiredPermissions.rows.map((row) => row.key).join(", ")}`);
    }

    const retiredRoles = await client.query(
      `SELECT name
       FROM roles
       WHERE UPPER(name) = ANY($1::text[])`,
      [["COMPLIANCE_STAFF", "FINANCE"]]
    );
    const roleNames = new Set(retiredRoles.rows.map((row) => String(row.name).toUpperCase()));
    if (roleNames.has("COMPLIANCE_STAFF")) {
      throw new Error("Retired COMPLIANCE_STAFF role still exists after migrations.");
    }
    if (!roleNames.has("FINANCE")) {
      throw new Error("FINANCE role must remain after retiring cheque-specific access.");
    }

    const retiredPlanFeatures = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM subscription_plans plans
       WHERE EXISTS (
         SELECT 1
         FROM jsonb_object_keys(COALESCE(plans.features, '{}'::jsonb)) AS feature(feature_name)
         WHERE LOWER(feature.feature_name) IN ('cheques', 'compliance')
       )`
    );
    if (Number(retiredPlanFeatures.rows[0]?.count || 0) > 0) {
      throw new Error("Retired cheque/compliance keys still exist in subscription plan features.");
    }

    const retiredSubscriptionOverrides = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM organization_subscriptions subscriptions
       WHERE EXISTS (
         SELECT 1
         FROM jsonb_object_keys(COALESCE(subscriptions.limits_override, '{}'::jsonb)) AS override(override_name)
         WHERE LOWER(override.override_name) IN ('cheques', 'compliance')
       )`
    );
    if (Number(retiredSubscriptionOverrides.rows[0]?.count || 0) > 0) {
      throw new Error("Retired cheque/compliance keys still exist in subscription overrides.");
    }

    if (!CURRENT_BUSINESS_PLAN_DESCRIPTION) {
      throw new Error("Current business subscription plan description is missing from source.");
    }
    const businessPlanDescription = await client.query(
      `SELECT description
       FROM subscription_plans
       WHERE id = 'business'`
    );
    if (businessPlanDescription.rowCount > 1) {
      throw new Error("Business subscription plan must not exist more than once after migrations.");
    }
    if (businessPlanDescription.rows[0]?.description === STALE_BUSINESS_PLAN_DESCRIPTION) {
      throw new Error("Business subscription plan still contains the retired cheque description.");
    }
    if (
      businessPlanDescription.rowCount === 1
      && businessPlanDescription.rows[0].description !== CURRENT_BUSINESS_PLAN_DESCRIPTION
    ) {
      throw new Error("Business subscription plan description does not match the current source description.");
    }

    const requiredIndexes = [
      "app_users_org_id_idx",
      "customers_org_id_idx",
      "shipments_org_id_idx",
      "documents_org_id_idx",
      "shipments_customer_access_token_hash_unique_idx",
      "audit_logs_organization_idx",
      "documents_storage_migration_status_idx",
    ];
    for (const indexName of requiredIndexes) {
      if (!(await indexExists(client, indexName))) {
        throw new Error(`Missing required index after migrations: ${indexName}`);
      }
    }

    const triggerResult = await client.query(
      `SELECT tgname
       FROM pg_trigger
       WHERE tgrelid = 'audit_logs'::regclass
         AND tgname IN ('audit_logs_prevent_update', 'audit_logs_prevent_delete')`
    );
    const triggerNames = new Set(triggerResult.rows.map((row) => row.tgname));
    for (const triggerName of ["audit_logs_prevent_update", "audit_logs_prevent_delete"]) {
      if (!triggerNames.has(triggerName)) {
        throw new Error(`Missing append-only audit trigger: ${triggerName}`);
      }
    }

    const auditId = `migration-test-${Date.now()}`;
    await client.query(
      `INSERT INTO audit_logs (id, actor_type, event_type, resource_type, metadata_json)
       VALUES ($1, 'system', 'migration.verify', 'migration', '{}'::jsonb)`,
      [auditId]
    );
    await expectMutationBlocked(client, "UPDATE audit_logs SET event_type = 'tampered' WHERE id = $1", [auditId]);
    await expectMutationBlocked(client, "DELETE FROM audit_logs WHERE id = $1", [auditId]);

    const applied = await client.query("SELECT COUNT(*)::int AS count FROM schema_migrations");
    if (Number(applied.rows[0]?.count || 0) < 1) {
      throw new Error("schema_migrations did not record applied migrations.");
    }
  } finally {
    await client.end();
  }
}

async function main() {
  await resetDatabase();
  try {
    if (isCurrentSchemaMode) {
      await applyCurrentSchemaSnapshot();
      console.log(`Applied current schema snapshot to ${getDatabaseName(databaseUrl)}.`);
    }

    await runMigrationCommand();
    await runMigrationCommand();
    await verifySchema();
    console.log(`Migration verification passed for ${mode} database ${getDatabaseName(databaseUrl)}.`);
  } finally {
    await dropDatabase();
  }
}

main().catch((error) => {
  console.error("Migration verification failed:", error);
  process.exit(1);
});
