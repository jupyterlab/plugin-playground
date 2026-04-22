import { JupyterFrontEnd } from '@jupyterlab/application';
import { ReadonlyPartialJSONObject } from '@lumino/coreutils';

/**
 * Serializable shape for a single Plugin Playground guided tour step.
 */
interface IPluginPlaygroundTourStep extends ReadonlyPartialJSONObject {
  target: string;
  title: string;
  content: string;
  placement?:
    | 'auto'
    | 'center'
    | 'top'
    | 'top-start'
    | 'top-end'
    | 'right'
    | 'right-start'
    | 'right-end'
    | 'bottom'
    | 'bottom-start'
    | 'bottom-end'
    | 'left'
    | 'left-start'
    | 'left-end';
  disableBeacon?: boolean;
}

/**
 * Serializable options that control guided tour runtime behavior.
 */
interface IPluginPlaygroundTourOptions extends ReadonlyPartialJSONObject {
  showProgress?: boolean;
  showSkipButton?: boolean;
  continuous?: boolean;
  disableOverlayClose?: boolean;
  disableScrolling?: boolean;
  scrollToFirstStep?: boolean;
}

/**
 * Serializable Plugin Playground guided tour definition.
 */
interface IPluginPlaygroundTour extends ReadonlyPartialJSONObject {
  id: string;
  label: string;
  hasHelpEntry: boolean;
  steps: IPluginPlaygroundTourStep[];
  options?: IPluginPlaygroundTourOptions;
}

/**
 * Minimal event payload emitted by the tour handler on step changes.
 */
interface ITourStepEvent extends ReadonlyPartialJSONObject {
  index?: number;
}

/**
 * Minimal signal contract used by the local tour integration hooks.
 */
interface ITourSignal {
  connect: (slot: (sender: unknown, args: ITourStepEvent) => void) => void;
}

/**
 * Narrow view of the tour handler returned by jupyterlab-tour commands.
 */
interface ITourHandlerLike {
  id: string;
  started?: ITourSignal;
  stepChanged?: ITourSignal;
}

const TOUR_ADD_COMMAND = 'jupyterlab-tour:add';
const TOUR_LAUNCH_COMMAND = 'jupyterlab-tour:launch';
const TOUR_ID = '@jupyterlab/plugin-playground:tour';

const PLAYGROUND_SIDEBAR_SELECTOR = '#jp-plugin-playground-sidebar';
const EXAMPLES_SIDEBAR_SELECTOR = '#jp-plugin-example-sidebar';

const TOKENS_TAB_SELECTOR = '#jp-PluginPlayground-extensionPointTab-tokens';
const COMMANDS_TAB_SELECTOR = '#jp-PluginPlayground-extensionPointTab-commands';
const PACKAGES_TAB_SELECTOR = '#jp-PluginPlayground-extensionPointTab-packages';

const TOKENS_FIRST_ACTIONS_SELECTOR = '#jp-PluginPlayground-tour-token-actions';
const COMMANDS_FIRST_INSERT_SELECTOR =
  '#jp-PluginPlayground-tour-command-insert-group';
const COMMANDS_FIRST_SCHEMA_SELECTOR =
  '#jp-PluginPlayground-tour-command-schema-copy-actions';
const PACKAGES_FIRST_ACTIONS_SELECTOR =
  '#jp-PluginPlayground-tour-package-actions';
const EXAMPLES_FIRST_ACTIONS_SELECTOR =
  '#jp-PluginPlayground-tour-example-actions';

const TOUR_STEP_INDEX = {
  welcome: 0,
  editor: 1,
  load: 2,
  loadOnSave: 3,
  sidebar: 4,
  tokensIntro: 5,
  tokensInsertCopy: 6,
  commandsIntro: 7,
  commandsInsert: 8,
  commandsDocsAndCopy: 9,
  packagesIntro: 10,
  packagesLinks: 11,
  examplesIntro: 12,
  examplesButtons: 13,
  export: 14,
  share: 15,
  ai: 16
} as const;

const PLUGIN_PLAYGROUND_TOUR: IPluginPlaygroundTour = {
  id: TOUR_ID,
  label: 'Plugin Playground Tour',
  hasHelpEntry: false,
  options: {
    showProgress: true,
    showSkipButton: true,
    continuous: true,
    disableOverlayClose: false,
    disableScrolling: true,
    scrollToFirstStep: false
  },
  steps: [
    {
      target: '#jp-main-dock-panel',
      title: 'Welcome to Plugin Playground',
      placement: 'center',
      disableBeacon: true,
      content:
        'You started this walkthrough from "Take the Tour". It opens only when you choose it, so it will not interrupt normal work.'
    },
    {
      target: '.jp-FileEditor',
      title: 'Your Editing Area',
      placement: 'bottom',
      content:
        'This file is your plugin workspace. You can quickly prototype, adjust, and rerun changes without leaving JupyterLab.'
    },
    {
      target: '[data-command="plugin-playground:load-as-extension"]',
      title: 'Run Your Plugin',
      placement: 'bottom',
      content:
        'Use "Load Current File As Extension" to run what you are editing right away. This is the core loop for quick iteration.'
    },
    {
      target: '.jp-PluginPlayground-loadOnSaveWidget',
      title: 'Run on save',
      placement: 'bottom',
      content:
        'Turn this on if you want saves to reload your plugin automatically while you iterate.'
    },
    {
      target: PLAYGROUND_SIDEBAR_SELECTOR,
      title: 'Playground Sidebar',
      placement: 'left-start',
      content:
        'This sidebar is your guided reference area for extension points and real examples.'
    },
    {
      target: TOKENS_TAB_SELECTOR,
      title: 'Tokens: About This Section',
      placement: 'left-start',
      content:
        'Tokens are capabilities provided by JupyterLab and other extensions. You use them to connect your plugin to existing Jupyter features.'
    },
    {
      target: TOKENS_FIRST_ACTIONS_SELECTOR,
      title: 'Tokens: Insert and Copy',
      placement: 'left-start',
      content:
        'Use the first + button to insert token wiring helpers in your code. Use the copy button in the same row to quickly reuse the token name.'
    },
    {
      target: COMMANDS_TAB_SELECTOR,
      title: 'Commands: About This Section',
      placement: 'left-start',
      content:
        'Commands are actions your plugin can trigger in JupyterLab, like opening views or running workflows.'
    },
    {
      target: COMMANDS_FIRST_INSERT_SELECTOR,
      title: 'Commands: Insert (Normal or AI)',
      placement: 'left-start',
      content:
        'Commands are actions your plugin can trigger. Use the insert action in normal mode for direct code insertion, or switch to AI mode to instruct the AI assistant to perform context-aware insertion.'
    },
    {
      target: COMMANDS_FIRST_SCHEMA_SELECTOR,
      title: 'Commands: Schema and Copy',
      placement: 'left-start',
      content:
        'Use the schema badge to inspect command arguments. You can also copy command IDs from the same row.'
    },
    {
      target: PACKAGES_TAB_SELECTOR,
      title: 'Packages: About This Section',
      placement: 'left-start',
      content:
        'Packages gives a practical view of libraries your plugin can use to import functions, classes, and other resources. Additional packages will show up in environments with more extensions.'
    },
    {
      target: PACKAGES_FIRST_ACTIONS_SELECTOR,
      title: 'Packages: Open Linked Resources',
      placement: 'left-start',
      content:
        'The buttons to the right open documentation, npm entry, and source code repository.'
    },
    {
      target: EXAMPLES_SIDEBAR_SELECTOR,
      title: 'Extension Examples: About This Section',
      placement: 'left-start',
      content:
        'Extension Examples give you ready references so you can learn patterns quickly from plugins demonstrating common extension use cases.'
    },
    {
      target: EXAMPLES_FIRST_ACTIONS_SELECTOR,
      title: 'Extension Examples: Code and README Buttons',
      placement: 'left-start',
      content:
        'In each row, Code opens the source entrypoint, and README opens the explanation. Together they help you learn and adopt patterns faster.'
    },
    {
      target: '[data-command="plugin-playground:export-as-extension"]',
      title: 'Export Near the Finish',
      placement: 'bottom',
      content:
        'When your prototype is ready, export your plugin as an archive to continue development in your preferred IDE, or as a Python package to install it in a test environment.'
    },
    {
      target: '[data-command="plugin-playground:share-via-link"]',
      title: 'Share Near the Finish',
      placement: 'bottom',
      content:
        'Use the Share button to copy a link for the current plugin file so others can review or continue from your exact starting point.'
    },
    {
      target: '#jp-main-dock-panel',
      title: 'AI Path (Optional)',
      placement: 'center',
      content:
        'If you want assistant help later, use the "Build with AI" tile. It opens the AI flow when you choose it.'
    },
    {
      target: '#jp-main-dock-panel',
      title: 'You Are Ready',
      placement: 'center',
      content:
        'That is the full flow. You can rerun this tour anytime from "Take the Tour" tile.'
    }
  ]
};

const CONNECTED_TOUR_IDS = new Set<string>();

export const PLUGIN_PLAYGROUND_TOUR_MISSING_HINT =
  'Guided tours are unavailable because "jupyterlab-tour" is not installed in this environment.';

export function hasPluginPlaygroundTourSupport(app: JupyterFrontEnd): boolean {
  return (
    app.commands.hasCommand(TOUR_ADD_COMMAND) &&
    app.commands.hasCommand(TOUR_LAUNCH_COMMAND)
  );
}

function isSignalLike(candidate: unknown): boolean {
  return (
    !!candidate &&
    typeof candidate === 'object' &&
    'connect' in candidate &&
    typeof (candidate as { connect: unknown }).connect === 'function'
  );
}

function isTourHandlerLike(candidate: unknown): candidate is ITourHandlerLike {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }
  return (
    'id' in candidate &&
    typeof (candidate as { id: unknown }).id === 'string' &&
    'started' in candidate &&
    isSignalLike((candidate as { started: unknown }).started) &&
    'stepChanged' in candidate &&
    isSignalLike((candidate as { stepChanged: unknown }).stepChanged)
  );
}

function activateExtensionPointsTab(
  view: 'tokens' | 'commands' | 'packages'
): void {
  if (typeof document === 'undefined') {
    return;
  }

  const tab = document.getElementById(
    `jp-PluginPlayground-extensionPointTab-${view}`
  ) as HTMLButtonElement | null;
  const isActive =
    tab?.getAttribute('aria-selected') === 'true' ||
    tab?.classList.contains('jp-mod-active');
  if (!isActive) {
    tab?.click();
  }
}

function scrollExamplesToTop(): void {
  if (typeof document === 'undefined') {
    return;
  }
  const examplesRoot = document.querySelector(
    EXAMPLES_SIDEBAR_SELECTOR
  ) as HTMLElement | null;
  const container = examplesRoot?.querySelector(
    '.jp-PluginPlayground-sidebarInner'
  ) as HTMLElement | null;
  if (!container) {
    return;
  }
  container.scrollTop = 0;
  container.scrollTo?.({ top: 0, behavior: 'auto' });
}

function syncTourUiForStep(index: number): void {
  switch (index) {
    case TOUR_STEP_INDEX.tokensIntro:
    case TOUR_STEP_INDEX.tokensInsertCopy:
      activateExtensionPointsTab('tokens');
      break;
    case TOUR_STEP_INDEX.commandsIntro:
    case TOUR_STEP_INDEX.commandsInsert:
    case TOUR_STEP_INDEX.commandsDocsAndCopy:
      activateExtensionPointsTab('commands');
      break;
    case TOUR_STEP_INDEX.packagesIntro:
    case TOUR_STEP_INDEX.packagesLinks:
      activateExtensionPointsTab('packages');
      break;
    case TOUR_STEP_INDEX.examplesIntro:
      scrollExamplesToTop();
      break;
    default:
      break;
  }
}

function attachTourUiHooks(handler: ITourHandlerLike): void {
  if (CONNECTED_TOUR_IDS.has(handler.id)) {
    return;
  }
  CONNECTED_TOUR_IDS.add(handler.id);

  handler.started?.connect(() => {
    syncTourUiForStep(TOUR_STEP_INDEX.welcome);
  });
  handler.stepChanged?.connect((_sender, args) => {
    const index = typeof args.index === 'number' ? args.index : 0;
    syncTourUiForStep(index);
  });
}

export async function launchPluginPlaygroundTour(
  app: JupyterFrontEnd
): Promise<void> {
  if (!hasPluginPlaygroundTourSupport(app)) {
    throw new Error(PLUGIN_PLAYGROUND_TOUR_MISSING_HINT);
  }

  let addedTour: unknown = null;
  try {
    addedTour = await app.commands.execute(TOUR_ADD_COMMAND, {
      tour: PLUGIN_PLAYGROUND_TOUR
    });
  } catch {
    // If the tour is already registered in this session, launch still works.
  }

  if (isTourHandlerLike(addedTour)) {
    attachTourUiHooks(addedTour);
  }
  syncTourUiForStep(TOUR_STEP_INDEX.welcome);

  await app.commands.execute(TOUR_LAUNCH_COMMAND, {
    id: PLUGIN_PLAYGROUND_TOUR.id,
    force: true
  });
}
