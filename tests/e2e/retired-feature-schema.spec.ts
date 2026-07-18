import { expect, test } from "@playwright/test";
import { dbQuery } from "./helpers";

test("retired tables, document links, permissions, and plan flags are physically absent", async () => {
  const tables = await dbQuery(
    `SELECT
       to_regclass('public.cheques') AS cheques,
       to_regclass('public.compliance_meetings') AS compliance_meetings,
       to_regclass('public.meeting_required_documents') AS meeting_required_documents`
  );
  expect(tables.rows[0]).toEqual({
    cheques: null,
    compliance_meetings: null,
    meeting_required_documents: null,
  });

  const documentColumns = await dbQuery(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'documents'
       AND column_name = ANY($1::text[])
     ORDER BY column_name`,
    [["cheque_id", "meeting_id"]]
  );
  expect(documentColumns.rows).toEqual([]);

  const permissionCount = await dbQuery(
    `SELECT COUNT(*)::int AS count
     FROM permissions
     WHERE key = ANY($1::text[])`,
    [["cheques.manage", "compliance.manage"]]
  );
  expect(permissionCount.rows[0]?.count).toBe(0);

  const planFlagCount = await dbQuery(
    `SELECT COUNT(*)::int AS count
     FROM subscription_plans
     WHERE features ?| $1::text[]`,
    [["cheques", "compliance"]]
  );
  expect(planFlagCount.rows[0]?.count).toBe(0);

  const subscriptionOverrideCount = await dbQuery(
    `SELECT COUNT(*)::int AS count
     FROM organization_subscriptions
     WHERE limits_override ?| $1::text[]`,
    [["cheques", "compliance"]]
  );
  expect(subscriptionOverrideCount.rows[0]?.count).toBe(0);
});
