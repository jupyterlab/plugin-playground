import type { IArchiveEntry } from './archive';
import { PathExt } from '@jupyterlab/coreutils';

export interface ITemplateArchive {
  projectRoot: string;
  entries: IArchiveEntry[];
}

export function textArchiveEntry(path: string, text: string): IArchiveEntry {
  return {
    path,
    data: new TextEncoder().encode(text)
  };
}

export function normalizeProjectName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+/g, '')
    .replace(/-+$/g, '');
}

function createPackageJson(packageName: string): Record<string, unknown> {
  return {
    name: packageName,
    version: '0.1.0',
    description: 'JupyterLab extension exported from Plugin Playground.',
    keywords: ['jupyter', 'jupyterlab', 'jupyterlab-extension'],
    main: 'lib/index.js',
    types: 'lib/index.d.ts',
    files: ['lib/**/*.{d.ts,js,js.map,json}', 'src/**/*.{ts,tsx}'],
    scripts: {
      clean: 'rimraf lib tsconfig.tsbuildinfo',
      'build:lib': 'tsc',
      'build:labextension': 'jupyter labextension build .',
      'build:labextension:dev':
        'jupyter labextension build --development True .',
      build: 'jlpm run build:lib && jlpm run build:labextension:dev'
    },
    dependencies: {
      '@jupyterlab/application': '^4.5.5'
    },
    devDependencies: {
      '@jupyterlab/builder': '^4.5.5',
      rimraf: '^3.0.2',
      typescript: '~5.5.4'
    },
    jupyterlab: {
      extension: true
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

function createReadme(packageName: string): string {
  return `# ${packageName}

This is a lightweight export created from JupyterLab Plugin Playground.
It is intended as a handoff package, not a full production-ready extension repository.

## What Is Included

- \`src/index.ts\`: your playground plugin source
- \`package.json\`: minimal JS package/dependency metadata
- \`tsconfig.json\`: minimal TypeScript configuration

## Recommended Next Step: Use extension-template

Create a full extension project using the official template:
- Repository: https://github.com/jupyterlab/extension-template

Then migrate this export into that project:

1. Generate a new extension project from \`extension-template\`.
2. Replace the generated \`src/index.ts\` with this export's \`src/index.ts\`.
3. Compare \`package.json\` and \`tsconfig.json\`, and copy over any needed dependencies or compiler options.
4. Build and test in the generated project.

## Why This Workflow

The template project includes the full recommended structure (packaging, tooling, tests, CI, release metadata), while this export keeps only the essentials so it stays simple.
`;
}

export function createTemplateArchive(
  activePath: string,
  activeSource: string
): ITemplateArchive {
  const fileName = PathExt.basename(activePath);
  const extension = PathExt.extname(fileName);
  const fileStem = extension ? fileName.slice(0, -extension.length) : fileName;
  const normalizedStem = normalizeProjectName(fileStem);
  const projectRoot = normalizedStem || 'plugin-extension';
  const packageName = `jupyterlab-${projectRoot}`;
  const packageJson = JSON.stringify(createPackageJson(packageName), null, 2);
  const tsconfig = JSON.stringify(createTsConfig(), null, 2);

  return {
    projectRoot,
    entries: [
      textArchiveEntry(`${projectRoot}/src/index.ts`, activeSource),
      textArchiveEntry(`${projectRoot}/package.json`, `${packageJson}\n`),
      textArchiveEntry(`${projectRoot}/tsconfig.json`, `${tsconfig}\n`),
      textArchiveEntry(`${projectRoot}/README.md`, createReadme(packageName))
    ]
  };
}
