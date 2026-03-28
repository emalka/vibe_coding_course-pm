import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel(/username/i).fill("user");
  await page.getByLabel(/password/i).fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.locator('[data-testid^="column-"]').first()).toBeVisible();
}

test("drag card into an empty column", async ({ page }) => {
  await login(page);

  const columns = page.locator('[data-testid^="column-"]');

  // Discovery (column 1) has 1 card -- delete it to make the column empty
  const discoveryCol = columns.nth(1);
  const discoveryCard = discoveryCol.locator('[data-testid^="card-"]').first();
  const discoveryCardTitle = await discoveryCard.locator("h4").textContent();
  console.log(`Deleting "${discoveryCardTitle}" from Discovery to empty it`);

  // Hover to reveal the Remove button, then click it
  await discoveryCard.hover();
  await discoveryCard.getByRole("button", { name: /delete/i }).click();
  await page.waitForTimeout(500);

  // Verify Discovery is now empty
  const discoveryCardCount = await discoveryCol.locator('[data-testid^="card-"]').count();
  console.log(`Discovery card count after delete: ${discoveryCardCount}`);
  expect(discoveryCardCount).toBe(0);

  // Now drag a card from Backlog (column 0) into the empty Discovery column
  const backlogCol = columns.nth(0);
  const cardToDrag = backlogCol.locator('[data-testid^="card-"]').first();
  const cardTitle = await cardToDrag.locator("h4").textContent();
  console.log(`Dragging "${cardTitle}" from Backlog into empty Discovery`);

  const cardBox = await cardToDrag.boundingBox();
  const targetBox = await discoveryCol.boundingBox();
  if (!cardBox || !targetBox) throw new Error("No bounding box");

  const startX = cardBox.x + cardBox.width / 2;
  const startY = cardBox.y + cardBox.height / 2;
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();

  for (let i = 1; i <= 20; i++) {
    const progress = i / 20;
    const x = startX + (endX - startX) * progress;
    const y = startY + (endY - startY) * progress;
    await page.mouse.move(x, y);
    await page.waitForTimeout(30);
  }

  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(500);

  // Card should now be in Discovery
  await expect(discoveryCol.getByText(cardTitle!)).toBeVisible({ timeout: 3000 });
  console.log(`OK: "${cardTitle}" is in Discovery`);

  // Verify persistence
  await page.reload();
  await expect(columns.first()).toBeVisible();
  await expect(columns.nth(1).getByText(cardTitle!)).toBeVisible();
  console.log("OK: persisted after refresh");
});
