import { describe, expect, it } from "vitest";
import {
  createBone,
  createEmptyProject,
  PART_NAMES,
  generateBoneColor,
  suggestTags,
  TAG_CATALOG,
  TAG_DESCRIPTIONS,
  TAG_GROUPS,
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
    const root = createBone("몸통", 0, 0, []);
    expect(createBone("꼬리", 10, 20, [root]).tags).toContain("secondary");
    // 추천 태그가 없는 파츠는 비어 있다 (root가 이미 있는 상태 기준).
    expect(createBone("기타", 0, 0, [root]).tags).toEqual([]);
  });

  it("motionStrength 기본값은 1이다", () => {
    expect(createBone("몸통", 0, 0, []).motionStrength).toBe(1);
  });

  it("새 관절은 움직이며 부드럽게 변형되는 모드다", () => {
    expect(createBone("몸통", 0, 0, []).deform).toBe("soft");
  });
});

describe("프로젝트 직렬화", () => {
  it("저장 후 다시 읽으면 동일하다", () => {
    const project = createEmptyProject({ name: "언데드 늑대", width: 512, height: 512 });
    project.bones.push(createBone("몸통", 256, 300, project.bones));

    const restored = parseProject(JSON.parse(serializeProject(project)));
    expect(restored).toEqual(project);
  });

  it("애니메이션의 관절별 변형 덮어쓰기도 그대로 남는다", () => {
    const project = createEmptyProject({ name: "사람", width: 256, height: 256 });
    const 발 = createBone("발", 100, 240, project.bones);
    project.bones.push(발);
    project.animations["idle"] = {
      name: "idle",
      duration: 1,
      loop: true,
      tracks: [],
      deform: { [발.id]: "pinnedSoft" },
    };

    const restored = parseProject(JSON.parse(serializeProject(project)));
    expect(restored.animations["idle"]?.deform).toEqual({ [발.id]: "pinnedSoft" });
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

  it.each(["soft", "rigid", "pinnedSoft", "fixed"] as const)(
    "v3의 %s 변형 모드를 저장하고 다시 읽는다",
    (deform) => {
      const project = createEmptyProject();
      project.bones.push({ ...createBone("기타", 0, 0, []), deform });

      expect(parseProject(JSON.parse(serializeProject(project))).bones[0]!.deform).toBe(deform);
    },
  );
});

describe("태그 목록", () => {
  it("id가 중복되지 않는다", () => {
    const ids = TAG_CATALOG.map((tag) => tag.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("모든 태그에 설명이 있다", () => {
    for (const tag of TAG_CATALOG) {
      expect(tag.description.length).toBeGreaterThan(5);
      expect(TAG_DESCRIPTIONS[tag.id]).toBe(tag.description);
    }
  });

  it("모든 태그가 실제 묶음에 속한다", () => {
    const groups = new Set(TAG_GROUPS.map((group) => group.id));
    for (const tag of TAG_CATALOG) expect(groups.has(tag.group)).toBe(true);
  });

  it("대기 프리셋이 찾는 태그가 목록에 다 있다", () => {
    for (const id of ["root", "core", "head", "secondary"]) {
      expect(TAG_CATALOG.some((tag) => tag.id === id)).toBe(true);
    }
  });

  it("파츠 추천 태그는 모두 목록 안의 태그다", () => {
    const known = new Set(TAG_CATALOG.map((tag) => tag.id));
    for (const part of PART_NAMES) {
      for (const tag of suggestTags(part, [{ tags: ["root"] } as never])) {
        expect(known.has(tag)).toBe(true);
      }
    }
  });
});

describe("root 태그 자동 배정", () => {
  it("첫 루트 관절에는 root가 붙는다", () => {
    const first = createBone("몸통", 0, 0, []);
    expect(first.tags).toContain("root");
    expect(first.tags).toContain("core");
  });

  it("이미 root가 있으면 더 붙이지 않는다", () => {
    const first = createBone("몸통", 0, 0, []);
    const second = createBone("머리", 0, 0, [first]);
    expect(second.tags).not.toContain("root");
  });

  it("부모가 있는 관절에는 붙지 않는다", () => {
    const child = createBone("머리", 0, 0, [], "어떤부모");
    expect(child.tags).not.toContain("root");
  });
});
