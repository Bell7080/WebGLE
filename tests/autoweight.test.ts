/**
 * 자동 가중치.
 *
 * 여기서 지켜야 할 것은 두 가지다.
 * 하나, 관절만 놓으면 정말로 칠해진다 — 손으로 칠하지 않아도 그림이 움직인다.
 * 둘, 손으로 칠한 관절은 자동 계산이 절대 건드리지 않는다.
 */
import { describe, expect, it } from "vitest";
import type { PuppetBone } from "../src/core/format";
import { createGridMesh, vertexCount } from "../src/core/mesh";
import { normalizeWeights, unweightedCount } from "../src/core/weight";
import {
  autoManagedBones,
  autoWeights,
  boneSegments,
  cleanupWeights,
  fillUnweighted,
  withAutoWeights,
} from "../src/core/weight/auto";

function bone(id: string, x: number, y: number, parentId: string | null = null): PuppetBone {
  return {
    id, name: id, parentId, x, y, rotation: 0, scaleX: 1, scaleY: 1,
    tags: [], motionStrength: 1, deform: "soft", color: "#ffffff", autoWeight: true,
  };
}

const mesh = createGridMesh(100, 100, "low");

describe("자동 가중치", () => {
  it("관절만 놓으면 모든 정점이 칠해진다", () => {
    const bones = [bone("a", 20, 50), bone("b", 80, 50)];
    const weights = autoWeights(bones, mesh);
    const normalized = normalizeWeights(weights, vertexCount(mesh));

    // 이것이 "칠하지 않고 재생하면 아무것도 안 움직인다"를 막는 조건이다.
    expect(unweightedCount(normalized)).toBe(0);
  });

  it("정점마다 합이 1이다 — 보이는 값과 실제 적용될 값이 같다", () => {
    const bones = [bone("a", 20, 50), bone("b", 80, 50), bone("c", 50, 10)];
    const weights = autoWeights(bones, mesh);

    for (let i = 0; i < vertexCount(mesh); i += 1) {
      const total = Object.values(weights).reduce((sum, channel) => sum + (channel[i] ?? 0), 0);
      expect(total).toBeCloseTo(1, 6);
    }
  });

  it("가까운 관절이 더 많이 가져간다", () => {
    const bones = [bone("left", 10, 50), bone("right", 90, 50)];
    const weights = autoWeights(bones, mesh);

    // 왼쪽 끝 정점(0, 0)은 왼쪽 관절 것이어야 한다.
    expect(weights.left![0]!).toBeGreaterThan(weights.right![0]!);

    // 오른쪽 끝 정점.
    const last = vertexCount(mesh) - 1;
    expect(weights.right![last]!).toBeGreaterThan(weights.left![last]!);
  });

  it("부모가 있으면 부모까지의 선분 전체를 맡는다", () => {
    // 어깨(0,50) → 팔꿈치(90,50). 팔은 두 점 사이의 막대이지 점이 아니다.
    const bones = [bone("shoulder", 0, 50), bone("elbow", 90, 50, "shoulder")];
    const segments = boneSegments(bones);
    expect(segments[1]).toMatchObject({ boneId: "elbow", x1: 0, y1: 50, x2: 90, y2: 50 });

    // 선분 한가운데(45, 50) 부근은 팔꿈치 쪽이 더 크다 — 어깨는 점 하나뿐이므로.
    const weights = autoWeights(bones, mesh);
    const middle = weights.elbow!.findIndex((_value, index) => {
      const x = mesh.vertices[index * 2] ?? 0;
      const y = mesh.vertices[index * 2 + 1] ?? 0;
      return Math.abs(x - 45) < 6 && Math.abs(y - 50) < 6;
    });
    expect(middle).toBeGreaterThanOrEqual(0);
    expect(weights.elbow![middle]!).toBeGreaterThan(weights.shoulder![middle]!);
  });

  it("마스크 밖은 칠하지 않는다", () => {
    const count = vertexCount(mesh);
    // 앞쪽 절반만 그림이 있다고 본다.
    const mask = Array.from({ length: count }, (_unused, index) => index < count / 2);
    const weights = autoWeights([bone("a", 50, 50)], mesh, { mask });

    expect(weights.a![0]).toBeGreaterThan(0);
    expect(weights.a![count - 1]).toBe(0);
  });
});

describe("전체 채우기와 정리", () => {
  it("이미 칠한 값은 지키면서 실루엣 안의 빈 정점을 모두 채운다", () => {
    const bones = [bone("left", 10, 50), bone("right", 90, 50)];
    const count = vertexCount(mesh);
    const painted = { left: new Array<number>(count).fill(0) };
    painted.left[0] = 0.42;

    const filled = fillUnweighted(painted, bones, mesh);

    expect(filled.left![0]).toBe(0.42);
    expect(unweightedCount(normalizeWeights(filled, count))).toBe(0);
  });

  it("한 점짜리 오점을 제거하고 그 자리를 가까운 관절 값으로 메운다", () => {
    const bones = [bone("left", 0, 50), bone("speck", 100, 50)];
    const count = vertexCount(mesh);
    const weights = autoWeights(bones, mesh);
    // 왼쪽 모서리에 다른 관절이 한 점만 침범한 상황을 만든다.
    weights.speck = new Array<number>(count).fill(0);
    weights.speck[0] = 0.8;
    weights.left![0] = 0;

    const cleaned = cleanupWeights(weights, bones, mesh);

    expect(cleaned.speck![0]).toBeLessThan(cleaned.left![0]!);
    expect(unweightedCount(normalizeWeights(cleaned, count))).toBe(0);
  });
});

describe("직접 칠한 관절 지키기", () => {
  it("only에 없는 관절의 채널은 그대로 남는다", () => {
    const bones = [bone("auto", 20, 50), { ...bone("hand", 80, 50), autoWeight: false }];
    const painted = { hand: new Array<number>(vertexCount(mesh)).fill(0.5) };

    const next = withAutoWeights(painted, bones, mesh, { only: new Set(["auto"]) });

    expect(next.hand).toEqual(painted.hand);
    expect(next.auto).toBeDefined();
  });

  it("직접 칠한 관절도 계산에는 들어간다 — 자동 관절이 1을 독차지하지 않는다", () => {
    const bones = [bone("auto", 20, 50), { ...bone("hand", 22, 50), autoWeight: false }];
    const only = new Set(["auto"]);
    const weights = autoWeights(bones, mesh, { only });

    // hand 채널은 결과에 없지만, 바로 옆에 있으므로 auto의 몫을 절반 가까이 가져갔어야 한다.
    expect(Object.keys(weights)).toEqual(["auto"]);
    const nearBoth = weights.auto!.reduce((max, value) => Math.max(max, value), 0);
    expect(nearBoth).toBeLessThan(0.95);
  });

  it("autoWeight가 없는 예전 파일의 관절은 자동에 맡기지 않는다", () => {
    const legacy = { ...bone("old", 10, 10) };
    delete legacy.autoWeight;

    expect(autoManagedBones([legacy])).toEqual(new Set());
    expect(autoManagedBones([bone("new", 10, 10)])).toEqual(new Set(["new"]));
  });
});
