/** 알파 클리핑이 얇은 외곽선을 너무 칼같이 잘라내지 않는지 검증한다. */
import { describe, expect, it } from "vitest";
import type { PuppetMesh } from "../src/core/format";
import {
  ALPHA_MASK_PADDING,
  ALPHA_THRESHOLD,
  sampleAlphaMask,
  type AlphaMap,
} from "../src/editor/tools/alphaMask";

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

/** 실제 대형 일러스트 크기에서도 성긴 격자의 반 칸과 외곽 여유가 함께 적용되는 Mesh다. */
function largeIllustrationMesh(x: number, y: number): PuppetMesh {
  return {
    resolution: "smoothHigh",
    cols: 384,
    rows: 384,
    vertices: [x, y],
    indices: [],
    weights: [{ boneIds: [], weights: [] }],
  };
}

describe("알파 마스크 외곽 여유", () => {
  it("촘촘한 격자에서도 반 칸에 2px 여유를 더해 영향 영역에 포함한다", () => {
    const map = singlePixelMap(5, 5);
    // 10px / 100칸은 반 칸을 올리면 1px이므로 고정 여유까지 총 3px을 확인한다.
    expect(sampleAlphaMask(map, pointMesh(5 + ALPHA_MASK_PADDING + 1, 5))).toEqual([true]);
  });

  it("정해진 여유보다 먼 투명 영역까지 확장하지 않는다", () => {
    const map = singlePixelMap(5, 5);
    expect(sampleAlphaMask(map, pointMesh(5 + ALPHA_MASK_PADDING + 2, 5))).toEqual([false]);
  });

  it("알파가 아주 희미한 픽셀도 작업물로 취급한다", () => {
    const map = singlePixelMap(5, 5);
    map.data[5 * map.width + 5] = ALPHA_THRESHOLD;
    expect(sampleAlphaMask(map, pointMesh(5, 5))).toEqual([true]);
  });

  it("3000px 일러스트에서는 격자 반 칸 바깥의 고정 여유까지 포함한다", () => {
    const size = 3000;
    const data = new Uint8Array(size * size);
    const pixelX = 1500;
    const pixelY = 1500;
    data[pixelY * size + pixelX] = 1;
    const halfCell = Math.ceil(size / 384 / 2);

    // 기존 반 칸 판정에서는 빠졌던 2px 바깥 정점도 이제 이미지 변형에 묶인다.
    const mesh = largeIllustrationMesh(pixelX + halfCell + ALPHA_MASK_PADDING, pixelY);
    expect(sampleAlphaMask({ width: size, height: size, data }, mesh)).toEqual([true]);
  });
});
