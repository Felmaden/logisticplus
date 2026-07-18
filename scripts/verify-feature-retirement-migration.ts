// @ts-nocheck
import "dotenv/config";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const migrationsDir = path.join(rootDir, "db", "migrations");
const targetMigrationName = "20260718120000_remove_cheques_compliance_meetings.sql";
const targetMigrationId = targetMigrationName.replace(/\.sql$/, "");
const exactDisposableDatabaseName = "logisticplus_feature_retirement_test";
const databaseUrl = process.env.RETIREMENT_MIGRATION_TEST_DATABASE_URL || "";

const ids = {
  organization: "retirement-test-organization",
  plan: "business",
  subscription: "retirement-test-subscription",
  complianceUser: "retirement-test-compliance-user",
  operationsUser: "retirement-test-operations-user",
  customer: "retirement-test-customer",
  shipment: "retirement-test-shipment",
  quotation: "retirement-test-quotation",
  cheque: "retirement-test-cheque",
  meeting: "retirement-test-meeting",
  requiredDocument: "retirement-test-required-document",
  document: "retirement-test-shared-document",
  documentVersion: "retirement-test-shared-document-v1",
  task: "retirement-test-preserved-task",
  legacyCamelTask: "retirement-test-legacy-camel-task",
  legacySnakeTask: "retirement-test-legacy-snake-task",
  unrelatedTask: "retirement-test-unrelated-task",
  smsDelivery: "retirement-test-preserved-sms-delivery",
  audit: "retirement-test-audit",
  change: "retirement-test-change",
  unrelatedNotification: "retirement-test-unrelated-notification",
  unrelatedArchive: "retirement-test-unrelated-archive",
};

const retiredCompatibilityRecordIds = [
  ids.cheque,
  ids.meeting,
  "retirement-test-deleted-cheque",
  "retirement-test-deleted-appointment",
  "retirement-test-deleted-compliance",
  "retirement-test-compat-source-type-cheque",
  "retirement-test-compat-source-type-appointment",
  "retirement-test-compat-source-type-compliance",
  "retirement-test-compat-source-id-camel",
  "retirement-test-compat-source-id-snake",
  "retirement-test-compat-link",
  "retirement-test-compat-nested-link",
];

const retiredCanonicalNotificationIds = [
  "retirement-test-notification-source-cheque",
  "retirement-test-notification-source-appointment",
  "retirement-test-notification-source-compliance",
  ...["cheques", "appointments", "compliance", "compliance-meetings"].flatMap((route) => [
    `retirement-test-notification-source-route-${route}`,
    `retirement-test-notification-legacy-route-${route}`,
  ]),
];

const retiredArchiveIds = [
  "retirement-test-cheque-archive",
  "retirement-test-appointment-archive",
  "retirement-test-meeting-archive",
];

const oldBusinessDescription =
  "برای شرکت‌هایی که چند نفر همزمان روی بار، سند، مشتری، چک و استعلام نرخ کار می‌کنند و دید مدیریتی دقیق‌تری می‌خواهند.";
const newBusinessDescription =
  "برای شرکت‌هایی که چند نفر همزمان روی بار، سند، مشتری و استعلام نرخ کار می‌کنند و دید مدیریتی دقیق‌تری می‌خواهند.";

function checksum(content: string) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function parseAndGuardDatabaseUrl(connectionString: string) {
  if (process.env.RETIREMENT_MIGRATION_TEST_DISPOSABLE !== "true") {
    throw new Error(
      "RETIREMENT_MIGRATION_TEST_DISPOSABLE=true is required before disposable database reset."
    );
  }

  if (!connectionString) {
    throw new Error(
      "RETIREMENT_MIGRATION_TEST_DATABASE_URL is required; no default database is permitted."
    );
  }

  const parsed = new URL(connectionString);
  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) {
    throw new Error("The retirement verifier requires a PostgreSQL connection URL.");
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  if (!localHosts.has(parsed.hostname.toLowerCase())) {
    throw new Error("Refusing a non-loopback PostgreSQL server for retirement verification.");
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
    throw new Error("The disposable retirement database name contains unsafe characters.");
  }

  if (databaseName !== exactDisposableDatabaseName) {
    throw new Error(
      `Refusing to reset any database except ${exactDisposableDatabaseName}.`
    );
  }

  return { parsed, databaseName };
}

const guardedConnection = parseAndGuardDatabaseUrl(databaseUrl);
const databaseName = guardedConnection.databaseName;
const adminUrl = (() => {
  const parsed = new URL(databaseUrl);
  parsed.pathname = "/postgres";
  return parsed.toString();
})();

async function assertPostgres16() {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const result = await admin.query("SHOW server_version_num");
    const versionNumber = Number(result.rows[0]?.server_version_num || 0);
    assert.equal(
      Math.floor(versionNumber / 10_000),
      16,
      "Retirement migration verification must run against PostgreSQL 16."
    );
  } finally {
    await admin.end();
  }
}

async function terminateConnections(admin: InstanceType<typeof Client>) {
  await admin.query(
    `SELECT pg_terminate_backend(pid)
     FROM pg_stat_activity
     WHERE datname = $1
       AND pid <> pg_backend_pid()`,
    [databaseName]
  );
}

async function resetDatabase() {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await terminateConnections(admin);
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await admin.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await admin.end();
  }
}

async function dropDatabase() {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await terminateConnections(admin);
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  } finally {
    await admin.end();
  }
}

async function loadMigrations() {
  const names = (await fs.readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  assert.ok(names.includes(targetMigrationName), `Missing ${targetMigrationName}`);

  return Promise.all(
    names.map(async (name) => {
      const filePath = path.join(migrationsDir, name);
      const sql = (await fs.readFile(filePath, "utf8"))
        .replace(/^\uFEFF/, "")
        .replace(/\r\n?/g, "\n");
      return {
        id: name.replace(/\.sql$/, ""),
        name,
        sql,
        checksum: checksum(sql),
      };
    })
  );
}

async function ensureMigrationsTable(client: InstanceType<typeof Client>) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function applyMigration(
  client: InstanceType<typeof Client>,
  migration: { id: string; name: string; sql: string; checksum: string },
  recordInHistory = true
) {
  await client.query("BEGIN");
  try {
    await client.query(migration.sql);
    if (recordInHistory) {
      await client.query(
        `INSERT INTO schema_migrations (id, name, checksum, applied_at)
         VALUES ($1, $2, $3, NOW())`,
        [migration.id, migration.name, migration.checksum]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

async function seedSyntheticState(client: InstanceType<typeof Client>) {
  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO subscription_plans (
         id, name, description, monthly_price_irr, annual_price_irr,
         limits, features, is_public, sort_order, created_at, updated_at
       )
       VALUES (
         $1, 'Retirement verifier business plan', $2, 100, 1000,
         '{"users": 10, "documents": 500}'::jsonb,
         '{"chat": true, "Cheques": true, "COMPLIANCE": true}'::jsonb,
         FALSE, 999, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'
       )
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         monthly_price_irr = EXCLUDED.monthly_price_irr,
         annual_price_irr = EXCLUDED.annual_price_irr,
         limits = EXCLUDED.limits,
         features = EXCLUDED.features,
         is_public = EXCLUDED.is_public,
         sort_order = EXCLUDED.sort_order,
         created_at = EXCLUDED.created_at,
         updated_at = EXCLUDED.updated_at`,
      [ids.plan, oldBusinessDescription]
    );

    await client.query(
      `INSERT INTO organizations (
         id, name, slug, status, plan_id, legacy_data, created_at, updated_at
       )
       VALUES (
         $1, 'Synthetic retirement tenant', 'synthetic-retirement-tenant',
         'active', $2, '{"preserve": true}'::jsonb,
         '2026-01-03T00:00:00Z', '2026-01-04T00:00:00Z'
       )`,
      [ids.organization, ids.plan]
    );

    await client.query(
      `INSERT INTO app_users (
         id, name, email, password_hash, role, organization_id, status,
         created_at, updated_at
       )
       VALUES
         ($1, 'Synthetic compliance user', 'compliance.retirement.test@example.invalid',
          'not-a-real-password-hash', 'COMPLIANCE_STAFF', $3, 'active',
          '2026-01-05T00:00:00Z', '2026-01-06T00:00:00Z'),
         ($2, 'Synthetic operations user', 'operations.retirement.test@example.invalid',
          'not-a-real-password-hash', 'OPERATIONS', $3, 'active',
          '2026-01-07T00:00:00Z', '2026-01-08T00:00:00Z')`,
      [ids.complianceUser, ids.operationsUser, ids.organization]
    );

    await client.query(
      `UPDATE organizations
       SET owner_user_id = $2
       WHERE id = $1`,
      [ids.organization, ids.operationsUser]
    );

    await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role, status, joined_at)
       VALUES
         ($1, $2, 'COMPLIANCE_STAFF', 'active', '2026-01-09T00:00:00Z'),
         ($1, $3, 'member', 'active', '2026-01-10T00:00:00Z')`,
      [ids.organization, ids.complianceUser, ids.operationsUser]
    );

    await client.query(
      `INSERT INTO organization_subscriptions (
         id, organization_id, plan_id, status, billing_cycle, limits_override,
         created_at, updated_at
       )
       VALUES (
         $1, $2, $3, 'active', 'monthly',
         '{"documents": 700, "CHEQUES": 25, "Compliance": 50}'::jsonb,
         '2026-01-11T00:00:00Z', '2026-01-12T00:00:00Z'
       )`,
      [ids.subscription, ids.organization, ids.plan]
    );

    await client.query(
      `INSERT INTO roles (id, name, description, created_at, updated_at)
       VALUES
         ('role-operations', 'OPERATIONS', 'Shipment operations access',
          '2026-01-13T00:00:00Z', '2026-01-14T00:00:00Z'),
         ('role-compliance-staff', 'COMPLIANCE_STAFF', 'Compliance meeting access',
          '2026-01-13T00:00:00Z', '2026-01-14T00:00:00Z'),
         ('role-finance', 'FINANCE', 'Finance and cheque access',
          '2026-01-13T00:00:00Z', '2026-01-14T00:00:00Z')
       ON CONFLICT (name) DO UPDATE SET
         description = EXCLUDED.description,
         updated_at = EXCLUDED.updated_at`
    );

    await client.query(
      `INSERT INTO permissions (id, key, description)
       VALUES
         ('perm-cheques-manage', 'cheques.manage', 'Manage cheques'),
         ('perm-compliance-manage', 'compliance.manage', 'Manage compliance meetings'),
         ('perm-tasks-view-all', 'tasks.view_all', 'View company tasks')
       ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description`
    );

    await client.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT role.id, permission.id
       FROM roles role
       CROSS JOIN permissions permission
       WHERE role.name IN ('OPERATIONS', 'COMPLIANCE_STAFF')
         AND permission.key = 'tasks.view_all'
       ON CONFLICT (role_id, permission_id) DO NOTHING`
    );
    await client.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT role.id, permission.id
       FROM roles role
       CROSS JOIN permissions permission
       WHERE role.name IN ('COMPLIANCE_STAFF', 'FINANCE')
         AND permission.key IN ('cheques.manage', 'compliance.manage')
       ON CONFLICT (role_id, permission_id) DO NOTHING`
    );
    await client.query(
      `INSERT INTO user_permissions (user_id, permission_id, granted_by_id, reason, created_at)
       SELECT $1, permission.id, $2, 'Synthetic retirement verifier grant',
              '2026-01-15T00:00:00Z'
       FROM permissions permission
       WHERE permission.key IN ('cheques.manage', 'compliance.manage')
       ON CONFLICT (user_id, permission_id) DO NOTHING`,
      [ids.complianceUser, ids.operationsUser]
    );

    await client.query(
      `INSERT INTO customers (
         id, organization_id, owner_user_id, customer_code, company_name, contact_name,
         email, phone, address, notes, status, legacy_data, created_by_id,
         created_at, updated_at
       )
       VALUES (
         $1, $2, $3, 'RTC001', 'Synthetic preserved customer', 'Synthetic contact',
         'customer.retirement.test@example.invalid', '00000000000',
         'Synthetic address', 'Preserved document relation', 'active',
         '{"preserve": true}'::jsonb, $3,
         '2026-01-15T01:00:00Z', '2026-01-15T02:00:00Z'
       )`,
      [ids.customer, ids.organization, ids.operationsUser]
    );

    await client.query(
      `INSERT INTO shipments (
         id, organization_id, owner_user_id, shipment_code, customer_id,
         customer_name, status, priority, shipment_direction, transport_mode,
         shipment_type_code, origin, destination, assigned_manager_id,
         legacy_data, created_by_id, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, 'RETIREMENT-TEST-SHIPMENT', $4,
         'Synthetic preserved customer', 'IN_TRANSIT', 'normal', 'import', 'sea',
         'IMPORT_SEA_CONTAINER', 'Synthetic origin', 'Synthetic destination', $3,
         '{"preserve": true}'::jsonb, $3,
         '2026-01-15T03:00:00Z', '2026-01-15T04:00:00Z'
       )`,
      [ids.shipment, ids.organization, ids.operationsUser, ids.customer]
    );

    await client.query(
      `INSERT INTO quotations (
         id, organization_id, owner_user_id, quotation_number, customer_id,
         customer_name, origin_city, destination_city, cargo_type, status,
         legacy_data, created_by_id, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, 'RETIREMENT-TEST-QUOTATION', $4,
         'Synthetic preserved customer', 'Synthetic origin',
         'Synthetic destination', 'Synthetic cargo', 'PENDING',
         '{"preserve": true}'::jsonb, $3,
         '2026-01-15T05:00:00Z', '2026-01-15T06:00:00Z'
       )`,
      [ids.quotation, ids.organization, ids.operationsUser, ids.customer]
    );

    await client.query(
      `INSERT INTO cheques (
         id, organization_id, owner_user_id, bank_name, cheque_number, amount,
         currency, status, legacy_data, created_by_id, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, 'Synthetic bank', 'RETIREMENT-CHEQUE-1', 1200,
         'IRR', 'ACTIVE', '{"synthetic": true}'::jsonb, $4,
         '2026-01-16T00:00:00Z', '2026-01-17T00:00:00Z'
       )`,
      [ids.cheque, ids.organization, ids.complianceUser, ids.operationsUser]
    );

    await client.query(
      `INSERT INTO compliance_meetings (
         id, organization_id, owner_user_id, title, organization_name,
         meeting_at, status, assigned_to_id, assigned_to_name, legacy_data,
         created_by_id, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, 'Synthetic compliance meeting', 'Synthetic authority',
         '1405/01/01 09:00', 'SCHEDULED', $3, 'Synthetic compliance user',
         '{"synthetic": true}'::jsonb, $4,
         '2026-01-18T00:00:00Z', '2026-01-19T00:00:00Z'
       )`,
      [ids.meeting, ids.organization, ids.complianceUser, ids.operationsUser]
    );

    await client.query(
      `INSERT INTO documents (
         id, organization_id, owner_user_id, title, file_name, mime_type,
         file_size, storage_key, checksum, version, uploaded_by_id,
         uploaded_by_name, shipment_id, customer_id, meeting_id, cheque_id,
         quotation_id, visibility, legacy_data, storage_provider, object_key,
         storage_bucket, storage_region, local_path, checksum_sha256, size_bytes,
         content_type, storage_migrated_at, storage_verified_at,
         storage_migration_status, storage_migration_error, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, 'Shared preserved document', 'preserved.pdf',
         'application/pdf', '256', 'legacy/preserved.pdf', 'legacy-checksum', 1,
         $3, 'Synthetic operations user', $6, $7, $4, $5, $8, 'internal',
         '{"preserve": true}'::jsonb, 's3', 'objects/preserved.pdf',
         'synthetic-bucket', 'ir-thr-at1', 'synthetic-local/preserved.pdf',
         repeat('a', 64), 256, 'application/pdf',
         '2026-01-20T01:00:00Z', '2026-01-20T02:00:00Z', 'verified',
         'synthetic-preserved-migration-note',
         '2026-01-20T00:00:00Z', '2026-01-21T00:00:00Z'
       )`,
      [
        ids.document,
        ids.organization,
        ids.operationsUser,
        ids.meeting,
        ids.cheque,
        ids.shipment,
        ids.customer,
        ids.quotation,
      ]
    );

    await client.query(
      `INSERT INTO document_versions (
         id, organization_id, document_id, version, storage_key, file_name,
         uploaded_by_id, storage_provider, object_key, storage_bucket,
         storage_region, local_path, checksum_sha256, size_bytes, content_type,
         storage_migrated_at, storage_verified_at, storage_migration_status,
         storage_migration_error, created_at
       )
       VALUES (
         $1, $2, $3, 1, 'legacy/preserved-v1.pdf', 'preserved.pdf', $4,
         's3', 'objects/preserved-v1.pdf', 'synthetic-bucket', 'ir-thr-at1',
         'synthetic-local/preserved-v1.pdf', repeat('b', 64), 256,
         'application/pdf', '2026-01-22T01:00:00Z', '2026-01-22T02:00:00Z',
         'verified', 'synthetic-preserved-version-note',
         '2026-01-22T00:00:00Z'
       )`,
      [ids.documentVersion, ids.organization, ids.document, ids.operationsUser]
    );

    await client.query(
      `INSERT INTO meeting_required_documents (
         id, organization_id, meeting_id, name, required, completed,
         file_name, document_id, legacy_data, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, 'Synthetic required document', TRUE, TRUE,
         'preserved.pdf', $4, '{"synthetic": true}'::jsonb,
         '2026-01-23T00:00:00Z', '2026-01-24T00:00:00Z'
       )`,
      [ids.requiredDocument, ids.organization, ids.meeting, ids.document]
    );

    await client.query(
      `INSERT INTO tasks (
         id, organization_id, owner_user_id, title, status, priority,
         assigned_to_id, source_type, source_id, legacy_data, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, 'Preserved task from retired meeting', 'TODO', 'HIGH',
         $3, 'COMPLIANCE_MEETING', $4,
         '{"keep":"task-metadata"}'::jsonb,
         '2026-01-25T00:00:00Z', '2026-01-26T00:00:00Z'
       )`,
      [ids.task, ids.organization, ids.complianceUser, ids.meeting]
    );

    await client.query(
      `INSERT INTO tasks (
         id, organization_id, owner_user_id, title, status, priority,
         assigned_to_id, source_type, source_id, legacy_data, created_at, updated_at
       )
       VALUES
         ($1, $3, $4, 'Legacy camel-source task', 'TODO', 'MEDIUM', $4,
          'manual', $5::text,
          jsonb_build_object('sourceType', 'COMPLIANCE_MEETING', 'sourceId', $5::text,
                             'keep', 'legacy-camel-task'),
          '2026-01-25T01:00:00Z', '2026-01-26T01:00:00Z'),
         ($2, $3, $4, 'Legacy snake-source task', 'TODO', 'MEDIUM', $4,
          'manual', $5::text,
          jsonb_build_object('source_type', 'COMPLIANCE_MEETING', 'source_id', $5::text,
                             'keep', 'legacy-snake-task'),
          '2026-01-25T02:00:00Z', '2026-01-26T02:00:00Z')`,
      [
        ids.legacyCamelTask,
        ids.legacySnakeTask,
        ids.organization,
        ids.complianceUser,
        ids.meeting,
      ]
    );

    await client.query(
      `INSERT INTO tasks (
         id, organization_id, owner_user_id, title, description, status, priority,
         assigned_to_id, assigned_to_name, assigned_by_id, assigned_by_name,
         assigned_at, assignment_note, due_at, source_type, source_id,
         shipment_id, customer_id, legacy_data, completed_at,
         completed_by_user_id, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, 'Unrelated fully preserved task',
         'Every unrelated task field must remain unchanged', 'TODO', 'LOW',
         $3, 'Synthetic operations user', $3, 'Synthetic operations user',
         '2026-01-26T01:00:00Z', 'Preserve assignment note', '1405/02/01',
         'manual', 'unrelated-manual-source', $4, $5,
         '{"preserve":"all-task-fields"}'::jsonb, NULL, NULL,
         '2026-01-26T02:00:00Z', '2026-01-26T03:00:00Z'
       )`,
      [ids.unrelatedTask, ids.organization, ids.operationsUser, ids.shipment, ids.customer]
    );

    const userRecords = [
      [
        "TaSkS",
        ids.task,
        {
          id: ids.task,
          title: "Preserved task snapshot",
          sourceType: "COMPLIANCE_MEETING",
          sourceId: ids.meeting,
          keep: "task-snapshot",
        },
      ],
      [
        "TASKS",
        ids.legacySnakeTask,
        {
          id: ids.legacySnakeTask,
          title: "Preserved snake-source task snapshot",
          source_type: "COMPLIANCE_MEETING",
          source_id: ids.meeting,
          keep: "snake-task-snapshot",
        },
      ],
      [
        "UsErS",
        ids.complianceUser,
        { id: ids.complianceUser, role: "COMPLIANCE_STAFF", keep: "user-snapshot" },
      ],
      [
        "DeletedItems",
        "retirement-test-deleted-task",
        {
          id: "retirement-test-deleted-task",
          entityType: "TASK",
          data: {
            sourceType: "COMPLIANCE_MEETING",
            sourceId: ids.meeting,
            keep: "deleted-task-snapshot",
          },
        },
      ],
      [
        "DELETEDITEMS",
        "retirement-test-deleted-task-snake",
        {
          id: "retirement-test-deleted-task-snake",
          entity_type: "TASK",
          data: {
            source_type: "COMPLIANCE_MEETING",
            source_id: ids.meeting,
            keep: "deleted-task-snake-snapshot",
          },
        },
      ],
      ["CheQuEs", ids.cheque, { id: ids.cheque, keep: "must-be-deleted" }],
      ["Appointments", ids.meeting, { id: ids.meeting, keep: "must-be-deleted" }],
      [
        "DeletedItems",
        "retirement-test-deleted-cheque",
        { id: "retirement-test-deleted-cheque", entityType: "CHEQUE", data: { id: ids.cheque } },
      ],
      [
        "deletedITEMS",
        "retirement-test-deleted-appointment",
        {
          id: "retirement-test-deleted-appointment",
          entity_type: "APPOINTMENT",
          data: { id: ids.meeting },
        },
      ],
      [
        "DELETEDitems",
        "retirement-test-deleted-compliance",
        {
          id: "retirement-test-deleted-compliance",
          entityType: "COMPLIANCE_MEETING",
          data: { id: ids.meeting },
        },
      ],
      [
        "NoTiFiCaTiOnS",
        "retirement-test-compat-source-type-cheque",
        {
          id: "retirement-test-compat-source-type-cheque",
          sourceType: "CHEQUE",
        },
      ],
      [
        "Notifications",
        "retirement-test-compat-source-type-appointment",
        {
          id: "retirement-test-compat-source-type-appointment",
          source_type: "APPOINTMENT",
        },
      ],
      [
        "notifications",
        "retirement-test-compat-source-type-compliance",
        {
          id: "retirement-test-compat-source-type-compliance",
          sourceType: "COMPLIANCE_MEETING",
        },
      ],
      [
        "notifications",
        "retirement-test-compat-source-id-camel",
        {
          id: "retirement-test-compat-source-id-camel",
          sourceId: `/cheques/${ids.cheque}`,
        },
      ],
      [
        "notifications",
        "retirement-test-compat-source-id-snake",
        {
          id: "retirement-test-compat-source-id-snake",
          source_id: `/appointments/${ids.meeting}`,
        },
      ],
      [
        "notifications",
        "retirement-test-compat-link",
        {
          id: "retirement-test-compat-link",
          link: `/compliance/${ids.meeting}`,
        },
      ],
      [
        "notifications",
        "retirement-test-compat-nested-link",
        {
          id: "retirement-test-compat-nested-link",
          legacy_data: { link: `/compliance-meetings/${ids.meeting}` },
        },
      ],
      [
        "notifications",
        "retirement-test-compat-notification-preserved",
        {
          id: "retirement-test-compat-notification-preserved",
          sourceType: "TASK",
          sourceId: ids.task,
          link: `/tasks/${ids.task}`,
        },
      ],
      [
        "activityLogs",
        "retirement-test-historical-activity",
        {
          id: "retirement-test-historical-activity",
          entityType: "CHEQUE",
          note: "Historical activity remains append-only context",
        },
      ],
      [
        "settings",
        "retirement-test-unrelated-settings",
        { id: "retirement-test-unrelated-settings", keep: "unrelated-snapshot" },
      ],
    ];
    for (const [collection, itemId, data] of userRecords) {
      await client.query(
        `INSERT INTO user_records (
           owner_user_id, organization_id, collection, item_id, data,
           created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5::jsonb,
                 '2026-01-27T00:00:00Z', '2026-01-28T00:00:00Z')`,
        [ids.complianceUser, ids.organization, collection, itemId, JSON.stringify(data)]
      );
    }

    await client.query(
      `INSERT INTO notifications (
         id, organization_id, user_id, title, body, type, source_type,
         source_id, legacy_data, created_at
       )
       VALUES (
         $1, $2, $3, 'Preserved task', 'Synthetic', 'INFO', 'TASK', $4,
         jsonb_build_object('link', '/tasks/' || $4),
         '2026-01-31T00:00:00Z'
       )`,
      [ids.unrelatedNotification, ids.organization, ids.complianceUser, ids.task]
    );

    for (const [suffix, sourceType] of [
      ["cheque", "CHEQUE"],
      ["appointment", "APPOINTMENT"],
      ["compliance", "COMPLIANCE_MEETING"],
    ]) {
      await client.query(
        `INSERT INTO notifications (
           id, organization_id, user_id, title, body, type, source_type,
           source_id, legacy_data, created_at
         )
         VALUES ($1, $2, $3, 'Retired source type', 'Synthetic', 'INFO', $4,
                 'synthetic-source', '{}'::jsonb, '2026-01-29T00:00:00Z')`,
        [
          `retirement-test-notification-source-${suffix}`,
          ids.organization,
          ids.complianceUser,
          sourceType,
        ]
      );
    }

    for (const route of ["cheques", "appointments", "compliance", "compliance-meetings"]) {
      await client.query(
        `INSERT INTO notifications (
           id, organization_id, user_id, title, body, type, source_type,
           source_id, legacy_data, created_at
         )
         VALUES
           ($1, $3, $4, 'Retired source route', 'Synthetic', 'INFO', 'SYSTEM',
            $5, '{}'::jsonb, '2026-01-29T01:00:00Z'),
           ($2, $3, $4, 'Retired legacy route', 'Synthetic', 'INFO', 'SYSTEM',
            'synthetic-source', jsonb_build_object('link', $5),
            '2026-01-29T02:00:00Z')`,
        [
          `retirement-test-notification-source-route-${route}`,
          `retirement-test-notification-legacy-route-${route}`,
          ids.organization,
          ids.complianceUser,
          `/${route}/synthetic`,
        ]
      );
    }

    await client.query(
      `INSERT INTO archive_records (
         id, organization_id, owner_user_id, entity_type, entity_id, title,
         summary, archived_by_id, archived_at, legacy_data
       )
       VALUES
         ('retirement-test-cheque-archive', $1, $2, 'cheque', $3,
          'Retired cheque archive', 'Synthetic', $4, '2026-02-01T00:00:00Z', '{}'::jsonb),
         ('retirement-test-appointment-archive', $1, $2, 'appointment', $5,
          'Retired appointment archive', 'Synthetic', $4, '2026-02-01T01:00:00Z', '{}'::jsonb),
         ('retirement-test-meeting-archive', $1, $2, 'compliance_meeting', $5,
          'Retired meeting archive', 'Synthetic', $4, '2026-02-02T00:00:00Z', '{}'::jsonb),
         ($6, $1, $2, 'document', $7, 'Preserved document archive',
          'Synthetic preserved archive', $4, '2026-02-03T00:00:00Z',
          '{"keep": true}'::jsonb)`,
      [
        ids.organization,
        ids.complianceUser,
        ids.cheque,
        ids.operationsUser,
        ids.meeting,
        ids.unrelatedArchive,
        ids.document,
      ]
    );

    await client.query(
      `INSERT INTO sms_deliveries (
         id, organization_id, user_id, recipient_type, recipient_name,
         recipient_phone, message, status, provider, source_type, source_id,
         event_key, attempt_count, next_attempt_at, provider_message_id,
         provider_response, skip_reason, error_message, sent_at, skipped_at,
         failed_at, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, 'user', 'Synthetic compliance user', '00000000000',
         'Historical feature SMS must be preserved', 'sent', 'synthetic-provider',
         'COMPLIANCE_MEETING', $4, 'retirement-test-preserved-sms-event', 2,
         '2026-02-03T01:00:00Z', 'synthetic-provider-message',
         '{"preserve":"provider-response"}'::jsonb,
         'synthetic-skip-context', 'synthetic-error-context',
         '2026-02-03T02:00:00Z', '2026-02-03T03:00:00Z',
         '2026-02-03T04:00:00Z', '2026-02-03T05:00:00Z',
         '2026-02-03T06:00:00Z'
       )`,
      [ids.smsDelivery, ids.organization, ids.complianceUser, ids.meeting]
    );

    await client.query(
      `INSERT INTO audit_logs (
         id, organization_id, actor_user_id, actor_type, event_type,
         resource_type, resource_id, metadata_json, created_at
       )
       VALUES (
         $1, $2, $3, 'user', 'cheque.synthetic-history', 'cheque', $4,
         '{"keep": true}'::jsonb, '2026-02-04T00:00:00Z'
       )`,
      [ids.audit, ids.organization, ids.complianceUser, ids.cheque]
    );

    await client.query(
      `INSERT INTO change_logs (
         id, organization_id, actor_user_id, action, entity_type, entity_id,
         summary, before_json, after_json, created_at
       )
       VALUES (
         $1, $2, $3, 'UPDATE', 'COMPLIANCE_MEETING', $4,
         'Synthetic historical change', '{"before": true}'::jsonb,
         '{"after": true}'::jsonb, '2026-02-05T00:00:00Z'
       )`,
      [ids.change, ids.organization, ids.complianceUser, ids.meeting]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, normalize(nested)])
    );
  }
  return value;
}

async function rows(client: InstanceType<typeof Client>, sql: string, params: unknown[] = []) {
  return normalize((await client.query(sql, params)).rows);
}

async function scalarCount(client: InstanceType<typeof Client>, tableName: string) {
  assert.match(tableName, /^[a-z_]+$/);
  const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
  return Number(result.rows[0]?.count || 0);
}

async function capturePreservationSnapshot(client: InstanceType<typeof Client>) {
  const counts: Record<string, number> = {};
  for (const tableName of [
    "tasks",
    "documents",
    "document_versions",
    "sms_deliveries",
    "audit_logs",
    "change_logs",
  ]) {
    counts[tableName] = await scalarCount(client, tableName);
  }

  return {
    counts,
    documents: await rows(
      client,
      `SELECT to_jsonb(document_row) - 'meeting_id' - 'cheque_id' AS row
       FROM documents document_row
       ORDER BY document_row.id`
    ),
    documentVersions: await rows(
      client,
      `SELECT to_jsonb(version_row) AS row
       FROM document_versions version_row
       ORDER BY version_row.id`
    ),
    linkedEntities: await rows(
      client,
      `SELECT 'customer' AS entity_type, to_jsonb(customer_row) AS row
       FROM customers customer_row WHERE customer_row.id = $1
       UNION ALL
       SELECT 'quotation', to_jsonb(quotation_row)
       FROM quotations quotation_row WHERE quotation_row.id = $2
       UNION ALL
       SELECT 'shipment', to_jsonb(shipment_row)
       FROM shipments shipment_row WHERE shipment_row.id = $3
       ORDER BY entity_type`,
      [ids.customer, ids.quotation, ids.shipment]
    ),
    audits: await rows(client, "SELECT * FROM audit_logs ORDER BY id"),
    changes: await rows(client, "SELECT * FROM change_logs ORDER BY id"),
    smsDeliveries: await rows(
      client,
      "SELECT to_jsonb(sms_row) AS row FROM sms_deliveries sms_row ORDER BY sms_row.id"
    ),
    unrelatedTasks: await rows(
      client,
      "SELECT to_jsonb(task_row) AS row FROM tasks task_row WHERE task_row.id = $1",
      [ids.unrelatedTask]
    ),
    taskTimestamps: await rows(
      client,
      "SELECT id, created_at, updated_at FROM tasks ORDER BY id"
    ),
    preservedUserRecords: await rows(
      client,
      `SELECT collection, item_id, data, created_at, updated_at
       FROM user_records
       WHERE item_id IN (
         'retirement-test-compat-notification-preserved',
         'retirement-test-historical-activity',
         'retirement-test-unrelated-settings'
       )
       ORDER BY collection, item_id`
    ),
    unrelatedNotifications: await rows(
      client,
      "SELECT * FROM notifications WHERE id = $1 ORDER BY id",
      [ids.unrelatedNotification]
    ),
    unrelatedArchives: await rows(
      client,
      "SELECT * FROM archive_records WHERE id = $1 ORDER BY id",
      [ids.unrelatedArchive]
    ),
    operationsUser: await rows(
      client,
      "SELECT id, role, created_at, updated_at FROM app_users WHERE id = $1",
      [ids.operationsUser]
    ),
  };
}

async function tableExists(client: InstanceType<typeof Client>, tableName: string) {
  const result = await client.query("SELECT to_regclass($1) AS table_name", [`public.${tableName}`]);
  return Boolean(result.rows[0]?.table_name);
}

async function columnExists(
  client: InstanceType<typeof Client>,
  tableName: string,
  columnName: string
) {
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

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function captureDatabaseFingerprint(client: InstanceType<typeof Client>) {
  const tableResult = await client.query(
    `SELECT tablename
     FROM pg_tables
     WHERE schemaname = 'public'
     ORDER BY tablename`
  );
  const tableData: Record<string, unknown> = {};
  for (const { tablename } of tableResult.rows) {
    const identifier = quoteIdentifier(tablename);
    const result = await client.query(
      `SELECT to_jsonb(table_row) AS row
       FROM ${identifier} table_row
       ORDER BY to_jsonb(table_row)::text`
    );
    tableData[tablename] = normalize(result.rows.map((row) => row.row));
  }

  return normalize({
    tableData,
    columns: (
      await client.query(
        `SELECT table_name, column_name, ordinal_position, data_type, udt_name,
                is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = 'public'
         ORDER BY table_name, ordinal_position`
      )
    ).rows,
    constraints: (
      await client.query(
        `SELECT constrained_table.relname AS table_name,
                constraint_row.conname AS constraint_name,
                constraint_row.contype AS constraint_type,
                pg_get_constraintdef(constraint_row.oid, TRUE) AS definition
         FROM pg_constraint constraint_row
         JOIN pg_class constrained_table ON constrained_table.oid = constraint_row.conrelid
         JOIN pg_namespace constrained_namespace ON constrained_namespace.oid = constrained_table.relnamespace
         WHERE constrained_namespace.nspname = 'public'
         ORDER BY constrained_table.relname, constraint_row.conname`
      )
    ).rows,
    indexes: (
      await client.query(
        `SELECT tablename, indexname, indexdef
         FROM pg_indexes
         WHERE schemaname = 'public'
         ORDER BY tablename, indexname`
      )
    ).rows,
    triggers: (
      await client.query(
        `SELECT trigger_table.relname AS table_name,
                trigger_row.tgname AS trigger_name,
                pg_get_triggerdef(trigger_row.oid, TRUE) AS definition
         FROM pg_trigger trigger_row
         JOIN pg_class trigger_table ON trigger_table.oid = trigger_row.tgrelid
         JOIN pg_namespace trigger_namespace ON trigger_namespace.oid = trigger_table.relnamespace
         WHERE trigger_namespace.nspname = 'public'
           AND NOT trigger_row.tgisinternal
         ORDER BY trigger_table.relname, trigger_row.tgname`
      )
    ).rows,
  });
}

async function expectPreflightFailure(
  client: InstanceType<typeof Client>,
  migration: { sql: string },
  label: string,
  setup: () => Promise<void>,
  expectedMessage: RegExp
) {
  const before = await captureDatabaseFingerprint(client);
  await client.query("BEGIN");
  let failure: unknown;
  try {
    await setup();
    await client.query(migration.sql);
  } catch (error) {
    failure = error;
  } finally {
    await client.query("ROLLBACK");
  }

  assert.ok(failure, `${label} unexpectedly allowed the retirement migration`);
  assert.match(String((failure as Error).message || failure), expectedMessage, label);
  const after = await captureDatabaseFingerprint(client);
  assert.deepEqual(after, before, `${label} did not roll back every schema/data change`);
}

async function verifyPreflightRollbackPaths(
  client: InstanceType<typeof Client>,
  migration: { sql: string }
) {
  await expectPreflightFailure(
    client,
    migration,
    "Missing COMPLIANCE_STAFF catalog role preflight",
    async () => {
      await client.query("DELETE FROM roles WHERE UPPER(name) = 'COMPLIANCE_STAFF'");
    },
    /role catalog entry is missing/
  );

  await expectPreflightFailure(
    client,
    migration,
    "Missing OPERATIONS role preflight",
    async () => {
      await client.query("DELETE FROM roles WHERE UPPER(name) = 'OPERATIONS'");
    },
    /OPERATIONS role is missing/
  );

  await expectPreflightFailure(
    client,
    migration,
    "Incomplete OPERATIONS permission-equivalence preflight",
    async () => {
      await client.query(
        `DELETE FROM role_permissions grant_row
         USING roles role, permissions permission
         WHERE grant_row.role_id = role.id
           AND grant_row.permission_id = permission.id
           AND UPPER(role.name) = 'OPERATIONS'
           AND LOWER(permission.key) = 'tasks.view_all'`
      );
    },
    /OPERATIONS lacks a non-retired permission/
  );

  await expectPreflightFailure(
    client,
    migration,
    "OPERATIONS-only permission privilege-widening preflight",
    async () => {
      await client.query(
        `DELETE FROM role_permissions grant_row
         USING roles role, permissions permission
         WHERE grant_row.role_id = role.id
           AND grant_row.permission_id = permission.id
           AND UPPER(role.name) = 'COMPLIANCE_STAFF'
           AND LOWER(permission.key) = 'tasks.view_all'`
      );
    },
    /OPERATIONS has an additional non-retired permission/
  );

  await expectPreflightFailure(
    client,
    migration,
    "Non-object subscription-plan features preflight",
    async () => {
      await client.query(
        "UPDATE subscription_plans SET features = '[]'::jsonb WHERE id = $1",
        [ids.plan]
      );
    },
    /plan feature payload is not a JSON object/
  );

  await expectPreflightFailure(
    client,
    migration,
    "Non-object organization override preflight",
    async () => {
      await client.query(
        "UPDATE organization_subscriptions SET limits_override = '[]'::jsonb WHERE id = $1",
        [ids.subscription]
      );
    },
    /organization override payload is not a JSON object/
  );

  for (const legacyAiTable of [
    "ai_business_search_index",
    "organization_ai_memory",
    "organization_ai_memory_items",
  ]) {
    await expectPreflightFailure(
      client,
      migration,
      `Unexpected ${legacyAiTable} catalog-drift preflight`,
      async () => {
        await client.query(
          `CREATE TABLE ${quoteIdentifier(legacyAiTable)} (
             id TEXT PRIMARY KEY,
             synthetic_payload JSONB NOT NULL DEFAULT '{}'::jsonb
           )`
        );
      },
      /legacy AI tables unexpectedly exist and require scoped review/
    );
  }
}

function hashNormalizedRows(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}

async function captureStageOneBoundaryState(client: InstanceType<typeof Client>) {
  const state: Record<string, { count: number; hash: string }> = {};
  for (const tableName of [
    "cheques",
    "compliance_meetings",
    "documents",
    "tasks",
    "user_records",
  ]) {
    const identifier = quoteIdentifier(tableName);
    const result = await client.query(
      `SELECT to_jsonb(table_row) AS row
       FROM ${identifier} table_row
       ORDER BY to_jsonb(table_row)::text`
    );
    state[tableName] = {
      count: result.rowCount,
      hash: hashNormalizedRows(result.rows.map((row) => row.row)),
    };
  }

  const hiddenDeletedItems = await client.query(
    `SELECT to_jsonb(record_row) AS row
     FROM user_records record_row
     WHERE LOWER(collection) = 'deleteditems'
       AND UPPER(COALESCE(data->>'entityType', data->>'entity_type', '')) IN (
         'CHEQUE', 'APPOINTMENT', 'COMPLIANCE_MEETING'
       )
     ORDER BY to_jsonb(record_row)::text`
  );
  state.hiddenDeletedItems = {
    count: hiddenDeletedItems.rowCount,
    hash: hashNormalizedRows(hiddenDeletedItems.rows.map((row) => row.row)),
  };
  return state;
}

async function verifyStageOneCompatibilityBoundary(client: InstanceType<typeof Client>) {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;
  const moduleUrl = new URL("../src/server/db.js", import.meta.url);
  moduleUrl.searchParams.set("retirementVerifier", String(Date.now()));
  let databaseModule: any;
  try {
    databaseModule = await import(moduleUrl.href);
    const bootstrap = await databaseModule.getRecordsForUser(ids.complianceUser, {
      organizationId: ids.organization,
    });
    assert.ok(bootstrap, "Stage-1 bootstrap unexpectedly denied the synthetic tenant user");

    const retiredCollectionKeys = Object.keys(bootstrap).filter((key) =>
      new Set(["cheques", "appointments"]).has(key.toLowerCase())
    );
    assert.deepEqual(retiredCollectionKeys, [], "Stage-1 bootstrap exposed a retired collection");

    const allBootstrapRows = Object.values(bootstrap)
      .filter(Array.isArray)
      .flat();
    const leakedRetiredSnapshots = allBootstrapRows.filter((row: any) =>
      retiredCompatibilityRecordIds.includes(String(row?.id || ""))
    );
    assert.deepEqual(
      leakedRetiredSnapshots,
      [],
      "Stage-1 bootstrap exposed a retired compatibility snapshot"
    );

    const complianceUser = bootstrap.users?.find((user: any) => user.id === ids.complianceUser);
    assert.equal(complianceUser?.role, "OPERATIONS", "Stage-1 bootstrap did not normalize the role");
    for (const taskId of [ids.task, ids.legacyCamelTask, ids.legacySnakeTask]) {
      const normalizedTask = bootstrap.tasks?.find((task: any) => task.id === taskId);
      assert.equal(
        normalizedTask?.sourceType,
        "MANUAL",
        `Stage-1 bootstrap did not normalize task ${taskId}`
      );
      assert.equal(
        normalizedTask?.sourceId,
        undefined,
        `Stage-1 bootstrap exposed a retired source for task ${taskId}`
      );
    }

    const deletedItemRows = Object.entries(bootstrap)
      .filter(([collection]) => collection.toLowerCase() === "deleteditems")
      .flatMap(([, records]) => records as any[]);
    assert.equal(
      deletedItemRows.some((record: any) =>
        new Set(["CHEQUE", "APPOINTMENT", "COMPLIANCE_MEETING"]).has(
          String(record?.entityType || record?.entity_type || "").toUpperCase()
        )
      ),
      false,
      "Stage-1 bootstrap exposed a retired deleted-item tombstone"
    );
    const preservedDeletedTask = deletedItemRows.find(
      (record: any) => record.id === "retirement-test-deleted-task"
    );
    assert.equal(preservedDeletedTask?.data?.sourceType, "MANUAL");
    assert.equal(preservedDeletedTask?.data?.sourceId, undefined);
    assert.equal(preservedDeletedTask?.data?.source_id, undefined);
    assert.equal(preservedDeletedTask?.data?.source_type, undefined);
    const preservedDeletedSnakeTask = deletedItemRows.find(
      (record: any) => record.id === "retirement-test-deleted-task-snake"
    );
    assert.equal(preservedDeletedSnakeTask?.data?.sourceType, "MANUAL");
    assert.equal(preservedDeletedSnakeTask?.data?.sourceId, undefined);
    assert.equal(preservedDeletedSnakeTask?.data?.source_id, undefined);
    assert.equal(preservedDeletedSnakeTask?.data?.source_type, undefined);

    const before = await captureStageOneBoundaryState(client);
    const retiredCollectionsResult = await databaseModule.replaceRecordsForUser(
      ids.complianceUser,
      {
        ChEqUeS: [{ id: "retirement-test-old-client-cheque-write", amount: 999 }],
        aPpOiNtMeNtS: [{ id: "retirement-test-old-client-appointment-write" }],
      },
      { organizationId: ids.organization }
    );
    assert.deepEqual(retiredCollectionsResult, { total: 0 });

    const retiredDeletedItemsResult = await databaseModule.replaceRecordsForUser(
      ids.complianceUser,
      {
        dElEtEdItEmS: [
          { id: "retirement-test-old-client-deleted-cheque", entityType: "CHEQUE" },
          { id: "retirement-test-old-client-deleted-appointment", entity_type: "APPOINTMENT" },
          {
            id: "retirement-test-old-client-deleted-compliance",
            entityType: "COMPLIANCE_MEETING",
          },
        ],
      },
      { organizationId: ids.organization }
    );
    assert.deepEqual(retiredDeletedItemsResult, { total: 0 });

    const after = await captureStageOneBoundaryState(client);
    assert.deepEqual(
      after,
      before,
      "Stage-1 retired compatibility writes changed canonical or hidden retired data"
    );
  } finally {
    await databaseModule?.pool?.end();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
}

async function verifyRetirement(
  client: InstanceType<typeof Client>,
  before: Awaited<ReturnType<typeof capturePreservationSnapshot>>,
  expectedAppliedMigrationCount: number
) {
  for (const tableName of ["meeting_required_documents", "compliance_meetings", "cheques"]) {
    assert.equal(await tableExists(client, tableName), false, `${tableName} must be dropped`);
  }
  for (const columnName of ["meeting_id", "cheque_id"]) {
    assert.equal(
      await columnExists(client, "documents", columnName),
      false,
      `documents.${columnName} must be dropped`
    );
  }

  const after = await capturePreservationSnapshot(client);
  assert.deepEqual(after, before, "Shared and append-only records changed during retirement");

  const task = (await rows(
    client,
    `SELECT source_type, source_id, legacy_data, created_at, updated_at
     FROM tasks
     WHERE id = $1`,
    [ids.task]
  )) as Array<Record<string, unknown>>;
  assert.equal(task.length, 1, "The compliance-linked task must be preserved");
  assert.equal(task[0].source_type, "manual");
  assert.equal(task[0].source_id, null);
  assert.deepEqual(task[0].legacy_data, { keep: "task-metadata" });
  assert.equal(task[0].created_at, "2026-01-25T00:00:00.000Z");
  assert.equal(task[0].updated_at, "2026-01-26T00:00:00.000Z");

  const aliasTasks = (await rows(
    client,
    `SELECT id, source_type, source_id, legacy_data, created_at, updated_at
     FROM tasks
     WHERE id IN ($1, $2)
     ORDER BY id`,
    [ids.legacyCamelTask, ids.legacySnakeTask]
  )) as Array<Record<string, any>>;
  assert.equal(aliasTasks.length, 2, "Legacy-source canonical tasks must be preserved");
  for (const aliasTask of aliasTasks) {
    assert.equal(aliasTask.source_type, "manual");
    assert.equal(aliasTask.source_id, null);
    assert.equal(Object.keys(aliasTask.legacy_data).length, 1);
    assert.match(String(aliasTask.legacy_data.keep), /^legacy-(camel|snake)-task$/);
  }
  assert.deepEqual(
    aliasTasks.map(({ id, created_at, updated_at }) => ({ id, created_at, updated_at })),
    [
      {
        id: ids.legacyCamelTask,
        created_at: "2026-01-25T01:00:00.000Z",
        updated_at: "2026-01-26T01:00:00.000Z",
      },
      {
        id: ids.legacySnakeTask,
        created_at: "2026-01-25T02:00:00.000Z",
        updated_at: "2026-01-26T02:00:00.000Z",
      },
    ]
  );

  const snapshots = (await rows(
    client,
    `SELECT collection, item_id, data, created_at, updated_at
     FROM user_records
     WHERE item_id IN (
       $1, $2, $3,
       'retirement-test-deleted-task',
       'retirement-test-deleted-task-snake'
     )
     ORDER BY collection, item_id`,
    [ids.task, ids.complianceUser, ids.legacySnakeTask]
  )) as Array<Record<string, any>>;
  assert.equal(snapshots.length, 5, "Preserved task/user snapshots are missing");
  for (const snapshot of snapshots) {
    assert.equal(snapshot.created_at, "2026-01-27T00:00:00.000Z");
    assert.equal(snapshot.updated_at, "2026-01-28T00:00:00.000Z");
  }
  const taskSnapshot = snapshots.find((snapshot) => snapshot.item_id === ids.task);
  assert.deepEqual(taskSnapshot?.data, {
    id: ids.task,
    keep: "task-snapshot",
    title: "Preserved task snapshot",
    sourceType: "MANUAL",
  });
  const snakeTaskSnapshot = snapshots.find((snapshot) => snapshot.item_id === ids.legacySnakeTask);
  assert.deepEqual(snakeTaskSnapshot?.data, {
    id: ids.legacySnakeTask,
    keep: "snake-task-snapshot",
    title: "Preserved snake-source task snapshot",
    sourceType: "MANUAL",
  });
  const userSnapshot = snapshots.find((snapshot) => snapshot.collection.toLowerCase() === "users");
  assert.deepEqual(userSnapshot?.data, {
    id: ids.complianceUser,
    keep: "user-snapshot",
    role: "OPERATIONS",
  });
  const deletedTaskSnapshot = snapshots.find(
    (snapshot) => snapshot.item_id === "retirement-test-deleted-task"
  );
  assert.deepEqual(deletedTaskSnapshot?.data, {
    id: "retirement-test-deleted-task",
    entityType: "TASK",
    data: { keep: "deleted-task-snapshot", sourceType: "MANUAL" },
  });
  const deletedSnakeTaskSnapshot = snapshots.find(
    (snapshot) => snapshot.item_id === "retirement-test-deleted-task-snake"
  );
  assert.deepEqual(deletedSnakeTaskSnapshot?.data, {
    id: "retirement-test-deleted-task-snake",
    entity_type: "TASK",
    data: { keep: "deleted-task-snake-snapshot", sourceType: "MANUAL" },
  });

  const retiredCompatibilityRows = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM user_records
     WHERE LOWER(collection) IN ('cheques', 'appointments')
        OR (
          LOWER(collection) = 'deleteditems'
          AND UPPER(COALESCE(data->>'entityType', data->>'entity_type', '')) IN (
            'CHEQUE', 'APPOINTMENT', 'COMPLIANCE_MEETING'
          )
        )
        OR (
          LOWER(collection) = 'notifications'
          AND (
            UPPER(COALESCE(data->>'sourceType', data->>'source_type', '')) IN (
              'CHEQUE', 'APPOINTMENT', 'COMPLIANCE_MEETING'
            )
            OR COALESCE(data->>'sourceId', data->>'source_id', '') ~* '^/(cheques|appointments|compliance|compliance-meetings)(/|[?#]|$)'
            OR COALESCE(data->>'link', '') ~* '^/(cheques|appointments|compliance|compliance-meetings)(/|[?#]|$)'
            OR COALESCE(data#>>'{legacy_data,link}', '') ~* '^/(cheques|appointments|compliance|compliance-meetings)(/|[?#]|$)'
          )
        )`
  );
  assert.equal(Number(retiredCompatibilityRows.rows[0]?.count || 0), 0);
  const retiredCompatibilityFixtures = await client.query(
    `SELECT item_id
     FROM user_records
     WHERE item_id = ANY($1::text[])`,
    [retiredCompatibilityRecordIds]
  );
  assert.equal(
    retiredCompatibilityFixtures.rowCount,
    0,
    "A retired compatibility predicate fixture survived"
  );

  const retiredNotifications = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM notifications
     WHERE UPPER(COALESCE(source_type, '')) IN ('CHEQUE', 'APPOINTMENT', 'COMPLIANCE_MEETING')
        OR COALESCE(source_id, '') ~* '^/(cheques|appointments|compliance|compliance-meetings)(/|[?#]|$)'
        OR COALESCE(legacy_data->>'link', '') ~* '^/(cheques|appointments|compliance|compliance-meetings)(/|[?#]|$)'`
  );
  assert.equal(Number(retiredNotifications.rows[0]?.count || 0), 0);
  const retiredNotificationFixtures = await client.query(
    `SELECT id
     FROM notifications
     WHERE id = ANY($1::text[])`,
    [retiredCanonicalNotificationIds]
  );
  assert.equal(
    retiredNotificationFixtures.rowCount,
    0,
    "A retired canonical-notification predicate fixture survived"
  );

  const retiredArchives = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM archive_records
     WHERE LOWER(entity_type) IN ('cheque', 'appointment', 'compliance_meeting')`
  );
  assert.equal(Number(retiredArchives.rows[0]?.count || 0), 0);
  const retiredArchiveFixtures = await client.query(
    `SELECT id
     FROM archive_records
     WHERE id = ANY($1::text[])`,
    [retiredArchiveIds]
  );
  assert.equal(retiredArchiveFixtures.rowCount, 0, "A retired archive predicate fixture survived");

  const users = (await rows(
    client,
    `SELECT id, role
     FROM app_users
     WHERE id IN ($1, $2)
     ORDER BY id`,
    [ids.complianceUser, ids.operationsUser]
  )) as Array<Record<string, unknown>>;
  assert.equal(users.length, 2, "Retirement must preserve both user accounts");
  assert.ok(users.every((user) => user.role === "OPERATIONS"));

  const membership = await client.query(
    `SELECT role, status
     FROM organization_members
     WHERE organization_id = $1 AND user_id = $2`,
    [ids.organization, ids.complianceUser]
  );
  assert.deepEqual(membership.rows, [{ role: "member", status: "active" }]);

  const roles = (await rows(
    client,
    `SELECT name, description
     FROM roles
     WHERE name IN ('OPERATIONS', 'COMPLIANCE_STAFF', 'FINANCE')
     ORDER BY name`
  )) as Array<Record<string, unknown>>;
  assert.deepEqual(roles, [
    { name: "FINANCE", description: "Finance access" },
    { name: "OPERATIONS", description: "Shipment operations access" },
  ]);

  const retiredPermissions = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM permissions
     WHERE key IN ('cheques.manage', 'compliance.manage')`
  );
  assert.equal(Number(retiredPermissions.rows[0]?.count || 0), 0);
  const survivingPermission = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM permissions
     WHERE key = 'tasks.view_all'`
  );
  assert.equal(Number(survivingPermission.rows[0]?.count || 0), 1);
  const survivingOperationsGrant = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM role_permissions grant_row
     JOIN roles role ON role.id = grant_row.role_id
     JOIN permissions permission ON permission.id = grant_row.permission_id
     WHERE role.name = 'OPERATIONS' AND permission.key = 'tasks.view_all'`
  );
  assert.equal(Number(survivingOperationsGrant.rows[0]?.count || 0), 1);

  const plan = await client.query(
    `SELECT description, features, limits
     FROM subscription_plans
     WHERE id = $1`,
    [ids.plan]
  );
  assert.equal(plan.rows[0]?.description, newBusinessDescription);
  assert.deepEqual(plan.rows[0]?.features, { chat: true });
  assert.deepEqual(plan.rows[0]?.limits, { users: 10, documents: 500 });

  const subscription = await client.query(
    `SELECT limits_override
     FROM organization_subscriptions
     WHERE id = $1`,
    [ids.subscription]
  );
  assert.deepEqual(subscription.rows[0]?.limits_override, { documents: 700 });

  const migrationHistory = await client.query(
    `SELECT
       COUNT(*)::int AS total_count,
       COUNT(*) FILTER (WHERE id = $1)::int AS target_count
     FROM schema_migrations`,
    [targetMigrationId]
  );
  assert.equal(Number(migrationHistory.rows[0]?.target_count || 0), 1);
  assert.equal(
    Number(migrationHistory.rows[0]?.total_count || 0),
    expectedAppliedMigrationCount,
    "Migration history must contain every pre-retirement migration plus the retirement migration"
  );
}

async function capturePostRetirementState(client: InstanceType<typeof Client>) {
  return {
    preservation: await capturePreservationSnapshot(client),
    task: await rows(
      client,
      "SELECT source_type, source_id, legacy_data, created_at, updated_at FROM tasks WHERE id = $1",
      [ids.task]
    ),
    users: await rows(
      client,
      "SELECT id, role, created_at, updated_at FROM app_users ORDER BY id"
    ),
    userRecords: await rows(
      client,
      "SELECT owner_user_id, collection, item_id, data, created_at, updated_at FROM user_records ORDER BY owner_user_id, collection, item_id"
    ),
    plans: await rows(
      client,
      "SELECT id, description, limits, features, created_at, updated_at FROM subscription_plans ORDER BY id"
    ),
    subscriptions: await rows(
      client,
      "SELECT id, limits_override, created_at, updated_at FROM organization_subscriptions ORDER BY id"
    ),
    roles: await rows(
      client,
      "SELECT id, name, description, created_at, updated_at FROM roles ORDER BY id"
    ),
    migrationHistory: await rows(
      client,
      "SELECT id, name, checksum, applied_at FROM schema_migrations ORDER BY id"
    ),
  };
}

async function main() {
  await assertPostgres16();
  try {
    await resetDatabase();
    const migrations = await loadMigrations();
    const targetIndex = migrations.findIndex((migration) => migration.name === targetMigrationName);
    assert.ok(targetIndex >= 0, `Missing target migration ${targetMigrationName}`);
    const beforeTarget = migrations.slice(0, targetIndex);
    const targetMigration = migrations[targetIndex];

    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await ensureMigrationsTable(client);
      for (const migration of beforeTarget) {
        await applyMigration(client, migration);
      }

      await seedSyntheticState(client);
      await verifyPreflightRollbackPaths(client, targetMigration);
      await verifyStageOneCompatibilityBoundary(client);
      for (const legacyAiTable of [
        "ai_business_search_index",
        "organization_ai_memory",
        "organization_ai_memory_items",
      ]) {
        assert.equal(
          await tableExists(client, legacyAiTable),
          false,
          `Canonical N-1 schema unexpectedly contains ${legacyAiTable}`
        );
      }
      const before = await capturePreservationSnapshot(client);
      await applyMigration(client, targetMigration);
      const expectedAppliedMigrationCount = beforeTarget.length + 1;
      await verifyRetirement(client, before, expectedAppliedMigrationCount);

      const firstPassState = await capturePostRetirementState(client);
      await applyMigration(client, targetMigration, false);
      await verifyRetirement(client, before, expectedAppliedMigrationCount);
      const secondPassState = await capturePostRetirementState(client);
      assert.deepEqual(
        secondPassState,
        firstPassState,
        "The retirement SQL changed state when applied a second time"
      );

      console.log(
        `Feature retirement migration verification passed in disposable PostgreSQL 16 database ${databaseName}.`
      );
      console.log(
        "Raw SQL idempotence passed; the normal migration runner records this migration once and skips future executions."
      );
    } finally {
      await client.end();
    }
  } finally {
    await dropDatabase();
  }
}

main().catch((error) => {
  console.error("Feature retirement migration verification failed:", error);
  process.exit(1);
});
