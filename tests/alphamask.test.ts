/** 알파 클리핑이 테두리 셀을 찢지 않고, 투명한 셀은 그리지 않는지 검증한다. */
import { describe, expect, it } from "vitest";
import { createGridMesh, visibleIndices } from "../src/core/mesh";
import { extendWeightsInto } from "../src/core/weight/auto";
import type { PuppetBone } from "../src/core/format";
import {
  ALPHA_MASK_PADDING,
  ALPHA_THRESHOLD,
  legacyAlphaMask,
  sampleAlphaMask,
  type AlphaMap,
} from "../src/editor/tools/alphaMask";

/** 지정한 픽셀들만 불투명한 알파 맵. */
function alphaMap(width: number, height: number, pixels: [number, number][], value = 255): AlphaMap {
  const data = new Uint8Array(width * height);
  for (const [x, y] of pixels) data[y * width + x] = value;
  return { width, height, data };
}

/** 사람 모양에 가까운 실루엣. 팔이 사선이라 셀 모서리에 걸친 테두리가 많이 생긴다. */
function figure(width: number, height: number): AlphaMap {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const head = ((x - width * 0.5) / (width * 0.18)) ** 2 + ((y - height * 0.18) / (height * 0.13)) ** 2 < 1;
      const body = Math.abs(x - width * 0.5) < width * 0.14 && y > height * 0.28 && y < height * 0.62;
      const arm = x > width * 0.12 && x < width * 0.36 && Math.abs(y - height * 0.35 + (x - width * 0.36) * 0.4) < height * 0.03;
      if (head || body || arm) data[y * width + x] = 255;
    }
  }
  return { width, height, data };
}

/** 그림이 한 픽셀이라도 걸친 셀 중 꼭짓점이 마스크 밖인 셀 수. 0이어야 찢어지지 않는다. */
function tornCells(map: AlphaMap, mask: boolean[], cols: number, rows: number): number {
  let torn = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x0 = Math.floor((col * map.width) / cols);
      const x1 = Math.ceil(((col + 1) * map.width) / cols);
      const y0 = Math.floor((row * map.height) / rows);
      const y1 = Math.ceil(((row + 1) * map.height) / rows);
      let drawn = false;
      for (let y = y0; y < y1 && !drawn; y += 1) {
        for (let x = x0; x < x1; x += 1) if (map.data[y * map.width + x]) drawn = true;
      }
      if (!drawn) continue;
      const top = row * (cols + 1) + col;
      const bottom = top + cols + 1;
      if (!mask[top] || !mask[top + 1] || !mask[bottom] || !mask[bottom + 1]) torn += 1;
    }
  }
  return torn;
}

describe("알파 마스크 셀 판정", () => {
  it("셀 한쪽 모서리에 걸친 픽셀도 그 셀의 네 꼭짓점을 모두 넣는다", () => {
    // 10px 셀. (1, 1) 픽셀은 왼쪽 위 꼭짓점 근처지만 오른쪽 아래 꼭짓점(10, 10)도 따라가야 한다.
    const map = alphaMap(40, 40, [[11, 11]]);
    const mask = sampleAlphaMask(map, createGridMeshAt(40, 4));
    const at = (col: number, row: number) => mask[row * 5 + col];
    expect([at(1, 1), at(2, 1), at(1, 2), at(2, 2)]).toEqual([true, true, true, true]);
    // 여유 2px로는 이웃 셀까지 번지지 않는다.
    expect(at(3, 3)).toBe(false);
  });

  it("실제 실루엣에서 그림이 걸친 셀은 하나도 찢어지지 않는다", () => {
    const map = figure(600, 900);
    for (const resolution of ["smoothMin", "smoothLow", "smoothNormal"] as const) {
      const mesh = createGridMesh(map.width, map.height, resolution);
      expect(tornCells(map, sampleAlphaMask(map, mesh), mesh.cols, mesh.rows)).toBe(0);
    }
  });

  it("예전 반 칸 판정은 같은 실루엣에서 찢어지는 셀이 있었다", () => {
    const map = figure(600, 900);
    const mesh = createGridMesh(map.width, map.height, "smoothMin");
    expect(tornCells(map, legacyAlphaMask(map, mesh), mesh.cols, mesh.rows)).toBeGreaterThan(0);
  });

  it("알파가 아주 희미한 픽셀도 작업물로 취급한다", () => {
    const map = alphaMap(40, 40, [[15, 15]], ALPHA_THRESHOLD);
    const mesh = createGridMeshAt(40, 4);
    expect(sampleAlphaMask(map, mesh).filter(Boolean).length).toBe(4);
  });

  it("셀 경계 바로 밖의 픽셀은 여유만큼 이웃 셀을 끌어들인다", () => {
    // 셀 경계(20px)에서 여유 안쪽에 있는 픽셀이면 오른쪽 셀까지 포함한다.
    const mesh = createGridMeshAt(40, 4);
    const near = sampleAlphaMask(alphaMap(40, 40, [[20 - ALPHA_MASK_PADDING, 15]]), mesh);
    expect(near[1 * 5 + 3]).toBe(true);
    const far = sampleAlphaMask(alphaMap(40, 40, [[20 - ALPHA_MASK_PADDING - 2, 15]]), mesh);
    expect(far[1 * 5 + 3]).toBe(false);
  });

  it("마스크가 없으면 모든 정점을 연다", () => {
    const mesh = createGridMeshAt(40, 4);
    expect(sampleAlphaMask(null, mesh).every(Boolean)).toBe(true);
  });
});

describe("투명 셀 생략", () => {
  it("그림이 걸친 셀의 삼각형만 남긴다", () => {
    const mesh = createGridMeshAt(40, 4);
    const indices = visibleIndices(mesh, sampleAlphaMask(alphaMap(40, 40, [[15, 15]]), mesh));
    expect(indices).toEqual(mesh.indices.slice(5 * 6, 6 * 6));
  });

  it("실루엣 그림에서 삼각형 대부분을 덜어 내면서 그림 셀은 모두 남긴다", () => {
    const map = figure(600, 900);
    const mesh = createGridMesh(map.width, map.height, "smoothMin");
    const mask = sampleAlphaMask(map, mesh);
    const indices = visibleIndices(mesh, mask);
    expect(indices.length).toBeLessThan(mesh.indices.length / 2);
    expect(tornCells(map, mask, mesh.cols, mesh.rows)).toBe(0);
  });

  it("마스크가 없거나 크기가 맞지 않으면 전체를 그린다", () => {
    const mesh = createGridMeshAt(40, 4);
    expect(visibleIndices(mesh, null)).toBe(mesh.indices);
    expect(visibleIndices(mesh, [true])).toBe(mesh.indices);
  });
});

describe("옛 파일 테두리 메우기", () => {
  const bones = [{ id: "a" }] as unknown as PuppetBone[];

  it("지정한 빈 정점만 가장 가까운 칠한 값으로 채우고 나머지는 건드리지 않는다", () => {
    const mesh = createGridMeshAt(40, 4);
    const weights = { a: new Array<number>(25).fill(0) };
    weights.a[6] = 0.8;
    weights.a[12] = 0; // 대상이 아닌 빈 정점
    const targets = new Array<boolean>(25).fill(false);
    targets[7] = true; // 6의 오른쪽
    targets[8] = true; // 7을 거쳐 이어진다
    targets[24] = true; // 칠한 곳과 이어지지 않는다

    const result = extendWeightsInto(weights, bones, mesh, targets);
    expect(result.weights.a![7]).toBe(0.8);
    expect(result.weights.a![8]).toBe(0.8);
    expect(result.weights.a![12]).toBe(0);
    expect(result.weights.a![24]).toBe(0);
    expect(result.filledVertices).toBe(2);
  });
});

/** 정사각형 그림을 `cells`칸으로 나눈 격자. 해상도 이름과 무관하게 칸 수를 고정한다. */
function createGridMeshAt(size: number, cells: number) {
  const vertices: number[] = [];
  for (let row = 0; row <= cells; row += 1) {
    for (let col = 0; col <= cells; col += 1) vertices.push((col / cells) * size, (row / cells) * size);
  }
  const indices: number[] = [];
  for (let row = 0; row < cells; row += 1) {
    for (let col = 0; col < cells; col += 1) {
      const tl = row * (cells + 1) + col;
      indices.push(tl, tl + 1, tl + cells + 1, tl + 1, tl + cells + 2, tl + cells + 1);
    }
  }
  return {
    resolution: "low" as const,
    cols: cells,
    rows: cells,
    vertices,
    indices,
    weights: Array.from({ length: vertices.length / 2 }, () => ({ boneIds: [], weights: [] })),
  };
}
