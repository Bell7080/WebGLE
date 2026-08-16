/**
 * 파일에 적을 때 Mesh를 줄이고, 읽을 때 되살린다. (기획서 38, 47)
 *
 * 격자의 `vertices`와 `indices`는 이미지 크기와 해상도만 알면 똑같이 다시 만들어진다.
 * 사람이 만든 값이 아니라 기계가 계산한 값이므로 파일에 넣을 이유가 없다.
 * 칠하지 않은 정점도 빈 껍데기를 적는 대신 `null` 하나로 접는다.
 *
 * 메모리 안의 `PuppetMesh`는 그대로 둔다. 파일에 오갈 때만 모양이 달라진다.
 */
import { createGridMesh } from "../mesh";
import type { PuppetMesh, VertexWeight } from "./types";

/** 파일에 적히는 Mesh. 격자는 없고, 칠하지 않은 정점은 null이다. */
export interface CompactMesh {
  resolution: PuppetMesh["resolution"];
  cols: number;
  rows: number;
  /** 정점 순서대로. null은 아무도 칠하지 않은 정점이다. */
  weights: (VertexWeight | null)[];
}

/** 파일에 적을 모양으로 줄인다. */
export function compactMesh(mesh: PuppetMesh): CompactMesh {
  return {
    resolution: mesh.resolution,
    cols: mesh.cols,
    rows: mesh.rows,
    weights: mesh.weights.map((weight) => (weight.boneIds.length > 0 ? weight : null)),
  };
}

/**
 * 줄여 둔 Mesh를 되살린다.
 *
 * 격자는 이미지 크기로 다시 만들고, 가중치만 얹는다.
 * 이미지 크기가 달라져 정점 수가 맞지 않으면 가중치를 버리고 빈 격자를 준다.
 * 억지로 끼워 맞춰 엉뚱한 곳이 휘는 것보다 낫다.
 */
export function expandMesh(mesh: CompactMesh, width: number, height: number): PuppetMesh {
  const grid = createGridMesh(width, height, mesh.resolution);
  const count = grid.vertices.length / 2;
  if (mesh.weights.length !== count) return grid;

  return {
    ...grid,
    weights: mesh.weights.map((weight) => weight ?? { boneIds: [], weights: [] }),
  };
}

/** 파일에서 읽은 Mesh가 줄여 둔 모양인지. 격자가 없으면 그렇다. */
export function isCompactMesh(mesh: unknown): mesh is CompactMesh {
  return (
    typeof mesh === "object" &&
    mesh !== null &&
    !Array.isArray((mesh as { vertices?: unknown }).vertices)
  );
}
