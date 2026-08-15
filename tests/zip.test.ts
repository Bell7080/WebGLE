import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createZip, crc32, readZip, ZipFormatError } from "../src/core/format/zip";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe("CRC32", () => {
  it("알려진 값과 일치한다", () => {
    expect(crc32(encoder.encode("123456789"))).toBe(0xcbf43926);
  });

  it("빈 데이터는 0이다", () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("ZIP 왕복", () => {
  it("쓴 그대로 다시 읽힌다", async () => {
    const zip = createZip([
      { name: "puppet.json", data: encoder.encode('{"format":"puppetforge"}') },
      { name: "character.png", data: new Uint8Array([1, 2, 3, 4, 5]) },
    ]);

    const entries = await readZip(zip);
    expect(entries.map((entry) => entry.name)).toEqual(["puppet.json", "character.png"]);
    expect(decoder.decode(entries[0]!.data)).toBe('{"format":"puppetforge"}');
    expect(Array.from(entries[1]!.data)).toEqual([1, 2, 3, 4, 5]);
  });

  it("한글 이름과 빈 파일도 견딘다", async () => {
    const zip = createZip([
      { name: "언데드늑대.json", data: encoder.encode("{}") },
      { name: "empty.bin", data: new Uint8Array() },
    ]);
    const entries = await readZip(zip);
    expect(entries[0]!.name).toBe("언데드늑대.json");
    expect(entries[1]!.data.length).toBe(0);
  });

  it("압축된 항목(deflate)도 읽는다", async () => {
    // 다른 도구로 다시 압축한 파일을 흉내낸다.
    const original = encoder.encode("puppetforge".repeat(50));
    const compressed = new Uint8Array(deflateRawSync(original));

    const stored = createZip([{ name: "a.txt", data: original }]);
    const patched = patchToDeflate(stored, compressed, original.length);

    const entries = await readZip(patched);
    expect(decoder.decode(entries[0]!.data)).toBe(decoder.decode(original));
  });

  it("ZIP이 아니면 거부한다", async () => {
    await expect(readZip(encoder.encode("not a zip at all"))).rejects.toThrow(ZipFormatError);
  });

  it("표준 unzip으로 검증된다", () => {
    const zip = createZip([
      { name: "puppet.json", data: encoder.encode('{"format":"puppetforge","version":1}') },
      { name: "character.png", data: new Uint8Array([137, 80, 78, 71]) },
    ]);

    const dir = mkdtempSync(join(tmpdir(), "puppet-zip-"));
    const path = join(dir, "test.zip");
    writeFileSync(path, zip);

    const output = execFileSync("unzip", ["-t", path], { encoding: "utf8" });
    expect(output).toContain("No errors detected");
  });
});

/** stored로 만든 ZIP 한 항목을 deflate 항목으로 바꿔치기한다. 테스트 전용. */
function patchToDeflate(zip: Uint8Array, compressed: Uint8Array, originalSize: number): Uint8Array {
  const nameLength = new DataView(zip.buffer).getUint16(26, true);
  const head = zip.subarray(0, 30 + nameLength);
  const rest = zip.subarray(30 + nameLength + originalSize);

  const result = new Uint8Array(head.length + compressed.length + rest.length);
  result.set(head, 0);
  result.set(compressed, head.length);
  result.set(rest, head.length + compressed.length);

  const view = new DataView(result.buffer);
  view.setUint16(8, 8, true); // 로컬 헤더: deflate
  view.setUint32(18, compressed.length, true);

  // 중앙 디렉터리도 같이 고친다.
  const centralOffset = head.length + compressed.length;
  view.setUint16(centralOffset + 10, 8, true);
  view.setUint32(centralOffset + 20, compressed.length, true);

  // 끝 레코드의 중앙 디렉터리 위치.
  view.setUint32(result.length - 22 + 16, centralOffset, true);
  return result;
}
