import { expect, test } from '@playwright/test';

const BASE_URL = 'http://localhost:8888';
const TREE_CREATE_COMMAND_LABEL = 'Plugin (Playground)';
const PLAYGROUND_SIDEBAR_ID = 'jp-plugin-playground-sidebar';
const TOKEN_SECTION_ID = 'jp-plugin-token-sidebar';
const EXAMPLE_SECTION_ID = 'jp-plugin-example-sidebar';
const TEMPLATE_PLUGIN_ID = /hello-world:plugin/;

test('Notebook v7 New dropdown can create a plugin file and open sidebar', async ({
  page
}) => {
  await page.goto(`${BASE_URL}/tree`, {
    waitUntil: 'domcontentloaded'
  });

  const fileMenu = page
    .locator('.lm-MenuBar-itemLabel:text-is("File")')
    .first();
  await expect(fileMenu).toBeVisible();
  await fileMenu.click();
  const fileNewEntry = page
    .locator('.lm-Menu-itemLabel:text-is("New")')
    .first();
  await expect(fileNewEntry).toBeVisible();
  await fileNewEntry.hover();
  const pluginInFileNewMenu = page
    .locator(`.lm-Menu-itemLabel:text-is("${TREE_CREATE_COMMAND_LABEL}")`)
    .first();
  await expect(pluginInFileNewMenu).toBeVisible();
  await page.keyboard.press('Escape');

  const newDropdown = page.getByRole('menuitem', { name: 'New' }).first();
  await expect(newDropdown).toBeVisible();
  await newDropdown.click();

  const pluginMenuItem = page
    .getByRole('menuitem', { name: TREE_CREATE_COMMAND_LABEL })
    .first();
  await expect(pluginMenuItem).toBeVisible();
  const popupPromise = page
    .waitForEvent('popup', { timeout: 5_000 })
    .catch(() => null);
  await pluginMenuItem.click();
  const popup = await popupPromise;
  const editorPage = popup ?? page;
  if (popup) {
    await popup.waitForLoadState('domcontentloaded');
  }

  await expect
    .poll(() => editorPage.url())
    .toMatch(/\/edit\/(?:[^?]*\.ts(?:\?.*)?|\?path=.*\.ts(?:&.*)?)$/);
  await expect(editorPage.getByText(TEMPLATE_PLUGIN_ID).first()).toBeVisible({
    timeout: 10_000
  });

  const panel = editorPage.locator(`#${PLAYGROUND_SIDEBAR_ID}`);
  await expect(panel).toBeAttached({ timeout: 10_000 });
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await expect(panel.locator(`#${TOKEN_SECTION_ID}`)).toBeVisible();
  await expect(panel.locator(`#${EXAMPLE_SECTION_ID}`)).toBeVisible();
});
