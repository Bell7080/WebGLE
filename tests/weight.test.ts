import { describe, expect, it } from "vitest";
import { createGridMesh, vertexCount } from "../src/core/mesh";
import {
  applyInfluence,
  influenceAt,
  MAX_BONES_PER_VERTEX,
  normalizeWeights,
  paintInfluence,
  removeBoneWeights,
  resampleWeights,
  toWeightMap,
  type Influence,
} from "../src/core/weight";
import { applyStroke, beginStroke, extendStroke } from "../src/core/weight/stroke";

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

describe("클리핑 마스크", () => {
  const mesh = createGridMesh(100, 100, "low");

  /** 왼쪽 절반만 이미지가 있는 상황. */
  const leftHalf = Array.from({ length: mesh.vertices.length / 2 }, (_unused, i) => {
    const x = mesh.vertices[i * 2] ?? 0;
    return x <= 50;
  });

  it("마스크 밖 정점은 칠해지지 않는다", () => {
    const map = paintInfluence({}, "b1", mesh, circle(50, 50, 60, 1, 0), false, leftHalf);
    const channel = map["b1"]!;

    for (let i = 0; i < channel.length; i += 1) {
      if (!leftHalf[i]) expect(channel[i]).toBe(0);
    }
    expect(Math.max(...channel)).toBeCloseTo(1);
  });

  it("영역 지정도 마스크를 지킨다", () => {
    const map = applyInfluence({}, "b1", mesh, circle(50, 50, 60), leftHalf);
    const painted = map["b1"]!.filter((value) => value > 0).length;
    expect(painted).toBeGreaterThan(0);
    expect(painted).toBeLessThanOrEqual(leftHalf.filter(Boolean).length);
  });
});

describe("격자 해상도 변경", () => {
  const coarse = createGridMesh(100, 100, "low");
  const fine = createGridMesh(100, 100, "high");

  it("칠한 영역이 새 격자로 옮겨진다", () => {
    const map = applyInfluence({}, "몸통", coarse, circle(50, 50, 40, 1, 0));
    const moved = resampleWeights(coarse, fine, map);

    expect(moved["몸통"]).toHaveLength(vertexCount(fine));
    expect(Math.max(...moved["몸통"]!)).toBeGreaterThan(0.9);
  });

  it("칠하지 않은 바깥쪽은 그대로 비어 있다", () => {
    const map = applyInfluence({}, "몸통", coarse, circle(50, 50, 20, 1, 0));
    const moved = resampleWeights(coarse, fine, map);

    // 왼쪽 위 모서리는 원에서 멀리 떨어져 있다.
    expect(moved["몸통"]![0]).toBeCloseTo(0);
  });

  it("여러 관절의 채널을 모두 옮긴다", () => {
    let map = applyInfluence({}, "a", coarse, circle(30, 30, 25));
    map = applyInfluence(map, "b", coarse, circle(70, 70, 25));

    const moved = resampleWeights(coarse, fine, map);
    expect(Object.keys(moved).sort()).toEqual(["a", "b"]);
  });

  it("성긴 격자로 줄여도 대략의 모양이 남는다", () => {
    const map = applyInfluence({}, "몸통", fine, circle(50, 50, 40, 1, 0));
    const moved = resampleWeights(fine, coarse, map);
    expect(Math.max(...moved["몸통"]!)).toBeGreaterThan(0.9);
  });
});

describe("한 획으로 칠하기", () => {
  const mesh = createGridMesh(100, 100, "low");

  it("같은 자리를 여러 번 훑어도 한 겹만 얹힌다", () => {
    // 천천히 그으면 그 부분만 진해지던 것. 획은 속도와 상관없이 고른 한 겹이어야 한다.
    const brush = { radius: 30, strength: 0.4, softness: 0.7 };
    const stroke = beginStroke({}, "a", mesh);
    for (let i = 0; i < 10; i += 1) extendStroke(stroke, mesh, brush, 50, 50);

    const once = beginStroke({}, "a", mesh);
    extendStroke(once, mesh, brush, 50, 50);

    expect(applyStroke({}, stroke).a).toEqual(applyStroke({}, once).a);
  });

  it("손을 뗐다 다시 그으면 그때 한 겹이 더 쌓인다", () => {
    const brush = { radius: 30, strength: 0.4, softness: 0.7 };
    const first = beginStroke({}, "a", mesh);
    extendStroke(first, mesh, brush, 50, 50);
    const after1 = applyStroke({}, first);

    const second = beginStroke(after1, "a", mesh);
    extendStroke(second, mesh, brush, 50, 50);
    const after2 = applyStroke(after1, second);

    const peak = (map: Record<string, number[]>) => Math.max(...map.a!);
    expect(peak(after2)).toBeGreaterThan(peak(after1));
  });

  it("두 점을 이으면 그 사이도 칠해진다 — 빠르게 그어도 끊기지 않는다", () => {
    const brush = { radius: 12, strength: 1, softness: 0.7 };
    const stroke = beginStroke({}, "a", mesh);
    extendStroke(stroke, mesh, brush, 20, 50);
    // 브러시 지름보다 훨씬 멀리 건너뛴다. 점을 찍는 방식이면 사이가 비어 버린다.
    extendStroke(stroke, mesh, brush, 80, 50);
    const channel = applyStroke({}, stroke).a!;

    // 두 점 한가운데(50, 50)에 가까운 정점이 칠해져 있어야 한다.
    const middle = channel.findIndex((_v, index) => {
      const x = mesh.vertices[index * 2] ?? 0;
      const y = mesh.vertices[index * 2 + 1] ?? 0;
      return Math.abs(x - 50) < 3 && Math.abs(y - 50) < 3;
    });
    expect(middle).toBeGreaterThanOrEqual(0);
    expect(channel[middle]!).toBeGreaterThan(0.5);
  });

  it("지우개는 같은 방식으로 깎아 낸다", () => {
    const brush = { radius: 30, strength: 0.5, softness: 0.7 };
    const full = { a: new Array<number>(vertexCount(mesh)).fill(1) };
    const stroke = beginStroke(full, "a", mesh);
    for (let i = 0; i < 6; i += 1) extendStroke(stroke, mesh, brush, 50, 50);

    const erased = applyStroke(full, stroke, true).a!;
    expect(Math.min(...erased)).toBeCloseTo(0.5, 5);
    expect(Math.max(...erased)).toBe(1);
  });

  it("마스크 밖은 건드리지 않는다", () => {
    const count = vertexCount(mesh);
    const mask = Array.from({ length: count }, (_v, i) => i < count / 2);
    const stroke = beginStroke({}, "a", mesh);
    extendStroke(stroke, mesh, { radius: 200, strength: 1, softness: 0 }, 50, 50, mask);

    const channel = applyStroke({}, stroke).a!;
    expect(channel[0]).toBeGreaterThan(0);
    expect(channel[count - 1]).toBe(0);
  });
});
