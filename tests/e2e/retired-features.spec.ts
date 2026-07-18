import { expect, test, type APIRequestContext } from "@playwright/test";
import { dbQuery, disposeContexts, loginApi, loginViaUi, readOk } from "./helpers";

const retiredUiRoutes = [
  "/cheques",
  "/cheques/legacy-cheque",
  "/compliance",
  "/compliance-meetings",
];

const retiredBusinessPlanDescription =
  "برای شرکت‌هایی که چند نفر همزمان روی بار، سند، مشتری، چک و استعلام نرخ کار می‌کنند و دید مدیریتی دقیق‌تری می‌خواهند.";
const tombstoneFixtureGrantReason = "qa-retired-tombstone-boundary-grant";

const tombstoneFixtures = {
  userId: "qa-retired-tombstone-user",
  userEmail: "qa-retired-tombstone-user@example.test",
  taskId: "qa-retired-tombstone-task",
  deletedTaskId: "qa-retired-tombstone-deleted-task",
  deletedItemIds: {
    cheque: "qa-retired-deleted-cheque",
    appointment: "qa-retired-deleted-appointment",
    compliance: "retired-compliance-deleted-item",
    retiredOnlyAttempt: "qa-retired-deleted-only-attempt",
    mixedRetiredAttempt: "qa-retired-deleted-mixed-attempt",
    mixedActiveReplacement: "qa-retired-deleted-active-replacement",
  },
  archiveId: "qa-retired-tombstone-archive",
  planId: "qa-retired-tombstone-plan",
  organizationId: "qa-retired-tombstone-organization",
  subscriptionId: "qa-retired-tombstone-subscription",
  roleId: "qa-retired-tombstone-role",
  permissionIds: ["qa-retired-cheques-permission", "qa-retired-compliance-permission"],
  notificationIds: {
    active: "qa-retired-notification-active-control",
    sourceType: "qa-retired-notification-source-type",
    sourceRoute: "qa-retired-notification-source-route",
    legacyRoute: "qa-retired-notification-legacy-route",
  },
};

const retiredNotificationIds = [
  tombstoneFixtures.notificationIds.sourceType,
  tombstoneFixtures.notificationIds.sourceRoute,
  tombstoneFixtures.notificationIds.legacyRoute,
];

const retiredApiRoutes: Array<{ method: string; path: string }> = [
  { method: "GET", path: "/api/cheques" },
  { method: "GET", path: "/api/cheques/due-soon" },
  { method: "POST", path: "/api/cheques" },
  { method: "GET", path: "/api/cheques/retired-cheque" },
  { method: "PATCH", path: "/api/cheques/retired-cheque" },
  { method: "POST", path: "/api/cheques/retired-cheque/status" },
  { method: "POST", path: "/api/cheques/retired-cheque/archive" },
  { method: "GET", path: "/api/compliance-meetings" },
  { method: "POST", path: "/api/compliance-meetings" },
  { method: "GET", path: "/api/compliance-meetings/retired-meeting" },
  { method: "PATCH", path: "/api/compliance-meetings/retired-meeting" },
  { method: "POST", path: "/api/compliance-meetings/retired-meeting/required-documents" },
  {
    method: "PATCH",
    path: "/api/compliance-meetings/retired-meeting/required-documents/retired-requirement",
  },
  { method: "POST", path: "/api/compliance-meetings/retired-meeting/outcome" },
  { method: "POST", path: "/api/compliance-meetings/retired-meeting/cancel" },
  { method: "POST", path: "/api/compliance-meetings/retired-meeting/archive" },
];

async function canonicalCompatibilityState() {
  const result = await dbQuery(
    `SELECT jsonb_build_object(
       'customers', (
         SELECT md5(COALESCE(string_agg(md5(to_jsonb(row_data)::text), ',' ORDER BY row_data.id), ''))
         FROM customers row_data
       ),
       'notifications', (
         SELECT md5(COALESCE(string_agg(md5(to_jsonb(row_data)::text), ',' ORDER BY row_data.id), ''))
         FROM notifications row_data
       ),
       'chatThreads', (
         SELECT md5(COALESCE(string_agg(md5(to_jsonb(row_data)::text), ',' ORDER BY row_data.id), ''))
         FROM chat_threads row_data
       ),
       'chatMessages', (
         SELECT md5(COALESCE(string_agg(md5(to_jsonb(row_data)::text), ',' ORDER BY row_data.id), ''))
         FROM chat_messages row_data
       ),
       'quotations', (
         SELECT md5(COALESCE(string_agg(md5(to_jsonb(row_data)::text), ',' ORDER BY row_data.id), ''))
         FROM quotations row_data
       )
     ) AS state`
  );
  return result.rows[0]?.state;
}

async function requestRetiredEndpoint(api: APIRequestContext, method: string, path: string) {
  return api.fetch(path, {
    method,
    ...(method === "GET" ? {} : { data: {} }),
  });
}

async function cleanupGenericTombstoneFixtures() {
  await dbQuery("DELETE FROM notifications WHERE id = ANY($1::text[])", [
    Object.values(tombstoneFixtures.notificationIds),
  ]);
  await dbQuery("DELETE FROM archive_records WHERE id = $1", [tombstoneFixtures.archiveId]);
  await dbQuery("DELETE FROM change_logs WHERE entity_id = ANY($1::text[])", [
    [tombstoneFixtures.userId, tombstoneFixtures.taskId],
  ]);
  await dbQuery("DELETE FROM tasks WHERE id = $1", [tombstoneFixtures.taskId]);
  await dbQuery("DELETE FROM user_records WHERE owner_user_id = $1", [tombstoneFixtures.userId]);
  await dbQuery("DELETE FROM organization_members WHERE user_id = $1", [tombstoneFixtures.userId]);
  await dbQuery(
    "DELETE FROM user_permissions WHERE reason = $1 OR user_id = $2",
    [tombstoneFixtureGrantReason, tombstoneFixtures.userId]
  );
  await dbQuery("DELETE FROM app_sessions WHERE user_id = $1", [tombstoneFixtures.userId]);
  await dbQuery("DELETE FROM app_users WHERE id = $1", [tombstoneFixtures.userId]);
  await dbQuery("DELETE FROM organization_subscriptions WHERE id = $1", [tombstoneFixtures.subscriptionId]);
  await dbQuery("DELETE FROM organizations WHERE id = $1", [tombstoneFixtures.organizationId]);
  await dbQuery("DELETE FROM subscription_plans WHERE id = $1", [tombstoneFixtures.planId]);
  await dbQuery("DELETE FROM role_permissions WHERE role_id = $1", [tombstoneFixtures.roleId]);
  await dbQuery("DELETE FROM roles WHERE id = $1", [tombstoneFixtures.roleId]);
  await dbQuery("DELETE FROM permissions WHERE id = ANY($1::text[])", [tombstoneFixtures.permissionIds]);
}

async function seedGenericTombstoneFixtures(owner: { id: string; organizationId: string }) {
  await dbQuery(
    `INSERT INTO roles (id, name, description)
     VALUES ($1, 'COMPLIANCE_STAFF', 'Retired role fixture')
     ON CONFLICT (name) DO NOTHING`,
    [tombstoneFixtures.roleId]
  );
  await dbQuery(
    `INSERT INTO permissions (id, key, description)
     VALUES
       ($1, 'cheques.manage', 'Retired cheque permission fixture'),
       ($2, 'compliance.manage', 'Retired compliance permission fixture')
     ON CONFLICT (key) DO NOTHING`,
    tombstoneFixtures.permissionIds
  );
  await dbQuery(
    `INSERT INTO user_permissions (user_id, permission_id, granted_by_id, reason)
     SELECT $1, id, $1, $2
     FROM permissions
     WHERE LOWER(key) = ANY($3::text[])
     ON CONFLICT (user_id, permission_id) DO NOTHING`,
    [owner.id, tombstoneFixtureGrantReason, ["cheques.manage", "compliance.manage"]]
  );
  await dbQuery(
    `INSERT INTO app_users (
       id, organization_id, name, email, password_hash, role, status, notification_preferences
     )
     SELECT $1, $2, 'QA Retired Tombstone User', $3, password_hash,
            'COMPLIANCE_STAFF', 'active', '{}'::jsonb
     FROM app_users
     WHERE id = $4`,
    [tombstoneFixtures.userId, owner.organizationId, tombstoneFixtures.userEmail, owner.id]
  );
  await dbQuery(
    `INSERT INTO organization_members (organization_id, user_id, role, status)
     VALUES ($1, $2, 'member', 'active')`,
    [owner.organizationId, tombstoneFixtures.userId]
  );

  const compatibilityRows = [
    ["cheques", "retired-cheque", { id: "retired-cheque", amount: 1 }],
    ["appointments", "retired-appointment", { id: "retired-appointment", purpose: "retired" }],
    [
      "notifications",
      "retired-compatibility-notification",
      {
        id: "retired-compatibility-notification",
        sourceType: "COMPLIANCE_MEETING",
        link: "/compliance-meetings/retired",
      },
    ],
    [
      "deletedItems",
      tombstoneFixtures.deletedItemIds.cheque,
      { id: tombstoneFixtures.deletedItemIds.cheque, entityType: "CHEQUE", note: "preserve hidden row" },
    ],
    [
      "deletedItems",
      tombstoneFixtures.deletedItemIds.appointment,
      {
        id: tombstoneFixtures.deletedItemIds.appointment,
        entity_type: "APPOINTMENT",
        note: "preserve hidden row",
      },
    ],
    [
      "deletedItems",
      tombstoneFixtures.deletedItemIds.compliance,
      {
        id: tombstoneFixtures.deletedItemIds.compliance,
        entityType: "COMPLIANCE_MEETING",
        note: "preserve hidden row",
      },
    ],
    [
      "deletedItems",
      tombstoneFixtures.deletedTaskId,
      {
        id: tombstoneFixtures.deletedTaskId,
        entityType: "TASK",
        data: {
          id: tombstoneFixtures.deletedTaskId,
          title: "Retired deleted task snapshot",
          sourceType: "COMPLIANCE_MEETING",
          sourceId: "retired-meeting-for-deleted-task",
        },
      },
    ],
    [
      "tasks",
      tombstoneFixtures.taskId,
      {
        id: tombstoneFixtures.taskId,
        title: "Retired compatibility task",
        status: "TODO",
        priority: "MEDIUM",
        sourceType: "COMPLIANCE_MEETING",
        sourceId: "retired-meeting-for-task",
      },
    ],
  ];
  for (const [collection, itemId, data] of compatibilityRows) {
    await dbQuery(
      `INSERT INTO user_records (owner_user_id, organization_id, collection, item_id, data)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [tombstoneFixtures.userId, owner.organizationId, collection, itemId, JSON.stringify(data)]
    );
  }

  await dbQuery(
    `INSERT INTO tasks (
       id, organization_id, owner_user_id, title, status, priority, source_type, source_id, legacy_data
     )
     VALUES ($1, $2, $3, 'Retired compatibility task', 'TODO', 'MEDIUM',
             'COMPLIANCE_MEETING', 'retired-meeting-for-task', $4::jsonb)`,
    [
      tombstoneFixtures.taskId,
      owner.organizationId,
      tombstoneFixtures.userId,
      JSON.stringify({ sourceType: "COMPLIANCE_MEETING", sourceId: "retired-meeting-for-task" }),
    ]
  );

  await dbQuery(
    `INSERT INTO notifications (
       id, organization_id, user_id, title, body, type, source_type, source_id, legacy_data
     )
     VALUES
       ($1, $5, $6, 'Active control', 'Must stay visible', 'INFO', 'SHIPMENT', 'active-control', '{"link":"/tasks"}'::jsonb),
       ($2, $5, $6, 'Retired source type', 'Must stay hidden', 'INFO', 'COMPLIANCE_MEETING', 'retired-meeting', '{}'::jsonb),
       ($3, $5, $6, 'Retired source route', 'Must stay hidden', 'INFO', 'ROUTE', '/cheques/retired', '{}'::jsonb),
       ($4, $5, $6, 'Retired legacy route', 'Must stay hidden', 'INFO', 'ROUTE', 'legacy-route', '{"link":"/compliance-meetings/retired"}'::jsonb)`,
    [
      tombstoneFixtures.notificationIds.active,
      tombstoneFixtures.notificationIds.sourceType,
      tombstoneFixtures.notificationIds.sourceRoute,
      tombstoneFixtures.notificationIds.legacyRoute,
      owner.organizationId,
      owner.id,
    ]
  );
  await dbQuery(
    `INSERT INTO archive_records (
       id, organization_id, owner_user_id, entity_type, entity_id, title, summary, archived_by_id
     )
     VALUES ($1, $2, $3, 'compliance_meeting', 'retired-meeting-archive',
             'Retirement Tombstone Needle', 'Must stay hidden from search', $3)`,
    [tombstoneFixtures.archiveId, owner.organizationId, owner.id]
  );

  await dbQuery(
    `INSERT INTO subscription_plans (
       id, name, description, monthly_price_irr, annual_price_irr, limits, features, is_public, sort_order
     )
     VALUES ($1, 'QA Retired Tombstone Plan', 'Boundary filtering fixture', 0, 0,
             '{"users":3}'::jsonb,
             '{"chat":true,"cheques":true,"compliance":true}'::jsonb,
             TRUE, 999)`,
    [tombstoneFixtures.planId]
  );
  await dbQuery(
    `INSERT INTO organizations (id, name, slug, status, plan_id)
     VALUES ($1, 'QA Retired Tombstone Organization', 'qa-retired-tombstone-organization', 'active', $2)`,
    [tombstoneFixtures.organizationId, tombstoneFixtures.planId]
  );
  await dbQuery(
    `INSERT INTO organization_subscriptions (
       id, organization_id, plan_id, status, billing_cycle, limits_override
     )
     VALUES ($1, $2, $3, 'active', 'monthly',
             '{"users":2,"cheques":true,"compliance":true}'::jsonb)`,
    [tombstoneFixtures.subscriptionId, tombstoneFixtures.organizationId, tombstoneFixtures.planId]
  );
}

test.describe.serial("permanently retired cheque and compliance features", () => {
  test("old UI bookmarks redirect safely and navigation links stay absent", async ({ page }) => {
    for (const route of retiredUiRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login$/);
    }

    await loginViaUi(page);

    for (const route of retiredUiRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/dashboard$/);
    }

    for (const route of retiredUiRoutes) {
      await expect(page.locator(`a[href="${route}"]`)).toHaveCount(0);
    }
  });

  test("retired API route families are not registered", async () => {
    const api = await loginApi();
    try {
      for (const { method, path } of retiredApiRoutes) {
        const response = await requestRetiredEndpoint(api, method, path);
        expect(response.status(), `${method} ${path}: ${await response.text()}`).toBe(404);
      }
    } finally {
      await disposeContexts(api);
    }
  });

  test("legacy records payloads cannot recreate retired data or mutate canonical records", async () => {
    const api = await loginApi();
    try {
      const auth = await readOk<any>(await api.get("/api/auth/me"));
      const userId = auth.user.id;
      const retiredCollections = ["cheques", "appointments"];
      const beforeRows = await dbQuery(
        `SELECT collection, item_id, data
         FROM user_records
         WHERE owner_user_id = $1
           AND collection = ANY($2::text[])
         ORDER BY collection, item_id`,
        [userId, retiredCollections]
      );
      expect(beforeRows.rows).toEqual([]);
      const beforeCanonical = await canonicalCompatibilityState();

      const response = await api.put(`/api/users/${encodeURIComponent(userId)}/records`, {
        data: {
          records: {
            cheques: [{ id: "retired-cheque", amount: 1, status: "ACTIVE" }],
            appointments: [{ id: "retired-appointment", purpose: "must not be restored" }],
          },
        },
      });
      expect(response.status(), await response.text()).toBeLessThan(400);
      expect((await response.json()).total).toBe(0);

      const afterRows = await dbQuery(
        `SELECT collection, item_id, data
         FROM user_records
         WHERE owner_user_id = $1
           AND collection = ANY($2::text[])
         ORDER BY collection, item_id`,
        [userId, retiredCollections]
      );
      expect(afterRows.rows).toEqual(beforeRows.rows);
      expect(await canonicalCompatibilityState()).toEqual(beforeCanonical);
    } finally {
      await disposeContexts(api);
    }
  });

  test("generic compatibility tombstones stay hidden and retired task sources cannot persist", async () => {
    const api = await loginApi();
    let originalBusinessPlanDescription: string | null | undefined;
    try {
      await cleanupGenericTombstoneFixtures();
      const authBefore = await readOk<any>(await api.get("/api/auth/me"));
      const owner = {
        id: authBefore.user.id,
        organizationId: authBefore.user.organizationId || authBefore.user.organization_id,
      };
      expect(owner.organizationId).toBeTruthy();

      const businessPlan = await dbQuery(
        "SELECT description FROM subscription_plans WHERE id = 'business' LIMIT 1"
      );
      expect(businessPlan.rowCount).toBe(1);
      originalBusinessPlanDescription = businessPlan.rows[0]?.description;
      await dbQuery(
        "UPDATE subscription_plans SET description = $1 WHERE id = 'business'",
        [retiredBusinessPlanDescription]
      );
      await seedGenericTombstoneFixtures(owner);

      const auth = await readOk<any>(await api.get("/api/auth/me"));
      expect(auth.permissions).not.toContain("cheques.manage");
      expect(auth.permissions).not.toContain("compliance.manage");

      const roles = await readOk<any[]>(await api.get("/api/roles"));
      expect(roles.some((role) => String(role.name).toUpperCase() === "COMPLIANCE_STAFF")).toBe(false);

      const bootstrapResponse = await api.get(
        `/api/users/${encodeURIComponent(tombstoneFixtures.userId)}/bootstrap`
      );
      expect(bootstrapResponse.status(), await bootstrapResponse.text()).toBeLessThan(400);
      const bootstrap = await bootstrapResponse.json();
      const records = bootstrap.records as Record<string, any[]>;
      expect(records.cheques).toBeUndefined();
      expect(records.appointments).toBeUndefined();
      expect(records.notifications).toBeUndefined();
      expect(
        records.deletedItems?.some((item) =>
          ["CHEQUE", "APPOINTMENT", "COMPLIANCE_MEETING"].includes(
            String(item.entityType || item.entity_type || "").toUpperCase()
          )
        ) || false
      ).toBe(false);
      const deletedTask = records.deletedItems?.find(
        (item) => item.id === tombstoneFixtures.deletedTaskId
      );
      expect(deletedTask?.data.sourceType).toBe("MANUAL");
      expect(deletedTask?.data.sourceId).toBeUndefined();
      expect(
        records.users?.find((user) => user.id === tombstoneFixtures.userId)?.role
      ).toBe("OPERATIONS");
      const boundaryTask = records.tasks?.find((task) => task.id === tombstoneFixtures.taskId);
      expect(boundaryTask?.sourceType).toBe("MANUAL");
      expect(boundaryTask?.sourceId).toBeUndefined();

      const retiredCollectionRowsBefore = await dbQuery(
        `SELECT collection, item_id, data
         FROM user_records
         WHERE owner_user_id = $1
           AND LOWER(collection) = ANY($2::text[])
         ORDER BY LOWER(collection), collection, item_id`,
        [tombstoneFixtures.userId, ["cheques", "appointments"]]
      );
      const caseVariantWrite = await api.put(
        `/api/users/${encodeURIComponent(tombstoneFixtures.userId)}/records`,
        {
          data: {
            records: {
              Cheques: [{ id: "case-variant-cheque-attempt", amount: 99 }],
              Appointments: [{ id: "case-variant-appointment-attempt", purpose: "must stay ignored" }],
            },
          },
        }
      );
      expect(caseVariantWrite.status(), await caseVariantWrite.text()).toBeLessThan(400);
      expect((await caseVariantWrite.json()).total).toBe(0);
      const retiredCollectionRowsAfter = await dbQuery(
        `SELECT collection, item_id, data
         FROM user_records
         WHERE owner_user_id = $1
           AND LOWER(collection) = ANY($2::text[])
         ORDER BY LOWER(collection), collection, item_id`,
        [tombstoneFixtures.userId, ["cheques", "appointments"]]
      );
      expect(retiredCollectionRowsAfter.rows).toEqual(retiredCollectionRowsBefore.rows);
      expect(
        retiredCollectionRowsAfter.rows.some((row) =>
          ["case-variant-cheque-attempt", "case-variant-appointment-attempt"].includes(row.item_id)
        )
      ).toBe(false);

      const deletedItemsBeforeRetiredOnlyWrite = await dbQuery(
        `SELECT item_id, data
         FROM user_records
         WHERE owner_user_id = $1 AND collection = 'deletedItems'
         ORDER BY item_id`,
        [tombstoneFixtures.userId]
      );
      expect(
        deletedItemsBeforeRetiredOnlyWrite.rows.some(
          (row) => row.item_id === tombstoneFixtures.deletedTaskId
        )
      ).toBe(true);
      const retiredOnlyDeletedItemsWrite = await api.put(
        `/api/users/${encodeURIComponent(tombstoneFixtures.userId)}/records`,
        {
          data: {
            records: {
              deletedItems: [
                {
                  id: tombstoneFixtures.deletedItemIds.retiredOnlyAttempt,
                  entity_type: "cheque",
                  note: "old client must not insert this tombstone",
                },
              ],
            },
          },
        }
      );
      expect(
        retiredOnlyDeletedItemsWrite.status(),
        await retiredOnlyDeletedItemsWrite.text()
      ).toBeLessThan(400);
      expect((await retiredOnlyDeletedItemsWrite.json()).total).toBe(0);
      const deletedItemsAfterRetiredOnlyWrite = await dbQuery(
        `SELECT item_id, data
         FROM user_records
         WHERE owner_user_id = $1 AND collection = 'deletedItems'
         ORDER BY item_id`,
        [tombstoneFixtures.userId]
      );
      expect(deletedItemsAfterRetiredOnlyWrite.rows).toEqual(
        deletedItemsBeforeRetiredOnlyWrite.rows
      );
      expect(
        deletedItemsAfterRetiredOnlyWrite.rows.some(
          (row) => row.item_id === tombstoneFixtures.deletedItemIds.retiredOnlyAttempt
        )
      ).toBe(false);

      const hiddenDeletedItemsBeforeMixedWrite = deletedItemsAfterRetiredOnlyWrite.rows.filter(
        (row) =>
          [
            tombstoneFixtures.deletedItemIds.cheque,
            tombstoneFixtures.deletedItemIds.appointment,
            tombstoneFixtures.deletedItemIds.compliance,
          ].includes(row.item_id)
      );
      expect(hiddenDeletedItemsBeforeMixedWrite).toHaveLength(3);
      const mixedDeletedItemsWrite = await api.put(
        `/api/users/${encodeURIComponent(tombstoneFixtures.userId)}/records`,
        {
          data: {
            records: {
              deletedItems: [
                {
                  id: tombstoneFixtures.deletedItemIds.mixedActiveReplacement,
                  entityType: "TASK",
                  data: {
                    id: tombstoneFixtures.deletedItemIds.mixedActiveReplacement,
                    title: "Replacement active history",
                    sourceType: "MANUAL",
                  },
                },
                {
                  id: tombstoneFixtures.deletedItemIds.mixedRetiredAttempt,
                  entityType: "APPOINTMENT",
                  note: "mixed old-client payload must not insert this tombstone",
                },
              ],
            },
          },
        }
      );
      expect(mixedDeletedItemsWrite.status(), await mixedDeletedItemsWrite.text()).toBeLessThan(400);
      expect((await mixedDeletedItemsWrite.json()).total).toBe(1);
      const deletedItemsAfterMixedWrite = await dbQuery(
        `SELECT item_id, data
         FROM user_records
         WHERE owner_user_id = $1 AND collection = 'deletedItems'
         ORDER BY item_id`,
        [tombstoneFixtures.userId]
      );
      const hiddenDeletedItemsAfterMixedWrite = deletedItemsAfterMixedWrite.rows.filter((row) =>
        [
          tombstoneFixtures.deletedItemIds.cheque,
          tombstoneFixtures.deletedItemIds.appointment,
          tombstoneFixtures.deletedItemIds.compliance,
        ].includes(row.item_id)
      );
      expect(hiddenDeletedItemsAfterMixedWrite).toEqual(hiddenDeletedItemsBeforeMixedWrite);
      expect(
        deletedItemsAfterMixedWrite.rows.some(
          (row) => row.item_id === tombstoneFixtures.deletedTaskId
        )
      ).toBe(false);
      expect(
        deletedItemsAfterMixedWrite.rows.some(
          (row) => row.item_id === tombstoneFixtures.deletedItemIds.mixedActiveReplacement
        )
      ).toBe(true);
      expect(
        deletedItemsAfterMixedWrite.rows.some(
          (row) => row.item_id === tombstoneFixtures.deletedItemIds.mixedRetiredAttempt
        )
      ).toBe(false);

      const notifications = await readOk<any[]>(
        await api.get("/api/notifications?includeRead=true&limit=100")
      );
      const visibleNotificationIds = new Set(notifications.map((item) => item.id));
      expect(visibleNotificationIds.has(tombstoneFixtures.notificationIds.active)).toBe(true);
      for (const notificationId of retiredNotificationIds) {
        expect(visibleNotificationIds.has(notificationId)).toBe(false);
      }

      const retiredRead = await api.patch(
        `/api/notifications/${encodeURIComponent(tombstoneFixtures.notificationIds.sourceType)}/read`
      );
      expect(retiredRead.status(), await retiredRead.text()).toBe(404);
      const retiredReadState = await dbQuery(
        "SELECT read_at FROM notifications WHERE id = $1",
        [tombstoneFixtures.notificationIds.sourceType]
      );
      expect(retiredReadState.rows[0]?.read_at).toBeNull();

      const dashboardAlerts = await readOk<any[]>(await api.get("/api/dashboard/alerts"));
      const dashboardAlertIds = new Set(dashboardAlerts.map((item) => item.id));
      expect(dashboardAlertIds.has(tombstoneFixtures.notificationIds.active)).toBe(true);
      for (const notificationId of retiredNotificationIds) {
        expect(dashboardAlertIds.has(notificationId)).toBe(false);
      }

      const searchResponse = await api.get(
        `/api/search?q=${encodeURIComponent("Tombstone Needle")}&type=archive`
      );
      expect(searchResponse.status(), await searchResponse.text()).toBeLessThan(400);
      const search = await searchResponse.json();
      expect(search.results.some((item) => item.id === tombstoneFixtures.archiveId)).toBe(false);

      const plans = await readOk<any[]>(await api.get("/api/plans"));
      const fixturePlan = plans.find((plan) => plan.id === tombstoneFixtures.planId);
      expect(fixturePlan?.features).toEqual({ chat: true });
      const businessPlanDto = plans.find((plan) => plan.id === "business");
      expect(businessPlanDto?.description).not.toBe(retiredBusinessPlanDescription);
      expect(String(businessPlanDto?.description || "")).not.toContain("چک");

      const subscription = await readOk<any>(
        await api.get(
          `/api/admin/organizations/${encodeURIComponent(tombstoneFixtures.organizationId)}/subscription`
        )
      );
      expect(subscription.limitsOverride).toEqual({ users: 2 });
      expect(subscription.effectiveFeatures).toEqual({ chat: true });
      const organizations = await readOk<any[]>(await api.get("/api/admin/organizations"));
      const fixtureOrganization = organizations.find(
        (organization) => organization.id === tombstoneFixtures.organizationId
      );
      expect(fixtureOrganization?.limitsOverride).toEqual({ users: 2 });
      const storedSubscriptionFlags = await dbQuery(
        `SELECT
           sp.features ? 'cheques' AS plan_has_cheques,
           sp.features ? 'compliance' AS plan_has_compliance,
           os.limits_override ? 'cheques' AS override_has_cheques,
           os.limits_override ? 'compliance' AS override_has_compliance
         FROM organization_subscriptions os
         JOIN subscription_plans sp ON sp.id = os.plan_id
         WHERE os.id = $1`,
        [tombstoneFixtures.subscriptionId]
      );
      expect(storedSubscriptionFlags.rows[0]).toEqual({
        plan_has_cheques: true,
        plan_has_compliance: true,
        override_has_cheques: true,
        override_has_compliance: true,
      });

      const taskWrite = await api.put(
        `/api/users/${encodeURIComponent(tombstoneFixtures.userId)}/records`,
        {
          data: {
            records: {
              tasks: [
                {
                  id: tombstoneFixtures.taskId,
                  title: "Retired compatibility task",
                  status: "TODO",
                  priority: "MEDIUM",
                  sourceType: "COMPLIANCE_MEETING",
                  sourceId: "retired-meeting-for-task",
                },
              ],
            },
          },
        }
      );
      expect(taskWrite.status(), await taskWrite.text()).toBeLessThan(400);
      expect((await taskWrite.json()).total).toBe(1);

      const storedTask = await dbQuery(
        `SELECT source_type, source_id, legacy_data
         FROM tasks
         WHERE id = $1`,
        [tombstoneFixtures.taskId]
      );
      expect(storedTask.rows[0]?.source_type).toBe("MANUAL");
      expect(storedTask.rows[0]?.source_id).toBeNull();
      expect(storedTask.rows[0]?.legacy_data.sourceType).toBe("MANUAL");
      expect(storedTask.rows[0]?.legacy_data.sourceId).toBeUndefined();
      expect(storedTask.rows[0]?.legacy_data.source_id).toBeUndefined();
      expect(storedTask.rows[0]?.legacy_data.source_type).toBeUndefined();

      const storedTaskCompatibility = await dbQuery(
        `SELECT data
         FROM user_records
         WHERE owner_user_id = $1 AND collection = 'tasks' AND item_id = $2`,
        [tombstoneFixtures.userId, tombstoneFixtures.taskId]
      );
      expect(storedTaskCompatibility.rows[0]?.data.sourceType).toBe("MANUAL");
      expect(storedTaskCompatibility.rows[0]?.data.sourceId).toBeUndefined();

      const normalizedBootstrapResponse = await api.get(
        `/api/users/${encodeURIComponent(tombstoneFixtures.userId)}/bootstrap`
      );
      expect(
        normalizedBootstrapResponse.status(),
        await normalizedBootstrapResponse.text()
      ).toBeLessThan(400);
      const normalizedBootstrap = await normalizedBootstrapResponse.json();
      const normalizedTask = normalizedBootstrap.records.tasks.find(
        (task) => task.id === tombstoneFixtures.taskId
      );
      expect(normalizedTask.sourceType).toBe("MANUAL");
      expect(normalizedTask.sourceId).toBeUndefined();
    } finally {
      try {
        if (originalBusinessPlanDescription !== undefined) {
          await dbQuery(
            "UPDATE subscription_plans SET description = $1 WHERE id = 'business'",
            [originalBusinessPlanDescription]
          );
        }
        await cleanupGenericTombstoneFixtures();
      } finally {
        await disposeContexts(api);
      }
    }
  });
});
