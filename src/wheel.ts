import type { IArchiveEntry } from './archive';
import { ContentUtils } from './contents';
import { bytesToBase64, sha256Base64Url } from './encoding';
import { normalizeProjectName, textArchiveEntry } from './export-template';
import { PluginTranspiler } from './transpiler';
import { PathExt } from '@jupyterlab/coreutils';
import ts from 'typescript';

const DEFAULT_WHEEL_VERSION = '0.1.0';
const DEFAULT_WHEEL_SUMMARY =
  'JupyterLab extension exported from Plugin Playground.';
const WHEEL_GENERATOR = 'jupyterlab-plugin-playground';
const WHEEL_TAG = 'py3-none-any';
const GENERATED_REMOTE_ENTRY_PATH = 'static/remoteEntry.generated.js';
const LICENSE_FILE_NAME_PATTERN =
  /^(license|licence|copying|notice)([-._][A-Za-z0-9]+)*(\.(md|rst|txt))?$/i;

interface IWheelMetadata {
  labextensionName: string;
  pythonPackageName: string;
  version: string;
  summary: string;
  homePage: string;
  license: string;
  author: string;
  authorEmail: string;
  keywords: string;
}

interface IResolvedLabextension {
  entries: IArchiveEntry[];
  fallbackRootName: string;
}

export interface IWheelArchive {
  filename: string;
  entries: IArchiveEntry[];
}

function normalizeMetadataHeaderValue(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function parsePackageJsonEntry(
  entries: ReadonlyArray<IArchiveEntry>,
  path = 'package.json'
): Record<string, unknown> | null {
  const entry = entries.find(item => item.path === path);
  if (!entry) {
    return null;
  }
  return ContentUtils.parseJsonObject(new TextDecoder().decode(entry.data));
}

function createWheelMetadata(
  projectEntries: ReadonlyArray<IArchiveEntry>,
  fallbackRootName: string
): IWheelMetadata {
  const packageJson = parsePackageJsonEntry(projectEntries);
  const trimmedLabextensionName =
    typeof packageJson?.name === 'string' ? packageJson.name.trim() : '';
  let labextensionName = trimmedLabextensionName
    ? ContentUtils.normalizeContentsPath(
        trimmedLabextensionName.replace(/\\/g, '/')
      ).replace(/\/+$/g, '')
    : '';
  const normalizedRootName = normalizeProjectName(fallbackRootName).replace(
    /_/g,
    '-'
  );
  const fallbackLabextensionName =
    normalizedRootName || 'plugin-playground-export';
  if (!labextensionName || !ContentUtils.isSafeRelativePath(labextensionName)) {
    labextensionName = fallbackLabextensionName;
  }
  const pythonPackageName =
    labextensionName
      .replace(/^@/, '')
      .replace(/\//g, '-')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+/g, '')
      .replace(/-+$/g, '')
      .toLowerCase() || 'plugin-playground-export';
  const version =
    typeof packageJson?.version === 'string' && packageJson.version.trim()
      ? packageJson.version.trim().replace(/[^A-Za-z0-9.+!_-]+/g, '.')
      : DEFAULT_WHEEL_VERSION;
  const summary =
    normalizeMetadataHeaderValue(packageJson?.description) ||
    DEFAULT_WHEEL_SUMMARY;
  const homePage = normalizeMetadataHeaderValue(packageJson?.homepage);
  const license = normalizeMetadataHeaderValue(packageJson?.license);
  const keywords = Array.isArray(packageJson?.keywords)
    ? packageJson.keywords
        .map(keyword => normalizeMetadataHeaderValue(keyword))
        .filter(keyword => keyword.length > 0)
        .join(', ')
    : '';
  const authorValue = packageJson?.author;
  let author = '';
  let authorEmail = '';
  if (typeof authorValue === 'string') {
    author = normalizeMetadataHeaderValue(authorValue);
  } else if (
    authorValue !== null &&
    typeof authorValue === 'object' &&
    !Array.isArray(authorValue)
  ) {
    const authorObject = authorValue as Record<string, unknown>;
    author = normalizeMetadataHeaderValue(authorObject.name);
    authorEmail = normalizeMetadataHeaderValue(authorObject.email);
  }

  return {
    labextensionName,
    pythonPackageName,
    version,
    summary,
    homePage,
    license,
    author,
    authorEmail,
    keywords
  };
}

function escapeCsv(value: string): string {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}

function getJupyterlabConfig(
  packageJson: Record<string, unknown>
): Record<string, unknown> | null {
  const value = packageJson.jupyterlab;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function selectSingleMatch(
  candidates: ReadonlyArray<string>,
  exists: (path: string) => boolean,
  contextMessage: string
): string | null {
  const matches = candidates.filter(candidate => exists(candidate));
  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length > 1) {
    throw new Error(
      `${contextMessage} is ambiguous. Matched: ${matches
        .map(value => `"${value}"`)
        .join(', ')}.`
    );
  }
  return null;
}

function buildSourceModulePathCandidates(pathSpec: string): string[] {
  const normalizedPath = ContentUtils.normalizeContentsPath(
    pathSpec.replace(/\\/g, '/')
  );
  if (!normalizedPath || !ContentUtils.isSafeRelativePath(normalizedPath)) {
    return [];
  }

  const pathSpecs = new Set<string>([normalizedPath]);
  if (normalizedPath.startsWith('lib/')) {
    pathSpecs.add(`src/${normalizedPath.slice(4)}`);
  }

  const candidates = new Set<string>();
  for (const spec of pathSpecs) {
    const extension = PathExt.extname(spec);
    if (extension) {
      const stem = spec.slice(0, -extension.length);
      candidates.add(`${stem}.ts`);
      candidates.add(`${stem}.tsx`);
      candidates.add(`${stem}.js`);
    } else {
      candidates.add(`${spec}.ts`);
      candidates.add(`${spec}.tsx`);
      candidates.add(`${spec}.js`);
    }
  }

  return Array.from(candidates)
    .map(candidate =>
      ContentUtils.normalizeContentsPath(candidate.replace(/\\/g, '/'))
    )
    .filter(
      candidate =>
        candidate.length > 0 && ContentUtils.isSafeRelativePath(candidate)
    );
}

function resolveSourceExposedEntries(
  projectEntries: ReadonlyArray<IArchiveEntry>,
  rootPackageJson: Record<string, unknown>
): Record<string, string> {
  const jupyterlabConfig = getJupyterlabConfig(rootPackageJson);
  if (!jupyterlabConfig) {
    throw new Error(
      'Wheel export requires package.json to include a jupyterlab configuration.'
    );
  }

  const existingPaths = new Set(projectEntries.map(entry => entry.path));
  const mainValue = rootPackageJson.main;

  const resolveExposeEntryPath = (
    rawExposeValue: unknown,
    fieldName: 'extension' | 'mimeExtension'
  ): string => {
    const candidateSpecs: string[] = [];
    if (rawExposeValue === true) {
      if (typeof mainValue === 'string' && mainValue.trim()) {
        candidateSpecs.push(mainValue.trim());
      } else {
        throw new Error(
          `package.json sets jupyterlab.${fieldName}=true but "main" is missing. ` +
            `Set "main" or set jupyterlab.${fieldName} to an explicit source path.`
        );
      }
    } else if (typeof rawExposeValue === 'string' && rawExposeValue.trim()) {
      candidateSpecs.push(rawExposeValue.trim());
    } else {
      return '';
    }

    for (const spec of candidateSpecs) {
      const resolved = selectSingleMatch(
        buildSourceModulePathCandidates(spec),
        candidate => existingPaths.has(candidate),
        `jupyterlab.${fieldName}="${spec}"`
      );
      if (resolved) {
        return resolved;
      }
    }

    throw new Error(
      `Could not resolve jupyterlab.${fieldName} to a source entry. ` +
        `Checked ${candidateSpecs.map(value => `"${value}"`).join(', ')}.`
    );
  };
  const resolveStyleEntryPath = (rawStyleValue: unknown): string => {
    if (typeof rawStyleValue !== 'string' || !rawStyleValue.trim()) {
      return '';
    }
    const stylePath = ContentUtils.normalizeContentsPath(
      rawStyleValue.trim().replace(/\\/g, '/')
    );
    if (!stylePath || !ContentUtils.isSafeRelativePath(stylePath)) {
      throw new Error(
        `package.json style entry "${rawStyleValue}" is not a valid relative path.`
      );
    }
    if (existingPaths.has(stylePath)) {
      return stylePath;
    }
    throw new Error(
      `Could not resolve package.json style entry "${stylePath}" to a file in the project.`
    );
  };

  const exposedEntries: Record<string, string> = {};
  const extensionPath = resolveExposeEntryPath(
    jupyterlabConfig.extension,
    'extension'
  );
  if (extensionPath) {
    exposedEntries['./extension'] = extensionPath;
  }

  const mimeExtensionPath = resolveExposeEntryPath(
    jupyterlabConfig.mimeExtension,
    'mimeExtension'
  );
  if (mimeExtensionPath) {
    exposedEntries['./mimeExtension'] = mimeExtensionPath;
  }
  const stylePath = resolveStyleEntryPath(rootPackageJson.style);
  if (stylePath) {
    exposedEntries['./style'] = stylePath;
  }

  if (Object.keys(exposedEntries).length === 0) {
    throw new Error(
      'Wheel export could not find jupyterlab.extension or jupyterlab.mimeExtension in package.json.'
    );
  }

  return exposedEntries;
}

function createGeneratedRemoteEntrySource(args: {
  moduleBodies: Record<string, string>;
  exposeEntries: Record<string, string>;
  scopeName: string;
}): string {
  const moduleBodiesJson = JSON.stringify(args.moduleBodies);
  const exposeEntriesJson = JSON.stringify(args.exposeEntries);
  const scopeNameJson = JSON.stringify(args.scopeName);

  return `(function () {
  const globalScope = typeof globalThis !== 'undefined' ? globalThis : window;
  const scopeName = ${scopeNameJson};
  const exposeEntries = ${exposeEntriesJson};
  const moduleBodies = ${moduleBodiesJson};
  const moduleCache = Object.create(null);
  let shareScope = null;
  const errorMessage = error =>
    error && typeof error === 'object' && 'message' in error
      ? String(error.message)
      : String(error);

  const normalizePath = value =>
    String(value || '')
      .replace(/\\\\/g, '/')
      .replace(/^\\/+/g, '')
      .replace(/\\/+/g, '/');
  const dirname = path => {
    const normalized = normalizePath(path);
    const index = normalized.lastIndexOf('/');
    return index === -1 ? '' : normalized.slice(0, index);
  };
  const resolveRelativePath = (fromPath, request) => {
    const segments = dirname(fromPath).split('/').filter(Boolean);
    for (const piece of String(request || '').split('/')) {
      if (!piece || piece === '.') {
        continue;
      }
      if (piece === '..') {
        segments.pop();
      } else {
        segments.push(piece);
      }
    }
    return normalizePath(segments.join('/'));
  };
  const localCandidates = (fromPath, request) => {
    const base = resolveRelativePath(fromPath, request);
    if (/\\.[^/]+$/.test(base)) {
      return [base];
    }
    return [
      \`\${base}.ts\`,
      \`\${base}.tsx\`,
      \`\${base}.js\`,
      \`\${base}.css\`,
      \`\${base}.json\`,
      \`\${base}.svg\`,
      \`\${base}/index.css\`,
      \`\${base}/index.ts\`,
      \`\${base}/index.tsx\`,
      \`\${base}/index.js\`
    ].map(normalizePath);
  };

  const parseVersion = value =>
    String(value || '')
      .split(/[^0-9]+/)
      .filter(Boolean)
      .map(piece => Number(piece));
  const compareVersions = (left, right) => {
    const leftParts = parseVersion(left);
    const rightParts = parseVersion(right);
    const count = Math.max(leftParts.length, rightParts.length);
    for (let index = 0; index < count; index++) {
      const leftValue = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
      const rightValue = Number.isFinite(rightParts[index]) ? rightParts[index] : 0;
      if (leftValue !== rightValue) {
        return leftValue - rightValue;
      }
    }
    return String(left).localeCompare(String(right));
  };

  const pickSharedProvider = moduleName => {
    const providers = shareScope && shareScope[moduleName];
    if (!providers) {
      return null;
    }
    const versions = Object.keys(providers);
    if (!versions.length) {
      return null;
    }
    versions.sort(compareVersions);
    const provider = providers[versions[versions.length - 1]];
    return provider && typeof provider.get === 'function' ? provider : null;
  };

  const loadSharedModule = async moduleName => {
    const provider = pickSharedProvider(moduleName);
    if (!provider) {
      return null;
    }
    try {
      const factory = await provider.get();
      return typeof factory === 'function' ? factory() : factory;
    } catch (error) {
      throw new Error(
        \`Failed to load shared module "\${moduleName}": \${errorMessage(error)}\`
      );
    }
  };

  const loadAMDModule = moduleName =>
    new Promise((resolve, reject) => {
      const amdRequire =
        globalScope.requirejs && typeof globalScope.requirejs.require === 'function'
          ? globalScope.requirejs.require
          : typeof globalScope.require === 'function'
            ? globalScope.require
            : null;
      if (!amdRequire) {
        reject(
          new Error(
            \`Could not resolve module "\${moduleName}"; no AMD loader is available.\`
          )
        );
        return;
      }
      amdRequire(
        [moduleName],
        resolve,
        error =>
          reject(
            new Error(
              \`Could not resolve module "\${moduleName}" via AMD: \${errorMessage(
                error
              )}\`
            )
          )
      );
    });

  const runtimeRequire = async (moduleName, fromPath) => {
    if (String(moduleName || '').startsWith('.')) {
      const candidates = localCandidates(fromPath, moduleName);
      for (const candidate of candidates) {
        if (Object.prototype.hasOwnProperty.call(moduleBodies, candidate)) {
          return evaluateModule(candidate);
        }
      }
      throw new Error(
        \`Could not resolve local module "\${moduleName}" from "\${fromPath}". Checked: \${candidates.join(', ') || '(none)'}.\`
      );
    }
    const sharedModule = await loadSharedModule(moduleName);
    if (sharedModule !== null && sharedModule !== undefined) {
      return sharedModule;
    }
    return loadAMDModule(moduleName);
  };

  const evaluateModule = async modulePath => {
    const normalized = normalizePath(modulePath);
    if (moduleCache[normalized]) {
      return moduleCache[normalized];
    }
    const body = moduleBodies[normalized];
    if (typeof body !== 'string') {
      throw new Error(\`Module body for "\${normalized}" is missing.\`);
    }

    let resolveModulePromise;
    let rejectModulePromise;
    moduleCache[normalized] = new Promise((resolve, reject) => {
      resolveModulePromise = resolve;
      rejectModulePromise = reject;
    });

    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    let evaluated;
    try {
      evaluated = new AsyncFunction('require', body)(
        request => runtimeRequire(request, normalized)
      );
    } catch (error) {
      const compileError = new Error(
        \`Failed to compile generated module "\${normalized}": \${errorMessage(error)}\`
      );
      rejectModulePromise(compileError);
      throw compileError;
    }

    Promise.resolve(evaluated)
      .then(result => result || {})
      .then(resolveModulePromise)
      .catch(error => {
        rejectModulePromise(
          new Error(
            \`Failed to evaluate local module "\${normalized}": \${errorMessage(error)}\`
          )
        );
      });

    return moduleCache[normalized];
  };

  const container = {
    init(scope) {
      shareScope = scope || shareScope;
      return Promise.resolve();
    },
    get(moduleName) {
      const entryPath = exposeEntries[moduleName];
      if (typeof entryPath !== 'string' || !entryPath) {
        return Promise.reject(new Error(\`Unknown exposed module "\${moduleName}".\`));
      }
      return evaluateModule(entryPath)
        .then(moduleExports => () => moduleExports)
        .catch(error => {
          throw new Error(
            \`Failed to load exposed module "\${moduleName}" from "\${entryPath}": \${errorMessage(error)}\`
          );
        });
    }
  };

  globalScope._JUPYTERLAB = globalScope._JUPYTERLAB || {};
  globalScope._JUPYTERLAB[scopeName] = container;
})();
`;
}

function createLabextensionFromSource(
  projectEntries: ReadonlyArray<IArchiveEntry>,
  rootPackageJson: Record<string, unknown>,
  fallbackRootName: string
): IResolvedLabextension {
  const sourceEntries = projectEntries.filter(entry => {
    const path = entry.path.toLowerCase();
    return (
      path.endsWith('.ts') || path.endsWith('.tsx') || path.endsWith('.js')
    );
  });
  if (sourceEntries.length === 0) {
    throw new Error('Wheel export requires source files (.ts, .tsx, .js).');
  }

  const exposedEntries = resolveSourceExposedEntries(
    projectEntries,
    rootPackageJson
  );

  const sourceEntryByPath = new Map(
    sourceEntries.map(entry => [entry.path, entry])
  );
  const projectEntryByPath = new Map(
    projectEntries.map(entry => [entry.path, entry])
  );
  const projectPathSet = new Set(projectEntries.map(entry => entry.path));
  const cssTextCache = new Map<string, string>();

  const guessMimeType = (path: string): string => {
    const extension = PathExt.extname(path).toLowerCase();
    switch (extension) {
      case '.svg':
        return 'image/svg+xml';
      case '.png':
        return 'image/png';
      default:
        return 'application/octet-stream';
    }
  };

  const buildCssImportCandidates = (
    fromPath: string,
    request: string
  ): string[] => {
    const normalizedRequest = String(request || '').trim();
    if (!normalizedRequest) {
      return [];
    }
    const basePath = ContentUtils.normalizeContentsPath(
      PathExt.join(PathExt.dirname(fromPath), normalizedRequest).replace(
        /\\/g,
        '/'
      )
    );
    if (!basePath || !ContentUtils.isSafeRelativePath(basePath)) {
      return [];
    }
    if (PathExt.extname(basePath)) {
      return [basePath];
    }
    return [`${basePath}.css`, basePath, PathExt.join(basePath, 'index.css')]
      .map(candidate =>
        ContentUtils.normalizeContentsPath(candidate.replace(/\\/g, '/'))
      )
      .filter(
        candidate =>
          candidate.length > 0 && ContentUtils.isSafeRelativePath(candidate)
      );
  };
  const resolveCssText = (
    cssPath: string,
    importStack: Set<string> = new Set()
  ): string => {
    const cached = cssTextCache.get(cssPath);
    if (cached !== undefined) {
      return cached;
    }
    if (importStack.has(cssPath)) {
      throw new Error(
        `Cyclic CSS @import detected while resolving "${cssPath}".`
      );
    }
    const cssEntry = projectEntryByPath.get(cssPath);
    if (!cssEntry) {
      throw new Error(`Could not read CSS file "${cssPath}" in wheel export.`);
    }
    importStack.add(cssPath);
    const sourceText = new TextDecoder().decode(cssEntry.data);
    const importPattern =
      /@import\s+(?:url\(\s*)?(?:['"]([^'"]+)['"]|([^'")\s]+))(?:\s*\))?\s*;/g;
    const resolvedText = sourceText.replace(
      importPattern,
      (statement, quotedPath, barePath) => {
        const importRequest = String(quotedPath || barePath || '').trim();
        if (!importRequest) {
          return statement;
        }
        if (/^([a-z][a-z0-9+.-]*:|\/)/i.test(importRequest)) {
          return statement;
        }
        const candidates = buildCssImportCandidates(cssPath, importRequest);
        const resolvedImportPath = selectSingleMatch(
          candidates,
          candidate => projectPathSet.has(candidate),
          `CSS @import "${importRequest}" in "${cssPath}"`
        );
        if (!resolvedImportPath) {
          throw new Error(
            `Could not resolve CSS @import "${importRequest}" in "${cssPath}". ` +
              `Checked: ${candidates.join(', ') || '(none)'}.`
          );
        }
        return resolveCssText(resolvedImportPath, importStack);
      }
    );
    importStack.delete(cssPath);
    cssTextCache.set(cssPath, resolvedText);
    return resolvedText;
  };

  const buildAssetModuleBody = (
    assetPath: string,
    data: Uint8Array
  ): string => {
    const extension = PathExt.extname(assetPath).toLowerCase();
    if (extension === '.css') {
      const cssText = resolveCssText(assetPath);
      return `'use strict';
const exports = {};
const cssText = ${JSON.stringify(cssText)};
if (typeof document !== 'undefined' && document.head) {
  const styleId = 'jp-plugin-playground-style-' + ${JSON.stringify(assetPath)};
  if (!document.getElementById(styleId)) {
    const styleTag = document.createElement('style');
    styleTag.id = styleId;
    styleTag.textContent = cssText;
    document.head.appendChild(styleTag);
  }
}
exports.default = cssText;
exports.__esModule = true;
return exports;
`;
    }

    if (extension === '.json') {
      const source = new TextDecoder().decode(data);
      let parsed: unknown;
      try {
        parsed = JSON.parse(source);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid JSON file "${assetPath}": ${message}`);
      }
      return `'use strict';
const exports = {};
const value = ${JSON.stringify(parsed)};
if (value && typeof value === 'object' && !Array.isArray(value)) {
  Object.assign(exports, value);
}
exports.default = value;
exports.__esModule = true;
return exports;
`;
    }

    if (
      extension === '.svg' ||
      extension === '.txt' ||
      extension === '.md' ||
      extension === '.html' ||
      extension === '.htm' ||
      extension === '.csv'
    ) {
      const textValue = new TextDecoder().decode(data);
      return `'use strict';
const exports = {};
exports.default = ${JSON.stringify(textValue)};
exports.__esModule = true;
return exports;
`;
    }

    const dataUrl = `data:${guessMimeType(assetPath)};base64,${bytesToBase64(
      data
    )}`;
    return `'use strict';
const exports = {};
exports.default = ${JSON.stringify(dataUrl)};
exports.__esModule = true;
return exports;
`;
  };

  const buildLocalCandidates = (
    fromPath: string,
    request: string
  ): string[] => {
    const normalizedRequest = String(request || '').trim();
    if (!normalizedRequest.startsWith('.')) {
      return [];
    }
    const base = ContentUtils.normalizeContentsPath(
      PathExt.join(PathExt.dirname(fromPath), normalizedRequest).replace(
        /\\/g,
        '/'
      )
    );
    if (!base || !ContentUtils.isSafeRelativePath(base)) {
      return [];
    }
    if (/\.[^/]+$/.test(base)) {
      return [base];
    }

    return [
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.js`,
      `${base}.css`,
      `${base}.json`,
      `${base}.svg`,
      PathExt.join(base, 'index.css'),
      PathExt.join(base, 'index.ts'),
      PathExt.join(base, 'index.tsx'),
      PathExt.join(base, 'index.js')
    ]
      .map(candidate =>
        ContentUtils.normalizeContentsPath(candidate.replace(/\\/g, '/'))
      )
      .filter(
        candidate =>
          candidate.length > 0 && ContentUtils.isSafeRelativePath(candidate)
      );
  };

  const requirePattern = /require\(\s*(['"])([^'"]+)\1\s*\)/g;
  const transpiler = new PluginTranspiler({
    compilerOptions: {
      target: ts.ScriptTarget.ES2017,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
      inlineSourceMap: true,
      inlineSources: true
    }
  });

  const moduleBodies: Record<string, string> = {};
  const pendingPaths = Array.from(new Set(Object.values(exposedEntries)));
  const transpiledPaths = new Set<string>();

  while (pendingPaths.length > 0) {
    const modulePath = pendingPaths.pop();
    if (!modulePath || transpiledPaths.has(modulePath)) {
      continue;
    }

    const sourceEntry = sourceEntryByPath.get(modulePath);
    if (!sourceEntry) {
      const assetEntry = projectEntryByPath.get(modulePath);
      if (assetEntry) {
        moduleBodies[modulePath] = buildAssetModuleBody(
          modulePath,
          assetEntry.data
        );
        transpiledPaths.add(modulePath);
        continue;
      }
      throw new Error(
        `Could not find source module "${modulePath}" while generating wheel build artifacts.`
      );
    }

    const sourceCode = new TextDecoder().decode(sourceEntry.data);
    let transpiledCode = '';
    try {
      transpiledCode = transpiler.transpile(sourceCode, false, modulePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to transpile "${modulePath}" while generating wheel build artifacts: ${message}`
      );
    }

    if (!transpiledCode.trim()) {
      throw new Error(`Transpiled output for "${modulePath}" is empty.`);
    }

    moduleBodies[modulePath] = transpiledCode;
    transpiledPaths.add(modulePath);

    requirePattern.lastIndex = 0;
    let match: RegExpExecArray | null = null;
    while ((match = requirePattern.exec(transpiledCode)) !== null) {
      const request = match[2];
      if (!request || !request.startsWith('.')) {
        continue;
      }

      const candidates = buildLocalCandidates(modulePath, request);
      const resolvedSource = selectSingleMatch(
        candidates,
        candidate => sourceEntryByPath.has(candidate),
        `Local import "${request}" in "${modulePath}"`
      );
      if (resolvedSource) {
        pendingPaths.push(resolvedSource);
        continue;
      }

      const resolvedAsset = selectSingleMatch(
        candidates,
        candidate => projectPathSet.has(candidate),
        `Local import "${request}" in "${modulePath}"`
      );
      if (resolvedAsset) {
        const assetEntry = projectEntryByPath.get(resolvedAsset);
        if (!assetEntry) {
          throw new Error(
            `Could not read local import "${request}" resolved to "${resolvedAsset}" in "${modulePath}".`
          );
        }
        if (
          !Object.prototype.hasOwnProperty.call(moduleBodies, resolvedAsset)
        ) {
          moduleBodies[resolvedAsset] = buildAssetModuleBody(
            resolvedAsset,
            assetEntry.data
          );
        }
        continue;
      }

      throw new Error(
        `Could not resolve local import "${request}" in "${modulePath}". ` +
          `Checked: ${candidates.join(', ') || '(none)'}.`
      );
    }
  }

  const packageName =
    typeof rootPackageJson.name === 'string' && rootPackageJson.name.trim()
      ? rootPackageJson.name.trim()
      : normalizeProjectName(fallbackRootName || 'plugin-playground-export');
  const rootJupyterlabConfig = getJupyterlabConfig(rootPackageJson) ?? {};

  const generatedBuildConfig: Record<string, unknown> = {
    load: GENERATED_REMOTE_ENTRY_PATH
  };
  if (exposedEntries['./extension']) {
    generatedBuildConfig.extension = './extension';
  }
  if (exposedEntries['./mimeExtension']) {
    generatedBuildConfig.mimeExtension = './mimeExtension';
  }
  if (exposedEntries['./style']) {
    generatedBuildConfig.style = './style';
  }

  const generatedPackageJson: Record<string, unknown> = {
    ...rootPackageJson,
    jupyterlab: {
      ...rootJupyterlabConfig,
      _build: generatedBuildConfig
    }
  };

  const passthroughEntries = projectEntries.filter(
    entry =>
      entry.path !== 'package.json' &&
      entry.path !== GENERATED_REMOTE_ENTRY_PATH
  );
  const remoteEntry = createGeneratedRemoteEntrySource({
    moduleBodies,
    exposeEntries: exposedEntries,
    scopeName: packageName
  });

  return {
    entries: [
      textArchiveEntry(
        'package.json',
        `${JSON.stringify(generatedPackageJson, null, 2)}\n`
      ),
      ...passthroughEntries,
      textArchiveEntry(GENERATED_REMOTE_ENTRY_PATH, remoteEntry)
    ],
    fallbackRootName: packageName || fallbackRootName
  };
}

export async function createPythonWheelArchive(
  entries: ReadonlyArray<IArchiveEntry>,
  rootPath: string
): Promise<IWheelArchive> {
  const rootName = PathExt.basename(rootPath);
  const normalizedEntries = entries
    .map(entry => {
      const path = ContentUtils.normalizeContentsPath(
        entry.path.replace(/\\/g, '/')
      );
      return {
        path,
        data: entry.data
      };
    })
    .filter(entry => entry.path.length > 0);
  const prefix = rootName
    ? `${ContentUtils.normalizeContentsPath(
        rootName.replace(/\\/g, '/')
      ).replace(/\/+$/g, '')}/`
    : '';
  const projectEntries =
    prefix && normalizedEntries.every(entry => entry.path.startsWith(prefix))
      ? normalizedEntries
          .map(entry => ({
            path: entry.path.slice(prefix.length),
            data: entry.data
          }))
          .filter(entry => entry.path.length > 0)
      : normalizedEntries;
  const unsafeEntry = projectEntries.find(
    entry => !ContentUtils.isSafeRelativePath(entry.path)
  );
  if (unsafeEntry) {
    throw new Error(`Unsupported archive entry path "${unsafeEntry.path}".`);
  }

  const rootPackageJson = parsePackageJsonEntry(projectEntries, 'package.json');
  if (!rootPackageJson) {
    throw new Error('Wheel export requires a root package.json.');
  }

  const rootFallbackName =
    typeof rootPackageJson.name === 'string' && rootPackageJson.name.trim()
      ? rootPackageJson.name.trim()
      : PathExt.basename(projectEntries[0]?.path ?? '');

  const resolvedLabextension = createLabextensionFromSource(
    projectEntries,
    rootPackageJson,
    rootFallbackName
  );

  const metadata = createWheelMetadata(
    resolvedLabextension.entries,
    resolvedLabextension.fallbackRootName || rootName
  );
  const rootJupyterlabConfig = getJupyterlabConfig(rootPackageJson) ?? {};
  const schemaDirValue = rootJupyterlabConfig.schemaDir;
  const schemaSourcePath =
    typeof schemaDirValue === 'string' && schemaDirValue.trim().length > 0
      ? ContentUtils.normalizeContentsPath(
          schemaDirValue.trim().replace(/\\/g, '/')
        ).replace(/\/+$/g, '')
      : '';
  const hasSchemaSourcePath =
    schemaSourcePath.length > 0 &&
    ContentUtils.isSafeRelativePath(schemaSourcePath);
  const schemaTargetPath = `schemas/${metadata.labextensionName}`;
  const schemaSourcePrefix = hasSchemaSourcePath ? `${schemaSourcePath}/` : '';
  const schemaTargetPrefix = `${schemaTargetPath}/`;

  const distribution =
    metadata.pythonPackageName.replace(/[^A-Za-z0-9.]+/g, '_') ||
    'plugin_playground_export';
  const version =
    metadata.version.replace(/[^A-Za-z0-9.]+/g, '_') ||
    'plugin_playground_export';
  const distInfoPath = `${distribution}-${version}.dist-info`;
  const labextensionPath = `${distribution}-${version}.data/data/share/jupyter/labextensions/${metadata.labextensionName}`;
  let copiedSchemaEntries = false;
  const wheelEntries: IArchiveEntry[] = resolvedLabextension.entries.map(
    entry => {
      let relativePath = entry.path;
      if (
        hasSchemaSourcePath &&
        (relativePath === schemaSourcePath ||
          relativePath.startsWith(schemaSourcePrefix))
      ) {
        const schemaRelativePath = relativePath
          .slice(schemaSourcePath.length)
          .replace(/^\/+/g, '');
        relativePath = schemaRelativePath
          ? `${schemaTargetPrefix}${schemaRelativePath}`
          : schemaTargetPath;
        copiedSchemaEntries = true;
      }
      return {
        path: `${labextensionPath}/${relativePath}`,
        data: entry.data
      };
    }
  );
  if (
    copiedSchemaEntries &&
    !wheelEntries.some(
      entry =>
        entry.path ===
        `${labextensionPath}/${schemaTargetPath}/package.json.orig`
    )
  ) {
    wheelEntries.push(
      textArchiveEntry(
        `${labextensionPath}/${schemaTargetPath}/package.json.orig`,
        `${JSON.stringify(rootPackageJson, null, 2)}\n`
      )
    );
  }

  const hasInstallJson = resolvedLabextension.entries.some(
    entry => entry.path === 'install.json'
  );
  if (!hasInstallJson) {
    wheelEntries.push(
      textArchiveEntry(
        `${labextensionPath}/install.json`,
        `${JSON.stringify(
          {
            packageManager: 'python',
            packageName: metadata.pythonPackageName,
            uninstallInstructions:
              'Use your Python package manager (pip, conda, etc.) to uninstall the package ' +
              metadata.pythonPackageName
          },
          null,
          2
        )}\n`
      )
    );
  }

  for (const projectEntry of projectEntries) {
    if (
      projectEntry.path.includes('/') ||
      !LICENSE_FILE_NAME_PATTERN.test(projectEntry.path)
    ) {
      continue;
    }
    wheelEntries.push({
      path: `${distInfoPath}/licenses/${projectEntry.path}`,
      data: projectEntry.data
    });
  }

  const metadataLines = [
    'Metadata-Version: 2.1',
    `Name: ${metadata.pythonPackageName}`,
    `Version: ${metadata.version}`,
    `Summary: ${metadata.summary}`
  ];
  if (metadata.homePage) {
    metadataLines.push(`Home-page: ${metadata.homePage}`);
  }
  if (metadata.license) {
    metadataLines.push(`License: ${metadata.license}`);
  }
  if (metadata.author) {
    metadataLines.push(`Author: ${metadata.author}`);
  }
  if (metadata.authorEmail) {
    metadataLines.push(`Author-email: ${metadata.authorEmail}`);
  }
  if (metadata.keywords) {
    metadataLines.push(`Keywords: ${metadata.keywords}`);
  }
  metadataLines.push('');

  wheelEntries.push(
    textArchiveEntry(
      `${distInfoPath}/WHEEL`,
      [
        'Wheel-Version: 1.0',
        `Generator: ${WHEEL_GENERATOR}`,
        'Root-Is-Purelib: true',
        `Tag: ${WHEEL_TAG}`,
        ''
      ].join('\n')
    ),
    textArchiveEntry(`${distInfoPath}/METADATA`, metadataLines.join('\n'))
  );
  wheelEntries.sort((left, right) => left.path.localeCompare(right.path));

  const recordPath = `${distInfoPath}/RECORD`;
  const recordRows = await Promise.all(
    wheelEntries.map(async entry => {
      const digest = await sha256Base64Url(entry.data);
      if (!digest) {
        throw new Error(
          `Unable to generate a compliant wheel RECORD entry for "${entry.path}": SHA-256 hashing is unavailable in this environment.`
        );
      }
      const hashColumn = `sha256=${digest}`;
      return `${escapeCsv(entry.path)},${escapeCsv(hashColumn)},${
        entry.data.length
      }`;
    })
  );
  recordRows.push(`${escapeCsv(recordPath)},,`);
  wheelEntries.push(textArchiveEntry(recordPath, `${recordRows.join('\n')}\n`));

  return {
    filename: `${distribution}-${version}-${WHEEL_TAG}.whl`,
    entries: wheelEntries
  };
}
