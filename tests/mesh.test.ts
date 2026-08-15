import { describe, expect, it } from "vitest";
import { createGridMesh, toUV, vertexCount } from "../src/core/mesh";

describe("격자 Mesh 생성", () => {
  it("정사각형 이미지는 해상도만큼 나뉜다", () => {
    const mesh = createGridMesh(512, 512, "normal");
    expect([mesh.cols, mesh.rows]).toEqual([32, 32]);
    expect(vertexCount(mesh)).toBe(33 * 33);
  });

  it("긴 이미지는 셀이 정사각형에 가깝게 유지된다", () => {
    const mesh = createGridMesh(200, 400, "low");
    expect(mesh.rows).toBe(16);
    expect(mesh.cols).toBe(8);
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
