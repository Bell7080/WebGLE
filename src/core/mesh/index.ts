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
