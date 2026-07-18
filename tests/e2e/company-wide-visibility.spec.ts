import { expect, test } from "@playwright/test";
import pg from "pg";
import {
  USER_PASSWORD,
  assertTestDatabaseUrl,
  disposeContexts,
  expectForbidden,
  expectUnavailable,
  loginApi,
  readOk,
  uniqueEmail,
} from "./helpers";

const { Client } = pg;
type DbClient = InstanceType<typeof Client>;

const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";
const shipmentId = "s1";
let client: DbClient;

async function cleanupCompanyWideArtifacts(client: DbClient) {
  await client.query("DELETE FROM task_events WHERE shipment_id = $1", [shipmentId]);
  await client.query("DELETE FROM tasks WHERE shipment_id = $1 AND title LIKE 'E2E company-wide%'", [shipmentId]);
  await client.query("DELETE FROM shipment_workflow_instances WHERE shipment_id = $1", [shipmentId]);
  await client.query("DELETE FROM documents WHERE title LIKE 'E2E company-wide%'");
  await client.query("DELETE FROM quotations WHERE customer_name LIKE 'E2E company-wide%'");
  await client.query("DELETE FROM user_records WHERE collection = 'commercialCards' AND item_id LIKE 'e2e-company-wide-%'");
  const users = await client.query("SELECT id FROM app_users WHERE email LIKE 'e2e-company-wide-%@example.test'");
  const userIds = users.rows.map((row) => row.id);
  if (userIds.length) {
    await client.query("DELETE FROM app_sessions WHERE user_id = ANY($1::text[])", [userIds]);
    await client.query("DELETE FROM user_permissions WHERE user_id = ANY($1::text[])", [userIds]);
    await client.query(
      "DELETE FROM user_records WHERE owner_user_id = ANY($1::text[]) OR (collection = 'users' AND item_id = ANY($1::text[]))",
      [userIds]
    );
    await client.query(
      "UPDATE app_users SET status = 'suspended', email = CONCAT('archived-', id, '-', email) WHERE id = ANY($1::text[])",
      [userIds]
    );
  }
}

async function createCompanyUser(owner: Awaited<ReturnType<typeof loginApi>>, role: string) {
  const email = uniqueEmail(`e2e-company-wide-${role.toLowerCase()}`);
  const user = await readOk<any>(
    await owner.post("/api/users", {
      data: {
        name: `E2E Company Wide ${role}`,
        email,
        password: USER_PASSWORD,
        role,
      },
    })
  );
  return { id: user.id, email };
}

async function createTenantOwner(owner: Awaited<ReturnType<typeof loginApi>>) {
  const email = uniqueEmail("e2e-company-wide-tenant");
  await readOk<any>(
    await owner.post("/api/admin/organizations/manual-signup", {
      data: {
        companyName: `E2E Company Wide Tenant ${Date.now()}`,
        ownerName: "E2E Company Wide Tenant Owner",
        ownerEmail: email,
        password: USER_PASSWORD,
        planId: "starter",
        billingCycle: "monthly",
        contactPhone: "09120000000",
      },
    })
  );
  return { email };
}

async function uploadDocument(
  context: Awaited<ReturnType<typeof loginApi>>,
  fields: Record<string, string> = {}
) {
  return context.post("/api/documents/upload", {
    multipart: {
      title: fields.title || "E2E company-wide document",
      type: fields.type || "OTHER",
      shipmentId: fields.shipmentId || shipmentId,
      visibility: fields.visibility || "internal",
      file: {
        name: "company-wide.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n% company wide visibility\n"),
      },
    },
  });
}

async function bootstrap(context: Awaited<ReturnType<typeof loginApi>>, userId: string) {
  const response = await context.get(`/api/users/${userId}/bootstrap`);
  expect(response.status(), await response.text()).toBeLessThan(400);
  return response.json();
}

async function ignoredCompatibilitySnapshot(
  client: DbClient,
  {
    organizationId,
    userId,
    quotationId,
    notificationId,
    channelId,
    messageId,
  }: {
    organizationId: string;
    userId: string;
    quotationId: string;
    notificationId: string;
    channelId: string;
    messageId: string;
  }
) {
  const result = await client.query(
    `SELECT jsonb_build_object(
       'customer', (
         SELECT to_jsonb(customer_row)
         FROM customers customer_row
         WHERE customer_row.organization_id = $1 AND customer_row.id = 'c1'
       ),
       'quotation', (
         SELECT to_jsonb(quotation_row)
         FROM quotations quotation_row
         WHERE quotation_row.organization_id = $1 AND quotation_row.id = $3
       ),
       'notification', (
         SELECT to_jsonb(notification_row)
         FROM notifications notification_row
         WHERE notification_row.organization_id = $1 AND notification_row.id = $4
       ),
       'channel', (
         SELECT to_jsonb(channel_row)
         FROM chat_threads channel_row
         WHERE channel_row.organization_id = $1 AND channel_row.id = $5
       ),
       'message', (
         SELECT to_jsonb(message_row)
         FROM chat_messages message_row
         WHERE message_row.organization_id = $1 AND message_row.id = $6
       ),
       'compatibilityRows', COALESCE((
         SELECT jsonb_agg(to_jsonb(record_row) ORDER BY record_row.collection, record_row.item_id)
         FROM user_records record_row
         WHERE record_row.owner_user_id = $2
           AND record_row.collection = ANY($7::text[])
           AND record_row.item_id = ANY($8::text[])
       ), '[]'::jsonb)
     ) AS snapshot`,
    [
      organizationId,
      userId,
      quotationId,
      notificationId,
      channelId,
      messageId,
      ["customers", "notifications", "channels", "messages", "quotes"],
      ["c1", quotationId, notificationId, channelId, messageId],
    ]
  );
  return result.rows[0].snapshot;
}

test.describe.serial("company-wide operational data sharing", () => {
  test.beforeAll(async () => {
    assertTestDatabaseUrl();
    client = new Client({ connectionString: testDatabaseUrl });
    await client.connect();
  });

  test.beforeEach(async () => {
    await cleanupCompanyWideArtifacts(client);
  });

  test.afterAll(async () => {
    await cleanupCompanyWideArtifacts(client);
    await client.end();
  });

  test("shares shipments, documents, workflow, and workflow-linked tasks across company members only", async () => {
    const owner = await loginApi();
    const contexts = [owner];
    try {
      const managerUser = await createCompanyUser(owner, "MANAGER");
      const operationsUser = await createCompanyUser(owner, "OPERATIONS");
      const employeeUser = await createCompanyUser(owner, "CUSTOMER_SERVICE");
      const tenantUser = await createTenantOwner(owner);

      const manager = await loginApi(managerUser.email, USER_PASSWORD);
      const operations = await loginApi(operationsUser.email, USER_PASSWORD);
      const employee = await loginApi(employeeUser.email, USER_PASSWORD);
      const tenant = await loginApi(tenantUser.email, USER_PASSWORD);
      contexts.push(manager, operations, employee, tenant);

      for (const context of [manager, operations, employee]) {
        const shipments = await readOk<any[]>(await context.get("/api/shipments"));
        expect(shipments.some((shipment) => shipment.id === shipmentId)).toBe(true);
      }

      const uploaded = await readOk<any>(
        await uploadDocument(owner, {
          title: "E2E company-wide shared shipment document",
          shipmentId,
        })
      );
      const operationsDocuments = await readOk<any[]>(await operations.get("/api/documents?includeArchived=true"));
      expect(operationsDocuments.some((document) => document.id === uploaded.id)).toBe(true);
      expect((await operations.get(`/api/documents/${encodeURIComponent(uploaded.id)}/download`)).status()).toBeLessThan(400);

      const started = await readOk<any>(await owner.post(`/api/shipments/${shipmentId}/progress/start`));
      expect(started.workflow.currentStepCode).toBe("001");
      const operationsProgress = await readOk<any>(await operations.get(`/api/shipments/${shipmentId}/progress`));
      expect(operationsProgress.workflow.currentStepCode).toBe("001");

      const completed = await readOk<any>(
        await operations.patch(`/api/shipments/${shipmentId}/progress/current`, {
          data: {
            stepCode: "001",
            status: "completed",
            internalNote: "E2E company-wide member completed the shared workflow step.",
          },
        })
      );
      expect(completed.workflow.currentStepCode).toBe("002");

      const createdTask = await readOk<any>(
        await operations.post(`/api/shipments/${shipmentId}/tasks`, {
          data: {
            title: "E2E company-wide workflow task",
            description: "A shared workflow-linked task assigned across company members.",
            assignedToUserId: employeeUser.id,
            priority: "HIGH",
            workflowInstanceId: completed.workflow.id,
            workflowStepCode: "002",
            assignmentNote: "E2E company-wide assignment note",
          },
        })
      );
      expect(createdTask.assigned_to_id || createdTask.assignedToUserId).toBe(employeeUser.id);

      const ownerTasks = await readOk<any[]>(await owner.get(`/api/tasks?shipmentId=${shipmentId}`));
      expect(ownerTasks.some((task) => task.id === createdTask.id)).toBe(true);
      const employeeTasks = await readOk<any[]>(await employee.get("/api/tasks"));
      expect(employeeTasks.some((task) => task.id === createdTask.id)).toBe(true);

      const tenantShipments = await readOk<any[]>(await tenant.get("/api/shipments"));
      expect(tenantShipments.some((shipment) => shipment.id === shipmentId)).toBe(false);
      await expectUnavailable(await tenant.get(`/api/shipments/${shipmentId}/progress`));
      await expectUnavailable(await tenant.get(`/api/documents/${encodeURIComponent(uploaded.id)}/download`));
      await expectUnavailable(await tenant.get(`/api/tasks/${createdTask.id}`));
    } finally {
      await disposeContexts(...contexts);
    }
  });

  test("shares quotations and commercial cards and survives legacy bootstrap saves", async () => {
    const owner = await loginApi();
    const contexts = [owner];
    try {
      const managerUser = await createCompanyUser(owner, "MANAGER");
      const operationsUser = await createCompanyUser(owner, "OPERATIONS");
      const employeeUser = await createCompanyUser(owner, "CUSTOMER_SERVICE");
      const manager = await loginApi(managerUser.email, USER_PASSWORD);
      const operations = await loginApi(operationsUser.email, USER_PASSWORD);
      const employee = await loginApi(employeeUser.email, USER_PASSWORD);
      contexts.push(manager, operations, employee);

      const quote = await readOk<any>(
        await manager.post("/api/quotations", {
          data: {
            customerName: "E2E company-wide quotation customer",
            customerPhone: "09120000000",
            originCity: "Tehran",
            destinationCity: "Bandar Abbas",
            cargoType: "GENERAL",
            weight: 1200,
            totalPrice: 1000000,
          },
        })
      );
      const operationQuotes = await readOk<any[]>(await operations.get("/api/quotations?includeArchived=true"));
      expect(operationQuotes.some((item) => item.id === quote.id)).toBe(true);

      const organization = await client.query("SELECT organization_id FROM app_users WHERE id = $1", [employeeUser.id]);
      const organizationId = organization.rows[0]?.organization_id;
      expect(organizationId).toBeTruthy();
      const ignoredMarker = `e2e-ignored-compatibility-${Date.now()}`;
      const ignoredIds = {
        organizationId,
        userId: employeeUser.id,
        quotationId: quote.id,
        notificationId: `${ignoredMarker}-notification`,
        channelId: `${ignoredMarker}-channel`,
        messageId: `${ignoredMarker}-message`,
      };
      const beforeIgnoredSave = await ignoredCompatibilitySnapshot(client, ignoredIds);
      const ignoredSave = await employee.put(`/api/users/${employeeUser.id}/records`, {
        data: {
          records: {
            customers: [{ id: "c1", name: "MUST NOT REPLACE CUSTOMER", phone: "00000000000" }],
            notifications: [{ id: ignoredIds.notificationId, title: "MUST NOT CREATE NOTIFICATION" }],
            channels: [{ id: ignoredIds.channelId, name: "MUST NOT CREATE CHANNEL" }],
            messages: [{ id: ignoredIds.messageId, channelId: ignoredIds.channelId, content: "MUST NOT CREATE MESSAGE" }],
            quotes: [{ id: quote.id, customerName: "MUST NOT REPLACE QUOTATION", totalPrice: 1 }],
          },
        },
      });
      expect(ignoredSave.status(), await ignoredSave.text()).toBeLessThan(400);
      expect((await ignoredSave.json()).total).toBe(0);
      expect(await ignoredCompatibilitySnapshot(client, ignoredIds)).toEqual(beforeIgnoredSave);

      const managerBootstrap = await bootstrap(manager, managerUser.id);
      const commercialCard = {
        id: `e2e-company-wide-card-${Date.now()}`,
        holderName: "E2E company-wide commercial card",
        cardNumber: "1234567890",
        status: "VALID",
        documents: [],
        createdAt: new Date().toISOString(),
      };
      const saveResponse = await manager.put(`/api/users/${managerUser.id}/records`, {
        data: {
          records: {
            ...(managerBootstrap.records || {}),
            commercialCards: [...(managerBootstrap.records?.commercialCards || []), commercialCard],
          },
        },
      });
      expect(saveResponse.status(), await saveResponse.text()).toBeLessThan(400);

      const ownerBootstrap = await bootstrap(owner, "u1");
      expect((ownerBootstrap.records?.commercialCards || []).some((item: any) => item.id === commercialCard.id)).toBe(true);

      const employeeBootstrap = await bootstrap(employee, employeeUser.id);
      expect((employeeBootstrap.records?.shipments || []).some((shipment: any) => shipment.id === shipmentId)).toBe(true);

      const saveEmployeeResponse = await employee.put(`/api/users/${employeeUser.id}/records`, {
        data: { records: employeeBootstrap.records || {} },
      });
      expect(saveEmployeeResponse.status(), await saveEmployeeResponse.text()).toBeLessThan(400);

      const shipmentsAfterSave = await readOk<any[]>(await owner.get("/api/shipments"));
      expect(shipmentsAfterSave.some((shipment) => shipment.id === shipmentId)).toBe(true);

      await expectForbidden(await employee.get("/api/admin/overview"));
      await expectForbidden(await employee.get("/api/users"));
    } finally {
      await disposeContexts(...contexts);
    }
  });
});
