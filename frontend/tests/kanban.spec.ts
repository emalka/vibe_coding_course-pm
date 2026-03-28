import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel(/username/i).fill("user");
  await page.getByLabel(/password/i).fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.locator('[data-testid^="column-"]').first()).toBeVisible();
}

test("shows login page and rejects wrong credentials", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  await page.getByLabel(/username/i).fill("user");
  await page.getByLabel(/password/i).fill("wrong");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByTestId("login-error")).toBeVisible();
});

test("login -> see board -> logout -> see login", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("loads the kanban board from API", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  // Verify seed data loaded from DB
  await expect(page.getByText("Align roadmap themes")).toBeVisible();
});

test("adds a card and persists after refresh", async ({ page }) => {
  await login(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("E2E persist test");
  await firstColumn.getByPlaceholder("Details").fill("Should survive refresh.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("E2E persist test").first()).toBeVisible();

  // Refresh and verify the card persisted
  await page.reload();
  await expect(page.locator('[data-testid^="column-"]').first()).toBeVisible();
  await expect(page.getByText("E2E persist test").first()).toBeVisible();

  // Cleanup: delete the card
  await firstColumn.locator('button[aria-label="Delete E2E persist test"]').click({ force: true });
  await page.waitForTimeout(500);
});

test("renames a column and persists after refresh", async ({ page }) => {
  await login(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  const input = firstColumn.getByLabel("Column title");
  await input.clear();
  await input.fill("Renamed Column");
  // Wait for debounced API call
  await page.waitForTimeout(700);

  await page.reload();
  await expect(page.locator('[data-testid^="column-"]').first()).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]').first().getByLabel("Column title")).toHaveValue("Renamed Column");

  // Cleanup: restore original name
  const restoredInput = page.locator('[data-testid^="column-"]').first().getByLabel("Column title");
  await restoredInput.clear();
  await restoredInput.fill("Backlog");
  await page.waitForTimeout(700);
});

test("deletes a card and persists after refresh", async ({ page }) => {
  await login(page);
  // First add a card to delete
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("E2E delete target");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("E2E delete target").first()).toBeVisible();

  // Delete it
  await firstColumn.locator('button[aria-label="Delete E2E delete target"]').click({ force: true });
  await expect(firstColumn.getByText("E2E delete target")).not.toBeVisible();

  // Refresh and verify it's gone
  await page.reload();
  await expect(page.locator('[data-testid^="column-"]').first()).toBeVisible();
  await expect(page.getByText("E2E delete target")).not.toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  await login(page);
  const card = page.getByText("Align roadmap themes").locator("../..");
  const targetColumn = page.locator('[data-testid^="column-"]').nth(3); // Review
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(targetColumn.getByText("Align roadmap themes")).toBeVisible();
});
