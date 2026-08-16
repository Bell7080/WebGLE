/**
 * 그림과 관절을 통째로 뒤집기.
 *
 * 애니메이션의 `mirror`와 다른 일이다. 그쪽은 재생할 때 방향만 돌리고,
 * 이쪽은 데이터를 실제로 옮겨 파일에 그대로 남는다.
 * 여기서 지킬 것은 하나 — 두 번 뒤집으면 처음으로 돌아온다.
 */
import { describe, expect, it } from "vitest";
import { createEmptyProject, type PuppetBone, type PuppetProject } from "../src/core/format";
import { createGridMesh } from "../src/core/mesh";
import { flipBones, flipChannel, flipMesh, flipProject, flipWeights } from "../src/editor/tools/flip";

function bone(id: string, x: number, rotation = 0): PuppetBone {
  return {
    id, name: id, parentId: null, x, y: 40, rotation, scaleX: 1, scaleY: 1,
    tags: [], motionStrength: 1, deform: "soft", color: "#ffffff",
  };
}

function project(): PuppetProject {
  const base = createEmptyProject();
  return {
    ...base,
    character: { ...base.character, width: 100, height: 100 },
    mesh: createGridMesh(100, 100, "low"),
    bones: [bone("a", 20, 0.3), bone("b", 80, -0.5)],
  };
}

describe("관절 뒤집기", () => {
  it("가로 위치가 반대편으로 간다", () => {
    const flipped = flipBones([bone("a", 20), bone("b", 80)], 100);
    expect(flipped.map((b) => b.x)).toEqual([80, 20]);
  });

  it("회전 방향도 뒤집힌다", () => {
    expect(flipBones([bone("a", 20, 0.3)], 100)[0]!.rotation).toBeCloseTo(-0.3);
  });

  it("세로와 크기는 건드리지 않는다", () => {
    const [flipped] = flipBones([bone("a", 20)], 100);
    expect(flipped!.y).toBe(40);
    expect(flipped!.scaleX).toBe(1);
  });

  it("두 번 뒤집으면 처음으로 돌아온다", () => {
    const start = [bone("a", 20, 0.3), bone("b", 80, -0.5)];
    expect(flipBones(flipBones(start, 100), 100)).toEqual(start);
  });
});

describe("칠한 영역 뒤집기", () => {
  it("줄마다 순서가 뒤집힌다", () => {
    // 2×1 격자 → 한 줄에 점 3개, 두 줄.
    const channel = [1, 2, 3, 4, 5, 6];
    expect(flipChannel(channel, 2, 1)).toEqual([3, 2, 1, 6, 5, 4]);
  });

  it("두 번 뒤집으면 그대로다", () => {
    const channel = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
    expect(flipChannel(flipChannel(channel, 2, 1), 2, 1)).toEqual(channel);
  });

  it("관절마다의 채널을 전부 옮긴다", () => {
    const mesh = createGridMesh(100, 100, "low");
    const count = (mesh.cols + 1) * (mesh.rows + 1);
    const weights = {
      left: Array.from({ length: count }, (_v, i) => (i % (mesh.cols + 1) === 0 ? 1 : 0)),
    };
    const flipped = flipWeights(weights, mesh);
    // 맨 왼쪽 줄에 있던 값이 맨 오른쪽으로 갔다.
    expect(flipped.left![0]).toBe(0);
    expect(flipped.left![mesh.cols]).toBe(1);
  });
});

describe("프로젝트 통째로", () => {
  it("관절과 Mesh가 함께 간다", () => {
    const flipped = flipProject(project());
    expect(flipped.bones.map((b) => b.x)).toEqual([80, 20]);
    expect(flipped.mesh!.weights).toHaveLength(project().mesh!.weights.length);
  });

  it("두 번 뒤집으면 처음으로 돌아온다", () => {
    const start = project();
    const twice = flipProject(flipProject(start));
    expect(twice.bones).toEqual(start.bones);
  });

  it("포맷에 아무 표시도 남지 않는다 — 게임 쪽에서 알 것이 없다", () => {
    const flipped = flipProject(project());
    expect(Object.keys(flipped.character)).toEqual(Object.keys(project().character));
    expect(flipped.version).toBe(project().version);
  });

  it("Mesh 가중치도 좌우가 바뀐다", () => {
    const base = project();
    const mesh = base.mesh!;
    const stride = mesh.cols + 1;
    mesh.weights[0] = { boneIds: ["a"], weights: [1] };

    const flipped = flipMesh(mesh);
    expect(flipped.weights[0]!.boneIds).toEqual([]);
    expect(flipped.weights[stride - 1]!.boneIds).toEqual(["a"]);
  });
});
