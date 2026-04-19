import { Dialog, showDialog } from '@jupyterlab/apputils';
import { PathExt } from '@jupyterlab/coreutils';
import { formatFileSize } from '@jupyterlab/filebrowser';
import { Widget } from '@lumino/widgets';

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
  extends Widget
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
    this._folderPath = folderPath;
    this._maxUrlLength = maxUrlLength;

    const documentRef = this.node.ownerDocument;
    const summary = documentRef.createElement('p');
    summary.classList.add('jp-PluginPlayground-folderShareSelectionSummary');
    summary.textContent =
      `${files.length} selectable file${files.length === 1 ? '' : 's'} ` +
      `(${formatFileSize(totalBytes, 1, 1024)} total).`;
    this.node.appendChild(summary);

    const capacity = documentRef.createElement('div');
    capacity.classList.add('jp-PluginPlayground-folderShareSelectionCapacity');
    const capacityLabel = documentRef.createElement('p');
    capacityLabel.classList.add(
      'jp-PluginPlayground-folderShareSelectionCapacityLabel'
    );
    capacity.appendChild(capacityLabel);
    const capacityTrack = documentRef.createElement('div');
    capacityTrack.classList.add(
      'jp-PluginPlayground-folderShareSelectionCapacityTrack'
    );
    const capacityFill = documentRef.createElement('div');
    capacityFill.classList.add(
      'jp-PluginPlayground-folderShareSelectionCapacityFill'
    );
    capacityTrack.appendChild(capacityFill);
    capacity.appendChild(capacityTrack);
    const capacityDetails = documentRef.createElement('p');
    capacityDetails.classList.add(
      'jp-PluginPlayground-folderShareSelectionCapacityDetails'
    );
    capacity.appendChild(capacityDetails);
    this.node.appendChild(capacity);
    this._capacityNode = capacity;
    this._capacityLabelNode = capacityLabel;
    this._capacityFillNode = capacityFill;
    this._capacityDetailsNode = capacityDetails;

    const includedByDefault = files.filter(file => !file.autoExcluded);
    const autoExcluded = files.filter(file => file.autoExcluded);
    const list = documentRef.createElement('div');
    list.classList.add('jp-PluginPlayground-folderShareSelectionList');

    if (includedByDefault.length > 0) {
      const heading = documentRef.createElement('p');
      heading.classList.add('jp-PluginPlayground-folderShareSelectionHeading');
      heading.textContent = 'Included by default';
      list.appendChild(heading);

      for (const file of includedByDefault) {
        const label = documentRef.createElement('label');
        label.classList.add('jp-PluginPlayground-folderShareSelectionRow');

        const checkbox = documentRef.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.addEventListener('change', () => {
          void this._updateSelectionCapacity();
        });
        label.appendChild(checkbox);

        const text = documentRef.createElement('span');
        text.classList.add('jp-PluginPlayground-folderShareSelectionPath');
        text.textContent =
          `${file.relativePath} (` +
          `${formatFileSize(file.sizeBytes, 1, 1024)})`;
        label.appendChild(text);

        this._checkboxRows.push({
          file,
          checkbox
        });
        list.appendChild(label);
      }
    }

    if (autoExcluded.length > 0) {
      const heading = documentRef.createElement('p');
      heading.classList.add('jp-PluginPlayground-folderShareSelectionHeading');
      heading.textContent = 'Auto-excluded (select to include)';
      list.appendChild(heading);

      for (const file of autoExcluded) {
        const label = documentRef.createElement('label');
        label.classList.add('jp-PluginPlayground-folderShareSelectionRow');

        const checkbox = documentRef.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = false;
        checkbox.addEventListener('change', () => {
          void this._updateSelectionCapacity();
        });
        label.appendChild(checkbox);

        const text = documentRef.createElement('span');
        text.classList.add('jp-PluginPlayground-folderShareSelectionPath');
        text.textContent =
          `${file.relativePath} (` +
          `${formatFileSize(file.sizeBytes, 1, 1024)})`;
        label.appendChild(text);

        this._checkboxRows.push({
          file,
          checkbox
        });
        list.appendChild(label);
      }
    }

    this.node.appendChild(list);
    void this._updateSelectionCapacity();
  }

  getValue(): string[] {
    return this._checkboxRows
      .filter(row => row.checkbox.checked)
      .map(row => row.file.relativePath);
  }

  private async _updateSelectionCapacity(): Promise<void> {
    const updateToken = ++this._capacityUpdateToken;
    const selectedFiles = this._checkboxRows
      .filter(row => row.checkbox.checked)
      .map(row => row.file);
    const selectedBytes = selectedFiles.reduce(
      (total, file) => total + file.sizeBytes,
      0
    );

    if (selectedFiles.length === 0) {
      this._capacityLabelNode.textContent = '0 B selected';
      this._capacityFillNode.style.width = '0%';
      this._capacityDetailsNode.textContent = 'Select at least one file.';
      this._setCapacityTone('warning');
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
      const usagePercent =
        this._maxUrlLength > 0
          ? Math.min(100, (urlLength / this._maxUrlLength) * 100)
          : 0;
      this._capacityFillNode.style.width = `${usagePercent.toFixed(1)}%`;

      const estimatedCapacityBytes =
        urlLength > 0
          ? Math.max(
              selectedBytes,
              Math.floor((selectedBytes * this._maxUrlLength) / urlLength)
            )
          : selectedBytes;
      this._capacityLabelNode.textContent =
        `${formatFileSize(selectedBytes, 1, 1024)} / ` +
        `${formatFileSize(estimatedCapacityBytes, 1, 1024)} selected`;

      if (linkResult.ok) {
        const remaining = Math.max(this._maxUrlLength - urlLength, 0);
        this._capacityDetailsNode.textContent =
          `${urlLength.toLocaleString()} / ` +
          `${this._maxUrlLength.toLocaleString()} URL chars used ` +
          `(${remaining.toLocaleString()} remaining).`;
        this._setCapacityTone(usagePercent >= 85 ? 'warning' : 'normal');
      } else if (linkResult.reason === 'length') {
        const overLimit = Math.max(urlLength - this._maxUrlLength, 0);
        this._capacityDetailsNode.textContent =
          `${urlLength.toLocaleString()} / ` +
          `${this._maxUrlLength.toLocaleString()} URL chars used ` +
          `(${overLimit.toLocaleString()} over limit).`;
        this._setCapacityTone('error');
      } else {
        this._capacityDetailsNode.textContent =
          linkResult.message ??
          'Selected files exceed the share payload limit.';
        this._setCapacityTone('error');
      }
    } catch (error) {
      if (updateToken !== this._capacityUpdateToken) {
        return;
      }
      this._capacityFillNode.style.width = '100%';
      this._capacityLabelNode.textContent = `${formatFileSize(
        selectedBytes,
        1,
        1024
      )} selected`;
      this._capacityDetailsNode.textContent =
        error instanceof Error
          ? error.message
          : 'Failed to estimate share link size.';
      this._setCapacityTone('error');
    }
  }

  private _setCapacityTone(tone: 'normal' | 'warning' | 'error'): void {
    this._capacityNode.classList.remove('jp-mod-warning', 'jp-mod-error');
    if (tone === 'warning') {
      this._capacityNode.classList.add('jp-mod-warning');
    } else if (tone === 'error') {
      this._capacityNode.classList.add('jp-mod-error');
    }
  }

  private _checkboxRows: Array<{
    file: IFolderShareCandidateFile;
    checkbox: HTMLInputElement;
  }> = [];
  private readonly _folderPath: string;
  private readonly _maxUrlLength: number;
  private readonly _capacityNode: HTMLDivElement;
  private readonly _capacityLabelNode: HTMLParagraphElement;
  private readonly _capacityFillNode: HTMLDivElement;
  private readonly _capacityDetailsNode: HTMLParagraphElement;
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
