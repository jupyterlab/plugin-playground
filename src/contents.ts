import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView } from '@codemirror/view';
import type { CodeEditor } from '@jupyterlab/codeeditor';
import { Clipboard } from '@jupyterlab/apputils';
import { Contents, ServiceManager } from '@jupyterlab/services';

const LINE_CHANGE_DECORATION = Decoration.line({
  class: 'jp-PluginPlayground-lineHighlight'
});
const LINE_HIGHLIGHT_EFFECT = StateEffect.define<{ pos: number[] }>({
  map: (value, mapping) => ({
    pos: value.pos.map(position => mapping.mapPos(position))
  })
});
const LINE_CHANGE_STATE = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (highlights, transaction) => {
    highlights = highlights.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(LINE_HIGHLIGHT_EFFECT)) {
        const positions = effect.value.pos;
        return positions.length
          ? Decoration.set(
              positions.map(position => LINE_CHANGE_DECORATION.range(position)),
              true
            )
          : Decoration.none;
      }
    }
    return highlights;
  },
  provide: field => EditorView.decorations.from(field)
});
const LINE_HIGHLIGHT_EDITORS = new WeakSet<CodeEditor.IEditor>();
const LINE_HIGHLIGHT_TIMEOUTS = new WeakMap<CodeEditor.IEditor, number>();

function dispatchLineHighlight(
  editor: CodeEditor.IEditor,
  positions: number[]
): boolean {
  if (editor.isDisposed) {
    return false;
  }
  const cmEditor = (
    editor as CodeEditor.IEditor & {
      editor?: { dispatch?: (spec: { effects: unknown }) => void };
    }
  ).editor;
  if (!cmEditor || typeof cmEditor.dispatch !== 'function') {
    return false;
  }
  cmEditor.dispatch({
    effects: LINE_HIGHLIGHT_EFFECT.of({ pos: positions })
  });
  return true;
}

export namespace ContentUtils {
  export type IDirectoryModel = Contents.IModel & {
    type: 'directory';
    content: Contents.IModel[];
  };

  export type IFileModel = Contents.IModel & {
    type: 'file';
    content: unknown;
    format?: string | null;
  };

  export function normalizeContentsPath(
    path: string | null | undefined
  ): string {
    return (path ?? '').replace(/^\/+/g, '');
  }

  export function normalizeQuery(query: string): string {
    return query.trim().toLowerCase();
  }

  export function contentsPathCandidates(path: string): string[] {
    // Jupyter Server and JupyterLite do not always agree on whether contents
    // paths should be rooted. Try both forms so callers can use one code path.
    const trimmed = normalizeContentsPath(path);
    if (trimmed.length === 0) {
      return ['', '/'];
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
      if (
        !model ||
        model.type !== 'directory' ||
        !Array.isArray(model.content)
      ) {
        continue;
      }
      return model as IDirectoryModel;
    }
    return null;
  }

  export async function ensureContentsDirectory(
    serviceManager: ServiceManager.IManager,
    path: string
  ): Promise<void> {
    const normalizedPath = normalizeContentsPath(path).replace(/\/+$/g, '');
    if (!normalizedPath) {
      return;
    }

    const segments = normalizedPath.split('/');
    let current = '';
    for (const segment of segments) {
      const parentPath = current;
      current = current ? `${current}/${segment}` : segment;
      const existingDirectory = await getDirectoryModel(
        serviceManager,
        current
      );
      if (existingDirectory) {
        continue;
      }

      try {
        const createdDirectory = await serviceManager.contents.newUntitled({
          path: parentPath,
          type: 'directory'
        });
        const createdPath = normalizeContentsPath(createdDirectory.path);
        if (createdPath !== current) {
          await serviceManager.contents.rename(createdDirectory.path, current);
        }
      } catch (error) {
        const recheckedDirectory = await getDirectoryModel(
          serviceManager,
          current
        );
        if (!recheckedDirectory) {
          const message =
            error instanceof Error ? error.message : String(error);
          throw new Error(
            `Could not create directory "${current}". ${message}`
          );
        }
      }

      const ensuredDirectory = await getDirectoryModel(serviceManager, current);
      if (!ensuredDirectory) {
        throw new Error(`Could not create directory "${current}".`);
      }
    }
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
      if (
        textModel &&
        textModel.type === 'file' &&
        textModel.content !== null
      ) {
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

  export function fileModelToBytes(
    fileModel: IFileModel | null
  ): Uint8Array | null {
    if (!fileModel) {
      return null;
    }

    if (typeof fileModel.content === 'string') {
      if (fileModel.format === 'base64') {
        try {
          const decoded = atob(fileModel.content);
          const bytes = new Uint8Array(decoded.length);
          for (let index = 0; index < decoded.length; index++) {
            bytes[index] = decoded.charCodeAt(index);
          }
          return bytes;
        } catch {
          return null;
        }
      }
    }

    const text = fileModelToText(fileModel);
    return text === null ? null : new TextEncoder().encode(text);
  }

  export function parseJsonObject(
    raw: string | null | undefined
  ): Record<string, unknown> | null {
    if (typeof raw !== 'string') {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed)
      ) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }

  export function fileModelToJsonObject(
    fileModel: IFileModel | null
  ): Record<string, unknown> | null {
    return parseJsonObject(fileModelToText(fileModel));
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

  export function highlightEditorLines(
    editor: CodeEditor.IEditor,
    lines: number[],
    timeoutMs = 1200
  ): void {
    if (editor.isDisposed) {
      return;
    }

    const visibleLines = lines.filter(
      line => line >= 0 && line < editor.lineCount
    );
    if (visibleLines.length === 0) {
      return;
    }

    if (!LINE_HIGHLIGHT_EDITORS.has(editor)) {
      editor.injectExtension(LINE_CHANGE_STATE);
      LINE_HIGHLIGHT_EDITORS.add(editor);
    }

    const positions = visibleLines.map(line =>
      editor.getOffsetAt({ line, column: 0 })
    );
    if (!dispatchLineHighlight(editor, positions)) {
      return;
    }

    const previousTimeout = LINE_HIGHLIGHT_TIMEOUTS.get(editor);
    if (previousTimeout !== undefined) {
      window.clearTimeout(previousTimeout);
    }

    const timeout = window.setTimeout(() => {
      LINE_HIGHLIGHT_TIMEOUTS.delete(editor);
      dispatchLineHighlight(editor, []);
    }, timeoutMs);
    LINE_HIGHLIGHT_TIMEOUTS.set(editor, timeout);
  }
}
