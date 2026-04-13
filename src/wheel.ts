import type { IArchiveEntry } from './archive';
import { ContentUtils } from './contents';
import { sha256Base64Url } from './encoding';
import { normalizeProjectName, textArchiveEntry } from './export-template';
import { PathExt } from '@jupyterlab/coreutils';

const DEFAULT_WHEEL_VERSION = '0.1.0';
const DEFAULT_WHEEL_SUMMARY =
  'JupyterLab extension exported from Plugin Playground.';
const WHEEL_GENERATOR = 'jupyterlab-plugin-playground';
const WHEEL_TAG = 'py3-none-any';
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

function createWheelMetadata(
  projectEntries: ReadonlyArray<IArchiveEntry>,
  fallbackRootName: string
): IWheelMetadata {
  let packageJson: Record<string, unknown> | null = null;
  const packageJsonEntry = projectEntries.find(
    entry => entry.path === 'package.json'
  );
  if (packageJsonEntry) {
    packageJson = ContentUtils.parseJsonObject(
      new TextDecoder().decode(packageJsonEntry.data)
    );
  }
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
  const fallbackLabextensionName = normalizedRootName
    ? `plugin-playground-${normalizedRootName}`
    : 'plugin-playground-export';
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
  const metadata = createWheelMetadata(projectEntries, rootName);
  const distribution =
    metadata.pythonPackageName.replace(/[^A-Za-z0-9.]+/g, '_') ||
    'plugin_playground_export';
  const version =
    metadata.version.replace(/[^A-Za-z0-9.]+/g, '_') ||
    'plugin_playground_export';
  const distInfoPath = `${distribution}-${version}.dist-info`;
  const labextensionPath = `${distribution}-${version}.data/data/share/jupyter/labextensions/${metadata.labextensionName}`;

  const wheelEntries: IArchiveEntry[] = projectEntries.map(entry => ({
    path: `${labextensionPath}/${entry.path}`,
    data: entry.data
  }));

  const hasInstallJson = projectEntries.some(
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
      const hashColumn = digest ? `sha256=${digest}` : '';
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
