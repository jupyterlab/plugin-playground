import { PageConfig, URLExt } from '@jupyterlab/coreutils';

import { KNOWN_MODULE_NAMES, loadKnownModule } from './modules';

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

const KNOWN_MODULES = new Map<string, IKnownModule>();

let _coreRegistered = false;
let _federatedDiscoveryComplete = false;
let _federatedDiscoveryPending: Promise<void> | null = null;

export function registerKnownModule(known: IKnownModule): void {
  const name = _stringValue(known.name);
  if (!name) {
    return;
  }

  const existing = KNOWN_MODULES.get(name);
  const mergedUrls = _mergeKnownModuleUrls(existing?.urls, known.urls);

  KNOWN_MODULES.set(name, {
    name,
    load: known.load ?? existing?.load ?? (() => loadKnownModule(name)),
    urls: mergedUrls,
    description: _stringValue(known.description) || existing?.description,
    origin: _stringValue(known.origin) || existing?.origin
  });
}

export function registerKnownModules(
  knownModules: ReadonlyArray<IKnownModule>
): void {
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

  for (const name of KNOWN_MODULE_NAMES) {
    if (name.startsWith('@jupyterlab/')) {
      const packageName = name.slice('@jupyterlab/'.length);
      const repositoryHtml = `https://github.com/jupyterlab/jupyterlab/tree/main/packages/${packageName}`;
      registerKnownModule({
        name,
        load: () => loadKnownModule(name),
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
        load: () => loadKnownModule(name),
        urls: {
          docHtml: `https://lumino.readthedocs.io/en/stable/api/modules/${packageName}.html`,
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
      load: () => loadKnownModule(name),
      urls: {
        npmHtml: _npmPackageUrl(name)
      },
      description: `Known runtime module: ${name}`,
      origin: 'core-known-module'
    });
  }

  _coreRegistered = true;
}

export async function discoverFederatedKnownModules(
  options: {
    force?: boolean;
  } = {}
): Promise<void> {
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
  const labextensionsUrl = _stringValue(
    PageConfig.getOption('labextensionsUrl')
  );

  if (fullLabextensionsUrl) {
    candidates.add(
      URLExt.join(fullLabextensionsUrl, extension.name, 'package.json')
    );
  }

  if (labextensionsUrl) {
    candidates.add(
      URLExt.join(labextensionsUrl, extension.name, 'package.json')
    );
  }

  return Array.from(candidates);
}

async function _fetchPackageData(
  url: string
): Promise<IExtensionPackageData | null> {
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

  if (
    !repository ||
    typeof repository !== 'object' ||
    Array.isArray(repository)
  ) {
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
  const compactEntries = Object.entries(merged).filter(
    ([, value]) => _stringValue(value).length > 0
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
