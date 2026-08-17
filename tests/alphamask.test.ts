/** 알파 클리핑이 얇은 외곽선을 너무 칼같이 잘라내지 않는지 검증한다. */
import { describe, expect, it } from "vitest";
import type { PuppetMesh } from "../src/core/format";
import { ALPHA_MASK_PADDING, sampleAlphaMask, type AlphaMap } from "../src/editor/tools/alphaMask";

/** 정점 하나만 가진 최소 Mesh로 특정 좌표의 마스크 판정만 분리해서 살핀다. */
function pointMesh(x: number, y: number): PuppetMesh {
  return {
    resolution: "smoothHigh",
    cols: 100,
    rows: 100,
    vertices: [x, y],
    indices: [],
    weights: [{ boneIds: [], weights: [] }],
  };
}

/** 지정한 한 픽셀만 불투명한 작은 알파 맵을 만든다. */
function singlePixelMap(x: number, y: number): AlphaMap {
  const width = 10;
  const height = 10;
  const data = new Uint8Array(width * height);
  data[y * width + x] = 255;
  return { width, height, data };
}

describe("알파 마스크 외곽 여유", () => {
  it("실루엣에서 2px 떨어진 정점도 영향 영역에 포함한다", () => {
    const map = singlePixelMap(5, 5);
    expect(sampleAlphaMask(map, pointMesh(5 + ALPHA_MASK_PADDING, 5))).toEqual([true]);
  });

  it("정해진 여유보다 먼 투명 영역까지 확장하지 않는다", () => {
    const map = singlePixelMap(5, 5);
    expect(sampleAlphaMask(map, pointMesh(5 + ALPHA_MASK_PADDING + 1, 5))).toEqual([false]);
  });
});
