import { Dialog, ReactWidget, showDialog } from '@jupyterlab/apputils';
import { PathExt } from '@jupyterlab/coreutils';
import { formatFileSize } from '@jupyterlab/filebrowser';
import * as React from 'react';

import { ShareLink } from './share-link';

export interface IFolderShareCandidateFile {
  relativePath: string;
  source: string;
  sizeBytes: number;
  autoExcluded: boolean;
}

export interface IFolderShareSelectionResult {
  selectedPaths: string[];
  disableDialogIfAllFilesCanBeIncluded: boolean;
}

class FolderShareSelectionDialogBody
  extends ReactWidget
  implements Dialog.IBodyWidget<string[]>
{
  constructor(
    folderPath: string,
    files: ReadonlyArray<IFolderShareCandidateFile>,
    totalBytes: number,
    maxUrlLength: number
  ) {
    super();
    this.addClass('jp-PluginPlayground-folderShareSelectionDialog');
    this._files = files;
    this._folderPath = folderPath;
    this._maxUrlLength = maxUrlLength;
    this._summaryText =
      `${files.length} selectable file${files.length === 1 ? '' : 's'} ` +
      `(${formatFileSize(totalBytes, 1, 1024)} total).`;
    this._includedByDefault = files.filter(file => !file.autoExcluded);
    this._autoExcluded = files.filter(file => file.autoExcluded);
    for (const file of this._includedByDefault) {
      this._selectedPaths.add(file.relativePath);
    }
    void this._updateSelectionCapacity();
  }

  render(): JSX.Element {
    const capacityClassName = [
      'jp-PluginPlayground-folderShareSelectionCapacity',
      this._capacityTone === 'warning' ? 'jp-mod-warning' : '',
      this._capacityTone === 'error' ? 'jp-mod-error' : ''
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <>
        <p className="jp-PluginPlayground-folderShareSelectionSummary">
          {this._summaryText}
        </p>
        <div className={capacityClassName}>
          <p className="jp-PluginPlayground-folderShareSelectionCapacityLabel">
            {this._capacityLabel}
          </p>
          <div className="jp-PluginPlayground-folderShareSelectionCapacityTrack">
            <div
              className="jp-PluginPlayground-folderShareSelectionCapacityFill"
              style={{ width: `${this._capacityUsagePercent.toFixed(1)}%` }}
            />
          </div>
          <p className="jp-PluginPlayground-folderShareSelectionCapacityDetails">
            {this._capacityDetails}
          </p>
        </div>
        <div className="jp-PluginPlayground-folderShareSelectionList">
          {this._includedByDefault.length > 0 ? (
            <>
              <p className="jp-PluginPlayground-folderShareSelectionHeading">
                Included by default
              </p>
              {this._includedByDefault.map(file => this._renderRow(file))}
            </>
          ) : null}
          {this._autoExcluded.length > 0 ? (
            <>
              <p className="jp-PluginPlayground-folderShareSelectionHeading">
                Auto-excluded (select to include)
              </p>
              {this._autoExcluded.map(file => this._renderRow(file))}
            </>
          ) : null}
        </div>
      </>
    );
  }

  getValue(): string[] {
    return this._selectedFiles().map(file => file.relativePath);
  }

  private _renderRow(file: IFolderShareCandidateFile): JSX.Element {
    return (
      <label
        className="jp-PluginPlayground-folderShareSelectionRow"
        key={file.relativePath}
      >
        <input
          type="checkbox"
          checked={this._selectedPaths.has(file.relativePath)}
          onChange={event => {
            this._toggleSelection(
              file.relativePath,
              event.currentTarget.checked
            );
          }}
        />
        <span className="jp-PluginPlayground-folderShareSelectionPath">
          {`${file.relativePath} (${formatFileSize(file.sizeBytes, 1, 1024)})`}
        </span>
      </label>
    );
  }

  private _toggleSelection(relativePath: string, selected: boolean): void {
    if (selected) {
      this._selectedPaths.add(relativePath);
    } else {
      this._selectedPaths.delete(relativePath);
    }
    this.update();
    void this._updateSelectionCapacity();
  }

  private _selectedFiles(): IFolderShareCandidateFile[] {
    return this._files.filter(file =>
      this._selectedPaths.has(file.relativePath)
    );
  }

  private async _updateSelectionCapacity(): Promise<void> {
    const updateToken = ++this._capacityUpdateToken;
    const selectedFiles = this._selectedFiles();
    const selectedBytes = selectedFiles.reduce(
      (total, file) => total + file.sizeBytes,
      0
    );

    if (selectedFiles.length === 0) {
      this._capacityLabel = '0 B selected';
      this._capacityUsagePercent = 0;
      this._capacityDetails = 'Select at least one file.';
      this._setCapacityTone('warning');
      this.update();
      return;
    }

    try {
      const payload = buildFolderSharePayload(this._folderPath, selectedFiles);
      const linkResult = await ShareLink.createSharedPluginLink(
        payload,
        this._maxUrlLength
      );
      if (updateToken !== this._capacityUpdateToken) {
        return;
      }

      const urlLength = linkResult.urlLength;
      let usagePercent =
        this._maxUrlLength > 0
          ? Math.min(100, (urlLength / this._maxUrlLength) * 100)
          : 0;
      if (!linkResult.ok && linkResult.reason !== 'length') {
        usagePercent = 100;
      }
      this._capacityUsagePercent = usagePercent;

      const estimatedCapacityBytes =
        urlLength > 0
          ? Math.max(
              selectedBytes,
              Math.floor((selectedBytes * this._maxUrlLength) / urlLength)
            )
          : selectedBytes;
      this._capacityLabel =
        `${formatFileSize(selectedBytes, 1, 1024)} / ` +
        `${formatFileSize(estimatedCapacityBytes, 1, 1024)} selected`;

      if (linkResult.ok) {
        const remaining = Math.max(this._maxUrlLength - urlLength, 0);
        this._capacityDetails =
          `${urlLength.toLocaleString()} / ` +
          `${this._maxUrlLength.toLocaleString()} URL chars used ` +
          `(${remaining.toLocaleString()} remaining).`;
        this._setCapacityTone(usagePercent >= 85 ? 'warning' : 'normal');
      } else if (linkResult.reason === 'length') {
        const overLimit = Math.max(urlLength - this._maxUrlLength, 0);
        this._capacityDetails =
          `${urlLength.toLocaleString()} / ` +
          `${this._maxUrlLength.toLocaleString()} URL chars used ` +
          `(${overLimit.toLocaleString()} over limit).`;
        this._setCapacityTone('error');
      } else {
        this._capacityDetails =
          linkResult.message ??
          'Selected files exceed the share payload limit.';
        this._setCapacityTone('error');
      }
      this.update();
    } catch (error) {
      if (updateToken !== this._capacityUpdateToken) {
        return;
      }
      this._capacityUsagePercent = 100;
      this._capacityLabel = `${formatFileSize(
        selectedBytes,
        1,
        1024
      )} selected`;
      this._capacityDetails =
        error instanceof Error
          ? error.message
          : 'Failed to estimate share link size.';
      this._setCapacityTone('error');
      this.update();
    }
  }

  private _setCapacityTone(tone: 'normal' | 'warning' | 'error'): void {
    this._capacityTone = tone;
  }

  private readonly _files: ReadonlyArray<IFolderShareCandidateFile>;
  private readonly _folderPath: string;
  private readonly _maxUrlLength: number;
  private readonly _summaryText: string;
  private readonly _includedByDefault: ReadonlyArray<IFolderShareCandidateFile>;
  private readonly _autoExcluded: ReadonlyArray<IFolderShareCandidateFile>;
  private readonly _selectedPaths = new Set<string>();
  private _capacityLabel = '0 B selected';
  private _capacityDetails = 'Select at least one file.';
  private _capacityUsagePercent = 0;
  private _capacityTone: 'normal' | 'warning' | 'error' = 'warning';
  private _capacityUpdateToken = 0;
}

const SHARE_FOLDER_EXCLUDED_EXTENSIONS = new Set([
  '.avif',
  '.bmp',
  '.cur',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.mp4',
  '.mov',
  '.mkv',
  '.mp3',
  '.ogg',
  '.otf',
  '.pdf',
  '.png',
  '.svg',
  '.tar',
  '.ttf',
  '.wav',
  '.webm',
  '.webp',
  '.md',
  '.markdown',
  '.py',
  '.rst',
  '.woff',
  '.woff2',
  '.zip',
  '.7z'
]);

const SHARE_FOLDER_EXCLUDED_FILE_NAME_PATTERNS = [
  /^readme(?:\.[^.]+)?$/i,
  /^changelog(?:\.[^.]+)?$/i,
  /^contributing(?:\.[^.]+)?$/i,
  /^code[-_]of[-_]conduct(?:\.[^.]+)?$/i,
  /^license(?:\.[^.]+)?$/i,
  /^notice(?:\.[^.]+)?$/i
];

const SHARE_FOLDER_EXCLUDED_FILE_SUFFIXES = [
  '.spec.ts',
  '.spec.tsx',
  '.spec.js',
  '.spec.jsx',
  '.test.ts',
  '.test.tsx',
  '.test.js',
  '.test.jsx',
  '.snap'
];

const SHARE_FOLDER_EXCLUDED_DIRECTORIES = new Set([
  '__tests__',
  '__mocks__',
  'docs',
  'doc',
  'spec',
  'specs',
  'test',
  'tests'
]);

export function shouldSkipFolderShareEntry(path: string): boolean {
  const normalizedPath = path.replace(/\\/g, '/');
  const lowerPath = normalizedPath.toLowerCase();
  if (
    SHARE_FOLDER_EXCLUDED_EXTENSIONS.has(
      PathExt.extname(lowerPath).toLowerCase()
    )
  ) {
    return true;
  }

  const baseName = PathExt.basename(lowerPath);
  if (
    SHARE_FOLDER_EXCLUDED_FILE_NAME_PATTERNS.some(pattern =>
      pattern.test(baseName)
    )
  ) {
    return true;
  }

  if (
    SHARE_FOLDER_EXCLUDED_FILE_SUFFIXES.some(suffix =>
      lowerPath.endsWith(suffix)
    )
  ) {
    return true;
  }

  return lowerPath
    .split('/')
    .some(segment => SHARE_FOLDER_EXCLUDED_DIRECTORIES.has(segment));
}

export function buildFolderSharePayload(
  folderPath: string,
  files: ReadonlyArray<IFolderShareCandidateFile>
): ShareLink.ISharedPluginFolderPayload {
  const fileMap: Record<string, string> = Object.create(null);
  const sortedFiles = [...files].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );
  for (const file of sortedFiles) {
    fileMap[file.relativePath] = file.source;
  }

  const rootName = PathExt.basename(folderPath) || 'shared-plugin';

  return {
    version: 1,
    kind: 'folder',
    rootName,
    files: fileMap
  };
}

export async function selectFolderSharePaths(
  folderPath: string,
  files: ReadonlyArray<IFolderShareCandidateFile>,
  includeDisableDialogCheckbox = false,
  maxUrlLength = ShareLink.SHARE_URL_MAX_LENGTH
): Promise<IFolderShareSelectionResult | null> {
  const sortedFiles = [...files].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );
  const totalBytes = sortedFiles.reduce(
    (total, file) => total + file.sizeBytes,
    0
  );

  const selectionResult = await showDialog<string[]>({
    title: 'Select Files to Share',
    body: new FolderShareSelectionDialogBody(
      folderPath,
      sortedFiles,
      totalBytes,
      maxUrlLength
    ),
    buttons: [
      Dialog.cancelButton(),
      Dialog.okButton({ label: 'Share Selected Files' })
    ],
    focusNodeSelector: 'input[type="checkbox"]',
    checkbox: includeDisableDialogCheckbox
      ? {
          label: 'Do not ask me again if all files can be included'
        }
      : null
  });
  if (!selectionResult.button.accept) {
    return null;
  }

  return {
    selectedPaths: selectionResult.value ?? [],
    disableDialogIfAllFilesCanBeIncluded: selectionResult.isChecked === true
  };
}
