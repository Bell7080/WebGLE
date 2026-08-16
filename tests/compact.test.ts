/**
 * 파일에 적을 때 격자를 빼고, 읽을 때 되살리는 것. (기획서 38, 47)
 *
 * 격자는 이미지 크기와 해상도만 알면 똑같이 다시 만들어지므로 파일에 넣지 않는다.
 * 게임에 넘길 파일이 몬스터마다 수백 KB씩 붙는 것을 막기 위한 것이다.
 */
import { describe, expect, it } from "vitest";
import {
  compactMesh,
  createBone,
  createEmptyProject,
  expandMesh,
  isCompactMesh,
  parseProject,
  serializeProject,
} from "../src/core/format";
import { createGridMesh, vertexCount } from "../src/core/mesh";
import { applyInfluence, normalizeWeights } from "../src/core/weight";

/** 몸통 하나를 칠해 둔 200×260 캐릭터. */
function painted() {
  const project = createEmptyProject({ name: "사람", width: 200, height: 260 });
  const bone = createBone("몸통", 100, 130, project.bones);
  project.bones.push(bone);

  const mesh = createGridMesh(200, 260, "normal");
  const map = applyInfluence({}, bone.id, mesh, {
    x1: 100,
    y1: 130,
    x2: 100,
    y2: 130,
    radius: 60,
    strength: 1,
    softness: 0.5,
  });
  project.mesh = { ...mesh, weights: normalizeWeights(map, vertexCount(mesh)) };
  return project;
}

describe("격자를 파일에서 빼기", () => {
  it("줄인 Mesh에는 격자가 없다", () => {
    const slim = compactMesh(painted().mesh!);
    expect(slim).not.toHaveProperty("vertices");
    expect(slim).not.toHaveProperty("indices");
    expect(slim.cols).toBeGreaterThan(0);
  });

  it("칠하지 않은 정점은 null로 접힌다", () => {
    const slim = compactMesh(painted().mesh!);
    expect(slim.weights.some((w) => w === null)).toBe(true);
    expect(slim.weights.some((w) => w !== null)).toBe(true);
  });

  it("되살리면 격자와 가중치가 원래대로 돌아온다", () => {
    const mesh = painted().mesh!;
    const back = expandMesh(compactMesh(mesh), 200, 260);
    expect(back.vertices).toEqual(mesh.vertices);
    expect(back.indices).toEqual(mesh.indices);
    expect(back.weights).toEqual(mesh.weights);
  });

  it("이미지 크기가 달라 정점 수가 안 맞으면 빈 격자를 준다", () => {
    // 억지로 끼워 맞춰 엉뚱한 곳이 휘는 것보다 낫다.
    const back = expandMesh(compactMesh(painted().mesh!), 64, 64);
    expect(back.weights.every((w) => w.boneIds.length === 0)).toBe(true);
    expect(back.vertices.length).toBeGreaterThan(0);
  });
});

describe("저장 · 불러오기 왕복", () => {
  it("줄여서 적어도 읽으면 원래와 같다", () => {
    const project = painted();
    const restored = parseProject(JSON.parse(serializeProject(project)));
    expect(restored).toEqual(project);
  });

  it("들여쓰기를 빼도 결과는 같다", () => {
    const project = painted();
    const restored = parseProject(JSON.parse(serializeProject(project, false)));
    expect(restored).toEqual(project);
  });

  it("적은 내용에 격자가 들어 있지 않다", () => {
    const text = serializeProject(painted(), false);
    const raw = JSON.parse(text);
    expect(raw.mesh.vertices).toBeUndefined();
    expect(raw.mesh.indices).toBeUndefined();
  });

  it("눈에 띄게 작아진다", () => {
    const project = painted();
    const fat = JSON.stringify(project);
    const slim = serializeProject(project, false);
    // 격자가 내용의 대부분이므로 절반 아래로 떨어져야 한다.
    expect(slim.length).toBeLessThan(fat.length / 2);
  });

  it("Mesh가 없는 프로젝트도 그대로 오간다", () => {
    const project = createEmptyProject({ name: "빈 것", width: 100, height: 100 });
    const restored = parseProject(JSON.parse(serializeProject(project)));
    expect(restored.mesh).toBeNull();
  });
});

describe("예전 파일 읽기", () => {
  it("격자가 들어 있는 파일은 그대로 쓴다", () => {
    // v9까지는 vertices · indices를 파일에 적었다.
    const project = painted();
    const old = JSON.parse(JSON.stringify({ ...project, version: 9 }));
    expect(isCompactMesh(old.mesh)).toBe(false);

    const restored = parseProject(old);
    expect(restored.mesh?.vertices).toEqual(project.mesh?.vertices);
    expect(restored.mesh?.weights).toEqual(project.mesh?.weights);
  });

  it("격자가 있는 파일은 이미지 크기가 이상해도 그 격자를 지킨다", () => {
    const project = painted();
    const old = JSON.parse(JSON.stringify({ ...project, version: 9 }));
    old.character.width = 999;

    // 다시 만들지 않으므로 원래 격자가 남는다.
    expect(parseProject(old).mesh?.vertices).toEqual(project.mesh?.vertices);
  });
});
