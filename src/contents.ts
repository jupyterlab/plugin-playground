import { Clipboard } from '@jupyterlab/apputils';
import { Contents, ServiceManager } from '@jupyterlab/services';

export type IDirectoryModel = Contents.IModel & {
  type: 'directory';
  content: Contents.IModel[];
};

export type IFileModel = Contents.IModel & {
  type: 'file';
  content: unknown;
  format?: string | null;
};

export function normalizeContentsPath(path: string | null | undefined): string {
  return (path ?? '').replace(/^\/+/g, '');
}

export function contentsPathCandidates(path: string): string[] {
  // Jupyter Server and JupyterLite do not always agree on whether contents
  // paths should be rooted. Try both forms so callers can use one code path.
  const trimmed = normalizeContentsPath(path);
  if (trimmed.length === 0) {
    return [];
  }
  return [trimmed, `/${trimmed}`];
}

async function getContentsModel(
  serviceManager: ServiceManager.IManager,
  path: string,
  options: Contents.IFetchOptions
): Promise<Contents.IModel | null> {
  try {
    return await serviceManager.contents.get(path, options);
  } catch {
    return null;
  }
}

export async function getDirectoryModel(
  serviceManager: ServiceManager.IManager,
  path: string
): Promise<IDirectoryModel | null> {
  for (const candidatePath of contentsPathCandidates(path)) {
    const model = await getContentsModel(serviceManager, candidatePath, {
      content: true
    });
    if (!model || model.type !== 'directory' || !Array.isArray(model.content)) {
      continue;
    }
    return model as IDirectoryModel;
  }
  return null;
}

export async function getFileModel(
  serviceManager: ServiceManager.IManager,
  path: string
): Promise<IFileModel | null> {
  for (const candidatePath of contentsPathCandidates(path)) {
    const model = await getContentsModel(serviceManager, candidatePath, {
      content: true
    });
    if (!model || model.type !== 'file') {
      continue;
    }
    if (model.content !== null) {
      return model as IFileModel;
    }

    const textModel = await getContentsModel(serviceManager, candidatePath, {
      content: true,
      format: 'text'
    });
    if (textModel && textModel.type === 'file' && textModel.content !== null) {
      return textModel as IFileModel;
    }
  }
  return null;
}

export function fileModelToText(fileModel: IFileModel | null): string | null {
  if (!fileModel) {
    return null;
  }

  if (typeof fileModel.content === 'string') {
    if (fileModel.format === 'base64') {
      try {
        return atob(fileModel.content);
      } catch {
        return null;
      }
    }
    return fileModel.content;
  }

  if (
    fileModel.content !== null &&
    typeof fileModel.content === 'object' &&
    !Array.isArray(fileModel.content)
  ) {
    return JSON.stringify(fileModel.content);
  }

  return null;
}

export async function readContentsFileAsText(
  serviceManager: ServiceManager.IManager,
  path: string
): Promise<string | null> {
  const fileModel = await getFileModel(serviceManager, path);
  return fileModelToText(fileModel);
}

export async function copyValueToClipboard(value: string): Promise<void> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    Clipboard.copyToSystem(value);
  } catch (error) {
    try {
      Clipboard.copyToSystem(value);
    } catch (fallbackError) {
      throw fallbackError instanceof Error
        ? fallbackError
        : error instanceof Error
        ? error
        : new Error('Unknown clipboard error');
    }
  }
}

export function setCopiedStateWithTimeout(
  value: string,
  copiedTimer: number | null,
  setCopiedTimer: (timer: number | null) => void,
  setCopiedValue: (copiedValue: string | null) => void,
  update: () => void,
  timeoutMs = 1200
): void {
  setCopiedValue(value);
  update();

  if (copiedTimer !== null) {
    window.clearTimeout(copiedTimer);
  }

  const timer = window.setTimeout(() => {
    setCopiedValue(null);
    setCopiedTimer(null);
    update();
  }, timeoutMs);

  setCopiedTimer(timer);
}

export function normalizeExternalUrl(rawUrl: string): string | null {
  try {
    const parsedUrl = new URL(rawUrl, window.location.origin);
    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      return parsedUrl.toString();
    }
  } catch {
    // Invalid URL.
  }
  return null;
}

export function openExternalLink(rawUrl: string): void {
  const safeUrl = normalizeExternalUrl(rawUrl);
  if (!safeUrl) {
    return;
  }
  window.open(safeUrl, '_blank', 'noopener,noreferrer');
}
