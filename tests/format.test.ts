import { describe, expect, it } from "vitest";
import {
  createBone,
  createEmptyProject,
  generateBoneColor,
  hexToNumber,
  hslToHex,
  nextBoneColor,
  PUPPET_VERSION,
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

describe("관절 색", () => {
  it("관절마다 서로 다른 색이 자동으로 붙는다", () => {
    let bones = [] as ReturnType<typeof createBone>[];
    for (let i = 0; i < 12; i += 1) bones = [...bones, createBone("팔", 0, 0, bones)];
    expect(new Set(bones.map((b) => b.color)).size).toBe(12);
  });

  it("색은 #rrggbb 형식이다", () => {
    expect(createBone("머리", 0, 0, []).color).toMatch(/^#[0-9a-f]{6}$/);
    expect(generateBoneColor(7)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("이미 쓰는 색은 건너뛴다", () => {
    const first = generateBoneColor(0);
    const bone = createBone("머리", 0, 0, []);
    expect(bone.color).toBe(first);
    expect(nextBoneColor([bone])).not.toBe(first);
  });

  it("hsl 변환이 기본 색을 맞게 낸다", () => {
    expect(hslToHex(0, 1, 0.5)).toBe("#ff0000");
    expect(hslToHex(120, 1, 0.5)).toBe("#00ff00");
    expect(hslToHex(240, 1, 0.5)).toBe("#0000ff");
    expect(hexToNumber("#4c8dff")).toBe(0x4c8dff);
  });
});

describe("포맷 마이그레이션", () => {
  it("색이 없는 v1 파일을 열면 색을 채워 준다", () => {
    const v1 = {
      format: "puppetforge",
      version: 1,
      character: { name: "옛 캐릭터", texture: "c.png", width: 10, height: 10 },
      bones: [
        { id: "a", name: "몸통1", parentId: null, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, tags: [], motionStrength: 1, deform: "soft" },
        { id: "b", name: "머리1", parentId: "a", x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, tags: [], motionStrength: 1, deform: "soft" },
      ],
    };

    const project = parseProject(v1);
    expect(project.version).toBe(PUPPET_VERSION);
    expect(project.bones.every((bone) => /^#[0-9a-f]{6}$/.test(bone.color))).toBe(true);
    expect(project.bones[0]!.color).not.toBe(project.bones[1]!.color);
  });

  it("사용자가 정한 색은 그대로 둔다", () => {
    const project = parseProject({
      format: "puppetforge",
      version: 2,
      character: { name: "c", texture: "c.png", width: 1, height: 1 },
      bones: [{ id: "a", name: "몸통1", parentId: null, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, tags: [], motionStrength: 1, deform: "soft", color: "#123456" }],
    });
    expect(project.bones[0]!.color).toBe("#123456");
  });
});
