import type { IModule } from './types';
import maxSatisfying from 'semver/functions/max-satisfying';
import validRange from 'semver/ranges/valid';

interface ISharedModuleProvider {
  get: () => Promise<(() => IModule) | IModule>;
}

export interface ILoadKnownModuleOptions {
  requiredVersion?: string | null;
}

type ISharedModuleProviders = Record<string, ISharedModuleProvider>;
type ISharedScope = Record<string, ISharedModuleProviders>;
type ISharedScopes = { default?: ISharedScope };

interface IWebpackRuntimeRequire {
  I?: (scope: string) => Promise<void> | void;
  S?: ISharedScopes;
}

declare const __webpack_require__:
  | IWebpackRuntimeRequire
  | undefined;
declare const __webpack_share_scopes__:
  | ISharedScopes
  | undefined;

export const KNOWN_MODULE_NAMES: ReadonlyArray<string> = [
  '@codemirror/language',
  '@codemirror/state',
  '@codemirror/view',
  '@jupyter-notebook/application',
  '@jupyter-widgets/base',
  '@jupyter/collaborative-drive',
  '@jupyter/docprovider',
  '@jupyter/react-components',
  '@jupyter/web-components',
  '@jupyter/ydoc',
  '@jupyterlab/application',
  '@jupyterlab/apputils',
  '@jupyterlab/attachments',
  '@jupyterlab/cell-toolbar',
  '@jupyterlab/cells',
  '@jupyterlab/codeeditor',
  '@jupyterlab/codemirror',
  '@jupyterlab/completer',
  '@jupyterlab/console',
  '@jupyterlab/coreutils',
  '@jupyterlab/csvviewer',
  '@jupyterlab/debugger',
  '@jupyterlab/docmanager',
  '@jupyterlab/docregistry',
  '@jupyterlab/documentsearch',
  '@jupyterlab/extensionmanager',
  '@jupyterlab/filebrowser',
  '@jupyterlab/fileeditor',
  '@jupyterlab/htmlviewer',
  '@jupyterlab/imageviewer',
  '@jupyterlab/inspector',
  '@jupyterlab/launcher',
  '@jupyterlab/logconsole',
  '@jupyterlab/lsp',
  '@jupyterlab/mainmenu',
  '@jupyterlab/markdownviewer',
  '@jupyterlab/mermaid',
  '@jupyterlab/metadataform',
  '@jupyterlab/nbformat',
  '@jupyterlab/notebook',
  '@jupyterlab/observables',
  '@jupyterlab/outputarea',
  '@jupyterlab/pluginmanager',
  '@jupyterlab/property-inspector',
  '@jupyterlab/rendermime',
  '@jupyterlab/rendermime-interfaces',
  '@jupyterlab/running',
  '@jupyterlab/services',
  '@jupyterlab/settingeditor',
  '@jupyterlab/settingregistry',
  '@jupyterlab/statedb',
  '@jupyterlab/statusbar',
  '@jupyterlab/terminal',
  '@jupyterlab/toc',
  '@jupyterlab/tooltip',
  '@jupyterlab/translation',
  '@jupyterlab/ui-components',
  '@jupyterlab/workspaces',
  '@lezer/common',
  '@lezer/highlight',
  '@lumino/algorithm',
  '@lumino/application',
  '@lumino/commands',
  '@lumino/coreutils',
  '@lumino/datagrid',
  '@lumino/disposable',
  '@lumino/domutils',
  '@lumino/dragdrop',
  '@lumino/keyboard',
  '@lumino/messaging',
  '@lumino/polling',
  '@lumino/properties',
  '@lumino/signaling',
  '@lumino/virtualdom',
  '@lumino/widgets',
  '@rjsf/utils',
  'react',
  'react-dom',
  'yjs'
];


export function loadKnownModule(
  name: string,
  options: ILoadKnownModuleOptions = {}
): Promise<IModule | null> {
  switch (name) {
    case '@codemirror/language':
      return import('@codemirror/language') as any;
    case '@codemirror/state':
      return import('@codemirror/state') as any;
    case '@codemirror/view':
      return import('@codemirror/view') as any;
    case '@jupyter-notebook/application':
      return import('@jupyter-notebook/application') as any;
    case '@jupyter-widgets/base':
      return import('@jupyter-widgets/base') as any;
    case '@jupyter/collaborative-drive':
      return import('@jupyter/collaborative-drive') as any;
    case '@jupyter/docprovider':
      return import('@jupyter/docprovider') as any;
    case '@jupyter/react-components':
      return import('@jupyter/react-components') as any;
    case '@jupyter/web-components':
      return import('@jupyter/web-components') as any;
    case '@jupyter/ydoc':
      return import('@jupyter/ydoc') as any;
    case '@jupyterlab/application':
      return import('@jupyterlab/application') as any;
    case '@jupyterlab/apputils':
      return import('@jupyterlab/apputils') as any;
    case '@jupyterlab/attachments':
      return import('@jupyterlab/attachments') as any;
    case '@jupyterlab/cell-toolbar':
      return import('@jupyterlab/cell-toolbar') as any;
    case '@jupyterlab/cells':
      return import('@jupyterlab/cells') as any;
    case '@jupyterlab/codeeditor':
      return import('@jupyterlab/codeeditor') as any;
    case '@jupyterlab/codemirror':
      return import('@jupyterlab/codemirror') as any;
    case '@jupyterlab/completer':
      return import('@jupyterlab/completer') as any;
    case '@jupyterlab/console':
      return import('@jupyterlab/console') as any;
    case '@jupyterlab/coreutils':
      return import('@jupyterlab/coreutils') as any;
    case '@jupyterlab/csvviewer':
      return import('@jupyterlab/csvviewer') as any;
    case '@jupyterlab/debugger':
      return import('@jupyterlab/debugger') as any;
    case '@jupyterlab/docmanager':
      return import('@jupyterlab/docmanager') as any;
    case '@jupyterlab/docregistry':
      return import('@jupyterlab/docregistry') as any;
    case '@jupyterlab/documentsearch':
      return import('@jupyterlab/documentsearch') as any;
    case '@jupyterlab/extensionmanager':
      return import('@jupyterlab/extensionmanager') as any;
    case '@jupyterlab/filebrowser':
      return import('@jupyterlab/filebrowser') as any;
    case '@jupyterlab/fileeditor':
      return import('@jupyterlab/fileeditor') as any;
    case '@jupyterlab/htmlviewer':
      return import('@jupyterlab/htmlviewer') as any;
    case '@jupyterlab/imageviewer':
      return import('@jupyterlab/imageviewer') as any;
    case '@jupyterlab/inspector':
      return import('@jupyterlab/inspector') as any;
    case '@jupyterlab/launcher':
      return import('@jupyterlab/launcher') as any;
    case '@jupyterlab/logconsole':
      return import('@jupyterlab/logconsole') as any;
    case '@jupyterlab/lsp':
      return import('@jupyterlab/lsp') as any;
    case '@jupyterlab/mainmenu':
      return import('@jupyterlab/mainmenu') as any;
    case '@jupyterlab/markdownviewer':
      return import('@jupyterlab/markdownviewer') as any;
    case '@jupyterlab/mermaid':
      return import('@jupyterlab/mermaid') as any;
    case '@jupyterlab/metadataform':
      return import('@jupyterlab/metadataform') as any;
    case '@jupyterlab/nbformat':
      return import('@jupyterlab/nbformat') as any;
    case '@jupyterlab/notebook':
      return import('@jupyterlab/notebook') as any;
    case '@jupyterlab/observables':
      return import('@jupyterlab/observables') as any;
    case '@jupyterlab/outputarea':
      return import('@jupyterlab/outputarea') as any;
    case '@jupyterlab/pluginmanager':
      return import('@jupyterlab/pluginmanager') as any;
    case '@jupyterlab/property-inspector':
      return import('@jupyterlab/property-inspector') as any;
    case '@jupyterlab/rendermime':
      return import('@jupyterlab/rendermime') as any;
    case '@jupyterlab/rendermime-interfaces':
      return import('@jupyterlab/rendermime-interfaces') as any;
    case '@jupyterlab/running':
      return import('@jupyterlab/running') as any;
    case '@jupyterlab/services':
      return import('@jupyterlab/services') as any;
    case '@jupyterlab/settingeditor':
      return import('@jupyterlab/settingeditor') as any;
    case '@jupyterlab/settingregistry':
      return import('@jupyterlab/settingregistry') as any;
    case '@jupyterlab/statedb':
      return import('@jupyterlab/statedb') as any;
    case '@jupyterlab/statusbar':
      return import('@jupyterlab/statusbar') as any;
    case '@jupyterlab/terminal':
      return import('@jupyterlab/terminal') as any;
    case '@jupyterlab/toc':
      return import('@jupyterlab/toc') as any;
    case '@jupyterlab/tooltip':
      return import('@jupyterlab/tooltip') as any;
    case '@jupyterlab/translation':
      return import('@jupyterlab/translation') as any;
    case '@jupyterlab/ui-components':
      return import('@jupyterlab/ui-components') as any;
    case '@jupyterlab/workspaces':
      return import('@jupyterlab/workspaces') as any;
    case '@lezer/common':
      return import('@lezer/common') as any;
    case '@lezer/highlight':
      return import('@lezer/highlight') as any;
    case '@lumino/algorithm':
      return import('@lumino/algorithm') as any;
    case '@lumino/application':
      return import('@lumino/application') as any;
    case '@lumino/commands':
      return import('@lumino/commands') as any;
    case '@lumino/coreutils':
      return import('@lumino/coreutils') as any;
    case '@lumino/datagrid':
      return import('@lumino/datagrid') as any;
    case '@lumino/disposable':
      return import('@lumino/disposable') as any;
    case '@lumino/domutils':
      return import('@lumino/domutils') as any;
    case '@lumino/dragdrop':
      return import('@lumino/dragdrop') as any;
    case '@lumino/keyboard':
      return import('@lumino/keyboard') as any;
    case '@lumino/messaging':
      return import('@lumino/messaging') as any;
    case '@lumino/polling':
      return import('@lumino/polling') as any;
    case '@lumino/properties':
      return import('@lumino/properties') as any;
    case '@lumino/signaling':
      return import('@lumino/signaling') as any;
    case '@lumino/virtualdom':
      return import('@lumino/virtualdom') as any;
    case '@lumino/widgets':
      return import('@lumino/widgets') as any;
    case '@rjsf/utils':
      return import('@rjsf/utils') as any;
    case 'react':
      return import('react') as any;
    case 'react-dom':
      return import('react-dom') as any;
    case 'yjs':
      return import('yjs') as any;
    default:
      return loadSharedScopeModule(name, options);
  }
};

async function loadSharedScopeModule(
  name: string,
  options: ILoadKnownModuleOptions = {}
): Promise<IModule | null> {
  if (!name || typeof window === 'undefined') {
    return null;
  }

  const requiredVersionRange = normalizeRequiredVersionRange(
    options.requiredVersion
  );
  const providers = collectSharedProviders(name);
  if (!providers) {
    return null;
  }
  const provider = pickCompatibleSharedProvider(
    providers,
    requiredVersionRange
  );
  if (!provider) {
    if (requiredVersionRange) {
      throw new Error(
        `No shared version of ${name} satisfies required range "${requiredVersionRange}".`
      );
    }
    return null;
  }

  try {
    const exposed = await provider.get();
    const loaded = typeof exposed === 'function' ? exposed() : exposed;
    if (!loaded || (typeof loaded !== 'object' && typeof loaded !== 'function')) {
      return null;
    }
    return loaded as IModule;
  } catch (error) {
    console.warn(
      `Failed to load shared module ${name} from webpack share scope`,
      error
    );
    return null;
  }
}

function pickCompatibleSharedProvider(
  providers: ISharedModuleProviders,
  requiredVersionRange: string | null
): ISharedModuleProvider | null {
  const candidateVersions = Object.keys(providers);
  if (candidateVersions.length === 0) {
    return null;
  }
  const requiredRange = requiredVersionRange ?? '*';
  const selectedVersion = maxSatisfying(candidateVersions, requiredRange);
  if (!selectedVersion) {
    const stableVersion = maxSatisfying(candidateVersions, '*');
    if (stableVersion) {
      return null;
    }
    const prereleaseVersion = maxSatisfying(candidateVersions, requiredRange, {
      includePrerelease: true
    });
    if (!prereleaseVersion) {
      return null;
    }
    return providers[prereleaseVersion] ?? null;
  }
  return providers[selectedVersion] ?? null;
}

function normalizeRequiredVersionRange(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('workspace:')) {
    const candidate = trimmed.slice('workspace:'.length).trim();
    return candidate && candidate !== '*' ? candidate : null;
  }
  if (trimmed.startsWith('npm:')) {
    const atIndex = trimmed.lastIndexOf('@');
    if (atIndex > 'npm:'.length) {
      return normalizeRequiredVersionRange(trimmed.slice(atIndex + 1));
    }
    return null;
  }
  if (
    trimmed.startsWith('file:') ||
    trimmed.startsWith('link:') ||
    trimmed.startsWith('github:') ||
    trimmed.startsWith('git+') ||
    trimmed.startsWith('git:')
  ) {
    return null;
  }
  return validRange(trimmed) ? trimmed : null;
}

function collectSharedProviders(name: string): ISharedModuleProviders | null {
  const merged: ISharedModuleProviders = {};
  for (const scope of collectSharedScopes()) {
    const providers = scope[name];
    if (!providers || typeof providers !== 'object') {
      continue;
    }
    for (const [version, provider] of Object.entries(providers)) {
      if (provider && typeof provider.get === 'function') {
        merged[version] = provider as ISharedModuleProvider;
      }
    }
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

function collectSharedScopes(): ReadonlyArray<ISharedScope> {
  const scopes: ISharedScope[] = [];

  if (typeof __webpack_require__ !== 'undefined') {
    if (typeof __webpack_require__.I === 'function') {
      try {
        void __webpack_require__.I('default');
      } catch {
        // ignore, best-effort only
      }
    }
    const runtimeScope = __webpack_require__.S?.default;
    if (
      runtimeScope &&
      typeof runtimeScope === 'object' &&
      !Array.isArray(runtimeScope)
    ) {
      scopes.push(runtimeScope);
    }
  }

  if (
    typeof __webpack_share_scopes__ !== 'undefined' &&
    __webpack_share_scopes__?.default &&
    typeof __webpack_share_scopes__.default === 'object' &&
    !Array.isArray(__webpack_share_scopes__.default)
  ) {
    scopes.push(__webpack_share_scopes__.default);
  }

  const windowShareScopes = (
    window as Window & {
      __webpack_share_scopes__?: ISharedScopes;
    }
  ).__webpack_share_scopes__;
  if (
    windowShareScopes?.default &&
    typeof windowShareScopes.default === 'object' &&
    !Array.isArray(windowShareScopes.default)
  ) {
    scopes.push(windowShareScopes.default);
  }

  return scopes;
}
