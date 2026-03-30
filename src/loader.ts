import { Token } from '@lumino/coreutils';
import { IPlugin } from '@lumino/application';

import { PathExt } from '@jupyterlab/coreutils';

import { Contents, ServiceManager } from '@jupyterlab/services';

import { NoDefaultExportError, PluginTranspiler } from './transpiler';

import { IRequireJS } from './requirejs';

import { IModule, IModuleMember } from './types';

import { ContentUtils } from './contents';

export namespace PluginLoader {
  export interface IOptions {
    transpiler: PluginTranspiler;
    importFunction(
      statement: string
    ): Promise<Token<any> | IModule | IModuleMember>;
    tokenMap: Map<string, Token<any>>;
    /**
     * For backward-compatibility with plugins using requirejs over `import`;
     */
    requirejs: IRequireJS;
    serviceManager: ServiceManager.IManager | null;
  }
  export interface IResult {
    plugins: IPlugin<any, any>[];
    code: string;
    transpiled: boolean;
    schemas: Record<string, string>;
  }
}

export class PluginLoader {
  private _options: PluginLoader.IOptions;

  constructor(options: PluginLoader.IOptions) {
    this._options = options;
  }

  async loadFile(code: string): Promise<IModule> {
    const functionBody = this._options.transpiler.transpile(code, false);
    return await this._createAsyncFunctionModule(functionBody);
  }

  private async _createAsyncFunctionModule(
    transpiledCode: string
  ): Promise<IModule> {
    const module = new AsyncFunction(
      this._options.transpiler.importFunctionName,
      transpiledCode
    );
    return await module(this._options.importFunction);
  }

  private async _discoverSchema(
    pluginPath: string | null,
    plugins: ReadonlyArray<IPlugin<any, any>>
  ): Promise<Record<string, string>> {
    const schemas: Record<string, string> = {};
    if (!pluginPath) {
      return schemas;
    }
    const serviceManager = this._options.serviceManager;
    if (!serviceManager) {
      return schemas;
    }
    const sourceDirectory = PathExt.dirname(pluginPath);
    const packageJsonPaths = [
      PathExt.join(sourceDirectory, 'package.json'),
      PathExt.join(sourceDirectory, '..', 'package.json')
    ];

    for (const packageJsonPath of packageJsonPaths) {
      const packageSchemas = await this._discoverPackageSchemas(
        packageJsonPath,
        plugins
      );
      if (Object.keys(packageSchemas).length > 0) {
        return packageSchemas;
      }
    }

    if (plugins.length !== 1) {
      return schemas;
    }

    const schema = await ContentUtils.readContentsFileAsText(
      serviceManager,
      PathExt.join(sourceDirectory, 'plugin.json')
    );
    if (schema !== null) {
      schemas[plugins[0].id] = schema;
    }
    return schemas;
  }

  private async _discoverPackageSchemas(
    packageJsonPath: string,
    plugins: ReadonlyArray<IPlugin<any, any>>
  ): Promise<Record<string, string>> {
    const schemas: Record<string, string> = {};
    const serviceManager = this._options.serviceManager;
    if (!serviceManager) {
      return schemas;
    }

    const packageJson = await ContentUtils.readContentsFileAsText(
      serviceManager,
      packageJsonPath
    );
    if (packageJson === null) {
      return schemas;
    }

    let schemaDirectoryPath: string | null = null;
    try {
      const packageData = JSON.parse(packageJson) as {
        jupyterlab?: { schemaDir?: unknown };
      };
      const schemaDir = packageData.jupyterlab?.schemaDir;
      if (typeof schemaDir === 'string' && schemaDir.trim().length > 0) {
        schemaDirectoryPath = PathExt.join(
          PathExt.dirname(packageJsonPath),
          schemaDir.trim()
        );
      }
    } catch {
      return schemas;
    }

    if (!schemaDirectoryPath) {
      return schemas;
    }

    const schemaDirectory = await ContentUtils.getDirectoryModel(
      serviceManager,
      schemaDirectoryPath
    );
    if (!schemaDirectory) {
      return schemas;
    }

    const schemaFiles = schemaDirectory.content.filter(
      (item: Contents.IModel) =>
        item.type === 'file' && item.name.endsWith('.json')
    );
    if (schemaFiles.length === 0) {
      return schemas;
    }

    if (plugins.length === 1) {
      const schemaFile =
        schemaFiles.find(
          (item: Contents.IModel) => item.name === 'plugin.json'
        ) ?? (schemaFiles.length === 1 ? schemaFiles[0] : null);
      if (!schemaFile) {
        return schemas;
      }
      const schema = await ContentUtils.readContentsFileAsText(
        serviceManager,
        PathExt.join(schemaDirectory.path, schemaFile.name)
      );
      if (schema !== null) {
        schemas[plugins[0].id] = schema;
      }
      return schemas;
    }

    // Multi-plugin examples, such as metadata-form, name schema files after
    // the plugin id suffix (for example, `:advanced` -> `advanced.json`).
    const schemaPaths = new Map<string, string>(
      schemaFiles.map((item: Contents.IModel) => [
        item.name,
        PathExt.join(schemaDirectory.path, item.name)
      ])
    );

    for (const plugin of plugins) {
      const pluginSuffix = plugin.id.split(':').pop()?.trim();
      if (!pluginSuffix) {
        continue;
      }
      const schemaPath = schemaPaths.get(`${pluginSuffix}.json`);
      if (!schemaPath) {
        continue;
      }
      const schema = await ContentUtils.readContentsFileAsText(
        serviceManager,
        schemaPath
      );
      if (schema !== null) {
        schemas[plugin.id] = schema;
      }
    }

    return schemas;
  }

  private async _resolvePlugins(
    pluginSource: unknown
  ): Promise<IPlugin<any, any>[]> {
    let plugin = pluginSource;
    if (typeof plugin === 'function') {
      plugin = plugin();
    }

    const loaded = await Promise.resolve(plugin);
    return (Array.isArray(loaded) ? loaded : [loaded]).map(
      item => item as IPlugin<any, any>
    );
  }

  private _resolvePluginTokens(plugin: IPlugin<any, any>): void {
    plugin.requires = plugin.requires?.map((value: string | Token<any>) => {
      if (!isString(value)) {
        return value;
      }
      const token = this._options.tokenMap.get(value);
      if (!token) {
        throw Error('Required token' + value + 'not found in the token map');
      }
      return token;
    });
    plugin.optional = plugin.optional
      ?.map((value: string | Token<any>) => {
        if (!isString(value)) {
          return value;
        }
        const token = this._options.tokenMap.get(value);
        if (!token) {
          console.log('Optional token' + value + 'not found in the token map');
        }
        return token;
      })
      .filter((token): token is Token<any> => token != null);
  }

  async load(
    code: string,
    basePath: string | null
  ): Promise<PluginLoader.IResult> {
    let functionBody: string;
    let pluginSource: unknown;
    let transpiled = true;
    try {
      functionBody = this._options.transpiler.transpile(code, true);
    } catch (error) {
      if (error instanceof NoDefaultExportError) {
        // Fall back to object-style plugin definitions used by older examples.
        console.log(
          'No default export was found in the plugin code, falling back to object-based evaluation'
        );
        functionBody = `'use strict';\nreturn (${code})`;
        transpiled = false;
      } else {
        throw error;
      }
    }

    let schemas: Record<string, string> = {};

    try {
      if (transpiled) {
        const module = await this._createAsyncFunctionModule(functionBody);
        pluginSource = module.default;
      } else {
        const requirejs = this._options.requirejs;
        pluginSource = new Function(
          'require',
          'requirejs',
          'define',
          functionBody
        )(requirejs.require, requirejs.require, requirejs.define);
      }
    } catch (e) {
      throw new PluginLoadingError(e as Error, {
        code: functionBody,
        schemas: {},
        transpiled
      });
    }

    const plugins = await this._resolvePlugins(pluginSource);
    for (const plugin of plugins) {
      this._resolvePluginTokens(plugin);
    }

    if (transpiled) {
      schemas = await this._discoverSchema(basePath, plugins);
    }

    return {
      schemas,
      plugins,
      code: functionBody,
      transpiled
    };
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string' || value instanceof String;
}

export class PluginLoadingError extends Error {
  constructor(
    public error: Error,
    public partialResult: Omit<PluginLoader.IResult, 'plugins'>
  ) {
    super(error.message);
    this.name = 'PluginLoadingError';
  }
}

const AsyncFunction = Object.getPrototypeOf(async () => {
  // no-op
}).constructor;
