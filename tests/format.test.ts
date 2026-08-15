import { describe, expect, it } from "vitest";
import {
  createBone,
  createEmptyProject,
  nextPartName,
  parseProject,
  PuppetFormatError,
  serializeProject,
} from "../src/core/format";

describe("이름 자동 번호", () => {
  it("같은 파츠를 추가하면 번호가 올라간다", () => {
    let bones = [] as ReturnType<typeof createBone>[];
    bones = [...bones, createBone("머리", 0, 0, bones)];
    bones = [...bones, createBone("머리", 0, 0, bones)];
    expect(bones.map((b) => b.name)).toEqual(["머리1", "머리2"]);
  });

  it("사용자가 바꾼 이름과 충돌하지 않는다", () => {
    const bones = [createBone("꼬리", 0, 0, [])];
    bones[0]!.name = "꼬리2";
    expect(nextPartName("꼬리", bones)).toBe("꼬리1");
  });
});

describe("Bone 기본값", () => {
  it("파츠에 맞는 태그가 자동으로 붙는다", () => {
    expect(createBone("꼬리", 10, 20, []).tags).toContain("secondary");
    expect(createBone("기타", 0, 0, []).tags).toEqual([]);
  });

  it("motionStrength 기본값은 1이다", () => {
    expect(createBone("몸통", 0, 0, []).motionStrength).toBe(1);
  });
});

describe("프로젝트 직렬화", () => {
  it("저장 후 다시 읽으면 동일하다", () => {
    const project = createEmptyProject({ name: "언데드 늑대", width: 512, height: 512 });
    project.bones.push(createBone("몸통", 256, 300, project.bones));

    const restored = parseProject(JSON.parse(serializeProject(project)));
    expect(restored).toEqual(project);
  });

  it("PuppetForge 파일이 아니면 거부한다", () => {
    expect(() => parseProject({ format: "spine", version: 1 })).toThrow(PuppetFormatError);
  });

  it("더 최신 버전 파일은 거부한다", () => {
    expect(() =>
      parseProject({ format: "puppetforge", version: 99, character: {}, bones: [] }),
    ).toThrow(PuppetFormatError);
  });
});
