import { InputDialog } from '@jupyterlab/apputils';
import { PathExt } from '@jupyterlab/coreutils';
import { formatFileSize } from '@jupyterlab/filebrowser';

import type { ShareLink } from './share-link';

export interface IFolderShareCandidateFile {
  relativePath: string;
  source: string;
  sizeBytes: number;
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
  '.woff',
  '.woff2',
  '.zip',
  '.7z'
]);

export function shouldSkipFolderShareEntry(path: string): boolean {
  return SHARE_FOLDER_EXCLUDED_EXTENSIONS.has(
    PathExt.extname(path).toLowerCase()
  );
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
  files: ReadonlyArray<IFolderShareCandidateFile>
): Promise<string[] | null> {
  const sortedFiles = [...files].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );
  const totalBytes = sortedFiles.reduce(
    (total, file) => total + file.sizeBytes,
    0
  );
  const itemToPath = new Map<string, string>();
  const items = sortedFiles.map(file => {
    const item =
      `${file.relativePath} (` + `${formatFileSize(file.sizeBytes, 1, 1024)})`;
    itemToPath.set(item, file.relativePath);
    return item;
  });

  const selectionResult = await InputDialog.getMultipleItems({
    title: 'Select Files to Share',
    label:
      `${sortedFiles.length} selectable file` +
      `${sortedFiles.length === 1 ? '' : 's'} ` +
      `(${formatFileSize(totalBytes, 1, 1024)} total).`,
    items,
    defaults: items,
    okLabel: 'Share Selected Files'
  });
  if (!selectionResult.button.accept) {
    return null;
  }

  return (selectionResult.value ?? [])
    .map(item => itemToPath.get(item) ?? '')
    .filter(path => path.length > 0);
}
