import { PathExt } from '@jupyterlab/coreutils';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  gunzipBytes,
  gzipBytesIfSupported,
  stableStringHash
} from './encoding';
import { ContentUtils } from './contents';

const SHARE_TOKEN_VERSION = '1';
const MAX_SHARED_TOKEN_PAYLOAD_CHARS = 12000;
const MAX_SHARED_PAYLOAD_BYTES = 512 * 1024;
const SHARED_PAYLOAD_TOO_LARGE_MESSAGE = 'Shared payload is too large';
const SHARED_PAYLOAD_TOKEN_TOO_LARGE_MESSAGE =
  'Shared payload token is too large';

/**
 * Token codec:
 * - `g`: gzip-compressed payload
 * - `r`: raw (uncompressed) payload
 */
enum ShareCodec {
  Gzip = 'g',
  Raw = 'r'
}

function sanitizeFileName(fileName: string): string {
  const normalized = ContentUtils.normalizeContentsPath(fileName).replace(
    /\\/g,
    '/'
  );
  if (!ContentUtils.isSafeRelativePath(normalized)) {
    return '';
  }
  const segments = normalized.split('/');
  if (
    segments.some(
      segment => segment.length === 0 || segment === '.' || segment === '..'
    )
  ) {
    return '';
  }
  return PathExt.basename(normalized);
}

function removeTreeRoute(pathname: string): string {
  const treeSegmentIndex = pathname.indexOf('/tree/');
  if (treeSegmentIndex >= 0) {
    return pathname.slice(0, treeSegmentIndex);
  }
  if (pathname.endsWith('/tree')) {
    return pathname.slice(0, -'/tree'.length);
  }
  return pathname;
}

function normalizeSharedFolderFiles(files: unknown): Record<string, string> {
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    throw new Error('Shared payload folder files are invalid.');
  }

  const normalizedFiles: Record<string, string> = Object.create(null);
  for (const [relativePath, source] of Object.entries(
    files as Record<string, unknown>
  )) {
    if (typeof source !== 'string') {
      throw new Error('Shared payload source is invalid.');
    }

    const normalizedPath = ContentUtils.normalizeContentsPath(
      relativePath
    ).replace(/\\/g, '/');
    const pathSegments = normalizedPath.split('/');
    if (
      !normalizedPath ||
      pathSegments.some(
        segment => segment.length === 0 || segment === '.' || segment === '..'
      )
    ) {
      throw new Error('Shared payload file path is invalid.');
    }
    normalizedFiles[normalizedPath] = source;
  }

  if (Object.keys(normalizedFiles).length === 0) {
    throw new Error('Shared payload folder is empty.');
  }

  return normalizedFiles;
}

export namespace ShareLink {
  export const SHARE_URL_PARAM = 'plugin';
  export const SHARE_URL_WARN_LENGTH = 1800;
  export const SHARE_URL_MAX_LENGTH = 4096;

  /**
   * Shared payload for a single plugin file.
   */
  export interface ISharedPluginFilePayload {
    version: 1;
    kind: 'file';
    fileName: string;
    source: string;
  }

  /**
   * Shared payload for a plugin folder represented as a file map.
   */
  export interface ISharedPluginFolderPayload {
    version: 1;
    kind: 'folder';
    rootName: string;
    files: Record<string, string>;
  }

  export interface ISharedEntry {
    relativePath: string;
    source: string;
  }

  /**
   * Supported shared payload shapes (single file or folder map).
   */
  export type ISharedPluginPayload =
    | ISharedPluginFilePayload
    | ISharedPluginFolderPayload;

  export type ICreateSharedPluginLinkResult =
    | {
        ok: true;
        link: string;
        urlLength: number;
      }
    | {
        ok: false;
        reason: 'length' | 'payload';
        urlLength: number;
        message: string;
      };

  export function payloadRootName(payload: ISharedPluginPayload): string {
    if (payload.kind === 'folder') {
      return PathExt.basename(payload.rootName) || 'shared-plugin';
    }
    const fileName = PathExt.basename(payload.fileName) || 'plugin.ts';
    const extension = PathExt.extname(fileName);
    return extension ? fileName.slice(0, -extension.length) : fileName;
  }

  export function payloadEntries(
    payload: ISharedPluginPayload
  ): ISharedEntry[] {
    const entries: ISharedEntry[] =
      payload.kind === 'folder'
        ? Object.entries(payload.files).map(([relativePath, source]) => ({
            relativePath,
            source
          }))
        : [
            {
              relativePath: PathExt.basename(payload.fileName) || 'plugin.ts',
              source: payload.source
            }
          ];
    entries.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath)
    );
    return entries;
  }

  export async function encodeSharedPluginPayload(
    payload: ISharedPluginPayload
  ): Promise<string> {
    let normalizedPayload: ISharedPluginPayload;

    if (payload.kind === 'folder') {
      const rootName = sanitizeFileName(payload.rootName);
      if (!rootName) {
        throw new Error('Shared payload folder name is invalid.');
      }
      const normalizedFiles = normalizeSharedFolderFiles(payload.files);
      normalizedPayload = {
        version: 1,
        kind: 'folder',
        rootName,
        files: normalizedFiles
      };
    } else {
      if (typeof payload.source !== 'string') {
        throw new Error('Shared payload source is invalid.');
      }
      const fileName = sanitizeFileName(payload.fileName);
      if (!fileName) {
        throw new Error('Shared payload file name is invalid.');
      }
      normalizedPayload = {
        version: 1,
        kind: 'file',
        fileName,
        source: payload.source
      };
    }

    const rawBytes = new TextEncoder().encode(
      JSON.stringify(normalizedPayload)
    );
    if (rawBytes.length > MAX_SHARED_PAYLOAD_BYTES) {
      throw new Error(
        `${SHARED_PAYLOAD_TOO_LARGE_MESSAGE} (max ${MAX_SHARED_PAYLOAD_BYTES} bytes).`
      );
    }

    const compressedBytes = await gzipBytesIfSupported(rawBytes);
    const useCompressed =
      !!compressedBytes && compressedBytes.length < rawBytes.length;
    const codec = useCompressed ? ShareCodec.Gzip : ShareCodec.Raw;
    const encodedBytes = useCompressed ? compressedBytes : rawBytes;

    const paddingChars = (3 - (encodedBytes.length % 3)) % 3;
    const encodedPayloadChars =
      Math.ceil(encodedBytes.length / 3) * 4 - paddingChars;
    if (encodedPayloadChars > MAX_SHARED_TOKEN_PAYLOAD_CHARS) {
      throw new Error(
        `${SHARED_PAYLOAD_TOKEN_TOO_LARGE_MESSAGE} (max ${MAX_SHARED_TOKEN_PAYLOAD_CHARS} characters).`
      );
    }

    return `${SHARE_TOKEN_VERSION}.${codec}.${bytesToBase64Url(encodedBytes)}`;
  }

  export async function createSharedPluginLink(
    payload: ISharedPluginPayload,
    maxUrlLength = SHARE_URL_MAX_LENGTH
  ): Promise<ICreateSharedPluginLinkResult> {
    try {
      const encodedPayload = await encodeSharedPluginPayload(payload);
      const link = createSharedPluginUrl(encodedPayload);
      const urlLength = link.length;
      if (urlLength > maxUrlLength) {
        return {
          ok: false,
          reason: 'length',
          urlLength,
          message:
            `The generated link is ${urlLength} characters long, which exceeds the configured limit ` +
            `(${maxUrlLength}).`
        };
      }
      return {
        ok: true,
        link,
        urlLength
      };
    } catch (error) {
      if (isSharedPayloadTooLargeError(error)) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          reason: 'payload',
          urlLength: 0,
          message
        };
      }
      throw error;
    }
  }

  export async function decodeSharedPluginPayload(
    token: string
  ): Promise<ISharedPluginPayload> {
    const trimmed = token.trim();
    const parts = trimmed.split('.');
    if (parts.length !== 3) {
      throw new Error('Shared payload token format is invalid.');
    }

    const [version, codec, payload] = parts;
    if (version !== SHARE_TOKEN_VERSION) {
      throw new Error('Shared payload token version is not supported.');
    }
    if (codec !== ShareCodec.Gzip && codec !== ShareCodec.Raw) {
      throw new Error('Shared payload token compression codec is invalid.');
    }
    if (!payload) {
      throw new Error('Shared payload token is empty.');
    }
    if (payload.length > MAX_SHARED_TOKEN_PAYLOAD_CHARS) {
      throw new Error(
        `${SHARED_PAYLOAD_TOKEN_TOO_LARGE_MESSAGE} (max ${MAX_SHARED_TOKEN_PAYLOAD_CHARS} characters).`
      );
    }

    let payloadBytes: Uint8Array;
    try {
      payloadBytes = base64UrlToBytes(payload);
    } catch {
      throw new Error('Shared payload contains invalid base64 characters.');
    }
    if (payloadBytes.length > MAX_SHARED_PAYLOAD_BYTES) {
      throw new Error(
        `${SHARED_PAYLOAD_TOO_LARGE_MESSAGE} (max ${MAX_SHARED_PAYLOAD_BYTES} bytes).`
      );
    }
    const jsonBytes =
      codec === ShareCodec.Gzip
        ? await gunzipBytes(payloadBytes, MAX_SHARED_PAYLOAD_BYTES)
        : payloadBytes;

    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(jsonBytes));
    } catch {
      throw new Error('Shared payload JSON is invalid.');
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      (parsed as { version?: unknown }).version !== 1
    ) {
      throw new Error('Unsupported shared payload version.');
    }

    const candidate = parsed as {
      kind?: unknown;
      fileName?: unknown;
      source?: unknown;
      rootName?: unknown;
      files?: unknown;
    };
    const kind =
      candidate.kind === undefined ? 'file' : (candidate.kind as string);

    if (kind === 'folder') {
      if (typeof candidate.rootName !== 'string') {
        throw new Error('Shared payload folder name is invalid.');
      }
      const rootName = sanitizeFileName(candidate.rootName);
      if (!rootName) {
        throw new Error('Shared payload folder name is invalid.');
      }
      const files = normalizeSharedFolderFiles(candidate.files);
      return {
        version: 1,
        kind: 'folder',
        rootName,
        files
      };
    }

    if (kind !== 'file') {
      throw new Error('Shared payload kind is invalid.');
    }
    if (typeof candidate.fileName !== 'string') {
      throw new Error('Shared payload file name is invalid.');
    }
    if (typeof candidate.source !== 'string') {
      throw new Error('Shared payload source is invalid.');
    }

    const fileName = sanitizeFileName(candidate.fileName);
    if (!fileName) {
      throw new Error('Shared payload file name is invalid.');
    }
    return {
      version: 1,
      kind: 'file',
      fileName,
      source: candidate.source
    };
  }

  export function getSharedPluginTokenFromLocation(): string | null {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get(SHARE_URL_PARAM);
    } catch {
      return null;
    }
  }

  export function isSharedPayloadTooLargeError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    return (
      error.message.startsWith(SHARED_PAYLOAD_TOO_LARGE_MESSAGE) ||
      error.message.startsWith(SHARED_PAYLOAD_TOKEN_TOO_LARGE_MESSAGE)
    );
  }

  export function createSharedPluginUrl(token: string): string {
    const url = new URL(window.location.href);
    url.pathname = removeTreeRoute(url.pathname);
    url.searchParams.delete(SHARE_URL_PARAM);
    url.searchParams.set(SHARE_URL_PARAM, token);
    url.hash = '';
    return url.toString();
  }

  export function clearSharedPluginTokenFromLocation(): void {
    try {
      const currentUrl = new URL(window.location.href);
      if (!currentUrl.searchParams.has(SHARE_URL_PARAM)) {
        return;
      }
      currentUrl.searchParams.delete(SHARE_URL_PARAM);
      currentUrl.pathname = removeTreeRoute(currentUrl.pathname);
      currentUrl.hash = '';
      const next = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
      window.history.replaceState(window.history.state, '', next);
    } catch {
      // Ignore URL/history failures in non-browser contexts.
    }
  }

  export function sharedPluginFolderName(
    rootName: string,
    encodedToken: string
  ): string {
    const hash = stableStringHash(encodedToken);
    const normalizedRoot = rootName
      .trim()
      .replace(/[/\\]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${normalizedRoot || 'shared-plugin'}-${hash}`;
  }
}
