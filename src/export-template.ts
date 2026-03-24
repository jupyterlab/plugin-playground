import type { IArchiveEntry } from './archive';
import { normalizeContentsPath } from './contents';

export interface ITemplateArchive {
  projectRoot: string;
  entries: IArchiveEntry[];
}

function encodeText(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function textArchiveEntry(path: string, text: string): IArchiveEntry {
  return {
    path,
    data: encodeText(text)
  };
}

function removeFileExtension(path: string): string {
  return path.replace(/\.[^/.]+$/g, '');
}

function basename(path: string): string {
  const normalizedPath = normalizeContentsPath(path).replace(/\/+$/g, '');
  if (!normalizedPath) {
    return '';
  }
  const index = normalizedPath.lastIndexOf('/');
  if (index === -1) {
    return normalizedPath;
  }
  return normalizedPath.slice(index + 1);
}

function normalizeProjectName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+/g, '')
    .replace(/-+$/g, '');
}

function createPackageJson(
  packageName: string,
  pythonName: string
): Record<string, unknown> {
  return {
    name: packageName,
    version: '0.1.0',
    description: 'JupyterLab extension exported from Plugin Playground.',
    author: 'Your Name',
    keywords: ['jupyter', 'jupyterlab', 'jupyterlab-extension'],
    main: 'lib/index.js',
    types: 'lib/index.d.ts',
    style: 'style/index.css',
    files: [
      'lib/**/*.{d.ts,js,js.map,json}',
      'src/**/*.{ts,tsx}',
      'style/**/*.{css,js}'
    ],
    scripts: {
      clean: 'rimraf lib tsconfig.tsbuildinfo',
      'build:lib': 'tsc',
      'build:labextension': 'jupyter labextension build .',
      'build:labextension:dev':
        'jupyter labextension build --development True .',
      build: 'jlpm run build:lib && jlpm run build:labextension:dev',
      'build:prod':
        'jlpm run clean && jlpm run build:lib && jlpm run build:labextension',
      test: 'jest',
      'test:ui': 'cd ui-tests && jlpm test'
    },
    dependencies: {
      '@jupyterlab/application': '^4.5.5'
    },
    devDependencies: {
      '@jupyterlab/builder': '^4.5.5',
      '@types/jest': '^29.5.12',
      jest: '^29.7.0',
      rimraf: '^3.0.2',
      'ts-jest': '^29.1.2',
      typescript: '~5.5.4'
    },
    jupyterlab: {
      extension: true,
      outputDir: `${pythonName}/labextension`
    }
  };
}

function createTsConfig(): Record<string, unknown> {
  return {
    compilerOptions: {
      allowSyntheticDefaultImports: true,
      composite: true,
      declaration: true,
      esModuleInterop: true,
      incremental: true,
      jsx: 'react',
      lib: ['dom', 'es2020', 'es2020.intl'],
      module: 'esnext',
      moduleResolution: 'node',
      noEmitOnError: true,
      noImplicitAny: true,
      noUnusedLocals: true,
      preserveWatchOutput: true,
      outDir: 'lib',
      rootDir: 'src',
      strict: true,
      strictNullChecks: true,
      target: 'es2020'
    },
    include: ['src/*']
  };
}

function createPyProject(packageName: string, pythonName: string): string {
  return `[build-system]
requires = ["hatchling>=1.21.0", "jupyterlab>=4.0.0,<5.0.0", "hatch-jupyter-builder>=0.9.1"]
build-backend = "hatchling.build"

[project]
name = "${pythonName}"
version = "0.1.0"
description = "JupyterLab extension exported from Plugin Playground."
readme = "README.md"
requires-python = ">=3.8"
authors = [{ name = "Your Name" }]
dependencies = []

[tool.hatch.build.targets.sdist]
artifacts = ["${pythonName}/labextension"]

[tool.hatch.build.targets.wheel.shared-data]
"${pythonName}/labextension" = "share/jupyter/labextensions/${packageName}"
"install.json" = "share/jupyter/labextensions/${packageName}/install.json"

[tool.hatch.build.hooks.jupyter-builder]
dependencies = ["hatch-jupyter-builder>=0.9.1"]
build-function = "hatch_jupyter_builder.npm_builder"
ensured-targets = ["${pythonName}/labextension/package.json"]

[tool.hatch.build.hooks.jupyter-builder.build-kwargs]
build_cmd = "build:prod"
npm = ["jlpm"]
`;
}

function createReadme(packageName: string): string {
  return `# ${packageName}

This project was exported from JupyterLab Plugin Playground.

## Quick Start

1. Run \`jlpm install\`
2. Run \`jlpm run build\`
3. In your dev environment, run \`jupyter labextension develop . --overwrite\`
`;
}

function createGitHubWorkflow(): string {
  return `name: Build

on:
  push:
    branches: [main]
  pull_request:
    branches: ["*"]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install dependencies
        run: |
          python -m pip install -U "jupyterlab>=4,<5"
          jlpm install

      - name: Build
        run: jlpm run build
`;
}

function createUITestPackageJson(): Record<string, unknown> {
  return {
    name: 'ui-tests',
    private: true,
    scripts: {
      test: 'playwright test'
    },
    devDependencies: {
      '@playwright/test': '^1.49.1'
    }
  };
}

export function createTemplateArchive(
  activePath: string,
  activeSource: string
): ITemplateArchive {
  const fileStem = removeFileExtension(basename(activePath));
  const normalizedStem = normalizeProjectName(fileStem);
  const projectRoot = normalizedStem || 'plugin-extension';
  const packageName = `jupyterlab-${projectRoot}`;
  const pythonName = `jupyterlab_${projectRoot.replace(/-/g, '_')}`;
  const packageJson = JSON.stringify(
    createPackageJson(packageName, pythonName),
    null,
    2
  );
  const tsconfig = JSON.stringify(createTsConfig(), null, 2);
  const uiTestsPackageJson = JSON.stringify(createUITestPackageJson(), null, 2);
  const installJson = JSON.stringify(
    {
      packageManager: 'python',
      packageName: pythonName,
      uninstalledInstructions: 'Use pip to uninstall the package.'
    },
    null,
    2
  );

  return {
    projectRoot,
    entries: [
      textArchiveEntry(`${projectRoot}/src/index.ts`, activeSource),
      textArchiveEntry(`${projectRoot}/style/base.css`, ''),
      textArchiveEntry(
        `${projectRoot}/style/index.css`,
        "@import './base.css';\n"
      ),
      textArchiveEntry(
        `${projectRoot}/style/index.js`,
        "import './index.css';\n"
      ),
      textArchiveEntry(`${projectRoot}/package.json`, `${packageJson}\n`),
      textArchiveEntry(`${projectRoot}/tsconfig.json`, `${tsconfig}\n`),
      textArchiveEntry(
        `${projectRoot}/pyproject.toml`,
        createPyProject(packageName, pythonName)
      ),
      textArchiveEntry(
        `${projectRoot}/jest.config.js`,
        `module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testMatch: ['**/?(*.)+(spec|test).ts?(x)']
};
`
      ),
      textArchiveEntry(
        `${projectRoot}/.gitignore`,
        `node_modules/
lib/
dist/
*.pyc
__pycache__/
jupyter-config/
`
      ),
      textArchiveEntry(`${projectRoot}/README.md`, createReadme(packageName)),
      textArchiveEntry(
        `${projectRoot}/CHANGELOG.md`,
        `# Changelog

## 0.1.0

- Initial export from JupyterLab Plugin Playground.
`
      ),
      textArchiveEntry(`${projectRoot}/install.json`, `${installJson}\n`),
      textArchiveEntry(
        `${projectRoot}/.github/workflows/build.yml`,
        createGitHubWorkflow()
      ),
      textArchiveEntry(
        `${projectRoot}/ui-tests/package.json`,
        `${uiTestsPackageJson}\n`
      ),
      textArchiveEntry(
        `${projectRoot}/ui-tests/playwright.config.js`,
        `const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  use: {
    headless: true
  }
});
`
      ),
      textArchiveEntry(
        `${projectRoot}/ui-tests/tests/plugin-playground.spec.ts`,
        `import { test, expect } from '@playwright/test';

test('placeholder test', async ({ page }) => {
  await page.goto('http://localhost:8888/lab');
  await expect(page).toHaveTitle(/JupyterLab/);
});
`
      )
    ]
  };
}
