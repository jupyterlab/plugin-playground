import maxSatisfying from 'semver/ranges/max-satisfying';
import validRange from 'semver/ranges/valid';

import type { IModule } from './types';

interface ISharedModuleProvider {
  get: () => Promise<(() => IModule) | IModule>;
}

interface ILoadSharedScopeModuleOptions {
  requiredVersion?: string | null;
}

type ISharedModuleProviders = Record<string, ISharedModuleProvider>;
type ISharedScope = Record<string, ISharedModuleProviders>;
type ISharedScopes = { default?: ISharedScope };

interface IWebpackRuntimeRequire {
  I?: (scope: string) => Promise<void> | void;
  S?: ISharedScopes;
}

declare const __webpack_require__: IWebpackRuntimeRequire | undefined;
declare const __webpack_share_scopes__: ISharedScopes | undefined;

export async function loadSharedScopeModule(
  name: string,
  options: ILoadSharedScopeModuleOptions = {}
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
    if (
      !loaded ||
      (typeof loaded !== 'object' && typeof loaded !== 'function')
    ) {
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

function normalizeRequiredVersionRange(
  raw: string | null | undefined
): string | null {
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
