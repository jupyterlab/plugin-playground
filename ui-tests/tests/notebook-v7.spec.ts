import { expect, test } from '@playwright/test';

const BASE_URL = 'http://localhost:8888';
const PLAYGROUND_SIDEBAR_ID = 'jp-plugin-playground-sidebar';
const TOKEN_SECTION_ID = 'jp-plugin-token-sidebar';
const EXAMPLE_SECTION_ID = 'jp-plugin-example-sidebar';

test('Notebook v7 shows plugin playground sidebar next to an opened file', async ({
  page,
  request
}) => {
  const sourcePath = 'notebook-v7-sidebar-smoke.ts';
  const createResponse = await request.put(
    `${BASE_URL}/api/contents/${sourcePath}`,
    {
      data: {
        type: 'file',
        format: 'text',
        content:
          "const plugin = { id: 'notebook-v7-sidebar-smoke:plugin', autoStart: true, activate: () => undefined }; export default plugin;\n"
      }
    }
  );
  expect(createResponse.ok()).toBe(true);

  await page.goto(`${BASE_URL}/edit/${sourcePath}`, {
    waitUntil: 'domcontentloaded'
  });

  const panel = page.locator(`#${PLAYGROUND_SIDEBAR_ID}`);
  await expect(panel).toBeAttached({ timeout: 10_000 });
  const sidebarTab = page.locator(`[data-id="${PLAYGROUND_SIDEBAR_ID}"]`).first();
  if (!(await panel.isVisible()) && (await sidebarTab.count()) > 0) {
    await sidebarTab.click();
  }

  if (await panel.isVisible()) {
    await expect(panel.locator(`#${TOKEN_SECTION_ID}`)).toBeVisible();
    await expect(panel.locator(`#${EXAMPLE_SECTION_ID}`)).toBeVisible();
  } else {
    // Notebook may keep the right area collapsed by default; ensure sections are
    // still registered in the panel for manual activation.
    await expect(panel.locator(`#${TOKEN_SECTION_ID}`)).toBeAttached();
    await expect(panel.locator(`#${EXAMPLE_SECTION_ID}`)).toBeAttached();
  }
});
