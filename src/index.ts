import ts from 'typescript';

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import {
  Dialog,
  MainAreaWidget,
  showDialog,
  showErrorMessage,
  ICommandPalette,
  IToolbarWidgetRegistry
} from '@jupyterlab/apputils';

import { Signal } from '@lumino/signaling';

import { DocumentRegistry, IDocumentWidget } from '@jupyterlab/docregistry';

import { FileEditor, IEditorTracker } from '@jupyterlab/fileeditor';

import { ILauncher } from '@jupyterlab/launcher';

import { extensionIcon, IFrame, SidePanel } from '@jupyterlab/ui-components';

import { IDocumentManager } from '@jupyterlab/docmanager';
import { PathExt } from '@jupyterlab/coreutils';

import { Contents } from '@jupyterlab/services';
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
  filterCommandRecords,
  filterTokenRecords,
  TokenSidebar
} from './token-sidebar';

import { ExampleSidebar, filterExampleRecords } from './example-sidebar';

import { tokenSidebarIcon } from './icons';

import {
  CommandCompletionProvider,
  getCommandArgumentCount,
  getCommandArgumentDocumentation,
  getCommandRecords
} from './command-completion';

import {
  fileModelToText,
  getDirectoryModel,
  getFileModel,
  highlightEditorLines,
  IFileModel,
  normalizeExternalUrl,
  normalizeContentsPath,
  openExternalLink
} from './contents';
import {
  insertImportStatement,
  insertTokenDependency,
  parseTokenReference
} from './token-insertion';

import { Token } from '@lumino/coreutils';

import { AccordionPanel, Widget } from '@lumino/widgets';

import { IPlugin } from '@lumino/application';

namespace CommandIDs {
  export const createNewFile = 'plugin-playground:create-new-plugin';
  export const loadCurrentAsExtension = 'plugin-playground:load-as-extension';
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
const CREATE_PLUGIN_ARGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    path: {
      type: 'string',
      description:
        'Optional file path. Relative paths are resolved against cwd; paths starting with "/" are resolved from the workspace root. If no extension is provided, ".ts" is appended.'
    }
  }
};
const LOAD_ON_SAVE_TOGGLE_TOOLBAR_ITEM = 'plugin-playground-load-on-save';
const LOAD_ON_SAVE_CHECKBOX_LABEL = 'Auto Load on Save';
const LOAD_ON_SAVE_SETTING = 'loadOnSave';
const LOAD_ON_SAVE_ENABLED_DESCRIPTION =
  'Toggle auto-loading this file as an extension on save';
const LOAD_ON_SAVE_DISABLED_DESCRIPTION =
  'Auto load on save is available for JavaScript and TypeScript files';

export interface IPluginPlayground {
  registerKnownModule(known: IKnownModule): Promise<void>;
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
    protected settings: ISettingRegistry.ISettings,
    protected requirejs: IRequireJS,
    toolbarWidgetRegistry: IToolbarWidgetRegistry
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
      icon: extensionIcon,
      isEnabled: () =>
        editorTracker.currentWidget !== null &&
        editorTracker.currentWidget === app.shell.currentWidget,
      execute: async () => {
        const currentWidget = editorTracker.currentWidget;
        if (currentWidget) {
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

    toolbarWidgetRegistry.addFactory<IDocumentWidget<FileEditor>>(
      'Editor',
      LOAD_ON_SAVE_TOGGLE_TOOLBAR_ITEM,
      widget => this._createLoadOnSaveToggleWidget(widget)
    );

    editorTracker.widgetAdded.connect(
      (_sender: IEditorTracker, widget: IDocumentWidget<FileEditor>) => {
        const onSaveState = (
          _context: DocumentRegistry.Context,
          state: DocumentRegistry.SaveState
        ) => {
          const normalizedPath = normalizeContentsPath(widget.context.path);
          if (state === 'completed' && this._shouldLoadOnSave(normalizedPath)) {
            const currentText = widget.context.model.toString();
            void this._queuePluginLoad(currentText, widget.context.path);
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
      label: 'TypeScript File (Playground)',
      caption: 'Create a new TypeScript file',
      describedBy: { args: CREATE_PLUGIN_ARGS_SCHEMA },
      icon: extensionIcon,
      execute: async args => {
        const cwd =
          typeof args.cwd === 'string'
            ? normalizeContentsPath(args.cwd.trim())
            : '';
        const rawPathArg =
          typeof args.path === 'string' ? args.path.trim() : '';
        const isRootRelativePath = rawPathArg.startsWith('/');
        const normalizedPathArg = normalizeContentsPath(rawPathArg);

        let targetPath = normalizedPathArg;
        if (targetPath && !isRootRelativePath && cwd) {
          targetPath = normalizeContentsPath(PathExt.join(cwd, targetPath));
        }

        if (targetPath && !/\.[^/]+$/.test(targetPath)) {
          targetPath = `${targetPath}.ts`;
        }

        const parentDirectory = targetPath
          ? normalizeContentsPath(PathExt.dirname(targetPath))
          : cwd;
        const untitledDirectory =
          parentDirectory && parentDirectory !== '.'
            ? parentDirectory
            : undefined;

        const model = await app.serviceManager.contents.newUntitled({
          path: untitledDirectory,
          type: 'file',
          ext: 'ts'
        });

        let openPath = model.path;
        if (targetPath && targetPath !== model.path) {
          openPath = (
            await app.serviceManager.contents.rename(model.path, targetPath)
          ).path;
        }

        await app.commands.execute('docmanager:open', {
          path: openPath,
          factory: 'Editor'
        });

        const normalizedOpenPath = normalizeContentsPath(openPath);
        let widget: IDocumentWidget<FileEditor> | null = null;
        editorTracker.forEach(candidate => {
          if (
            !widget &&
            normalizeContentsPath(candidate.context.path) === normalizedOpenPath
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
        return activeWidget;
      }
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
        isImportEnabled: this._canInsertImport.bind(this)
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
      (playgroundSidebar.content as AccordionPanel).expand(0);
      (playgroundSidebar.content as AccordionPanel).expand(1);
      this.app.shell.add(playgroundSidebar, 'right', { rank: 650 });
      this._playgroundSidebar = playgroundSidebar;

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
          category: 'Other',
          rank: 1
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

      settings.changed.connect(updatedSettings => {
        this.settings = updatedSettings;
        this._updateSettings(requirejs, updatedSettings);
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
    const toggleNode = document.createElement('label');
    toggleNode.className = 'jp-PluginPlayground-loadOnSaveToggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'jp-PluginPlayground-loadOnSaveCheckbox';
    checkbox.setAttribute('aria-label', LOAD_ON_SAVE_CHECKBOX_LABEL);
    const label = document.createElement('span');
    label.className = 'jp-PluginPlayground-loadOnSaveText';
    label.id = `${widget.id}-load-on-save-label`;
    checkbox.setAttribute('aria-describedby', label.id);
    label.textContent = LOAD_ON_SAVE_CHECKBOX_LABEL;
    toggleNode.append(checkbox, label);

    const toggleWidget = new Widget({ node: toggleNode });
    toggleWidget.addClass('jp-PluginPlayground-loadOnSaveWidget');

    let currentPath = normalizeContentsPath(widget.context.path);
    const refresh = () => {
      if (this._isGlobalLoadOnSaveEnabled()) {
        checkbox.disabled = true;
        checkbox.setAttribute('aria-hidden', 'true');
        checkbox.setAttribute('aria-disabled', 'true');
        toggleWidget.hide();
        return;
      }
      toggleWidget.show();
      checkbox.removeAttribute('aria-hidden');
      currentPath = normalizeContentsPath(widget.context.path);
      const enabled = this._isSupportedLoadOnSaveFile(currentPath);
      checkbox.disabled = !enabled;
      checkbox.setAttribute('aria-disabled', String(!enabled));
      checkbox.checked = enabled && this._shouldLoadOnSave(currentPath);
      const description = enabled
        ? LOAD_ON_SAVE_ENABLED_DESCRIPTION
        : LOAD_ON_SAVE_DISABLED_DESCRIPTION;
      toggleNode.title = description;
    };

    const onCheckboxChanged = () => {
      if (
        this._isSupportedLoadOnSaveFile(currentPath) &&
        !this._isGlobalLoadOnSaveEnabled() &&
        checkbox.checked
      ) {
        this._loadOnSaveByFile.add(currentPath);
      } else {
        this._loadOnSaveByFile.delete(currentPath);
      }
      for (const refreshState of this._loadOnSaveToggleRefreshers) {
        refreshState();
      }
    };

    const onPathChanged = (
      _context: DocumentRegistry.Context,
      newPath: string
    ) => {
      const newNormalizedPath = normalizeContentsPath(newPath);
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

    checkbox.addEventListener('change', onCheckboxChanged);
    widget.context.pathChanged.connect(onPathChanged);
    this._loadOnSaveToggleRefreshers.add(refresh);
    refresh();

    let isDisposed = false;
    const dispose = () => {
      if (isDisposed) {
        return;
      }
      isDisposed = true;
      checkbox.removeEventListener('change', onCheckboxChanged);
      widget.context.pathChanged.disconnect(onPathChanged);
      this._loadOnSaveToggleRefreshers.delete(refresh);
    };

    toggleWidget.disposed.connect(dispose);
    widget.disposed.connect(dispose);

    return toggleWidget;
  }

  private _queuePluginLoad(
    pluginSource: string,
    path: string
  ): Promise<IPluginLoadResult> {
    const normalizedPath = normalizeContentsPath(path);
    const previous = this._inFlightLoads.get(normalizedPath);
    const next = previous
      ? previous
          .catch(() => {
            /* swallow previous load error to continue queue */
          })
          .then(() => this._loadPlugin(pluginSource, path))
      : this._loadPlugin(pluginSource, path);

    const guardedNext = next.finally(() => {
      if (this._inFlightLoads.get(normalizedPath) === guardedNext) {
        this._inFlightLoads.delete(normalizedPath);
      }
    });

    this._inFlightLoads.set(normalizedPath, guardedNext);
    return guardedNext;
  }

  private _updateSettings(
    requirejs: IRequireJS,
    settings: ISettingRegistry.ISettings
  ) {
    const baseURL = settings.composite.requirejsCDN as string;
    requirejs.require.config({
      baseUrl: baseURL
    });
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
          jsx: ts.JsxEmit.React
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
    }
    this._refreshExtensionPoints();

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

  public async registerKnownModule(known: IKnownModule): Promise<void> {
    registerKnownModule(known);
    this._tokenSidebar?.update();
  }

  private _openPackagesReference(): void {
    if (!this._tokenSidebar) {
      return;
    }

    this._tokenSidebar.showPackagesView();
    this.app.shell.activateById(
      this._playgroundSidebar?.id ?? this._tokenSidebar.id
    );
    if (this._playgroundSidebar) {
      (this._playgroundSidebar.content as AccordionPanel).expand(0);
    }
  }

  private _openDocumentationLink(
    url: string,
    moduleName: string,
    openInBrowserTab: boolean
  ): void {
    const safeUrl = normalizeExternalUrl(url);
    if (!safeUrl) {
      void showDialog({
        title: 'Invalid documentation URL',
        body: `Could not open docs for "${moduleName}" because the URL is invalid.`,
        buttons: [Dialog.okButton()]
      });
      return;
    }

    if (openInBrowserTab) {
      openExternalLink(safeUrl);
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
      path: normalizeContentsPath(path),
      factory: 'Editor'
    });
  }

  private async _discoverExtensionExamples(): Promise<
    ReadonlyArray<ExampleSidebar.IExampleRecord>
  > {
    const rootDirectory = await getDirectoryModel(
      this.app.serviceManager,
      EXTENSION_EXAMPLES_ROOT
    );
    if (!rootDirectory) {
      return [];
    }
    const rootPath =
      normalizeContentsPath(rootDirectory.path) || EXTENSION_EXAMPLES_ROOT;

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
        readmePath: normalizeContentsPath(
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
    const srcDirectory = await getDirectoryModel(
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
    return normalizeContentsPath(
      this._joinPath(srcDirectory.path, entrypoint.name)
    );
  }

  private async _readExampleDescription(
    directoryPath: string
  ): Promise<string> {
    const packageJsonPath = this._joinPath(directoryPath, 'package.json');
    const packageJson = await getFileModel(
      this.app.serviceManager,
      packageJsonPath
    );
    if (!packageJson) {
      return this._fallbackExampleDescription;
    }
    const packageData = this._parseJsonObject(packageJson);

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
    const normalizedChild = normalizeContentsPath(child);
    if (!normalizedBase) {
      return normalizedChild;
    }
    return `${normalizedBase}/${normalizedChild}`;
  }

  private _parseJsonObject(
    fileModel: IFileModel
  ): { description?: unknown } | null {
    const raw = fileModelToText(fileModel);
    if (raw === null) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed)
      ) {
        return parsed as { description?: unknown };
      }
    } catch {
      return null;
    }
    return null;
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

    const editorWidget = this.editorTracker.currentWidget;
    if (!editorWidget) {
      await showDialog({
        title: 'No active editor',
        body: 'Open a text editor tab to insert an import statement.',
        buttons: [Dialog.okButton()]
      });
      return;
    }

    const sourceModel = editorWidget.content.model;
    if (!sourceModel || !sourceModel.sharedModel) {
      await showDialog({
        title: 'No editable content',
        body: 'The active tab does not expose editable source text.',
        buttons: [Dialog.okButton()]
      });
      return;
    }

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
        highlightEditorLines(editorWidget.content.editor, changedLines);
      });
    }
  }

  private _canInsertImport(tokenName: string): boolean {
    if (!parseTokenReference(tokenName)) {
      return false;
    }

    const editorWidget = this.editorTracker.currentWidget;
    if (!editorWidget) {
      return false;
    }

    const sourceModel = editorWidget.content.model;
    return !!(sourceModel && sourceModel.sharedModel);
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

    // Check if the js-logs panel is currently open and visible.
    const isPanelVisible = (): boolean => {
      if (
        !commands.hasCommand(JS_LOGS_OPEN) ||
        !commands.isToggled(JS_LOGS_OPEN)
      ) {
        return false;
      }
      const el = document.querySelector('.jp-LogConsole');
      return el !== null && (el as HTMLElement).offsetParent !== null;
    };

    // Focus the existing log console panel instead of toggling it closed.
    const focusLogPanel = (): void => {
      const el = document.querySelector('.jp-LogConsole');
      if (el) {
        const widget = el.closest('.lm-Widget[id]');
        if (widget && widget.id) {
          this.app.shell.activateById(widget.id);
          return;
        }
      }
      // Fallback: toggle open - create a new panel.
      commands.execute(JS_LOGS_OPEN);
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
      const panelExists = commands.isToggled(JS_LOGS_OPEN);
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

    // Intercepts — count, buffer, then forward to the previous handler.
    const wrap = (
      method: (...args: any[]) => void,
      level: 'error' | 'warning' | 'info'
    ): ((...args: any[]) => void) => {
      return (...args: any[]): void => {
        onLog(level, method, args);
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
        if (!replaying) {
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
  private readonly _loadOnSaveByFile = new Set<string>();
  private readonly _loadOnSaveToggleRefreshers = new Set<() => void>();
  private readonly _tokenMap = new Map<string, Token<string>>();
  private readonly _tokenDescriptionMap = new Map<string, string>();
  private readonly _documentationWidgets = new Map<
    string,
    MainAreaWidget<IFrame>
  >();
  private _playgroundSidebar: SidePanel | null = null;
  private _tokenSidebar: TokenSidebar | null = null;
  private _documentationWidgetId = 0;
}

/**
 * Initialization data for the @jupyterlab/plugin-playground extension.
 */
const plugin: JupyterFrontEndPlugin<IPluginPlayground> = {
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
  optional: [ICompletionProviderManager, ILauncher, IDocumentManager],
  activate: (
    app: JupyterFrontEnd,
    settingRegistry: ISettingRegistry,
    commandPalette: ICommandPalette,
    editorTracker: IEditorTracker,
    toolbarWidgetRegistry: IToolbarWidgetRegistry,
    completionManager: ICompletionProviderManager | null,
    launcher: ILauncher | null,
    documentManager: IDocumentManager | null
  ): IPluginPlayground => {
    if (completionManager) {
      completionManager.registerProvider(new CommandCompletionProvider(app));
    }

    let playground: PluginPlayground | null = null;
    const api: IPluginPlayground = {
      registerKnownModule: async (known: IKnownModule) => {
        if (playground) {
          await playground.registerKnownModule(known);
          return;
        }
        registerKnownModule(known);
      }
    };

    // In order to accommodate loading ipywidgets and other AMD modules, we
    // load RequireJS before loading any custom extensions.

    const requirejsLoader = new RequireJSLoader();
    // We could convert to `async` and use `await` but we don't, because a failure
    // would freeze JupyterLab on splash screen; this way if it fails to load,
    // only the plugin is affected, not the entire application.
    Promise.all([settingRegistry.load(plugin.id), requirejsLoader.load()]).then(
      ([settings, requirejs]) => {
        playground = new PluginPlayground(
          app,
          settingRegistry,
          commandPalette,
          editorTracker,
          launcher,
          documentManager,
          settings,
          requirejs,
          toolbarWidgetRegistry
        );
      }
    );

    return api;
  }
};

export default plugin;
export type { IKnownModule };
