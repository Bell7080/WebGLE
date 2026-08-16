import { describe, expect, it } from "vitest";
import { createGridMesh, toUV, vertexCount } from "../src/core/mesh";
import {
  DEFAULT_RESOLUTION,
  MESH_GRID,
  MESH_LABELS,
  PIXEL_ART_RESOLUTION,
  type MeshResolution,
} from "../src/core/format";

describe("격자 Mesh 생성", () => {
  it("정사각형 이미지는 해상도만큼 나뉜다", () => {
    const mesh = createGridMesh(512, 512, "normal");
    expect([mesh.cols, mesh.rows]).toEqual([48, 48]);
    expect(vertexCount(mesh)).toBe(49 * 49);
  });

  it("긴 이미지는 셀이 정사각형에 가깝게 유지된다", () => {
    const mesh = createGridMesh(200, 400, "low");
    expect(mesh.rows).toBe(24);
    expect(mesh.cols).toBe(12);
  });

  it("삼각형 인덱스는 셀당 2개다", () => {
    const mesh = createGridMesh(64, 64, "low");
    expect(mesh.indices.length).toBe(mesh.cols * mesh.rows * 6);
  });

  it("모서리 정점은 이미지 경계에 놓인다", () => {
    const mesh = createGridMesh(100, 60, "low");
    expect(mesh.vertices.slice(0, 2)).toEqual([0, 0]);
    expect(mesh.vertices.slice(-2)).toEqual([100, 60]);
  });

  it("UV는 0~1 범위다", () => {
    const mesh = createGridMesh(100, 60, "low");
    const uv = toUV(mesh, 100, 60);
    expect(Math.min(...uv)).toBe(0);
    expect(Math.max(...uv)).toBe(1);
  });

  it("가중치는 정점 수만큼 비어 있는 상태로 시작한다", () => {
    const mesh = createGridMesh(64, 64, "low");
    expect(mesh.weights).toHaveLength(vertexCount(mesh));
    expect(mesh.weights.every((w) => w.boneIds.length === 0)).toBe(true);
  });
});

describe("격자 해상도", () => {
  it("이름마다 칸 수가 있고 촘촘해지는 순서다", () => {
    const steps = (Object.keys(MESH_LABELS) as MeshResolution[]).map((id) => MESH_GRID[id]);
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i]!, `${i}번째`).toBeGreaterThan(steps[i - 1]!);
    }
  });

  it("이름표가 빠짐없이 있다", () => {
    for (const id of Object.keys(MESH_GRID) as MeshResolution[]) {
      expect(MESH_LABELS[id], id).toBeTruthy();
    }
  });

  it("예전 이름의 칸 수는 그대로다", () => {
    // 파일에는 이름만 적히고 격자는 열 때 다시 만들어진다. 여기 값을 바꾸면
    // 예전 파일의 정점 수가 어긋나 칠해 둔 영향 영역이 통째로 날아간다.
    expect(MESH_GRID.low).toBe(24);
    expect(MESH_GRID.normal).toBe(48);
    expect(MESH_GRID.high).toBe(72);
  });

  it("새로 늘린 것이 지금까지 중 가장 촘촘하다", () => {
    expect(MESH_GRID.ultra).toBeGreaterThan(MESH_GRID.high);
  });

  it("기본값은 도트가 아닌 그림에 쓰는 보통이다", () => {
    expect(MESH_LABELS[DEFAULT_RESOLUTION]).toBe("보통");
    expect(MESH_GRID[PIXEL_ART_RESOLUTION]).toBeLessThan(MESH_GRID[DEFAULT_RESOLUTION]);
  });

  it("가장 촘촘한 격자도 정점 수가 감당할 만하다", () => {
    // 정사각형 기준 최악. 자동 가중치가 정점마다 모든 관절을 훑으므로 상한을 봐 둔다.
    const mesh = createGridMesh(1024, 1024, "ultra");
    expect(vertexCount(mesh)).toBe((MESH_GRID.ultra + 1) ** 2);
    expect(vertexCount(mesh)).toBeLessThan(12_000);
  });
});
