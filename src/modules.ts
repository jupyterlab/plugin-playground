import { PageConfig, URLExt } from '@jupyterlab/coreutils';

import type { IModule } from './types';

type IModuleLoader = () => Promise<IModule | null>;

export interface IKnownModule {
  name: string;
  load?: () => Promise<unknown>;
  urls?: {
    docHtml?: string;
    sourceHtml?: string;
    typeDocJson?: string;
    npmHtml?: string;
    packageJson?: string;
    homepageHtml?: string;
    repositoryHtml?: string;
  };
  description?: string;
  origin?: string;
}

interface IFederatedExtensionMetadata {
  name: string;
}

interface IExtensionPackageData {
  name?: unknown;
  description?: unknown;
  homepage?: unknown;
  repository?: unknown;
  jupyterlab?: {
    sharedPackages?: unknown;
  };
}

type IKnownModuleUrls = NonNullable<IKnownModule['urls']>;

const CORE_MODULE_LOADERS: Record<string, IModuleLoader> = {
  '@codemirror/language': () => import('@codemirror/language') as any,
  '@codemirror/state': () => import('@codemirror/state') as any,
  '@codemirror/view': () => import('@codemirror/view') as any,
  '@jupyter-notebook/application': () =>
    import('@jupyter-notebook/application') as any,
  '@jupyter-widgets/base': () => import('@jupyter-widgets/base') as any,
  '@jupyter/collaborative-drive': () =>
    import('@jupyter/collaborative-drive') as any,
  '@jupyter/docprovider': () => import('@jupyter/docprovider') as any,
  '@jupyter/react-components': () => import('@jupyter/react-components') as any,
  '@jupyter/web-components': () => import('@jupyter/web-components') as any,
  '@jupyter/ydoc': () => import('@jupyter/ydoc') as any,
  '@jupyterlab/application': () => import('@jupyterlab/application') as any,
  '@jupyterlab/apputils': () => import('@jupyterlab/apputils') as any,
  '@jupyterlab/attachments': () => import('@jupyterlab/attachments') as any,
  '@jupyterlab/cell-toolbar': () => import('@jupyterlab/cell-toolbar') as any,
  '@jupyterlab/cells': () => import('@jupyterlab/cells') as any,
  '@jupyterlab/codeeditor': () => import('@jupyterlab/codeeditor') as any,
  '@jupyterlab/codemirror': () => import('@jupyterlab/codemirror') as any,
  '@jupyterlab/completer': () => import('@jupyterlab/completer') as any,
  '@jupyterlab/console': () => import('@jupyterlab/console') as any,
  '@jupyterlab/coreutils': () => import('@jupyterlab/coreutils') as any,
  '@jupyterlab/csvviewer': () => import('@jupyterlab/csvviewer') as any,
  '@jupyterlab/debugger': () => import('@jupyterlab/debugger') as any,
  '@jupyterlab/docmanager': () => import('@jupyterlab/docmanager') as any,
  '@jupyterlab/docregistry': () => import('@jupyterlab/docregistry') as any,
  '@jupyterlab/documentsearch': () => import('@jupyterlab/documentsearch') as any,
  '@jupyterlab/extensionmanager': () =>
    import('@jupyterlab/extensionmanager') as any,
  '@jupyterlab/filebrowser': () => import('@jupyterlab/filebrowser') as any,
  '@jupyterlab/fileeditor': () => import('@jupyterlab/fileeditor') as any,
  '@jupyterlab/htmlviewer': () => import('@jupyterlab/htmlviewer') as any,
  '@jupyterlab/imageviewer': () => import('@jupyterlab/imageviewer') as any,
  '@jupyterlab/inspector': () => import('@jupyterlab/inspector') as any,
  '@jupyterlab/launcher': () => import('@jupyterlab/launcher') as any,
  '@jupyterlab/logconsole': () => import('@jupyterlab/logconsole') as any,
  '@jupyterlab/lsp': () => import('@jupyterlab/lsp') as any,
  '@jupyterlab/mainmenu': () => import('@jupyterlab/mainmenu') as any,
  '@jupyterlab/markdownviewer': () => import('@jupyterlab/markdownviewer') as any,
  '@jupyterlab/mermaid': () => import('@jupyterlab/mermaid') as any,
  '@jupyterlab/metadataform': () => import('@jupyterlab/metadataform') as any,
  '@jupyterlab/nbformat': () => import('@jupyterlab/nbformat') as any,
  '@jupyterlab/notebook': () => import('@jupyterlab/notebook') as any,
  '@jupyterlab/observables': () => import('@jupyterlab/observables') as any,
  '@jupyterlab/outputarea': () => import('@jupyterlab/outputarea') as any,
  '@jupyterlab/pluginmanager': () => import('@jupyterlab/pluginmanager') as any,
  '@jupyterlab/property-inspector': () =>
    import('@jupyterlab/property-inspector') as any,
  '@jupyterlab/rendermime': () => import('@jupyterlab/rendermime') as any,
  '@jupyterlab/rendermime-interfaces': () =>
    import('@jupyterlab/rendermime-interfaces') as any,
  '@jupyterlab/running': () => import('@jupyterlab/running') as any,
  '@jupyterlab/services': () => import('@jupyterlab/services') as any,
  '@jupyterlab/settingeditor': () => import('@jupyterlab/settingeditor') as any,
  '@jupyterlab/settingregistry': () =>
    import('@jupyterlab/settingregistry') as any,
  '@jupyterlab/statedb': () => import('@jupyterlab/statedb') as any,
  '@jupyterlab/statusbar': () => import('@jupyterlab/statusbar') as any,
  '@jupyterlab/terminal': () => import('@jupyterlab/terminal') as any,
  '@jupyterlab/toc': () => import('@jupyterlab/toc') as any,
  '@jupyterlab/tooltip': () => import('@jupyterlab/tooltip') as any,
  '@jupyterlab/translation': () => import('@jupyterlab/translation') as any,
  '@jupyterlab/ui-components': () => import('@jupyterlab/ui-components') as any,
  '@jupyterlab/workspaces': () => import('@jupyterlab/workspaces') as any,
  '@lezer/common': () => import('@lezer/common') as any,
  '@lezer/highlight': () => import('@lezer/highlight') as any,
  '@lumino/algorithm': () => import('@lumino/algorithm') as any,
  '@lumino/application': () => import('@lumino/application') as any,
  '@lumino/commands': () => import('@lumino/commands') as any,
  '@lumino/coreutils': () => import('@lumino/coreutils') as any,
  '@lumino/datagrid': () => import('@lumino/datagrid') as any,
  '@lumino/disposable': () => import('@lumino/disposable') as any,
  '@lumino/domutils': () => import('@lumino/domutils') as any,
  '@lumino/dragdrop': () => import('@lumino/dragdrop') as any,
  '@lumino/keyboard': () => import('@lumino/keyboard') as any,
  '@lumino/messaging': () => import('@lumino/messaging') as any,
  '@lumino/polling': () => import('@lumino/polling') as any,
  '@lumino/properties': () => import('@lumino/properties') as any,
  '@lumino/signaling': () => import('@lumino/signaling') as any,
  '@lumino/virtualdom': () => import('@lumino/virtualdom') as any,
  '@lumino/widgets': () => import('@lumino/widgets') as any,
  '@rjsf/utils': () => import('@rjsf/utils') as any,
  react: () => import('react') as any,
  'react-dom': () => import('react-dom') as any,
  yjs: () => import('yjs') as any
};

const KNOWN_MODULES = new Map<string, IKnownModule>();

let _coreRegistered = false;
let _federatedDiscoveryComplete = false;
let _federatedDiscoveryPending: Promise<void> | null = null;

export function loadKnownModule(name: string): Promise<IModule | null> {
  const knownLoad = KNOWN_MODULES.get(name)?.load as IModuleLoader | undefined;
  const load = knownLoad ?? CORE_MODULE_LOADERS[name];
  return load ? load() : Promise.resolve(null);
}

export function registerKnownModule(known: IKnownModule): void {
  const name = _stringValue(known.name);
  if (!name) {
    return;
  }

  const existing = KNOWN_MODULES.get(name);
  const mergedUrls = _mergeKnownModuleUrls(existing?.urls, known.urls);

  KNOWN_MODULES.set(name, {
    name,
    load: known.load ?? existing?.load ?? CORE_MODULE_LOADERS[name],
    urls: mergedUrls,
    description: _stringValue(known.description) || existing?.description,
    origin: _stringValue(known.origin) || existing?.origin
  });
}

export function registerKnownModules(knownModules: ReadonlyArray<IKnownModule>): void {
  for (const known of knownModules) {
    registerKnownModule(known);
  }
}

export function listKnownModules(): ReadonlyArray<IKnownModule> {
  return Array.from(KNOWN_MODULES.values()).sort((left, right) =>
    left.name.localeCompare(right.name)
  );
}

export function registerCoreKnownModules(): void {
  if (_coreRegistered) {
    return;
  }

  for (const [name, load] of Object.entries(CORE_MODULE_LOADERS)) {
    if (name.startsWith('@jupyterlab/')) {
      const packageName = name.slice('@jupyterlab/'.length);
      const repositoryHtml = `https://github.com/jupyterlab/jupyterlab/tree/main/packages/${packageName}`;
      registerKnownModule({
        name,
        load,
        urls: {
          docHtml: `https://jupyterlab.readthedocs.io/en/stable/api/modules/${packageName}.html`,
          npmHtml: _npmPackageUrl(name),
          packageJson: `${repositoryHtml}/package.json`,
          repositoryHtml
        },
        description: `Core JupyterLab package: ${name}`,
        origin: 'jupyterlab-core'
      });
      continue;
    }

    if (name.startsWith('@lumino/')) {
      const packageName = name.slice('@lumino/'.length);
      const repositoryHtml = `https://github.com/jupyterlab/lumino/tree/main/packages/${packageName}`;
      registerKnownModule({
        name,
        load,
        urls: {
          docHtml: `https://lumino.readthedocs.io/en/latest/api/${packageName}/`,
          npmHtml: _npmPackageUrl(name),
          packageJson: `${repositoryHtml}/package.json`,
          repositoryHtml
        },
        description: `Core Lumino package: ${name}`,
        origin: 'lumino-core'
      });
      continue;
    }

    registerKnownModule({
      name,
      load,
      urls: {
        npmHtml: _npmPackageUrl(name)
      },
      description: `Known runtime module: ${name}`,
      origin: 'core-known-module'
    });
  }

  _coreRegistered = true;
}

export async function discoverFederatedKnownModules(options: {
  force?: boolean;
} = {}): Promise<void> {
  const { force = false } = options;
  if (_federatedDiscoveryComplete && !force) {
    return;
  }
  if (_federatedDiscoveryPending) {
    return _federatedDiscoveryPending;
  }

  _federatedDiscoveryPending = _discoverFederatedKnownModules(force).finally(
    () => {
      _federatedDiscoveryPending = null;
    }
  );

  return _federatedDiscoveryPending;
}

async function _discoverFederatedKnownModules(force: boolean): Promise<void> {
  for (const extension of _federatedExtensionsFromPageConfig()) {
    try {
      await _registerFederatedExtensionModule(extension, force);
    } catch (error) {
      console.warn(
        `Failed to discover metadata for federated extension ${extension.name}`,
        error
      );
    }
  }

  _federatedDiscoveryComplete = true;
}

async function _registerFederatedExtensionModule(
  extension: IFederatedExtensionMetadata,
  force: boolean
): Promise<void> {
  if (KNOWN_MODULES.has(extension.name) && !force) {
    return;
  }

  const packageResult = await _loadExtensionPackageData(extension);
  const packageData = packageResult?.data;
  const packageName = _stringValue(packageData?.name) || extension.name;
  const discoveredUrls = _packageUrls(packageName, packageData);

  registerKnownModule({
    name: packageName,
    urls: {
      ...discoveredUrls,
      packageJson: discoveredUrls.packageJson ?? packageResult?.url
    },
    description:
      _stringValue(packageData?.description) ||
      `Discovered federated extension package: ${packageName}`,
    origin: 'federated-extension'
  });

  for (const sharedName of _sharedPackageNames(packageData)) {
    registerKnownModule({
      name: sharedName,
      urls: {
        npmHtml: _npmPackageUrl(sharedName)
      },
      description: `Shared package exposed by ${packageName}`,
      origin: `shared-by:${packageName}`
    });
  }
}

async function _loadExtensionPackageData(
  extension: IFederatedExtensionMetadata
): Promise<{ url: string; data: IExtensionPackageData } | null> {
  for (const candidate of _extensionPackageJsonUrls(extension)) {
    const packageData = await _fetchPackageData(candidate);
    if (packageData) {
      return { url: candidate, data: packageData };
    }
  }
  return null;
}

function _extensionPackageJsonUrls(
  extension: IFederatedExtensionMetadata
): ReadonlyArray<string> {
  const candidates = new Set<string>();
  const fullLabextensionsUrl = _stringValue(
    PageConfig.getOption('fullLabextensionsUrl')
  );
  const labextensionsUrl = _stringValue(PageConfig.getOption('labextensionsUrl'));

  if (fullLabextensionsUrl) {
    candidates.add(
      URLExt.join(fullLabextensionsUrl, extension.name, 'package.json')
    );
  }

  if (labextensionsUrl) {
    candidates.add(URLExt.join(labextensionsUrl, extension.name, 'package.json'));
  }

  return Array.from(candidates);
}

async function _fetchPackageData(url: string): Promise<IExtensionPackageData | null> {
  try {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as unknown;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }
    return payload as IExtensionPackageData;
  } catch {
    return null;
  }
}

function _federatedExtensionsFromPageConfig(): ReadonlyArray<IFederatedExtensionMetadata> {
  const raw =
    _stringValue(PageConfig.getOption('federated_extensions')) ||
    _stringValue(PageConfig.getOption('federated_extension'));

  if (!raw) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const discovered: IFederatedExtensionMetadata[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    const extension = _federatedExtensionFromUnknown(item);
    if (!extension || seen.has(extension.name)) {
      continue;
    }
    seen.add(extension.name);
    discovered.push(extension);
  }

  return discovered;
}

function _federatedExtensionFromUnknown(
  value: unknown
): IFederatedExtensionMetadata | null {
  if (typeof value === 'string') {
    const name = _stringValue(value);
    return _looksLikePackageName(name) ? { name } : null;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const name = _stringValue((value as { name?: unknown }).name);
  return name ? { name } : null;
}

function _sharedPackageNames(
  packageData: IExtensionPackageData | null | undefined
): ReadonlyArray<string> {
  const sharedPackages = packageData?.jupyterlab?.sharedPackages;
  if (
    !sharedPackages ||
    typeof sharedPackages !== 'object' ||
    Array.isArray(sharedPackages)
  ) {
    return [];
  }

  return Object.keys(sharedPackages).filter(_looksLikePackageName);
}

function _packageUrls(
  packageName: string,
  packageData: IExtensionPackageData | null | undefined
): IKnownModuleUrls {
  const homepage = _stringValue(packageData?.homepage);
  const repositoryHtml = _normalizeRepositoryUrl(packageData?.repository);
  const normalizedRepository = repositoryHtml.replace(/\/+$/, '');

  return {
    docHtml: homepage && homepage !== repositoryHtml ? homepage : undefined,
    npmHtml: _npmPackageUrl(packageName),
    packageJson:
      normalizedRepository.includes('/tree/') ||
      normalizedRepository.includes('/blob/')
        ? `${normalizedRepository}/package.json`
        : undefined,
    homepageHtml: homepage || undefined,
    repositoryHtml: repositoryHtml || undefined
  };
}

function _normalizeRepositoryUrl(repository: unknown): string {
  const direct = _stringValue(repository);
  if (direct) {
    return _gitUrlToHttp(direct);
  }

  if (!repository || typeof repository !== 'object' || Array.isArray(repository)) {
    return '';
  }

  return _gitUrlToHttp(_stringValue((repository as { url?: unknown }).url));
}

function _gitUrlToHttp(url: string): string {
  if (!url) {
    return '';
  }

  let normalized = url.trim();
  if (normalized.startsWith('github:')) {
    normalized = `https://github.com/${normalized.slice('github:'.length)}`;
  }

  const sshMatch = normalized.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    normalized = `https://${sshMatch[1]}/${sshMatch[2]}`;
  }

  const sshUrlMatch = normalized.match(/^ssh:\/\/git@([^/]+)\/(.+)$/);
  if (sshUrlMatch) {
    normalized = `https://${sshUrlMatch[1]}/${sshUrlMatch[2]}`;
  }

  return normalized
    .replace(/^git\+/, '')
    .replace(/^git:/, 'https:')
    .replace(/^ssh:/, 'https:')
    .replace(/\.git$/, '');
}

function _mergeKnownModuleUrls(
  existing: IKnownModule['urls'] | undefined,
  incoming: IKnownModule['urls'] | undefined
): IKnownModule['urls'] {
  const merged = {
    ...(existing ?? {}),
    ...(incoming ?? {})
  };
  const compactEntries = Object.entries(merged).filter(([, value]) =>
    _stringValue(value).length > 0
  );
  if (compactEntries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(compactEntries) as IKnownModule['urls'];
}

function _looksLikePackageName(value: string): boolean {
  return /^(@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/.test(value);
}

function _npmPackageUrl(packageName: string): string {
  return `https://www.npmjs.com/package/${packageName}`;
}

function _stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
