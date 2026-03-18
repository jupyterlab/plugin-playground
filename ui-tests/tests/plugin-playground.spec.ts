import { expect, test } from '@jupyterlab/galata';
import type { FileEditorWidget } from '@jupyterlab/fileeditor';
import type { IJupyterLabPageFixture } from '@jupyterlab/galata';
import type { Locator } from '@playwright/test';

const LOAD_COMMAND = 'plugin-playground:load-as-extension';
const INTERNAL_CONTEXT_INFO_COMMAND = '__internal:context-menu-info';
const CREATE_FILE_COMMAND = 'plugin-playground:create-new-plugin';
const TEST_PLUGIN_ID = 'playground-integration-test:plugin';
const TEST_TOGGLE_COMMAND = 'playground-integration-test:toggle';
const TEST_FILE = 'playground-integration-test.ts';
const COMMAND_COMPLETION_FILE = 'command-completion.ts';
const INVOKE_FILE_COMPLETER_COMMAND = 'completer:invoke-file';
const PLAYGROUND_SIDEBAR_ID = 'jp-plugin-playground-sidebar';
const TOKEN_SECTION_ID = 'jp-plugin-token-sidebar';
const EXAMPLE_SECTION_ID = 'jp-plugin-example-sidebar';

test.use({ autoGoto: false });

const TEST_PLUGIN_SOURCE = `
const plugin = {
  id: '${TEST_PLUGIN_ID}',
  autoStart: true,
  activate: app => {
    let toggled = false;
    app.commands.addCommand('${TEST_TOGGLE_COMMAND}', {
      label: 'Playground Integration Toggle',
      isToggled: () => toggled,
      execute: () => {
        toggled = !toggled;
      }
    });
  }
};

export default plugin;
`;

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

async function findImportableToken(panel: Locator): Promise<string> {
  const tokenEntries = panel.locator('.jp-PluginPlayground-entryLabel');
  const count = await tokenEntries.count();
  for (let i = 0; i < count; i++) {
    const tokenName = (await tokenEntries.nth(i).innerText()).trim();
    const separatorIndex = tokenName.indexOf(':');
    if (separatorIndex <= 0) {
      continue;
    }
    const packageName = tokenName.slice(0, separatorIndex).trim();
    const tokenSymbol = tokenName.slice(separatorIndex + 1).trim();
    if (
      packageName.length > 0 &&
      /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(tokenSymbol)
    ) {
      return tokenName;
    }
  }
  throw new Error('No importable token found in token sidebar');
}

test('registers plugin playground commands', async ({ page }) => {
  await page.goto();

  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, LOAD_COMMAND)
  );

  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, CREATE_FILE_COMMAND)
  );

  await expect(
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, LOAD_COMMAND)
  ).resolves.toBe(true);

  await expect(
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, CREATE_FILE_COMMAND)
  ).resolves.toBe(true);
});

test('opens a dummy extension example from the sidebar', async ({ page }) => {
  const integrationExampleName = 'integration-example';
  const integrationExampleRoot = `extension-examples/${integrationExampleName}`;
  const expectedPath = `${integrationExampleRoot}/src/index.ts`;
  const expectedReadmePath = `${integrationExampleRoot}/README.md`;

  await page.contents.uploadContent(
    JSON.stringify(
      {
        name: '@jupyterlab-examples/integration-example',
        description: 'Integration test extension example'
      },
      null,
      2
    ),
    'text',
    `${integrationExampleRoot}/package.json`
  );
  await page.contents.uploadContent(
    "const plugin = { id: 'integration-example:plugin', autoStart: true, activate: () => undefined }; export default plugin;\n",
    'text',
    expectedPath
  );
  await page.contents.uploadContent(
    '# Integration Example\n\nThis README explains the example.\n',
    'text',
    expectedReadmePath
  );

  await page.goto();
  const section = await openSidebarPanel(page, EXAMPLE_SECTION_ID);

  const filterInput = section.getByPlaceholder('Filter extension examples');
  await expect(filterInput).toBeVisible();
  await filterInput.fill(integrationExampleName);

  const exampleItems = section.locator('.jp-PluginPlayground-listItem');
  await expect(exampleItems).toHaveCount(1);
  const openButton = exampleItems
    .first()
    .locator('.jp-PluginPlayground-exampleOpenButton');
  await expect(openButton).toBeVisible();
  await openButton.click();

  await page.waitForFunction((pathToOpen: string) => {
    const current = window.jupyterapp.shell
      .currentWidget as FileEditorWidget | null;
    const path = current?.context?.path;
    return path === pathToOpen;
  }, expectedPath);

  const readmeButton = exampleItems
    .first()
    .locator('.jp-PluginPlayground-exampleReadmeButton');
  await expect(readmeButton).toBeVisible();
  await readmeButton.click();

  await page.waitForFunction((pathToOpen: string) => {
    const current = window.jupyterapp.shell
      .currentWidget as FileEditorWidget | null;
    const path = current?.context?.path;
    return path === pathToOpen;
  }, expectedReadmePath);
});

test('loads current editor file as a plugin extension', async ({
  page,
  tmpPath
}) => {
  const pluginPath = `${tmpPath}/${TEST_FILE}`;

  await page.contents.uploadContent(TEST_PLUGIN_SOURCE, 'text', pluginPath);
  await page.goto();

  await page.filebrowser.open(pluginPath);
  expect(await page.activity.activateTab(TEST_FILE)).toBe(true);

  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, LOAD_COMMAND)
  );
  await page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id);
  }, LOAD_COMMAND);

  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.hasPlugin(id);
    }, TEST_PLUGIN_ID)
  );

  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, TEST_TOGGLE_COMMAND)
  );

  const initiallyToggled = await page.evaluate((id: string) => {
    return window.jupyterapp.commands.isToggled(id);
  }, TEST_TOGGLE_COMMAND);
  expect(initiallyToggled).toBe(false);

  await page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id);
  }, TEST_TOGGLE_COMMAND);

  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.isToggled(id);
    }, TEST_TOGGLE_COMMAND)
  );
  await expect(
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.isToggled(id);
    }, TEST_TOGGLE_COMMAND)
  ).resolves.toBe(true);
});

test('opens token sidebar, shows tokens, and filters by exact token', async ({
  page
}) => {
  await page.goto();
  const section = await openSidebarPanel(page, TOKEN_SECTION_ID);

  const tokenListItems = section.locator('.jp-PluginPlayground-listItem');
  await expect(tokenListItems.first()).toBeVisible();
  expect(await tokenListItems.count()).toBeGreaterThan(0);

  const firstToken = (
    await section.locator('.jp-PluginPlayground-entryLabel').first().innerText()
  ).trim();
  expect(firstToken.length).toBeGreaterThan(0);

  const filterInput = section.getByPlaceholder('Filter token strings');
  await filterInput.fill(firstToken);
  await expect(tokenListItems).toHaveCount(1);
  await expect(section.locator('.jp-PluginPlayground-entryLabel')).toHaveText([
    firstToken
  ]);
});

test('token sidebar copy button shows copied state', async ({ page }) => {
  await page.goto();
  const section = await openSidebarPanel(page, TOKEN_SECTION_ID);

  const tokenListItem = section.locator('.jp-PluginPlayground-listItem');
  await expect(tokenListItem.first()).toBeVisible();

  const copyButton = tokenListItem
    .first()
    .locator('.jp-PluginPlayground-copyButton');
  await expect(copyButton).toHaveAttribute('title', 'Copy token string');
  await copyButton.click();
  await expect(copyButton).toHaveAttribute('title', 'Copied');
});

test('token sidebar inserts import statement into active editor', async ({
  page,
  tmpPath
}) => {
  const editorPath = `${tmpPath}/token-sidebar-import.ts`;

  await page.contents.uploadContent(
    "const pluginId = 'token-sidebar-test';\n",
    'text',
    editorPath
  );
  await page.goto();
  await page.filebrowser.open(editorPath);
  expect(await page.activity.activateTab('token-sidebar-import.ts')).toBe(true);

  const section = await openSidebarPanel(page, TOKEN_SECTION_ID);

  const tokenName = await findImportableToken(section);
  const filterInput = section.getByPlaceholder('Filter token strings');
  await filterInput.fill(tokenName);
  const tokenListItem = section.locator('.jp-PluginPlayground-listItem');
  await expect(tokenListItem).toHaveCount(1);

  const importButton = tokenListItem.locator(
    '.jp-PluginPlayground-importButton'
  );
  await expect(importButton).toBeEnabled();
  await importButton.click();

  const separatorIndex = tokenName.indexOf(':');
  const packageName = tokenName.slice(0, separatorIndex).trim();
  const tokenSymbol = tokenName.slice(separatorIndex + 1).trim();
  const expectedImport = `import { ${tokenSymbol} } from '${packageName}';`;

  await page.waitForFunction((expected: string) => {
    const current = window.jupyterapp.shell
      .currentWidget as FileEditorWidget | null;
    const source = current?.content.model.sharedModel.getSource();
    if (typeof source !== 'string') {
      return false;
    }
    return source.startsWith(expected);
  }, expectedImport);

  await importButton.click();
  await page.waitForFunction((expected: string) => {
    const current = window.jupyterapp.shell
      .currentWidget as FileEditorWidget | null;
    const source = current?.content.model.sharedModel.getSource();
    if (typeof source !== 'string') {
      return false;
    }
    return source.split(expected).length - 1 === 1;
  }, expectedImport);
});

test('commands tab lists and filters available commands', async ({ page }) => {
  await page.goto();
  const panel = await openSidebarPanel(page, TOKEN_SECTION_ID);

  await expect(
    panel.getByRole('tablist', { name: 'Extension points' })
  ).toBeVisible();

  const commandsButton = panel.getByRole('tab', {
    name: 'Commands',
    exact: true
  });
  await commandsButton.click();
  await expect(commandsButton).toHaveAttribute('aria-selected', 'true');

  const filterInput = panel.getByPlaceholder('Filter command ids');
  await filterInput.fill(LOAD_COMMAND);

  await expect(panel.locator('.jp-PluginPlayground-listItem')).toHaveCount(1);
  await expect(panel.locator('.jp-PluginPlayground-entryLabel')).toHaveText([
    LOAD_COMMAND
  ]);
  await expect(panel.getByText('Load Current File As Extension')).toBeVisible();

  const loadCommandArgumentsButton = panel.getByRole('button', {
    name: `Show argument documentation for ${LOAD_COMMAND}`
  });
  await expect(
    loadCommandArgumentsButton.locator(
      '.jp-PluginPlayground-argumentCountBadge'
    )
  ).toHaveText('?');

  const noArgumentsButtonLabel = `No arguments for ${LOAD_COMMAND}`;
  await loadCommandArgumentsButton.click();
  await expect(
    panel.locator('.jp-PluginPlayground-commandArgumentsText')
  ).toContainText('No arguments');
  await panel
    .getByRole('button', {
      name: `Hide argument documentation for ${LOAD_COMMAND}`
    })
    .click();
  await expect(
    panel.getByRole('button', { name: noArgumentsButtonLabel })
  ).toBeDisabled();

  await filterInput.fill(INTERNAL_CONTEXT_INFO_COMMAND);
  await expect(panel.locator('.jp-PluginPlayground-listItem')).toHaveCount(0);
  await expect(panel.getByText('No matching commands.')).toBeVisible();

  const commandWithArgumentDocs = await page.evaluate(async () => {
    const commands = window.jupyterapp.commands;
    const commandIds = commands
      .listCommands()
      .filter(id => !id.startsWith('__internal:'));

    for (const id of commandIds) {
      let usage = '';
      try {
        usage = commands.usage(id).trim();
      } catch {
        usage = '';
      }

      try {
        const description = await commands.describedBy(id);
        const args = description.args;
        if (usage || (args && Object.keys(args).length > 0)) {
          return id;
        }
      } catch {
        if (usage) {
          return id;
        }
      }
    }

    return null;
  });
  expect(commandWithArgumentDocs).toBeTruthy();
  await filterInput.fill(commandWithArgumentDocs ?? '');
  await expect(panel.locator('.jp-PluginPlayground-listItem')).toHaveCount(1);

  const showArgsButton = panel.getByRole('button', {
    name: `Show argument documentation for ${commandWithArgumentDocs}`
  });
  await showArgsButton.click();
  await expect(
    panel.getByRole('button', {
      name: `Hide argument documentation for ${commandWithArgumentDocs}`
    })
  ).toHaveAttribute('aria-expanded', 'true');

  const argumentsPanel = panel.locator('.jp-PluginPlayground-commandArguments');
  await expect(argumentsPanel).toBeVisible();
  await expect(
    panel.locator('.jp-PluginPlayground-commandArgumentsText')
  ).toContainText(/(Usage:|Arguments Schema:)/);
});

test('command completer suggests command ids inside execute calls', async ({
  page,
  tmpPath
}) => {
  const editorPath = `${tmpPath}/${COMMAND_COMPLETION_FILE}`;

  await page.contents.uploadContent(
    `import { JupyterFrontEnd } from '@jupyterlab/application';

const run = (application: JupyterFrontEnd) => {
  application.commands.execute();
};
`,
    'text',
    editorPath
  );
  await page.goto();
  await page.filebrowser.open(editorPath);
  expect(await page.activity.activateTab(COMMAND_COMPLETION_FILE)).toBe(true);

  await page.evaluate(() => {
    const current = window.jupyterapp.shell.currentWidget as FileEditorWidget;
    const editor = current.content.editor;
    const line = 3;
    const text = editor.getLine(line) ?? '';
    editor.setCursorPosition({
      line,
      column: text.indexOf('(') + 1
    });
    editor.focus();
  });

  await page.keyboard.type('pl');
  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, INVOKE_FILE_COMPLETER_COMMAND)
  );
  await page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id);
  }, INVOKE_FILE_COMPLETER_COMMAND);
  await page.waitForSelector(`.jp-Completer code:has-text("${LOAD_COMMAND}")`);

  const suggestion = page
    .locator(`.jp-Completer code:has-text("${LOAD_COMMAND}")`)
    .first();
  await Promise.all([
    page.waitForSelector(`.jp-Completer code:has-text("${LOAD_COMMAND}")`, {
      state: 'hidden'
    }),
    suggestion.click()
  ]);

  await page.waitForFunction((expected: string) => {
    const current = window.jupyterapp.shell.currentWidget as FileEditorWidget;
    const source = current.content.model.sharedModel.getSource();
    return source.includes(`application.commands.execute('${expected}')`);
  }, LOAD_COMMAND);
});
