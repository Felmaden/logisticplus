import { expect, test } from "@playwright/test";
import { loginViaUi, readOk } from "./helpers";

test.describe("document management center", () => {
  test("searches a shipment and opens profile, documents, customer, and malvani panels", async ({ page }) => {
    await loginViaUi(page);
    const marker = `DocMgmt${Date.now()}`;
    const customer = await readOk<any>(
      await page.request.post("/api/customers", {
        data: {
          customerCode: `${marker}-CUS`.toUpperCase(),
          name: `${marker} Customer`,
          company: `${marker} Company`,
          email: `${marker.toLowerCase()}@example.test`,
          phone: "09120000000",
          address: `${marker} Address`,
        },
      })
    );
    const malvani = await readOk<any>(
      await page.request.post("/api/malvani-profiles", {
        data: {
          displayName: `${marker} Malvani`,
          captainName: `${marker} Captain`,
          lenjName: `${marker} Lenj`,
          lenjRegistrationNumber: `LENJ-${Date.now()}`,
          lenjType: "لنج باری",
          homePort: "بندر دیلم",
          activeStatus: "ACTIVE",
          note: "Document management center credential",
        },
      })
    );
    const created = await readOk<any>(
      await page.request.post("/api/shipments/v2", {
        data: {
          flowCode: "IMPORT_LANJ",
          customerId: customer.id,
          origin: "Dubai",
          dischargePort: "Bandar Abbas",
          deliveryPort: "Bushehr",
          consigneeName: `${marker} Consignee`,
          lenjType: "MALVANI",
        },
      })
    );
    const trackingNumber = created.shipment.trackingNumber;
    await readOk<any>(
      await page.request.patch(`/api/shipments/${encodeURIComponent(created.shipment.id)}/v2-profile/sections/base`, {
        data: {
          ...created.profile.sections.base,
          statusText: "در حال بررسی اسناد",
          currentStage: "کنترل اولیه مدارک",
          orderRegistrationNumber: "123456789",
          malvaniProfileId: malvani.id,
          malvaniDisplayName: malvani.displayName,
        },
      })
    );
    await readOk<any>(
      await page.request.post("/api/documents/upload", {
        multipart: {
          title: `${marker} Bill of Lading`,
          type: "SHIPPING_DOCUMENTS",
          shipmentId: created.shipment.id,
          file: {
            name: "bill-of-lading.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("document management center smoke"),
          },
        },
      })
    );

    await page.goto("/documents/management-center");
    await expect(page.getByTestId("document-management-center-page")).toBeVisible();
    await expect(page.getByText("برای شروع، شماره محموله یا شماره رهگیری را جستجو کنید").first()).toBeVisible();

    await page.getByTestId("document-management-search").fill(`missing-${Date.now()}`);
    await expect(page.getByText("محموله‌ای پیدا نشد")).toBeVisible();

    await page.getByTestId("document-management-search").fill(trackingNumber);
    const searchResult = page.getByTestId(`document-management-result-${created.shipment.id}`);
    await expect(searchResult).toBeVisible();
    await expect(searchResult).toContainText(`${marker} Customer`);
    await searchResult.click();

    await expect(page.getByTestId("document-management-shipment-profile")).toBeVisible();
    await expect(page.getByTestId("document-management-base-code")).toContainText(trackingNumber);
    await expect(page.getByTestId("document-management-base-customer")).toContainText(`${marker} Customer`);
    await expect(page.getByTestId("document-management-profile-goods")).toBeVisible();
    await expect(page.getByTestId("document-management-profile-shipping")).toHaveCount(0);
    await expect(page.getByTestId("document-management-chat-section")).toBeVisible();
    await expect(page.getByTestId("document-management-documents-section")).toContainText(`${marker} Bill of Lading`);

    await page.getByTestId("document-management-customer-button").click();
    await expect(page.getByTestId("document-management-customer-dialog")).toContainText(`${marker} Customer`);
    await expect(page.getByTestId("document-management-customer-dialog")).toContainText(customer.customerCode);
    await page.keyboard.press("Escape");

    await page.getByTestId("document-management-business-credential-button").click();
    await expect(page.getByTestId("document-management-business-credential-dialog")).toContainText(`${marker} Malvani`);
    await expect(page.getByTestId("document-management-business-credential-dialog")).toContainText(`${marker} Captain`);

    await page.goto("/dashboard");
    await page.getByTestId("dashboard-document-shipment-search-input").fill(trackingNumber);
    await page.getByTestId("dashboard-document-shipment-search-submit").click();
    await expect(page).toHaveURL(/\/documents\/management-center\?shipment=/);
    await expect(page.getByTestId("document-management-shipment-profile")).toBeVisible();
    await expect(page.getByTestId("document-management-base-code")).toContainText(trackingNumber);
  });

  test("shows commercial-ship provider and per-container dates in document management and daily status", async ({ page }) => {
    await loginViaUi(page);
    const marker = `DocMgmtShipping${Date.now()}`;
    const customer = await readOk<any>(
      await page.request.post("/api/customers", {
        data: {
          customerCode: `${marker}-CUS`.toUpperCase(),
          name: `${marker} Customer`,
          company: `${marker} Company`,
          email: `${marker.toLowerCase()}@example.test`,
          phone: "09120000000",
          address: `${marker} Address`,
        },
      })
    );
    const created = await readOk<any>(
      await page.request.post("/api/shipments/v2", {
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
    await readOk<any>(
      await page.request.patch(`/api/shipments/${encodeURIComponent(created.shipment.id)}/v2-profile/sections/shipping`, {
        data: {
          providerType: "SHIPPING_LINE",
          providerName: `${marker} Line`,
          containerRows: [
            {
              containerNumber: "MSCU1122334",
              dischargeDate: "1405/05/10",
              deliveryOrderDate: "1405/05/11",
              arrivalNoticeDate: "1405/05/12",
            },
            {
              containerNumber: "TCLU5566778",
              dischargeDate: "1405/05/13",
              deliveryOrderDate: "1405/05/14",
              arrivalNoticeDate: "1405/05/15",
            },
          ],
        },
      })
    );

    await page.goto("/documents/management-center");
    await page.getByTestId("document-management-search").fill(created.shipment.trackingNumber);
    await page.getByTestId(`document-management-result-${created.shipment.id}`).click();

    const documentShipping = page.getByTestId("document-management-profile-shipping");
    await expect(documentShipping).toBeVisible();
    await expect(documentShipping).toContainText("لاین کشتیرانی");
    await expect(documentShipping).toContainText(`${marker} Line`);
    await expect(documentShipping).toContainText("MSCU1122334");
    await expect(documentShipping).toContainText("TCLU5566778");
    await expect(documentShipping).toContainText("تاریخ تخلیه");
    await expect(documentShipping).toContainText("تاریخ ترخیصیه");
    await expect(documentShipping).toContainText("تاریخ اعلامیه ورود");

    await page.goto("/daily-status");
    await page.getByTestId("daily-status-search").fill(created.shipment.trackingNumber);
    await expect(page.getByTestId(`daily-status-row-${created.shipment.id}`)).toBeVisible();
    await page.getByTestId(`daily-status-details-${created.shipment.id}`).click();

    const dailyShipping = page.getByTestId(`daily-status-desktop-section-shipping-${created.shipment.id}`);
    await expect(dailyShipping).toBeVisible();
    await expect(dailyShipping).toContainText("لاین کشتیرانی");
    await expect(dailyShipping).toContainText(`${marker} Line`);
    await expect(dailyShipping).toContainText("MSCU1122334");
    await expect(dailyShipping).toContainText("TCLU5566778");
    await expect(dailyShipping).toContainText("1405/05/10");
    await expect(dailyShipping).toContainText("1405/05/15");
  });
});
