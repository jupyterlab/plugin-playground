import { ContentUtils } from './contents';

export interface IArchiveEntry {
  path: string;
  data: Uint8Array;
}

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const UTF8_FILENAME_FLAG = 0x0800;
const ZIP_VERSION = 20;

const ZIP_MIME_TYPE = 'application/zip';

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function createBuffer(size: number): { bytes: Uint8Array; view: DataView } {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of data) {
    crc = CRC32_TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZipBytes(entries: ReadonlyArray<IArchiveEntry>): Uint8Array {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let localOffset = 0;
  let entryCount = 0;

  for (const entry of entries) {
    const normalizedPath = ContentUtils.normalizeContentsPath(
      entry.path.replace(/\\/g, '/')
    );
    if (!normalizedPath) {
      continue;
    }

    const pathBytes = encoder.encode(normalizedPath);
    const data = entry.data;
    const dataLength = data.length;
    const entryCrc32 = crc32(data);

    const { bytes: localHeader, view: localView } = createBuffer(
      30 + pathBytes.length
    );
    localView.setUint32(0, LOCAL_FILE_HEADER_SIGNATURE, true);
    localView.setUint16(4, ZIP_VERSION, true);
    localView.setUint16(6, UTF8_FILENAME_FLAG, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, entryCrc32, true);
    localView.setUint32(18, dataLength, true);
    localView.setUint32(22, dataLength, true);
    localView.setUint16(26, pathBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(pathBytes, 30);
    localChunks.push(localHeader, data);

    const { bytes: centralHeader, view: centralView } = createBuffer(
      46 + pathBytes.length
    );
    centralView.setUint32(0, CENTRAL_DIRECTORY_HEADER_SIGNATURE, true);
    centralView.setUint16(4, ZIP_VERSION, true);
    centralView.setUint16(6, ZIP_VERSION, true);
    centralView.setUint16(8, UTF8_FILENAME_FLAG, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, entryCrc32, true);
    centralView.setUint32(20, dataLength, true);
    centralView.setUint32(24, dataLength, true);
    centralView.setUint16(28, pathBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(pathBytes, 46);
    centralChunks.push(centralHeader);

    localOffset += localHeader.length + dataLength;
    if (localOffset > 0xffffffff) {
      throw new Error('Export is too large for ZIP32 archives.');
    }
    entryCount += 1;
    if (entryCount > 0xffff) {
      throw new Error('Too many files to export in a ZIP32 archive.');
    }
  }

  const centralDirectory = new Uint8Array(
    centralChunks.reduce((sum, chunk) => sum + chunk.length, 0)
  );
  let centralCursor = 0;
  for (const chunk of centralChunks) {
    centralDirectory.set(chunk, centralCursor);
    centralCursor += chunk.length;
  }

  const { bytes: endOfCentralDirectory, view: eocdView } = createBuffer(22);
  eocdView.setUint32(0, END_OF_CENTRAL_DIRECTORY_SIGNATURE, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, entryCount, true);
  eocdView.setUint16(10, entryCount, true);
  eocdView.setUint32(12, centralDirectory.length, true);
  eocdView.setUint32(16, localOffset, true);
  eocdView.setUint16(20, 0, true);

  const totalSize =
    localChunks.reduce((sum, chunk) => sum + chunk.length, 0) +
    centralDirectory.length +
    endOfCentralDirectory.length;
  const archive = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of localChunks) {
    archive.set(chunk, offset);
    offset += chunk.length;
  }
  archive.set(centralDirectory, offset);
  offset += centralDirectory.length;
  archive.set(endOfCentralDirectory, offset);
  return archive;
}

function triggerDownload(href: string, filename: string): void {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function downloadArchive(
  entries: ReadonlyArray<IArchiveEntry>,
  filename: string
): void {
  const zipped = createZipBytes(entries);
  const blob = new Blob([zipped], { type: ZIP_MIME_TYPE });
  const objectUrl = URL.createObjectURL(blob);
  triggerDownload(objectUrl, filename);
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 1000);
}
