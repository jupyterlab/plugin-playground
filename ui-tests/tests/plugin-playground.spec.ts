import { expect, galata, test } from '@jupyterlab/galata';
import { KNOWN_MODULE_NAMES } from '../../src/modules';
import type { FileEditorWidget } from '@jupyterlab/fileeditor';
import type { IJupyterLabPageFixture } from '@jupyterlab/galata';
import type { Contents } from '@jupyterlab/services';
import type { ConsoleMessage, Locator } from '@playwright/test';

const LOAD_COMMAND = 'plugin-playground:load-as-extension';
const EXPORT_COMMAND = 'plugin-playground:export-as-extension';
const SHARE_COMMAND = 'plugin-playground:share-via-link';
const OPEN_PACKAGES_REFERENCE_COMMAND = 'plugin-playground:open-js-explorer';
const INTERNAL_CONTEXT_INFO_COMMAND = '__internal:context-menu-info';
const CREATE_FILE_COMMAND = 'plugin-playground:create-new-plugin';
const CREATE_FILE_WITH_AI_COMMAND =
  'plugin-playground:create-new-plugin-with-ai';
const TAKE_TOUR_COMMAND = 'plugin-playground:take-tour';
const TOUR_ID = '@jupyterlab/plugin-playground:tour';
const PLAYGROUND_PLUGIN_ID = '@jupyterlab/plugin-playground:plugin';
const LIST_TOKENS_COMMAND = 'plugin-playground:list-tokens';
const LIST_COMMANDS_COMMAND = 'plugin-playground:list-commands';
const LIST_EXAMPLES_COMMAND = 'plugin-playground:list-extension-examples';
const MIN_BUNDLED_EXTENSION_EXAMPLE_COUNT = 29;
const TOUR_MISSING_HINT =
  'Guided tours are unavailable because "jupyterlab-tour" is not installed in this environment.';
const TEST_PLUGIN_ID = 'playground-integration-test:plugin';
const TEST_TOGGLE_COMMAND = 'playground-integration-test:toggle';
const TEST_ARGS_COMMAND = 'playground-integration-test:with-args';
const TEST_FILE = 'playground-integration-test.ts';
const FEDERATED_RUNTIME_PACKAGE = '@jupyterlab/plugin-playground';
const FEDERATED_RUNTIME_CONSUMER_PLUGIN_ID = 'runtime-consumer-test:plugin';
const FEDERATED_RUNTIME_CONSUMER_COMMAND = 'runtime-consumer-test:check';
const FEDERATED_RUNTIME_CONSUMER_FILE = 'runtime-consumer-test.ts';
const CSS_IMPORT_TEST_PLUGIN_ID = 'playground-css-import-test:plugin';
const CSS_IMPORT_TEST_MARKER_ID = 'playground-css-import-test-marker';
const CSS_IMPORT_TEST_COLOR = 'rgb(17, 34, 51)';
const CSS_IMPORT_TEST_UPDATED_COLOR = 'rgb(34, 68, 102)';
const CSS_IMPORT_TEST_BROKEN_MODULE_ERROR = 'css import rollback test failure';
const COMMAND_COMPLETION_FILE = 'command-completion.ts';
const INVOKE_FILE_COMPLETER_COMMAND = 'completer:invoke-file';
const JUPYTERLITE_AI_OPEN_CHAT_COMMAND = '@jupyterlite/ai:open-chat';
const JUPYTERLITE_AI_CHAT_PANEL_ID = '@jupyterlite/ai:chat-panel';
const PLAYGROUND_SIDEBAR_ID = 'jp-plugin-playground-sidebar';
const TOKEN_SECTION_ID = 'jp-plugin-token-sidebar';
const EXAMPLE_SECTION_ID = 'jp-plugin-example-sidebar';
const LOAD_ON_SAVE_CHECKBOX_LABEL = 'Run on save';
const FOLDER_SHARE_DISABLE_DIALOG_CHECKBOX_LABEL =
  'Do not ask me again if all files can be included';

interface IWindowWithExportCounter extends Window {
  __exportDownloadCount?: number;
  __originalCreateObjectURL?: typeof URL.createObjectURL;
  __exportDownloadFilenames?: string[];
  __exportDownloadBlobs?: Blob[];
  __originalAnchorClick?: (this: HTMLAnchorElement) => void;
}

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

const INSTALLED_WHEEL_PROJECT_NAME = 'playground-wheel-installed-smoke';
const INSTALLED_WHEEL_ARTIFACT_PATH =
  '/tmp/playground_wheel_installed_smoke-0.1.0-py3-none-any.whl';
const INSTALLED_WHEEL_MARKER_ID = 'jp-plugin-playground-wheel-installed-marker';
const INSTALLED_WHEEL_MARKER_TEXT = 'wheel-installed-marker-ready';
const INSTALLED_WHEEL_PLUGIN_SOURCE = `
const MARKER_ID = '${INSTALLED_WHEEL_MARKER_ID}';
const MARKER_TEXT = '${INSTALLED_WHEEL_MARKER_TEXT}';

const plugin = {
  id: 'playground-wheel-installed-smoke:plugin',
  autoStart: true,
  activate: () => {
    let marker = document.getElementById(MARKER_ID);
    if (!marker) {
      marker = document.createElement('div');
      marker.id = MARKER_ID;
      marker.textContent = MARKER_TEXT;
      document.body.appendChild(marker);
    }
  }
};

export default plugin;
`;

const CSS_IMPORT_TEST_SOURCE = `
import './style.css';

const plugin = {
  id: '${CSS_IMPORT_TEST_PLUGIN_ID}',
  autoStart: true,
  activate: () => {
    const existing = document.getElementById('${CSS_IMPORT_TEST_MARKER_ID}');
    if (existing) {
      existing.remove();
    }
    const marker = document.createElement('div');
    marker.id = '${CSS_IMPORT_TEST_MARKER_ID}';
    marker.textContent = 'css import marker';
    document.body.appendChild(marker);
  },
  deactivate: () => {
    document.getElementById('${CSS_IMPORT_TEST_MARKER_ID}')?.remove();
  }
};

export default plugin;
`;

const CSS_IMPORT_TEST_SOURCE_WITHOUT_STYLE = `
const plugin = {
  id: '${CSS_IMPORT_TEST_PLUGIN_ID}',
  autoStart: true,
  activate: () => {
    const existing = document.getElementById('${CSS_IMPORT_TEST_MARKER_ID}');
    if (existing) {
      existing.remove();
    }
    const marker = document.createElement('div');
    marker.id = '${CSS_IMPORT_TEST_MARKER_ID}';
    marker.textContent = 'css import marker';
    document.body.appendChild(marker);
  },
  deactivate: () => {
    document.getElementById('${CSS_IMPORT_TEST_MARKER_ID}')?.remove();
  }
};

export default plugin;
`;

const CSS_IMPORT_TEST_SOURCE_WITH_FAILING_IMPORT = `
import './style.css';
import './broken';

const plugin = {
  id: '${CSS_IMPORT_TEST_PLUGIN_ID}',
  autoStart: true,
  activate: () => {
    const existing = document.getElementById('${CSS_IMPORT_TEST_MARKER_ID}');
    if (existing) {
      existing.remove();
    }
    const marker = document.createElement('div');
    marker.id = '${CSS_IMPORT_TEST_MARKER_ID}';
    marker.textContent = 'css import marker';
    document.body.appendChild(marker);
  },
  deactivate: () => {
    document.getElementById('${CSS_IMPORT_TEST_MARKER_ID}')?.remove();
  }
};

export default plugin;
`;

const CSS_IMPORT_TEST_STYLE = `
#${CSS_IMPORT_TEST_MARKER_ID} {
  background-color: ${CSS_IMPORT_TEST_COLOR};
}
`;

const CSS_IMPORT_TEST_STYLE_UPDATED = `
#${CSS_IMPORT_TEST_MARKER_ID} {
  background-color: ${CSS_IMPORT_TEST_UPDATED_COLOR};
}
`;

const CSS_IMPORT_TEST_STYLE_WITH_RELATIVE_IMPORT = `
@import url('base.css');
`;

const CSS_IMPORT_TEST_BROKEN_MODULE = `
throw new Error('${CSS_IMPORT_TEST_BROKEN_MODULE_ERROR}');
`;

const CSS_IMPORT_TEST_VALID_SCHEMA = JSON.stringify(
  {
    title: 'CSS Import Test Settings',
    type: 'object',
    properties: {}
  },
  null,
  2
);

const CSS_IMPORT_TEST_INVALID_SCHEMA = `{
  "title": "CSS Import Test Settings",
`;

const CSS_IMPORT_TEST_PACKAGE_JSON_WITH_STYLE = JSON.stringify(
  {
    name: 'css-import-package-style-test',
    version: '0.1.0',
    style: 'style/index.css',
    jupyterlab: {
      extension: true
    }
  },
  null,
  2
);

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

function parameterNameFromToken(tokenSymbol: string): string {
  const base = /^I[A-Z]/.test(tokenSymbol) ? tokenSymbol.slice(1) : tokenSymbol;
  return `${base.charAt(0).toLowerCase()}${base.slice(1)}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findLoadOnSaveToggle(
  page: IJupyterLabPageFixture
): Promise<Locator> {
  const toggle = page.getByRole('button', {
    name: LOAD_ON_SAVE_CHECKBOX_LABEL
  });
  await expect(toggle).toBeVisible();
  return toggle;
}

async function findLoadOnSaveToggleLabel(
  page: IJupyterLabPageFixture
): Promise<Locator> {
  const label = page.locator('.jp-PluginPlayground-loadOnSaveText');
  await expect(label).toBeVisible();
  return label;
}

async function focusActiveEditor(page: IJupyterLabPageFixture): Promise<void> {
  await page.evaluate(() => {
    const current = window.jupyterapp.shell.currentWidget as FileEditorWidget;
    current.content.editor.focus();
  });
}

async function setActiveEditorSource(
  page: IJupyterLabPageFixture,
  source: string
): Promise<void> {
  await page.evaluate((nextSource: string) => {
    const current = window.jupyterapp.shell.currentWidget as FileEditorWidget;
    current.content.model.sharedModel.setSource(nextSource);
  }, source);
}

async function ensureMockJupyterLiteAIChat(
  page: IJupyterLabPageFixture
): Promise<void> {
  await page.evaluate(
    ({
      commandId,
      chatPanelId
    }: {
      commandId: string;
      chatPanelId: string;
    }) => {
      const inputSelector =
        '.jp-chat-input-textfield[data-playground-test="ai-input"] textarea';
      const ensureInput = (): HTMLTextAreaElement => {
        let input = document.querySelector(
          inputSelector
        ) as HTMLTextAreaElement | null;
        if (input) {
          return input;
        }
        const wrapper = document.createElement('div');
        wrapper.className = 'jp-chat-input-textfield';
        wrapper.setAttribute('data-playground-test', 'ai-input');
        input = document.createElement('textarea');
        wrapper.appendChild(input);
        document.body.prepend(wrapper);
        return input;
      };

      const inputModel = {
        get value(): string {
          return ensureInput().value;
        },
        set value(nextValue: string) {
          const input = ensureInput();
          input.value = nextValue;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        },
        focus: () => {
          ensureInput().focus();
        }
      };

      const app = window.jupyterapp as any;
      const chatWidget = {
        id: chatPanelId,
        model: {
          input: inputModel
        }
      };
      app.__playgroundChatTracker = {
        currentWidget: chatWidget,
        find: (predicate: (widget: unknown) => boolean) =>
          predicate(chatWidget) ? chatWidget : null
      };
      if (
        !app.__playgroundOriginalResolveOptionalService &&
        typeof app.resolveOptionalService === 'function'
      ) {
        app.__playgroundOriginalResolveOptionalService =
          app.resolveOptionalService.bind(app);
        app.resolveOptionalService = async (token: { name?: string }) => {
          if (token?.name === '@jupyter/chat:IChatTracker') {
            return app.__playgroundChatTracker;
          }
          return app.__playgroundOriginalResolveOptionalService(token);
        };
      }

      const shell = window.jupyterapp.shell as any;
      if (!shell.__playgroundOriginalWidgets) {
        shell.__playgroundOriginalWidgets = shell.widgets.bind(shell);
        shell.widgets = (area: string) => {
          const originalWidgets = Array.from(
            shell.__playgroundOriginalWidgets(area)
          );
          if (
            (area === 'left' || area === 'right') &&
            shell.__playgroundChatPanel
          ) {
            const chatPanel = shell.__playgroundChatPanel;
            const widgetsWithoutChatPanel = originalWidgets.filter(
              (widget: any) => widget?.id !== chatPanel.id
            );
            widgetsWithoutChatPanel.push(chatPanel);
            return widgetsWithoutChatPanel[Symbol.iterator]();
          }
          return originalWidgets[Symbol.iterator]();
        };
      }
      shell.__playgroundChatPanel = {
        id: chatPanelId,
        current: chatWidget
      };

      const commands = window.jupyterapp.commands;
      const commandRegistry = commands as any;
      if (!commandRegistry.__playgroundOriginalExecute) {
        commandRegistry.__playgroundOriginalExecute =
          commands.execute.bind(commands);
        commands.execute = async (id: string, args?: any) => {
          if (id === commandId) {
            ensureInput();
            return undefined;
          }
          return commandRegistry.__playgroundOriginalExecute(id, args);
        };
      }
      if (!commands.hasCommand(commandId)) {
        commands.addCommand(commandId, {
          label: 'JupyterLite AI test command',
          describedBy: { args: null },
          execute: () => {
            ensureInput();
            return undefined;
          }
        });
      }

      ensureInput();
    },
    {
      commandId: JUPYTERLITE_AI_OPEN_CHAT_COMMAND,
      chatPanelId: JUPYTERLITE_AI_CHAT_PANEL_ID
    }
  );
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
  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, CREATE_FILE_WITH_AI_COMMAND)
  );
  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, TAKE_TOUR_COMMAND)
  );
  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, EXPORT_COMMAND)
  );
  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, SHARE_COMMAND)
  );
  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, LIST_TOKENS_COMMAND)
  );
  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, LIST_COMMANDS_COMMAND)
  );
  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, LIST_EXAMPLES_COMMAND)
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
  await expect(
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, CREATE_FILE_WITH_AI_COMMAND)
  ).resolves.toBe(true);
  await expect(
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, TAKE_TOUR_COMMAND)
  ).resolves.toBe(true);
  await expect(
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, EXPORT_COMMAND)
  ).resolves.toBe(true);
  await expect(
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, SHARE_COMMAND)
  ).resolves.toBe(true);
  await expect(
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, LIST_TOKENS_COMMAND)
  ).resolves.toBe(true);
  await expect(
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, LIST_COMMANDS_COMMAND)
  ).resolves.toBe(true);
  await expect(
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, LIST_EXAMPLES_COMMAND)
  ).resolves.toBe(true);
});

test.describe('take tour command', () => {
  test.use({
    kernels: null,
    sessions: null,
    terminals: null
  });

  test('take tour command launches tour when tour commands are available', async ({
    page
  }) => {
    await page.goto();

    await page.waitForCondition(() =>
      page.evaluate((id: string) => {
        return window.jupyterapp.commands.hasCommand(id);
      }, TAKE_TOUR_COMMAND)
    );

    const result = await page.evaluate(
      async ({ takeTourCommand, addCommand, launchCommand }) => {
        const commands = window.jupyterapp.commands as any;
        const originalHasCommand = commands.hasCommand.bind(commands);
        const originalExecute = commands.execute.bind(commands);
        let addedTourId = '';
        let launchedTourId = '';

        commands.hasCommand = (id: string) => {
          if (id === addCommand || id === launchCommand) {
            return true;
          }
          return originalHasCommand(id);
        };
        commands.execute = async (id: string, args?: any) => {
          if (id === addCommand) {
            addedTourId = args?.tour?.id ?? '';
            return { id: addedTourId };
          }
          if (id === launchCommand) {
            launchedTourId = args?.id ?? '';
            return undefined;
          }
          return originalExecute(id, args);
        };

        try {
          const commandResult = (await originalExecute(
            takeTourCommand,
            {}
          )) as {
            ok?: boolean;
            message?: string;
          };
          return {
            commandResult,
            addedTourId,
            launchedTourId
          };
        } finally {
          commands.hasCommand = originalHasCommand;
          commands.execute = originalExecute;
        }
      },
      {
        takeTourCommand: TAKE_TOUR_COMMAND,
        addCommand: 'jupyterlab-tour:add',
        launchCommand: 'jupyterlab-tour:launch'
      }
    );

    expect(result.commandResult.ok).toBe(true);
    expect(result.addedTourId).toBe(TOUR_ID);
    expect(result.launchedTourId).toBe(TOUR_ID);
  });

  test('take tour command returns a deterministic missing-tour message when tour commands are unavailable', async ({
    page
  }) => {
    await page.goto();

    await page.waitForCondition(() =>
      page.evaluate((id: string) => {
        return window.jupyterapp.commands.hasCommand(id);
      }, TAKE_TOUR_COMMAND)
    );

    const result = await page.evaluate(
      async ({ takeTourCommand, addCommand, launchCommand }) => {
        const commands = window.jupyterapp.commands as any;
        const originalHasCommand = commands.hasCommand.bind(commands);
        commands.hasCommand = (id: string) => {
          if (id === addCommand || id === launchCommand) {
            return false;
          }
          return originalHasCommand(id);
        };

        try {
          return (await commands.execute(takeTourCommand, {})) as {
            ok?: boolean;
            message?: string;
          };
        } finally {
          commands.hasCommand = originalHasCommand;
        }
      },
      {
        takeTourCommand: TAKE_TOUR_COMMAND,
        addCommand: 'jupyterlab-tour:add',
        launchCommand: 'jupyterlab-tour:launch'
      }
    );

    expect(result.ok).toBe(false);
    expect(result.message).toBe(TOUR_MISSING_HINT);
  });
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
  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, LIST_EXAMPLES_COMMAND)
  );
  const examplesResult = await page.evaluate(
    ({ id, query }) => {
      return window.jupyterapp.commands.execute(id, { query });
    },
    {
      id: LIST_EXAMPLES_COMMAND,
      query: integrationExampleName
    }
  );
  expect(examplesResult.count).toBe(1);
  expect(examplesResult.items[0].path).toBe(expectedPath);

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

test('shows a no-match empty state for extension example filters', async ({
  page
}) => {
  const integrationExampleName = 'integration-example-filter-no-match';
  const integrationExampleRoot = `extension-examples/${integrationExampleName}`;
  const expectedPath = `${integrationExampleRoot}/src/index.ts`;

  await page.contents.uploadContent(
    JSON.stringify(
      {
        name: '@jupyterlab-examples/integration-example-filter-no-match',
        description: 'Integration test extension example (filter empty state)'
      },
      null,
      2
    ),
    'text',
    `${integrationExampleRoot}/package.json`
  );
  await page.contents.uploadContent(
    "const plugin = { id: 'integration-example-filter-no-match:plugin', autoStart: true, activate: () => undefined }; export default plugin;\n",
    'text',
    expectedPath
  );

  await page.goto();
  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, LIST_EXAMPLES_COMMAND)
  );

  const section = await openSidebarPanel(page, EXAMPLE_SECTION_ID);
  const filterInput = section.getByPlaceholder('Filter extension examples');
  await expect(filterInput).toBeVisible();

  await filterInput.fill('does-not-match-any-example');

  const exampleItems = section.locator('.jp-PluginPlayground-listItem');
  await expect(exampleItems).toHaveCount(0);
  await expect(
    section.getByText('No matching extension examples found.', { exact: true })
  ).toBeVisible();
  await expect(
    section.locator('text=git submodule update --init --recursive')
  ).toHaveCount(0);
});

test.describe('extension-examples smoke loading', () => {
  test.use({
    mockSettings: {
      ...galata.DEFAULT_SETTINGS,
      [PLAYGROUND_PLUGIN_ID]: {
        allowCDN: 'never'
      }
    }
  });

  test('loads all extension examples from extension-examples', async ({
    page
  }) => {
    test.slow();
    const discoveryLogPrefix =
      '[plugin-playground] extension-examples discovered count=';
    const loadCompletionPrefix =
      '[plugin-playground] load-as-extension completed path=';
    const loadCompletionStatusPrefix = ' status=';
    const completedLoadPaths = new Set<string>();
    const expectedConsoleIssues = [
      'Skipping plugin @jupyterlab-examples/clap-button:pluginNotebook: missing required services @jupyter-notebook/application:INotebookShell',
      'Error on POST /jupyterlab-examples-server/hello [object Object].'
    ];
    const unexpectedConsoleIssues: string[] = [];
    const onConsole = (message: ConsoleMessage): void => {
      const text = message.text();
      if (text.startsWith(loadCompletionPrefix)) {
        const statusSeparatorIndex = text.indexOf(
          loadCompletionStatusPrefix,
          loadCompletionPrefix.length
        );
        if (statusSeparatorIndex > loadCompletionPrefix.length) {
          completedLoadPaths.add(
            text.slice(loadCompletionPrefix.length, statusSeparatorIndex)
          );
        }
      }
      const type = message.type();
      if (type !== 'warning' && type !== 'error') {
        return;
      }
      if (expectedConsoleIssues.some(expected => text.includes(expected))) {
        return;
      }
      unexpectedConsoleIssues.push(`[${type}] ${text}`);
    };

    page.on('console', onConsole);
    try {
      await page.goto();
      await page.waitForCondition(() =>
        page.evaluate((id: string) => {
          return window.jupyterapp.commands.hasCommand(id);
        }, LIST_EXAMPLES_COMMAND)
      );
      await page.waitForCondition(() =>
        page.evaluate((id: string) => {
          return window.jupyterapp.commands.hasCommand(id);
        }, LOAD_COMMAND)
      );

      const discoveryResult = (await page.evaluate(
        async ({ id, prefix }) => {
          const result = (await window.jupyterapp.commands.execute(id, {})) as {
            count: number;
            items: Array<{ name: string; path: string }>;
          };
          const discoveryLog = `${prefix}${result.count}`;
          window.console.debug(discoveryLog);
          return { result, discoveryLog };
        },
        {
          id: LIST_EXAMPLES_COMMAND,
          prefix: discoveryLogPrefix
        }
      )) as {
        result: {
          count: number;
          items: Array<{ name: string; path: string }>;
        };
        discoveryLog: string;
      };
      const examplesResult = discoveryResult.result;
      const discoveredCount = Number.parseInt(
        discoveryResult.discoveryLog.slice(discoveryLogPrefix.length),
        10
      );
      expect(
        Number.isInteger(discoveredCount),
        `Could not parse discovery log count from "${discoveryResult.discoveryLog}".`
      ).toBe(true);
      expect(
        discoveredCount,
        'Discovery log count does not match list-extension-examples command output.'
      ).toBe(examplesResult.count);

      const bundledExamples = examplesResult.items.filter(
        example =>
          !example.path.startsWith('extension-examples/integration-example')
      );
      expect(
        bundledExamples.length,
        `Expected at least ${MIN_BUNDLED_EXTENSION_EXAMPLE_COUNT} bundled extension examples, but discovered ${bundledExamples.length}.`
      ).toBeGreaterThanOrEqual(MIN_BUNDLED_EXTENSION_EXAMPLE_COUNT);

      for (const example of bundledExamples) {
        await page.evaluate(async (pathToOpen: string) => {
          await window.jupyterapp.commands.execute('docmanager:open', {
            path: pathToOpen,
            factory: 'Editor'
          });
        }, example.path);
        await page.waitForFunction((pathToOpen: string) => {
          const current = window.jupyterapp.shell
            .currentWidget as FileEditorWidget | null;
          return current?.context?.path === pathToOpen;
        }, example.path);

        const loadResult = await page.evaluate((id: string) => {
          return window.jupyterapp.commands.execute(id);
        }, LOAD_COMMAND);

        expect(
          loadResult,
          `Failed to load extension example "${example.name}" (${
            example.path
          }). Result: ${JSON.stringify(loadResult)}`
        ).toMatchObject({
          ok: true,
          status: 'loaded'
        });
      }

      const missingCompletionLogs = bundledExamples
        .map(example => example.path)
        .filter(path => !completedLoadPaths.has(path));
      expect(
        missingCompletionLogs,
        `Missing completion console.debug entries for:\n${missingCompletionLogs.join(
          '\n'
        )}`
      ).toEqual([]);

      expect(
        unexpectedConsoleIssues,
        `Unexpected console warnings/errors while loading examples:\n${unexpectedConsoleIssues.join(
          '\n'
        )}`
      ).toEqual([]);
    } finally {
      page.off('console', onConsole);
    }
  });
});

test('creates a plugin file with an explicit path argument', async ({
  page,
  tmpPath
}) => {
  const requestedPath = `/${tmpPath}/named-by-command`;
  const expectedPath = `${tmpPath}/named-by-command.ts`;

  try {
    await page.goto();
    await page.waitForCondition(() =>
      page.evaluate((id: string) => {
        return window.jupyterapp.commands.hasCommand(id);
      }, CREATE_FILE_COMMAND)
    );

    const openPath = await page.evaluate(
      async ({ id, path, cwd }) => {
        await window.jupyterapp.commands.execute(id, { path, cwd });
        const current = window.jupyterapp.shell
          .currentWidget as FileEditorWidget | null;
        return current?.context?.path ?? null;
      },
      {
        id: CREATE_FILE_COMMAND,
        path: requestedPath,
        cwd: 'does/not/exist'
      }
    );
    expect(openPath).toBe(expectedPath);
  } finally {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
});

test('creates a plugin file in cwd when no explicit path is provided', async ({
  page,
  tmpPath
}) => {
  const cwd = `${tmpPath}/nested`;
  await page.contents.uploadContent('seed\n', 'text', `${cwd}/seed.txt`);

  await page.goto();
  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, CREATE_FILE_COMMAND)
  );

  const openPath = await page.evaluate(
    async ({ id, cwdArg }) => {
      await window.jupyterapp.commands.execute(id, { cwd: cwdArg });
      const current = window.jupyterapp.shell
        .currentWidget as FileEditorWidget | null;
      return current?.context?.path ?? null;
    },
    {
      id: CREATE_FILE_COMMAND,
      cwdArg: cwd
    }
  );

  expect(openPath).toBeTruthy();
  expect(openPath?.startsWith(`${cwd}/`)).toBe(true);
  expect(openPath?.endsWith('.ts')).toBe(true);
});

test('lists tokens and searches commands via command APIs', async ({
  page
}) => {
  await page.goto();
  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, LIST_TOKENS_COMMAND)
  );
  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, LIST_COMMANDS_COMMAND)
  );

  const tokensResult = await page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id);
  }, LIST_TOKENS_COMMAND);
  expect(tokensResult.count).toBeGreaterThan(0);
  expect(tokensResult.total).toBeGreaterThan(0);
  expect(typeof tokensResult.items[0].name).toBe('string');

  const commandsResult = await page.evaluate(
    ({ id, query }) => {
      return window.jupyterapp.commands.execute(id, { query });
    },
    {
      id: LIST_COMMANDS_COMMAND,
      query: LOAD_COMMAND
    }
  );
  expect(commandsResult.count).toBeGreaterThan(0);
  expect(
    commandsResult.items.some(
      (item: { id: string }) => item.id === LOAD_COMMAND
    )
  ).toBe(true);
});

test('open packages reference command switches to packages view', async ({
  page
}) => {
  await page.goto();

  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, OPEN_PACKAGES_REFERENCE_COMMAND)
  );

  await page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id);
  }, OPEN_PACKAGES_REFERENCE_COMMAND);

  const section = await openSidebarPanel(page, TOKEN_SECTION_ID);
  const packagesTab = section.getByRole('tab', { name: 'Packages' });
  await expect(packagesTab).toHaveAttribute('aria-selected', 'true');

  const filterCount = section
    .locator('.jp-PluginPlayground-filterCount')
    .first();
  await expect(filterCount).toBeVisible();
  await expect(
    section.locator('.jp-PluginPlayground-viewDescription').first()
  ).toContainText('External code libraries');

  const packageItems = section.locator('.jp-PluginPlayground-listItem');
  await expect(packageItems.first()).toBeVisible();
  await expect(
    packageItems.first().locator('.jp-PluginPlayground-actionButton').first()
  ).toBeVisible();
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
  const loadResult = await page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id);
  }, LOAD_COMMAND);
  expect(loadResult.ok).toBe(true);
  expect(loadResult.status).toBe('loaded');
  expect(loadResult.pluginIds).toContain(TEST_PLUGIN_ID);

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

test('loads plugin importing runtime federated module outside known module map', async ({
  page,
  tmpPath
}) => {
  const consumerPath = `${tmpPath}/${FEDERATED_RUNTIME_CONSUMER_FILE}`;
  expect(KNOWN_MODULE_NAMES).not.toContain(FEDERATED_RUNTIME_PACKAGE);
  const consumerSource = `import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { IPluginPlayground } from '${FEDERATED_RUNTIME_PACKAGE}';
import type { IPluginPlayground as IPluginPlaygroundType } from '${FEDERATED_RUNTIME_PACKAGE}';

const plugin: JupyterFrontEndPlugin<void> = {
  id: '${FEDERATED_RUNTIME_CONSUMER_PLUGIN_ID}',
  autoStart: true,
  requires: [IPluginPlayground],
  activate: (app: JupyterFrontEnd, playground: IPluginPlaygroundType) => {
    app.commands.addCommand('${FEDERATED_RUNTIME_CONSUMER_COMMAND}', {
      label: 'Runtime Federated Consumer Check',
      execute: () => typeof playground.shareViaLink === 'function'
    });
  }
};

export default plugin;
`;

  await page.contents.uploadContent(consumerSource, 'text', consumerPath);
  await page.goto();

  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, LOAD_COMMAND)
  );

  await page.filebrowser.open(consumerPath);
  expect(await page.activity.activateTab(FEDERATED_RUNTIME_CONSUMER_FILE)).toBe(
    true
  );

  const consumerLoadResult = await page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id);
  }, LOAD_COMMAND);
  expect(consumerLoadResult.ok).toBe(true);
  expect(consumerLoadResult.status).toBe('loaded');
  expect(consumerLoadResult.pluginIds).toContain(
    FEDERATED_RUNTIME_CONSUMER_PLUGIN_ID
  );

  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, FEDERATED_RUNTIME_CONSUMER_COMMAND)
  );

  await expect(
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.execute(id);
    }, FEDERATED_RUNTIME_CONSUMER_COMMAND)
  ).resolves.toBe(true);
});

test('loads local CSS imports and cleans stale styles on reload', async ({
  page,
  tmpPath
}) => {
  const projectRoot = `${tmpPath}/css-import-test`;
  const sourcePath = `${projectRoot}/index.ts`;
  const stylePath = `${projectRoot}/style.css`;

  await page.contents.uploadContent(CSS_IMPORT_TEST_STYLE, 'text', stylePath);
  await page.contents.uploadContent(CSS_IMPORT_TEST_SOURCE, 'text', sourcePath);
  await page.goto();

  await page.filebrowser.open(sourcePath);
  expect(await page.activity.activateTab('index.ts')).toBe(true);

  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, LOAD_COMMAND)
  );
  const loadResult = await page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id);
  }, LOAD_COMMAND);
  expect(loadResult.ok).toBe(true);
  expect(loadResult.status).toBe('loaded');
  expect(loadResult.pluginIds).toContain(CSS_IMPORT_TEST_PLUGIN_ID);

  await page.waitForCondition(() =>
    page.evaluate(
      ({ markerId, color }) => {
        const marker = document.getElementById(markerId);
        if (!marker) {
          return false;
        }
        return window.getComputedStyle(marker).backgroundColor === color;
      },
      {
        markerId: CSS_IMPORT_TEST_MARKER_ID,
        color: CSS_IMPORT_TEST_COLOR
      }
    )
  );

  await expect(
    page.evaluate((markerId: string) => {
      const marker = document.getElementById(markerId);
      if (!marker) {
        return null;
      }
      return window.getComputedStyle(marker).backgroundColor;
    }, CSS_IMPORT_TEST_MARKER_ID)
  ).resolves.toBe(CSS_IMPORT_TEST_COLOR);

  await setActiveEditorSource(page, CSS_IMPORT_TEST_SOURCE_WITHOUT_STYLE);
  const reloadResult = await page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id);
  }, LOAD_COMMAND);
  expect(reloadResult.ok).toBe(true);
  expect(reloadResult.status).toBe('loaded');
  expect(reloadResult.pluginIds).toContain(CSS_IMPORT_TEST_PLUGIN_ID);

  await page.waitForCondition(() =>
    page.evaluate(
      ({ markerId, originalColor }) => {
        const marker = document.getElementById(markerId);
        if (!marker) {
          return false;
        }
        return (
          window.getComputedStyle(marker).backgroundColor !== originalColor
        );
      },
      {
        markerId: CSS_IMPORT_TEST_MARKER_ID,
        originalColor: CSS_IMPORT_TEST_COLOR
      }
    )
  );

  await expect(
    page.evaluate((path: string) => {
      return Array.from(
        document.querySelectorAll('style[data-plugin-playground-style-path]')
      ).some(
        node => node.getAttribute('data-plugin-playground-style-path') === path
      );
    }, stylePath)
  ).resolves.toBe(false);
});

test('loads package.json style entry without explicit source CSS import', async ({
  page,
  tmpPath
}) => {
  const projectRoot = `${tmpPath}/css-package-style-test`;
  const sourcePath = `${projectRoot}/src/index.ts`;
  const stylePath = `${projectRoot}/style/index.css`;
  const packageJsonPath = `${projectRoot}/package.json`;

  await page.contents.uploadContent(
    CSS_IMPORT_TEST_PACKAGE_JSON_WITH_STYLE,
    'text',
    packageJsonPath
  );
  await page.contents.uploadContent(CSS_IMPORT_TEST_STYLE, 'text', stylePath);
  await page.contents.uploadContent(
    CSS_IMPORT_TEST_SOURCE_WITHOUT_STYLE,
    'text',
    sourcePath
  );
  await page.goto();

  await page.filebrowser.open(sourcePath);
  expect(await page.activity.activateTab('index.ts')).toBe(true);

  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, LOAD_COMMAND)
  );
  const loadResult = await page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id);
  }, LOAD_COMMAND);
  expect(loadResult.ok).toBe(true);
  expect(loadResult.status).toBe('loaded');
  expect(loadResult.pluginIds).toContain(CSS_IMPORT_TEST_PLUGIN_ID);

  await page.waitForCondition(() =>
    page.evaluate(
      ({ markerId, color }) => {
        const marker = document.getElementById(markerId);
        if (!marker) {
          return false;
        }
        return window.getComputedStyle(marker).backgroundColor === color;
      },
      {
        markerId: CSS_IMPORT_TEST_MARKER_ID,
        color: CSS_IMPORT_TEST_COLOR
      }
    )
  );

  await expect(
    page.evaluate((markerId: string) => {
      const marker = document.getElementById(markerId);
      if (!marker) {
        return null;
      }
      return window.getComputedStyle(marker).backgroundColor;
    }, CSS_IMPORT_TEST_MARKER_ID)
  ).resolves.toBe(CSS_IMPORT_TEST_COLOR);
});

test('loads package.json style entry with relative CSS @import', async ({
  page,
  tmpPath
}) => {
  const projectRoot = `${tmpPath}/css-package-style-import-test`;
  const sourcePath = `${projectRoot}/src/index.ts`;
  const packageJsonPath = `${projectRoot}/package.json`;
  const indexStylePath = `${projectRoot}/style/index.css`;
  const baseStylePath = `${projectRoot}/style/base.css`;

  await page.contents.uploadContent(
    CSS_IMPORT_TEST_PACKAGE_JSON_WITH_STYLE,
    'text',
    packageJsonPath
  );
  await page.contents.uploadContent(
    CSS_IMPORT_TEST_STYLE_WITH_RELATIVE_IMPORT,
    'text',
    indexStylePath
  );
  await page.contents.uploadContent(
    CSS_IMPORT_TEST_STYLE,
    'text',
    baseStylePath
  );
  await page.contents.uploadContent(
    CSS_IMPORT_TEST_SOURCE_WITHOUT_STYLE,
    'text',
    sourcePath
  );
  await page.goto();

  await page.filebrowser.open(sourcePath);
  expect(await page.activity.activateTab('index.ts')).toBe(true);

  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, LOAD_COMMAND)
  );
  const loadResult = await page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id);
  }, LOAD_COMMAND);
  expect(loadResult.ok).toBe(true);
  expect(loadResult.status).toBe('loaded');
  expect(loadResult.pluginIds).toContain(CSS_IMPORT_TEST_PLUGIN_ID);

  await page.waitForCondition(() =>
    page.evaluate(
      ({ markerId, color }) => {
        const marker = document.getElementById(markerId);
        if (!marker) {
          return false;
        }
        return window.getComputedStyle(marker).backgroundColor === color;
      },
      {
        markerId: CSS_IMPORT_TEST_MARKER_ID,
        color: CSS_IMPORT_TEST_COLOR
      }
    )
  );

  await expect(
    page.evaluate((markerId: string) => {
      const marker = document.getElementById(markerId);
      if (!marker) {
        return null;
      }
      return window.getComputedStyle(marker).backgroundColor;
    }, CSS_IMPORT_TEST_MARKER_ID)
  ).resolves.toBe(CSS_IMPORT_TEST_COLOR);
});

test('rolls back CSS changes when plugin load fails', async ({
  page,
  tmpPath
}) => {
  const projectRoot = `${tmpPath}/css-import-rollback-test`;
  const sourcePath = `${projectRoot}/index.ts`;
  const stylePath = `${projectRoot}/style.css`;
  const brokenModulePath = `${projectRoot}/broken.ts`;

  await page.contents.uploadContent(CSS_IMPORT_TEST_STYLE, 'text', stylePath);
  await page.contents.uploadContent(CSS_IMPORT_TEST_SOURCE, 'text', sourcePath);
  await page.goto();

  await page.filebrowser.open(sourcePath);
  expect(await page.activity.activateTab('index.ts')).toBe(true);

  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, LOAD_COMMAND)
  );
  const initialLoadResult = await page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id);
  }, LOAD_COMMAND);
  expect(initialLoadResult.ok).toBe(true);

  await page.waitForCondition(() =>
    page.evaluate(
      ({ markerId, color }) => {
        const marker = document.getElementById(markerId);
        if (!marker) {
          return false;
        }
        return window.getComputedStyle(marker).backgroundColor === color;
      },
      {
        markerId: CSS_IMPORT_TEST_MARKER_ID,
        color: CSS_IMPORT_TEST_COLOR
      }
    )
  );

  await page.contents.uploadContent(
    CSS_IMPORT_TEST_STYLE_UPDATED,
    'text',
    stylePath
  );
  await page.contents.uploadContent(
    CSS_IMPORT_TEST_BROKEN_MODULE,
    'text',
    brokenModulePath
  );
  await setActiveEditorSource(page, CSS_IMPORT_TEST_SOURCE_WITH_FAILING_IMPORT);

  const failingLoadResult = await page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id);
  }, LOAD_COMMAND);
  expect(failingLoadResult.ok).toBe(false);
  expect(failingLoadResult.status).toBe('loading-failed');

  await expect(
    page.evaluate((markerId: string) => {
      const marker = document.getElementById(markerId);
      if (!marker) {
        return null;
      }
      return window.getComputedStyle(marker).backgroundColor;
    }, CSS_IMPORT_TEST_MARKER_ID)
  ).resolves.toBe(CSS_IMPORT_TEST_COLOR);
});

test('rolls back CSS changes when plugin schema parsing fails', async ({
  page,
  tmpPath
}) => {
  const projectRoot = `${tmpPath}/css-import-schema-rollback-test`;
  const sourcePath = `${projectRoot}/index.ts`;
  const stylePath = `${projectRoot}/style.css`;
  const schemaPath = `${projectRoot}/plugin.json`;

  await page.contents.uploadContent(CSS_IMPORT_TEST_STYLE, 'text', stylePath);
  await page.contents.uploadContent(CSS_IMPORT_TEST_SOURCE, 'text', sourcePath);
  await page.contents.uploadContent(
    CSS_IMPORT_TEST_VALID_SCHEMA,
    'text',
    schemaPath
  );
  await page.goto();

  await page.filebrowser.open(sourcePath);
  expect(await page.activity.activateTab('index.ts')).toBe(true);

  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, LOAD_COMMAND)
  );
  const initialLoadResult = await page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id);
  }, LOAD_COMMAND);
  expect(initialLoadResult.ok).toBe(true);

  await page.waitForCondition(() =>
    page.evaluate(
      ({ markerId, color }) => {
        const marker = document.getElementById(markerId);
        if (!marker) {
          return false;
        }
        return window.getComputedStyle(marker).backgroundColor === color;
      },
      {
        markerId: CSS_IMPORT_TEST_MARKER_ID,
        color: CSS_IMPORT_TEST_COLOR
      }
    )
  );

  await page.contents.uploadContent(
    CSS_IMPORT_TEST_STYLE_UPDATED,
    'text',
    stylePath
  );
  await page.contents.uploadContent(
    CSS_IMPORT_TEST_INVALID_SCHEMA,
    'text',
    schemaPath
  );

  const failingLoadResult = await page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id);
  }, LOAD_COMMAND);
  expect(failingLoadResult.ok).toBe(false);
  expect(failingLoadResult.status).toBe('loading-failed');

  await expect(
    page.evaluate((markerId: string) => {
      const marker = document.getElementById(markerId);
      if (!marker) {
        return null;
      }
      return window.getComputedStyle(marker).backgroundColor;
    }, CSS_IMPORT_TEST_MARKER_ID)
  ).resolves.toBe(CSS_IMPORT_TEST_COLOR);
});

test('exports active extension folder as a zip archive', async ({
  page,
  tmpPath
}) => {
  const projectRoot = `${tmpPath}/export-command-test`;
  const sourcePath = `${projectRoot}/src/index.ts`;
  const packageJsonPath = `${projectRoot}/package.json`;

  await page.contents.uploadContent(
    JSON.stringify(
      {
        name: 'export-command-test',
        version: '0.1.0',
        jupyterlab: { extension: true }
      },
      null,
      2
    ),
    'text',
    packageJsonPath
  );
  await page.contents.uploadContent(TEST_PLUGIN_SOURCE, 'text', sourcePath);
  await page.goto();

  await page.filebrowser.open(sourcePath);
  expect(await page.activity.activateTab('index.ts')).toBe(true);

  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, EXPORT_COMMAND)
  );

  await page.evaluate(() => {
    const win = window as IWindowWithExportCounter;
    win.__exportDownloadCount = 0;
    if (!win.__originalCreateObjectURL) {
      win.__originalCreateObjectURL = URL.createObjectURL.bind(URL);
      const originalCreateObjectURL = win.__originalCreateObjectURL;
      URL.createObjectURL = ((blob: Blob) => {
        win.__exportDownloadCount = (win.__exportDownloadCount ?? 0) + 1;
        return originalCreateObjectURL(blob);
      }) as typeof URL.createObjectURL;
    }
  });

  const exportResult = await page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id);
  }, EXPORT_COMMAND);

  expect(exportResult.ok).toBe(true);
  expect(exportResult.archiveName).toBe('export-command-test.zip');
  expect(exportResult.fileCount).toBeGreaterThanOrEqual(2);

  const downloadCount = await page.evaluate(() => {
    return (window as IWindowWithExportCounter).__exportDownloadCount ?? 0;
  });
  expect(downloadCount).toBeGreaterThan(0);
});

test('exports active extension folder as a Python package from toolbar dropdown', async ({
  page,
  tmpPath
}) => {
  const projectRoot = `${tmpPath}/export-toolbar-wheel-test`;
  const sourcePath = `${projectRoot}/src/index.ts`;
  const packageJsonPath = `${projectRoot}/package.json`;

  await page.contents.uploadContent(
    JSON.stringify(
      {
        name: 'export-toolbar-wheel-test',
        version: '0.1.0',
        main: 'src/index.ts',
        jupyterlab: { extension: true }
      },
      null,
      2
    ),
    'text',
    packageJsonPath
  );
  await page.contents.uploadContent(TEST_PLUGIN_SOURCE, 'text', sourcePath);
  await page.goto();

  await page.filebrowser.open(sourcePath);
  expect(await page.activity.activateTab('index.ts')).toBe(true);

  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, EXPORT_COMMAND)
  );

  await page.evaluate(() => {
    const win = window as IWindowWithExportCounter;
    win.__exportDownloadCount = 0;
    win.__exportDownloadFilenames = [];

    if (!win.__originalCreateObjectURL) {
      win.__originalCreateObjectURL = URL.createObjectURL.bind(URL);
      const originalCreateObjectURL = win.__originalCreateObjectURL;
      URL.createObjectURL = ((blob: Blob) => {
        win.__exportDownloadCount = (win.__exportDownloadCount ?? 0) + 1;
        return originalCreateObjectURL(blob);
      }) as typeof URL.createObjectURL;
    }

    if (!win.__originalAnchorClick) {
      win.__originalAnchorClick = HTMLAnchorElement.prototype.click;
      const originalAnchorClick = win.__originalAnchorClick;
      HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
        const targetWindow = window as IWindowWithExportCounter;
        targetWindow.__exportDownloadFilenames = [
          ...(targetWindow.__exportDownloadFilenames ?? []),
          this.download
        ];
        return originalAnchorClick.call(this);
      };
    }
  });

  const exportFormatButton = page.getByRole('button', {
    name: 'Choose export format'
  });
  await expect(exportFormatButton).toBeVisible();
  await exportFormatButton.click();

  const wheelMenuItem = page
    .locator('.lm-Menu-item', {
      has: page.locator('.lm-Menu-itemLabel', {
        hasText: 'Export as Python package (.whl)'
      })
    })
    .first();
  await expect(wheelMenuItem).toBeVisible();
  await wheelMenuItem.click();

  const downloadCountBeforeExport = await page.evaluate(() => {
    return (window as IWindowWithExportCounter).__exportDownloadCount ?? 0;
  });
  expect(downloadCountBeforeExport).toBe(0);

  const exportButton = page.getByRole('button', {
    name: /Export plugin folder as/
  });
  await expect(exportButton).toBeVisible();
  await expect(
    exportButton.locator('.jp-PluginPlayground-actionLabel')
  ).toHaveText('Export .whl');
  await exportButton.click();

  await page.waitForCondition(() =>
    page.evaluate(() => {
      const filenames =
        (window as IWindowWithExportCounter).__exportDownloadFilenames ?? [];
      return filenames.some(name => name.endsWith('.whl'));
    })
  );
});

test('exports active extension folder as a Python package', async ({
  page,
  tmpPath
}) => {
  const projectRoot = `${tmpPath}/export-command-wheel-test`;
  const sourcePath = `${projectRoot}/src/index.ts`;
  const packageJsonPath = `${projectRoot}/package.json`;

  await page.contents.uploadContent(
    JSON.stringify(
      {
        name: 'export-command-wheel-test',
        version: '0.1.0',
        main: 'src/index.ts',
        jupyterlab: { extension: true }
      },
      null,
      2
    ),
    'text',
    packageJsonPath
  );
  await page.contents.uploadContent(TEST_PLUGIN_SOURCE, 'text', sourcePath);
  await page.goto();

  await page.filebrowser.open(sourcePath);
  expect(await page.activity.activateTab('index.ts')).toBe(true);

  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, EXPORT_COMMAND)
  );

  await page.evaluate(() => {
    const win = window as IWindowWithExportCounter;
    win.__exportDownloadCount = 0;
    if (!win.__originalCreateObjectURL) {
      win.__originalCreateObjectURL = URL.createObjectURL.bind(URL);
      const originalCreateObjectURL = win.__originalCreateObjectURL;
      URL.createObjectURL = ((blob: Blob) => {
        win.__exportDownloadCount = (win.__exportDownloadCount ?? 0) + 1;
        return originalCreateObjectURL(blob);
      }) as typeof URL.createObjectURL;
    }
  });

  const exportResult = await page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id, {
      format: 'wheel'
    });
  }, EXPORT_COMMAND);

  expect(exportResult.ok).toBe(true);
  expect(exportResult.archiveName).toMatch(/-py3-none-any\.whl$/);
  expect(exportResult.fileCount).toBeGreaterThanOrEqual(2);

  const downloadCount = await page.evaluate(() => {
    return (window as IWindowWithExportCounter).__exportDownloadCount ?? 0;
  });
  expect(downloadCount).toBeGreaterThan(0);
});

test('exports deterministic wheel artifact for installed-wheel smoke test', async ({
  page,
  tmpPath
}) => {
  const projectRoot = `${tmpPath}/${INSTALLED_WHEEL_PROJECT_NAME}`;
  const sourcePath = `${projectRoot}/src/index.ts`;
  const packageJsonPath = `${projectRoot}/package.json`;

  await page.contents.uploadContent(
    JSON.stringify(
      {
        name: INSTALLED_WHEEL_PROJECT_NAME,
        version: '0.1.0',
        main: 'src/index.ts',
        jupyterlab: { extension: true }
      },
      null,
      2
    ),
    'text',
    packageJsonPath
  );
  await page.contents.uploadContent(
    INSTALLED_WHEEL_PLUGIN_SOURCE,
    'text',
    sourcePath
  );
  await page.goto();

  await page.filebrowser.open(sourcePath);
  expect(await page.activity.activateTab('index.ts')).toBe(true);

  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, EXPORT_COMMAND)
  );

  const exportedWheelDownload = page.waitForEvent('download');
  const exportResult = await page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id, {
      format: 'wheel'
    });
  }, EXPORT_COMMAND);

  expect(exportResult.ok).toBe(true);
  expect(exportResult.archiveName).toMatch(
    /^playground[_-]wheel[_-]installed[_-]smoke-0\.1\.0-py3-none-any\.whl$/
  );

  const downloadedWheel = await exportedWheelDownload;
  await downloadedWheel.saveAs(INSTALLED_WHEEL_ARTIFACT_PATH);
});

test('wheel export includes license files and sanitized METADATA fields', async ({
  page,
  tmpPath
}) => {
  const projectRoot = `${tmpPath}/export-command-wheel-metadata-test`;
  const sourcePath = `${projectRoot}/src/index.ts`;
  const nestedLicensePath = `${projectRoot}/src/license.ts`;
  const packageJsonPath = `${projectRoot}/package.json`;
  const licensePath = `${projectRoot}/LICENSE`;
  const noticePath = `${projectRoot}/NOTICE`;
  const schemaPath = `${projectRoot}/schema/plugin.json`;

  await page.contents.uploadContent(
    JSON.stringify(
      {
        name: '../export-command-wheel-metadata-test',
        version: '0.1.0',
        main: 'src/index.ts',
        description: 'Wheel summary line\nwith newline',
        homepage: 'https://example.test/docs\nINJECTED-HOMEPAGE-LINE',
        author: {
          email: 'owner@example.test\nINJECTED-AUTHOR-EMAIL-LINE'
        },
        jupyterlab: { extension: true, schemaDir: 'schema' }
      },
      null,
      2
    ),
    'text',
    packageJsonPath
  );
  await page.contents.uploadContent(TEST_PLUGIN_SOURCE, 'text', sourcePath);
  await page.contents.uploadContent(
    'export const shouldNotBePackagedAsLicense = true;\n',
    'text',
    nestedLicensePath
  );
  await page.contents.uploadContent('License text\n', 'text', licensePath);
  await page.contents.uploadContent('Notice text\n', 'text', noticePath);
  await page.contents.uploadContent(
    JSON.stringify(
      {
        title: 'Wheel Export Schema Test',
        type: 'object',
        properties: {}
      },
      null,
      2
    ),
    'text',
    schemaPath
  );
  await page.goto();

  await page.filebrowser.open(sourcePath);
  expect(await page.activity.activateTab('index.ts')).toBe(true);

  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, EXPORT_COMMAND)
  );

  const exportedWheelDownload = page.waitForEvent('download');

  const inspection = await page.evaluate(async (id: string) => {
    const win = window as IWindowWithExportCounter;
    win.__exportDownloadBlobs = [];
    const originalCreateObjectURL =
      win.__originalCreateObjectURL ?? URL.createObjectURL.bind(URL);
    win.__originalCreateObjectURL = originalCreateObjectURL;
    URL.createObjectURL = ((blob: Blob) => {
      if (blob.type === 'application/zip') {
        win.__exportDownloadBlobs = [
          ...(win.__exportDownloadBlobs ?? []),
          blob
        ];
      }
      return originalCreateObjectURL(blob);
    }) as typeof URL.createObjectURL;

    try {
      await window.jupyterapp.commands.execute(id, { format: 'wheel' });
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
    }

    const blobs = win.__exportDownloadBlobs ?? [];
    const latestBlob = blobs[blobs.length - 1];
    if (!latestBlob) {
      return {
        entryPaths: [] as string[],
        metadataLines: [] as string[]
      };
    }

    const bytes = new Uint8Array(await latestBlob.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const decoder = new TextDecoder();
    const entryPaths: string[] = [];
    let metadataText = '';
    let eocdOffset = -1;
    const minEocdOffset = Math.max(0, bytes.length - 65557);
    for (let cursor = bytes.length - 22; cursor >= minEocdOffset; cursor--) {
      if (view.getUint32(cursor, true) === 0x06054b50) {
        eocdOffset = cursor;
        break;
      }
    }
    if (eocdOffset < 0) {
      return {
        entryPaths,
        metadataLines: [] as string[]
      };
    }

    const centralDirectorySize = view.getUint32(eocdOffset + 12, true);
    const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
    const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
    let offset = centralDirectoryOffset;

    while (
      offset + 46 <= centralDirectoryEnd &&
      offset + 46 <= bytes.length &&
      view.getUint32(offset, true) === 0x02014b50
    ) {
      const compressionMethod = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const pathLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localHeaderOffset = view.getUint32(offset + 42, true);
      const pathStart = offset + 46;
      const pathEnd = pathStart + pathLength;
      if (pathEnd > bytes.length) {
        break;
      }

      const path = decoder.decode(bytes.subarray(pathStart, pathEnd));
      entryPaths.push(path);
      if (
        path.endsWith('/METADATA') &&
        compressionMethod === 0 &&
        localHeaderOffset + 30 <= bytes.length &&
        view.getUint32(localHeaderOffset, true) === 0x04034b50
      ) {
        const localPathLength = view.getUint16(localHeaderOffset + 26, true);
        const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
        const dataStart =
          localHeaderOffset + 30 + localPathLength + localExtraLength;
        const dataEnd = dataStart + compressedSize;
        if (dataEnd <= bytes.length) {
          metadataText = decoder.decode(bytes.subarray(dataStart, dataEnd));
        }
      }

      offset = pathEnd + extraLength + commentLength;
    }

    return {
      entryPaths,
      metadataLines: metadataText
        .split('\n')
        .map(line => line.trimEnd())
        .filter(line => line.length > 0)
    };
  }, EXPORT_COMMAND);

  const downloadedWheel = await exportedWheelDownload;
  await downloadedWheel.saveAs(`/tmp/${downloadedWheel.suggestedFilename()}`);

  expect(
    inspection.entryPaths.some(
      path => path.includes('/licenses/') && path.endsWith('/LICENSE')
    )
  ).toBe(true);
  expect(
    inspection.entryPaths.some(
      path => path.includes('/licenses/') && path.endsWith('/NOTICE')
    )
  ).toBe(true);
  expect(
    inspection.entryPaths.some(path =>
      path.endsWith('/licenses/src/license.ts')
    )
  ).toBe(false);
  expect(
    inspection.entryPaths.some(path =>
      /\/schemas\/.+\/plugin\.json$/.test(path)
    )
  ).toBe(true);
  expect(
    inspection.entryPaths.some(path => path.endsWith('/schema/plugin.json'))
  ).toBe(false);
  expect(
    inspection.entryPaths.some(path => /(^|\/)\.\.(\/|$)/.test(path))
  ).toBe(false);
  expect(inspection.entryPaths.some(path => /(^|\/)\.(\/|$)/.test(path))).toBe(
    false
  );

  expect(inspection.metadataLines).toContain(
    'Summary: Wheel summary line with newline'
  );
  expect(inspection.metadataLines).toContain(
    'Home-page: https://example.test/docs INJECTED-HOMEPAGE-LINE'
  );
  expect(inspection.metadataLines).toContain(
    'Author-email: owner@example.test INJECTED-AUTHOR-EMAIL-LINE'
  );
});

test('shares active file via URL by default', async ({ page, tmpPath }) => {
  const projectRoot = `${tmpPath}/share-command-test`;
  const sourceFilename = 'share-entry.ts';
  const sourcePath = `${projectRoot}/src/${sourceFilename}`;
  const packageJsonPath = `${projectRoot}/package.json`;
  const sharedPluginSource = `
const plugin = {
  id: 'share-command-test:plugin',
  autoStart: true,
  activate: app => {
    let toggled = false;
    app.commands.addCommand('share-command-test:toggle', {
      label: 'Share Command Toggle',
      isToggled: () => toggled,
      execute: () => {
        toggled = !toggled;
      }
    });
  }
};

export default plugin;
`;

  await page.contents.uploadContent(
    JSON.stringify(
      {
        name: 'share-command-test',
        version: '0.1.0',
        jupyterlab: { extension: true }
      },
      null,
      2
    ),
    'text',
    packageJsonPath
  );
  await page.contents.uploadContent(sharedPluginSource, 'text', sourcePath);
  await page.goto();

  await page.evaluate(async (pathToOpen: string) => {
    await window.jupyterapp.commands.execute('docmanager:open', {
      path: pathToOpen,
      factory: 'Editor'
    });
  }, sourcePath);
  await page.waitForFunction((pathToOpen: string) => {
    const current = window.jupyterapp.shell
      .currentWidget as FileEditorWidget | null;
    return current?.context?.path === pathToOpen;
  }, sourcePath);
  expect(await page.activity.activateTab(sourceFilename)).toBe(true);

  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, SHARE_COMMAND)
  );

  const shareResult = await page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id);
  }, SHARE_COMMAND);

  expect(shareResult.ok).toBe(true);
  expect(typeof shareResult.link).toBe('string');
  expect(shareResult.link).toContain('plugin=');
  expect(shareResult.sourcePath).toBe(sourcePath);
  expect(shareResult.urlLength).toBeGreaterThan(0);

  const parsed = new URL(shareResult.link);
  expect(parsed.hash).toContain('plugin=');
  const hashQuery = parsed.hash.startsWith('#')
    ? parsed.hash.slice(1)
    : parsed.hash;
  const payloadToken =
    parsed.searchParams.get('plugin') ??
    new URLSearchParams(hashQuery).get('plugin');
  expect(payloadToken).toBeTruthy();
  expect(payloadToken ?? '').toMatch(/^1\.[gr]\.[A-Za-z0-9_-]+$/);
});

test('loads a shared plugin from URL and clears share token', async ({
  page,
  tmpPath
}) => {
  const projectRoot = `${tmpPath}/share-load-command-test`;
  const sharedPluginId = 'share-load-command-test:plugin';
  const sharedToggleCommand = 'share-load-command-test:toggle';
  const sourceFilename = 'share-load-entry.ts';
  const sourcePath = `${projectRoot}/src/${sourceFilename}`;
  const packageJsonPath = `${projectRoot}/package.json`;
  const sharedPluginSource = `
const plugin = {
  id: '${sharedPluginId}',
  autoStart: true,
  activate: app => {
    app.commands.addCommand('${sharedToggleCommand}', {
      label: 'Share Load Toggle',
      execute: () => {
        return undefined;
      }
    });
  }
};

export default plugin;
`;

  try {
    await page.contents.uploadContent(
      JSON.stringify(
        {
          name: 'share-load-command-test',
          version: '0.1.0',
          jupyterlab: { extension: true }
        },
        null,
        2
      ),
      'text',
      packageJsonPath
    );
    await page.contents.uploadContent(sharedPluginSource, 'text', sourcePath);
    await page.goto();

    await page.filebrowser.open(sourcePath);
    expect(await page.activity.activateTab(sourceFilename)).toBe(true);

    await page.waitForCondition(() =>
      page.evaluate((id: string) => {
        return window.jupyterapp.commands.hasCommand(id);
      }, SHARE_COMMAND)
    );

    const shareResult = await page.evaluate((id: string) => {
      return window.jupyterapp.commands.execute(id);
    }, SHARE_COMMAND);
    expect(shareResult.ok).toBe(true);
    expect(typeof shareResult.link).toBe('string');

    await Promise.all([
      page.waitForLoadState('domcontentloaded'),
      page.evaluate((url: string) => {
        window.location.assign(url);
      }, shareResult.link)
    ]);

    let restoredPath = '';
    await page.waitForCondition(async () => {
      const root = await page.contents.getContentMetadata(
        'plugin-playground-shared',
        'directory'
      );
      if (!root || root.type !== 'directory' || !Array.isArray(root.content)) {
        return false;
      }

      for (const folder of root.content) {
        if (folder.type !== 'directory') {
          continue;
        }
        const directory = await page.contents.getContentMetadata(
          folder.path,
          'directory'
        );
        if (
          !directory ||
          directory.type !== 'directory' ||
          !Array.isArray(directory.content)
        ) {
          continue;
        }
        const restoredFile = directory.content.find(
          entry => entry.type === 'file' && entry.name === sourceFilename
        );
        if (!restoredFile) {
          continue;
        }
        restoredPath = restoredFile.path;
        return true;
      }

      return false;
    }, 30000);

    expect(restoredPath).not.toBe('');
    if (!restoredPath) {
      throw new Error(
        'Shared file was not restored under plugin-playground-shared.'
      );
    }
    await page.filebrowser.open(restoredPath);
    expect(await page.activity.activateTab(sourceFilename)).toBe(true);

    const toolbarState = await page.evaluate(() => {
      const current = window.jupyterapp.shell.currentWidget as FileEditorWidget;
      const root = current?.node as HTMLElement | undefined;
      if (!root) {
        return null;
      }
      const loadItem = root.querySelector(
        '.jp-Toolbar > .jp-Toolbar-item[data-jp-item-name="load-as-extension"]'
      ) as HTMLElement | null;
      const loadButton = loadItem?.querySelector(
        '.jp-ToolbarButtonComponent'
      ) as HTMLElement | null;
      const floatingHint = root.querySelector(
        '.jp-PluginPlayground-urlLoadedFloatingHint'
      ) as HTMLElement | null;
      const exportButton = root.querySelector(
        '.jp-Toolbar > .jp-Toolbar-item[data-jp-item-name="export-extension"] .jp-ToolbarButtonComponent'
      ) as HTMLElement | null;
      const loadIcon = loadButton?.querySelector('svg') as SVGElement | null;
      const exportIcon = exportButton?.querySelector(
        'svg'
      ) as SVGElement | null;
      return {
        hasHintClass: root.classList.contains(
          'jp-PluginPlayground-urlLoadedEditorHint'
        ),
        hintLabel:
          floatingHint
            ?.querySelector('.jp-PluginPlayground-urlLoadedHintText')
            ?.textContent?.trim() ?? '',
        hasHintCloseButton: !!floatingHint?.querySelector(
          '.jp-PluginPlayground-urlLoadedHintClose'
        ),
        hasVisibleFloatingHint:
          !!floatingHint &&
          window.getComputedStyle(floatingHint).display !== 'none',
        loadButtonIconColor: loadIcon
          ? window.getComputedStyle(loadIcon).color
          : '',
        exportButtonIconColor: exportIcon
          ? window.getComputedStyle(exportIcon).color
          : ''
      };
    });
    expect(toolbarState).not.toBeNull();
    expect(toolbarState?.hasHintClass).toBe(true);
    expect(toolbarState?.hintLabel).toBe('Load as Extension');
    expect(toolbarState?.hasHintCloseButton).toBe(true);
    expect(toolbarState?.hasVisibleFloatingHint).toBe(true);
    expect(toolbarState?.loadButtonIconColor).not.toBe(
      toolbarState?.exportButtonIconColor
    );

    const loadResult = await page.evaluate((id: string) => {
      return window.jupyterapp.commands.execute(id);
    }, LOAD_COMMAND);
    expect(loadResult.ok).toBe(true);
    expect(loadResult.status).toBe('loaded');
    expect(loadResult.pluginIds).toContain(sharedPluginId);

    await page.waitForCondition(() =>
      page.evaluate(() => {
        const current = window.jupyterapp.shell
          .currentWidget as FileEditorWidget;
        const root = current?.node as HTMLElement | undefined;
        const floatingHint = root?.querySelector(
          '.jp-PluginPlayground-urlLoadedFloatingHint'
        ) as HTMLElement | null;
        const hintDisplay = floatingHint
          ? window.getComputedStyle(floatingHint).display
          : 'none';
        return (
          !!current &&
          !!root &&
          !root.classList.contains('jp-PluginPlayground-urlLoadedEditorHint') &&
          hintDisplay === 'none'
        );
      })
    );

    const restoredSource = await page.evaluate(async (path: string) => {
      const fileModel = await window.jupyterapp.serviceManager.contents.get(
        path,
        {
          content: true,
          format: 'text'
        }
      );
      return typeof fileModel.content === 'string' ? fileModel.content : null;
    }, restoredPath);
    const browserState = await page.evaluate((toggleCommand: string) => {
      const currentUrl = new URL(window.location.href);
      const hashQuery = currentUrl.hash.startsWith('#')
        ? currentUrl.hash.slice(1)
        : currentUrl.hash;
      return {
        pluginQueryParam: currentUrl.searchParams.get('plugin'),
        pluginHashParam: new URLSearchParams(hashQuery).get('plugin'),
        hasLoadedToggleCommand:
          window.jupyterapp.commands.hasCommand(toggleCommand)
      };
    }, sharedToggleCommand);
    const hasUntitledFolderWithSameNamedFile = await page.evaluate(async () => {
      const root = await window.jupyterapp.serviceManager.contents.get('', {
        content: true
      });
      if (!root || root.type !== 'directory' || !Array.isArray(root.content)) {
        return false;
      }
      const untitledPattern = /^untitled/i;
      const entries = root.content as Contents.IModel[];
      for (const entry of entries) {
        if (
          entry.type !== 'directory' ||
          typeof entry.name !== 'string' ||
          !untitledPattern.test(entry.name) ||
          typeof entry.path !== 'string'
        ) {
          continue;
        }
        const directory = await window.jupyterapp.serviceManager.contents.get(
          entry.path,
          {
            content: true
          }
        );
        if (
          !directory ||
          directory.type !== 'directory' ||
          !Array.isArray(directory.content)
        ) {
          continue;
        }
        const children = directory.content as Contents.IModel[];
        const matchingFile = children.some(
          child => child.type === 'file' && child.name === entry.name
        );
        if (matchingFile) {
          return true;
        }
      }
      return false;
    });

    expect(restoredPath.includes('plugin-playground-shared/')).toBe(true);
    expect(restoredPath.includes(`/${sourceFilename}`)).toBe(true);
    expect(restoredSource?.trim()).toBe(sharedPluginSource.trim());
    expect(browserState.pluginQueryParam).toBeNull();
    expect(browserState.pluginHashParam).toBeNull();
    expect(browserState.hasLoadedToggleCommand).toBe(true);
    expect(hasUntitledFolderWithSameNamedFile).toBe(false);
  } finally {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
});

test('applies hide=all layout from shared URL hash params', async ({
  page,
  tmpPath
}) => {
  const projectRoot = `${tmpPath}/share-hide-all-hash-layout-test`;
  const sourceFilename = 'share-hide-all-hash-entry.ts';
  const sourcePath = `${projectRoot}/src/${sourceFilename}`;
  const packageJsonPath = `${projectRoot}/package.json`;
  const sharedPluginSource = `
const plugin = {
  id: 'share-hide-all-hash-layout-test:plugin',
  autoStart: true,
  activate: () => undefined
};

export default plugin;
`;

  await page.contents.uploadContent(
    JSON.stringify(
      {
        name: 'share-hide-all-hash-layout-test',
        version: '0.1.0',
        jupyterlab: { extension: true }
      },
      null,
      2
    ),
    'text',
    packageJsonPath
  );
  await page.contents.uploadContent(sharedPluginSource, 'text', sourcePath);
  await page.goto();

  await page.evaluate(async (pathToOpen: string) => {
    await window.jupyterapp.commands.execute('docmanager:open', {
      path: pathToOpen,
      factory: 'Editor'
    });
  }, sourcePath);
  await page.waitForFunction((pathToOpen: string) => {
    const current = window.jupyterapp.shell
      .currentWidget as FileEditorWidget | null;
    return current?.context?.path === pathToOpen;
  }, sourcePath);
  expect(await page.activity.activateTab(sourceFilename)).toBe(true);

  await page.waitForCondition(() =>
    page.evaluate(
      (id: string) => window.jupyterapp.commands.hasCommand(id),
      SHARE_COMMAND
    )
  );

  const shareResult = await page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id);
  }, SHARE_COMMAND);
  expect(shareResult.ok).toBe(true);
  expect(typeof shareResult.link).toBe('string');

  const hideAllInHashSharedLink = await page.evaluate((link: string) => {
    const url = new URL(link);
    url.searchParams.set('z', '1');
    const hashQuery = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
    const hashParams = new URLSearchParams(hashQuery);
    hashParams.set('hide', 'all');
    url.hash = hashParams.toString();
    return url.toString();
  }, shareResult.link);

  await Promise.all([
    page.waitForLoadState('domcontentloaded'),
    page.evaluate((url: string) => {
      window.location.assign(url);
    }, hideAllInHashSharedLink)
  ]);

  await page.waitForCondition(async () => {
    try {
      return await page.evaluate((sharedFileName: string) => {
        const app = window.jupyterapp as any;
        if (!app) {
          return false;
        }
        const shell = app.shell as any;
        const currentPath = shell.currentWidget?.context?.path ?? '';
        const openedSharedFile =
          typeof currentPath === 'string' &&
          currentPath.includes('plugin-playground-shared/') &&
          currentPath.endsWith(`/${sharedFileName}`);
        if (!openedSharedFile) {
          return false;
        }

        const leftCollapsed = shell.leftCollapsed === true;
        const rightCollapsed = shell.rightCollapsed === true;
        if (!leftCollapsed || !rightCollapsed) {
          return false;
        }

        const isNotebookHost = app.hasPlugin(
          '@jupyter-notebook/application-extension:shell'
        );
        if (isNotebookHost) {
          return true;
        }

        const topHidden =
          typeof shell.isTopInSimpleModeVisible === 'function'
            ? shell.isTopInSimpleModeVisible() === false
            : true;
        const statusbarHidden = app.commands.hasCommand('statusbar:toggle')
          ? app.commands.isToggled('statusbar:toggle') === false
          : true;

        return shell.mode === 'single-document' && topHidden && statusbarHidden;
      }, sourceFilename);
    } catch {
      return false;
    }
  });
});

test('applies repeated hide query values from shared URL', async ({
  page,
  tmpPath
}) => {
  const projectRoot = `${tmpPath}/share-hide-query-layout-test`;
  const sourceFilename = 'share-hide-query-entry.ts';
  const sourcePath = `${projectRoot}/src/${sourceFilename}`;
  const packageJsonPath = `${projectRoot}/package.json`;
  const sharedPluginSource = `
const plugin = {
  id: 'share-hide-query-layout-test:plugin',
  autoStart: true,
  activate: () => undefined
};

export default plugin;
`;

  await page.contents.uploadContent(
    JSON.stringify(
      {
        name: 'share-hide-query-layout-test',
        version: '0.1.0',
        jupyterlab: { extension: true }
      },
      null,
      2
    ),
    'text',
    packageJsonPath
  );
  await page.contents.uploadContent(sharedPluginSource, 'text', sourcePath);
  await page.goto();

  await page.evaluate(async (pathToOpen: string) => {
    await window.jupyterapp.commands.execute('docmanager:open', {
      path: pathToOpen,
      factory: 'Editor'
    });
  }, sourcePath);
  await page.waitForFunction((pathToOpen: string) => {
    const current = window.jupyterapp.shell
      .currentWidget as FileEditorWidget | null;
    return current?.context?.path === pathToOpen;
  }, sourcePath);
  expect(await page.activity.activateTab(sourceFilename)).toBe(true);

  await page.waitForCondition(() =>
    page.evaluate(
      (id: string) => window.jupyterapp.commands.hasCommand(id),
      SHARE_COMMAND
    )
  );

  const shareResult = await page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id);
  }, SHARE_COMMAND);
  expect(shareResult.ok).toBe(true);
  expect(typeof shareResult.link).toBe('string');

  const hideValuesSharedLink = await page.evaluate((link: string) => {
    const url = new URL(link);
    url.searchParams.set('z', '1');
    url.searchParams.append('hide', 'statusbar');
    url.searchParams.append('hide', 'menu');
    return url.toString();
  }, shareResult.link);

  await Promise.all([
    page.waitForLoadState('domcontentloaded'),
    page.evaluate((url: string) => {
      window.location.assign(url);
    }, hideValuesSharedLink)
  ]);

  await page.waitForCondition(async () => {
    try {
      return await page.evaluate((sharedFileName: string) => {
        const app = window.jupyterapp as any;
        if (!app) {
          return false;
        }
        const shell = app.shell as any;
        const currentPath = shell.currentWidget?.context?.path ?? '';
        const openedSharedFile =
          typeof currentPath === 'string' &&
          currentPath.includes('plugin-playground-shared/') &&
          currentPath.endsWith(`/${sharedFileName}`);
        if (!openedSharedFile) {
          return false;
        }

        const isNotebookHost = app.hasPlugin(
          '@jupyter-notebook/application-extension:shell'
        );
        if (isNotebookHost) {
          return true;
        }

        const topHidden =
          typeof shell.isTopInSimpleModeVisible === 'function'
            ? shell.isTopInSimpleModeVisible() === false
            : true;
        const statusbarHidden = app.commands.hasCommand('statusbar:toggle')
          ? app.commands.isToggled('statusbar:toggle') === false
          : true;

        return topHidden && statusbarHidden;
      }, sourceFilename);
    } catch {
      return false;
    }
  });
});

test('shares selected file or folder when using browser selection', async ({
  page,
  tmpPath
}) => {
  const projectRoot = `${tmpPath}/share-browser-selection-test`;
  const filePath = `${projectRoot}/README.md`;
  const folderPath = `${projectRoot}/src`;
  const sourcePath = `${folderPath}/index.ts`;
  const helperPath = `${folderPath}/util.ts`;

  await page.contents.uploadContent(
    '# Share Browser Selection\n',
    'text',
    filePath
  );
  await page.contents.uploadContent(TEST_PLUGIN_SOURCE, 'text', sourcePath);
  await page.contents.uploadContent(
    'export const util = 1;\n',
    'text',
    helperPath
  );
  await page.goto();

  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, SHARE_COMMAND)
  );

  await page.filebrowser.openDirectory(projectRoot);
  const browserSection = page.getByRole('region', {
    name: 'File Browser Section'
  });
  const fileItem = browserSection.getByRole('listitem', {
    name: /^Name: README\.md/
  });
  await fileItem.click();

  const fileShareResult = await page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id, {
      useBrowserSelection: true
    });
  }, SHARE_COMMAND);
  expect(fileShareResult.ok).toBe(true);
  expect(fileShareResult.sourcePath).toBe(filePath);
  expect(fileShareResult.link).toContain('plugin=');

  await page.filebrowser.openDirectory(projectRoot);
  const folderItem = browserSection.getByRole('listitem', {
    name: /^Name: src/
  });
  await folderItem.click();

  const folderSharePromise = page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id, {
      useBrowserSelection: true
    });
  }, SHARE_COMMAND);

  const disableDialogCheckbox = page.getByRole('checkbox', {
    name: FOLDER_SHARE_DISABLE_DIALOG_CHECKBOX_LABEL
  });
  await expect(disableDialogCheckbox).toBeVisible();

  const shareSelectedFilesButton = page.getByRole('button', {
    name: 'Share Selected Files',
    exact: true
  });
  await expect(shareSelectedFilesButton).toBeVisible();

  const indexFileCheckbox = page
    .locator('label', { hasText: /^index\.ts \(/ })
    .locator('input[type="checkbox"]');
  const utilFileCheckbox = page
    .locator('label', { hasText: /^util\.ts \(/ })
    .locator('input[type="checkbox"]');
  await expect(indexFileCheckbox).toBeVisible();
  await expect(utilFileCheckbox).toBeVisible();
  await expect(indexFileCheckbox).toBeChecked();
  await expect(utilFileCheckbox).toBeChecked();

  await utilFileCheckbox.uncheck();
  await expect(indexFileCheckbox).toBeChecked();
  await expect(utilFileCheckbox).not.toBeChecked();

  await shareSelectedFilesButton.click();

  const folderShareResult = await folderSharePromise;
  expect(folderShareResult.ok).toBe(true);
  expect(folderShareResult.sourcePath).toBe(folderPath);
  expect(folderShareResult.link).toContain('plugin=');
});

test('does not fall back to browser selection when context target is required', async ({
  page,
  tmpPath
}) => {
  const projectRoot = `${tmpPath}/share-context-target-strict-test`;
  const filePath = `${projectRoot}/README.md`;

  await page.contents.uploadContent(
    '# Share Context Target Strict\n',
    'text',
    filePath
  );
  await page.goto();

  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, SHARE_COMMAND)
  );

  await page.filebrowser.openDirectory(projectRoot);
  const browserSection = page.getByRole('region', {
    name: 'File Browser Section'
  });
  const fileItem = browserSection.getByRole('listitem', {
    name: /^Name: README\.md/
  });
  await fileItem.click();

  const result = await page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id, {
      useBrowserSelection: true,
      useContextTarget: true
    });
  }, SHARE_COMMAND);

  expect(result.ok).toBe(false);
  expect(result.sourcePath).toBeNull();
  expect(result.message).toContain('Could not resolve the context-menu target');
});

test('disables always-show folder selection dialog after opting out', async ({
  page,
  tmpPath
}) => {
  const projectRoot = `${tmpPath}/share-folder-setting-optout-test`;
  const folderPath = `${projectRoot}/src`;
  const sourcePath = `${folderPath}/index.ts`;

  await page.contents.uploadContent(TEST_PLUGIN_SOURCE, 'text', sourcePath);
  await page.goto();

  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, SHARE_COMMAND)
  );

  await page.filebrowser.openDirectory(projectRoot);
  const browserSection = page.getByRole('region', {
    name: 'File Browser Section'
  });
  const folderItem = browserSection.getByRole('listitem', {
    name: /^Name: src/
  });
  await folderItem.click();

  const firstSharePromise = page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id, {
      useBrowserSelection: true
    });
  }, SHARE_COMMAND);

  const disableDialogCheckbox = page.getByRole('checkbox', {
    name: FOLDER_SHARE_DISABLE_DIALOG_CHECKBOX_LABEL
  });
  await expect(disableDialogCheckbox).toBeVisible();
  await disableDialogCheckbox.check();

  const shareSelectedFilesButton = page.getByRole('button', {
    name: 'Share Selected Files',
    exact: true
  });
  await expect(shareSelectedFilesButton).toBeVisible();
  await shareSelectedFilesButton.click();

  const firstShareResult = await firstSharePromise;
  expect(firstShareResult.ok).toBe(true);
  expect(firstShareResult.sourcePath).toBe(folderPath);

  await page.filebrowser.openDirectory(projectRoot);
  await folderItem.click();

  const secondShareResult = await page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id, {
      useBrowserSelection: true
    });
  }, SHARE_COMMAND);

  expect(secondShareResult.ok).toBe(true);
  expect(secondShareResult.sourcePath).toBe(folderPath);
  await expect(
    page.getByRole('button', {
      name: 'Share Selected Files',
      exact: true
    })
  ).toHaveCount(0);
});

test('shows auto-excluded files as optional in always mode', async ({
  page,
  tmpPath
}) => {
  const projectRoot = `${tmpPath}/share-folder-always-auto-excluded-test`;
  const folderPath = `${projectRoot}/src`;
  const sourcePath = `${folderPath}/index.ts`;
  const imagePath = `${folderPath}/icon.png`;

  await page.contents.uploadContent(TEST_PLUGIN_SOURCE, 'text', sourcePath);
  await page.contents.uploadContent('not-a-real-png', 'text', imagePath);
  await page.goto();

  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, SHARE_COMMAND)
  );

  await page.filebrowser.openDirectory(projectRoot);
  const browserSection = page.getByRole('region', {
    name: 'File Browser Section'
  });
  const folderItem = browserSection.getByRole('listitem', {
    name: /^Name: src/
  });
  await folderItem.click();

  const sharePromise = page.evaluate((id: string) => {
    return window.jupyterapp.commands.execute(id, {
      useBrowserSelection: true
    });
  }, SHARE_COMMAND);

  const shareSelectedFilesButton = page.getByRole('button', {
    name: 'Share Selected Files',
    exact: true
  });
  await expect(shareSelectedFilesButton).toBeVisible();
  await expect(
    page.getByRole('checkbox', {
      name: FOLDER_SHARE_DISABLE_DIALOG_CHECKBOX_LABEL
    })
  ).toHaveCount(0);

  const imageCheckbox = page
    .locator('label', { hasText: /^icon\.png \(/ })
    .locator('input[type="checkbox"]');
  await expect(imageCheckbox).toBeVisible();
  await expect(imageCheckbox).not.toBeChecked();
  await imageCheckbox.check();
  await expect(imageCheckbox).toBeChecked();

  await shareSelectedFilesButton.click();
  const result = await sharePromise;
  expect(result.ok).toBe(true);
  expect(result.sourcePath).toBe(folderPath);
  expect(result.link).toContain('plugin=');
});

test.describe('share capacity meter', () => {
  test.use({
    mockSettings: {
      ...galata.DEFAULT_SETTINGS,
      [PLAYGROUND_PLUGIN_ID]: {
        shareFolderSelectionDialogMode: 'always'
      }
    }
  });

  test('shows share capacity meter and excludes docs/test/python files by default', async ({
    page,
    tmpPath
  }) => {
    const projectRoot = `${tmpPath}/share-folder-capacity-meter-test`;
    const folderPath = `${projectRoot}/src`;
    const sourcePath = `${folderPath}/index.ts`;
    const readmePath = `${folderPath}/README.md`;
    const specPath = `${folderPath}/index.spec.ts`;
    const pythonPath = `${folderPath}/main.py`;

    await page.contents.uploadContent(TEST_PLUGIN_SOURCE, 'text', sourcePath);
    await page.contents.uploadContent('# test readme\n', 'text', readmePath);
    await page.contents.uploadContent(
      'describe("spec", () => { expect(true).toBe(true); });',
      'text',
      specPath
    );
    await page.contents.uploadContent('print("hello")\n', 'text', pythonPath);
    await page.goto();

    await page.waitForCondition(() =>
      page.evaluate((id: string) => {
        return window.jupyterapp.commands.hasCommand(id);
      }, SHARE_COMMAND)
    );

    const sharePromise = page.evaluate(
      ({ id, path }: { id: string; path: string }) => {
        return window.jupyterapp.commands.execute(id, {
          path
        });
      },
      {
        id: SHARE_COMMAND,
        path: folderPath
      }
    );

    const shareSelectedFilesButton = page.getByRole('button', {
      name: 'Share Selected Files',
      exact: true
    });
    await expect(shareSelectedFilesButton).toBeVisible();
    await expect(
      page.locator('.jp-PluginPlayground-folderShareSelectionCapacityLabel')
    ).toContainText(/selected/i);
    await expect(
      page.locator('.jp-PluginPlayground-folderShareSelectionCapacityDetails')
    ).toContainText(/% capacity used/i);

    const sourceCheckbox = page
      .locator('label', { hasText: /^index\.ts \(/ })
      .locator('input[type="checkbox"]');
    await expect(sourceCheckbox).toBeChecked();

    const readmeCheckbox = page
      .locator('label', { hasText: /^README\.md \(/i })
      .locator('input[type="checkbox"]');
    await expect(readmeCheckbox).not.toBeChecked();

    const specCheckbox = page
      .locator('label', { hasText: /^index\.spec\.ts \(/ })
      .locator('input[type="checkbox"]');
    await expect(specCheckbox).not.toBeChecked();

    const pythonCheckbox = page
      .locator('label', { hasText: /^main\.py \(/ })
      .locator('input[type="checkbox"]');
    await expect(pythonCheckbox).not.toBeChecked();

    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    const result = await sharePromise;
    expect(result.ok).toBe(false);
    expect(result.message).toContain('cancelled');
  });
});

test.describe('share folder selection dialog modes', () => {
  test.describe('auto-excluded-or-limit', () => {
    test.use({
      mockSettings: {
        ...galata.DEFAULT_SETTINGS,
        [PLAYGROUND_PLUGIN_ID]: {
          shareFolderSelectionDialogMode: 'auto-excluded-or-limit'
        }
      }
    });

    test('opens file selection dialog when folder has auto-excluded files', async ({
      page,
      tmpPath
    }) => {
      const projectRoot = `${tmpPath}/share-folder-auto-excluded-mode-test`;
      const folderPath = `${projectRoot}/src`;
      const sourcePath = `${folderPath}/index.ts`;
      const imagePath = `${folderPath}/icon.png`;

      await page.contents.uploadContent(TEST_PLUGIN_SOURCE, 'text', sourcePath);
      await page.contents.uploadContent('not-a-real-png', 'text', imagePath);
      await page.goto();

      await page.waitForCondition(() =>
        page.evaluate((id: string) => {
          return window.jupyterapp.commands.hasCommand(id);
        }, SHARE_COMMAND)
      );

      await page.filebrowser.openDirectory(projectRoot);
      const browserSection = page.getByRole('region', {
        name: 'File Browser Section'
      });
      const folderItem = browserSection.getByRole('listitem', {
        name: /^Name: src/
      });
      await folderItem.click();

      const sharePromise = page.evaluate((id: string) => {
        return window.jupyterapp.commands.execute(id, {
          useBrowserSelection: true
        });
      }, SHARE_COMMAND);

      const shareSelectedFilesButton = page.getByRole('button', {
        name: 'Share Selected Files',
        exact: true
      });
      await expect(shareSelectedFilesButton).toBeVisible();
      await expect(
        page.getByRole('checkbox', {
          name: FOLDER_SHARE_DISABLE_DIALOG_CHECKBOX_LABEL
        })
      ).toHaveCount(0);

      const imageCheckbox = page
        .locator('label', { hasText: /^icon\.png \(/ })
        .locator('input[type="checkbox"]');
      await expect(imageCheckbox).toBeVisible();
      await expect(imageCheckbox).not.toBeChecked();
      await imageCheckbox.check();
      await expect(imageCheckbox).toBeChecked();

      await shareSelectedFilesButton.click();
      const result = await sharePromise;
      expect(result.ok).toBe(true);
      expect(result.sourcePath).toBe(folderPath);
      expect(result.link).toContain('plugin=');
    });
  });

  test.describe('limit-only', () => {
    test.use({
      mockSettings: {
        ...galata.DEFAULT_SETTINGS,
        [PLAYGROUND_PLUGIN_ID]: {
          shareFolderSelectionDialogMode: 'limit-only'
        }
      }
    });

    test('skips file selection dialog when only auto-excluded files are omitted', async ({
      page,
      tmpPath
    }) => {
      const projectRoot = `${tmpPath}/share-folder-limit-only-mode-test`;
      const folderPath = `${projectRoot}/src`;
      const sourcePath = `${folderPath}/index.ts`;
      const imagePath = `${folderPath}/icon.png`;

      await page.contents.uploadContent(TEST_PLUGIN_SOURCE, 'text', sourcePath);
      await page.contents.uploadContent('not-a-real-png', 'text', imagePath);
      await page.goto();

      await page.waitForCondition(() =>
        page.evaluate((id: string) => {
          return window.jupyterapp.commands.hasCommand(id);
        }, SHARE_COMMAND)
      );

      await page.filebrowser.openDirectory(projectRoot);
      const browserSection = page.getByRole('region', {
        name: 'File Browser Section'
      });
      const folderItem = browserSection.getByRole('listitem', {
        name: /^Name: src/
      });
      await folderItem.click();

      const result = await page.evaluate((id: string) => {
        return window.jupyterapp.commands.execute(id, {
          useBrowserSelection: true
        });
      }, SHARE_COMMAND);

      expect(result.ok).toBe(true);
      expect(result.sourcePath).toBe(folderPath);
      expect(result.link).toContain('plugin=');
      await expect(
        page.getByRole('button', {
          name: 'Share Selected Files',
          exact: true
        })
      ).toHaveCount(0);
    });

    test('opens selection dialog from size-limit notification action', async ({
      page,
      tmpPath
    }) => {
      const projectRoot = `${tmpPath}/share-folder-limit-only-overflow-test`;
      const folderPath = `${projectRoot}/src`;
      const sourcePath = `${folderPath}/index.ts`;
      const helperPath = `${folderPath}/helper.ts`;
      const indexSource = Array.from(
        { length: 4000 },
        (_, index) => `${index.toString(36)}|`
      ).join('');
      const helperSource = Array.from(
        { length: 4000 },
        (_, index) => `${(index + 5000).toString(36)}#`
      ).join('');

      await page.contents.uploadContent(indexSource, 'text', sourcePath);
      await page.contents.uploadContent(helperSource, 'text', helperPath);
      await page.goto();

      await page.waitForCondition(() =>
        page.evaluate((id: string) => {
          return window.jupyterapp.commands.hasCommand(id);
        }, SHARE_COMMAND)
      );

      await page.filebrowser.openDirectory(projectRoot);
      const browserSection = page.getByRole('region', {
        name: 'File Browser Section'
      });
      const folderItem = browserSection.getByRole('listitem', {
        name: /^Name: src/
      });
      await folderItem.click();

      const initialResult = await page.evaluate((id: string) => {
        return window.jupyterapp.commands.execute(id, {
          useBrowserSelection: true
        });
      }, SHARE_COMMAND);

      expect(initialResult.ok).toBe(false);
      expect(initialResult.sourcePath).toBe(folderPath);
      expect(initialResult.message).toContain('exceeds the configured limit');

      await page.waitForFunction(() => {
        const button = Array.from(
          document.querySelectorAll('button.jp-toast-button')
        ).find(
          element =>
            element instanceof HTMLButtonElement &&
            element.textContent?.trim() === 'Select files'
        );
        if (!(button instanceof HTMLButtonElement)) {
          return false;
        }
        button.click();
        return true;
      });

      const shareSelectedFilesButton = page.getByRole('button', {
        name: 'Share Selected Files',
        exact: true
      });
      await expect(shareSelectedFilesButton).toBeVisible();

      const helperCheckbox = page
        .locator('label', { hasText: /^helper\.ts \(/ })
        .locator('input[type="checkbox"]');
      await expect(helperCheckbox).toBeVisible();
      await helperCheckbox.uncheck();
      await shareSelectedFilesButton.click();

      await expect(
        page.getByText(
          new RegExp(
            `Copied a share link for "${escapeRegExp(folderPath)}" \\(`
          )
        )
      ).toBeVisible();
    });
  });
});

test('shows toolbar share dropdown package option availability', async ({
  page,
  tmpPath
}) => {
  const projectRoot = `${tmpPath}/share-toolbar-dropdown-test`;
  const sourcePath = `${projectRoot}/src/index.ts`;
  const packageJsonPath = `${projectRoot}/package.json`;

  await page.contents.uploadContent(TEST_PLUGIN_SOURCE, 'text', sourcePath);
  await page.goto();
  await page.filebrowser.open(sourcePath);
  expect(await page.activity.activateTab('index.ts')).toBe(true);

  const shareToolbarButton = page.locator(
    '.jp-PluginPlayground-shareDropdownButton'
  );
  await expect(shareToolbarButton).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share file' })).toBeVisible();

  await shareToolbarButton.click();
  const singleFileMenuItem = page
    .locator('[role="menuitem"], [role="menuitemcheckbox"]')
    .filter({ hasText: /^Share (Single )?File$/ });
  await expect(singleFileMenuItem).toBeVisible();
  const disabledPackageMenuItem = page
    .locator('[role="menuitem"], [role="menuitemcheckbox"]')
    .filter({ hasText: /^Share Package$/ });
  await expect(disabledPackageMenuItem).toBeVisible();
  await expect(disabledPackageMenuItem).toHaveClass(/lm-mod-disabled/);
  await page.keyboard.press('Escape');

  await page.contents.uploadContent(
    JSON.stringify({ name: 'share-toolbar-dropdown-test', version: '0.1.0' }),
    'text',
    packageJsonPath
  );

  await shareToolbarButton.click();
  const packageMenuItem = page
    .locator('[role="menuitem"], [role="menuitemcheckbox"]')
    .filter({ hasText: /^Share Package$/ });
  await expect(packageMenuItem).toBeVisible();
  await expect(packageMenuItem).not.toHaveClass(/lm-mod-disabled/);
  await packageMenuItem.click();
  await expect(
    page.getByRole('button', { name: 'Share package' })
  ).toBeVisible();

  const shareSelectedFilesButton = page.getByRole('button', {
    name: 'Share Selected Files',
    exact: true
  });
  await expect(shareSelectedFilesButton).toBeHidden();
  await page.getByRole('button', { name: 'Share package' }).click();
  await expect(shareSelectedFilesButton).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('shows share action in file browser context menu for file and folder', async ({
  page,
  tmpPath
}) => {
  const projectRoot = `${tmpPath}/share-context-menu-test`;
  const filePath = `${projectRoot}/README.md`;
  const folderPath = `${projectRoot}/src`;
  const sourcePath = `${folderPath}/index.ts`;

  await page.contents.uploadContent('# Context Menu Test\n', 'text', filePath);
  await page.contents.uploadContent(TEST_PLUGIN_SOURCE, 'text', sourcePath);
  await page.goto();
  await page.filebrowser.openDirectory(projectRoot);

  const browserSection = page.getByRole('region', {
    name: 'File Browser Section'
  });
  const shareMenuItem = page.getByRole('menuitem', {
    name: 'Copy Shareable Plugin Link',
    exact: true
  });

  const fileItem = browserSection.getByRole('listitem', {
    name: /^Name: README\.md/
  });
  await fileItem.click({ button: 'right' });
  await expect(shareMenuItem).toBeVisible();
  await page.keyboard.press('Escape');

  const folderItem = browserSection.getByRole('listitem', {
    name: /^Name: src/
  });
  await folderItem.click({ button: 'right' });
  await expect(shareMenuItem).toBeVisible();
  await page.keyboard.press('Escape');
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
    `import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'token-sidebar-test:plugin',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    void app;
  }
};

export default plugin;
`,
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
  const expectedDependency = `requires: [${tokenSymbol}]`;
  const expectedParameterName = parameterNameFromToken(tokenSymbol);
  const expectedTokenPattern = escapeRegExp(tokenSymbol);
  const expectedParameterPattern = escapeRegExp(expectedParameterName);
  const expectedPackagePattern = escapeRegExp(packageName);
  const expectedImportPattern = `import\\s*\\{[^}]*\\b${expectedTokenPattern}\\b[^}]*\\}\\s*from\\s*['"]${expectedPackagePattern}['"]\\s*;`;

  await page.waitForFunction(
    ({
      expectedImportSourcePattern,
      expectedDependencyStatement,
      expectedToken,
      expectedParameter
    }) => {
      const current = window.jupyterapp.shell
        .currentWidget as FileEditorWidget | null;
      const source = current?.content.model.sharedModel.getSource();
      if (typeof source !== 'string') {
        return false;
      }
      const activatePattern = new RegExp(
        `activate:\\s*\\(app:\\s*JupyterFrontEnd,\\s*${expectedParameter}\\s*:\\s*${expectedToken}\\)`
      );
      return (
        new RegExp(expectedImportSourcePattern).test(source) &&
        source.includes(expectedDependencyStatement) &&
        activatePattern.test(source)
      );
    },
    {
      expectedImportSourcePattern: expectedImportPattern,
      expectedDependencyStatement: expectedDependency,
      expectedToken: expectedTokenPattern,
      expectedParameter: expectedParameterPattern
    }
  );

  await page.waitForFunction(() => {
    const highlightedLines = document.querySelectorAll(
      '.jp-FileEditor .jp-PluginPlayground-lineHighlight'
    ).length;
    return highlightedLines === 0;
  });
  await importButton.click();
  await page.waitForFunction(
    ({ expectedPackage, expectedTokenSymbol, expectedDependencyStatement }) => {
      const current = window.jupyterapp.shell
        .currentWidget as FileEditorWidget | null;
      const source = current?.content.model.sharedModel.getSource();
      if (typeof source !== 'string') {
        return false;
      }
      const packageImportPattern = new RegExp(
        `import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${expectedPackage}['"]\\s*;`,
        'g'
      );
      let canonicalSpecifierCount = 0;
      let match = packageImportPattern.exec(source);
      while (match) {
        const specifiers = match[1]
          .split(',')
          .map(specifier => specifier.trim())
          .filter(specifier => specifier.length > 0);
        canonicalSpecifierCount += specifiers.filter(
          specifier => specifier === expectedTokenSymbol
        ).length;
        match = packageImportPattern.exec(source);
      }
      const highlightedLines = document.querySelectorAll(
        '.jp-FileEditor .jp-PluginPlayground-lineHighlight'
      ).length;
      return (
        canonicalSpecifierCount === 1 &&
        source.split(expectedDependencyStatement).length - 1 === 1 &&
        highlightedLines >= 2
      );
    },
    {
      expectedPackage: expectedPackagePattern,
      expectedTokenSymbol: tokenSymbol,
      expectedDependencyStatement: expectedDependency
    }
  );
});

test('token sidebar inserts canonical token import when alias import exists', async ({
  page,
  tmpPath
}) => {
  const editorPath = `${tmpPath}/token-sidebar-alias-import.ts`;

  await page.contents.uploadContent(
    `import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'token-sidebar-alias-test:plugin',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    void app;
  }
};

export default plugin;
`,
    'text',
    editorPath
  );
  await page.goto();
  await page.filebrowser.open(editorPath);
  expect(await page.activity.activateTab('token-sidebar-alias-import.ts')).toBe(
    true
  );

  const section = await openSidebarPanel(page, TOKEN_SECTION_ID);
  const tokenName = await findImportableToken(section);
  const filterInput = section.getByPlaceholder('Filter token strings');
  await filterInput.fill(tokenName);
  const tokenListItem = section.locator('.jp-PluginPlayground-listItem');
  await expect(tokenListItem).toHaveCount(1);

  const separatorIndex = tokenName.indexOf(':');
  const packageName = tokenName.slice(0, separatorIndex).trim();
  const tokenSymbol = tokenName.slice(separatorIndex + 1).trim();

  await page.evaluate(
    ({ packageName: pkg, symbol }) => {
      const current = window.jupyterapp.shell
        .currentWidget as FileEditorWidget | null;
      if (!current) {
        return;
      }
      const model = current.content.model.sharedModel;
      const currentSource = model.getSource();
      model.setSource(
        `import { ${symbol} as existingAlias } from '${pkg}';\n${currentSource}`
      );
    },
    { packageName, symbol: tokenSymbol }
  );

  const importButton = tokenListItem.locator(
    '.jp-PluginPlayground-importButton'
  );
  await expect(importButton).toBeEnabled();
  await importButton.click();

  const expectedPackagePattern = escapeRegExp(packageName);
  const aliasImport = `${tokenSymbol} as existingAlias`;
  const expectedDependency = `requires: [${tokenSymbol}]`;
  await page.waitForFunction(
    ({
      expectedPackage,
      expectedTokenSymbol,
      aliasImportStatement,
      expectedDependencyStatement
    }) => {
      const current = window.jupyterapp.shell
        .currentWidget as FileEditorWidget | null;
      const source = current?.content.model.sharedModel.getSource();
      if (typeof source !== 'string') {
        return false;
      }
      const packageImportPattern = new RegExp(
        `import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${expectedPackage}['"]\\s*;`,
        'g'
      );
      let hasAliasImport = false;
      let canonicalSpecifierCount = 0;
      let match = packageImportPattern.exec(source);
      while (match) {
        const specifiers = match[1]
          .split(',')
          .map(specifier => specifier.trim())
          .filter(specifier => specifier.length > 0);
        hasAliasImport =
          hasAliasImport || specifiers.includes(aliasImportStatement);
        canonicalSpecifierCount += specifiers.filter(
          specifier => specifier === expectedTokenSymbol
        ).length;
        match = packageImportPattern.exec(source);
      }
      return (
        hasAliasImport &&
        canonicalSpecifierCount >= 1 &&
        source.includes(expectedDependencyStatement)
      );
    },
    {
      expectedPackage: expectedPackagePattern,
      expectedTokenSymbol: tokenSymbol,
      aliasImportStatement: aliasImport,
      expectedDependencyStatement: expectedDependency
    }
  );
});

test('token sidebar briefly highlights changed lines after insertion', async ({
  page,
  tmpPath
}) => {
  const editorPath = `${tmpPath}/token-sidebar-highlight.ts`;

  await page.contents.uploadContent(
    `import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'token-sidebar-highlight-test:plugin',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    void app;
  }
};

export default plugin;
`,
    'text',
    editorPath
  );

  await page.goto();
  await page.filebrowser.open(editorPath);
  expect(await page.activity.activateTab('token-sidebar-highlight.ts')).toBe(
    true
  );

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
  const tokenSymbol = tokenName.slice(separatorIndex + 1).trim();
  const expectedParameterName = parameterNameFromToken(tokenSymbol);

  await page.waitForFunction(
    ({ expectedToken, expectedParameter }) => {
      const current = window.jupyterapp.shell
        .currentWidget as FileEditorWidget | null;
      const source = current?.content.model.sharedModel.getSource();
      if (typeof source !== 'string') {
        return false;
      }
      const activatePattern = new RegExp(
        `activate:\\s*\\(app:\\s*JupyterFrontEnd,\\s*${expectedParameter}\\s*:\\s*${expectedToken}\\)`
      );
      const highlightedLines = document.querySelectorAll(
        '.jp-FileEditor .jp-PluginPlayground-lineHighlight'
      ).length;
      return activatePattern.test(source) && highlightedLines >= 2;
    },
    {
      expectedToken: escapeRegExp(tokenSymbol),
      expectedParameter: escapeRegExp(expectedParameterName)
    }
  );
});

test('token sidebar avoids dependency edits for non-array requires property', async ({
  page,
  tmpPath
}) => {
  const editorPath = `${tmpPath}/token-sidebar-non-array-requires.ts`;

  await page.contents.uploadContent(
    `import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';

const requiredServices: unknown[] = [];
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'token-sidebar-non-array-test:plugin',
  autoStart: true,
  requires: requiredServices,
  activate: (app: JupyterFrontEnd) => {
    void app;
  }
};

export default plugin;
`,
    'text',
    editorPath
  );
  await page.goto();
  await page.filebrowser.open(editorPath);
  expect(
    await page.activity.activateTab('token-sidebar-non-array-requires.ts')
  ).toBe(true);

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
  const expectedPackagePattern = escapeRegExp(packageName);
  const expectedTokenPattern = escapeRegExp(tokenSymbol);
  const expectedImportPattern = `import\\s*\\{[^}]*\\b${expectedTokenPattern}\\b[^}]*\\}\\s*from\\s*['"]${expectedPackagePattern}['"]\\s*;`;

  await page.waitForFunction(
    ({ expectedImportSourcePattern, token }) => {
      const current = window.jupyterapp.shell
        .currentWidget as FileEditorWidget | null;
      const source = current?.content.model.sharedModel.getSource();
      if (typeof source !== 'string') {
        return false;
      }
      return (
        new RegExp(expectedImportSourcePattern).test(source) &&
        source.includes('requires: requiredServices') &&
        source.split('requires:').length - 1 === 1 &&
        !source.includes(`requires: [${token}]`) &&
        /activate:\s*\(app:\s*JupyterFrontEnd\)/.test(source)
      );
    },
    {
      expectedImportSourcePattern: expectedImportPattern,
      token: tokenSymbol
    }
  );
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

  const loadCommandArgumentsButton = panel.locator(
    '.jp-PluginPlayground-argumentBadgeButton'
  );
  await expect(loadCommandArgumentsButton).toBeDisabled();
  await expect(loadCommandArgumentsButton).toHaveAttribute(
    'title',
    'Argument documentation unavailable'
  );

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
  await expect(showArgsButton).toBeEnabled();
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

test('commands tab inserts command execution at cursor position', async ({
  page,
  tmpPath
}) => {
  const editorPath = `${tmpPath}/command-sidebar-insert.ts`;

  await page.contents.uploadContent(
    `import { JupyterFrontEnd } from '@jupyterlab/application';

const run = (application: JupyterFrontEnd) => {

  const marker = 1;
  void marker;
};
`,
    'text',
    editorPath
  );
  await page.goto();
  await page.filebrowser.open(editorPath);
  expect(await page.activity.activateTab('command-sidebar-insert.ts')).toBe(
    true
  );

  await page.evaluate(() => {
    const current = window.jupyterapp.shell.currentWidget as FileEditorWidget;
    const editor = current.content.editor;
    editor.setCursorPosition({
      line: 3,
      column: 2
    });
    editor.focus();
  });

  const expectedSourceAfterInsert = await page.evaluate((commandId: string) => {
    const current = window.jupyterapp.shell.currentWidget as FileEditorWidget;
    const editor = current.content.editor;
    const source = current.content.model.sharedModel.getSource();
    const insertionOffset = editor.getOffsetAt(editor.getCursorPosition());
    const inserted = `app.commands.execute('${commandId}');`;
    return `${source.slice(0, insertionOffset)}${inserted}${source.slice(
      insertionOffset
    )}`;
  }, LOAD_COMMAND);

  const panel = await openSidebarPanel(page, TOKEN_SECTION_ID);
  await panel.getByRole('tab', { name: 'Commands', exact: true }).click();

  const filterInput = panel.getByPlaceholder('Filter command ids');
  await filterInput.fill(LOAD_COMMAND);
  const commandListItem = panel.locator('.jp-PluginPlayground-listItem');
  await expect(commandListItem).toHaveCount(1);

  const insertButton = commandListItem.locator(
    '.jp-PluginPlayground-commandInsertButton'
  );
  await expect(insertButton).toBeEnabled();
  await insertButton.click();

  await page.waitForFunction((expected: string) => {
    const current = window.jupyterapp.shell.currentWidget as FileEditorWidget;
    const source = current.content.model.sharedModel.getSource();
    return source === expected;
  }, expectedSourceAfterInsert);
});

test('commands tab can prompt JupyterLite AI and remember last insertion mode', async ({
  page,
  tmpPath
}) => {
  const editorPath = `${tmpPath}/command-sidebar-ai-prompt.ts`;

  await page.contents.uploadContent(
    `import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';

const extension: JupyterFrontEndPlugin<void> = {
  id: 'command-sidebar-ai-prompt:plugin',
  autoStart: true,
  activate: activate
};

function activate(app: JupyterFrontEnd): void {
  const marker = 1;
  void marker;
};

export default extension;
`,
    'text',
    editorPath
  );
  await page.goto();
  await page.filebrowser.open(editorPath);
  expect(await page.activity.activateTab('command-sidebar-ai-prompt.ts')).toBe(
    true
  );

  await ensureMockJupyterLiteAIChat(page);

  await page.evaluate(() => {
    const current = window.jupyterapp.shell.currentWidget as FileEditorWidget;
    const editor = current.content.editor;
    editor.setCursorPosition({
      line: 9,
      column: 2
    });
    editor.focus();
  });

  const sourceBefore = await page.evaluate(() => {
    const current = window.jupyterapp.shell.currentWidget as FileEditorWidget;
    return current.content.model.sharedModel.getSource();
  });
  const suggestedSnippet = `app.commands.execute('${LOAD_COMMAND}');`;
  const chatInput = page.locator(
    '.jp-chat-input-textfield[data-playground-test="ai-input"] textarea'
  );

  const panel = await openSidebarPanel(page, TOKEN_SECTION_ID);
  await panel.getByRole('tab', { name: 'Commands', exact: true }).click();
  await panel.getByPlaceholder('Filter command ids').fill(LOAD_COMMAND);
  const commandListItem = panel.locator('.jp-PluginPlayground-listItem');
  await expect(commandListItem).toHaveCount(1);

  const modeMenuButton = commandListItem.locator(
    '.jp-PluginPlayground-commandInsertMenuButton'
  );
  const primaryInsertButton = commandListItem.locator(
    '.jp-PluginPlayground-commandInsertButton'
  );
  await expect(modeMenuButton).toBeEnabled();
  await expect(primaryInsertButton).toBeEnabled();
  await modeMenuButton.click();
  await page.getByRole('menuitem', { name: 'Prompt AI to insert' }).click();
  await primaryInsertButton.click();

  await expect(chatInput).toHaveValue(
    new RegExp(escapeRegExp(`Command ID: ${LOAD_COMMAND}`))
  );
  await expect(chatInput).toHaveValue(
    new RegExp(escapeRegExp(`Suggested command call: ${suggestedSnippet}`))
  );
  await expect(chatInput).toHaveValue(
    new RegExp(escapeRegExp('Use the activate() app variable: app.'))
  );
  await expect
    .poll(async () =>
      chatInput.evaluate(input => {
        if (!(input instanceof HTMLTextAreaElement)) {
          return false;
        }
        return input.selectionStart === input.value.length;
      })
    )
    .toBe(true);
  await expect(chatInput).not.toHaveValue(
    new RegExp(
      escapeRegExp(
        'If app is missing, add JupyterFrontEnd import and declare activate(app: JupyterFrontEnd, ...).'
      )
    )
  );

  const sourceAfterAIAction = await page.evaluate(() => {
    const current = window.jupyterapp.shell.currentWidget as FileEditorWidget;
    return current.content.model.sharedModel.getSource();
  });
  expect(sourceAfterAIAction).toBe(sourceBefore);

  await chatInput.fill('');

  await primaryInsertButton.click();

  await expect(chatInput).toHaveValue(
    new RegExp(escapeRegExp(`Command ID: ${LOAD_COMMAND}`))
  );
  await expect(chatInput).toHaveValue(
    new RegExp(escapeRegExp(`Suggested command call: ${suggestedSnippet}`))
  );

  const sourceAfterSecondAction = await page.evaluate(() => {
    const current = window.jupyterapp.shell.currentWidget as FileEditorWidget;
    return current.content.model.sharedModel.getSource();
  });
  expect(sourceAfterSecondAction).toBe(sourceBefore);
  await page.evaluate(() => {
    document
      .querySelector(
        '.jp-chat-input-textfield[data-playground-test="ai-input"]'
      )
      ?.remove();
  });
});

test('commands tab AI prompt includes command argument schema when available', async ({
  page,
  tmpPath
}) => {
  const editorPath = `${tmpPath}/command-sidebar-ai-prompt-args.ts`;

  await page.contents.uploadContent(
    `import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';

const extension: JupyterFrontEndPlugin<void> = {
  id: 'command-sidebar-ai-prompt-args:plugin',
  autoStart: true,
  activate: activate
};

function activate(app: JupyterFrontEnd): void {
  const marker = 1;
  void marker;
}

export default extension;
`,
    'text',
    editorPath
  );
  await page.goto();
  await page.filebrowser.open(editorPath);
  expect(
    await page.activity.activateTab('command-sidebar-ai-prompt-args.ts')
  ).toBe(true);

  await ensureMockJupyterLiteAIChat(page);

  await page.evaluate((commandId: string) => {
    const commands = window.jupyterapp.commands;
    if (!commands.hasCommand(commandId)) {
      commands.addCommand(commandId, {
        label: 'Playground command with args',
        usage: () =>
          `app.commands.execute('${commandId}', { path: '/tmp/example.ts' });`,
        describedBy: {
          args: {
            type: 'object',
            required: ['path'],
            properties: {
              path: {
                type: 'string',
                description: 'Path to open.'
              },
              factory: {
                type: 'string',
                description: 'Widget factory name.'
              }
            }
          }
        },
        execute: () => undefined
      });
    }
  }, TEST_ARGS_COMMAND);

  await page.evaluate(() => {
    const current = window.jupyterapp.shell.currentWidget as FileEditorWidget;
    const editor = current.content.editor;
    editor.setCursorPosition({
      line: 9,
      column: 2
    });
    editor.focus();
  });

  const chatInput = page.locator(
    '.jp-chat-input-textfield[data-playground-test="ai-input"] textarea'
  );

  const panel = await openSidebarPanel(page, TOKEN_SECTION_ID);
  await panel.getByRole('tab', { name: 'Commands', exact: true }).click();
  await panel.getByPlaceholder('Filter command ids').fill(TEST_ARGS_COMMAND);
  const commandListItem = panel.locator('.jp-PluginPlayground-listItem');
  await expect(commandListItem).toHaveCount(1);

  const modeMenuButton = commandListItem.locator(
    '.jp-PluginPlayground-commandInsertMenuButton'
  );
  const primaryInsertButton = commandListItem.locator(
    '.jp-PluginPlayground-commandInsertButton'
  );
  await expect(modeMenuButton).toBeEnabled();
  await expect(primaryInsertButton).toBeEnabled();
  await modeMenuButton.click();
  await page.getByRole('menuitem', { name: 'Prompt AI to insert' }).click();
  await primaryInsertButton.click();

  await expect(chatInput).toHaveValue(
    new RegExp(escapeRegExp(`Command ID: ${TEST_ARGS_COMMAND}`))
  );
  await expect(chatInput).toHaveValue(/Command Arguments:/);
  await expect(chatInput).toHaveValue(/Arguments Schema:/);
  await expect(chatInput).toHaveValue(/"path"/);
  await expect(chatInput).toHaveValue(/"factory"/);

  await page.evaluate(() => {
    document
      .querySelector(
        '.jp-chat-input-textfield[data-playground-test="ai-input"]'
      )
      ?.remove();
  });
});

test('commands tab AI prompt detects activate app in default-export plugin arrays', async ({
  page,
  tmpPath
}) => {
  const editorPath = `${tmpPath}/command-sidebar-ai-prompt-array.ts`;

  await page.contents.uploadContent(
    `import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';

const simple: JupyterFrontEndPlugin<void> = {
  id: 'command-sidebar-ai-prompt-array:simple',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    const marker = 1;
    void marker;
  }
};

const advanced: JupyterFrontEndPlugin<void> = {
  id: 'command-sidebar-ai-prompt-array:advanced',
  autoStart: true,
  activate: (app: JupyterFrontEnd, palette: unknown) => {
    void app;
    void palette;
  }
};

export default [advanced, simple];
`,
    'text',
    editorPath
  );
  await page.goto();
  await page.filebrowser.open(editorPath);
  expect(
    await page.activity.activateTab('command-sidebar-ai-prompt-array.ts')
  ).toBe(true);

  await ensureMockJupyterLiteAIChat(page);

  await page.evaluate(() => {
    const current = window.jupyterapp.shell.currentWidget as FileEditorWidget;
    const editor = current.content.editor;
    editor.setCursorPosition({
      line: 6,
      column: 4
    });
    editor.focus();
  });

  const sourceBefore = await page.evaluate(() => {
    const current = window.jupyterapp.shell.currentWidget as FileEditorWidget;
    return current.content.model.sharedModel.getSource();
  });
  const suggestedSnippet = `app.commands.execute('${LOAD_COMMAND}');`;
  const chatInput = page.locator(
    '.jp-chat-input-textfield[data-playground-test="ai-input"] textarea'
  );

  const panel = await openSidebarPanel(page, TOKEN_SECTION_ID);
  await panel.getByRole('tab', { name: 'Commands', exact: true }).click();
  await panel.getByPlaceholder('Filter command ids').fill(LOAD_COMMAND);
  const commandListItem = panel.locator('.jp-PluginPlayground-listItem');
  await expect(commandListItem).toHaveCount(1);

  const modeMenuButton = commandListItem.locator(
    '.jp-PluginPlayground-commandInsertMenuButton'
  );
  const primaryInsertButton = commandListItem.locator(
    '.jp-PluginPlayground-commandInsertButton'
  );
  await expect(modeMenuButton).toBeEnabled();
  await expect(primaryInsertButton).toBeEnabled();
  await modeMenuButton.click();
  await page.getByRole('menuitem', { name: 'Prompt AI to insert' }).click();
  await primaryInsertButton.click();

  await expect(chatInput).toHaveValue(
    new RegExp(escapeRegExp(`Command ID: ${LOAD_COMMAND}`))
  );
  await expect(chatInput).toHaveValue(
    new RegExp(escapeRegExp(`Suggested command call: ${suggestedSnippet}`))
  );
  await expect(chatInput).toHaveValue(
    new RegExp(escapeRegExp('Use the activate() app variable: app.'))
  );
  await expect(chatInput).not.toHaveValue(
    new RegExp(
      escapeRegExp(
        'If app is missing, add JupyterFrontEnd import and declare activate(app: JupyterFrontEnd, ...).'
      )
    )
  );

  const sourceAfterAIAction = await page.evaluate(() => {
    const current = window.jupyterapp.shell.currentWidget as FileEditorWidget;
    return current.content.model.sharedModel.getSource();
  });
  expect(sourceAfterAIAction).toBe(sourceBefore);
  await page.evaluate(() => {
    document
      .querySelector(
        '.jp-chat-input-textfield[data-playground-test="ai-input"]'
      )
      ?.remove();
  });
});

test('commands tab AI prompt detects activate app in exported plugin array variables', async ({
  page,
  tmpPath
}) => {
  const editorPath = `${tmpPath}/command-sidebar-ai-prompt-plugins-var.ts`;

  await page.contents.uploadContent(
    `import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';

const simple: JupyterFrontEndPlugin<void> = {
  id: 'command-sidebar-ai-prompt-plugins-var:simple',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    const marker = 1;
    void marker;
  }
};

const advanced: JupyterFrontEndPlugin<void> = {
  id: 'command-sidebar-ai-prompt-plugins-var:advanced',
  autoStart: true,
  activate: (app: JupyterFrontEnd, palette: unknown) => {
    void app;
    void palette;
  }
};

const plugins: JupyterFrontEndPlugin<void>[] = [advanced, simple];
export default plugins;
`,
    'text',
    editorPath
  );
  await page.goto();
  await page.filebrowser.open(editorPath);
  expect(
    await page.activity.activateTab('command-sidebar-ai-prompt-plugins-var.ts')
  ).toBe(true);

  await ensureMockJupyterLiteAIChat(page);

  await page.evaluate(() => {
    const current = window.jupyterapp.shell.currentWidget as FileEditorWidget;
    const editor = current.content.editor;
    editor.setCursorPosition({
      line: 6,
      column: 4
    });
    editor.focus();
  });

  const sourceBefore = await page.evaluate(() => {
    const current = window.jupyterapp.shell.currentWidget as FileEditorWidget;
    return current.content.model.sharedModel.getSource();
  });
  const suggestedSnippet = `app.commands.execute('${LOAD_COMMAND}');`;
  const chatInput = page.locator(
    '.jp-chat-input-textfield[data-playground-test="ai-input"] textarea'
  );

  const panel = await openSidebarPanel(page, TOKEN_SECTION_ID);
  await panel.getByRole('tab', { name: 'Commands', exact: true }).click();
  await panel.getByPlaceholder('Filter command ids').fill(LOAD_COMMAND);
  const commandListItem = panel.locator('.jp-PluginPlayground-listItem');
  await expect(commandListItem).toHaveCount(1);

  const modeMenuButton = commandListItem.locator(
    '.jp-PluginPlayground-commandInsertMenuButton'
  );
  const primaryInsertButton = commandListItem.locator(
    '.jp-PluginPlayground-commandInsertButton'
  );
  await expect(modeMenuButton).toBeEnabled();
  await expect(primaryInsertButton).toBeEnabled();
  await modeMenuButton.click();
  await page.getByRole('menuitem', { name: 'Prompt AI to insert' }).click();
  await primaryInsertButton.click();

  await expect(chatInput).toHaveValue(
    new RegExp(escapeRegExp(`Command ID: ${LOAD_COMMAND}`))
  );
  await expect(chatInput).toHaveValue(
    new RegExp(escapeRegExp(`Suggested command call: ${suggestedSnippet}`))
  );
  await expect(chatInput).toHaveValue(
    new RegExp(escapeRegExp('Use the activate() app variable: app.'))
  );
  await expect(chatInput).not.toHaveValue(
    new RegExp(
      escapeRegExp(
        'If app is missing, add JupyterFrontEnd import and declare activate(app: JupyterFrontEnd, ...).'
      )
    )
  );

  const sourceAfterAIAction = await page.evaluate(() => {
    const current = window.jupyterapp.shell.currentWidget as FileEditorWidget;
    return current.content.model.sharedModel.getSource();
  });
  expect(sourceAfterAIAction).toBe(sourceBefore);
  await page.evaluate(() => {
    document
      .querySelector(
        '.jp-chat-input-textfield[data-playground-test="ai-input"]'
      )
      ?.remove();
  });
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

test('per-file load-on-save toggle is off by default and enables auto-load', async ({
  page,
  tmpPath
}) => {
  const pluginPath = `${tmpPath}/${TEST_FILE}`;

  await page.contents.uploadContent(TEST_PLUGIN_SOURCE, 'text', pluginPath);
  await page.goto();
  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, LOAD_COMMAND)
  );

  await page.filebrowser.open(pluginPath);
  expect(await page.activity.activateTab(TEST_FILE)).toBe(true);

  const loadOnSaveToggle = await findLoadOnSaveToggle(page);
  const loadOnSaveToggleLabel = await findLoadOnSaveToggleLabel(page);
  await expect(loadOnSaveToggle).toHaveAttribute('aria-pressed', 'false');
  await loadOnSaveToggleLabel.click();
  await expect(loadOnSaveToggle).toHaveAttribute('aria-pressed', 'true');

  await focusActiveEditor(page);
  await page.keyboard.press('Space');
  await page.keyboard.press('Backspace');
  await page.evaluate(() => {
    return window.jupyterapp.commands.execute('docmanager:save');
  });

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
});

test('hides run controls in non-JS/TS files', async ({ page, tmpPath }) => {
  const pluginPath = `${tmpPath}/${TEST_FILE}`;
  const readmePath = `${tmpPath}/README.md`;

  await page.contents.uploadContent(TEST_PLUGIN_SOURCE, 'text', pluginPath);
  await page.contents.uploadContent(
    '# Playground\n\nThis is not a runnable plugin source file.\n',
    'text',
    readmePath
  );
  await page.goto();
  await page.waitForCondition(() =>
    page.evaluate((id: string) => {
      return window.jupyterapp.commands.hasCommand(id);
    }, LOAD_COMMAND)
  );

  const getCurrentRunControlsVisibility = async (): Promise<{
    runVisible: boolean;
    loadOnSaveVisible: boolean;
  }> => {
    return page.evaluate((label: string) => {
      const isElementVisible = (element: HTMLElement | null): boolean => {
        if (!element) {
          return false;
        }
        const style = window.getComputedStyle(element);
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          element.getClientRects().length > 0
        );
      };
      const current = window.jupyterapp.shell.currentWidget as FileEditorWidget;
      const root = current?.node as HTMLElement | undefined;
      if (!root) {
        return { runVisible: false, loadOnSaveVisible: false };
      }
      const runItem = root.querySelector(
        '.jp-Toolbar > .jp-Toolbar-item[data-jp-item-name="load-as-extension"]'
      ) as HTMLElement | null;
      const loadOnSaveButton = root.querySelector(
        `button[aria-label="${label}"]`
      ) as HTMLElement | null;
      return {
        runVisible: isElementVisible(runItem),
        loadOnSaveVisible: isElementVisible(loadOnSaveButton)
      };
    }, LOAD_ON_SAVE_CHECKBOX_LABEL);
  };

  await page.filebrowser.open(pluginPath);
  expect(await page.activity.activateTab(TEST_FILE)).toBe(true);
  await expect
    .poll(async () => {
      return getCurrentRunControlsVisibility();
    })
    .toEqual({ runVisible: true, loadOnSaveVisible: true });

  await page.filebrowser.open(readmePath);
  expect(await page.activity.activateTab('README.md')).toBe(true);
  await expect
    .poll(async () => {
      return getCurrentRunControlsVisibility();
    })
    .toEqual({ runVisible: false, loadOnSaveVisible: false });
});

test.describe('load-on-save setting', () => {
  test.use({
    mockSettings: {
      ...galata.DEFAULT_SETTINGS,
      [PLAYGROUND_PLUGIN_ID]: {
        loadOnSave: true
      }
    }
  });

  test('auto-loads plugin when loadOnSave setting is enabled and file is saved', async ({
    page,
    tmpPath
  }) => {
    const pluginPath = `${tmpPath}/${TEST_FILE}`;

    await page.contents.uploadContent(TEST_PLUGIN_SOURCE, 'text', pluginPath);
    await page.goto();

    await page.waitForCondition(() =>
      page.evaluate((id: string) => {
        return window.jupyterapp.commands.hasCommand(id);
      }, LOAD_COMMAND)
    );

    await page.filebrowser.open(pluginPath);
    expect(await page.activity.activateTab(TEST_FILE)).toBe(true);
    const loadOnSaveToggle = page.getByRole('button', {
      name: LOAD_ON_SAVE_CHECKBOX_LABEL,
      includeHidden: true
    });
    await expect(loadOnSaveToggle).toBeAttached();
    await expect(loadOnSaveToggle).toBeHidden();

    // Make the editor dirty so save reliably emits a completed saveState.
    await focusActiveEditor(page);
    await page.keyboard.press('Space');
    await page.keyboard.press('Backspace');

    await page.evaluate(() => {
      return window.jupyterapp.commands.execute('docmanager:save');
    });

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
  });

  test('hides file-level load-on-save toggle when setting is enabled', async ({
    page,
    tmpPath
  }) => {
    const pluginPath = `${tmpPath}/${TEST_FILE}`;

    await page.contents.uploadContent(TEST_PLUGIN_SOURCE, 'text', pluginPath);
    await page.goto();
    await page.waitForCondition(() =>
      page.evaluate((id: string) => {
        return window.jupyterapp.commands.hasCommand(id);
      }, LOAD_COMMAND)
    );

    await page.filebrowser.open(pluginPath);
    expect(await page.activity.activateTab(TEST_FILE)).toBe(true);

    const loadOnSaveToggle = page.getByRole('button', {
      name: LOAD_ON_SAVE_CHECKBOX_LABEL,
      includeHidden: true
    });
    await expect(loadOnSaveToggle).toBeAttached();
    await expect(loadOnSaveToggle).toBeHidden();
  });
});
