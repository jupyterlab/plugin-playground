import { Dialog, showDialog } from '@jupyterlab/apputils';

import { formatImportError } from './errors';

import { Token } from '@lumino/coreutils';

import { PathExt } from '@jupyterlab/coreutils';

import { IRequireJS } from './requirejs';

import { IModule, IModuleMember } from './types';

import { ServiceManager } from '@jupyterlab/services';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { formatCDNConsentDialog } from './dialogs';

import { ContentUtils } from './contents';

function handleImportError(error: Error, module: string) {
  return showDialog({
    title: `Import in plugin code failed: ${error.message}`,
    body: formatImportError(error, module)
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export namespace ImportResolver {
  export interface IOptions {
    loadKnownModule: (name: string) => Promise<IModule | null>;
    tokenMap: Map<string, Token<any>>;
    requirejs: IRequireJS;
    settings: ISettingRegistry.ISettings;
    serviceManager: ServiceManager.IManager | null;
    dynamicLoader?: (transpiledCode: string) => Promise<IModule>;
    /**
     * Path of the module to load, used to resolve relative imports.
     */
    basePath: string | null;
  }
}

type CDNPolicy = 'awaiting-decision' | 'always-insecure' | 'never';

async function askUserForCDNPolicy(
  exampleModule: string,
  cdnUrl: string
): Promise<CDNPolicy | 'abort-to-investigate'> {
  const decision = await showDialog({
    title: 'Allow execution of code from CDN?',
    body: formatCDNConsentDialog(exampleModule, cdnUrl),
    buttons: [
      Dialog.okButton({
        label: 'Forbid'
      }),
      Dialog.cancelButton({
        label: 'Abort'
      }),
      Dialog.warnButton({
        label: 'Allow'
      })
    ],
    defaultButton: 0
  });
  switch (decision.button.label) {
    case 'Forbid':
      return 'never';
    case 'Allow':
      return 'always-insecure';
    case 'Abort':
      return 'abort-to-investigate';
    default:
      return 'awaiting-decision';
  }
}

interface ICDNConsent {
  readonly agreed: boolean;
}

interface IFederatedExtensionContainer {
  get: (key: string) => Promise<(() => IModule) | IModule>;
}

export class ImportResolver {
  constructor(private _options: ImportResolver.IOptions) {
    // no-op
  }

  set dynamicLoader(loader: (transpiledCode: string) => Promise<IModule>) {
    this._options.dynamicLoader = loader;
  }

  /**
   * Convert import to:
   *   - token string,
   *   - module assignment if appropriate module is available,
   *   - requirejs import if everything else fails
   */
  async resolve(module: string): Promise<Token<any> | IModule | IModuleMember> {
    try {
      const knownModule = await this._resolveKnownModule(module);
      if (knownModule !== null) {
        return this._createTokenAwareModule(module, knownModule);
      }

      const federatedModule = await this._resolveFederatedExtensionModule(
        module
      );
      if (federatedModule !== null) {
        return this._createTokenAwareModule(module, federatedModule);
      }

      const localFile = await this._resolveLocalFile(module);
      if (localFile !== null) {
        return localFile;
      }

      const baseURL = this._options.settings.composite.requirejsCDN as string;
      const consent = await this._getCDNConsent(module, baseURL);

      if (!consent.agreed) {
        throw new Error(
          `Module ${module} requires execution from CDN but it is not allowed.`
        );
      }

      const externalAMDModule = await this._resolveAMDModule(module);
      if (externalAMDModule !== null) {
        return externalAMDModule;
      }
      throw new Error(`Could not resolve the module ${module}`);
    } catch (error) {
      handleImportError(error as Error, module);
      throw error;
    }
  }

  private _createTokenAwareModule(
    module: string,
    targetModule: IModule
  ): IModule {
    return new Proxy(targetModule, {
      get: (target: IModule, prop: string | number | symbol, receiver: any) => {
        if (typeof prop !== 'string') {
          return Reflect.get(target, prop, receiver);
        }
        const tokenName = `${module}:${prop}`;
        if (this._options.tokenMap.has(tokenName)) {
          return this._options.tokenMap.get(tokenName);
        }
        // synthetic default import (without proxy)
        if (prop === 'default' && !(prop in target)) {
          return target;
        }
        return Reflect.get(target, prop, receiver);
      }
    });
  }

  private async _resolveFederatedExtensionModule(
    module: string
  ): Promise<IModule | null> {
    if (module.startsWith('.')) {
      return null;
    }
    if (typeof window === 'undefined') {
      return null;
    }

    const runtime = window as Window & {
      _JUPYTERLAB?: Record<string, IFederatedExtensionContainer>;
    };
    const container = runtime._JUPYTERLAB?.[module];
    if (!container) {
      return null;
    }
    if (typeof container.get !== 'function') {
      throw new Error(
        `Federated extension container ${module} does not expose get().`
      );
    }

    let exposed: (() => IModule) | IModule;
    try {
      exposed = await container.get('./extension');
    } catch (error) {
      throw new Error(
        `Failed to resolve federated extension module ${module} from ./extension: ${errorMessage(
          error
        )}`
      );
    }

    const factory =
      typeof exposed === 'function'
        ? (exposed as () => IModule)
        : () => exposed as IModule;

    let resolved: unknown;
    try {
      resolved = factory();
    } catch (error) {
      throw new Error(
        `Failed to evaluate federated extension module ${module} from ./extension: ${errorMessage(
          error
        )}`
      );
    }

    if (
      !resolved ||
      (typeof resolved !== 'object' && typeof resolved !== 'function')
    ) {
      throw new Error(
        `Federated extension module ${module} did not return a module object from ./extension.`
      );
    }

    return resolved as IModule;
  }

  private async _getCDNConsent(
    module: string,
    cdnUrl: string
  ): Promise<ICDNConsent> {
    const allowCDN = this._options.settings.composite.allowCDN as CDNPolicy;
    switch (allowCDN) {
      case 'awaiting-decision': {
        const newPolicy = await askUserForCDNPolicy(module, cdnUrl);
        if (newPolicy === 'abort-to-investigate') {
          throw new Error('User aborted execution when asked about CDN policy');
        } else {
          await this._options.settings.set('allowCDN', newPolicy);
        }
        return await this._getCDNConsent(module, cdnUrl);
      }
      case 'never':
        console.warn(
          'Not loading the module ',
          module,
          'as it is not a known token/module and the CDN policy is set to `never`'
        );
        return { agreed: false };
      case 'always-insecure':
        return { agreed: true };
    }
  }

  private async _resolveKnownModule(module: string): Promise<IModule | null> {
    return this._options.loadKnownModule(module);
  }

  private async _resolveAMDModule(
    module: string
  ): Promise<IModule | IModuleMember | null> {
    const require = this._options.requirejs.require;
    return new Promise((resolve, reject) => {
      console.log('Fetching', module, 'via require.js');
      require([module], (mod: IModule) => {
        if (!mod) {
          reject(`Module ${module} could not be loaded via require.js`);
        }
        return resolve(mod);
      }, (error: Error) => {
        return reject(error);
      });
    });
  }

  private async _resolveLocalFile(
    module: string
  ): Promise<IModule | IModuleMember | null> {
    if (!module.startsWith('.')) {
      // not a local file, can't help here
      return null;
    }
    const serviceManager = this._options.serviceManager;
    if (serviceManager === null) {
      throw Error(
        `Cannot resolve import of local module ${module}: service manager is not available`
      );
    }
    if (!this._options.dynamicLoader) {
      throw Error(
        `Cannot resolve import of local module ${module}: dynamic loader is not available`
      );
    }
    const path = this._options.basePath;
    if (path === null) {
      throw Error(
        `Cannot resolve import of local module ${module}: the base path was not provided`
      );
    }
    const base = PathExt.dirname(path);
    const candidatePaths = this._localImportCandidates(base, module);

    for (const candidatePath of candidatePaths) {
      const file = await ContentUtils.getFileModel(
        serviceManager,
        candidatePath
      );
      if (!file) {
        continue;
      }

      console.log(`Resolved ${module} to ${file.path}`);
      const content = ContentUtils.fileModelToText(file);
      if (content === null) {
        continue;
      }

      if (file.path.endsWith('.svg')) {
        return {
          default: content as unknown as IModuleMember
        };
      }

      return await this._options.dynamicLoader(content);
    }
    console.warn(
      `Could not resolve ${module}, candidate paths:`,
      candidatePaths
    );
    return null;
  }

  private _localImportCandidates(basePath: string, module: string): string[] {
    const baseCandidate = PathExt.join(basePath, module);
    const extension = PathExt.extname(baseCandidate);
    const candidates = new Set<string>();

    if (extension) {
      candidates.add(baseCandidate);
    } else {
      candidates.add(`${baseCandidate}.ts`);
      candidates.add(`${baseCandidate}.tsx`);
      candidates.add(`${baseCandidate}.js`);
      candidates.add(PathExt.join(baseCandidate, 'index.ts'));
      candidates.add(PathExt.join(baseCandidate, 'index.tsx'));
      candidates.add(PathExt.join(baseCandidate, 'index.js'));
    }

    return Array.from(candidates);
  }
}
