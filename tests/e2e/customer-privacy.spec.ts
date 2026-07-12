// @ts-nocheck
import { expect, test } from "@playwright/test";
import pg from "pg";
import {
  USER_PASSWORD,
  disposeContexts,
  expectForbidden,
  loginApi,
  readOk,
  uniqueEmail,
} from "./helpers";

const { Client } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL || "postgres://postgres@localhost:5432/logisticplus_test";

async function dbQuery(sql: string, params: any[] = []) {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

async function cleanupPrivacyRows(marker: string) {
  if (!testDatabaseUrl.toLowerCase().includes("test")) {
    throw new Error(`Refusing to clean records in a non-test database: ${testDatabaseUrl}`);
  }

  const customers = await dbQuery(
    "SELECT id FROM customers WHERE company_name LIKE $1 OR contact_name LIKE $1 OR email LIKE $1",
    [`%${marker}%`]
  );
  const customerIds = customers.rows.map((row) => row.id);
  if (customerIds.length) {
    const shipments = await dbQuery(
      "SELECT id FROM shipments WHERE customer_id = ANY($1::text[]) OR customer_name LIKE $2",
      [customerIds, `%${marker}%`]
    );
    const shipmentIds = shipments.rows.map((row) => row.id);
    if (shipmentIds.length) {
      await dbQuery("DELETE FROM documents WHERE shipment_id = ANY($1::text[])", [shipmentIds]);
      await dbQuery("DELETE FROM chat_threads WHERE shipment_id = ANY($1::text[])", [shipmentIds]);
      await dbQuery("DELETE FROM task_events WHERE shipment_id = ANY($1::text[])", [shipmentIds]);
      await dbQuery("DELETE FROM tasks WHERE shipment_id = ANY($1::text[])", [shipmentIds]);
      await dbQuery("DELETE FROM shipment_status_events WHERE shipment_id = ANY($1::text[])", [shipmentIds]);
      await dbQuery("DELETE FROM shipment_kootaj_details WHERE shipment_id = ANY($1::text[])", [shipmentIds]);
      await dbQuery("DELETE FROM shipment_workflow_instances WHERE shipment_id = ANY($1::text[])", [shipmentIds]);
      await dbQuery("DELETE FROM shipment_v2_profiles WHERE shipment_id = ANY($1::text[])", [shipmentIds]);
      await dbQuery("DELETE FROM shipments WHERE id = ANY($1::text[])", [shipmentIds]);
    }
    await dbQuery("DELETE FROM archive_records WHERE entity_type = 'customer' AND entity_id = ANY($1::text[])", [customerIds]);
    await dbQuery("DELETE FROM quotations WHERE customer_id = ANY($1::text[]) OR customer_name LIKE $2", [customerIds, `%${marker}%`]);
    await dbQuery("DELETE FROM customers WHERE id = ANY($1::text[])", [customerIds]);
  }
  await dbQuery("DELETE FROM quotations WHERE customer_name LIKE $1", [`%${marker}%`]);

  const users = await dbQuery("SELECT id FROM app_users WHERE email LIKE $1", [`%${marker}%`]);
  const userIds = users.rows.map((row) => row.id);
  if (userIds.length) {
    await dbQuery("DELETE FROM app_sessions WHERE user_id = ANY($1::text[])", [userIds]);
    await dbQuery("DELETE FROM user_permissions WHERE user_id = ANY($1::text[])", [userIds]);
    await dbQuery(
      "DELETE FROM user_records WHERE owner_user_id = ANY($1::text[]) OR (collection = 'users' AND item_id = ANY($1::text[]))",
      [userIds]
    );
    await dbQuery(
      "UPDATE app_users SET status = 'suspended', email = CONCAT('archived-', id, '-', email) WHERE id = ANY($1::text[])",
      [userIds]
    );
  }
}

async function readSearch(context, params) {
  const response = await context.get(`/api/search?${new URLSearchParams(params).toString()}`);
  expect(response.status(), await response.text()).toBeLessThan(400);
  return response.json();
}

test.describe.serial("customer private detail visibility", () => {
  const marker = `e2e-customer-privacy-${Date.now()}`;

  test.beforeEach(async () => {
    await cleanupPrivacyRows(marker);
  });

  test.afterEach(async () => {
    await cleanupPrivacyRows(marker);
  });

  test("limits private customer fields while showing shipment names to CEO and manager users", async () => {
    const owner = await loginApi();
    const contexts = [owner];
    try {
      const employeeEmail = uniqueEmail(marker);
      const employeeUser = await readOk<any>(
        await owner.post("/api/users", {
          data: {
            name: "E2E Customer Privacy Operations",
            email: employeeEmail,
            password: USER_PASSWORD,
            role: "OPERATIONS",
          },
        })
      );
      const employee = await loginApi(employeeEmail, USER_PASSWORD);
      const managerEmail = uniqueEmail(`${marker}-manager`);
      await readOk<any>(
        await owner.post("/api/users", {
          data: {
            name: "E2E Customer Privacy Manager",
            email: managerEmail,
            password: USER_PASSWORD,
            role: "MANAGER",
          },
        })
      );
      const manager = await loginApi(managerEmail, USER_PASSWORD);
      contexts.push(employee, manager);

      const privatePhone = "09125550177";
      const secondaryPhone = "09125550178";
      const privateEmail = `${marker}-customer@example.test`;
      const privateAddress = `${marker} private address`;
      const privateReferrer = `${marker} private referrer`;
      const privateNotes = `${marker} private notes`;
      const privateCustomerCode = `${marker}-code`.toUpperCase();
      const privateCompany = `${marker} Company`;
      const customer = await readOk<any>(
        await owner.post("/api/customers", {
          data: {
            customerCode: privateCustomerCode,
            name: `${marker} Customer`,
            company: privateCompany,
            email: privateEmail,
            phone: privatePhone,
            phoneNumbers: [
              { phoneNumber: privatePhone, phoneLabel: "CEO", isPrimary: true },
              { phoneNumber: secondaryPhone, phoneLabel: "Finance", isPrimary: false },
            ],
            address: privateAddress,
            referrer: privateReferrer,
            notes: privateNotes,
          },
        })
      );
      expect(customer.referrer).toBe(privateReferrer);
      expect(customer.customerCode).toBe(privateCustomerCode);
      expect(customer.phoneNumbers.map((phone: any) => phone.phoneNumber)).toEqual([privatePhone, secondaryPhone]);
      expect(customer.canViewPrivateDetails).toBe(true);

      const createdShipment = await readOk<any>(
        await owner.post("/api/shipments/v2", {
          data: {
            flowCode: "IMPORT_SHIP",
            customerId: customer.id,
            origin: "Jebel Ali",
            dischargePort: "Bandar Abbas",
            deliveryPort: "Tehran",
            consigneeName: `${marker} Consignee`,
          },
        })
      );
      const shipmentId = createdShipment.shipment.id;
      const trackingNumber = createdShipment.shipment.trackingNumber;
      expect(createdShipment.shipment.customerName).toBe(privateCompany);

      const managerShipments = await readOk<any[]>(await manager.get("/api/shipments"));
      expect(managerShipments.find((item) => item.id === shipmentId)).toMatchObject({
        customerCode: privateCustomerCode,
        customerName: privateCompany,
      });
      const managerShipmentDetail = await readOk<any>(await manager.get(`/api/shipments/${shipmentId}`));
      expect(managerShipmentDetail).toMatchObject({
        customerCode: privateCustomerCode,
        customerName: privateCompany,
      });
      const managerV2Profile = await readOk<any>(await manager.get(`/api/shipments/${shipmentId}/v2-profile`));
      expect(managerV2Profile.shipment).toMatchObject({
        customerCode: privateCustomerCode,
        customerName: privateCompany,
      });
      const managerDailyRows = await readOk<any[]>(await manager.get(`/api/daily-status?shipmentId=${shipmentId}`));
      expect(managerDailyRows[0]).toMatchObject({
        baseInfo: { customerCode: privateCustomerCode, customerName: privateCompany },
        customer: { customerCode: privateCustomerCode, name: privateCompany },
      });
      const managerDocumentSearch = await readOk<any[]>(
        await manager.get(`/api/documents/management-center/search?query=${encodeURIComponent(privateCompany)}`)
      );
      expect(managerDocumentSearch.find((item) => item.id === shipmentId)).toMatchObject({
        customerCode: privateCustomerCode,
        customerName: privateCompany,
      });
      const managerDashboard = await readOk<any>(await manager.get("/api/dashboard"));
      expect(managerDashboard.lastUpdatedShipments.find((item) => item.id === shipmentId)).toMatchObject({
        customerCode: privateCustomerCode,
        customerName: privateCompany,
      });

      const employeeShipments = await readOk<any[]>(await employee.get("/api/shipments"));
      const employeeShipment = employeeShipments.find((item) => item.id === shipmentId);
      expect(employeeShipment).toMatchObject({
        customerCode: privateCustomerCode,
        customerName: privateCustomerCode,
      });
      expect(JSON.stringify(employeeShipment)).not.toContain(privateCompany);
      const employeeShipmentDetail = await readOk<any>(await employee.get(`/api/shipments/${shipmentId}`));
      expect(employeeShipmentDetail).toMatchObject({
        customerCode: privateCustomerCode,
        customerName: privateCustomerCode,
      });
      expect(JSON.stringify(employeeShipmentDetail)).not.toContain(privateCompany);
      const employeeV2Profile = await readOk<any>(await employee.get(`/api/shipments/${shipmentId}/v2-profile`));
      expect(employeeV2Profile.shipment).toMatchObject({
        customerCode: privateCustomerCode,
        customerName: privateCustomerCode,
      });
      expect(JSON.stringify(employeeV2Profile.shipment)).not.toContain(privateCompany);
      const employeeDailyRows = await readOk<any[]>(await employee.get(`/api/daily-status?shipmentId=${shipmentId}`));
      expect(employeeDailyRows[0]).toMatchObject({
        baseInfo: { customerCode: privateCustomerCode, customerName: privateCustomerCode },
        customer: { customerCode: privateCustomerCode, name: privateCustomerCode },
      });
      expect(JSON.stringify(employeeDailyRows[0])).not.toContain(privateCompany);
      const employeeDocumentByTracking = await readOk<any[]>(
        await employee.get(`/api/documents/management-center/search?query=${encodeURIComponent(trackingNumber)}`)
      );
      expect(employeeDocumentByTracking.find((item) => item.id === shipmentId)).toMatchObject({
        customerCode: privateCustomerCode,
        customerName: privateCustomerCode,
      });
      expect(JSON.stringify(employeeDocumentByTracking)).not.toContain(privateCompany);
      const employeeDocumentByCompany = await readOk<any[]>(
        await employee.get(`/api/documents/management-center/search?query=${encodeURIComponent(privateCompany)}`)
      );
      expect(employeeDocumentByCompany.some((item) => item.id === shipmentId)).toBe(false);
      const employeeDashboard = await readOk<any>(await employee.get("/api/dashboard"));
      const employeeDashboardShipment = employeeDashboard.lastUpdatedShipments.find((item) => item.id === shipmentId);
      expect(employeeDashboardShipment).toMatchObject({
        customerCode: privateCustomerCode,
        customerName: privateCustomerCode,
      });
      expect(JSON.stringify(employeeDashboardShipment)).not.toContain(privateCompany);

      const employeeCustomers = await readOk<any[]>(
        await employee.get(`/api/customers?includeArchived=true&search=${encodeURIComponent(privateCustomerCode)}`)
      );
      const employeeCustomer = employeeCustomers.find((item) => item.id === customer.id);
      expect(employeeCustomer).toMatchObject({
        id: customer.id,
        customerCode: privateCustomerCode,
        name: privateCustomerCode,
        company: privateCustomerCode,
        phone: "",
        phoneNumbers: [],
        email: "",
        address: "",
        referrer: "",
        notes: "",
        canViewPrivateDetails: false,
      });

      const employeeDetail = await readOk<any>(await employee.get(`/api/customers/${customer.id}`));
      expect(employeeDetail).toMatchObject({
        customerCode: privateCustomerCode,
        name: privateCustomerCode,
        company: privateCustomerCode,
        phone: "",
        phoneNumbers: [],
        email: "",
        address: "",
        referrer: "",
        notes: "",
        canViewPrivateDetails: false,
      });

      const privateFieldCustomerSearch = await readOk<any[]>(
        await employee.get(`/api/customers?search=${encodeURIComponent(privatePhone)}`)
      );
      expect(privateFieldCustomerSearch.some((item) => item.id === customer.id)).toBe(false);
      const privateNameCustomerSearch = await readOk<any[]>(
        await employee.get(`/api/customers?search=${encodeURIComponent(privateCompany)}`)
      );
      expect(privateNameCustomerSearch.some((item) => item.id === customer.id)).toBe(false);

      const globalSearch = await readSearch(employee, { q: privatePhone, type: "customers" });
      expect(globalSearch.results.some((result) => result.id === customer.id)).toBe(false);
      expect(JSON.stringify(globalSearch.results)).not.toContain(privatePhone);
      const codeGlobalSearch = await readSearch(employee, { q: privateCustomerCode, type: "customers" });
      expect(codeGlobalSearch.results.some((result) => result.id === customer.id)).toBe(true);
      expect(JSON.stringify(codeGlobalSearch.results)).not.toContain(privateCompany);

      const bootstrap = await employee.get(`/api/users/${employeeUser.id}/bootstrap`);
      expect(bootstrap.status(), await bootstrap.text()).toBeLessThan(400);
      const bootstrapPayload = await bootstrap.json();
      const bootstrapCustomer = (bootstrapPayload.records?.customers || []).find((item: any) => item.id === customer.id);
      expect(bootstrapCustomer).toMatchObject({
        customerCode: privateCustomerCode,
        name: privateCustomerCode,
        company: privateCustomerCode,
        phone: "",
        phoneNumbers: [],
        email: "",
        address: "",
        referrer: "",
        notes: "",
        canViewPrivateDetails: false,
      });
      expect(JSON.stringify(bootstrapPayload.records?.customers || [])).not.toContain(privatePhone);
      expect(JSON.stringify(bootstrapPayload.records?.customers || [])).not.toContain(secondaryPhone);
      expect(JSON.stringify(bootstrapPayload.records?.customers || [])).not.toContain(privateAddress);
      expect(JSON.stringify(bootstrapPayload.records?.customers || [])).not.toContain(privateReferrer);

      const saveResponse = await employee.put(`/api/users/${employeeUser.id}/records`, {
        data: { records: bootstrapPayload.records || {} },
      });
      expect(saveResponse.status(), await saveResponse.text()).toBeLessThan(400);

      const ownerDetailAfterSave = await readOk<any>(await owner.get(`/api/customers/${customer.id}`));
      expect(ownerDetailAfterSave).toMatchObject({
        phone: privatePhone,
        email: privateEmail,
        address: privateAddress,
        referrer: privateReferrer,
        notes: privateNotes,
        canViewPrivateDetails: true,
      });

      await expectForbidden(
        await employee.post("/api/customers", {
          data: { name: `${marker} Unauthorized`, company: `${marker} Unauthorized Co` },
        })
      );
      await expectForbidden(await employee.patch(`/api/customers/${customer.id}`, { data: { phone: "09129999999" } }));
      await expectForbidden(await employee.post(`/api/customers/${customer.id}/archive`));

      const quotePhone = "09124440333";
      const quotation = await readOk<any>(
        await owner.post("/api/quotations", {
          data: {
            customerId: customer.id,
            customerName: `${marker} Quote Customer`,
            customerPhone: quotePhone,
            originCity: "Tehran",
            destinationCity: "Bandar Abbas",
            cargoType: "GENERAL",
            weight: 1200,
            totalPrice: 1000000,
          },
        })
      );
      expect(quotation.customerPhone).toBe(quotePhone);

      const employeeQuotes = await readOk<any[]>(await employee.get("/api/quotations?includeArchived=true"));
      expect(employeeQuotes.find((item) => item.id === quotation.id)?.customerPhone).toBe("");
      const employeeQuotationDetail = await readOk<any>(await employee.get(`/api/quotations/${quotation.id}`));
      expect(employeeQuotationDetail.customerPhone).toBe("");

      const employeeQuotePatch = await readOk<any>(
        await employee.patch(`/api/quotations/${quotation.id}`, {
          data: { customerPhone: "09127770000", notes: `${marker} employee quote note` },
        })
      );
      expect(employeeQuotePatch.customerPhone).toBe("");

      const ownerQuotationAfterPatch = await readOk<any>(await owner.get(`/api/quotations/${quotation.id}`));
      expect(ownerQuotationAfterPatch.customerPhone).toBe(quotePhone);
      expect(ownerQuotationAfterPatch.notes).toBe(`${marker} employee quote note`);
    } finally {
      await disposeContexts(...contexts);
    }
  });
});
