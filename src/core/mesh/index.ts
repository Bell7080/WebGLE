import { MESH_GRID } from "../format/constants";
import type { MeshResolution, PuppetMesh } from "../format/types";

/**
 * 원본 이미지를 격자 Mesh로 만든다. (기획서 15)
 * 목표는 고품질 Live2D가 아니라 "자연스럽게 휘는 정도"다.
 */
export function createGridMesh(
  width: number,
  height: number,
  resolution: MeshResolution = "normal",
): PuppetMesh {
  const target = MESH_GRID[resolution];

  // 정사각형에 가까운 셀이 되도록 긴 변에 셀 수를 맞춘다.
  const longSide = Math.max(width, height) || 1;
  const cellSize = longSide / target;
  const cols = Math.max(1, Math.round(width / cellSize));
  const rows = Math.max(1, Math.round(height / cellSize));

  const vertices: number[] = [];
  for (let row = 0; row <= rows; row += 1) {
    for (let col = 0; col <= cols; col += 1) {
      vertices.push((col / cols) * width, (row / rows) * height);
    }
  }

  const indices: number[] = [];
  const indexAt = (col: number, row: number) => row * (cols + 1) + col;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const topLeft = indexAt(col, row);
      const topRight = indexAt(col + 1, row);
      const bottomLeft = indexAt(col, row + 1);
      const bottomRight = indexAt(col + 1, row + 1);
      indices.push(topLeft, topRight, bottomLeft);
      indices.push(topRight, bottomRight, bottomLeft);
    }
  }

  return {
    resolution,
    cols,
    rows,
    vertices,
    indices,
    // Weight는 Phase 5에서 채운다. 비어 있으면 변형 없이 원본 그대로 그린다.
    weights: Array.from({ length: vertices.length / 2 }, () => ({ boneIds: [], weights: [] })),
  };
}

/** 정점 개수. */
export function vertexCount(mesh: PuppetMesh): number {
  return mesh.vertices.length / 2;
}

/** i번째 정점의 원본(변형 전) 좌표. */
export function vertexAt(mesh: PuppetMesh, index: number): { x: number; y: number } {
  return { x: mesh.vertices[index * 2] ?? 0, y: mesh.vertices[index * 2 + 1] ?? 0 };
}

/**
 * 텍스처 좌표(0~1)로 변환한다. Phaser Mesh에 그대로 넘긴다.
 * y는 이미지 좌표계와 같은 방향(위 → 아래)으로 둔다.
 */
export function toUV(mesh: PuppetMesh, width: number, height: number): number[] {
  const uv: number[] = [];
  for (let i = 0; i < mesh.vertices.length; i += 2) {
    uv.push((mesh.vertices[i] ?? 0) / (width || 1), (mesh.vertices[i + 1] ?? 0) / (height || 1));
  }
  return uv;
}

/** 안티앨리어싱으로 거의 투명해진 픽셀도 남지 않도록 알파가 하나라도 있으면 그림으로 본다. */
export const MESH_ALPHA_THRESHOLD = 1;

/** 선형 필터가 이웃 픽셀을 섞어 오는 폭과 아주 얇은 반투명 외곽을 위한 여유(px). */
export const MESH_ALPHA_PADDING = 2;

/**
 * 알파 채널로 "그림이 걸친 셀"을 찾는다.
 *
 * 셀 안에 픽셀이 하나라도 그려져 있으면 그 셀의 꼭짓점 네 개가 모두 변형을 따라가야
 * 한다. 꼭짓점 하나라도 제자리에 남으면 그 셀의 그림이 늘어나 찢어져 보인다.
 * `padding`은 선형 필터가 이웃 픽셀을 섞어 오는 폭과 아주 얇은 반투명 외곽을 위한 여유다.
 *
 * 결과는 셀 순서(`row * cols + col`)의 0/1 배열이다.
 */
export function alphaCellCoverage(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
  mesh: Pick<PuppetMesh, "cols" | "rows">,
  threshold = MESH_ALPHA_THRESHOLD,
  padding = MESH_ALPHA_PADDING,
): Uint8Array {
  const { cols, rows } = mesh;
  const cells = new Uint8Array(cols * rows);
  if (width <= 0 || height <= 0) return cells;

  const scaleX = cols / width;
  const scaleY = rows / height;
  // 픽셀 x는 [x, x+1) 범위다. 여유를 더한 범위가 닿는 셀을 모두 표시한다.
  const colFrom = (x: number) => Math.max(0, Math.floor((x - padding) * scaleX));
  const colTo = (x: number) => Math.min(cols - 1, Math.ceil((x + 1 + padding) * scaleX) - 1);
  const rowFrom = (y: number) => Math.max(0, Math.floor((y - padding) * scaleY));
  const rowTo = (y: number) => Math.min(rows - 1, Math.ceil((y + 1 + padding) * scaleY) - 1);

  for (let y = 0; y < height; y += 1) {
    const r0 = rowFrom(y);
    const r1 = rowTo(y);
    let x = 0;
    while (x < width) {
      if ((alpha[y * width + x] ?? 0) < threshold) {
        x += 1;
        continue;
      }
      // 같은 줄의 연속된 불투명 구간은 한 번에 표시한다. 큰 일러스트에서도 픽셀 수에 비례한다.
      const start = x;
      while (x < width && (alpha[y * width + x] ?? 0) >= threshold) x += 1;
      const c0 = colFrom(start);
      const c1 = colTo(x - 1);
      for (let row = r0; row <= r1; row += 1) cells.fill(1, row * cols + c0, row * cols + c1 + 1);
    }
  }
  return cells;
}

/** 그림이 걸친 셀의 꼭짓점을 모두 고른다. 이 정점들이 칠하기·자동 가중치의 대상이다. */
export function vertexMaskFromCells(
  mesh: Pick<PuppetMesh, "cols" | "rows">,
  cells: ArrayLike<number>,
): boolean[] {
  const { cols, rows } = mesh;
  const mask = new Array<boolean>((cols + 1) * (rows + 1)).fill(false);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!cells[row * cols + col]) continue;
      const top = row * (cols + 1) + col;
      const bottom = top + cols + 1;
      mask[top] = true;
      mask[top + 1] = true;
      mask[bottom] = true;
      mask[bottom + 1] = true;
    }
  }
  return mask;
}

/**
 * 실제로 그릴 삼각형 인덱스만 남긴다.
 *
 * 투명한 셀은 그려도 아무것도 보이지 않지만 Phaser는 삼각형 정점마다 객체를 만들고 매 프레임
 * 옮긴다. 꼭짓점 네 개가 모두 마스크 안에 있는 셀만 그리면 그림이 걸친 셀은 빠짐없이 남는다.
 * 정점 배열과 순서는 그대로라 파일 · 가중치와 무관하다.
 */
export function visibleIndices(mesh: PuppetMesh, mask: readonly boolean[] | null | undefined): number[] {
  if (!mask || mask.length !== vertexCount(mesh)) return mesh.indices;
  const { cols, rows } = mesh;
  if (mesh.indices.length !== cols * rows * 6) return mesh.indices;

  const result: number[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const top = row * (cols + 1) + col;
      const bottom = top + cols + 1;
      if (!mask[top] || !mask[top + 1] || !mask[bottom] || !mask[bottom + 1]) continue;
      const start = (row * cols + col) * 6;
      for (let k = 0; k < 6; k += 1) result.push(mesh.indices[start + k]!);
    }
  }
  return result;
}

/** 알파 채널에서 곧바로 정점 마스크를 만든다. 편집기와 게임 런타임이 같은 판정을 쓴다. */
export function alphaVertexMask(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
  mesh: Pick<PuppetMesh, "cols" | "rows">,
): boolean[] {
  return vertexMaskFromCells(mesh, alphaCellCoverage(alpha, width, height, mesh));
}
