import { expect, test, type Page } from "@playwright/test";
import {
  dbQuery,
  disposeContexts,
  loginApi,
  loginViaUi,
  OWNER_EMAIL,
} from "./helpers";

async function selectLastVisibleShamsiDate(page: Page, triggerIndex: number) {
  await page.getByTestId("shamsi-date-time-trigger").nth(triggerIndex).click();
  await page.getByTestId("shamsi-date-day").last().click();
}

test("commercial-card persistence tolerates stale task shipment references", async () => {
  const suffix = Date.now();
  const taskId = `e2e-stale-task-${suffix}`;
  const cardId = `e2e-commercial-card-${suffix}`;
  const orphanShipmentId = `e2e-missing-shipment-${suffix}`;
  const ownerResult = await dbQuery(
    `SELECT id, organization_id
     FROM app_users
     WHERE lower(email) = lower($1)
     LIMIT 1`,
    [OWNER_EMAIL]
  );
  const owner = ownerResult.rows[0];
  expect(owner?.id).toBeTruthy();
  expect(owner?.organization_id).toBeTruthy();

  await dbQuery(
    `INSERT INTO tasks (
       id, organization_id, owner_user_id, title, status, priority, source_type, legacy_data
     )
     VALUES ($1, $2, $3, $4, 'TODO', 'MEDIUM', 'MANUAL', $5::jsonb)`,
    [
      taskId,
      owner.organization_id,
      owner.id,
      `Stale shipment task ${suffix}`,
      JSON.stringify({ shipmentId: orphanShipmentId }),
    ]
  );

  const context = await loginApi();
  try {
    const bootstrapResponse = await context.get(`/api/users/${encodeURIComponent(owner.id)}/bootstrap`);
    expect(bootstrapResponse.status(), await bootstrapResponse.text()).toBeLessThan(400);
    const bootstrapPayload = await bootstrapResponse.json();
    const staleTask = bootstrapPayload.records.tasks.find((task: { id?: string }) => task.id === taskId);
    expect(staleTask?.shipmentId).toBe(orphanShipmentId);

    const saveResponse = await context.put(`/api/users/${encodeURIComponent(owner.id)}/records`, {
      data: {
        records: {
          tasks: bootstrapPayload.records.tasks,
          commercialCards: [
            ...(bootstrapPayload.records.commercialCards || []),
            {
              id: cardId,
              holderName: `Stale task card ${suffix}`,
              cardNumber: `STALE-${suffix}`,
              expirationDate: "1406/01/01",
              documents: [],
              contacts: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        },
      },
    });
    expect(saveResponse.status(), await saveResponse.text()).toBeLessThan(400);

    const persistedResult = await dbQuery(
      `SELECT data
       FROM user_records
       WHERE owner_user_id = $1
         AND collection = 'commercialCards'
         AND item_id = $2`,
      [owner.id, cardId]
    );
    expect(persistedResult.rows[0]?.data?.cardNumber).toBe(`STALE-${suffix}`);

    const taskResult = await dbQuery(
      "SELECT shipment_id FROM tasks WHERE id = $1",
      [taskId]
    );
    expect(taskResult.rows[0]?.shipment_id).toBeNull();
  } finally {
    await disposeContexts(context);
    await dbQuery(
      `DELETE FROM user_records
       WHERE owner_user_id = $1
         AND collection = 'commercialCards'
         AND item_id = $2`,
      [owner.id, cardId]
    );
    await dbQuery("DELETE FROM tasks WHERE id = $1", [taskId]);
  }
});

test("commercial cards page supports tabs, extra contacts, documents, and Malvani profile CRUD", async ({ page }) => {
  const suffix = Date.now();
  const holderName = `شرکت کارت بازرگانی ${suffix}`;
  const editedHolderName = `${holderName} ویرایش`;
  const responsibleName = `مسئول کارت ${suffix}`;
  const cardNumber = `CC-${suffix}`;
  const invoiceNumber = `INV-${suffix}`;
  const orderRegistrationNumber = `ORDER-${suffix}`;
  const bankName = `بانک آزمون ${suffix}`;
  const bankBranch = `شعبه مرکزی ${suffix}`;
  const goodsDescription = `کالای آزمایشی ${suffix}`;
  const tariffCode = `84${String(suffix).slice(-6)}`;
  const nationalId = `140${String(suffix).slice(-7)}`;
  const contactName = `علی رضایی ${suffix}`;
  const malvaniName = `ملوانی خلیج ${suffix}`;
  const editedMalvaniName = `${malvaniName} ویرایش`;

  await loginViaUi(page);
  await page.goto("/commercial-cards");
  await expect(page.getByRole("heading", { name: "کارت‌های بازرگانی و ملوانی" })).toBeVisible();
  await expect(page.getByTestId("malvani-tab")).toBeVisible();

  await page.getByTestId("commercial-card-add-button").click();
  await page.getByTestId("commercial-card-submit").click();
  await expect(page.locator('[role="dialog"]').getByText("وارد کردن نام شرکت / دارنده کارت الزامی است.")).toBeVisible();
  await expect(page.getByLabel("تاریخ صدور")).toHaveCount(0);

  await page.getByLabel("نام شرکت / دارنده کارت").fill(holderName);
  await page.getByLabel("شماره کارت بازرگانی").fill(cardNumber);
  await selectLastVisibleShamsiDate(page, 0);
  await page.locator("#commercial-holder-name").click();
  await page.getByLabel("کد ملی / شناسه ملی").fill(nationalId);
  await page.getByLabel("نام شخص مسئول").fill(responsibleName);
  await page.getByLabel("شماره تماس مسئول").fill("09120001122");
  await page.getByLabel("توضیحات", { exact: true }).fill("برای پیگیری تاریخ تمدید کارت بازرگانی.");

  await page.getByTestId("commercial-invoice-number").fill(invoiceNumber);
  await page.getByTestId("commercial-order-registration-number").fill(orderRegistrationNumber);
  await page.getByTestId("commercial-total-value-amount").fill("-1");
  await page.getByTestId("commercial-remaining-commitment-amount").fill("25000");
  await page.getByTestId("commercial-total-value-currency").selectOption("USD");
  await page.getByTestId("commercial-remaining-commitment-currency").selectOption("USD");
  await page.getByTestId("commercial-bank-name").fill(bankName);
  await page.getByTestId("commercial-bank-branch").fill(bankBranch);
  await page.getByTestId("commercial-tariff-code").fill(tariffCode);
  await page.getByTestId("commercial-goods-description").fill(goodsDescription);
  await selectLastVisibleShamsiDate(page, 1);
  await selectLastVisibleShamsiDate(page, 2);
  await selectLastVisibleShamsiDate(page, 3);
  await page.getByTestId("commercial-card-submit").click();
  await expect(page.locator('[role="dialog"]').getByText("ارزش کل باید یک عدد غیرمنفی معتبر باشد.")).toBeVisible();
  await page.getByTestId("commercial-total-value-amount").fill("125000.50");

  await page.getByTestId("commercial-card-contact-name").fill(contactName);
  await page.getByTestId("commercial-card-contact-role").fill("ناخدا");
  await page.getByTestId("commercial-card-contact-phone").fill("۰۹۱۲۱۲۳۴۵۶۷");
  await page.getByTestId("commercial-card-contact-label").fill("واتساپ");
  await page.getByTestId("commercial-card-contact-note").fill("شماره واتساپ");
  await page.getByTestId("commercial-card-contact-primary").click();
  await page.getByTestId("commercial-card-contact-save").click();
  await expect(page.locator('[role="dialog"]').getByText(contactName)).toBeVisible();

  await page.getByLabel("عنوان سند").fill("تصویر کارت بازرگانی");
  await page.locator("#commercial-document-file").setInputFiles({
    name: "commercial-card.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("commercial card test document"),
  });
  await page.getByLabel("توضیحات اختیاری").fill("مدرک آزمایشی کارت");
  await page.getByRole("button", { name: "افزودن سند" }).click();
  await expect(page.getByText("تصویر کارت بازرگانی")).toBeVisible();

  await page.route("**/api/users/*/records", async (route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "Forced persistence failure" }),
    });
  }, { times: 1 });
  await page.getByTestId("commercial-card-submit").click();
  await expect(page.getByTestId("commercial-card-submit")).toBeEnabled();
  await expect(page.locator('[role="dialog"]').getByText("افزودن کارت بازرگانی")).toBeVisible();
  await expect(page.getByTestId("commercial-card-item").filter({ hasText: holderName })).toHaveCount(0);

  const createPersistenceResponse = page.waitForResponse((response) => (
    /\/api\/users\/[^/]+\/records$/.test(new URL(response.url()).pathname) &&
    response.request().method() === "PUT"
  ));
  await page.getByTestId("commercial-card-submit").click();
  const createResponse = await createPersistenceResponse;
  expect(createResponse.status()).toBeLessThan(400);
  expect(Object.keys(createResponse.request().postDataJSON().records)).toEqual(["commercialCards"]);
  const cardItem = page.getByTestId("commercial-card-item").filter({ hasText: holderName });
  await expect(cardItem).toBeVisible();
  await expect(cardItem).toContainText(cardNumber);
  await expect(cardItem.getByTestId("commercial-card-invoice-number")).toContainText(invoiceNumber.replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]));
  await expect(cardItem.getByTestId("commercial-card-order-registration")).toContainText(orderRegistrationNumber.replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]));
  await expect(cardItem.getByTestId("commercial-card-total-value")).toContainText("دلار");
  await expect(cardItem.getByTestId("commercial-card-bank-branch")).toContainText(bankName);
  await expect(cardItem.getByTestId("commercial-card-goods")).toContainText(goodsDescription);
  await expect(cardItem.getByTestId("commercial-card-tariff-code")).toBeVisible();
  await expect(cardItem.getByTestId("commercial-card-commitment-deadline-alert")).not.toContainText("تاریخ ثبت نشده");
  await expect(cardItem.getByTestId("commercial-card-order-expiry-alert")).not.toContainText("تاریخ ثبت نشده");
  await expect(cardItem).toContainText("۱");

  await page.getByPlaceholder("جستجو در شرکت، فاکتور، ثبت سفارش، کالا، بانک، تعرفه یا مخاطبین...").fill(invoiceNumber);
  await expect(cardItem).toBeVisible();
  await page.getByTestId("commercial-card-filter-NEEDS_ATTENTION").click();
  await expect(cardItem).toBeVisible();
  await page.getByTestId("commercial-card-filter-ALL").click();

  await cardItem.getByRole("button", { name: "مشاهده" }).click();
  const cardDetailDialog = page.locator('[role="dialog"]');
  await expect(cardDetailDialog.getByText("جزئیات کارت بازرگانی")).toBeVisible();
  await expect(cardDetailDialog.getByText(contactName)).toBeVisible();
  await expect(cardDetailDialog.getByText(nationalId)).toBeVisible();
  await expect(cardDetailDialog.getByTestId("commercial-card-operational-info")).toBeVisible();
  await expect(cardDetailDialog.getByText(goodsDescription)).toBeVisible();
  await page.getByRole("button", { name: "انصراف" }).click();

  await cardItem.getByRole("button", { name: "ویرایش" }).click();
  await page.getByLabel("نام شرکت / دارنده کارت").fill(editedHolderName);
  await expect(page.getByTestId("commercial-invoice-number")).toHaveValue(invoiceNumber);
  await expect(page.getByTestId("commercial-total-value-amount")).toHaveValue("125000.5");
  await page.getByTestId("commercial-remaining-commitment-amount").fill("0");
  const editPersistenceResponse = page.waitForResponse((response) => (
    /\/api\/users\/[^/]+\/records$/.test(new URL(response.url()).pathname) &&
    response.request().method() === "PUT"
  ));
  await page.getByTestId("commercial-card-submit").click();
  expect((await editPersistenceResponse).status()).toBeLessThan(400);
  const editedCardItem = page.getByTestId("commercial-card-item").filter({ hasText: editedHolderName });
  await expect(editedCardItem).toBeVisible();
  await expect(editedCardItem.getByTestId("commercial-card-commitment-deadline-alert")).toContainText("تعهد تسویه شده");

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    )).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload();
  await expect(editedCardItem).toBeVisible();
  await expect(editedCardItem.getByTestId("commercial-card-invoice-number")).toBeVisible();
  await expect(editedCardItem.getByTestId("commercial-card-commitment-deadline-alert")).toContainText("تعهد تسویه شده");

  await editedCardItem.getByRole("button", { name: "غیرفعال‌سازی" }).click();
  await expect(page.getByText("غیرفعال‌سازی کارت بازرگانی")).toBeVisible();
  await page.locator('[role="dialog"]').getByRole("button", { name: "غیرفعال‌سازی" }).click();
  await expect(page.getByTestId("commercial-card-item").filter({ hasText: editedHolderName })).toHaveCount(0);

  await page.getByTestId("malvani-tab").click();
  await page.getByTestId("malvani-add-button").click();
  await page.getByTestId("malvani-display-name").fill(malvaniName);
  await page.getByTestId("malvani-captain-name").fill(`ناخدا ${suffix}`);
  await page.getByTestId("malvani-lenj-name").fill(`لنج ${suffix}`);
  await page.getByTestId("malvani-lenj-registration").fill(`LENJ-${suffix}`);
  await page.getByTestId("malvani-lenj-type").fill("لنج باری");
  await page.getByTestId("malvani-home-port").fill("بندر دیلم");
  await page.getByTestId("malvani-contact-name").fill(`مخاطب ملوانی ${suffix}`);
  await page.getByTestId("malvani-contact-role").fill("ناخدا");
  await page.getByTestId("malvani-contact-phone").fill("09129876543");
  await page.getByTestId("malvani-contact-label").fill("اضطراری");
  await page.getByTestId("malvani-contact-primary").click();
  await page.getByTestId("malvani-contact-save").click();
  await page.getByTestId("malvani-submit").click();

  const profileItem = page.getByTestId("malvani-profile-item").filter({ hasText: malvaniName });
  await expect(profileItem).toBeVisible();
  await expect(profileItem).toContainText("۱");

  await profileItem.getByRole("button", { name: "مشاهده" }).click();
  await expect(page.getByText("پروفایل ملوانی", { exact: true })).toBeVisible();
  await expect(page.getByText("09129876543")).toBeVisible();
  await page.getByRole("button", { name: "ویرایش" }).click();
  await page.getByTestId("malvani-display-name").fill(editedMalvaniName);
  await page.getByTestId("malvani-submit").click();

  const editedProfileItem = page.getByTestId("malvani-profile-item").filter({ hasText: editedMalvaniName });
  await expect(editedProfileItem).toBeVisible();
  await editedProfileItem.getByRole("button", { name: "غیرفعال‌سازی" }).click();
  await expect(page.getByText("غیرفعال‌سازی ملوانی")).toBeVisible();
  await page.locator('[role="dialog"]').getByRole("button", { name: "غیرفعال‌سازی" }).click();
  await expect(page.getByTestId("malvani-profile-item").filter({ hasText: editedMalvaniName })).toHaveCount(0);
});
