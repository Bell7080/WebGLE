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
    "%s 관절은 자기와 부모가 움직여도 기준 위치를 유지한다",
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

  it("Pinned Soft는 기준 위치를 고정해도 애니메이션의 회전 변형은 유지한다", () => {
    const bones = [bone("root", 0, 0), bone("foot", 0, 50, "root", "soft")];
    // idle에서만 위치 고정으로 덮어쓴 상황을 재현해 공용 soft 설정과 무관하게 검사한다.
    const modes = new Map<string, DeformMode>([["foot", "pinnedSoft"]]);
    const skin = computeSkinMatrices(
      bones,
      new Map([
        ["root", delta({ x: 20 })],
        ["foot", delta({ rotation: Math.PI / 2 })],
      ]),
      modes,
    );

    const matrix = skin.get("foot")!;
    const planted = applyPoint(matrix, 0, 50);
    const toe = applyPoint(matrix, 20, 50);
    expect(planted.x).toBeCloseTo(0);
    expect(planted.y).toBeCloseTo(50);
    // 발끝은 고정점 주위로 회전하므로 완전 고정과 달리 원본 좌표에 남지 않는다.
    expect(toe.x).toBeCloseTo(0);
    expect(toe.y).toBeCloseTo(70);
  });

  it("Fixed는 기준 위치뿐 아니라 회전 변형도 계속 차단한다", () => {
    const bones = [bone("root", 0, 0), bone("foot", 0, 50, "root", "fixed")];
    const skin = computeSkinMatrices(
      bones,
      new Map([["foot", delta({ rotation: Math.PI / 2 })]]),
    );

    // 위치 고정과 완전 고정의 차이가 다시 합쳐지지 않도록 발끝 좌표까지 확인한다.
    expect(applyPoint(skin.get("foot")!, 20, 50)).toEqual({ x: 20, y: 50 });
  });

  it("Pinned Soft 가중치가 1이어도 기준점에서 멀어지면 주변 움직임을 받는다", () => {
    const bones = [bone("root", 0, 0), bone("foot", 0, 50, "root", "pinnedSoft")];
    const skin = computeSkinMatrices(bones, new Map([["root", delta({ x: 30 })]]));
    const footMesh: PuppetMesh = {
      resolution: "low",
      cols: 1,
      rows: 1,
      // 시작점과 중간, 외곽 모두 가중치 1인 실제로 넓게 칠한 발 영역을 재현한다.
      vertices: [0, 50, 10, 50, 20, 50],
      indices: [],
      weights: [
        { boneIds: ["foot"], weights: [1] },
        { boneIds: ["foot"], weights: [1] },
        { boneIds: ["foot"], weights: [1] },
      ],
    };

    const result = skinVertices(footMesh, skin, undefined, new Map([["foot", "pinnedSoft"]]));
    // 시작점은 고정되지만 중간은 절반, 가장 먼 외곽은 부모 이동을 전부 받아 형태가 굽는다.
    expect([...result]).toEqual([0, 50, 25, 50, 50, 50]);
  });

  it("애니메이션의 완전 고정 덮어쓰기도 여러 단계 부모의 변환을 모두 차단한다", () => {
    // 몸통 → 윗다리 → 아랫다리 → 발 구조에서 공용 설정이 soft여도 현재 동작의 fixed가 우선한다.
    const bones = [
      bone("body", 0, 0),
      bone("leg1", 0, 20, "body"),
      bone("leg2", 0, 40, "leg1"),
      bone("foot", 0, 60, "leg2"),
    ];
    const modes = new Map<string, DeformMode>([["foot", "fixed"]]);
    const skin = computeSkinMatrices(
      bones,
      new Map([
        ["body", delta({ x: 30 })],
        ["leg1", delta({ rotation: 0.5 })],
        ["leg2", delta({ y: -10 })],
        ["foot", delta({ x: 20 })],
      ]),
      modes,
    );

    expect(applyPoint(skin.get("foot")!, 0, 60)).toEqual({ x: 0, y: 60 });
  });
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

    // 두 번째 정점은 rigid가 주인(0.75)이라 통째로 rigid를 따라간다 — 형태가 유지된다.
    // 첫 번째 정점은 rigid가 살짝 걸친 정도(0.25)라 평소대로 섞인다.
    // 스치기만 한 자리까지 rigid가 가져가면, 그 자리를 대부분 맡은 쪽의 움직임이 사라진다.
    expect([...skinVertices(rigidMesh, matrices, undefined, modes)]).toEqual([-5, 0, 20, 0]);
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

  it("Fixed는 받은 가중치만큼만 붙잡는다", () => {
    // computeSkinMatrices가 고정 계열에 항등 행렬을 주므로, 여기서 따로 막지 않아도
    // 가중치가 그대로 세기가 된다. 100을 받은 자리는 아예 멈추고 50은 절반만 움직인다.
    const fixedMesh: PuppetMesh = {
      resolution: "low",
      cols: 1,
      rows: 1,
      vertices: [0, 0, 0, 0, 0, 0],
      indices: [],
      weights: [
        { boneIds: ["fixed"], weights: [1] },
        { boneIds: ["fixed", "soft"], weights: [0.5, 0.5] },
        { boneIds: ["soft"], weights: [1] },
      ],
    };
    const matrices = new Map([
      // 고정된 관절은 움직이지 않으므로 항등이다.
      ["fixed", compose(0, 0, 0, 1, 1)],
      ["soft", compose(100, 0, 0, 1, 1)],
    ]);
    const modes = new Map<string, DeformMode>([
      ["fixed", "fixed"],
      ["soft", "soft"],
    ]);

    expect([...skinVertices(fixedMesh, matrices, undefined, modes)]).toEqual([0, 0, 50, 0, 100, 0]);
  });

  it("Fixed가 주 영향인 정점은 다른 부모 관절의 잔여 가중치가 있어도 완전히 고정한다", () => {
    const footMesh: PuppetMesh = {
      resolution: "low",
      cols: 1,
      rows: 1,
      vertices: [10, 20],
      indices: [],
      weights: [{ boneIds: ["foot", "leg2"], weights: [0.7, 0.3] }],
    };
    const matrices = new Map([
      ["foot", compose(0, 0, 0, 1, 1)],
      ["leg2", compose(100, 0, 0, 1, 1)],
    ]);
    const modes = new Map<string, DeformMode>([
      ["foot", "fixed"],
      ["leg2", "soft"],
    ]);

    expect([...skinVertices(footMesh, matrices, undefined, modes)]).toEqual([10, 20]);
  });

  it("고정 관절은 부모가 움직여도 제자리에 선다", () => {
    // 실제 경로(computeSkinMatrices)를 지나가는지 확인한다.
    const bones: PuppetBone[] = [
      { id: "root", name: "root", parentId: null, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1,
        tags: [], motionStrength: 1, deform: "soft", color: "#fff" },
      { id: "foot", name: "foot", parentId: "root", x: 0, y: 50, rotation: 0, scaleX: 1, scaleY: 1,
        tags: [], motionStrength: 1, deform: "fixed", color: "#fff" },
    ];
    const skin = computeSkinMatrices(bones, new Map([["root", { x: 40, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }]]));

    expect(applyPoint(skin.get("root")!, 0, 0)).toEqual({ x: 40, y: 0 });
    // 발은 부모가 40px 갔어도 그대로다.
    expect(applyPoint(skin.get("foot")!, 0, 50)).toEqual({ x: 0, y: 50 });
  });
});
