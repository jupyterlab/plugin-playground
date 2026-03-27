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
  if (!normalized) {
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
  return segments[segments.length - 1] ?? '';
}

export namespace ShareLink {
  export const SHARE_URL_PARAM = 'plugin';

  export interface ISharedPluginPayload {
    version: 1;
    fileName: string;
    source: string;
  }

  export async function encodeSharedPluginPayload(
    payload: ISharedPluginPayload
  ): Promise<string> {
    if (typeof payload.source !== 'string') {
      throw new Error('Shared payload source is invalid.');
    }
    const fileName = sanitizeFileName(payload.fileName);
    if (!fileName) {
      throw new Error('Shared payload file name is invalid.');
    }

    const rawBytes = new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        fileName,
        source: payload.source
      })
    );
    if (rawBytes.length > MAX_SHARED_PAYLOAD_BYTES) {
      throw new Error(
        `Shared payload is too large (max ${MAX_SHARED_PAYLOAD_BYTES} bytes).`
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
        `Shared payload token is too large (max ${MAX_SHARED_TOKEN_PAYLOAD_CHARS} characters).`
      );
    }

    return `${SHARE_TOKEN_VERSION}.${codec}.${bytesToBase64Url(encodedBytes)}`;
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
        `Shared payload token is too large (max ${MAX_SHARED_TOKEN_PAYLOAD_CHARS} characters).`
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
        `Shared payload is too large (max ${MAX_SHARED_PAYLOAD_BYTES} bytes).`
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
      fileName?: unknown;
      source?: unknown;
    };
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

  export function createSharedPluginUrl(token: string): string {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set(SHARE_URL_PARAM, token);
    return url.toString();
  }

  export function clearSharedPluginTokenFromLocation(): void {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has(SHARE_URL_PARAM)) {
        return;
      }
      url.searchParams.delete(SHARE_URL_PARAM);
      const next = `${url.pathname}${url.search}${url.hash}`;
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
