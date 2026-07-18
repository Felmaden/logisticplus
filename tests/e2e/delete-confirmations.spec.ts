import { expect, test } from "@playwright/test";
import { loginApi, loginViaUi, readOk } from "./helpers";

test.describe.serial("disabled archive UI surfaces", () => {
  test("quotation UI archive action stays disabled while backend archive remains available", async ({ page }) => {
    const api = await loginApi();
    const suffix = Date.now();
    const customerName = `E2E disabled quotation archive ${suffix}`;
    const quotation = await readOk<any>(
      await api.post("/api/quotations", {
        data: {
          customerName,
          customerPhone: "09120000000",
          originCity: "Tehran",
          destinationCity: "Bandar Abbas",
          cargoType: "GENERAL",
          weight: 4,
          dimensions: "2x2x2",
          pickupDate: new Date().toISOString(),
          deliveryDate: new Date().toISOString(),
          requirements: [],
          baseRate: 1000000,
          fuelSurcharge: 100000,
          loadingFees: 50000,
          tollFees: 25000,
          insurancePercentage: 1,
          profitMargin: 10,
          totalPrice: 1292500,
          validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          status: "LOADING",
        },
      })
    );
    await readOk<any>(await api.post(`/api/quotations/${quotation.id}/archive`));
    const archivedQuotations = await readOk<any[]>(await api.get("/api/quotations?includeArchived=true"));
    expect(archivedQuotations.find((item) => item.id === quotation.id)?.status).toBe("ARCHIVED");
    await api.dispose();

    await loginViaUi(page);
    await page.goto("/quotations");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByLabel(`Archive quotation ${quotation.id}`)).toHaveCount(0);
    await expect(page.getByText(customerName)).toHaveCount(0);
  });
});
