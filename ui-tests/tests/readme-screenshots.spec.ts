import { promises as fs } from 'fs';
import path from 'path';

import { expect, test } from '@jupyterlab/galata';
import type { IJupyterLabPageFixture } from '@jupyterlab/galata';
import type { Locator } from '@playwright/test';

const CREATE_FILE_COMMAND = 'plugin-playground:create-new-plugin';
const PLAYGROUND_SIDEBAR_ID = 'jp-plugin-playground-sidebar';
const TOKEN_SECTION_ID = 'jp-plugin-token-sidebar';
const EXAMPLE_SECTION_ID = 'jp-plugin-example-sidebar';
const LOAD_ON_SAVE_CHECKBOX_LABEL = 'Auto Load on Save';
const READABLE_DEMO_FILE = 'readme-screenshots.ts';
const RIGHT_SIDEBAR_SCREENSHOT_WIDTH = 300;
const EXTENSION_EXAMPLES_BOTTOM_PADDING = 24;
const EXTENSION_EXAMPLES_MIN_HEIGHT = 180;
const EDITOR_TOOLBAR_SCREENSHOT_HEIGHT = 420;
const SETTINGS_BOTTOM_PADDING = 120;
const SETTINGS_MIN_HEIGHT = 320;
const SCREENSHOT_OUTPUT_DIR = path.resolve(
  __dirname,
  '../../docs/images/readme'
);

test.use({ autoGoto: false, viewport: { width: 1600, height: 1000 } });
test.describe.configure({ mode: 'serial' });

async function openSidebarPanel(
  page: IJupyterLabPageFixture,
  sectionId?: string
): Promise<Locator> {
  const sidebarTab = page.sidebar.getTabLocator(PLAYGROUND_SIDEBAR_ID);
  await expect(sidebarTab).toBeVisible();
  await page.sidebar.openTab(PLAYGROUND_SIDEBAR_ID);

  const sidebarSide = await page.sidebar.getTabPosition(PLAYGROUND_SIDEBAR_ID);
  const panel = page.sidebar.getContentPanelLocator(sidebarSide ?? 'right');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('id', PLAYGROUND_SIDEBAR_ID);

  if (!sectionId) {
    return panel;
  }

  const section = panel.locator(`#${sectionId}`);
  await expect(section).toBeVisible();
  return section;
}

async function saveScreenshot(
  locator: Locator,
  filename: string
): Promise<void> {
  await locator.screenshot({
    path: path.join(SCREENSHOT_OUTPUT_DIR, filename)
  });
}

async function saveSectionCroppedToAnchor(
  page: IJupyterLabPageFixture,
  section: Locator,
  anchor: Locator,
  filename: string,
  options?: {
    bottomPadding?: number;
    minHeight?: number;
  }
): Promise<void> {
  const bottomPadding =
    options?.bottomPadding ?? EXTENSION_EXAMPLES_BOTTOM_PADDING;
  const minHeight = options?.minHeight ?? EXTENSION_EXAMPLES_MIN_HEIGHT;
  const sectionBox = await section.boundingBox();
  const anchorBox = await anchor.boundingBox();

  if (!sectionBox || !anchorBox) {
    await saveScreenshot(section, filename);
    return;
  }

  const sectionBottom = sectionBox.y + sectionBox.height;
  const targetBottom = Math.min(
    sectionBottom,
    anchorBox.y + anchorBox.height + bottomPadding
  );
  const clip = {
    x: Math.max(0, Math.floor(sectionBox.x)),
    y: Math.max(0, Math.floor(sectionBox.y)),
    width: Math.max(1, Math.floor(sectionBox.width)),
    height: Math.max(minHeight, Math.floor(targetBottom - sectionBox.y))
  };

  await page.screenshot({
    path: path.join(SCREENSHOT_OUTPUT_DIR, filename),
    clip
  });
}

async function saveTopCroppedScreenshot(
  page: IJupyterLabPageFixture,
  section: Locator,
  filename: string,
  maxHeight: number
): Promise<void> {
  const sectionBox = await section.boundingBox();
  if (!sectionBox) {
    await saveScreenshot(section, filename);
    return;
  }

  const clip = {
    x: Math.max(0, Math.floor(sectionBox.x)),
    y: Math.max(0, Math.floor(sectionBox.y)),
    width: Math.max(1, Math.floor(sectionBox.width)),
    height: Math.max(1, Math.min(Math.floor(sectionBox.height), maxHeight))
  };

  await page.screenshot({
    path: path.join(SCREENSHOT_OUTPUT_DIR, filename),
    clip
  });
}

async function seedExtensionExamples(
  page: IJupyterLabPageFixture
): Promise<void> {
  await page.evaluate(async () => {
    const ensureDirectory = async (directoryPath: string): Promise<void> => {
      try {
        await window.jupyterapp.serviceManager.contents.get(directoryPath, {
          content: false
        });
      } catch {
        await window.jupyterapp.serviceManager.contents.save(directoryPath, {
          type: 'directory',
          format: 'json',
          content: null
        });
      }
    };

    await ensureDirectory('extension-examples');
    await ensureDirectory('extension-examples/launcher');
    await ensureDirectory('extension-examples/launcher/src');

    await window.jupyterapp.serviceManager.contents.save(
      'extension-examples/launcher/src/index.ts',
      {
        type: 'file',
        format: 'text',
        content:
          "const plugin = { id: 'launcher:example', autoStart: true, activate: () => undefined };\nexport default plugin;\n"
      }
    );
    await window.jupyterapp.serviceManager.contents.save(
      'extension-examples/launcher/package.json',
      {
        type: 'file',
        format: 'text',
        content: JSON.stringify(
          {
            name: '@jupyterlab-examples/launcher',
            description: 'Launcher extension example for docs screenshots'
          },
          null,
          2
        )
      }
    );
    await window.jupyterapp.serviceManager.contents.save(
      'extension-examples/launcher/README.md',
      {
        type: 'file',
        format: 'text',
        content: '# Launcher Example\n'
      }
    );
  });
}

test('generate README screenshots', async ({ page }) => {
  await fs.mkdir(SCREENSHOT_OUTPUT_DIR, { recursive: true });

  await page.goto();
  await page.waitForCondition(() =>
    page.evaluate(
      (id: string) => window.jupyterapp.commands.hasCommand(id),
      CREATE_FILE_COMMAND
    )
  );
  await seedExtensionExamples(page);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForCondition(() =>
    page.evaluate(
      (id: string) => window.jupyterapp.commands.hasCommand(id),
      CREATE_FILE_COMMAND
    )
  );

  await page.evaluate(async (filePath: string) => {
    try {
      await window.jupyterapp.serviceManager.contents.delete(filePath);
    } catch {
      // Ignore when file does not exist; this keeps screenshot generation idempotent.
    }
  }, READABLE_DEMO_FILE);

  await page.evaluate(
    async ({
      commandId,
      filePath
    }: {
      commandId: string;
      filePath: string;
    }) => {
      await window.jupyterapp.commands.execute(commandId, { path: filePath });
    },
    {
      commandId: CREATE_FILE_COMMAND,
      filePath: READABLE_DEMO_FILE
    }
  );

  await expect(page.getByText(/hello-world:plugin/).first()).toBeVisible({
    timeout: 10_000
  });

  const editorPanel = page.getByRole('tabpanel', { name: READABLE_DEMO_FILE });
  await expect(editorPanel).toBeVisible();
  const toolbar = editorPanel.getByRole('toolbar', {
    name: 'main area toolbar'
  });
  await expect(toolbar).toBeVisible();
  const loadOnSaveCheckbox = page.getByRole('checkbox', {
    name: LOAD_ON_SAVE_CHECKBOX_LABEL
  });
  await expect(loadOnSaveCheckbox).toBeVisible();
  if (!(await loadOnSaveCheckbox.isChecked())) {
    await loadOnSaveCheckbox.check();
  }

  const extensionPointsSection = await openSidebarPanel(page, TOKEN_SECTION_ID);
  await page.sidebar.setWidth(RIGHT_SIDEBAR_SCREENSHOT_WIDTH, 'right');

  await saveTopCroppedScreenshot(
    page,
    editorPanel,
    'editor-toolbar-actions.png',
    EDITOR_TOOLBAR_SCREENSHOT_HEIGHT
  );

  await extensionPointsSection.getByRole('tab', { name: 'Tokens' }).click();
  const tokenFilter = extensionPointsSection.getByPlaceholder(
    'Filter token strings'
  );
  await tokenFilter.fill('@jupyterlab/');
  await expect(
    extensionPointsSection.locator('.jp-PluginPlayground-listItem').first()
  ).toBeVisible();
  await saveScreenshot(extensionPointsSection, 'extension-points-tokens.png');

  await extensionPointsSection.getByRole('tab', { name: 'Commands' }).click();
  const commandFilter = extensionPointsSection.locator(
    'input[aria-label="Filter command ids"]'
  );
  await commandFilter.fill('plugin-playground:');
  await expect(
    extensionPointsSection.locator('.jp-PluginPlayground-listItem').first()
  ).toBeVisible();
  await saveScreenshot(extensionPointsSection, 'extension-points-commands.png');

  const firstCommandItem = extensionPointsSection
    .locator('.jp-PluginPlayground-listItem')
    .first();
  await expect(firstCommandItem).toBeVisible();

  const commandInsertModeButton = firstCommandItem.locator(
    '.jp-PluginPlayground-commandInsertDropdownButton'
  );
  await commandInsertModeButton.click();
  const aiInsertMenuItem = page
    .locator('.lm-Menu-itemLabel:text-is("Prompt AI to insert")')
    .first();
  await expect(aiInsertMenuItem).toBeVisible();
  await saveScreenshot(
    extensionPointsSection,
    'command-insert-mode-dropdown.png'
  );
  await aiInsertMenuItem.click();

  const argumentDocsButton = extensionPointsSection
    .locator('.jp-PluginPlayground-argumentBadgeButton:not([disabled])')
    .first();
  await expect(argumentDocsButton).toBeVisible({
    timeout: 20_000
  });
  const commandItemWithArgumentDocs = argumentDocsButton.locator(
    'xpath=ancestor::li[contains(@class,"jp-PluginPlayground-listItem")]'
  );
  await argumentDocsButton.click();
  await expect(
    commandItemWithArgumentDocs.locator(
      '.jp-PluginPlayground-commandArgumentsText'
    )
  ).toBeVisible({
    timeout: 20_000
  });
  await saveScreenshot(extensionPointsSection, 'command-argument-docs.png');

  await extensionPointsSection.getByRole('tab', { name: 'Packages' }).click();
  const packageFilter = extensionPointsSection.locator(
    'input[aria-label="Filter packages"]'
  );
  await packageFilter.fill('@jupyterlab/');
  await expect(
    extensionPointsSection.locator('.jp-PluginPlayground-listItem').first()
  ).toBeVisible({
    timeout: 20_000
  });
  await saveScreenshot(extensionPointsSection, 'packages-reference.png');

  const examplesSection = await openSidebarPanel(page, EXAMPLE_SECTION_ID);
  const examplesFilter = examplesSection.locator(
    'input[aria-label="Filter extension examples"]'
  );
  await examplesFilter.fill('launcher');
  const firstExampleItem = examplesSection
    .locator('.jp-PluginPlayground-listItem')
    .first();
  await expect(firstExampleItem).toBeVisible({
    timeout: 20_000
  });
  await saveSectionCroppedToAnchor(
    page,
    examplesSection,
    firstExampleItem,
    'extension-examples.png'
  );

  await page.evaluate(async () => {
    if (!window.jupyterapp.commands.hasCommand('settingeditor:open')) {
      throw new Error('settingeditor:open command is unavailable.');
    }
    await window.jupyterapp.commands.execute('settingeditor:open');
  });

  const settingsPanel = page.getByRole('tabpanel', { name: 'Settings' });
  await expect(settingsPanel).toBeVisible({
    timeout: 20_000
  });
  const settingsSearchInput = settingsPanel.getByRole('searchbox').first();
  await settingsSearchInput.fill('Default command insertion mode');
  await expect(
    settingsPanel.getByText('Default command insertion mode').first()
  ).toBeVisible({
    timeout: 20_000
  });
  const defaultInsertModeSetting = settingsPanel
    .getByText('Default command insertion mode')
    .first();
  await saveSectionCroppedToAnchor(
    page,
    settingsPanel,
    defaultInsertModeSetting,
    'settings-command-insert-default-mode.png',
    {
      bottomPadding: SETTINGS_BOTTOM_PADDING,
      minHeight: SETTINGS_MIN_HEIGHT
    }
  );

  await page.evaluate(async (filePath: string) => {
    try {
      await window.jupyterapp.serviceManager.contents.delete(filePath);
    } catch (error) {
      console.warn(
        `Could not delete screenshot demo file "${filePath}"`,
        error
      );
    }
  }, READABLE_DEMO_FILE);
});
