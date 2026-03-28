import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel(/username/i).fill("user");
  await page.getByLabel(/password/i).fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.locator('[data-testid^="column-"]').first()).toBeVisible();
}

test("reorder card within same column", async ({ page }) => {
  await login(page);

  // Expose a logging mechanism for DnD events
  await page.evaluate(() => {
    (window as any).__dndLogs = [];
  });

  // Get "In Progress" column (index 2) - has 2+ cards
  const col = page.locator('[data-testid^="column-"]').nth(2);
  const cards = col.locator('[data-testid^="card-"]');
  const count = await cards.count();
  console.log(`Card count in In Progress: ${count}`);

  const firstText = await cards.first().locator("h4").textContent();
  const secondText = await cards.nth(1).locator("h4").textContent();
  const firstTestId = await cards.first().getAttribute("data-testid");
  const secondTestId = await cards.nth(1).getAttribute("data-testid");
  console.log(`Before reorder: [${firstText} (${firstTestId})], [${secondText} (${secondTestId})]`);

  const firstBox = await cards.first().boundingBox();
  const secondBox = await cards.nth(1).boundingBox();
  if (!firstBox || !secondBox) throw new Error("No bounding box");

  console.log(`First card box: y=${firstBox.y}, h=${firstBox.height}`);
  console.log(`Second card box: y=${secondBox.y}, h=${secondBox.height}`);
  console.log(`Drag from: (${firstBox.x + firstBox.width / 2}, ${firstBox.y + firstBox.height / 2})`);
  console.log(`Drag to: (${secondBox.x + secondBox.width / 2}, ${secondBox.y + secondBox.height + 10})`);

  // Drag first card below second card
  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
  await page.mouse.down();

  // Move in more steps to give dnd-kit time to detect
  for (let i = 1; i <= 20; i++) {
    const progress = i / 20;
    const targetY = firstBox.y + firstBox.height / 2 + (secondBox.y + secondBox.height + 10 - firstBox.y - firstBox.height / 2) * progress;
    await page.mouse.move(secondBox.x + secondBox.width / 2, targetY);
    await page.waitForTimeout(30);
  }

  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(500);

  const newFirstText = await cards.first().locator("h4").textContent();
  const newSecondText = await cards.nth(1).locator("h4").textContent();
  console.log(`After reorder: [${newFirstText}], [${newSecondText}]`);

  // Cards should have swapped
  expect(newFirstText).toBe(secondText);
  expect(newSecondText).toBe(firstText);
});

test("move card to another column and persist", async ({ page }) => {
  await login(page);

  const firstCol = page.locator('[data-testid^="column-"]').first();
  const firstColCards = firstCol.locator('[data-testid^="card-"]');
  const cardText = await firstColCards.first().locator("h4").textContent();
  console.log(`Moving card: "${cardText}"`);

  const targetCol = page.locator('[data-testid^="column-"]').nth(3);

  const cardBox = await firstColCards.first().boundingBox();
  const targetBox = await targetCol.boundingBox();
  if (!cardBox || !targetBox) throw new Error("No bounding box");

  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 120, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  await expect(targetCol.getByText(cardText!)).toBeVisible();

  // Refresh and verify persistence
  await page.reload();
  await expect(page.locator('[data-testid^="column-"]').first()).toBeVisible();
  const refreshedTarget = page.locator('[data-testid^="column-"]').nth(3);
  await expect(refreshedTarget.getByText(cardText!)).toBeVisible();
});
