import { expect, test, type Page } from "@playwright/test";
import {
  apiContext,
  dbQuery,
  disposeContexts,
  expectForbidden,
  expectUnavailable,
  loginApi,
  loginViaUi,
  readOk,
} from "./helpers";

const retiredPublicRoutes = ["/signup", "/signup/pending", "/contact"];
const loginEntryRoutes = ["/login", ...retiredPublicRoutes];
const viewports = [
  { name: "desktop", width: 1280, height: 720 },
  { name: "mobile", width: 375, height: 812 },
];

function isIgnorableDevServerMessage(message: string) {
  return (
    message.includes("WebSocket connection to") ||
    message.includes("[vite] failed to connect to websocket") ||
    message.includes("WebSocket closed without opened") ||
    message.includes("favicon.ico")
  );
}

async function expectNoRetiredPublicLinks(page: Page) {
  await expect(page.locator('a[href="/contact"]')).toHaveCount(0);
  await expect(page.locator('a[href^="/signup"]')).toHaveCount(0);
}

for (const viewport of viewports) {
  test.describe(`public landing page (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("renders product content and demo CTA without overflow", async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error" && !isIgnorableDevServerMessage(message.text())) {
          consoleErrors.push(message.text());
        }
      });
      page.on("pageerror", (error) => {
        if (!isIgnorableDevServerMessage(error.message)) consoleErrors.push(error.message);
      });

      await page.goto("/");
      await expect(page.getByTestId("landing-page")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toContainText("هر محموله");
      await expect(page.getByTestId("metric-active-companies")).toContainText("۶");
      await expect(page.getByTestId("metric-users")).toContainText("۶۸");
      await expect(page.getByTestId("metric-documents")).toContainText("۱٬۲۱۴");
      await expect(page.getByTestId("landing-internal-chat")).toContainText("گفت‌وگوی داخلی");
      await expect(page.getByTestId("landing-internal-chat")).toContainText("محموله LP-9804");
      await expect(page.getByTestId("landing-demo-form")).toBeVisible();
      await expect(page.getByRole("link", { name: "ورود کاربران" }).first()).toHaveAttribute("href", "/login");
      await expectNoRetiredPublicLinks(page);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflow).toBe(false);
      expect(consoleErrors).toEqual([]);
    });
  });

  test.describe(`public release login entry (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const route of loginEntryRoutes) {
      test(`${route} renders the login entry without retired funnel links`, async ({ page }) => {
        const consoleErrors: string[] = [];
        page.on("console", (message) => {
          if (message.type() === "error" && !isIgnorableDevServerMessage(message.text())) {
            consoleErrors.push(message.text());
          }
        });
        page.on("pageerror", (error) => {
          if (!isIgnorableDevServerMessage(error.message)) consoleErrors.push(error.message);
        });

        await page.goto(route);
        if (retiredPublicRoutes.includes(route)) {
          await expect(page).toHaveURL(/\/login$/);
        }
        await expect(page.locator('input[type="email"]')).toBeVisible();
        await expect(page.locator('input[type="password"]')).toBeVisible();
        await expectNoRetiredPublicLinks(page);

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
        expect(overflow).toBe(false);
        expect(consoleErrors).toEqual([]);
      });
    }
  });
}

test("landing demo form submits a request and shows an inline success state", async ({ page }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await page.goto("/");
  await page.getByTestId("demo-company-name").fill(`شرکت نمایشی ${suffix}`);
  await page.getByTestId("demo-contact-name").fill("هماهنگ‌کننده تست");
  await page.getByTestId("demo-contact-phone").fill("09120000000");
  await page.getByTestId("submit-demo-request").click();
  await expect(page.getByTestId("demo-request-success")).toBeVisible();
});

test("platform admin can review and resolve a landing demo request", async ({ page }) => {
  const companyName = `شرکت بررسی ادمین ${Date.now()}`;
  const created = await page.request.post("/api/contact-requests", {
    data: {
      companyName,
      contactName: "هماهنگ‌کننده ادمین",
      contactPhone: "09123334444",
      preferredContactMethod: "phone",
      message: "درخواست دمو برای آزمون صندوق ورودی",
    },
  });
  expect(created.status()).toBe(201);

  await loginViaUi(page);
  await page.goto("/platform-admin");
  await page.getByRole("button", { name: /درخواست‌های دمو/ }).first().click();
  const inbox = page.getByTestId("admin-section-contacts");
  await expect(inbox).toBeVisible();
  const requestCard = inbox.locator('[data-slot="card"]', { hasText: companyName }).first();
  await expect(requestCard).toBeVisible();
  await requestCard.getByRole("button", { name: /علامت‌گذاری/ }).click();
  await expect(requestCard.getByText("رسیدگی‌شده", { exact: true })).toBeVisible();
});

test("/login does not prefill internal admin email", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('input[type="email"]')).toHaveValue("");
  await expect(page.locator("body")).not.toContainText("darksudo22@gmail.com");
});

test.describe.serial("public demo request workflow", () => {
  test("validates public requests and silently discards honeypot submissions", async () => {
    const context = await apiContext();
    const invalid = await context.post("/api/contact-requests", {
      data: { companyName: "شرکت ناقص", contactName: "فرد تست", contactEmail: "invalid" },
    });
    expect(invalid.status()).toBe(400);

    const trapCompany = `honeypot-${Date.now()}`;
    const trapped = await context.post("/api/contact-requests", {
      data: {
        companyName: trapCompany,
        contactName: "Bot",
        contactPhone: "09120000000",
        website: "https://spam.example",
      },
    });
    expect(trapped.status()).toBe(201);
    const rows = await dbQuery("SELECT id FROM contact_requests WHERE company_name = $1", [trapCompany]);
    expect(rows.rowCount).toBe(0);
    await disposeContexts(context);
  });

  test("stores a valid request without echoing PII and allows only platform admin review", async () => {
    const publicContext = await apiContext();
    const companyName = `شرکت دموی ${Date.now()}`;
    const phone = "09121112222";
    const createdResponse = await publicContext.post("/api/contact-requests", {
      data: {
        companyName,
        contactName: "مدیر عملیات",
        contactPhone: phone,
        preferredContactMethod: "phone",
        message: "درخواست بررسی جریان محموله‌ها",
      },
    });
    expect(createdResponse.status()).toBe(201);
    const publicPayload = await createdResponse.json();
    expect(publicPayload.ok).toBe(true);
    expect(JSON.stringify(publicPayload)).not.toContain(companyName);
    expect(JSON.stringify(publicPayload)).not.toContain(phone);

    await expectForbidden(await publicContext.get("/api/admin/contact-requests"));

    const admin = await loginApi();
    const requests = await readOk<any[]>(await admin.get("/api/admin/contact-requests?status=new"));
    const created = requests.find((item) => item.companyName === companyName);
    expect(created).toBeTruthy();
    expect(created.contactPhone).toBe(phone);
    expect(created.status).toBe("new");

    const resolved = await readOk<any>(await admin.post(`/api/admin/contact-requests/${created.id}/resolve`));
    expect(resolved.status).toBe("resolved");
    await disposeContexts(publicContext, admin);
  });
});

test("retired public signup API stays unavailable", async () => {
  const context = await apiContext();

  await expectUnavailable(await context.post("/api/signup", { data: { companyName: "Disabled" } }));

  await disposeContexts(context);
});

test("retired admin signup review APIs stay unavailable", async () => {
  const context = await apiContext();

  await expectUnavailable(await context.get("/api/admin/signup-requests"));
  await expectUnavailable(await context.post("/api/admin/signup-requests/disabled/review", { data: { approved: true } }));
  await expectUnavailable(await context.delete("/api/admin/signup-requests/disabled"));
  await disposeContexts(context);
});
