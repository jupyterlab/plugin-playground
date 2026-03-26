interface IByteTransformStreamConstructor {
  new (format: 'gzip'): TransformStream<Uint8Array, Uint8Array>;
}

async function readStreamBytes(
  stream: ReadableStream<Uint8Array>,
  maxOutputBytes?: number
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value || value.length === 0) {
      continue;
    }

    totalBytes += value.length;
    if (
      maxOutputBytes !== undefined &&
      Number.isFinite(maxOutputBytes) &&
      totalBytes > maxOutputBytes
    ) {
      await reader.cancel();
      throw new Error(
        `Shared payload exceeds size limit (${maxOutputBytes} bytes).`
      );
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let start = 0; start < bytes.length; start += chunkSize) {
    const chunk = bytes.subarray(start, start + chunkSize);
    let chunkBinary = '';
    for (let index = 0; index < chunk.length; index++) {
      chunkBinary += String.fromCharCode(chunk[index]);
    }
    binary += chunkBinary;
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function base64UrlToBytes(base64Url: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(base64Url)) {
    throw new Error('Base64url value contains invalid characters.');
  }
  const paddingLength = (4 - (base64Url.length % 4)) % 4;
  const padded =
    base64Url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(paddingLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function stableStringHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export async function gzipBytesIfSupported(
  bytes: Uint8Array
): Promise<Uint8Array | null> {
  const StreamConstructor = (
    globalThis as typeof globalThis & {
      CompressionStream?: IByteTransformStreamConstructor;
    }
  ).CompressionStream;
  if (!StreamConstructor) {
    return null;
  }
  try {
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new StreamConstructor('gzip'));
    return await readStreamBytes(stream);
  } catch {
    return null;
  }
}

export async function gunzipBytes(
  bytes: Uint8Array,
  maxOutputBytes?: number
): Promise<Uint8Array> {
  const StreamConstructor = (
    globalThis as typeof globalThis & {
      DecompressionStream?: IByteTransformStreamConstructor;
    }
  ).DecompressionStream;
  if (!StreamConstructor) {
    throw new Error('This browser cannot decompress shared payloads.');
  }

  try {
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new StreamConstructor('gzip'));
    return await readStreamBytes(stream, maxOutputBytes);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith('Shared payload exceeds size limit')
    ) {
      throw error;
    }
    throw new Error('Shared payload decompression failed.');
  }
}
