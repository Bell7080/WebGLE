/**
 * 최소한의 ZIP 읽기 / 쓰기. (기획서 6, 38)
 *
 * 쓰기는 무압축(stored)만 쓴다. PNG는 이미 압축돼 있어 다시 줄여도 이득이 거의 없고,
 * 이 정도면 의존성을 늘리지 않고 표준 ZIP 파일을 만들 수 있다.
 * 읽기는 stored와 deflate를 모두 지원한다 (다른 도구로 다시 압축한 파일 대비).
 */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;

  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  crcTable = table;
  return table;
}

export function crc32(data: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = (crc >>> 8) ^ (table[(crc ^ (data[i] ?? 0)) & 0xff] ?? 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** ZIP 하나로 묶는다. 항목 순서는 넘긴 순서를 그대로 지킨다. */
export function createZip(entries: readonly ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const checksum = crc32(entry.data);

    const local = new Uint8Array(30 + name.length + entry.data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, LOCAL_HEADER, true);
    localView.setUint16(4, 20, true); // 필요 버전
    localView.setUint16(6, 0, true); // 플래그
    localView.setUint16(8, 0, true); // 무압축
    localView.setUint16(10, 0, true); // 시각
    localView.setUint16(12, 0, true); // 날짜
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, entry.data.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true); // 부가 필드 없음
    local.set(name, 30);
    local.set(entry.data, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, CENTRAL_HEADER, true);
    centralView.setUint16(4, 20, true); // 만든 버전
    centralView.setUint16(6, 20, true); // 필요 버전
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, END_OF_CENTRAL, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  const total =
    locals.reduce((sum, part) => sum + part.length, 0) + centralSize + end.length;
  const result = new Uint8Array(total);
  let cursor = 0;
  for (const part of [...locals, ...centrals, end]) {
    result.set(part, cursor);
    cursor += part.length;
  }
  return result;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  void writer.write(data.slice() as unknown as BufferSource);
  void writer.close();
  const buffer = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(buffer);
}

export class ZipFormatError extends Error {}

/** ZIP을 항목 목록으로 되돌린다. 중앙 디렉터리를 기준으로 읽는다. */
export async function readZip(data: Uint8Array): Promise<ZipEntry[]> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  let endOffset = -1;
  for (let i = data.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === END_OF_CENTRAL) {
      endOffset = i;
      break;
    }
  }
  if (endOffset < 0) throw new ZipFormatError("ZIP 파일이 아닙니다.");

  const count = view.getUint16(endOffset + 10, true);
  let cursor = view.getUint32(endOffset + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];

  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(cursor, true) !== CENTRAL_HEADER) {
      throw new ZipFormatError("ZIP 구조가 손상되었습니다.");
    }

    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(data.subarray(cursor + 46, cursor + 46 + nameLength));

    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = data.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) {
      entries.push({ name, data: raw });
    } else if (method === 8) {
      entries.push({ name, data: await inflateRaw(raw) });
    } else {
      throw new ZipFormatError(`지원하지 않는 압축 방식입니다: ${method}`);
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}
