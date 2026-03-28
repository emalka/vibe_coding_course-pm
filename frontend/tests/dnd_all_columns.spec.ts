import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel(/username/i).fill("user");
  await page.getByLabel(/password/i).fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.locator('[data-testid^="column-"]').first()).toBeVisible();
}

async function dragCardToColumn(page: Page, cardLocator: ReturnType<Page["locator"]>, targetColLocator: ReturnType<Page["locator"]>) {
  const cardBox = await cardLocator.boundingBox();
  const targetBox = await targetColLocator.boundingBox();
  if (!cardBox || !targetBox) throw new Error("No bounding box");

  const startX = cardBox.x + cardBox.width / 2;
  const startY = cardBox.y + cardBox.height / 2;
  // Drop into the middle area of the target column
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + 140;

  await page.mouse.move(startX, startY);
  await page.mouse.down();

  // Move in steps for dnd-kit to detect
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
}

// Column order: Backlog(0), Discovery(1), In Progress(2), Review(3), Done(4)
// Seed data: Backlog has 2 cards, we drag the first one across all columns.
test("drag card through all columns left to right", async ({ page }) => {
  await login(page);

  const columns = page.locator('[data-testid^="column-"]');

  // Get the first card in Backlog (column 0)
  const backlogCards = columns.nth(0).locator('[data-testid^="card-"]');
  const cardTitle = await backlogCards.first().locator("h4").textContent();
  console.log(`Card to move: "${cardTitle}"`);

  // Move Backlog -> Discovery (0 -> 1)
  console.log("Moving: Backlog -> Discovery");
  let card = columns.nth(0).locator('[data-testid^="card-"]').filter({ hasText: cardTitle! });
  await dragCardToColumn(page, card, columns.nth(1));
  await expect(columns.nth(1).getByText(cardTitle!)).toBeVisible();
  console.log("  OK: card is in Discovery");

  // Move Discovery -> In Progress (1 -> 2)
  console.log("Moving: Discovery -> In Progress");
  card = columns.nth(1).locator('[data-testid^="card-"]').filter({ hasText: cardTitle! });
  await dragCardToColumn(page, card, columns.nth(2));
  await expect(columns.nth(2).getByText(cardTitle!)).toBeVisible();
  console.log("  OK: card is in In Progress");

  // Move In Progress -> Review (2 -> 3)
  console.log("Moving: In Progress -> Review");
  card = columns.nth(2).locator('[data-testid^="card-"]').filter({ hasText: cardTitle! });
  await dragCardToColumn(page, card, columns.nth(3));
  await expect(columns.nth(3).getByText(cardTitle!)).toBeVisible();
  console.log("  OK: card is in Review");

  // Move Review -> Done (3 -> 4)
  console.log("Moving: Review -> Done");
  card = columns.nth(3).locator('[data-testid^="card-"]').filter({ hasText: cardTitle! });
  await dragCardToColumn(page, card, columns.nth(4));
  await expect(columns.nth(4).getByText(cardTitle!)).toBeVisible();
  console.log("  OK: card is in Done");

  // Verify persistence: refresh and check card is in Done
  await page.reload();
  await expect(columns.first()).toBeVisible();
  await expect(columns.nth(4).getByText(cardTitle!)).toBeVisible();
  console.log("  OK: persisted after refresh");
});

test("drag card right to left across all columns", async ({ page }) => {
  await login(page);

  const columns = page.locator('[data-testid^="column-"]');

  // Get the first card in Done (column 4)
  const doneCards = columns.nth(4).locator('[data-testid^="card-"]');
  const cardTitle = await doneCards.first().locator("h4").textContent();
  console.log(`Card to move: "${cardTitle}"`);

  // Move Done -> Review (4 -> 3)
  console.log("Moving: Done -> Review");
  let card = columns.nth(4).locator('[data-testid^="card-"]').filter({ hasText: cardTitle! });
  await dragCardToColumn(page, card, columns.nth(3));
  await expect(columns.nth(3).getByText(cardTitle!)).toBeVisible();
  console.log("  OK: card is in Review");

  // Move Review -> In Progress (3 -> 2)
  console.log("Moving: Review -> In Progress");
  card = columns.nth(3).locator('[data-testid^="card-"]').filter({ hasText: cardTitle! });
  await dragCardToColumn(page, card, columns.nth(2));
  await expect(columns.nth(2).getByText(cardTitle!)).toBeVisible();
  console.log("  OK: card is in In Progress");

  // Move In Progress -> Discovery (2 -> 1)
  console.log("Moving: In Progress -> Discovery");
  card = columns.nth(2).locator('[data-testid^="card-"]').filter({ hasText: cardTitle! });
  await dragCardToColumn(page, card, columns.nth(1));
  await expect(columns.nth(1).getByText(cardTitle!)).toBeVisible();
  console.log("  OK: card is in Discovery");

  // Move Discovery -> Backlog (1 -> 0)
  console.log("Moving: Discovery -> Backlog");
  card = columns.nth(1).locator('[data-testid^="card-"]').filter({ hasText: cardTitle! });
  await dragCardToColumn(page, card, columns.nth(0));
  await expect(columns.nth(0).getByText(cardTitle!)).toBeVisible();
  console.log("  OK: card is in Backlog");

  // Verify persistence
  await page.reload();
  await expect(columns.first()).toBeVisible();
  await expect(columns.nth(0).getByText(cardTitle!)).toBeVisible();
  console.log("  OK: persisted after refresh");
});
