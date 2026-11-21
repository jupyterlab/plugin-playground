/*
 * Apply the profile stored in the browser, in JupyterLite.
 *
 * The build prepends this file to the `remoteEntry` script of the extension,
 * which runs before the application reads the page config. It must not import
 * anything.
 */

/**
 * The page config values, as stored in `jupyter-config-data`.
 */
export interface IPageConfigData {
  disabledExtensions?: string[];
  settingsOverrides?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

/**
 * What the boot script did with the stored profile.
 */
export interface IBootState {
  /**
   * Whether the application started without the profile.
   */
  safeMode: boolean;
  /**
   * Whether safe mode is on because the last start did not complete.
   */
  failedStart: boolean;
  /**
   * The profile merged in the page config, if any.
   */
  applied: IPageConfigData | null;
  /**
   * The plugins and extensions that the site disables.
   */
  siteDisabled: string[];
}

interface IBootWindow extends Window {
  /**
   * The state that the boot script records for the extension.
   */
  __pluginPlaygroundProfile?: IBootState;
}

/**
 * The URL search parameter that starts the application without the profile.
 */
export const SAFE_MODE_PARAMETER = 'safe-mode';

const CONFIG_SCRIPT_ID = 'jupyter-config-data';
const STORAGE_KEY_PREFIX = '@jupyterlab/plugin-playground:profile:';
const START_KEY_PREFIX = '@jupyterlab/plugin-playground:starting:';
const PLAYGROUND_EXTENSION = '@jupyterlab/plugin-playground';

/*
 * The bootstrap script already used these values to locate and load the
 * application and its extensions.
 */
const BOOTSTRAP_KEYS = [
  'appUrl',
  'baseUrl',
  'federated_extensions',
  'fullLabextensionsUrl',
  'fullStaticUrl'
];
const PLUGIN_KEYED_OPTIONS = ['litePluginSettings', 'settingsOverrides'];

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Whether an id is the playground extension or one of its plugins.
 */
export function isPlaygroundPlugin(id: unknown): boolean {
  return (
    id === PLAYGROUND_EXTENSION ||
    (typeof id === 'string' && id.startsWith(`${PLAYGROUND_EXTENSION}:`))
  );
}

/**
 * Get the local storage key of the profile for a JupyterLite site.
 */
export function profileStorageKey(baseUrl: string): string {
  return `${STORAGE_KEY_PREFIX}${baseUrl || '/'}`;
}

/**
 * Record that the application started correctly.
 *
 * Without this record, the next start in the same tab is in safe mode.
 */
export function markStartComplete(baseUrl: string): void {
  try {
    window.sessionStorage.removeItem(`${START_KEY_PREFIX}${baseUrl || '/'}`);
  } catch {
    // The boot script could not set the record either.
  }
}

/**
 * Remove the values that a profile is not allowed to set.
 *
 * The playground cannot be disabled, because it is the only way to edit the
 * profile. The reasons for the removals are added to `problems`.
 */
export function sanitizeProfile(
  config: unknown,
  problems: string[] = []
): IPageConfigData {
  const sanitized: IPageConfigData = {};
  if (!isObject(config)) {
    return sanitized;
  }
  for (const [key, value] of Object.entries(config)) {
    if (BOOTSTRAP_KEYS.includes(key)) {
      problems.push(`"${key}" cannot be set in the profile.`);
      continue;
    }
    if (key === 'disabledExtensions') {
      if (!Array.isArray(value)) {
        problems.push(`"${key}" must be a list of plugin ids.`);
        continue;
      }
      const disabled = value.filter((id): id is string => {
        if (isPlaygroundPlugin(id)) {
          problems.push(`"${id}" cannot be disabled.`);
          return false;
        }
        return typeof id === 'string';
      });
      if (disabled.length > 0) {
        sanitized[key] = [...new Set(disabled)];
      }
    } else if (PLUGIN_KEYED_OPTIONS.includes(key)) {
      const plugins: Record<string, unknown> = {};
      for (const [plugin, values] of Object.entries(
        isObject(value) ? value : {}
      )) {
        if (isObject(values) && Object.keys(values).length > 0) {
          plugins[plugin] = values;
        }
      }
      if (Object.keys(plugins).length > 0) {
        sanitized[key] = plugins;
      }
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Merge a profile on top of a page config, as JupyterLite merges its
 * `jupyter-lite.json` files.
 */
export function mergePageConfig(
  base: IPageConfigData,
  top: IPageConfigData
): IPageConfigData {
  const merged: IPageConfigData = { ...base, ...top };
  if (top.disabledExtensions) {
    const disabled = Array.isArray(base.disabledExtensions)
      ? base.disabledExtensions
      : [];
    merged.disabledExtensions = [
      ...new Set([...disabled, ...top.disabledExtensions])
    ];
  }
  for (const key of PLUGIN_KEYED_OPTIONS) {
    const plugins = top[key];
    if (!isObject(plugins)) {
      continue;
    }
    const mergedPlugins = { ...(isObject(base[key]) ? base[key] : {}) };
    for (const [plugin, values] of Object.entries(plugins)) {
      const existing = mergedPlugins[plugin];
      mergedPlugins[plugin] = {
        ...(isObject(existing) ? existing : {}),
        ...(isObject(values) ? values : {})
      };
    }
    merged[key] = mergedPlugins;
  }
  return merged;
}

/**
 * Get the state recorded by the boot script.
 *
 * It is `null` when the boot script did not run, as in JupyterLab.
 */
export function getBootState(): IBootState | null {
  return (window as IBootWindow).__pluginPlaygroundProfile ?? null;
}

/**
 * Merge the stored profile in the page config of a JupyterLite site.
 */
export function applyStoredProfile(): void {
  const script = document.getElementById(CONFIG_SCRIPT_ID);
  if (!script || script.dataset.jupyterLiteRoot === undefined) {
    return;
  }
  const state: IBootState = {
    safeMode: false,
    failedStart: false,
    applied: null,
    siteDisabled: []
  };
  (window as IBootWindow).__pluginPlaygroundProfile = state;
  try {
    const config = JSON.parse(script.textContent || '{}') as IPageConfigData;
    const baseUrl = String(config.baseUrl ?? '');
    if (Array.isArray(config.disabledExtensions)) {
      state.siteDisabled = config.disabledExtensions.filter(
        (id): id is string => typeof id === 'string'
      );
    }
    if (new URLSearchParams(window.location.search).has(SAFE_MODE_PARAMETER)) {
      state.safeMode = true;
      return;
    }
    // A profile that stops the start cannot be corrected from the page.
    const startKey = `${START_KEY_PREFIX}${baseUrl || '/'}`;
    if (window.sessionStorage.getItem(startKey) !== null) {
      window.sessionStorage.removeItem(startKey);
      state.safeMode = true;
      state.failedStart = true;
      return;
    }
    window.sessionStorage.setItem(startKey, '1');
    const stored = window.localStorage.getItem(profileStorageKey(baseUrl));
    if (!stored) {
      return;
    }
    const profile = sanitizeProfile(JSON.parse(stored));
    script.textContent = JSON.stringify(mergePageConfig(config, profile));
    state.applied = profile;
  } catch (error) {
    console.warn(
      'Plugin Playground: failed to apply the stored profile.',
      error
    );
  }
}
