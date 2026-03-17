import ts from 'typescript';

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import {
  Dialog,
  showDialog,
  showErrorMessage,
  ICommandPalette
} from '@jupyterlab/apputils';

import { Signal } from '@lumino/signaling';

import { DocumentRegistry, IDocumentWidget } from '@jupyterlab/docregistry';

import { FileEditor, IEditorTracker } from '@jupyterlab/fileeditor';

import { ILauncher } from '@jupyterlab/launcher';

import { extensionIcon, SidePanel } from '@jupyterlab/ui-components';

import { IDocumentManager } from '@jupyterlab/docmanager';

import { Contents } from '@jupyterlab/services';
import { ICompletionProviderManager } from '@jupyterlab/completer';

import { PluginLoader, PluginLoadingError } from './loader';

import { PluginTranspiler } from './transpiler';

import { loadKnownModule } from './modules';

import { formatErrorWithResult } from './errors';

import { ImportResolver } from './resolver';

import { IRequireJS, RequireJSLoader } from './requirejs';

import { TokenSidebar } from './token-sidebar';

import { ExampleSidebar } from './example-sidebar';

import { tokenSidebarIcon } from './icons';

import {
  CommandCompletionProvider,
  getCommandRecords
} from './command-completion';

import {
  fileModelToText,
  getDirectoryModel,
  getFileModel,
  IFileModel,
  normalizeContentsPath
} from './contents';

import { Token } from '@lumino/coreutils';

import { AccordionPanel } from '@lumino/widgets';

import { IPlugin } from '@lumino/application';

namespace CommandIDs {
  export const createNewFile = 'plugin-playground:create-new-plugin';
  export const loadCurrentAsExtension = 'plugin-playground:load-as-extension';
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

class PluginPlayground {
  constructor(
    protected app: JupyterFrontEnd,
    protected settingRegistry: ISettingRegistry,
    commandPalette: ICommandPalette,
    protected editorTracker: IEditorTracker,
    launcher: ILauncher | null,
    protected documentManager: IDocumentManager | null,
    protected settings: ISettingRegistry.ISettings,
    protected requirejs: IRequireJS
  ) {
    loadKnownModule('@jupyter-widgets/base').then((module: any) => {
      // Define the widgets base module for RequireJS (left for compatibility only)
      requirejs.define('@jupyter-widgets/base', [], () => module);
    });

    app.commands.addCommand(CommandIDs.loadCurrentAsExtension, {
      label: 'Load Current File As Extension',
      describedBy: { args: null },
      icon: extensionIcon,
      isEnabled: () =>
        editorTracker.currentWidget !== null &&
        editorTracker.currentWidget === app.shell.currentWidget,
      execute: async () => {
        const currentWidget = editorTracker.currentWidget;
        if (currentWidget) {
          const currentText = currentWidget.context.model.toString();
          this._loadPlugin(currentText, currentWidget.context.path);
        }
      }
    });

    editorTracker.widgetAdded.connect(
      (_sender: IEditorTracker, widget: IDocumentWidget<FileEditor>) => {
        const onSaveState = (
          _context: DocumentRegistry.Context,
          state: DocumentRegistry.SaveState
        ) => {
          if (
            state === 'completed' &&
            (this.settings.composite.loadOnSave as boolean)
          ) {
            const currentText = widget.context.model.toString();
            this._loadPlugin(currentText, widget.context.path);
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

    app.commands.addCommand(CommandIDs.createNewFile, {
      label: 'TypeScript File (Playground)',
      caption: 'Create a new TypeScript file',
      describedBy: { args: null },
      icon: extensionIcon,
      execute: async args => {
        const model = await app.commands.execute('docmanager:new-untitled', {
          path: args['cwd'],
          type: 'file',
          ext: 'ts'
        });
        const widget: IDocumentWidget<FileEditor> | undefined =
          await app.commands.execute('docmanager:open', {
            path: model.path,
            factory: 'Editor'
          });
        if (widget) {
          widget.content.ready.then(() => {
            widget.content.model.sharedModel.setSource(PLUGIN_TEMPLATE);
          });
        }
        return widget;
      }
    });

    app.restored.then(async () => {
      const settings = this.settings;
      this._updateSettings(requirejs, settings);
      this._refreshExtensionPoints();
      const tokenSidebar = new TokenSidebar({
        getTokens: () =>
          Array.from(this._tokenMap.keys())
            .sort((left, right) => left.localeCompare(right))
            .map(name => ({
              name,
              description: this._tokenDescriptionMap.get(name) ?? ''
            })),
        getCommands: () => getCommandRecords(this.app),
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
        this._updateSettings(requirejs, updatedSettings);
      });

      this._setupLogsBadge();
    });
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

  private async _loadPlugin(code: string, path: string | null) {
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

    let result;
    try {
      result = await pluginLoader.load(code, path);
    } catch (error) {
      if (error instanceof PluginLoadingError) {
        const internalError = error.error;
        showDialog({
          title: `Plugin loading failed: ${internalError.message}`,
          body: formatErrorWithResult(error, error.partialResult)
        });
      } else {
        showErrorMessage('Plugin loading failed', (error as Error).message);
      }
      return;
    }
    const plugins = result.plugins.map(plugin =>
      this._ensureDeactivateSupport(plugin)
    );

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
        continue;
      }
      try {
        await this.app.activatePlugin(plugin.id);
        this._refreshExtensionPoints();
      } catch (e) {
        showDialog({
          title: `Plugin autostart failed: ${(e as Error).message}`,
          body: formatErrorWithResult(e as Error, result)
        });
        return;
      }
    }
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
    const statement = this._importStatement(tokenName);
    if (!statement) {
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
    if (source.includes(statement)) {
      return;
    }
    const separator = source.length > 0 ? '\n' : '';
    sourceModel.sharedModel.setSource(`${statement}${separator}${source}`);
  }

  private _importStatement(tokenName: string): string | null {
    const separatorIndex = tokenName.indexOf(':');
    if (separatorIndex === -1) {
      return null;
    }
    const packageName = tokenName.slice(0, separatorIndex).trim();
    const tokenSymbol = tokenName.slice(separatorIndex + 1).trim();
    if (!packageName || !tokenSymbol) {
      return null;
    }
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(tokenSymbol)) {
      return null;
    }
    return `import { ${tokenSymbol} } from '${packageName}';`;
  }

  private _canInsertImport(tokenName: string): boolean {
    if (!this._importStatement(tokenName)) {
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
  private readonly _tokenMap = new Map<string, Token<string>>();
  private readonly _tokenDescriptionMap = new Map<string, string>();
  private _tokenSidebar: TokenSidebar | null = null;
}

/**
 * Initialization data for the @jupyterlab/plugin-playground extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/plugin-playground:plugin',
  description:
    'Provide a playground for developing and testing JupyterLab plugins.',
  autoStart: true,
  requires: [ISettingRegistry, ICommandPalette, IEditorTracker],
  optional: [ICompletionProviderManager, ILauncher, IDocumentManager],
  activate: (
    app: JupyterFrontEnd,
    settingRegistry: ISettingRegistry,
    commandPalette: ICommandPalette,
    editorTracker: IEditorTracker,
    completionManager: ICompletionProviderManager | null,
    launcher: ILauncher | null,
    documentManager: IDocumentManager | null
  ) => {
    if (completionManager) {
      completionManager.registerProvider(new CommandCompletionProvider(app));
    }

    // In order to accommodate loading ipywidgets and other AMD modules, we
    // load RequireJS before loading any custom extensions.

    const requirejsLoader = new RequireJSLoader();
    // We coud convert to `async` and use `await` but we don't, because a failure
    // would freeze JupyterLab on splash screen; this way if it fails to load,
    // only the plugin is affected, not the entire application.
    Promise.all([settingRegistry.load(plugin.id), requirejsLoader.load()]).then(
      ([settings, requirejs]) => {
        new PluginPlayground(
          app,
          settingRegistry,
          commandPalette,
          editorTracker,
          launcher,
          documentManager,
          settings,
          requirejs
        );
      }
    );
  }
};

export default plugin;
