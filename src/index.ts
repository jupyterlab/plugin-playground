import ts from 'typescript';

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import {
  Dialog,
  MainAreaWidget,
  Notification,
  showDialog,
  showErrorMessage,
  ICommandPalette,
  IToolbarWidgetRegistry
} from '@jupyterlab/apputils';

import { ILogConsoleTracker } from 'jupyterlab-js-logs';

import { Signal } from '@lumino/signaling';

import { DocumentRegistry, IDocumentWidget } from '@jupyterlab/docregistry';

import { FileEditor, IEditorTracker } from '@jupyterlab/fileeditor';

import { ILauncher } from '@jupyterlab/launcher';
import { IMainMenu } from '@jupyterlab/mainmenu';
import { IChatTracker } from '@jupyter/chat';

import {
  checkIcon,
  fileUploadIcon,
  IFrame,
  infoIcon,
  offlineBoltIcon,
  shareIcon,
  SidePanel
} from '@jupyterlab/ui-components';

import { IDocumentManager } from '@jupyterlab/docmanager';
import { PathExt } from '@jupyterlab/coreutils';

import {
  Contents,
  IConfigSectionManager,
  type ConfigSection
} from '@jupyterlab/services';
import { ICompletionProviderManager } from '@jupyterlab/completer';

import { PluginLoader, PluginLoadingError } from './loader';

import { PluginTranspiler } from './transpiler';

import { loadKnownModule } from './modules';

import {
  discoverFederatedKnownModules,
  type IKnownModule,
  listKnownModules,
  registerCoreKnownModules,
  registerKnownModule
} from './known-modules';

import { formatErrorWithResult } from './errors';

import { ImportResolver } from './resolver';

import { IRequireJS, RequireJSLoader } from './requirejs';

import {
  type CommandInsertMode,
  filterCommandRecords,
  filterTokenRecords,
  TokenSidebar
} from './token-sidebar';

import { ExampleSidebar, filterExampleRecords } from './example-sidebar';
import { createFloatingUrlLoadHint } from './components/url-load-hint';

import { loadOnSaveToggleIcon, runTileIcon, tokenSidebarIcon } from './icons';

import {
  CommandCompletionProvider,
  getCommandArgumentCount,
  getCommandArgumentDocumentation,
  type ICommandArgumentDocumentation,
  getCommandRecords
} from './command-completion';

import { ContentUtils } from './contents';
import {
  ensurePluginActivateAppContext,
  findPluginActivateAppParameterName,
  insertImportStatement,
  insertTokenDependency,
  parseTokenReference
} from './token-insertion';

import { downloadArchive, IArchiveEntry } from './archive';
import { createTemplateArchive } from './export-template';
import { ShareLink } from './share-link';
import {
<<<<<<< improveUX
  hasPluginPlaygroundTourSupport,
  launchPluginPlaygroundTour,
  PLUGIN_PLAYGROUND_TOUR_MISSING_HINT,
  suppressWelcomeTourAtSource
} from './tour';
=======
  DEFAULT_EXPORT_ARCHIVE_FORMAT,
  EXPORT_EXTENSION_TOOLBAR_ITEM,
  ExportToolbarController,
  type ExportArchiveFormat
} from './export-toolbar';
import { createPythonWheelArchive } from './wheel';
>>>>>>> main

import { ReadonlyPartialJSONObject, Token } from '@lumino/coreutils';

import { AccordionPanel, MenuBar, Widget } from '@lumino/widgets';

import { IPlugin } from '@lumino/application';

namespace CommandIDs {
  export const createNewFile = 'plugin-playground:create-new-plugin';
  export const createNewFileWithAI =
    'plugin-playground:create-new-plugin-with-ai';
  export const takeTour = 'plugin-playground:take-tour';
  export const createNewFileFromNotebookTree =
    'plugin-playground:create-new-plugin-from-notebook-tree';
  export const createNewFileWithAIFromNotebookTree =
    'plugin-playground:create-new-plugin-with-ai-from-notebook-tree';
  export const takeTourFromNotebookTree =
    'plugin-playground:take-tour-from-notebook-tree';
  export const loadCurrentAsExtension = 'plugin-playground:load-as-extension';
  export const exportAsExtension = 'plugin-playground:export-as-extension';
  export const shareViaLink = 'plugin-playground:share-via-link';
  export const openJSImportExplorer = 'plugin-playground:open-js-explorer';
  export const listTokens = 'plugin-playground:list-tokens';
  export const listCommands = 'plugin-playground:list-commands';
  export const listExtensionExamples =
    'plugin-playground:list-extension-examples';
}

type PluginLoadStatus =
  | 'loaded'
  | 'editor-not-active'
  | 'loading-failed'
  | 'autostart-failed';

interface IPluginLoadResult {
  status: PluginLoadStatus;
  ok: boolean;
  path: string | null;
  pluginIds: string[];
  transpiled: boolean | null;
  message?: string;
  skippedAutoStartPluginIds?: string[];
}

interface IPluginLoadQueueOptions {
  notifyResult?: boolean;
}

/**
 * Result metadata returned by export command executions.
 */
interface IPluginExportResult {
  ok: boolean;
  archiveName: string | null;
  rootPath: string | null;
  fileCount: number;
  message?: string;
}

/**
 * Fully resolved context required to build an export archive.
 */
interface IResolvedExportContext {
  archiveName: string;
  rootPath: string;
  archiveEntries: IArchiveEntry[];
  usedTemplate: boolean;
}

/**
 * Result metadata returned by share-link command executions.
 */
export interface IPluginShareResult {
  ok: boolean;
  link: string | null;
  sourcePath: string | null;
  urlLength: number;
  message?: string;
}

const PLUGIN_TEMPLATE = `import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from '@jupyterlab/application';

/**
 * This is an example hello world plugin.
 * Open Command Palette with Ctrl+Shift+C
 * (Command+Shift+C on Mac) and select
 * "Load Current File as Extension"
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'hello-world:plugin',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    alert('Hello World!');
  },
};

export default plugin;
`;

interface IPrivateServiceStore {
  _serviceMap?: Map<Token<string>, string>;
  _services?: Map<Token<string>, string>;
  _delegate?: IPrivateServiceStore | null;
  pluginRegistry?: IPrivatePluginRegistry | null;
}

interface IPrivatePluginRegistry {
  _services?: Map<Token<string>, string>;
  _plugins?: Map<string, IPrivatePluginData>;
}

interface IPrivatePluginData {
  provides?: Token<string> | null;
  requires?: Token<string>[];
  optional?: Token<string>[];
  description?: unknown;
  plugin?: {
    description?: unknown;
  };
}

const EXTENSION_EXAMPLES_ROOT = 'extension-examples';
const LIST_QUERY_ARGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    query: {
      type: 'string',
      description:
        'Optional filter text. Matches records case-insensitively by visible text fields (such as id, label, caption, name, or description, depending on record type).'
    }
  }
};

const EXPORT_AS_EXTENSION_ARGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    path: {
      type: 'string',
      description:
        'Optional contents path of the file to export. When omitted, the active editor file is used.'
    },
    format: {
      type: 'string',
      enum: ['zip', 'wheel'],
      description:
        'Optional archive format (default: "zip"). Use "zip" for folder export or "wheel" for a Python package (.whl).'
    }
  }
};

const SHARE_VIA_LINK_ARGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    path: {
      type: 'string',
      description:
        'Optional contents path of the file to share. When omitted, the active editor file is used.'
    }
  }
};

const CREATE_PLUGIN_ARGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    cwd: {
      type: 'string',
      description:
        'Optional current working directory. Used as the default parent directory when `path` is not provided and as the base for relative `path` values.'
    },
    path: {
      type: 'string',
      description:
        'Optional file path. Relative paths are resolved from the current working directory; paths starting with "/" are resolved from the workspace root. If no extension is provided, ".ts" is appended.'
    }
  }
};

const CREATE_PLUGIN_FROM_NOTEBOOK_TREE_ARGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    cwd: {
      type: 'string',
      description:
        'Optional current working directory used as the default parent directory for the new file.'
    }
  }
};
const LOAD_ON_SAVE_TOGGLE_TOOLBAR_ITEM = 'plugin-playground-load-on-save';
const LOAD_ON_SAVE_CHECKBOX_LABEL = 'Auto Load on Save';
const LOAD_ON_SAVE_SETTING = 'loadOnSave';
const COMMAND_INSERT_DEFAULT_MODE_SETTING = 'commandInsertDefaultMode';
const LOAD_ON_SAVE_ENABLED_DESCRIPTION =
  'Toggle auto-loading this file as an extension on save';
const LOAD_ON_SAVE_DISABLED_DESCRIPTION =
  'Auto load on save is available for JavaScript and TypeScript files';
const JUPYTERLITE_AI_OPEN_CHAT_COMMAND = '@jupyterlite/ai:open-chat';
const JUPYTERLITE_AI_OPEN_SETTINGS_COMMAND = '@jupyterlite/ai:open-settings';
const JUPYTERLITE_AI_CHAT_PANEL_ID = '@jupyterlite/ai:chat-panel';
const JUPYTERLITE_AI_INSTALL_HINT = 'JupyterLite AI is unavailable.';
const JUPYTERLITE_AI_PROVIDER_SETUP_HINT = 'No AI provider configured.';
type JupyterLiteAIErrorCode = 'install-unavailable' | 'provider-setup-required';
type JupyterLiteAIChatOpenStatus =
  | 'opened'
  | 'provider-setup-required'
  | 'install-unavailable'
  | 'failed';

class JupyterLiteAIError extends Error {
  constructor(readonly code: JupyterLiteAIErrorCode, message: string) {
    super(message);
    this.name = 'JupyterLiteAIError';
  }
}

const DEFAULT_COMMAND_INSERT_MODE: CommandInsertMode = 'insert';
const ARCHIVE_EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.ipynb_checkpoints',
  '__pycache__',
  'node_modules'
]);
const ARCHIVE_FILE_READ_CONCURRENCY = 8;
const SHARE_URL_WARN_LENGTH = 1800;
const SHARE_URL_MAX_LENGTH = 8000;
const SHARED_LINKS_ROOT = 'plugin-playground-shared';
const URL_LOADED_EDITOR_HINT_CLASS = 'jp-PluginPlayground-urlLoadedEditorHint';
const URL_LOADED_EDITOR_HINT_TITLE = 'Load as Extension';
const URL_LOADED_EDITOR_HINT_MESSAGE =
  'Run this shared file in the playground.';
const URL_LOADED_EDITOR_HINT_DISMISS_LABEL = 'Close load as extension hint';
const NOTEBOOK_FILE_BROWSER_FACTORY = 'FileBrowser';
const NOTEBOOK_NEW_DROPDOWN_TOOLBAR_ITEM = 'new-dropdown';
const NOTEBOOK_TREE_OPEN_SIDEBAR_KEY =
  'plugin-playground:open-sidebar-from-tree';
const NOTEBOOK_TREE_OPEN_AI_CHAT_KEY =
  'plugin-playground:open-ai-chat-from-tree';
const NOTEBOOK_SHELL_PLUGIN_ID =
  '@jupyter-notebook/application-extension:shell';
const NOTEBOOK_TREE_WIDGET_PLUGIN_ID =
  '@jupyter-notebook/tree-extension:widget';

export interface IPluginPlayground {
  registerKnownModule(known: IKnownModule): Promise<void>;
  shareViaLink(path?: string): Promise<IPluginShareResult>;
}

export const IPluginPlayground = new Token<IPluginPlayground>(
  '@jupyterlab/plugin-playground:IPluginPlayground'
);

class PluginPlayground {
  constructor(
    protected app: JupyterFrontEnd,
    protected settingRegistry: ISettingRegistry,
    commandPalette: ICommandPalette,
    protected editorTracker: IEditorTracker,
    launcher: ILauncher | null,
    protected documentManager: IDocumentManager | null,
    protected chatTracker: IChatTracker | null,
    protected settings: ISettingRegistry.ISettings,
    protected requirejs: IRequireJS,
    toolbarWidgetRegistry: IToolbarWidgetRegistry,
    protected logConsoleTracker: ILogConsoleTracker | null,
    protected configSectionManager: ConfigSection.IManager | null
  ) {
    registerCoreKnownModules();

    loadKnownModule('@jupyter-widgets/base').then((module: any) => {
      // Define the widgets base module for RequireJS (left for compatibility only)
      requirejs.define('@jupyter-widgets/base', [], () => module);
    });

    app.commands.addCommand(CommandIDs.loadCurrentAsExtension, {
      label: 'Load Current File As Extension',
      caption:
        'Load the active editor file as an extension for plugin development',
      describedBy: { args: null },
      icon: runTileIcon,
      isEnabled: () =>
        editorTracker.currentWidget !== null &&
        editorTracker.currentWidget === app.shell.currentWidget,
      execute: async () => {
        const currentWidget = editorTracker.currentWidget;
        if (currentWidget) {
          if (this._sharedFileCueWidgetId === currentWidget.id) {
            this._dismissSharedFileCue?.();
          }
          const currentText = currentWidget.context.model.toString();
          return this._queuePluginLoad(currentText, currentWidget.context.path);
        }
        return {
          status: 'editor-not-active',
          ok: false,
          path: null,
          pluginIds: [],
          transpiled: null,
          message: 'No active editor is available.'
        } as IPluginLoadResult;
      }
    });

    app.commands.addCommand(CommandIDs.exportAsExtension, {
      label: 'Export Plugin Folder As Extension',
      caption:
        'Download the active plugin folder as an extension archive (.zip or .whl)',
      describedBy: { args: EXPORT_AS_EXTENSION_ARGS_SCHEMA },
      icon: fileUploadIcon,
      isEnabled: () => this.documentManager !== null,
      execute: async args => {
        const exportFormat: ExportArchiveFormat =
          args.format === 'wheel' ? 'wheel' : DEFAULT_EXPORT_ARCHIVE_FORMAT;
        const requestedPath =
          typeof args.path === 'string'
            ? ContentUtils.normalizeContentsPath(args.path)
            : '';
        if (requestedPath) {
          return this._exportAsExtension(
            requestedPath,
            undefined,
            exportFormat
          );
        }

        const currentWidget = editorTracker.currentWidget;
        if (!currentWidget || currentWidget !== app.shell.currentWidget) {
          return {
            ok: false,
            archiveName: null,
            rootPath: null,
            fileCount: 0,
            message:
              'No active editor is available. Pass a path argument to export a specific file.'
          } as IPluginExportResult;
        }

        return this._exportAsExtension(
          ContentUtils.normalizeContentsPath(currentWidget.context.path),
          currentWidget.context.model.toString(),
          exportFormat
        );
      }
    });

    app.commands.addCommand(CommandIDs.shareViaLink, {
      label: 'Copy Shareable Plugin Link',
      caption: 'Create a URL for the active plugin file, then copy it',
      describedBy: { args: SHARE_VIA_LINK_ARGS_SCHEMA },
      icon: () =>
        this._copiedCommandId === CommandIDs.shareViaLink
          ? checkIcon
          : shareIcon,
      execute: async args => {
        const requestedPath =
          typeof args.path === 'string' ? args.path : undefined;
        return this.shareViaLink(requestedPath);
      }
    });

    toolbarWidgetRegistry.addFactory<IDocumentWidget<FileEditor>>(
      'Editor',
      LOAD_ON_SAVE_TOGGLE_TOOLBAR_ITEM,
      widget => this._createLoadOnSaveToggleWidget(widget)
    );
    toolbarWidgetRegistry.addFactory<IDocumentWidget<FileEditor>>(
      'Editor',
      EXPORT_EXTENSION_TOOLBAR_ITEM,
      widget =>
        this._exportToolbar.createWidget({
          editorWidget: widget,
          hasDocumentManager: () => this.documentManager !== null,
          onExport: format => {
            void this.app.commands.execute(CommandIDs.exportAsExtension, {
              format
            });
          }
        })
    );

    editorTracker.widgetAdded.connect(
      (_sender: IEditorTracker, widget: IDocumentWidget<FileEditor>) => {
        const onSaveState = (
          _context: DocumentRegistry.Context,
          state: DocumentRegistry.SaveState
        ) => {
          const normalizedPath = ContentUtils.normalizeContentsPath(
            widget.context.path
          );
          if (state === 'completed' && this._shouldLoadOnSave(normalizedPath)) {
            const currentText = widget.context.model.toString();
            void this._queuePluginLoad(currentText, widget.context.path, {
              notifyResult: false
            });
          }
        };
        widget.context.saveState.connect(onSaveState);
        widget.disposed.connect(() => {
          widget.context.saveState.disconnect(onSaveState);
        });
      }
    );

    commandPalette.addItem({
      command: CommandIDs.loadCurrentAsExtension,
      category: 'Plugin Playground',
      args: {}
    });

    commandPalette.addItem({
      command: CommandIDs.exportAsExtension,
      category: 'Plugin Playground',
      args: {}
    });

    commandPalette.addItem({
      command: CommandIDs.shareViaLink,
      category: 'Plugin Playground',
      args: {}
    });

    app.commands.addCommand(CommandIDs.openJSImportExplorer, {
      label: 'Open Packages Reference',
      caption: 'Browse package docs, repository links, and package metadata.',
      describedBy: { args: null },
      execute: async () => {
        await app.restored;
        this._openPackagesReference();
      }
    });

    commandPalette.addItem({
      command: CommandIDs.openJSImportExplorer,
      category: 'Plugin Playground',
      args: {}
    });

    app.commands.addCommand(CommandIDs.createNewFile, {
      label: 'Start from File',
      caption:
        'Create a new TypeScript plugin file and open the playground sidebar',
      describedBy: { args: CREATE_PLUGIN_ARGS_SCHEMA },
      icon: tokenSidebarIcon,
      execute: async args => {
        const rawPathArg =
          typeof args.path === 'string' ? args.path.trim() : '';
        const isRootRelativePath = rawPathArg.startsWith('/');
        const rawCwdArg = typeof args.cwd === 'string' ? args.cwd.trim() : '';
        const normalizedCwdArg = ContentUtils.normalizeContentsPath(rawCwdArg);
        const createInPath =
          !isRootRelativePath && normalizedCwdArg ? normalizedCwdArg : '';

        const model = await app.serviceManager.contents.newUntitled({
          ...(createInPath ? { path: createInPath } : {}),
          type: 'file',
          ext: 'ts'
        });

        let openPath = model.path;
        const normalizedPathArg =
          ContentUtils.normalizeContentsPath(rawPathArg);
        if (normalizedPathArg) {
          const baseDirectory = ContentUtils.normalizeContentsPath(
            PathExt.dirname(model.path)
          );
          let targetPath = isRootRelativePath
            ? normalizedPathArg
            : ContentUtils.normalizeContentsPath(
                PathExt.join(baseDirectory, normalizedPathArg)
              );

          if (!/\.[^/]+$/.test(targetPath)) {
            targetPath = `${targetPath}.ts`;
          }

          if (targetPath !== model.path) {
            openPath = (
              await app.serviceManager.contents.rename(model.path, targetPath)
            ).path;
          }
        }

        await app.commands.execute('docmanager:open', {
          path: openPath,
          factory: 'Editor'
        });

        const normalizedOpenPath = ContentUtils.normalizeContentsPath(openPath);
        let widget: IDocumentWidget<FileEditor> | null = null;
        editorTracker.forEach(candidate => {
          if (
            !widget &&
            ContentUtils.normalizeContentsPath(candidate.context.path) ===
              normalizedOpenPath
          ) {
            widget = candidate;
          }
        });
        if (!widget) {
          widget = editorTracker.currentWidget;
        }
        const activeWidget = widget;
        if (activeWidget) {
          activeWidget.content.ready.then(() => {
            activeWidget.content.model.sharedModel.setSource(PLUGIN_TEMPLATE);
          });
        }
        this._openPlaygroundSidebar();
        return activeWidget;
      }
    });

    commandPalette.addItem({
      command: CommandIDs.createNewFile,
      category: 'Plugin Playground',
      args: {}
    });

    app.commands.addCommand(CommandIDs.createNewFileWithAI, {
      label: 'Build with AI',
      caption:
        'Create a new TypeScript plugin file and open AI chat setup for guided building',
      describedBy: { args: CREATE_PLUGIN_ARGS_SCHEMA },
      icon: offlineBoltIcon,
      execute: async args => {
        const chatStatus = await this._openJupyterLiteAIChatWithSetupFallback();
        if (chatStatus === 'provider-setup-required') {
          return null;
        }
        const activeWidget = (await app.commands.execute(
          CommandIDs.createNewFile,
          args
        )) as IDocumentWidget<FileEditor> | null;
        if (chatStatus === 'opened') {
          await this._openJupyterLiteAIChatWithSetupFallback();
        }
        return activeWidget;
      }
    });

    commandPalette.addItem({
      command: CommandIDs.createNewFileWithAI,
      category: 'Plugin Playground',
      args: {}
    });

    app.commands.addCommand(CommandIDs.takeTour, {
      label: 'Take the Tour',
      caption:
        'Open a guided walkthrough of Plugin Playground, extension examples, and AI setup',
      describedBy: { args: CREATE_PLUGIN_ARGS_SCHEMA },
      icon: infoIcon,
      execute: async args => {
        if (!hasPluginPlaygroundTourSupport(app)) {
          Notification.warning(
            `${PLUGIN_PLAYGROUND_TOUR_MISSING_HINT} Install "jupyterlab-tour" and reload JupyterLab.`,
            {
              autoClose: 7000
            }
          );
          return {
            ok: false,
            message: PLUGIN_PLAYGROUND_TOUR_MISSING_HINT
          };
        }

        try {
          await this._preparePluginPlaygroundTourContext(args);
          await launchPluginPlaygroundTour(app, this.configSectionManager);
          return { ok: true };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          Notification.warning(`Could not start the tour: ${message}`, {
            autoClose: 7000
          });
          return {
            ok: false,
            message
          };
        }
      }
    });

    commandPalette.addItem({
      command: CommandIDs.takeTour,
      category: 'Plugin Playground',
      args: {}
    });

    app.commands.addCommand(CommandIDs.listTokens, {
      label: 'List Extension Tokens (Playground)',
      caption: 'List available token strings',
      describedBy: { args: LIST_QUERY_ARGS_SCHEMA },
      execute: args => {
        const query = typeof args.query === 'string' ? args.query.trim() : '';
        const tokens = this._getTokenRecords();
        const items = filterTokenRecords(tokens, query);
        return {
          query,
          total: tokens.length,
          count: items.length,
          items: [...items]
        };
      }
    });

    app.commands.addCommand(CommandIDs.listCommands, {
      label: 'List Extension Commands (Playground)',
      caption: 'List available command IDs',
      describedBy: { args: LIST_QUERY_ARGS_SCHEMA },
      execute: args => {
        const query = typeof args.query === 'string' ? args.query.trim() : '';
        const commands = getCommandRecords(this.app);
        const items = filterCommandRecords(commands, query);
        return {
          query,
          total: commands.length,
          count: items.length,
          items: [...items]
        };
      }
    });

    app.commands.addCommand(CommandIDs.listExtensionExamples, {
      label: 'List Extension Examples (Playground)',
      caption: 'List available extension examples',
      describedBy: { args: LIST_QUERY_ARGS_SCHEMA },
      execute: async args => {
        const query = typeof args.query === 'string' ? args.query.trim() : '';
        const examples = await this._discoverExtensionExamples();
        const items = filterExampleRecords(examples, query);
        return {
          query,
          total: examples.length,
          count: items.length,
          items: [...items]
        };
      }
    });

    app.restored.then(async () => {
      await suppressWelcomeTourAtSource(this.configSectionManager);
      const settings = this.settings;
      this._updateSettings(requirejs, settings);
      this._refreshExtensionPoints();
      const tokenSidebar = new TokenSidebar({
        getTokens: this._getTokenRecords.bind(this),
        getCommands: () => getCommandRecords(this.app),
        getKnownModules: () => listKnownModules(),
        getCommandArguments: commandId =>
          getCommandArgumentDocumentation(this.app, commandId),
        getCommandArgumentCount: commandId =>
          getCommandArgumentCount(this.app, commandId),
        discoverKnownModules: force => discoverFederatedKnownModules({ force }),
        openDocumentationLink: this._openDocumentationLink.bind(this),
        onInsertImport: this._insertTokenImport.bind(this),
        isImportEnabled: this._canInsertImport.bind(this),
        onSetCommandInsertMode: this._setCommandInsertMode.bind(this),
        onInsertCommand: this._insertCommandExecution.bind(this),
        getCommandInsertMode: () => this._commandInsertMode,
        isCommandInsertEnabled: this._hasEditableEditor.bind(this)
      });
      this._tokenSidebar = tokenSidebar;
      tokenSidebar.id = 'jp-plugin-token-sidebar';
      tokenSidebar.title.label = 'Extension Points';
      tokenSidebar.title.caption = 'Available extension points for plugin';
      tokenSidebar.title.icon = tokenSidebarIcon;

      const exampleSidebar = new ExampleSidebar({
        fetchExamples: this._discoverExtensionExamples.bind(this),
        onOpenExample: this._openExtensionExample.bind(this),
        onOpenReadme: this._openExtensionExampleReadme.bind(this)
      });
      exampleSidebar.id = 'jp-plugin-example-sidebar';
      exampleSidebar.title.label = 'Extension Examples';
      exampleSidebar.title.caption =
        'Browse plugin examples from jupyterlab/extension-examples';

      const playgroundSidebar = new SidePanel();
      playgroundSidebar.id = 'jp-plugin-playground-sidebar';
      playgroundSidebar.title.caption = 'Plugin Playground helper panels';
      playgroundSidebar.title.icon = tokenSidebarIcon;
      playgroundSidebar.addWidget(tokenSidebar);
      playgroundSidebar.addWidget(exampleSidebar);
      this.app.shell.add(playgroundSidebar, 'right', { rank: 650 });
      this._playgroundSidebar = playgroundSidebar;
      this._expandPlaygroundSidebarSections();
      if (typeof window !== 'undefined') {
        const shouldOpenFromTree = window.sessionStorage.getItem(
          NOTEBOOK_TREE_OPEN_SIDEBAR_KEY
        );
        if (shouldOpenFromTree === '1') {
          window.sessionStorage.removeItem(NOTEBOOK_TREE_OPEN_SIDEBAR_KEY);
          this._openPlaygroundSidebar();
        }
        const shouldOpenAIChatFromTree = window.sessionStorage.getItem(
          NOTEBOOK_TREE_OPEN_AI_CHAT_KEY
        );
        if (shouldOpenAIChatFromTree === '1') {
          window.sessionStorage.removeItem(NOTEBOOK_TREE_OPEN_AI_CHAT_KEY);
          void this._openJupyterLiteAIChatWithSetupFallback();
        }
      }

      app.shell.currentChanged?.connect(() => {
        tokenSidebar.update();
      });
      editorTracker.currentChanged.connect(() => {
        tokenSidebar.update();
      });
      app.commands.commandChanged.connect((_, args) => {
        if (args.type === 'added' || args.type === 'removed') {
          tokenSidebar.update();
        }
      });
      // add to the launcher
      if (launcher && (settings.composite.showIconInLauncher as boolean)) {
        launcher.add({
          command: CommandIDs.createNewFile,
          category: 'Plugin Playground',
          rank: 1
        });
        launcher.add({
          command: CommandIDs.createNewFileWithAI,
          category: 'Plugin Playground',
          rank: 2
        });
        launcher.add({
          command: CommandIDs.takeTour,
          category: 'Plugin Playground',
          rank: 3
        });
      }

      const urls = settings.composite.urls as string[];
      for (const u of urls) {
        await this._getModule(u);
      }
      const plugins = settings.composite.plugins as string[];
      for (const t of plugins) {
        await this._loadPlugin(t, null);
      }
      await this._loadSharedPluginFromUrl();

      settings.changed.connect(updatedSettings => {
        this.settings = updatedSettings;
        this._updateSettings(requirejs, updatedSettings);
        tokenSidebar.update();
        for (const refresh of this._loadOnSaveToggleRefreshers) {
          refresh();
        }
      });

      this._setupLogsBadge();
    });
  }

  private _isGlobalLoadOnSaveEnabled(): boolean {
    return this.settings.get(LOAD_ON_SAVE_SETTING).composite === true;
  }

  private _isSupportedLoadOnSaveFile(path: string): boolean {
    return /\.(?:[cm]?js|jsx|ts|tsx)$/i.test(path);
  }

  private _shouldLoadOnSave(normalizedPath: string): boolean {
    if (!this._isSupportedLoadOnSaveFile(normalizedPath)) {
      return false;
    }
    if (this._isGlobalLoadOnSaveEnabled()) {
      return true;
    }
    return this._loadOnSaveByFile.has(normalizedPath);
  }

  private _createLoadOnSaveToggleWidget(
    widget: IDocumentWidget<FileEditor>
  ): Widget {
    const toggleNode = document.createElement('span');
    toggleNode.className = 'jp-PluginPlayground-loadOnSaveToggle';
    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className =
      'jp-Button jp-mod-styled jp-mod-minimal jp-PluginPlayground-loadOnSaveToggleIconButton';
    toggleButton.setAttribute('aria-label', LOAD_ON_SAVE_CHECKBOX_LABEL);
    toggleButton.setAttribute('aria-pressed', 'false');
    const icon = loadOnSaveToggleIcon.element({
      tag: 'span',
      className: 'jp-PluginPlayground-loadOnSaveIcon'
    });
    toggleButton.append(icon);
    toggleNode.append(toggleButton);

    const toggleWidget = new Widget({ node: toggleNode });
    toggleWidget.addClass('jp-PluginPlayground-loadOnSaveWidget');

    let currentPath = ContentUtils.normalizeContentsPath(widget.context.path);
    const refresh = () => {
      if (this._isGlobalLoadOnSaveEnabled()) {
        toggleButton.disabled = true;
        toggleButton.setAttribute('aria-pressed', 'false');
        toggleButton.setAttribute('aria-disabled', 'true');
        toggleNode.classList.add('jp-mod-disabled');
        toggleWidget.hide();
        return;
      }
      toggleWidget.show();
      currentPath = ContentUtils.normalizeContentsPath(widget.context.path);
      const enabled = this._isSupportedLoadOnSaveFile(currentPath);
      const isPressed = enabled && this._shouldLoadOnSave(currentPath);
      toggleButton.disabled = !enabled;
      toggleButton.setAttribute('aria-pressed', String(isPressed));
      toggleButton.setAttribute('aria-disabled', String(!enabled));
      toggleNode.classList.toggle('jp-mod-disabled', !enabled);
      const description = enabled
        ? LOAD_ON_SAVE_ENABLED_DESCRIPTION
        : LOAD_ON_SAVE_DISABLED_DESCRIPTION;
      toggleButton.title = description;
    };

    const onToggleClicked = () => {
      if (this._isGlobalLoadOnSaveEnabled()) {
        return;
      }
      if (!this._isSupportedLoadOnSaveFile(currentPath)) {
        return;
      }
      if (this._loadOnSaveByFile.has(currentPath)) {
        this._loadOnSaveByFile.delete(currentPath);
      } else {
        this._loadOnSaveByFile.add(currentPath);
      }
      for (const refreshState of this._loadOnSaveToggleRefreshers) {
        refreshState();
      }
    };

    const onPathChanged = (
      _context: DocumentRegistry.Context,
      newPath: string
    ) => {
      const newNormalizedPath = ContentUtils.normalizeContentsPath(newPath);
      if (newNormalizedPath !== currentPath) {
        if (
          this._loadOnSaveByFile.has(currentPath) &&
          !this._loadOnSaveByFile.has(newNormalizedPath)
        ) {
          this._loadOnSaveByFile.add(newNormalizedPath);
        }
        this._loadOnSaveByFile.delete(currentPath);
      }
      currentPath = newNormalizedPath;
      refresh();
    };

    toggleButton.addEventListener('click', onToggleClicked);
    widget.context.pathChanged.connect(onPathChanged);
    this._loadOnSaveToggleRefreshers.add(refresh);
    refresh();

    let isDisposed = false;
    const dispose = () => {
      if (isDisposed) {
        return;
      }
      isDisposed = true;
      toggleButton.removeEventListener('click', onToggleClicked);
      widget.context.pathChanged.disconnect(onPathChanged);
      this._loadOnSaveToggleRefreshers.delete(refresh);
    };

    toggleWidget.disposed.connect(dispose);
    widget.disposed.connect(dispose);

    return toggleWidget;
  }

  private _showSharedFileToolbarCue(
    widget: IDocumentWidget<FileEditor>,
    sourcePath: string
  ): void {
    this._dismissSharedFileCue?.();

    let isDisposed = false;
    let rafId: number | null = null;
    let hasShownFloatingHint = false;
    let remainingPositionRetries = 10;
    const normalizedSourcePath = ContentUtils.normalizeContentsPath(sourcePath);
    const loadToolbarItemSelector =
      '.jp-Toolbar > .jp-Toolbar-item[data-jp-item-name="load-as-extension"]';

    const queueHintPositionRefresh = () => {
      if (rafId !== null || isDisposed) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        if (isDisposed) {
          return;
        }
        const loadItemNode = widget.node.querySelector(
          loadToolbarItemSelector
        ) as HTMLElement | null;
        if (!loadItemNode) {
          if (!hasShownFloatingHint && remainingPositionRetries > 0) {
            remainingPositionRetries--;
            queueHintPositionRefresh();
          }
          return;
        }
        floatingHint.setPosition(
          loadItemNode.offsetLeft,
          loadItemNode.offsetTop + loadItemNode.offsetHeight + 3
        );
        if (!hasShownFloatingHint) {
          hasShownFloatingHint = true;
          floatingHint.show();
        }
      });
    };

    const disposeCue = () => {
      if (isDisposed) {
        return;
      }
      isDisposed = true;
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      widget.removeClass(URL_LOADED_EDITOR_HINT_CLASS);
      window.removeEventListener('resize', queueHintPositionRefresh);
      widget.context.pathChanged.disconnect(onPathChanged);
      widget.disposed.disconnect(disposeCue);
      if (this._sharedFileCueWidgetId === widget.id) {
        this._sharedFileCueWidgetId = null;
        this._dismissSharedFileCue = null;
      }
      floatingHint.dispose();
    };

    const floatingHint = createFloatingUrlLoadHint({
      parent: widget.node,
      title: URL_LOADED_EDITOR_HINT_TITLE,
      description: URL_LOADED_EDITOR_HINT_MESSAGE,
      closeAriaLabel: URL_LOADED_EDITOR_HINT_DISMISS_LABEL,
      onClose: disposeCue
    });

    widget.addClass(URL_LOADED_EDITOR_HINT_CLASS);
    queueHintPositionRefresh();
    window.addEventListener('resize', queueHintPositionRefresh);

    this._sharedFileCueWidgetId = widget.id;
    this._dismissSharedFileCue = disposeCue;
    const onPathChanged = (
      _context: DocumentRegistry.Context,
      newPath: string
    ) => {
      if (
        ContentUtils.normalizeContentsPath(newPath) !== normalizedSourcePath
      ) {
        disposeCue();
      }
    };
    widget.context.pathChanged.connect(onPathChanged);
    widget.disposed.connect(disposeCue);
  }

  private _queuePluginLoad(
    pluginSource: string,
    path: string,
    options: IPluginLoadQueueOptions = {}
  ): Promise<IPluginLoadResult> {
    const shouldNotify = options.notifyResult ?? true;
    const normalizedPath = ContentUtils.normalizeContentsPath(path);
    const previous = this._inFlightLoads.get(normalizedPath);
    const next = previous
      ? previous
          .catch(() => {
            /* swallow previous load error to continue queue */
          })
          .then(() => this._loadPlugin(pluginSource, path))
      : this._loadPlugin(pluginSource, path);
    const notifiedNext = next.then(result => {
      if (shouldNotify) {
        this._notifyPluginLoadResult(result, normalizedPath);
      }
      return result;
    });

    const guardedNext = notifiedNext.finally(() => {
      if (this._inFlightLoads.get(normalizedPath) === guardedNext) {
        this._inFlightLoads.delete(normalizedPath);
      }
    });

    this._inFlightLoads.set(normalizedPath, guardedNext);
    return guardedNext;
  }

  private _notifyPluginLoadResult(
    result: IPluginLoadResult,
    normalizedPath: string
  ): void {
    if (!result.ok || result.status !== 'loaded' || !normalizedPath) {
      return;
    }
    const pluginCount = result.pluginIds.length;
    const pluginLabel = pluginCount === 1 ? 'plugin' : 'plugins';
    if (
      result.skippedAutoStartPluginIds &&
      result.skippedAutoStartPluginIds.length > 0
    ) {
      Notification.warning(
        `Loaded ${pluginCount} ${pluginLabel} from "${normalizedPath}", but skipped auto-start for ${result.skippedAutoStartPluginIds.join(
          ', '
        )}.`,
        {
          autoClose: 7000
        }
      );
      return;
    }

    Notification.success(
      `Loaded ${pluginCount} ${pluginLabel} from "${normalizedPath}".`,
      {
        autoClose: 3500
      }
    );
  }

  private async _exportAsExtension(
    activePath: string,
    activeSource?: string,
    format: ExportArchiveFormat = DEFAULT_EXPORT_ARCHIVE_FORMAT
  ): Promise<IPluginExportResult> {
    const normalizedActivePath = ContentUtils.normalizeContentsPath(activePath);
    if (!normalizedActivePath) {
      return {
        ok: false,
        archiveName: null,
        rootPath: null,
        fileCount: 0,
        message: 'Export path is empty.'
      };
    }

    try {
      const source =
        activeSource ??
        (await this._readSourceFileForExport(normalizedActivePath));
      const exportContext = await this._resolveExportContext(
        normalizedActivePath,
        source
      );
      if (exportContext.archiveEntries.length === 0) {
        const message = `No files were found in "${exportContext.rootPath}".`;
        Notification.warning(message, {
          autoClose: 5000
        });
        return {
          ok: false,
          archiveName: null,
          rootPath: exportContext.rootPath,
          fileCount: 0,
          message
        };
      }
      let archiveName = exportContext.archiveName;
      let archiveEntries = exportContext.archiveEntries;
      if (format === 'wheel') {
        const wheelArchive = await createPythonWheelArchive(
          exportContext.archiveEntries,
          exportContext.rootPath
        );
        archiveName = wheelArchive.filename;
        archiveEntries = wheelArchive.entries;
      }
      downloadArchive(archiveEntries, archiveName);
      const exportedFileCount = archiveEntries.length;
      const templateMessage = exportContext.usedTemplate
        ? ' A minimal extension-template scaffold was generated from the active file.'
        : '';

      Notification.success(
        `Downloaded "${archiveName}" with ` +
          `${exportedFileCount} file` +
          `${exportedFileCount === 1 ? '' : 's'} from ` +
          `"${exportContext.rootPath}".${templateMessage}`,
        {
          autoClose: 5000
        }
      );

      return {
        ok: true,
        archiveName,
        rootPath: exportContext.rootPath,
        fileCount: exportedFileCount
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Notification.error(`Extension export failed: ${message}`, {
        autoClose: false
      });
      return {
        ok: false,
        archiveName: null,
        rootPath: normalizedActivePath || null,
        fileCount: 0,
        message
      };
    }
  }

  /**
   * Build a share URL for a single file and copy it to clipboard.
   */
  public async shareViaLink(path?: string): Promise<IPluginShareResult> {
    const requestedPath =
      typeof path === 'string' ? ContentUtils.normalizeContentsPath(path) : '';
    const currentWidget = this.editorTracker.currentWidget;
    const currentPath = currentWidget
      ? ContentUtils.normalizeContentsPath(currentWidget.context.path)
      : '';
    const activeSource =
      currentWidget && currentPath && currentPath === requestedPath
        ? currentWidget.context.model.toString()
        : undefined;

    if (requestedPath) {
      return this._shareViaLink(requestedPath, activeSource);
    }

    if (!currentWidget || currentWidget !== this.app.shell.currentWidget) {
      return {
        ok: false,
        link: null,
        sourcePath: null,
        urlLength: 0,
        message:
          'No active editor is available. Pass a path argument to share a specific file.'
      };
    }

    return this._shareViaLink(
      ContentUtils.normalizeContentsPath(currentWidget.context.path),
      currentWidget.context.model.toString()
    );
  }

  /**
   * Build a share URL for a single file and copy it to clipboard.
   */
  private async _shareViaLink(
    sourcePath: string,
    activeSource?: string
  ): Promise<IPluginShareResult> {
    const normalizedSourcePath = ContentUtils.normalizeContentsPath(sourcePath);
    if (!normalizedSourcePath) {
      return {
        ok: false,
        link: null,
        sourcePath: null,
        urlLength: 0,
        message: 'Share path is empty.'
      };
    }

    try {
      const directory = await ContentUtils.getDirectoryModel(
        this.app.serviceManager,
        normalizedSourcePath
      );
      if (directory) {
        throw new Error(
          'Folder sharing is temporarily disabled. Pass a file path instead.'
        );
      }
      const source =
        activeSource ??
        (await this._readSourceFileForExport(normalizedSourcePath));
      const fileName = PathExt.basename(normalizedSourcePath) || 'plugin.ts';

      const payload: ShareLink.ISharedPluginPayload = {
        version: 1,
        fileName,
        source
      };
      const encodedPayload = await ShareLink.encodeSharedPluginPayload(payload);
      const link = ShareLink.createSharedPluginUrl(encodedPayload);
      const urlLength = link.length;

      if (urlLength > SHARE_URL_MAX_LENGTH) {
        const message =
          `The generated link is ${urlLength} characters long, which exceeds the configured limit ` +
          `(${SHARE_URL_MAX_LENGTH}). Share a smaller file or use "Export Plugin Folder As Extension".`;
        Notification.error(message, {
          autoClose: false
        });
        return {
          ok: false,
          link: null,
          sourcePath: normalizedSourcePath,
          urlLength,
          message
        };
      }

      await ContentUtils.copyValueToClipboard(link);
      ContentUtils.setCopiedStateWithTimeout(
        CommandIDs.shareViaLink,
        this._copiedCommandTimer,
        timer => {
          this._copiedCommandTimer = timer;
        },
        copiedCommandId => {
          this._copiedCommandId = copiedCommandId;
        },
        () => {
          this.app.commands.notifyCommandChanged(CommandIDs.shareViaLink);
        },
        1400
      );
      const details =
        `Copied a share link for file "${normalizedSourcePath}" ` +
        `(${urlLength} characters).`;

      if (urlLength > SHARE_URL_WARN_LENGTH) {
        Notification.warning(
          `${details} Some browsers may reject very long URLs.`,
          {
            autoClose: 7000
          }
        );
      } else {
        Notification.success(details, {
          autoClose: 5000
        });
      }

      return {
        ok: true,
        link,
        sourcePath: normalizedSourcePath,
        urlLength
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Notification.error(`Plugin share link creation failed: ${message}`, {
        autoClose: false
      });
      return {
        ok: false,
        link: null,
        sourcePath: normalizedSourcePath,
        urlLength: 0,
        message
      };
    }
  }

  /**
   * Restore a shared file from URL token into a workspace folder and open it.
   * The file is not executed automatically.
   */
  private async _loadSharedPluginFromUrl(): Promise<void> {
    const sharedToken = ShareLink.getSharedPluginTokenFromLocation();
    if (!sharedToken) {
      return;
    }
    // Remove the token immediately so a refresh/back navigation does not
    // repeatedly re-import the same shared payload.
    ShareLink.clearSharedPluginTokenFromLocation();

    try {
      const payload = await ShareLink.decodeSharedPluginPayload(sharedToken);
      const fileName = PathExt.basename(payload.fileName) || 'plugin.ts';
      const extension = PathExt.extname(fileName);
      const rootName = extension
        ? fileName.slice(0, -extension.length)
        : fileName;
      const rootFolder = ShareLink.sharedPluginFolderName(
        rootName,
        sharedToken
      );
      const rootPath = ContentUtils.normalizeContentsPath(
        this._joinPath(SHARED_LINKS_ROOT, rootFolder)
      );
      await ContentUtils.ensureContentsDirectory(
        this.app.serviceManager,
        rootPath
      );

      const baseName = extension
        ? fileName.slice(0, -extension.length)
        : fileName;
      let entryPath = '';
      let shouldWrite = false;
      const maxVariants = 1000;

      for (let variant = 1; variant <= maxVariants; variant++) {
        const candidateName =
          variant === 1 ? fileName : `${baseName}-${variant}${extension}`;
        const candidatePath = ContentUtils.normalizeContentsPath(
          this._joinPath(rootPath, candidateName)
        );
        const existingFile = await ContentUtils.getFileModel(
          this.app.serviceManager,
          candidatePath
        );

        if (!existingFile) {
          entryPath = candidatePath;
          shouldWrite = true;
          break;
        }

        const existingSource = ContentUtils.fileModelToText(existingFile);
        if (existingSource === payload.source) {
          entryPath = candidatePath;
          shouldWrite = false;
          break;
        }
      }

      if (!entryPath) {
        throw new Error(
          `Could not find a writable location for shared file "${fileName}" in "${rootPath}".`
        );
      }
      let restoredPath = entryPath;
      if (shouldWrite) {
        const saved = await this.app.serviceManager.contents.save(entryPath, {
          type: 'file',
          format: 'text',
          content: payload.source
        });
        if (!saved || saved.type !== 'file') {
          throw new Error(
            `Failed to save shared file "${fileName}" at "${entryPath}".`
          );
        }
        const normalizedSavedPath = ContentUtils.normalizeContentsPath(
          saved.path
        );
        if (normalizedSavedPath !== entryPath) {
          throw new Error(
            `Shared file was saved to unexpected path "${normalizedSavedPath}" instead of "${entryPath}".`
          );
        }
      }
      let restoredFile = await ContentUtils.getFileModel(
        this.app.serviceManager,
        entryPath
      );
      for (let attempt = 0; !restoredFile && attempt < 8; attempt++) {
        await new Promise<void>(resolve => {
          window.setTimeout(resolve, 75);
        });
        restoredFile = await ContentUtils.getFileModel(
          this.app.serviceManager,
          entryPath
        );
      }
      if (!restoredFile) {
        throw new Error(
          `Shared file "${entryPath}" could not be found after restore.`
        );
      }
      restoredPath = ContentUtils.normalizeContentsPath(restoredFile.path);

      await this.app.commands.execute('docmanager:open', {
        path: restoredPath,
        factory: 'Editor'
      });
      let restoredWidget: IDocumentWidget<FileEditor> | null = null;
      this.editorTracker.forEach(candidate => {
        if (
          !restoredWidget &&
          ContentUtils.normalizeContentsPath(candidate.context.path) ===
            restoredPath
        ) {
          restoredWidget = candidate;
        }
      });
      if (restoredWidget) {
        this._showSharedFileToolbarCue(restoredWidget, restoredPath);
      }
      Notification.success(
        `Opened shared plugin from URL at "${restoredPath}" (1 file). `,
        {
          autoClose: 6000
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Notification.error(`Failed to load shared plugin from URL: ${message}`, {
        autoClose: false
      });
    }
  }

  private async _readSourceFileForExport(path: string): Promise<string> {
    const source = await ContentUtils.readContentsFileAsText(
      this.app.serviceManager,
      path
    );
    if (source === null) {
      throw new Error(
        `Could not read file "${path}" as text. The file may not exist or may not be readable as text.`
      );
    }
    return source;
  }

  private async _resolveExportContext(
    activePath: string,
    activeSource: string
  ): Promise<IResolvedExportContext> {
    const rootPath = await this._inferExportRoot(activePath);
    if (rootPath !== null) {
      const overrides = new Map<string, Uint8Array>([
        [
          ContentUtils.normalizeContentsPath(activePath),
          new TextEncoder().encode(activeSource)
        ]
      ]);
      const archiveEntries = await this._collectArchiveEntries(
        rootPath,
        overrides
      );
      return {
        archiveName: `${PathExt.basename(rootPath) || 'plugin-extension'}.zip`,
        rootPath,
        archiveEntries,
        usedTemplate: false
      };
    }

    const templateArchive = createTemplateArchive(activePath, activeSource);
    return {
      archiveName: `${templateArchive.projectRoot}.zip`,
      rootPath: templateArchive.projectRoot,
      archiveEntries: templateArchive.entries,
      usedTemplate: true
    };
  }

  private async _inferExportRoot(path: string): Promise<string | null> {
    const normalizedPath = ContentUtils.normalizeContentsPath(path);
    const inferredRoot = this._inferRootFromSourcePath(normalizedPath);
    if (inferredRoot !== null) {
      const inferredRootDirectory = await ContentUtils.getDirectoryModel(
        this.app.serviceManager,
        inferredRoot
      );
      if (inferredRootDirectory) {
        return ContentUtils.normalizeContentsPath(inferredRootDirectory.path);
      }
    }

    const sourceDirectory = ContentUtils.normalizeContentsPath(
      PathExt.dirname(normalizedPath)
    ).replace(/^\.$/, '');
    if (!sourceDirectory) {
      return null;
    }

    const detectedRoot = await this._findExtensionRoot(sourceDirectory);
    if (detectedRoot !== null) {
      return detectedRoot;
    }

    const sourceDirectoryModel = await ContentUtils.getDirectoryModel(
      this.app.serviceManager,
      sourceDirectory
    );
    if (!sourceDirectoryModel) {
      throw new Error(`Could not access folder "${sourceDirectory}".`);
    }

    return (
      ContentUtils.normalizeContentsPath(sourceDirectoryModel.path) ||
      sourceDirectory
    );
  }

  private _inferRootFromSourcePath(path: string): string | null {
    const segments = ContentUtils.normalizeContentsPath(path).split('/');
    const srcIndex = segments.indexOf('src');
    if (srcIndex < 0) {
      return null;
    }
    if (srcIndex === 0) {
      return '';
    }
    return segments.slice(0, srcIndex).join('/');
  }

  private async _collectArchiveEntries(
    rootPath: string,
    overrides: ReadonlyMap<string, Uint8Array> = new Map()
  ): Promise<IArchiveEntry[]> {
    const normalizedRootPath = ContentUtils.normalizeContentsPath(rootPath);
    const archiveEntries: IArchiveEntry[] = [];
    await this._collectArchiveEntriesInDirectory(
      normalizedRootPath,
      normalizedRootPath,
      archiveEntries,
      overrides
    );
    return archiveEntries.sort((left, right) =>
      left.path.localeCompare(right.path)
    );
  }

  private async _collectArchiveEntriesInDirectory(
    rootPath: string,
    directoryPath: string,
    archiveEntries: IArchiveEntry[],
    overrides: ReadonlyMap<string, Uint8Array>
  ): Promise<void> {
    const directory = await ContentUtils.getDirectoryModel(
      this.app.serviceManager,
      directoryPath
    );
    if (!directory) {
      throw new Error(`Could not read directory "${directoryPath}".`);
    }

    const nestedDirectories: string[] = [];
    const filePaths: string[] = [];

    for (const item of directory.content) {
      if (item.type !== 'directory' && item.type !== 'file') {
        continue;
      }
      if (
        item.type === 'directory' &&
        this._shouldSkipArchiveDirectory(item.name)
      ) {
        continue;
      }

      const itemPath = ContentUtils.normalizeContentsPath(item.path);
      if (!itemPath) {
        continue;
      }

      if (item.type === 'directory') {
        nestedDirectories.push(itemPath);
      } else {
        filePaths.push(itemPath);
      }
    }

    for (const nestedDirectory of nestedDirectories) {
      await this._collectArchiveEntriesInDirectory(
        rootPath,
        nestedDirectory,
        archiveEntries,
        overrides
      );
    }

    const fileEntries = await this._mapWithConcurrency(
      filePaths,
      ARCHIVE_FILE_READ_CONCURRENCY,
      async filePath =>
        this._createArchiveEntryForFile(rootPath, filePath, overrides)
    );
    for (const entry of fileEntries) {
      if (entry) {
        archiveEntries.push(entry);
      }
    }
  }

  private async _createArchiveEntryForFile(
    rootPath: string,
    filePath: string,
    overrides: ReadonlyMap<string, Uint8Array>
  ): Promise<IArchiveEntry | null> {
    const overrideBytes = overrides.get(filePath);
    let fileBytes = overrideBytes ?? null;

    if (!fileBytes) {
      const fileModel = await ContentUtils.getFileModel(
        this.app.serviceManager,
        filePath
      );
      if (!fileModel) {
        throw new Error(`Could not read file "${filePath}".`);
      }
      fileBytes = ContentUtils.fileModelToBytes(fileModel);
      if (!fileBytes) {
        throw new Error(
          `Could not export file "${filePath}" because it is not readable as text or bytes.`
        );
      }
    }

    const relativePath = this._relativePath(rootPath, filePath);
    if (!relativePath) {
      return null;
    }

    return {
      path: relativePath,
      data: fileBytes
    };
  }

  private _relativePath(rootPath: string, path: string): string {
    const normalizedRootPath = ContentUtils.normalizeContentsPath(
      rootPath
    ).replace(/\/+$/g, '');
    const normalizedPath = ContentUtils.normalizeContentsPath(path);
    if (!normalizedRootPath) {
      return normalizedPath;
    }
    if (normalizedPath.startsWith(`${normalizedRootPath}/`)) {
      return normalizedPath.slice(normalizedRootPath.length + 1);
    }
    return normalizedPath;
  }

  private async _findExtensionRoot(
    startDirectory: string
  ): Promise<string | null> {
    let current = ContentUtils.normalizeContentsPath(startDirectory).replace(
      /\/+$/g,
      ''
    );
    while (true) {
      const packageJsonPath = current
        ? `${current}/package.json`
        : 'package.json';
      const packageJson = await ContentUtils.getFileModel(
        this.app.serviceManager,
        packageJsonPath
      );
      if (packageJson) {
        return current;
      }
      if (!current) {
        return null;
      }
      const parent = ContentUtils.normalizeContentsPath(
        PathExt.dirname(current)
      ).replace(/^\.$/, '');
      if (parent === current) {
        return null;
      }
      current = parent;
    }
  }

  private async _mapWithConcurrency<T, R>(
    items: ReadonlyArray<T>,
    concurrency: number,
    mapper: (item: T) => Promise<R>
  ): Promise<R[]> {
    if (items.length === 0) {
      return [];
    }

    const results = new Array<R>(items.length);
    const workerCount = Math.max(1, Math.min(concurrency, items.length));
    let nextIndex = 0;

    const workers = Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index]);
      }
    });

    await Promise.all(workers);
    return results;
  }

  private _shouldSkipArchiveDirectory(name: string): boolean {
    return ARCHIVE_EXCLUDED_DIRECTORIES.has(name);
  }

  private _updateSettings(
    requirejs: IRequireJS,
    settings: ISettingRegistry.ISettings
  ) {
    const baseURL = settings.composite.requirejsCDN as string;
    requirejs.require.config({
      baseUrl: baseURL
    });

    const composite = settings.composite as Record<string, unknown>;
    const rawCommandInsertMode = this._stringValue(
      composite[COMMAND_INSERT_DEFAULT_MODE_SETTING]
    );
    this._commandInsertMode =
      rawCommandInsertMode === 'ai' ? 'ai' : DEFAULT_COMMAND_INSERT_MODE;
  }

  private _getTokenRecords(): ReadonlyArray<TokenSidebar.ITokenRecord> {
    if (this._tokenMap.size === 0) {
      try {
        this._populateTokenMap();
      } catch (error) {
        console.warn(
          'Failed to discover token names for listing extension points',
          error
        );
      }
    }
    return Array.from(this._tokenMap.keys())
      .sort((left, right) => left.localeCompare(right))
      .map(name => ({
        name,
        description: this._tokenDescriptionMap.get(name) ?? ''
      }));
  }

  private async _loadPlugin(
    code: string,
    path: string | null
  ): Promise<IPluginLoadResult> {
    if (this._tokenMap.size === 0) {
      try {
        this._populateTokenMap();
      } catch (error) {
        console.warn(
          'Failed to discover token names while loading plugin',
          error
        );
      }
    }
    const importResolver = new ImportResolver({
      loadKnownModule: loadKnownModule,
      tokenMap: this._tokenMap,
      requirejs: this.requirejs,
      settings: this.settings,
      serviceManager: this.app.serviceManager,
      basePath: path
    });

    const pluginLoader = new PluginLoader({
      transpiler: new PluginTranspiler({
        compilerOptions: {
          target: ts.ScriptTarget.ES2017,
          jsx: ts.JsxEmit.React,
          esModuleInterop: true
        }
      }),
      importFunction: importResolver.resolve.bind(importResolver),
      tokenMap: this._tokenMap,
      serviceManager: this.app.serviceManager,
      requirejs: this.requirejs
    });
    importResolver.dynamicLoader = pluginLoader.loadFile.bind(pluginLoader);

    let result: PluginLoader.IResult;
    try {
      result = await pluginLoader.load(code, path);
    } catch (error) {
      importResolver.rollbackLocalStyleMutations();
      if (error instanceof PluginLoadingError) {
        const internalError = error.error;
        showDialog({
          title: `Plugin loading failed: ${internalError.message}`,
          body: formatErrorWithResult(error, error.partialResult)
        });
        return {
          status: 'loading-failed',
          ok: false,
          path,
          pluginIds: [],
          transpiled: null,
          message: internalError.message
        };
      }

      const message = error instanceof Error ? error.message : String(error);
      showErrorMessage('Plugin loading failed', message);
      return {
        status: 'loading-failed',
        ok: false,
        path,
        pluginIds: [],
        transpiled: null,
        message
      };
    }

    const plugins = result.plugins.map(plugin =>
      this._ensureDeactivateSupport(plugin)
    );
    const pluginIds = plugins.map(plugin => plugin.id);
    const skippedAutoStartPluginIds: string[] = [];
    const loadedLocalStylePaths = importResolver.loadedLocalStylePaths;
    const newlyRegisteredPluginIds: string[] = [];

    try {
      for (const declaredStylePath of result.declaredStylePaths) {
        if (!path) {
          continue;
        }
        const normalizedImportPath = ContentUtils.normalizeContentsPath(path);
        const normalizedDeclaredStylePath =
          ContentUtils.normalizeContentsPath(declaredStylePath);
        const importBaseDirectory = PathExt.dirname(normalizedImportPath);
        const relativeStylePath = PathExt.relative(
          importBaseDirectory,
          normalizedDeclaredStylePath
        );
        const styleModule = relativeStylePath.startsWith('.')
          ? relativeStylePath
          : `./${relativeStylePath}`;
        await importResolver.resolve(styleModule);
      }

      for (const plugin of plugins) {
        const schema = result.schemas[plugin.id];
        if (!schema) {
          continue;
        }
        // TODO: this is mostly fine to get the menus and toolbars, but:
        // - transforms are not applied
        // - any refresh from the server might overwrite the data
        // - it is not a good long term solution in general
        this.settingRegistry.plugins[plugin.id] = {
          id: plugin.id,
          schema: JSON.parse(schema),
          raw: schema,
          data: {
            composite: {},
            user: {}
          },
          version: '0.0.0'
        };
        (
          this.settingRegistry.pluginChanged as Signal<ISettingRegistry, string>
        ).emit(plugin.id);
      }

      for (const plugin of plugins) {
        await this._deactivateAndDeregisterPlugin(plugin.id);
        this.app.registerPlugin(plugin);
        newlyRegisteredPluginIds.push(plugin.id);
      }
      this._refreshExtensionPoints();
    } catch (error) {
      importResolver.rollbackLocalStyleMutations();
      for (let i = newlyRegisteredPluginIds.length - 1; i >= 0; i--) {
        try {
          await this._deactivateAndDeregisterPlugin(
            newlyRegisteredPluginIds[i]
          );
        } catch (cleanupError) {
          console.warn(
            `Failed to clean up partially registered plugin "${newlyRegisteredPluginIds[i]}"`,
            cleanupError
          );
        }
      }
      const message = error instanceof Error ? error.message : String(error);
      showErrorMessage('Plugin loading failed', message);
      return {
        status: 'loading-failed',
        ok: false,
        path,
        pluginIds: [],
        transpiled: null,
        message
      };
    }

    importResolver.commitLocalStyleMutations();
    for (const plugin of plugins) {
      this._syncPluginLocalStyles(plugin.id, loadedLocalStylePaths);
    }

    for (const plugin of plugins) {
      if (!plugin.autoStart) {
        continue;
      }
      const missingRequiredTokens = this._missingRequiredTokens(plugin);
      if (missingRequiredTokens.length > 0) {
        console.warn(
          `Skipping plugin ${
            plugin.id
          }: missing required services ${missingRequiredTokens.join(', ')}`
        );
        skippedAutoStartPluginIds.push(plugin.id);
        continue;
      }
      try {
        await this.app.activatePlugin(plugin.id);
        this._refreshExtensionPoints();
      } catch (error) {
        const normalizedError =
          error instanceof Error ? error : new Error(String(error));
        const message = normalizedError.message;
        const skippedAutoStartPluginIdsResult =
          skippedAutoStartPluginIds.length > 0
            ? skippedAutoStartPluginIds
            : undefined;
        showDialog({
          title: `Plugin autostart failed: ${message}`,
          body: formatErrorWithResult(normalizedError, result)
        });
        return {
          status: 'autostart-failed',
          ok: false,
          path,
          pluginIds,
          transpiled: result.transpiled,
          message,
          skippedAutoStartPluginIds: skippedAutoStartPluginIdsResult
        };
      }
    }

    const skippedAutoStartPluginIdsResult =
      skippedAutoStartPluginIds.length > 0
        ? skippedAutoStartPluginIds
        : undefined;
    return {
      status: 'loaded',
      ok: true,
      path,
      pluginIds,
      transpiled: result.transpiled,
      skippedAutoStartPluginIds: skippedAutoStartPluginIdsResult
    };
  }

  private _refreshExtensionPoints(): void {
    try {
      this._populateTokenMap();
    } catch (error) {
      console.warn(
        'Failed to discover token names for the playground sidebar',
        error
      );
    }

    this._tokenSidebar?.update();
  }

  private _syncPluginLocalStyles(
    pluginId: string,
    nextPaths: ReadonlySet<string>
  ): void {
    const previousPaths = this._pluginLocalStylePaths.get(pluginId);
    if (previousPaths) {
      for (const previousPath of previousPaths) {
        if (nextPaths.has(previousPath)) {
          continue;
        }
        if (this._isStylePathUsedByOtherPlugins(previousPath, pluginId)) {
          continue;
        }
        ImportResolver.removeLocalStyles([previousPath]);
      }
    }

    if (nextPaths.size === 0) {
      this._pluginLocalStylePaths.delete(pluginId);
      return;
    }
    this._pluginLocalStylePaths.set(pluginId, new Set(nextPaths));
  }

  private _isStylePathUsedByOtherPlugins(
    stylePath: string,
    excludedPluginId: string
  ): boolean {
    for (const [pluginId, paths] of this._pluginLocalStylePaths) {
      if (pluginId === excludedPluginId) {
        continue;
      }
      if (paths.has(stylePath)) {
        return true;
      }
    }
    return false;
  }

  public async registerKnownModule(known: IKnownModule): Promise<void> {
    registerKnownModule(known);
    this._tokenSidebar?.update();
  }

  private _openPlaygroundSidebar(): void {
    if (!this._playgroundSidebar) {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(NOTEBOOK_TREE_OPEN_SIDEBAR_KEY, '1');
      }
      return;
    }

    this.app.shell.activateById(this._playgroundSidebar.id);
    (this._playgroundSidebar.content as AccordionPanel).expand(0);
  }

  private _expandPlaygroundSidebarSections(): void {
    if (!this._playgroundSidebar) {
      return;
    }
    const content = this._playgroundSidebar.content;
    if (content instanceof AccordionPanel) {
      content.expand(0);
      content.expand(1);
    }
  }

  private async _preparePluginPlaygroundTourContext(
    args: ReadonlyPartialJSONObject
  ): Promise<void> {
    const hasActiveEditor =
      this.editorTracker.currentWidget !== null &&
      this.editorTracker.currentWidget === this.app.shell.currentWidget;

    if (!hasActiveEditor) {
      await this.app.commands.execute(CommandIDs.createNewFile, args);
    }

    this._openPlaygroundSidebar();
    this._expandPlaygroundSidebarSections();
  }

  private _openPackagesReference(): void {
    if (!this._tokenSidebar) {
      return;
    }

    this._tokenSidebar.showPackagesView();
    this._openPlaygroundSidebar();
  }

  private _openDocumentationLink(
    url: string,
    moduleName: string,
    openInBrowserTab: boolean
  ): void {
    const safeUrl = ContentUtils.normalizeExternalUrl(url);
    if (!safeUrl) {
      void showDialog({
        title: 'Invalid documentation URL',
        body: `Could not open docs for "${moduleName}" because the URL is invalid.`,
        buttons: [Dialog.okButton()]
      });
      return;
    }

    if (openInBrowserTab) {
      ContentUtils.openExternalLink(safeUrl);
      return;
    }

    const existingWidget = this._documentationWidgets.get(safeUrl);
    if (existingWidget && !existingWidget.isDisposed) {
      this.app.shell.activateById(existingWidget.id);
      return;
    }

    const iframe = new IFrame({
      sandbox: ['allow-scripts', 'allow-popups']
    });
    iframe.url = safeUrl;

    const widget = new MainAreaWidget({ content: iframe });
    widget.id = `jp-plugin-package-doc-${this._documentationWidgetId}`;
    this._documentationWidgetId += 1;
    widget.title.label = `${moduleName} Docs`;
    widget.title.caption = safeUrl;
    widget.title.closable = true;
    widget.disposed.connect(() => {
      if (this._documentationWidgets.get(safeUrl) === widget) {
        this._documentationWidgets.delete(safeUrl);
      }
    });

    this._documentationWidgets.set(safeUrl, widget);
    this.app.shell.add(widget, 'main');
    this.app.shell.activateById(widget.id);
  }

  private _missingRequiredTokens(
    plugin: IPlugin<JupyterFrontEnd, unknown>
  ): string[] {
    try {
      this._populateTokenMap();
    } catch {
      return (plugin.requires ?? []).map(token => token.name);
    }

    return (plugin.requires ?? [])
      .filter(token => !this._tokenMap.has(token.name))
      .map(token => token.name);
  }

  private _ensureDeactivateSupport(
    plugin: IPlugin<JupyterFrontEnd, unknown>
  ): IPlugin<JupyterFrontEnd, unknown> {
    const trackedCommandDisposables: Array<{ dispose: () => void }> = [];
    const originalActivate = plugin.activate;
    const originalDeactivate = plugin.deactivate;

    plugin.activate = async (app: JupyterFrontEnd, ...services: unknown[]) => {
      const originalAddCommand = app.commands.addCommand.bind(app.commands);
      app.commands.addCommand = ((id, options) => {
        const disposable = originalAddCommand(id, options);
        trackedCommandDisposables.push(disposable);
        return disposable;
      }) as typeof app.commands.addCommand;

      try {
        return await originalActivate(app, ...services);
      } catch (error) {
        this._disposeTrackedCommands(trackedCommandDisposables);
        throw error;
      } finally {
        app.commands.addCommand = originalAddCommand;
      }
    };

    plugin.deactivate = async (
      app: JupyterFrontEnd,
      ...services: unknown[]
    ) => {
      try {
        if (originalDeactivate) {
          await originalDeactivate(app, ...services);
        }
      } finally {
        this._disposeTrackedCommands(trackedCommandDisposables);
      }
    };

    return plugin;
  }

  private _disposeTrackedCommands(
    trackedCommandDisposables: Array<{ dispose: () => void }>
  ): void {
    while (trackedCommandDisposables.length > 0) {
      const disposable = trackedCommandDisposables.pop();
      if (!disposable) {
        continue;
      }
      try {
        disposable.dispose();
      } catch (error) {
        console.warn('Failed to dispose plugin command registration', error);
      }
    }
  }

  private async _deactivateAndDeregisterPlugin(
    pluginId: string
  ): Promise<void> {
    if (!this.app.hasPlugin(pluginId)) {
      return;
    }

    if (this.app.isPluginActivated(pluginId)) {
      try {
        await this.app.deactivatePlugin(pluginId);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown deactivation error';
        await showDialog({
          title: 'Plugin deactivation failed',
          body:
            `Could not deactivate "${pluginId}" before reload. ` +
            'Falling back to forced reload. Add `deactivate()` to the plugin ' +
            'and dependent plugins for clean reruns. ' +
            message,
          buttons: [Dialog.okButton()]
        });
      }
    }

    if (this.app.hasPlugin(pluginId)) {
      this.app.deregisterPlugin(pluginId, true);
    }
  }

  private async _getModule(url: string) {
    const response = await fetch(url);
    const jsBody = await response.text();
    this._loadPlugin(jsBody, null);
  }

  private async _openExtensionExample(examplePath: string): Promise<void> {
    await this._openExampleFile(examplePath);
  }

  private async _openExtensionExampleReadme(readmePath: string): Promise<void> {
    if (this.app.commands.hasCommand('markdownviewer:open')) {
      await this.app.commands.execute('markdownviewer:open', {
        path: readmePath
      });
      return;
    }

    await this._openExampleFile(readmePath);
  }

  private async _openExampleFile(path: string): Promise<void> {
    await this.app.commands.execute('docmanager:open', {
      path: ContentUtils.normalizeContentsPath(path),
      factory: 'Editor'
    });
  }

  private async _discoverExtensionExamples(): Promise<
    ReadonlyArray<ExampleSidebar.IExampleRecord>
  > {
    const rootDirectory = await ContentUtils.getDirectoryModel(
      this.app.serviceManager,
      EXTENSION_EXAMPLES_ROOT
    );
    if (!rootDirectory) {
      return [];
    }
    const rootPath =
      ContentUtils.normalizeContentsPath(rootDirectory.path) ||
      EXTENSION_EXAMPLES_ROOT;

    const discovered: ExampleSidebar.IExampleRecord[] = [];
    for (const item of rootDirectory.content) {
      if (item.type !== 'directory' || item.name.startsWith('.')) {
        continue;
      }
      const exampleDirectory = this._joinPath(rootPath, item.name);
      const entrypoint = await this._findExampleEntrypoint(exampleDirectory);
      if (!entrypoint) {
        continue;
      }
      const description = await this._readExampleDescription(exampleDirectory);
      discovered.push({
        name: item.name,
        path: entrypoint,
        readmePath: ContentUtils.normalizeContentsPath(
          this._joinPath(exampleDirectory, 'README.md')
        ),
        description
      });
    }

    return discovered.sort((left, right) =>
      left.name.localeCompare(right.name)
    );
  }

  private async _findExampleEntrypoint(
    directoryPath: string
  ): Promise<string | null> {
    const srcDirectory = await ContentUtils.getDirectoryModel(
      this.app.serviceManager,
      this._joinPath(directoryPath, 'src')
    );
    if (!srcDirectory) {
      return null;
    }
    const entrypoint = srcDirectory.content.find(
      (item: Contents.IModel) =>
        item.type === 'file' &&
        (item.name === 'index.ts' || item.name === 'index.js')
    );
    if (!entrypoint) {
      return null;
    }
    return ContentUtils.normalizeContentsPath(
      this._joinPath(srcDirectory.path, entrypoint.name)
    );
  }

  private async _readExampleDescription(
    directoryPath: string
  ): Promise<string> {
    const packageJsonPath = this._joinPath(directoryPath, 'package.json');
    const packageJson = await ContentUtils.getFileModel(
      this.app.serviceManager,
      packageJsonPath
    );
    if (!packageJson) {
      return this._fallbackExampleDescription;
    }
    const packageData = ContentUtils.fileModelToJsonObject(packageJson);

    if (packageData) {
      const description = this._stringValue(packageData.description);
      if (description) {
        return description;
      }
    }

    return this._fallbackExampleDescription;
  }

  private _joinPath(base: string, child: string): string {
    const normalizedBase = base.replace(/\/+$/g, '');
    const normalizedChild = ContentUtils.normalizeContentsPath(child);
    if (!normalizedBase) {
      return normalizedChild;
    }
    return `${normalizedBase}/${normalizedChild}`;
  }

  private _populateTokenMap(): void {
    const app = this.app as unknown as IPrivateServiceStore;
    this._tokenMap.clear();
    this._tokenDescriptionMap.clear();

    const tokenMaps: Array<Map<Token<string>, string> | undefined> = [
      // Lumino 1.x
      app._serviceMap,
      // Some Lumino 2.x builds
      app._services,
      app._delegate?._serviceMap,
      app._delegate?._services,
      // Lumino 2.x plugin registry (JupyterLab 4.x)
      app.pluginRegistry?._services,
      app._delegate?.pluginRegistry?._services
    ];
    const pluginMaps = [
      app.pluginRegistry?._plugins,
      app._delegate?.pluginRegistry?._plugins
    ];
    const pluginDescriptions = new Map<string, string>();
    for (const pluginMap of pluginMaps) {
      if (!pluginMap) {
        continue;
      }
      for (const [pluginId, pluginData] of pluginMap.entries()) {
        const description =
          this._stringValue(pluginData.description) ||
          this._stringValue(pluginData.plugin?.description);
        if (description) {
          pluginDescriptions.set(pluginId, description);
        }
      }
    }

    for (const tokenMap of tokenMaps) {
      if (!tokenMap) {
        continue;
      }
      for (const [token, pluginId] of tokenMap.entries()) {
        this._setToken(token, pluginDescriptions.get(pluginId) ?? '');
      }
    }

    if (this._tokenMap.size === 0) {
      for (const pluginMap of pluginMaps) {
        if (!pluginMap) {
          continue;
        }
        for (const [pluginId, pluginData] of pluginMap.entries()) {
          const pluginDescription =
            pluginDescriptions.get(pluginId) ||
            this._stringValue(pluginData.description) ||
            this._stringValue(pluginData.plugin?.description);
          if (pluginData.provides) {
            this._setToken(pluginData.provides, pluginDescription);
          }
          for (const token of pluginData.requires ?? []) {
            this._setToken(token, pluginDescription);
          }
          for (const token of pluginData.optional ?? []) {
            this._setToken(token, pluginDescription);
          }
        }
      }
    }

    // Widget registry does not follow convention of importName:tokenName
    const widgetRegistryToken = this._tokenMap.get(
      'jupyter.extensions.jupyterWidgetRegistry'
    );
    if (widgetRegistryToken) {
      this._tokenMap.set(
        '@jupyter-widgets/base:IJupyterWidgetRegistry',
        widgetRegistryToken
      );
      const widgetRegistryDescription =
        this._tokenDescriptionMap.get(
          'jupyter.extensions.jupyterWidgetRegistry'
        ) ?? '';
      if (widgetRegistryDescription) {
        this._tokenDescriptionMap.set(
          '@jupyter-widgets/base:IJupyterWidgetRegistry',
          widgetRegistryDescription
        );
      }
    }
  }

  private _setToken(token: Token<string>, fallbackDescription: string): void {
    this._tokenMap.set(token.name, token);
    const tokenDescription = this._stringValue(
      (token as Token<string> & { description?: unknown }).description
    );
    const description = tokenDescription || fallbackDescription;
    if (description) {
      this._tokenDescriptionMap.set(token.name, description);
    }
  }

  private _stringValue(description: unknown): string {
    if (typeof description !== 'string') {
      return '';
    }
    return description.trim();
  }

  private async _insertTokenImport(tokenName: string): Promise<void> {
    const tokenReference = parseTokenReference(tokenName);
    if (!tokenReference) {
      await showDialog({
        title: 'Cannot generate import statement',
        body: `Token "${tokenName}" does not follow the package:token format.`,
        buttons: [Dialog.okButton()]
      });
      return;
    }

    const activeEditor = await this._requireEditableEditor(
      'Open a text editor tab to insert an import statement.'
    );
    if (!activeEditor) {
      return;
    }

    const { editorWidget, sourceModel } = activeEditor;

    const source = sourceModel.sharedModel.getSource();
    const importResult = insertImportStatement(source, tokenReference);
    const dependencyResult = insertTokenDependency(
      importResult.source,
      tokenReference.tokenSymbol
    );
    const changedLines = Array.from(
      new Set([...importResult.changedLines, ...dependencyResult.changedLines])
    ).sort((left, right) => left - right);
    if (dependencyResult.source !== source) {
      sourceModel.sharedModel.setSource(dependencyResult.source);
    }
    if (changedLines.length > 0) {
      window.requestAnimationFrame(() => {
        ContentUtils.highlightEditorLines(
          editorWidget.content.editor,
          changedLines
        );
      });
    }
  }

  private _canInsertImport(tokenName: string): boolean {
    if (!parseTokenReference(tokenName)) {
      return false;
    }
    return this._hasEditableEditor();
  }

  private async _insertCommandExecution(
    commandId: string,
    mode: CommandInsertMode
  ): Promise<void> {
    await this._setCommandInsertMode(mode);

    const activeEditor = await this._requireEditableEditor(
      'Open a text editor tab to insert command execution.'
    );
    if (!activeEditor) {
      return;
    }

    if (mode === 'insert') {
      this._insertCommandExecutionAtCursor(activeEditor, commandId);
      return;
    }

    const source = activeEditor.sourceModel.sharedModel.getSource();
    const appVariableName = findPluginActivateAppParameterName(source);
    const suggestedSnippet = this._commandExecutionSnippet(
      commandId,
      appVariableName ?? 'app'
    );

    try {
      await this._promptAIToInsertCommand({
        activeEditor,
        commandId,
        suggestedSnippet,
        appVariableName
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        'Failed to prefill JupyterLite AI prompt for insertion.',
        error
      );
      const aiErrorCode =
        error instanceof JupyterLiteAIError ? error.code : null;
      const warningMessage =
        aiErrorCode === 'provider-setup-required' ||
        aiErrorCode === 'install-unavailable'
          ? message
          : `Could not prefill AI insertion prompt for "${commandId}": ${message}`;
      Notification.warning(warningMessage, {
        autoClose: 5000
      });
    }
  }

  private async _setCommandInsertMode(mode: CommandInsertMode): Promise<void> {
    if (this._commandInsertMode === mode) {
      return;
    }
    this._commandInsertMode = mode;
    this._tokenSidebar?.update();
    try {
      await this.settings.set(COMMAND_INSERT_DEFAULT_MODE_SETTING, mode);
    } catch (error) {
      console.warn(
        `Failed to persist "${COMMAND_INSERT_DEFAULT_MODE_SETTING}" setting.`,
        error
      );
    }
  }

  private _insertCommandExecutionAtCursor(
    activeEditor: {
      editorWidget: IDocumentWidget<FileEditor>;
      sourceModel: NonNullable<FileEditor['model']>;
    },
    commandId: string
  ): void {
    const { editorWidget, sourceModel } = activeEditor;
    const editor = editorWidget.content.editor;
    const originalCursorPosition = editor.getCursorPosition();
    const originalInsertionOffset = editor.getOffsetAt(originalCursorPosition);
    const originalSource = sourceModel.sharedModel.getSource();
    let cursorMarker = '__plugin_playground_cursor_marker__';
    while (originalSource.includes(cursorMarker)) {
      cursorMarker = `${cursorMarker}_`;
    }
    const sourceWithCursorMarker = `${originalSource.slice(
      0,
      originalInsertionOffset
    )}${cursorMarker}${originalSource.slice(originalInsertionOffset)}`;

    const activateAppContext = ensurePluginActivateAppContext(
      sourceWithCursorMarker
    );
    const markerOffset = activateAppContext.source.indexOf(cursorMarker);
    const sourceWithoutMarker =
      markerOffset === -1
        ? activateAppContext.source
        : `${activateAppContext.source.slice(
            0,
            markerOffset
          )}${activateAppContext.source.slice(
            markerOffset + cursorMarker.length
          )}`;
    if (sourceWithoutMarker !== originalSource) {
      sourceModel.sharedModel.updateSource(
        0,
        originalSource.length,
        sourceWithoutMarker
      );
    }

    const insertionOffset =
      markerOffset === -1 ? originalInsertionOffset : markerOffset;
    const cursorPosition =
      editor.getPositionAt(insertionOffset) ?? editor.getCursorPosition();
    const insertText = this._commandExecutionSnippet(
      commandId,
      activateAppContext.appVariableName
    );

    editor.setSelection({
      start: cursorPosition,
      end: cursorPosition
    });
    if (editor.replaceSelection) {
      editor.replaceSelection(insertText);
    } else {
      sourceModel.sharedModel.updateSource(
        insertionOffset,
        insertionOffset,
        insertText
      );
      const fallbackCursorPosition = editor.getPositionAt(
        insertionOffset + insertText.length
      );
      if (fallbackCursorPosition) {
        editor.setCursorPosition(fallbackCursorPosition);
      }
    }

    const nextCursorPosition = editor.getCursorPosition();
    editor.revealPosition(nextCursorPosition);
    window.requestAnimationFrame(() => {
      ContentUtils.highlightEditorLines(editor, [nextCursorPosition.line]);
    });
    editor.focus();
  }

  private async _promptAIToInsertCommand(options: {
    commandId: string;
    activeEditor: {
      editorWidget: IDocumentWidget<FileEditor>;
      sourceModel: NonNullable<FileEditor['model']>;
    };
    suggestedSnippet: string;
    appVariableName: string | null;
  }): Promise<void> {
    const { editorWidget } = options.activeEditor;
    const commandArguments = await getCommandArgumentDocumentation(
      this.app,
      options.commandId
    ).catch(() => null);
    const prompt = this._buildCommandInsertAIPrompt({
      commandId: options.commandId,
      path: editorWidget.context.path,
      suggestedSnippet: options.suggestedSnippet,
      appVariableName: options.appVariableName,
      commandArguments
    });

    await this._openJupyterLiteAIChatPanel();

    const inputModel = await this._requireJupyterLiteAIChatInputModel();
    inputModel.value = prompt;
    inputModel.focus();
    window.requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLInputElement
      ) {
        const cursorIndex = activeElement.value.length;
        activeElement.setSelectionRange(cursorIndex, cursorIndex);
        activeElement.scrollTop = activeElement.scrollHeight;
      }
    });
  }

  private async _openJupyterLiteAIChatPanel(): Promise<void> {
    if (!this.app.commands.hasCommand(JUPYTERLITE_AI_OPEN_CHAT_COMMAND)) {
      throw new JupyterLiteAIError(
        'install-unavailable',
        JUPYTERLITE_AI_INSTALL_HINT
      );
    }

    const openResult = await this.app.commands.execute(
      JUPYTERLITE_AI_OPEN_CHAT_COMMAND,
      {
        area: 'side'
      }
    );
    if (openResult === false) {
      throw new JupyterLiteAIError(
        'provider-setup-required',
        JUPYTERLITE_AI_PROVIDER_SETUP_HINT
      );
    }
    this.app.shell.activateById(JUPYTERLITE_AI_CHAT_PANEL_ID);
  }

  private async _openJupyterLiteAIChatWithSetupFallback(): Promise<JupyterLiteAIChatOpenStatus> {
    try {
      await this._openJupyterLiteAIChatPanel();
      const inputModel = await this._requireJupyterLiteAIChatInputModel();
      inputModel.focus();
      return 'opened';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const aiErrorCode =
        error instanceof JupyterLiteAIError ? error.code : null;

      if (aiErrorCode === 'provider-setup-required') {
        Notification.warning(
          'No AI provider configured. Configure a provider in AI Settings to continue.',
          {
            autoClose: false,
            actions: [
              {
                label: 'Configure Provider',
                displayType: 'accent',
                callback: () => {
                  void this._openAISettingsInMainArea().then(
                    didOpenSettings => {
                      if (!didOpenSettings) {
                        Notification.warning(
                          'Could not open AI Settings. Open AI Settings to continue.',
                          {
                            autoClose: 5000
                          }
                        );
                      }
                    }
                  );
                }
              }
            ]
          }
        );
        return 'provider-setup-required';
      }

      if (aiErrorCode === 'install-unavailable') {
        Notification.warning(JUPYTERLITE_AI_INSTALL_HINT, {
          autoClose: 4500
        });
        return 'install-unavailable';
      }

      Notification.warning(`Could not open AI chat: ${message}`, {
        autoClose: 5000
      });
      return 'failed';
    }
  }

  private async _openAISettingsInMainArea(): Promise<boolean> {
    if (!this.app.commands.hasCommand(JUPYTERLITE_AI_OPEN_SETTINGS_COMMAND)) {
      return false;
    }
    try {
      await this.app.commands.execute(JUPYTERLITE_AI_OPEN_SETTINGS_COMMAND);
      return true;
    } catch {
      return false;
    }
  }

  private async _requireJupyterLiteAIChatInputModel(): Promise<{
    value: string;
    focus: () => void;
  }> {
    const chatTracker =
      this.chatTracker ?? (await this.app.resolveOptionalService(IChatTracker));
    if (!chatTracker) {
      throw new JupyterLiteAIError(
        'install-unavailable',
        JUPYTERLITE_AI_INSTALL_HINT
      );
    }

    const maxAnimationFrameRetries = 3;
    for (let attempt = 0; attempt <= maxAnimationFrameRetries; attempt++) {
      const chatWidget =
        chatTracker.currentWidget ?? chatTracker.find(() => true);
      const inputModel = (
        chatWidget as {
          model?: {
            input?: unknown;
          };
        } | null
      )?.model?.input;
      if (this._isJupyterLiteAIChatInputModel(inputModel)) {
        return inputModel;
      }

      if (
        typeof window === 'undefined' ||
        attempt === maxAnimationFrameRetries
      ) {
        break;
      }
      await new Promise<void>(resolve => {
        window.requestAnimationFrame(() => {
          resolve();
        });
      });
    }

    throw new JupyterLiteAIError(
      'provider-setup-required',
      JUPYTERLITE_AI_PROVIDER_SETUP_HINT
    );
  }

  private _isJupyterLiteAIChatInputModel(candidate: unknown): candidate is {
    value: string;
    focus: () => void;
  } {
    return !!(
      candidate &&
      typeof candidate === 'object' &&
      'value' in candidate &&
      typeof candidate.value === 'string' &&
      'focus' in candidate &&
      typeof candidate.focus === 'function'
    );
  }

  private _buildCommandInsertAIPrompt(options: {
    commandId: string;
    path: string;
    suggestedSnippet: string;
    appVariableName: string | null;
    commandArguments: ICommandArgumentDocumentation | null;
  }): string {
    const normalizedPath = ContentUtils.normalizeContentsPath(options.path);
    const appContextInstruction = options.appVariableName
      ? `Use the activate() app variable: ${options.appVariableName}.`
      : 'If app is missing, add JupyterFrontEnd import and declare activate(app: JupyterFrontEnd, ...).';
    const commandArgumentsInstruction =
      this._buildCommandArgumentsPromptSection(options.commandArguments);
    return [
      'Insert this command execution in the best location in this file.',
      'Keep exactly one final execute() call for this command.',
      'Use the currently open editor content as the source of truth.',
      appContextInstruction,
      commandArgumentsInstruction,
      `Command ID: ${options.commandId}`,
      `Suggested command call: ${options.suggestedSnippet}`,
      `File: ${normalizedPath || '(unsaved)'}`
    ]
      .filter(Boolean)
      .join('\n');
  }

  private _buildCommandArgumentsPromptSection(
    commandArguments: ICommandArgumentDocumentation | null
  ): string {
    if (!commandArguments) {
      return '';
    }

    const sections: string[] = [];
    if (commandArguments.usage) {
      sections.push(`Usage:\n${commandArguments.usage}`);
    }
    if (commandArguments.args) {
      sections.push(
        `Arguments Schema: ${JSON.stringify(commandArguments.args)}`
      );
    }
    if (sections.length === 0) {
      return '';
    }

    return `Command Arguments:\n${sections.join('\n\n')}`;
  }

  private _commandExecutionSnippet(
    commandId: string,
    appVariableName: string
  ): string {
    const escapedCommandId = commandId
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'");
    return `${appVariableName}.commands.execute('${escapedCommandId}');`;
  }

  private _getEditableEditor(): {
    editorWidget: IDocumentWidget<FileEditor>;
    sourceModel: NonNullable<FileEditor['model']>;
  } | null {
    const editorWidget = this.editorTracker.currentWidget;
    if (!editorWidget || editorWidget !== this.app.shell.currentWidget) {
      return null;
    }

    const sourceModel = editorWidget.content.model;
    if (!sourceModel || !sourceModel.sharedModel) {
      return null;
    }

    return {
      editorWidget,
      sourceModel
    };
  }

  private _hasEditableEditor(): boolean {
    return this._getEditableEditor() !== null;
  }

  private async _requireEditableEditor(noEditorMessage: string): Promise<{
    editorWidget: IDocumentWidget<FileEditor>;
    sourceModel: NonNullable<FileEditor['model']>;
  } | null> {
    const activeEditor = this._getEditableEditor();
    if (activeEditor) {
      return activeEditor;
    }

    if (!this.editorTracker.currentWidget) {
      await showDialog({
        title: 'No active editor',
        body: noEditorMessage,
        buttons: [Dialog.okButton()]
      });
      return null;
    }

    await showDialog({
      title: 'No editable content',
      body: 'The active tab does not expose editable source text.',
      buttons: [Dialog.okButton()]
    });
    return null;
  }

  /**
   * Set up a collapsed bottom bar that appears when console logs arrive.
   * Shows an unread count with color-coded severity. Clicking the bar
   * opens the full js-logs panel and resets the badge.
   */
  private _setupLogsBadge(): void {
    const { commands } = this.app;
    const JS_LOGS_OPEN = 'js-logs:open';
    const MAX_BUFFER = 1000;

    let unreadCount = 0;
    let hasError = false;
    let hasWarning = false;
    let replaying = false;
    const logBuffer: Array<{
      method: (...a: any[]) => void;
      args: any[];
    }> = [];

    // Create badge bar as a compact floating chip.
    const badgeBar = document.createElement('div');
    badgeBar.id = 'jp-plugin-playground-log-badge';
    badgeBar.className = 'jp-PluginPlayground-logBadgeBar';
    badgeBar.style.display = 'none';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'jp-PluginPlayground-logBadgeBar-label';

    const closeBtn = document.createElement('span');
    closeBtn.className = 'jp-PluginPlayground-logBadgeBar-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.title = 'Dismiss';

    badgeBar.appendChild(labelSpan);
    badgeBar.appendChild(closeBtn);

    const resetBadge = (): void => {
      unreadCount = 0;
      hasError = false;
      hasWarning = false;
      logBuffer.length = 0;
      updateBadge();
    };

    const getTrackedLogPanel = () => {
      if (!this.logConsoleTracker) {
        return null;
      }
      const currentWidget = this.logConsoleTracker.currentWidget;
      if (currentWidget && !currentWidget.isDisposed) {
        return currentWidget;
      }

      let firstTrackedWidget: typeof currentWidget = null;
      this.logConsoleTracker.forEach(widget => {
        if (!firstTrackedWidget && !widget.isDisposed) {
          firstTrackedWidget = widget;
        }
      });
      return firstTrackedWidget;
    };

    // Check if the js-logs panel is currently open and visible.
    const isPanelVisible = (): boolean => {
      if (!commands.hasCommand(JS_LOGS_OPEN)) {
        return false;
      }
      const trackedPanel = getTrackedLogPanel();
      return !!(
        trackedPanel &&
        trackedPanel.isAttached &&
        trackedPanel.isVisible
      );
    };

    // Focus the existing log console panel instead of toggling it closed.
    const focusLogPanel = (): void => {
      const trackedPanel = getTrackedLogPanel();
      if (trackedPanel) {
        this.app.shell.activateById(trackedPanel.id);
        return;
      }
      void commands.execute(JS_LOGS_OPEN);
    };

    const updateBadge = (): void => {
      if (unreadCount === 0) {
        badgeBar.style.display = 'none';
        return;
      }
      badgeBar.style.display = '';
      labelSpan.textContent = `JS Logs (${unreadCount})`;
      badgeBar.classList.toggle(
        'jp-PluginPlayground-logBadgeBar-error',
        hasError
      );
      badgeBar.classList.toggle(
        'jp-PluginPlayground-logBadgeBar-warning',
        !hasError && hasWarning
      );
    };

    // Click label → open or focus logs panel, replay buffer, clear badge.
    labelSpan.addEventListener('click', () => {
      if (!commands.hasCommand(JS_LOGS_OPEN)) {
        resetBadge();
        return;
      }
      const panelExists = getTrackedLogPanel() !== null;
      if (panelExists) {
        // Panel already open.
        focusLogPanel();
        resetBadge();
      } else {
        // Panel doesn't exist.
        commands.execute(JS_LOGS_OPEN);
        const entries = logBuffer.slice();
        resetBadge();
        setTimeout(() => {
          replaying = true;
          for (const entry of entries) {
            entry.method.apply(console, entry.args);
          }
          replaying = false;
        }, 200);
      }
    });

    // Click × → just dismiss without opening.
    closeBtn.addEventListener('click', e => {
      e.stopPropagation();
      resetBadge();
    });

    document.body.appendChild(badgeBar);

    const onLog = (
      level: 'error' | 'warning' | 'info',
      method: (...a: any[]) => void,
      args: any[]
    ): void => {
      if (replaying || isPanelVisible()) {
        return;
      }
      unreadCount++;
      if (level === 'error') {
        hasError = true;
      } else if (level === 'warning') {
        hasWarning = true;
      }
      if (logBuffer.length < MAX_BUFFER) {
        logBuffer.push({ method, args: [...args] });
      }
      updateBadge();
    };

    // Track logs only when they come from this JupyterLab origin.
    const isRelevantSource = (source?: string): boolean => {
      if (!source || source.startsWith('webpack://')) {
        return true;
      }
      try {
        const parsed = new URL(source, window.location.href);
        if (parsed.origin !== window.location.origin) {
          return false;
        }
        return true;
      } catch {
        return true;
      }
    };

    // Intercepts — count, buffer, then forward to the previous handler.
    const wrap = (
      method: (...args: any[]) => void,
      level: 'error' | 'warning' | 'info'
    ): ((...args: any[]) => void) => {
      return (...args: any[]): void => {
        const isIgnoredMessage = args.some(
          arg =>
            typeof arg === 'string' &&
            (arg.includes('Observed element mutated') ||
              arg.includes("don't worry, about SyntaxError") ||
              arg.includes('/lite/api/all.json'))
        );
        if (isIgnoredMessage) {
          method.apply(console, args);
          return;
        }

        const stackSources = new Error().stack
          ?.split('\n')
          .slice(2)
          .join('\n')
          .match(/(?:https?:\/\/|blob:|webpack:\/\/)[^\s)]+/g);
        if (!stackSources || stackSources.every(isRelevantSource)) {
          onLog(level, method, args);
        }
        method.apply(console, args);
      };
    };

    window.console.debug = wrap(console.debug, 'info');
    window.console.log = wrap(console.log, 'info');
    window.console.info = wrap(console.info, 'info');
    window.console.warn = wrap(console.warn, 'warning');
    window.console.error = wrap(console.error, 'error');

    window.onerror = ((): (typeof window)['onerror'] => {
      const prev = window.onerror;
      return (msg, url, line, col, error): boolean => {
        if (!replaying && isRelevantSource(url ?? undefined)) {
          unreadCount++;
          hasError = true;
          if (logBuffer.length < MAX_BUFFER) {
            logBuffer.push({
              method: console.error,
              args: [`${url}:${line}:${col} ${msg}\n${error}`]
            });
          }
          updateBadge();
        }
        if (prev) {
          return prev(msg, url, line, col, error) as boolean;
        }
        return false;
      };
    })();
  }

  private readonly _fallbackExampleDescription =
    'No description provided by this example.';
  private readonly _inFlightLoads = new Map<
    string,
    Promise<IPluginLoadResult>
  >();
  private readonly _exportToolbar = new ExportToolbarController();
  private readonly _loadOnSaveByFile = new Set<string>();
  private readonly _loadOnSaveToggleRefreshers = new Set<() => void>();
  private _sharedFileCueWidgetId: string | null = null;
  private _dismissSharedFileCue: (() => void) | null = null;
  private readonly _tokenMap = new Map<string, Token<string>>();
  private readonly _tokenDescriptionMap = new Map<string, string>();
  private readonly _documentationWidgets = new Map<
    string,
    MainAreaWidget<IFrame>
  >();
  private readonly _pluginLocalStylePaths = new Map<string, Set<string>>();
  private _commandInsertMode: CommandInsertMode = DEFAULT_COMMAND_INSERT_MODE;
  private _copiedCommandId: string | null = null;
  private _copiedCommandTimer: number | null = null;
  private _playgroundSidebar: SidePanel | null = null;
  private _tokenSidebar: TokenSidebar | null = null;
  private _documentationWidgetId = 0;
}

/**
 * Initialization data for the @jupyterlab/plugin-playground extension.
 */
const mainPlugin: JupyterFrontEndPlugin<IPluginPlayground> = {
  id: '@jupyterlab/plugin-playground:plugin',
  description:
    'Provide a playground for developing and testing JupyterLab plugins.',
  autoStart: true,
  provides: IPluginPlayground,
  requires: [
    ISettingRegistry,
    ICommandPalette,
    IEditorTracker,
    IToolbarWidgetRegistry
  ],
  optional: [
    ICompletionProviderManager,
    ILauncher,
    IDocumentManager,
    ILogConsoleTracker,
    IChatTracker,
    IConfigSectionManager
  ],
  activate: (
    app: JupyterFrontEnd,
    settingRegistry: ISettingRegistry,
    commandPalette: ICommandPalette,
    editorTracker: IEditorTracker,
    toolbarWidgetRegistry: IToolbarWidgetRegistry,
    completionManager: ICompletionProviderManager | null,
    launcher: ILauncher | null,
    documentManager: IDocumentManager | null,
    logConsoleTracker: ILogConsoleTracker | null,
    chatTracker: IChatTracker | null,
    configSectionManager: ConfigSection.IManager | null
  ): IPluginPlayground => {
    if (completionManager) {
      completionManager.registerProvider(new CommandCompletionProvider(app));
    }

    let playground: PluginPlayground | null = null;

    // In order to accommodate loading ipywidgets and other AMD modules, we
    // load RequireJS before loading any custom extensions.
    const requirejsLoader = new RequireJSLoader();

    const playgroundReady = Promise.all([
      settingRegistry.load(mainPlugin.id),
      requirejsLoader.load()
    ]).then(([settings, requirejs]) => {
      playground = new PluginPlayground(
        app,
        settingRegistry,
        commandPalette,
        editorTracker,
        launcher,
        documentManager,
        chatTracker,
        settings,
        requirejs,
        toolbarWidgetRegistry,
        logConsoleTracker,
        configSectionManager
      );
      return playground;
    });
    void playgroundReady.catch(error => {
      console.error('Plugin Playground initialization failed.', error);
    });

    const api: IPluginPlayground = {
      registerKnownModule: async (known: IKnownModule) => {
        if (playground) {
          await playground.registerKnownModule(known);
          return;
        }
        registerKnownModule(known);
      },
      shareViaLink: async (path?: string) => {
        if (!playground) {
          try {
            await playgroundReady;
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            throw new Error(
              `Plugin Playground failed to initialize. ${message}`
            );
          }
        }
        if (!playground) {
          throw new Error('Plugin Playground is not ready yet. Try again.');
        }
        return playground.shareViaLink(path);
      }
    };

    // We could convert to `async` and use `await` but we don't, because a failure
    // would freeze JupyterLab on splash screen; this way if it fails to load,
    // only the plugin is affected, not the entire application.

    return api;
  }
};

const notebookTreePlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/plugin-playground:notebook-tree',
  description: 'Adds a Plugin Playground entry to Notebook tree New dropdown.',
  autoStart: true,
  optional: [IToolbarWidgetRegistry, IMainMenu],
  activate: (
    app: JupyterFrontEnd,
    toolbarWidgetRegistry: IToolbarWidgetRegistry | null,
    mainMenu: IMainMenu | null
  ): void => {
    if (
      !app.hasPlugin(NOTEBOOK_SHELL_PLUGIN_ID) &&
      !app.hasPlugin(NOTEBOOK_TREE_WIDGET_PLUGIN_ID)
    ) {
      return;
    }

    if (!app.commands.hasCommand(CommandIDs.createNewFileFromNotebookTree)) {
      app.commands.addCommand(CommandIDs.createNewFileFromNotebookTree, {
        label: 'Start from File',
        caption:
          'Create a new TypeScript plugin file and open the playground sidebar',
        describedBy: { args: CREATE_PLUGIN_FROM_NOTEBOOK_TREE_ARGS_SCHEMA },
        icon: tokenSidebarIcon,
        execute: async args => {
          const rawCwdArg = typeof args.cwd === 'string' ? args.cwd.trim() : '';
          const normalizedCwdArg =
            ContentUtils.normalizeContentsPath(rawCwdArg);
          const model = await app.serviceManager.contents.newUntitled({
            ...(normalizedCwdArg ? { path: normalizedCwdArg } : {}),
            type: 'file',
            ext: 'ts'
          });
          const openPath = model.path;

          await app.serviceManager.contents.save(openPath, {
            type: 'file',
            format: 'text',
            content: PLUGIN_TEMPLATE
          });

          if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(NOTEBOOK_TREE_OPEN_SIDEBAR_KEY, '1');
          }
          await app.commands.execute('docmanager:open', {
            path: openPath
          });
          return openPath;
        }
      });
    }

    if (
      !app.commands.hasCommand(CommandIDs.createNewFileWithAIFromNotebookTree)
    ) {
      app.commands.addCommand(CommandIDs.createNewFileWithAIFromNotebookTree, {
        label: 'Build with AI',
        caption:
          'Create a new TypeScript plugin file and open AI chat setup for guided building',
        describedBy: { args: CREATE_PLUGIN_FROM_NOTEBOOK_TREE_ARGS_SCHEMA },
        icon: offlineBoltIcon,
        execute: async args => {
          if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(NOTEBOOK_TREE_OPEN_AI_CHAT_KEY, '1');
          }
          return app.commands.execute(
            CommandIDs.createNewFileFromNotebookTree,
            args
          );
        }
      });
    }

    if (!app.commands.hasCommand(CommandIDs.takeTourFromNotebookTree)) {
      app.commands.addCommand(CommandIDs.takeTourFromNotebookTree, {
        label: 'Take the Tour',
        caption:
          'Open a first-time-friendly tour of Plugin Playground and AI setup',
        describedBy: { args: CREATE_PLUGIN_FROM_NOTEBOOK_TREE_ARGS_SCHEMA },
        icon: infoIcon,
        execute: async args => {
          const rawCwdArg = typeof args.cwd === 'string' ? args.cwd.trim() : '';
          const normalizedCwdArg =
            ContentUtils.normalizeContentsPath(rawCwdArg);
          return app.commands.execute(
            CommandIDs.takeTour,
            normalizedCwdArg ? { cwd: normalizedCwdArg } : {}
          );
        }
      });
    }

    if (mainMenu) {
      const hasStartFromFileEntry = mainMenu.fileMenu.newMenu.items.some(
        item =>
          item.type === 'command' &&
          item.command === CommandIDs.createNewFileFromNotebookTree
      );
      if (!hasStartFromFileEntry) {
        mainMenu.fileMenu.newMenu.addItem({
          command: CommandIDs.createNewFileFromNotebookTree
        });
      }
      const hasBuiltWithAIEntry = mainMenu.fileMenu.newMenu.items.some(
        item =>
          item.type === 'command' &&
          item.command === CommandIDs.createNewFileWithAIFromNotebookTree
      );
      if (!hasBuiltWithAIEntry) {
        mainMenu.fileMenu.newMenu.addItem({
          command: CommandIDs.createNewFileWithAIFromNotebookTree
        });
      }
      const hasTakeTourEntry = mainMenu.fileMenu.newMenu.items.some(
        item =>
          item.type === 'command' &&
          item.command === CommandIDs.takeTourFromNotebookTree
      );
      if (!hasTakeTourEntry) {
        mainMenu.fileMenu.newMenu.addItem({
          command: CommandIDs.takeTourFromNotebookTree
        });
      }
    }

    if (!toolbarWidgetRegistry) {
      return;
    }

    let baseNewDropdownFactory: ((browser: Widget) => Widget) | undefined;
    let isInstallingNewDropdownFactory = false;

    const wrappedNewDropdownFactory = (browser: Widget): Widget => {
      const widget: Widget = baseNewDropdownFactory
        ? baseNewDropdownFactory(browser)
        : new Widget();
      if (!(widget instanceof MenuBar) || widget.menus.length === 0) {
        return widget;
      }
      const newMenu = widget.menus[0];
      const hasStartFromFileEntry = newMenu.items.some(
        item =>
          item.type === 'command' &&
          item.command === CommandIDs.createNewFileFromNotebookTree
      );
      if (!hasStartFromFileEntry) {
        newMenu.addItem({
          command: CommandIDs.createNewFileFromNotebookTree
        });
      }
      const hasBuiltWithAIEntry = newMenu.items.some(
        item =>
          item.type === 'command' &&
          item.command === CommandIDs.createNewFileWithAIFromNotebookTree
      );
      if (!hasBuiltWithAIEntry) {
        newMenu.addItem({
          command: CommandIDs.createNewFileWithAIFromNotebookTree
        });
      }
      const hasTakeTourEntry = newMenu.items.some(
        item =>
          item.type === 'command' &&
          item.command === CommandIDs.takeTourFromNotebookTree
      );
      if (!hasTakeTourEntry) {
        newMenu.addItem({
          command: CommandIDs.takeTourFromNotebookTree
        });
      }
      return widget;
    };

    toolbarWidgetRegistry.factoryAdded.connect((_sender, toolbarItemName) => {
      if (
        toolbarItemName !== NOTEBOOK_NEW_DROPDOWN_TOOLBAR_ITEM ||
        isInstallingNewDropdownFactory
      ) {
        return;
      }
      isInstallingNewDropdownFactory = true;
      try {
        const previousFactory = toolbarWidgetRegistry.addFactory<Widget>(
          NOTEBOOK_FILE_BROWSER_FACTORY,
          NOTEBOOK_NEW_DROPDOWN_TOOLBAR_ITEM,
          wrappedNewDropdownFactory
        );
        if (previousFactory && previousFactory !== wrappedNewDropdownFactory) {
          baseNewDropdownFactory = previousFactory;
        }
      } finally {
        isInstallingNewDropdownFactory = false;
      }
    });

    isInstallingNewDropdownFactory = true;
    try {
      const previousFactory = toolbarWidgetRegistry.addFactory<Widget>(
        NOTEBOOK_FILE_BROWSER_FACTORY,
        NOTEBOOK_NEW_DROPDOWN_TOOLBAR_ITEM,
        wrappedNewDropdownFactory
      );
      if (previousFactory && previousFactory !== wrappedNewDropdownFactory) {
        baseNewDropdownFactory = previousFactory;
      }
    } finally {
      isInstallingNewDropdownFactory = false;
    }
  }
};

const plugins: JupyterFrontEndPlugin<any>[] = [notebookTreePlugin, mainPlugin];

export default plugins;
export type { IKnownModule };
