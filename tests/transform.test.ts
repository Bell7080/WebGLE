import { describe, expect, it } from "vitest";
import type { DeformMode, PuppetBone, PuppetMesh } from "../src/core/format";
import { createGridMesh } from "../src/core/mesh";
import { normalizeWeights, applyInfluence } from "../src/core/weight";
import { vertexCount } from "../src/core/mesh";
import {
  applyPoint,
  compose,
  computeSkinMatrices,
  invert,
  multiply,
  skinVertices,
  type BoneDelta,
} from "../src/core/skeleton/transform";

function bone(
  id: string,
  x: number,
  y: number,
  parentId: string | null = null,
  deform: DeformMode = "soft",
): PuppetBone {
  return {
    id,
    name: id,
    parentId,
    x,
    y,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    tags: [],
    motionStrength: 1,
    deform,
    color: "#ffffff",
  };
}

const delta = (patch: Partial<BoneDelta> = {}): BoneDelta => ({
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  ...patch,
});

describe("행렬", () => {
  it("역행렬을 곱하면 항등이 된다", () => {
    const m = compose(30, 40, 0.7, 1.5, 0.8);
    const identity = multiply(m, invert(m));
    expect(identity.a).toBeCloseTo(1);
    expect(identity.d).toBeCloseTo(1);
    expect(identity.tx).toBeCloseTo(0);
    expect(identity.ty).toBeCloseTo(0);
  });

  it("90도 회전은 x축을 y축으로 보낸다", () => {
    const rotated = applyPoint(compose(0, 0, Math.PI / 2, 1, 1), 10, 0);
    expect(rotated.x).toBeCloseTo(0);
    expect(rotated.y).toBeCloseTo(10);
  });
});

describe("스킨 행렬", () => {
  it("움직이지 않으면 항등이다", () => {
    const bones = [bone("root", 0, 0), bone("head", 0, -50, "root")];
    const skin = computeSkinMatrices(bones, new Map());
    for (const matrix of skin.values()) {
      expect(matrix.a).toBeCloseTo(1);
      expect(matrix.tx).toBeCloseTo(0);
      expect(matrix.ty).toBeCloseTo(0);
    }
  });

  it("부모가 움직이면 자식도 같이 움직인다 (기획서 13)", () => {
    const bones = [bone("root", 100, 100), bone("head", 100, 50, "root")];
    const skin = computeSkinMatrices(bones, new Map([["root", delta({ x: 10 })]]));
    const moved = applyPoint(skin.get("head")!, 100, 50);
    expect(moved.x).toBeCloseTo(110);
    expect(moved.y).toBeCloseTo(50);
  });

  it("부모 회전은 자식을 부모 기준으로 돌린다", () => {
    const bones = [bone("root", 0, 0), bone("head", 0, -50, "root")];
    const skin = computeSkinMatrices(bones, new Map([["root", delta({ rotation: Math.PI / 2 })]]));
    const moved = applyPoint(skin.get("head")!, 0, -50);
    expect(moved.x).toBeCloseTo(50);
    expect(moved.y).toBeCloseTo(0);
  });

  it("자식의 회전은 자기 자리에서 일어난다", () => {
    const bones = [bone("root", 0, 0), bone("head", 0, -50, "root")];
    const skin = computeSkinMatrices(bones, new Map([["head", delta({ rotation: Math.PI })]]));
    const pivot = applyPoint(skin.get("head")!, 0, -50);
    expect(pivot.x).toBeCloseTo(0);
    expect(pivot.y).toBeCloseTo(-50);

    const tip = applyPoint(skin.get("head")!, 0, -70);
    expect(tip.y).toBeCloseTo(-30);
  });

  it.each(["pinnedSoft", "fixed"] as const)(
    "%s 관절은 자기와 부모의 애니메이션 변환을 모두 무시한다",
    (deform) => {
      const bones = [bone("root", 0, 0), bone("foot", 0, 50, "root", deform)];
      const skin = computeSkinMatrices(
        bones,
        new Map([
          ["root", delta({ y: -10 })],
          ["foot", delta({ y: 20, rotation: 1 })],
        ]),
      );

      const planted = applyPoint(skin.get("foot")!, 0, 50);
      expect(planted).toEqual({ x: 0, y: 50 });
    },
  );
});

describe("정점 변형", () => {
  const mesh = createGridMesh(100, 100, "low");

  it("가중치가 없으면 정점은 그대로다", () => {
    const bones = [bone("root", 50, 50)];
    const skin = computeSkinMatrices(bones, new Map([["root", delta({ x: 20 })]]));
    const result = skinVertices(mesh, skin);
    // Float32Array라 미세한 반올림 차이는 허용한다.
    result.forEach((value, index) => expect(value).toBeCloseTo(mesh.vertices[index] ?? 0, 3));
  });

  it("칠한 곳만 따라 움직인다", () => {
    const bones = [bone("root", 50, 50)];
    const map = applyInfluence({}, "root", mesh, {
      x1: 50,
      y1: 50,
      x2: 50,
      y2: 50,
      radius: 20,
      strength: 1,
      softness: 0,
    });
    const painted = { ...mesh, weights: normalizeWeights(map, vertexCount(mesh)) };

    const skin = computeSkinMatrices(bones, new Map([["root", delta({ x: 10 })]]));
    const result = skinVertices(painted, skin);

    const centerIndex = painted.weights.findIndex((w) => w.boneIds.length > 0);
    expect(result[centerIndex * 2]).toBeCloseTo((painted.vertices[centerIndex * 2] ?? 0) + 10);

    const outsideIndex = painted.weights.findIndex((w) => w.boneIds.length === 0);
    expect(result[outsideIndex * 2]).toBeCloseTo(painted.vertices[outsideIndex * 2] ?? 0);
  });

  it("Rigid 정점은 다른 Bone과 섞이지 않아 형태를 유지한다", () => {
    // 같은 변환을 받는 두 정점이 같은 거리만큼 이동하는지 작은 Mesh로 직접 확인한다.
    const rigidMesh: PuppetMesh = {
      resolution: "low",
      cols: 1,
      rows: 1,
      vertices: [0, 0, 10, 0],
      indices: [],
      weights: [
        { boneIds: ["rigid", "soft"], weights: [0.25, 0.75] },
        { boneIds: ["rigid", "soft"], weights: [0.75, 0.25] },
      ],
    };
    const matrices = new Map([
      ["rigid", compose(10, 0, 0, 1, 1)],
      ["soft", compose(-10, 0, 0, 1, 1)],
    ]);
    const modes = new Map<string, DeformMode>([
      ["rigid", "rigid"],
      ["soft", "soft"],
    ]);

    expect([...skinVertices(rigidMesh, matrices, undefined, modes)]).toEqual([10, 0, 20, 0]);
  });

  it("Pinned Soft는 자기 위치를 고정하면서 이웃 영향으로는 부드럽게 변형된다", () => {
    const pinnedMesh: PuppetMesh = {
      resolution: "low",
      cols: 1,
      rows: 1,
      vertices: [0, 0],
      indices: [],
      weights: [{ boneIds: ["pin", "soft"], weights: [0.5, 0.5] }],
    };
    const matrices = new Map([
      ["pin", compose(0, 0, 0, 1, 1)],
      ["soft", compose(10, 0, 0, 1, 1)],
    ]);
    const modes = new Map<string, DeformMode>([
      ["pin", "pinnedSoft"],
      ["soft", "soft"],
    ]);

    expect([...skinVertices(pinnedMesh, matrices, undefined, modes)]).toEqual([5, 0]);
  });

  it("Fixed 영향 영역은 겹친 다른 Bone이 움직여도 원래 자리를 지킨다", () => {
    const fixedMesh: PuppetMesh = {
      resolution: "low",
      cols: 1,
      rows: 1,
      vertices: [3, 4],
      indices: [],
      weights: [{ boneIds: ["fixed", "soft"], weights: [0.1, 0.9] }],
    };
    const matrices = new Map([
      ["fixed", compose(100, 0, 0, 1, 1)],
      ["soft", compose(20, 0, 0, 1, 1)],
    ]);
    const modes = new Map<string, DeformMode>([
      ["fixed", "fixed"],
      ["soft", "soft"],
    ]);

    expect([...skinVertices(fixedMesh, matrices, undefined, modes)]).toEqual([3, 4]);
  });
});
