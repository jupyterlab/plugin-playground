import { promises as fs } from 'fs';
import path from 'path';

import { expect, test } from '@jupyterlab/galata';
import type { IJupyterLabPageFixture } from '@jupyterlab/galata';
import type { Locator } from '@playwright/test';

const CREATE_FILE_COMMAND = 'plugin-playground:create-new-plugin';
const LAUNCHER_CREATE_COMMAND = 'launcher:create';
const PLAYGROUND_SIDEBAR_ID = 'jp-plugin-playground-sidebar';
const TOKEN_SECTION_ID = 'jp-plugin-token-sidebar';
const EXAMPLE_SECTION_ID = 'jp-plugin-example-sidebar';
const LOAD_ON_SAVE_CHECKBOX_LABEL = 'Auto Load on Save';
const READABLE_DEMO_FILE = 'readme-screenshots.ts';
const DEMO_PACKAGE_JSON_FILE = 'package.json';
const RIGHT_SIDEBAR_SCREENSHOT_WIDTH = 300;
const EXTENSION_POINTS_GALLERY_WIDTH = 290;
const EXTENSION_EXAMPLES_BOTTOM_PADDING = 24;
const EXTENSION_EXAMPLES_MIN_HEIGHT = 180;
const SETTINGS_BOTTOM_PADDING = 120;
const SETTINGS_MIN_HEIGHT = 320;
const SETTINGS_TIGHT_BOTTOM_PADDING = 80;
const SETTINGS_TIGHT_MIN_HEIGHT = 240;
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

function clampClipToViewport(
  clip: {
    x: number;
    y: number;
    width: number;
    height: number;
  },
  viewport: {
    width: number;
    height: number;
  } | null
): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (!viewport) {
    return clip;
  }

  const clampedX = Math.min(Math.max(0, clip.x), viewport.width - 1);
  const clampedY = Math.min(Math.max(0, clip.y), viewport.height - 1);
  const maxWidth = Math.max(1, viewport.width - clampedX);
  const maxHeight = Math.max(1, viewport.height - clampedY);

  return {
    x: clampedX,
    y: clampedY,
    width: Math.min(maxWidth, clip.width),
    height: Math.min(maxHeight, clip.height)
  };
}

async function saveToolbarDropdownScreenshot(
  page: IJupyterLabPageFixture,
  button: Locator,
  menu: Locator,
  filename: string
): Promise<void> {
  const buttonBox = await button.boundingBox();
  const menuBox = await menu.boundingBox();
  if (!buttonBox || !menuBox) {
    await saveScreenshot(menu, filename);
    return;
  }

  const viewport = page.viewportSize();
  const clip = clampClipToViewport(
    {
      x: Math.max(0, Math.floor(menuBox.x - 4)),
      y: Math.max(0, Math.floor(buttonBox.y - 2)),
      width: Math.max(1, Math.ceil(menuBox.width + 12)),
      height: Math.max(
        1,
        Math.ceil(menuBox.y + menuBox.height - buttonBox.y + 2)
      )
    },
    viewport
  );

  await page.screenshot({
    path: path.join(SCREENSHOT_OUTPUT_DIR, filename),
    clip
  });
}

async function saveLocatorsCroppedScreenshot(
  page: IJupyterLabPageFixture,
  locators: Locator[],
  filename: string,
  options?: {
    leftPadding?: number;
    rightPadding?: number;
    topPadding?: number;
    bottomPadding?: number;
  }
): Promise<void> {
  const leftPadding = options?.leftPadding ?? 0;
  const rightPadding = options?.rightPadding ?? 24;
  const topPadding = options?.topPadding ?? 0;
  const bottomPadding = options?.bottomPadding ?? 12;
  const boxes = (
    await Promise.all(locators.map(locator => locator.boundingBox()))
  ).filter((box): box is NonNullable<typeof box> => box !== null);
  if (!boxes.length) {
    await saveScreenshot(locators[0], filename);
    return;
  }

  const minX = Math.min(...boxes.map(box => box.x));
  const minY = Math.min(...boxes.map(box => box.y));
  const maxX = Math.max(...boxes.map(box => box.x + box.width));
  const maxY = Math.max(...boxes.map(box => box.y + box.height));
  const viewport = page.viewportSize();
  const clip = clampClipToViewport(
    {
      x: Math.max(0, Math.floor(minX - leftPadding)),
      y: Math.max(0, Math.floor(minY - topPadding)),
      width: Math.max(1, Math.ceil(maxX - minX + leftPadding + rightPadding)),
      height: Math.max(1, Math.ceil(maxY - minY + topPadding + bottomPadding))
    },
    viewport
  );

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

  await page.evaluate(async () => {
    if (window.jupyterapp.commands.hasCommand('application:reset-layout')) {
      await window.jupyterapp.commands.execute('application:reset-layout');
    }
  });

  await page.evaluate(async (commandId: string) => {
    if (window.jupyterapp.commands.hasCommand(commandId)) {
      await window.jupyterapp.commands.execute(commandId);
    }
  }, LAUNCHER_CREATE_COMMAND);
  const launcherPanel = page
    .getByRole('tabpanel', { name: 'Launcher' })
    .first();
  await expect(launcherPanel).toBeVisible({
    timeout: 20_000
  });
  const launcherPluginPlaygroundSection = launcherPanel
    .locator('.jp-Launcher-section')
    .filter({ hasText: 'Plugin Playground' })
    .first();
  if ((await launcherPluginPlaygroundSection.count()) > 0) {
    await expect(launcherPluginPlaygroundSection).toBeVisible();
    await launcherPluginPlaygroundSection.evaluate(section => {
      const launcherSection = section as HTMLElement;
      launcherSection.scrollTop = launcherSection.scrollHeight;
      let current: HTMLElement | null = launcherSection;
      while (current) {
        if (current.scrollHeight > current.clientHeight) {
          current.scrollTop = current.scrollHeight;
        }
        current = current.parentElement;
      }
    });
    const launcherCards =
      launcherPluginPlaygroundSection.locator('.jp-LauncherCard');
    const launcherFirstCard = launcherCards.first();
    const launcherLastCard = launcherCards.last();
    const launcherHeader = launcherPluginPlaygroundSection
      .getByText('Plugin Playground')
      .first();
    const launcherLastCardLabel = launcherLastCard.getByText(/Take the Tour/i);
    await expect(launcherHeader).toBeVisible();
    await expect(launcherFirstCard).toBeVisible();
    await expect(launcherLastCard).toBeVisible();
    await expect(launcherLastCardLabel).toBeVisible();
    await saveLocatorsCroppedScreenshot(
      page,
      [launcherHeader, launcherFirstCard, launcherLastCardLabel],
      'launcher-plugin-playground-tile.png',
      {
        leftPadding: 2,
        rightPadding: 16,
        topPadding: 4,
        bottomPadding: 24
      }
    );
  } else {
    await saveScreenshot(launcherPanel, 'launcher-plugin-playground-tile.png');
  }

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
  const loadOnSaveToggle = page.getByRole('button', {
    name: LOAD_ON_SAVE_CHECKBOX_LABEL
  });
  await expect(loadOnSaveToggle).toBeVisible();
  if ((await loadOnSaveToggle.getAttribute('aria-pressed')) !== 'true') {
    await loadOnSaveToggle.click();
  }
  await page.evaluate(async (packagePath: string) => {
    await window.jupyterapp.serviceManager.contents.save(packagePath, {
      type: 'file',
      format: 'text',
      content: JSON.stringify(
        {
          name: 'readme-screenshots-demo',
          version: '0.1.0'
        },
        null,
        2
      )
    });
  }, DEMO_PACKAGE_JSON_FILE);

  const extensionPointsSection = await openSidebarPanel(page, TOKEN_SECTION_ID);
  const sidebarSide =
    (await page.sidebar.getTabPosition(PLAYGROUND_SIDEBAR_ID)) ?? 'right';
  await page.sidebar.setWidth(EXTENSION_POINTS_GALLERY_WIDTH, sidebarSide);

  await saveScreenshot(toolbar, 'editor-toolbar-actions.png');

  const exportFormatButton = page.getByRole('button', {
    name: 'Choose export format'
  });
  await expect(exportFormatButton).toBeVisible();
  await exportFormatButton.click();
  await expect(
    page
      .locator('.lm-Menu-itemLabel')
      .filter({
        hasText: /(zip|archive|Python package|\.whl)/i
      })
      .first()
  ).toBeVisible();
  const shareTargetButton = page.getByRole('button', {
    name: 'Choose share target'
  });
  await expect(shareTargetButton).toBeVisible();
  const exportMenu = page.locator('.lm-Menu:visible').last();
  await expect(exportMenu).toBeVisible();
  await saveToolbarDropdownScreenshot(
    page,
    exportFormatButton,
    exportMenu,
    'editor-toolbar-export-dropdown.png'
  );
  await page.keyboard.press('Escape');

  await shareTargetButton.click();
  await expect(
    page
      .locator('.lm-Menu-itemLabel')
      .filter({
        hasText: /Share/i
      })
      .first()
  ).toBeVisible();
  const shareMenu = page.locator('.lm-Menu:visible').last();
  await expect(shareMenu).toBeVisible();
  await saveToolbarDropdownScreenshot(
    page,
    shareTargetButton,
    shareMenu,
    'editor-toolbar-share-dropdown.png'
  );
  await page.keyboard.press('Escape');

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

  await page.sidebar.setWidth(RIGHT_SIDEBAR_SCREENSHOT_WIDTH, sidebarSide);
  await extensionPointsSection.getByRole('tab', { name: 'Commands' }).click();
  await commandFilter.fill('plugin-playground:');
  await expect(
    extensionPointsSection.locator('.jp-PluginPlayground-listItem').first()
  ).toBeVisible();

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
  const saveSettingScreenshot = async (
    searchQuery: string,
    settingLabel: string,
    filename: string,
    options?: {
      bottomPadding?: number;
      minHeight?: number;
    }
  ): Promise<void> => {
    await settingsSearchInput.fill(searchQuery);
    const settingAnchor = settingsPanel.getByText(settingLabel).first();
    await expect(settingAnchor).toBeVisible({
      timeout: 20_000
    });
    await saveSectionCroppedToAnchor(
      page,
      settingsPanel,
      settingAnchor,
      filename,
      {
        bottomPadding: options?.bottomPadding ?? SETTINGS_BOTTOM_PADDING,
        minHeight: options?.minHeight ?? SETTINGS_MIN_HEIGHT
      }
    );
  };

  await saveSettingScreenshot(
    'Default command insertion mode',
    'Default command insertion mode',
    'settings-command-insert-default-mode.png'
  );
  await saveSettingScreenshot(
    'Load as extension on save',
    'Load as extension on save',
    'settings-run-on-save.png',
    {
      bottomPadding: SETTINGS_TIGHT_BOTTOM_PADDING,
      minHeight: SETTINGS_TIGHT_MIN_HEIGHT
    }
  );
  await saveSettingScreenshot(
    'Show file selection dialog on folder share',
    'Show file selection dialog on folder share',
    'settings-share-folder-selection-dialog-mode.png',
    {
      bottomPadding: SETTINGS_TIGHT_BOTTOM_PADDING,
      minHeight: SETTINGS_TIGHT_MIN_HEIGHT
    }
  );

  await page.evaluate(
    async (filePaths: string[]) => {
      for (const filePath of filePaths) {
        try {
          await window.jupyterapp.serviceManager.contents.delete(filePath);
        } catch (error) {
          console.warn(
            `Could not delete screenshot demo file "${filePath}"`,
            error
          );
        }
      }
    },
    [READABLE_DEMO_FILE, DEMO_PACKAGE_JSON_FILE]
  );
});
