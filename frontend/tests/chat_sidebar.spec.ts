import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel(/username/i).fill("user");
  await page.getByLabel(/password/i).fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.locator('[data-testid^="column-"]').first()).toBeVisible();
}

test("open and close chat sidebar", async ({ page }) => {
  await login(page);

  // Sidebar should be hidden initially
  const sidebar = page.getByTestId("chat-sidebar");
  await expect(sidebar).not.toBeInViewport();

  // Open sidebar
  await page.getByRole("button", { name: /open ai chat/i }).click();
  await expect(sidebar).toBeInViewport();
  await expect(page.getByText("AI Assistant")).toBeVisible();
  await expect(page.getByText("Ask me to manage your board")).toBeVisible();

  // Close sidebar
  await page.getByRole("button", { name: /close ai chat/i }).click();
  await page.waitForTimeout(400); // transition
  await expect(sidebar).not.toBeInViewport();
});

test("send message and receive AI response", async ({ page }) => {
  await login(page);

  // Open sidebar
  await page.getByRole("button", { name: /open ai chat/i }).click();
  await expect(page.getByTestId("chat-sidebar")).toBeInViewport();

  // Type and send a message
  const input = page.getByTestId("chat-input");
  await input.fill("What cards are on my board?");
  await page.getByRole("button", { name: /send message/i }).click();

  // User message should appear
  await expect(page.getByText("What cards are on my board?")).toBeVisible();

  // Loading indicator should appear briefly
  // (it may disappear quickly, so just check for AI response)

  // Wait for AI response (may take a few seconds with real API)
  const aiMessage = page.getByTestId("chat-messages").locator("div").filter({
    hasNotText: "What cards are on my board?",
  }).locator("div.rounded-xl.border");
  await expect(aiMessage.first()).toBeVisible({ timeout: 30000 });
  console.log("OK: AI responded to message");
});

test("AI creates a card via chat and board updates", async ({ page }) => {
  await login(page);

  // Open sidebar
  await page.getByRole("button", { name: /open ai chat/i }).click();

  // Ask AI to create a card
  const input = page.getByTestId("chat-input");
  await input.fill("Create a card called 'E2E Chat Test Card' in the Backlog column");
  await page.getByRole("button", { name: /send message/i }).click();

  // Wait for AI response
  await page.waitForTimeout(15000);

  // The card should appear on the board (not in the chat sidebar)
  const board = page.locator("main");
  await expect(board.getByText("E2E Chat Test Card")).toBeVisible({ timeout: 15000 });
  console.log("OK: Card created by AI is visible on board");
});

test("AI moves a card via chat and board updates", async ({ page }) => {
  await login(page);

  // Verify a known card exists in Backlog first
  const backlogCol = page.locator('[data-testid^="column-"]').first();
  await expect(backlogCol.getByText("Align roadmap themes")).toBeVisible();

  // Open sidebar and ask AI to move it
  await page.getByRole("button", { name: /open ai chat/i }).click();
  const input = page.getByTestId("chat-input");
  await input.fill("Move the card 'Align roadmap themes' to the Done column");
  await page.getByRole("button", { name: /send message/i }).click();

  // Wait for AI response and board refresh
  const doneCol = page.locator('[data-testid^="column-"]').nth(4);
  await expect(doneCol.getByText("Align roadmap themes")).toBeVisible({ timeout: 30000 });
  console.log("OK: Card moved by AI is in Done column");
});

test("chat history persists within session and send via Enter key", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: /open ai chat/i }).click();

  // Send first message with Enter key
  const input = page.getByTestId("chat-input");
  await input.fill("Hello");
  await input.press("Enter");

  // Wait for response
  const messagesArea = page.getByTestId("chat-messages");
  await expect(messagesArea.locator(".rounded-xl.border").first()).toBeVisible({ timeout: 30000 });

  // Send second message
  await input.fill("What did I just say?");
  await input.press("Enter");

  // Wait for second response
  await page.waitForTimeout(15000);

  // Both user messages should be in the chat (check within user message bubbles)
  const chatMessages = page.getByTestId("chat-messages");
  await expect(chatMessages.getByText("Hello", { exact: true })).toBeVisible();
  await expect(chatMessages.getByText("What did I just say?")).toBeVisible();
  console.log("OK: Chat history maintained within session");
});
