import { describe, expect, it } from "vitest";
import { createGridMesh, vertexCount } from "../src/core/mesh";
import {
  applyInfluence,
  influenceAt,
  MAX_BONES_PER_VERTEX,
  normalizeWeights,
  paintInfluence,
  removeBoneWeights,
  toWeightMap,
  type Influence,
} from "../src/core/weight";

const circle = (x: number, y: number, radius: number, strength = 1, softness = 0.5): Influence => ({
  x1: x,
  y1: y,
  x2: x,
  y2: y,
  radius,
  strength,
  softness,
});

describe("영향 영역 falloff", () => {
  it("중심이 가장 크고 가장자리는 0이다", () => {
    const shape = circle(0, 0, 10);
    expect(influenceAt(shape, 0, 0)).toBeCloseTo(1);
    expect(influenceAt(shape, 10, 0)).toBe(0);
    expect(influenceAt(shape, 20, 0)).toBe(0);
  });

  it("중심에서 멀어질수록 단조 감소한다", () => {
    const shape = circle(0, 0, 10);
    const samples = [0, 2, 4, 6, 8].map((d) => influenceAt(shape, d, 0));
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]!).toBeLessThan(samples[i - 1]!);
    }
  });

  it("캡슐은 두 점 사이 전체가 중심 취급된다", () => {
    const capsule: Influence = { x1: 0, y1: 0, x2: 50, y2: 0, radius: 10, strength: 1, softness: 0 };
    expect(influenceAt(capsule, 25, 0)).toBeCloseTo(1);
    expect(influenceAt(capsule, 25, 9)).toBeGreaterThan(0);
    expect(influenceAt(capsule, 25, 11)).toBe(0);
  });

  it("강도는 최댓값을 낮춘다", () => {
    expect(influenceAt(circle(0, 0, 10, 0.3), 0, 0)).toBeCloseTo(0.3);
  });
});

describe("브러시 누적", () => {
  const mesh = createGridMesh(100, 100, "low");

  /** 브러시 중심(50, 50)에 놓인 정점의 번호. */
  const centerVertex = (mesh.rows / 2) * (mesh.cols + 1) + mesh.cols / 2;

  it("가중치 0.1로 열 번 칠하면 가득 찬다", () => {
    let map = {};
    for (let i = 0; i < 10; i += 1) {
      map = paintInfluence(map, "b1", mesh, circle(50, 50, 30, 0.1, 0));
    }
    expect(map["b1" as keyof typeof map]![centerVertex]).toBeCloseTo(1, 5);
  });

  it("한 번만 칠하면 중심도 준 만큼만 쌓인다", () => {
    const map = paintInfluence({}, "b1", mesh, circle(50, 50, 30, 0.1, 0));
    expect(map["b1"]![centerVertex]).toBeCloseTo(0.1, 5);
  });

  it("1이면 한 번에 최대가 된다", () => {
    const map = paintInfluence({}, "b1", mesh, circle(50, 50, 30, 1, 0));
    expect(Math.max(...(map["b1"] ?? []))).toBeCloseTo(1);
  });

  it("지우개는 같은 양만큼 깎아낸다", () => {
    let map = paintInfluence({}, "b1", mesh, circle(50, 50, 30, 1, 0));
    map = paintInfluence(map, "b1", mesh, circle(50, 50, 30, 0.5, 0), true);
    expect(Math.max(...(map["b1"] ?? []))).toBeCloseTo(0.5);
  });

  it("0 아래로는 내려가지 않는다", () => {
    const map = paintInfluence({}, "b1", mesh, circle(50, 50, 30, 1, 0), true);
    expect(Math.min(...(map["b1"] ?? []))).toBe(0);
  });
});

describe("가중치 정규화", () => {
  const mesh = createGridMesh(100, 100, "low");

  it("겹친 영역의 합은 1이 된다", () => {
    let map = applyInfluence({}, "몸통", mesh, circle(40, 50, 40));
    map = applyInfluence(map, "팔", mesh, circle(60, 50, 40));

    const weights = normalizeWeights(map, vertexCount(mesh));
    const overlapped = weights.filter((w) => w.boneIds.length > 1);
    expect(overlapped.length).toBeGreaterThan(0);
    for (const vertex of overlapped) {
      expect(vertex.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    }
  });

  it("아무도 칠하지 않은 정점은 비어 있다", () => {
    const map = applyInfluence({}, "머리", mesh, circle(0, 0, 10));
    const weights = normalizeWeights(map, vertexCount(mesh));
    expect(weights.some((w) => w.boneIds.length === 0)).toBe(true);
  });

  it("정점당 Bone 수를 제한한다", () => {
    let map = {};
    for (const id of ["a", "b", "c", "d", "e", "f"]) {
      map = applyInfluence(map, id, mesh, circle(50, 50, 60));
    }
    const weights = normalizeWeights(map, vertexCount(mesh));
    expect(Math.max(...weights.map((w) => w.boneIds.length))).toBe(MAX_BONES_PER_VERTEX);
  });

  it("정규화 결과를 다시 편집 상태로 되돌릴 수 있다", () => {
    const map = applyInfluence({}, "몸통", mesh, circle(50, 50, 40));
    const weights = normalizeWeights(map, vertexCount(mesh));
    const restored = toWeightMap(weights);
    expect(Object.keys(restored)).toEqual(["몸통"]);
    expect(restored["몸통"]).toHaveLength(vertexCount(mesh));
  });

  it("Bone을 지우면 채널도 사라진다", () => {
    const map = applyInfluence({}, "꼬리", mesh, circle(50, 50, 40));
    expect(Object.keys(removeBoneWeights(map, "꼬리"))).toEqual([]);
  });
});
