import { JupyterFrontEnd, JupyterLab } from '@jupyterlab/application';

import { PageConfig } from '@jupyterlab/coreutils';

import { Contents } from '@jupyterlab/services';

import {
  DefaultSchemaValidator,
  ISettingRegistry
} from '@jupyterlab/settingregistry';

import { JSONExt, ReadonlyJSONValue } from '@lumino/coreutils';

import { ISignal, Signal } from '@lumino/signaling';

import { ContentUtils } from './contents';

import {
  profileStorageKey,
  getBootState,
  type IBootState,
  type IPageConfigData,
  isPlaygroundPlugin,
  markStartComplete,
  SAFE_MODE_PARAMETER,
  sanitizeProfile
} from './preboot';

const DIRECTORY = '_profile';
const PAGE_CONFIG_FILE = `${DIRECTORY}/jupyter-lite.json`;
const OVERRIDES_FILE = `${DIRECTORY}/overrides.json`;
const PLUGINS_DIRECTORY = `${DIRECTORY}/plugins`;
const CONFIG_DATA_KEY = 'jupyter-config-data';
const DISABLED_EXTENSIONS_KEY = 'disabledExtensions';
const SETTINGS_OVERRIDES_KEY = 'settingsOverrides';
const PLUGIN_SOURCE_PATTERN = /\.(?:js|jsx|ts|tsx)$/i;
const PACKAGE_ENTRY_POINTS = [
  'src/index.ts',
  'src/index.tsx',
  'src/index.js',
  'index.ts',
  'index.tsx',
  'index.js'
];
const REFRESH_DELAY = 200;

type JSONRecord = Record<string, unknown>;

export const LIST_PLUGINS_ARGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    query: {
      type: 'string',
      description:
        'Optional filter text. Matches plugins case-insensitively by id, extension name, or description. All the words must match.'
    }
  }
} as const;

export const LIST_SETTINGS_ARGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    query: {
      type: 'string',
      description:
        'Optional filter text. Matches settings case-insensitively by plugin id, key, title, description, or option of an object setting. All the words must match.'
    }
  }
} as const;

export const SET_PLUGIN_ENABLED_ARGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: {
      type: 'string',
      description:
        'A plugin id (for example "@jupyterlab/statusbar-extension:plugin"), or an extension name to target all its plugins (for example "@jupyterlab/toc-extension").'
    }
  }
} as const;

export const OVERRIDE_SETTING_ARGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['plugin', 'key'],
  properties: {
    plugin: {
      type: 'string',
      description:
        'The id of the plugin that owns the setting (for example "@jupyterlab/apputils-extension:themes").'
    },
    key: {
      type: 'string',
      description: 'The name of the setting (for example "theme").'
    },
    value: {
      description:
        'The new default value of the setting. Omit it to remove the override.'
    }
  }
} as const;

/**
 * Reload the page, without the safe mode parameter.
 */
export function reloadApplication(): void {
  const url = new URL(window.location.href);
  if (url.searchParams.has(SAFE_MODE_PARAMETER)) {
    url.searchParams.delete(SAFE_MODE_PARAMETER);
    window.location.assign(url);
  } else {
    window.location.reload();
  }
}

/**
 * Whether all the words of a query are in the texts, case-insensitively.
 *
 * Thus `line numbers` matches `lineNumbers`.
 */
function matchesQuery(query: string, texts: string[]): boolean {
  const text = texts.join('\n').toLowerCase();
  return ContentUtils.normalizeQuery(query)
    .split(/\s+/)
    .every(word => text.includes(word));
}

/**
 * Filter plugin records by a case-insensitive query.
 */
export function filterPluginRecords(
  plugins: ReadonlyArray<ProfileManager.IPluginRecord>,
  query: string
): ReadonlyArray<ProfileManager.IPluginRecord> {
  return plugins.filter(plugin =>
    matchesQuery(query, [plugin.id, plugin.description])
  );
}

/**
 * Filter setting records by a case-insensitive query.
 */
export function filterSettingRecords(
  settings: ReadonlyArray<ProfileManager.ISettingRecord>,
  query: string
): ReadonlyArray<ProfileManager.ISettingRecord> {
  return settings.filter(setting =>
    matchesQuery(query, [
      setting.plugin,
      setting.key,
      setting.title,
      setting.description,
      // The options of an object setting are only in its default value.
      ...Object.keys(isObject(setting.default) ? setting.default : {})
    ])
  );
}

/**
 * Manage the profile of a JupyterLite site stored in the browser.
 *
 * The files in the `_profile` folder are the source of truth. A copy of
 * the page config is kept in local storage, because the boot script cannot
 * read the contents before the application starts.
 */
export class ProfileManager {
  constructor(options: ProfileManager.IOptions) {
    this._app = options.app;
    this._info = options.info;
    this._settingRegistry = options.settingRegistry;
    this._bootState = getBootState();
    // Plugins that the playground loads later are not plugins of the site.
    this._sitePlugins = this._app.listPlugins();
    this._status = {
      supported: this._bootState !== null,
      safeMode: this._bootState?.safeMode ?? false,
      files: {
        pageConfig: PAGE_CONFIG_FILE,
        settingsOverrides: OVERRIDES_FILE,
        plugins: PLUGINS_DIRECTORY
      },
      applied: this._bootState?.applied ?? {},
      pending: this._bootState?.applied ?? {},
      reloadRequired: false,
      startupPlugins: [],
      problems: []
    };
    if (this._bootState) {
      this._app.serviceManager.contents.fileChanged.connect(
        this._onFileChanged,
        this
      );
    }
  }

  /**
   * Whether the profile can be applied, which needs JupyterLite.
   */
  get isSupported(): boolean {
    return this._bootState !== null;
  }

  /**
   * Whether the application started without the profile.
   */
  get isSafeMode(): boolean {
    return this._status.safeMode;
  }

  /**
   * Whether safe mode is on because the last start did not complete.
   */
  get isFailedStart(): boolean {
    return this._bootState?.failedStart ?? false;
  }

  /**
   * The status computed by the last refresh.
   */
  get status(): ProfileManager.IStatus {
    return this._status;
  }

  /**
   * A signal emitted when the status changes.
   */
  get changed(): ISignal<this, ProfileManager.IStatus> {
    return this._changed;
  }

  /**
   * Read the profile files and store the page config for the next start.
   */
  refresh(): Promise<ProfileManager.IStatus> {
    return this._enqueue(() => this._refresh());
  }

  /**
   * Record that the application started with the profile.
   */
  completeStart(): void {
    markStartComplete(PageConfig.getOption('baseUrl'));
  }

  /**
   * List the plugins of the site, including the disabled ones.
   *
   * The `extension` of a plugin is the start of its id, which is the name that
   * disables all the plugins of an extension.
   */
  listPlugins(): ProfileManager.IPluginRecord[] {
    const descriptions = new Map(
      this._availablePlugins().map(plugin => [
        plugin.id,
        plugin.description ?? ''
      ])
    );
    const ids = new Set([
      ...this._sitePlugins,
      ...descriptions.keys(),
      ...this._disabledAtStart()
    ]);
    return [...ids]
      .sort((left, right) => left.localeCompare(right))
      .map(id => {
        const enabled = this._app.hasPlugin(id);
        return {
          id,
          extension: id.split(':')[0],
          description:
            descriptions.get(id) ||
            (enabled ? this._app.getPluginDescription(id) : ''),
          enabled
        };
      });
  }

  /**
   * List the settings of the application, with their default values.
   */
  async listSettings(): Promise<ProfileManager.ISettingRecord[]> {
    const { values } = await this._settingRegistry.connector.list();
    const records: ProfileManager.ISettingRecord[] = [];
    for (const plugin of values) {
      for (const [key, property] of Object.entries(
        plugin.schema.properties ?? {}
      )) {
        records.push({
          plugin: plugin.id,
          key,
          title: property.title ?? '',
          description: property.description ?? '',
          type: property.type ?? null,
          default: property.default ?? null
        });
      }
    }
    return records.sort(
      (left, right) =>
        left.plugin.localeCompare(right.plugin) ||
        left.key.localeCompare(right.key)
    );
  }

  /**
   * Disable or enable a plugin, or all the plugins of an extension.
   */
  setPluginEnabled(
    id: string,
    enabled: boolean
  ): Promise<ProfileManager.IStatus> {
    this._assertSupported();
    if (!id) {
      throw new Error('The "id" of a plugin or an extension is necessary.');
    }
    return this._enqueue(async () => {
      const file = (await this._readFile(PAGE_CONFIG_FILE, true)) ?? {
        'jupyter-lite-schema-version': 0
      };
      const config = isObject(file[CONFIG_DATA_KEY])
        ? file[CONFIG_DATA_KEY]
        : {};
      const current = Array.isArray(config[DISABLED_EXTENSIONS_KEY])
        ? (config[DISABLED_EXTENSIONS_KEY] as unknown[])
        : [];
      if (current.includes(id) !== enabled) {
        const applied = this._status.applied.disabledExtensions ?? [];
        const elsewhere = [
          ...(this._bootState?.siteDisabled ?? []),
          ...this._disabledAtStart().filter(entry => !applied.includes(entry))
        ];
        if (enabled && matchesPlugin(elsewhere, id)) {
          throw new Error(
            `"${id}" is disabled outside the profile, which cannot enable it.`
          );
        }
        return this._refresh();
      }
      if (!enabled) {
        this._assertCanDisable(id);
      }
      const disabled = enabled
        ? current.filter(entry => entry !== id)
        : [...current, id];
      if (disabled.length > 0) {
        config[DISABLED_EXTENSIONS_KEY] = disabled;
      } else {
        delete config[DISABLED_EXTENSIONS_KEY];
      }
      file[CONFIG_DATA_KEY] = config;
      await this._writeFile(PAGE_CONFIG_FILE, file);
      return this._refresh();
    });
  }

  /**
   * Set the default value of a setting, or remove it when `value` is
   * `undefined`.
   */
  overrideSetting(
    plugin: string,
    key: string,
    value: unknown
  ): Promise<ProfileManager.IOverrideResult> {
    this._assertSupported();
    if (!plugin || !key) {
      throw new Error('The "plugin" and the "key" of a setting are necessary.');
    }
    return this._enqueue(async () => {
      if (value !== undefined) {
        const problem = await this._checkOverride(plugin, key, value);
        if (problem) {
          throw new Error(problem);
        }
      }
      const overrides = await this._readFile(OVERRIDES_FILE, true);
      if (value !== undefined || hasOverride(overrides, plugin, key)) {
        const changed = overrides ?? {};
        setOverride(changed, plugin, key, value);
        await this._writeFile(OVERRIDES_FILE, changed);
      }
      if (value === undefined) {
        // The page config file can also have settings overrides.
        const file = await this._readFile(PAGE_CONFIG_FILE, true);
        const config = file?.[CONFIG_DATA_KEY];
        const inPageConfig = isObject(config)
          ? config[SETTINGS_OVERRIDES_KEY]
          : null;
        if (file && hasOverride(inPageConfig, plugin, key)) {
          setOverride(inPageConfig as JSONRecord, plugin, key, value);
          await this._writeFile(PAGE_CONFIG_FILE, file);
        }
      }
      const status = await this._refresh();
      const message = await this._describeUserValue(plugin, key, value);
      return message ? { ...status, message } : status;
    });
  }

  /**
   * Run the tasks that read or write the files one at a time.
   */
  private _enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this._queue.catch(() => undefined).then(task);
    this._queue = result;
    return result;
  }

  private _availablePlugins(): JupyterLab.IPluginInfo[] {
    return this._info?.availablePlugins ?? [];
  }

  /**
   * Get the plugins and extensions that were disabled when the page loaded.
   *
   * The application information has the entries that are not in the page
   * config, as the ones of the plugin manager of JupyterLite.
   */
  private _disabledAtStart(): string[] {
    return [
      ...new Set([
        ...PageConfig.Extension.disabled,
        ...(this._info?.disabled.patterns ?? [])
      ])
    ];
  }

  /**
   * Whether the playground cannot start without a plugin or an extension.
   */
  private _isRequired(id: string): boolean {
    if (!this._required) {
      const plugins = this._availablePlugins();
      const providers = new Map<string, JupyterLab.IPluginInfo>();
      for (const plugin of plugins) {
        if (plugin.provides) {
          providers.set(plugin.provides.name, plugin);
        }
      }
      const required = new Set<string>();
      const dependents = plugins.filter(plugin =>
        isPlaygroundPlugin(plugin.id)
      );
      for (
        let dependent = dependents.pop();
        dependent;
        dependent = dependents.pop()
      ) {
        for (const token of dependent.requires ?? []) {
          const provider = providers.get(token.name);
          if (provider && !required.has(provider.id)) {
            required.add(provider.id);
            dependents.push(provider);
          }
        }
      }
      this._required = [...required];
    }
    return matchesPlugin([id], ...this._required);
  }

  private _assertCanDisable(id: string): void {
    if (isPlaygroundPlugin(id)) {
      throw new Error(`"${id}" cannot be disabled.`);
    }
    if (this._isRequired(id)) {
      throw new Error(
        `"${id}" cannot be disabled, because Plugin Playground needs it.`
      );
    }
    if (
      !this.listPlugins().some(
        plugin => plugin.id === id || plugin.extension === id
      )
    ) {
      throw new Error(`"${id}" is not a plugin or an extension of the site.`);
    }
  }

  private _assertSupported(): void {
    if (!this._bootState) {
      throw new Error('The profile is only available in JupyterLite.');
    }
  }

  private async _refresh(): Promise<ProfileManager.IStatus> {
    if (!this._bootState) {
      return this._status;
    }
    const problems: string[] = [];
    const pageConfig = await this._readFile(PAGE_CONFIG_FILE, false, problems);
    const config: IPageConfigData = {};
    if (pageConfig && CONFIG_DATA_KEY in pageConfig) {
      if (isObject(pageConfig[CONFIG_DATA_KEY])) {
        Object.assign(config, pageConfig[CONFIG_DATA_KEY]);
      } else {
        problems.push(
          `"${CONFIG_DATA_KEY}" must be an object in "${PAGE_CONFIG_FILE}".`
        );
      }
    }
    const overrides = await this._validOverrides(
      [
        config[SETTINGS_OVERRIDES_KEY],
        await this._readFile(OVERRIDES_FILE, false, problems)
      ],
      problems
    );
    delete config[SETTINGS_OVERRIDES_KEY];
    if (Object.keys(overrides).length > 0) {
      config[SETTINGS_OVERRIDES_KEY] = overrides;
    }
    const pending = sanitizeProfile(config, problems);
    const disabled = pending.disabledExtensions ?? [];
    const allowed = disabled.filter(id => !this._isRequired(id));
    if (allowed.length < disabled.length) {
      problems.push(
        ...disabled
          .filter(id => !allowed.includes(id))
          .map(
            id =>
              `"${id}" cannot be disabled, because Plugin Playground needs it.`
          )
      );
      if (allowed.length > 0) {
        pending[DISABLED_EXTENSIONS_KEY] = allowed;
      } else {
        delete pending[DISABLED_EXTENSIONS_KEY];
      }
    }
    this._store(pending, problems);

    const status: ProfileManager.IStatus = {
      ...this._status,
      pending,
      reloadRequired: !JSONExt.deepEqual(
        this._status.applied as ReadonlyJSONValue,
        pending as ReadonlyJSONValue
      ),
      startupPlugins: await this._findStartupPlugins(),
      problems
    };
    const changed = !JSONExt.deepEqual(
      this._status as unknown as ReadonlyJSONValue,
      status as unknown as ReadonlyJSONValue
    );
    this._status = status;
    if (changed) {
      this._changed.emit(status);
    }
    return status;
  }

  /**
   * Keep the overrides that match a setting of the application.
   *
   * JupyterLite fails to load all the settings when an override targets a
   * setting that is not in the schema of its plugin.
   */
  private async _validOverrides(
    layers: unknown[],
    problems: string[]
  ): Promise<Record<string, JSONRecord>> {
    const valid: Record<string, JSONRecord> = {};
    for (const layer of layers) {
      if (!isObject(layer)) {
        continue;
      }
      for (const [plugin, values] of Object.entries(layer)) {
        if (!isObject(values)) {
          problems.push(`The overrides of "${plugin}" must be an object.`);
          continue;
        }
        for (const [key, value] of Object.entries(values)) {
          const problem = await this._checkOverride(plugin, key, value);
          if (problem) {
            problems.push(problem);
          } else {
            valid[plugin] = { ...valid[plugin], [key]: value };
          }
        }
      }
    }
    return valid;
  }

  private async _checkOverride(
    plugin: string,
    key: string,
    value: unknown
  ): Promise<string | null> {
    const schema = await this._fetchSchema(plugin);
    if (!schema) {
      return `"${plugin}" has no settings.`;
    }
    if (!schema.properties?.[key]) {
      const keys = Object.keys(schema.properties ?? {}).join(', ');
      return `"${plugin}" has no "${key}" setting. The available settings are: ${keys}.`;
    }
    // A default value must be valid as a value of the setting.
    const errors = this._validator.validateData(
      {
        id: plugin,
        schema,
        raw: JSON.stringify({ [key]: value }),
        data: { composite: {}, user: {} },
        version: ''
      },
      false
    );
    if (errors) {
      return `The value of the "${key}" setting of "${plugin}" is not valid: ${errors
        .map(error => `${error.instancePath} ${error.message ?? ''}`.trim())
        .join('; ')}.`;
    }
    return null;
  }

  /**
   * Tell why a new default value has no effect, if the user set another value.
   */
  private async _describeUserValue(
    plugin: string,
    key: string,
    value: unknown
  ): Promise<string | null> {
    if (value === undefined) {
      return null;
    }
    const settings = await this._settingRegistry.load(plugin).catch(() => null);
    const userValue = settings?.user[key];
    settings?.dispose();
    if (
      userValue === undefined ||
      JSONExt.deepEqual(userValue, value as ReadonlyJSONValue)
    ) {
      return null;
    }
    return `The user set the "${key}" setting of "${plugin}" to ${JSON.stringify(
      userValue
    )}. A value that the user set replaces the default value, thus the override has no effect until the user restores the default value of the setting in the Settings Editor.`;
  }

  private async _fetchSchema(
    plugin: string
  ): Promise<ISettingRegistry.ISchema | null> {
    const loaded = this._settingRegistry.plugins[plugin];
    if (loaded) {
      return loaded.schema;
    }
    const cached = this._schemas.get(plugin);
    if (cached) {
      return cached;
    }
    const schema = await this._settingRegistry.connector
      .fetch(plugin)
      .then(fetched => fetched?.schema ?? null)
      .catch(() => null);
    if (schema) {
      this._schemas.set(plugin, schema);
    }
    return schema;
  }

  private _store(pending: IPageConfigData, problems: string[]): void {
    const key = profileStorageKey(PageConfig.getOption('baseUrl'));
    try {
      if (Object.keys(pending).length > 0) {
        window.localStorage.setItem(key, JSON.stringify(pending));
      } else {
        window.localStorage.removeItem(key);
      }
    } catch (error) {
      problems.push(
        `The profile could not be stored in the browser: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Find the plugin files and the entry points of the plugin packages.
   */
  private async _findStartupPlugins(): Promise<string[]> {
    const serviceManager = this._app.serviceManager;
    const directory = await ContentUtils.getDirectoryModel(
      serviceManager,
      PLUGINS_DIRECTORY
    );
    const paths: string[] = [];
    for (const item of directory?.content ?? []) {
      const path = ContentUtils.normalizeContentsPath(item.path);
      if (item.type === 'file' && PLUGIN_SOURCE_PATTERN.test(item.name)) {
        paths.push(path);
      } else if (item.type === 'directory') {
        for (const entryPoint of PACKAGE_ENTRY_POINTS) {
          const candidate = `${path}/${entryPoint}`;
          if (await ContentUtils.getFileModel(serviceManager, candidate)) {
            paths.push(candidate);
            break;
          }
        }
      }
    }
    return paths.sort();
  }

  /**
   * Read a JSON file. An invalid file is a problem, or an error when `strict`.
   */
  private async _readFile(
    path: string,
    strict: boolean,
    problems: string[] = []
  ): Promise<JSONRecord | null> {
    const text = await ContentUtils.readContentsFileAsText(
      this._app.serviceManager,
      path
    );
    if (text === null || text.trim() === '') {
      return null;
    }
    const parsed = ContentUtils.parseJsonObject(text);
    if (!parsed) {
      const problem = `"${path}" is not a valid JSON object.`;
      if (strict) {
        throw new Error(problem);
      }
      problems.push(problem);
    }
    return parsed;
  }

  private async _writeFile(path: string, value: JSONRecord): Promise<void> {
    await ContentUtils.ensureContentsDirectory(
      this._app.serviceManager,
      DIRECTORY
    );
    await this._app.serviceManager.contents.save(path, {
      type: 'file',
      format: 'text',
      content: `${JSON.stringify(value, null, 2)}\n`
    });
  }

  private _onFileChanged(
    sender: Contents.IManager,
    change: Contents.IChangedArgs
  ): void {
    const isProfileFile = [change.oldValue?.path, change.newValue?.path].some(
      path => {
        const normalized = ContentUtils.normalizeContentsPath(path);
        return (
          normalized === DIRECTORY || normalized.startsWith(`${DIRECTORY}/`)
        );
      }
    );
    if (!isProfileFile) {
      return;
    }
    // An agent often writes several files in a row.
    window.clearTimeout(this._refreshTimer);
    this._refreshTimer = window.setTimeout(() => {
      void this.refresh().catch(error => {
        console.warn('Failed to refresh the profile.', error);
      });
    }, REFRESH_DELAY);
  }

  private readonly _app: JupyterFrontEnd;
  private readonly _info: JupyterLab.IInfo | null;
  private readonly _validator = new DefaultSchemaValidator();
  private readonly _settingRegistry: ISettingRegistry;
  private readonly _bootState: IBootState | null;
  private readonly _changed = new Signal<this, ProfileManager.IStatus>(this);
  private readonly _schemas = new Map<string, ISettingRegistry.ISchema>();
  private readonly _sitePlugins: string[];
  private _required: string[] | null = null;
  private _status: ProfileManager.IStatus;
  private _queue: Promise<unknown> = Promise.resolve();
  private _refreshTimer = 0;
}

export namespace ProfileManager {
  export interface IOptions {
    app: JupyterFrontEnd;
    /**
     * The application information, which lists the plugins of the site.
     */
    info: JupyterLab.IInfo | null;
    settingRegistry: ISettingRegistry;
  }

  export interface IPluginRecord {
    id: string;
    extension: string;
    description: string;
    enabled: boolean;
  }

  export interface ISettingRecord {
    plugin: string;
    key: string;
    title: string;
    description: string;
    type: string | string[] | null;
    default: unknown;
  }

  /**
   * The state of the profile, as returned to the commands.
   */
  export interface IStatus {
    supported: boolean;
    safeMode: boolean;
    files: {
      pageConfig: string;
      settingsOverrides: string;
      plugins: string;
    };
    /**
     * The page config merged when the application started.
     */
    applied: IPageConfigData;
    /**
     * The page config that the next start will merge.
     */
    pending: IPageConfigData;
    reloadRequired: boolean;
    /**
     * The contents paths of the plugins loaded when the application starts.
     */
    startupPlugins: string[];
    problems: string[];
  }

  /**
   * The state of the profile after a change of the default value of a setting.
   */
  export interface IOverrideResult extends IStatus {
    /**
     * Why the new default value has no effect, if the user set another value.
     */
    message?: string;
  }
}

function isObject(value: unknown): value is JSONRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Whether an entry of a list of disabled extensions applies to a plugin.
 *
 * An entry is a plugin id, or the start of the ids of an extension.
 */
function matchesPlugin(entries: string[], ...plugins: string[]): boolean {
  return plugins.some(
    plugin => entries.includes(plugin) || entries.includes(plugin.split(':')[0])
  );
}

function hasOverride(overrides: unknown, plugin: string, key: string): boolean {
  return (
    isObject(overrides) &&
    isObject(overrides[plugin]) &&
    key in overrides[plugin]
  );
}

/**
 * Set a value in overrides keyed by plugin, or remove it when `undefined`.
 */
function setOverride(
  overrides: JSONRecord,
  plugin: string,
  key: string,
  value: unknown
): void {
  const values = isObject(overrides[plugin]) ? overrides[plugin] : {};
  if (value === undefined) {
    delete values[key];
  } else {
    values[key] = value;
  }
  if (Object.keys(values).length > 0) {
    overrides[plugin] = values;
  } else {
    delete overrides[plugin];
  }
}
