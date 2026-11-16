import { expect, test } from '@jupyterlab/galata';
import type { IJupyterLabPageFixture } from '@jupyterlab/galata';
import type { Page } from '@playwright/test';

const GET_PROFILE_COMMAND = 'plugin-playground:get-profile';
const DISABLE_PLUGIN_COMMAND = 'plugin-playground:disable-plugin';
const ENABLE_PLUGIN_COMMAND = 'plugin-playground:enable-plugin';
const OVERRIDE_SETTING_COMMAND = 'plugin-playground:override-setting';
const LIST_PLUGINS_COMMAND = 'plugin-playground:list-plugins';
const LIST_SETTINGS_COMMAND = 'plugin-playground:list-settings';
const LOAD_COMMAND = 'plugin-playground:load-as-extension';
const CREATE_FILE_COMMAND = 'plugin-playground:create-new-plugin';
const SET_FILE_CONTENT_COMMAND = 'jupyterlab-ai-commands:set-file-content';
const OPEN_CHAT_COMMAND = 'jupyterlab-chat:openWithMessage';
const REFRESH_SKILLS_COMMAND = '@jupyter-ai/agent-lite:refresh-skills';
const PLAYGROUND_PLUGIN_ID = '@jupyterlab/plugin-playground:plugin';
const FILE_EDITOR_EXTENSION = '@jupyterlab/fileeditor-extension';
const STATUS_BAR_PLUGIN_ID = '@jupyterlab/statusbar-extension:plugin';
const TOC_EXTENSION = '@jupyterlab/toc-extension';
const START_KEY = '@jupyterlab/plugin-playground:starting:/';
const THEMES_PLUGIN_ID = '@jupyterlab/apputils-extension:themes';
const AI_SETTINGS_PLUGIN_ID = '@jupyter-ai/jupyternaut-lite:settings-model';
const DARK_THEME = 'JupyterLab Dark';
const LIGHT_THEME = 'JupyterLab Light';
const PAGE_CONFIG_FILE = '_profile/jupyter-lite.json';
const OVERRIDES_FILE = '_profile/overrides.json';
const STARTUP_PLUGIN_FILE = '_profile/plugins/marker.ts';
const STARTUP_PLUGIN_ID = 'lite-profile-test:marker';
const STARTUP_PLUGIN_MARKER_ID = 'lite-profile-test-marker';
const STARTUP_PLUGIN_SOURCE = `
const plugin = {
  id: '${STARTUP_PLUGIN_ID}',
  autoStart: true,
  activate: () => {
    const marker = document.createElement('div');
    marker.id = '${STARTUP_PLUGIN_MARKER_ID}';
    document.body.appendChild(marker);
  }
};

export default plugin;
`;
const SKILL_NAME = 'customize-jupyterlite';
const MOCK_LLM_URL = 'https://mock-llm.invalid/v1/chat/completions';
const CHAT_PANEL_ID = 'JupyterlabChat:sidepanel';
const PLAYGROUND_SIDEBAR_ID = 'jp-plugin-playground-sidebar';
const PROFILE_SECTION_ID = 'jp-plugin-profile-sidebar';

interface IProfileStatus {
  supported: boolean;
  safeMode: boolean;
  applied: Record<string, unknown>;
  pending: Record<string, unknown>;
  reloadRequired: boolean;
  startupPlugins: string[];
  problems: string[];
}

interface IToolCall {
  tool: string;
  args: Record<string, unknown>;
}

interface IChatMessage {
  role: string;
  content: string;
}

/**
 * Wait for the end of the start of the application.
 *
 * A reload before that gives a start in safe mode.
 */
async function waitForStart(page: Page): Promise<void> {
  await page.waitForFunction(
    ([command, key]) =>
      window.jupyterapp?.commands.hasCommand(command) &&
      window.sessionStorage.getItem(key) === null,
    [GET_PROFILE_COMMAND, START_KEY] as const
  );
  await page.evaluate(() => window.jupyterapp.restored);
}

test.use({
  // The default waits for the launcher, which is not always the active tab.
  waitForApplication: async ({ baseURL }, use) => {
    await use(waitForStart);
  }
});

async function openLab(
  page: IJupyterLabPageFixture,
  search = ''
): Promise<void> {
  await page.goto(`lab/index.html${search}`);
}

/**
 * Click the button of a notification that reloads the page.
 */
async function clickReload(
  page: IJupyterLabPageFixture,
  name = 'Reload'
): Promise<void> {
  await Promise.all([
    page.waitForEvent('load'),
    page.locator('.Toastify__toast').getByRole('button', { name }).click()
  ]);
  await waitForStart(page);
}

function executeCommand<T = IProfileStatus>(
  page: IJupyterLabPageFixture,
  id: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  return page.evaluate(
    ([id, args]) => window.jupyterapp.commands.execute(id, args as any),
    [id, args] as const
  );
}

async function writeFile(
  page: IJupyterLabPageFixture,
  path: string,
  content: string
): Promise<void> {
  await page.evaluate(
    async ([path, content]) => {
      const { contents } = window.jupyterapp.serviceManager;
      const segments = path.split('/').slice(0, -1);
      for (let depth = 1; depth <= segments.length; depth++) {
        const directory = segments.slice(0, depth).join('/');
        try {
          await contents.get(directory, { content: false });
        } catch {
          const created = await contents.newUntitled({
            path: segments.slice(0, depth - 1).join('/'),
            type: 'directory'
          });
          await contents.rename(created.path, directory);
        }
      }
      await contents.save(path, { type: 'file', format: 'text', content });
    },
    [path, content] as const
  );
}

/**
 * Answer the requests of the chat to the model with scripted tool calls,
 * then with a final message.
 *
 * Returns the messages of the last request, which hold the tool results.
 */
async function mockModel(
  page: IJupyterLabPageFixture,
  toolCalls: IToolCall[],
  answer: string
): Promise<() => IChatMessage[]> {
  let messages: IChatMessage[] = [];
  await page.route(MOCK_LLM_URL, async route => {
    messages = route.request().postDataJSON().messages;
    const lastPrompt = messages
      .map(message => message.role)
      .lastIndexOf('user');
    const step = messages
      .slice(lastPrompt + 1)
      .filter(message => message.role === 'tool').length;
    const toolCall = toolCalls[step];
    const delta = toolCall
      ? {
          tool_calls: [
            {
              index: 0,
              id: `call_${step}`,
              type: 'function',
              function: {
                name: toolCall.tool,
                arguments: JSON.stringify(toolCall.args)
              }
            }
          ]
        }
      : { content: answer };
    const chunks = [
      { choices: [{ index: 0, delta }] },
      {
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: toolCall ? 'tool_calls' : 'stop'
          }
        ]
      }
    ];
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')
    });
  });
  return () => messages;
}

test('lists the plugins and the settings of the application', async ({
  page
}) => {
  await openLab(page);

  const plugins = await executeCommand<{
    count: number;
    items: { id: string; enabled: boolean }[];
  }>(page, LIST_PLUGINS_COMMAND, { query: 'statusbar-extension' });
  expect(plugins.items).toContainEqual(
    expect.objectContaining({ id: STATUS_BAR_PLUGIN_ID, enabled: true })
  );

  const settings = await executeCommand<{
    items: { plugin: string; key: string; default: unknown }[];
  }>(page, LIST_SETTINGS_COMMAND, { query: 'theme' });
  expect(settings.items).toContainEqual(
    expect.objectContaining({
      plugin: THEMES_PLUGIN_ID,
      key: 'theme',
      default: LIGHT_THEME
    })
  );
});

test('disables a plugin from the next page load', async ({ page }) => {
  await openLab(page);
  const statusBar = page.locator('#jp-main-statusbar');
  await expect(statusBar).toBeVisible();

  let status = await executeCommand(page, DISABLE_PLUGIN_COMMAND, {
    id: STATUS_BAR_PLUGIN_ID
  });
  expect(status.reloadRequired).toBe(true);
  expect(status.pending).toEqual({
    disabledExtensions: [STATUS_BAR_PLUGIN_ID]
  });
  await expect(statusBar).toBeVisible();

  await clickReload(page);
  await expect(statusBar).toHaveCount(0);
  status = await executeCommand(page, GET_PROFILE_COMMAND);
  expect(status.reloadRequired).toBe(false);
  expect(status.applied).toEqual({
    disabledExtensions: [STATUS_BAR_PLUGIN_ID]
  });
  const plugins = await executeCommand<{
    items: { id: string; enabled: boolean }[];
  }>(page, LIST_PLUGINS_COMMAND, { query: STATUS_BAR_PLUGIN_ID });
  expect(plugins.items).toEqual([
    expect.objectContaining({ id: STATUS_BAR_PLUGIN_ID, enabled: false })
  ]);

  status = await executeCommand(page, ENABLE_PLUGIN_COMMAND, {
    id: STATUS_BAR_PLUGIN_ID
  });
  expect(status.pending).toEqual({});
  status = await executeCommand(page, ENABLE_PLUGIN_COMMAND, {
    id: STATUS_BAR_PLUGIN_ID
  });
  expect(status.pending).toEqual({});
  await clickReload(page);
  await expect(statusBar).toBeVisible();
});

test('keeps the changes of commands that run at the same time', async ({
  page
}) => {
  await openLab(page);
  const tocTab = page.locator(
    '.jp-SideBar .lm-TabBar-tab[data-id="table-of-contents"]'
  );
  await expect(tocTab).toBeVisible();

  await Promise.all([
    executeCommand(page, DISABLE_PLUGIN_COMMAND, { id: STATUS_BAR_PLUGIN_ID }),
    executeCommand(page, DISABLE_PLUGIN_COMMAND, { id: TOC_EXTENSION })
  ]);
  let status = await executeCommand(page, GET_PROFILE_COMMAND);
  expect(status.pending.disabledExtensions).toHaveLength(2);
  expect(status.pending.disabledExtensions).toEqual(
    expect.arrayContaining([STATUS_BAR_PLUGIN_ID, TOC_EXTENSION])
  );

  // The name of an extension disables all its plugins.
  await clickReload(page);
  await expect(page.locator('#jp-main-statusbar')).toHaveCount(0);
  await expect(tocTab).toHaveCount(0);

  // A plugin that is disabled again does not change the profile.
  status = await executeCommand(page, DISABLE_PLUGIN_COMMAND, {
    id: STATUS_BAR_PLUGIN_ID
  });
  expect(status.reloadRequired).toBe(false);
});

test('overrides the default value of a setting from the next page load', async ({
  page
}) => {
  await openLab(page);
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-jp-theme-name', LIGHT_THEME);

  const status = await executeCommand(page, OVERRIDE_SETTING_COMMAND, {
    plugin: THEMES_PLUGIN_ID,
    key: 'theme',
    value: DARK_THEME
  });
  expect(status.pending).toEqual({
    settingsOverrides: { [THEMES_PLUGIN_ID]: { theme: DARK_THEME } }
  });
  await executeCommand(page, OVERRIDE_SETTING_COMMAND, {
    plugin: AI_SETTINGS_PLUGIN_ID,
    key: 'toolsEnabled',
    value: false
  });

  await clickReload(page);
  await expect(body).toHaveAttribute('data-jp-theme-name', DARK_THEME);

  // The site also overrides settings of this plugin, and they must stay.
  const defaults = await page.evaluate(async plugin => {
    const { settings } = window.jupyterapp.serviceManager;
    const properties = (await settings.fetch(plugin)).schema.properties ?? {};
    return [
      properties.defaultProvider.default,
      properties.toolsEnabled.default
    ];
  }, AI_SETTINGS_PLUGIN_ID);
  expect(defaults).toEqual(['mock', false]);

  await executeCommand(page, OVERRIDE_SETTING_COMMAND, {
    plugin: THEMES_PLUGIN_ID,
    key: 'theme'
  });
  await clickReload(page);
  await expect(body).toHaveAttribute('data-jp-theme-name', LIGHT_THEME);
});

test('loads the plugins of the profile folder at each start', async ({
  page
}) => {
  await openLab(page);
  const marker = page.locator(`#${STARTUP_PLUGIN_MARKER_ID}`);
  await writeFile(page, STARTUP_PLUGIN_FILE, STARTUP_PLUGIN_SOURCE);

  const result = await executeCommand<{ ok: boolean; pluginIds: string[] }>(
    page,
    LOAD_COMMAND,
    { path: STARTUP_PLUGIN_FILE }
  );
  expect(result.ok).toBe(true);
  expect(result.pluginIds).toEqual([STARTUP_PLUGIN_ID]);
  await expect(marker).toHaveCount(1);
  const status = await executeCommand(page, GET_PROFILE_COMMAND);
  expect(status.startupPlugins).toEqual([STARTUP_PLUGIN_FILE]);
  expect(status.reloadRequired).toBe(false);

  await page.reload();
  await expect(marker).toHaveCount(1);
});

test('starts without the profile in safe mode', async ({ page }) => {
  await openLab(page);
  await executeCommand(page, DISABLE_PLUGIN_COMMAND, {
    id: STATUS_BAR_PLUGIN_ID
  });
  await executeCommand(page, OVERRIDE_SETTING_COMMAND, {
    plugin: THEMES_PLUGIN_ID,
    key: 'theme',
    value: DARK_THEME
  });
  await writeFile(page, STARTUP_PLUGIN_FILE, STARTUP_PLUGIN_SOURCE);
  const body = page.locator('body');
  const statusBar = page.locator('#jp-main-statusbar');
  const marker = page.locator(`#${STARTUP_PLUGIN_MARKER_ID}`);

  await openLab(page, '?safe-mode');
  await expect(
    page.locator('.Toastify__toast', { hasText: 'Safe mode' })
  ).toBeVisible();
  await expect(body).toHaveAttribute('data-jp-theme-name', LIGHT_THEME);
  await expect(statusBar).toBeVisible();
  await expect(marker).toHaveCount(0);
  const status = await executeCommand(page, GET_PROFILE_COMMAND);
  expect(status.safeMode).toBe(true);
  expect(status.applied).toEqual({});
  expect(status.startupPlugins).toEqual([STARTUP_PLUGIN_FILE]);

  await clickReload(page, 'Leave safe mode');
  expect(page.url()).not.toContain('safe-mode');
  await expect(body).toHaveAttribute('data-jp-theme-name', DARK_THEME);
  await expect(statusBar).toHaveCount(0);
  await expect(marker).toHaveCount(1);
});

test('starts in safe mode after a start that did not complete', async ({
  page
}) => {
  await openLab(page);
  await executeCommand(page, OVERRIDE_SETTING_COMMAND, {
    plugin: THEMES_PLUGIN_ID,
    key: 'theme',
    value: DARK_THEME
  });
  await clickReload(page);
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-jp-theme-name', DARK_THEME);

  // The record stays when the application does not complete its start.
  await page.evaluate(
    key => window.sessionStorage.setItem(key, '1'),
    START_KEY
  );
  await page.reload();
  await expect(
    page.locator('.Toastify__toast', {
      hasText: 'The last start did not complete.'
    })
  ).toBeVisible();
  await expect(body).toHaveAttribute('data-jp-theme-name', LIGHT_THEME);
  const status = await executeCommand(page, GET_PROFILE_COMMAND);
  expect(status.safeMode).toBe(true);

  await clickReload(page, 'Leave safe mode');
  await expect(body).toHaveAttribute('data-jp-theme-name', DARK_THEME);
});

test('rejects the changes that cannot be applied', async ({ page }) => {
  await openLab(page);

  await expect(
    executeCommand(page, DISABLE_PLUGIN_COMMAND, { id: PLAYGROUND_PLUGIN_ID })
  ).rejects.toThrow(/cannot be disabled/);
  await expect(
    executeCommand(page, DISABLE_PLUGIN_COMMAND, { id: FILE_EDITOR_EXTENSION })
  ).rejects.toThrow(/Plugin Playground needs it/);
  await expect(
    executeCommand(page, DISABLE_PLUGIN_COMMAND, { id: 'unknown:plugin' })
  ).rejects.toThrow(/not a plugin or an extension of the site/);
  // The name of a package is not always the start of its plugin ids.
  await expect(
    executeCommand(page, DISABLE_PLUGIN_COMMAND, {
      id: 'jupyterlab-cell-input-footer-extension'
    })
  ).rejects.toThrow(/not a plugin or an extension of the site/);
  await expect(
    executeCommand(page, OVERRIDE_SETTING_COMMAND, {
      plugin: THEMES_PLUGIN_ID,
      key: 'unknown',
      value: true
    })
  ).rejects.toThrow(/The available settings are: theme,/);
  await expect(
    executeCommand(page, OVERRIDE_SETTING_COMMAND, {
      plugin: THEMES_PLUGIN_ID,
      key: 'theme',
      value: 1
    })
  ).rejects.toThrow(/is not valid: \/theme must be string/);

  const status = await executeCommand(page, GET_PROFILE_COMMAND);
  expect(status.pending).toEqual({});
  expect(status.reloadRequired).toBe(false);
});

test('ignores the invalid entries of files edited by hand', async ({
  page
}) => {
  await openLab(page);
  await writeFile(
    page,
    PAGE_CONFIG_FILE,
    JSON.stringify({
      'jupyter-config-data': {
        appName: 'Customized Lab',
        baseUrl: '/elsewhere/',
        disabledExtensions: [
          PLAYGROUND_PLUGIN_ID,
          FILE_EDITOR_EXTENSION,
          STATUS_BAR_PLUGIN_ID
        ]
      }
    })
  );
  await writeFile(
    page,
    OVERRIDES_FILE,
    JSON.stringify({
      [THEMES_PLUGIN_ID]: { theme: DARK_THEME, unknown: true },
      'unknown:plugin': { key: 'value' }
    })
  );

  // The notification shows that the manager watches the files.
  await expect(
    page.locator('.Toastify__toast', { hasText: 'Reload the page' })
  ).toBeVisible();
  const status = await executeCommand(page, GET_PROFILE_COMMAND);
  expect(status.pending).toEqual({
    appName: 'Customized Lab',
    disabledExtensions: [STATUS_BAR_PLUGIN_ID],
    settingsOverrides: { [THEMES_PLUGIN_ID]: { theme: DARK_THEME } }
  });
  expect(status.problems).toEqual([
    expect.stringContaining('has no "unknown" setting'),
    '"unknown:plugin" has no settings.',
    '"baseUrl" cannot be set in the profile.',
    `"${PLAYGROUND_PLUGIN_ID}" cannot be disabled.`,
    `"${FILE_EDITOR_EXTENSION}" cannot be disabled, because Plugin Playground needs it.`
  ]);

  await clickReload(page);
  await expect(page).toHaveTitle(/Customized Lab/);
  await expect(page.locator('body')).toHaveAttribute(
    'data-jp-theme-name',
    DARK_THEME
  );
  await expect(page.locator('#jp-main-statusbar')).toHaveCount(0);
});

test('removes an override that is in the page config file', async ({
  page
}) => {
  await openLab(page);
  await writeFile(
    page,
    PAGE_CONFIG_FILE,
    JSON.stringify({
      'jupyter-config-data': {
        settingsOverrides: { [THEMES_PLUGIN_ID]: { theme: DARK_THEME } }
      }
    })
  );
  let status = await executeCommand(page, GET_PROFILE_COMMAND);
  expect(status.pending).toEqual({
    settingsOverrides: { [THEMES_PLUGIN_ID]: { theme: DARK_THEME } }
  });

  status = await executeCommand(page, OVERRIDE_SETTING_COMMAND, {
    plugin: THEMES_PLUGIN_ID,
    key: 'theme'
  });
  expect(status.pending).toEqual({});
});

test('shows the profile in the sidebar', async ({ page }) => {
  await openLab(page);
  await executeCommand(page, DISABLE_PLUGIN_COMMAND, {
    id: STATUS_BAR_PLUGIN_ID
  });
  await executeCommand(page, OVERRIDE_SETTING_COMMAND, {
    plugin: THEMES_PLUGIN_ID,
    key: 'theme',
    value: DARK_THEME
  });

  await page.sidebar.openTab(PLAYGROUND_SIDEBAR_ID);
  const section = page.locator(`#${PROFILE_SECTION_ID}`);
  await expect(section).toContainText('Reload the page to apply the changes.');
  await expect(section).toContainText(STATUS_BAR_PLUGIN_ID);
  await expect(section).toContainText(THEMES_PLUGIN_ID);

  await section
    .getByRole('button', { name: `Enable ${STATUS_BAR_PLUGIN_ID}` })
    .click();
  await expect(section).not.toContainText(STATUS_BAR_PLUGIN_ID);
  const status = await executeCommand(page, GET_PROFILE_COMMAND);
  expect(status.pending).toEqual({
    settingsOverrides: { [THEMES_PLUGIN_ID]: { theme: DARK_THEME } }
  });
});

test('lets the agent of the chat customize the site', async ({ page }) => {
  const answer = 'Reload the page to apply the changes.';
  const lastMessages = await mockModel(
    page,
    [
      { tool: 'load_skill', args: { name: SKILL_NAME } },
      {
        tool: 'execute_command',
        args: {
          commandId: DISABLE_PLUGIN_COMMAND,
          args: { id: STATUS_BAR_PLUGIN_ID }
        }
      },
      {
        tool: 'execute_command',
        args: {
          commandId: OVERRIDE_SETTING_COMMAND,
          args: { plugin: THEMES_PLUGIN_ID, key: 'theme', value: DARK_THEME }
        }
      },
      {
        tool: 'execute_command',
        args: {
          commandId: CREATE_FILE_COMMAND,
          args: { path: `/${STARTUP_PLUGIN_FILE}` }
        }
      },
      {
        tool: 'execute_command',
        args: {
          commandId: SET_FILE_CONTENT_COMMAND,
          args: {
            filePath: STARTUP_PLUGIN_FILE,
            content: STARTUP_PLUGIN_SOURCE,
            showDiff: false
          }
        }
      },
      {
        tool: 'execute_command',
        args: { commandId: LOAD_COMMAND, args: { path: STARTUP_PLUGIN_FILE } }
      }
    ],
    answer
  );
  await openLab(page);
  const marker = page.locator(`#${STARTUP_PLUGIN_MARKER_ID}`);
  // The agent reads the skills in the background when the application starts.
  await executeCommand(page, REFRESH_SKILLS_COMMAND);

  await executeCommand(page, OPEN_CHAT_COMMAND, {
    name: 'profile',
    path: '',
    inSidePanel: true,
    input: 'Hide the status bar, use the dark theme, and add a marker.'
  });
  const chat = page.locator(`[id="${CHAT_PANEL_ID}"]`);
  // The message has no recipient until the persona selector is ready.
  await expect(
    chat.locator('.jp-jai-personaControls-persona-btn')
  ).toBeVisible();
  await chat.locator('.jp-chat-send-button').click();

  await expect(chat.getByText(answer)).toBeVisible();
  await expect(chat.locator('.jp-ai-tool-call-item-completed')).toHaveCount(6);
  const results = lastMessages()
    .filter(message => message.role === 'tool')
    .map(message => JSON.parse(message.content));
  expect(results[0].instructions).toContain('_profile');
  expect(results[2].result.reloadRequired).toBe(true);
  expect(results[5].result.pluginIds).toEqual([STARTUP_PLUGIN_ID]);
  await expect(marker).toHaveCount(1);

  await clickReload(page);
  await expect(page.locator('body')).toHaveAttribute(
    'data-jp-theme-name',
    DARK_THEME
  );
  await expect(page.locator('#jp-main-statusbar')).toHaveCount(0);
  await expect(marker).toHaveCount(1);
});
