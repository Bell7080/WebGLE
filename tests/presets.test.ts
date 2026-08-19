import { describe, expect, it } from "vitest";
import {
  createBone,
  createEmptyProject,
  partForNewBone,
  TAG_CATALOG,
  type PuppetBone,
} from "../src/core/format";
import { evaluateAnimation } from "../src/core/animation";
import { findPreset, PRESET_GROUPS, PRESETS } from "../src/presets";
import { forExport } from "../src/editor/tools/projectFile";

function bone(tags: string[]): PuppetBone {
  return {
    id: tags.join("-") || "empty",
    name: tags.join("-") || "empty",
    parentId: null,
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    tags,
    motionStrength: 1,
    deform: "soft",
    color: "#ffffff",
  };
}

describe("애니메이션 프리셋", () => {
  it("모두 이름 · 길이 · 트랙을 갖춘다", () => {
    for (const preset of PRESETS) {
      expect(preset.animation.name).toBe(preset.id);
      expect(preset.animation.duration).toBeGreaterThan(0);
      expect(preset.animation.tracks.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(4);
    }
  });

  it("id가 중복되지 않는다", () => {
    const ids = PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("모든 Track이 태그 목록에 있는 태그만 쓴다", () => {
    const known = new Set(TAG_CATALOG.map((tag) => tag.id));
    for (const preset of PRESETS) {
      for (const track of preset.animation.tracks) {
        if (track.target.kind !== "tag") continue;
        expect(known.has(track.target.tag), `${preset.id}: ${track.target.tag}`).toBe(true);
      }
    }
  });

  it("키프레임 시간이 0부터 duration 사이에서 순서대로 온다", () => {
    for (const preset of PRESETS) {
      for (const track of preset.animation.tracks) {
        let previous = -1;
        for (const key of track.keys) {
          expect(key.time).toBeGreaterThanOrEqual(0);
          expect(key.time).toBeLessThanOrEqual(preset.animation.duration);
          expect(key.time).toBeGreaterThan(previous);
          previous = key.time;
        }
      }
    }
  });

  it("루프 애니메이션은 처음과 끝 값이 같다", () => {
    for (const preset of PRESETS.filter((candidate) => candidate.animation.loop)) {
      for (const track of preset.animation.tracks) {
        const first = track.keys[0];
        const last = track.keys[track.keys.length - 1];
        if (!first || !last) continue;
        expect(last.value, `${preset.id}`).toBeCloseTo(first.value);
      }
    }
  });

  it("모든 프리셋의 시작과 끝은 원본 일러스트 자세다", () => {
    // stagger와 끝 자세 키가 있더라도 동작 전환 접점에는 변형이 남지 않아야 한다.
    const tagged = TAG_CATALOG.map((tag) => bone([tag.id]));
    for (const preset of PRESETS) {
      for (const time of [0, preset.animation.duration]) {
        const deltas = evaluateAnimation(preset.animation, tagged, time);
        for (const delta of deltas.values()) {
          expect(delta.x, `${preset.id} @ ${time}s`).toBeCloseTo(0);
          expect(delta.y, `${preset.id} @ ${time}s`).toBeCloseTo(0);
          expect(delta.rotation, `${preset.id} @ ${time}s`).toBeCloseTo(0);
          expect(delta.scaleX, `${preset.id} @ ${time}s`).toBeCloseTo(1);
          expect(delta.scaleY, `${preset.id} @ ${time}s`).toBeCloseTo(1);
        }
      }
    }
  });

  it("태그가 하나도 없는 캐릭터에서도 오류 없이 지나간다 (기획서 64)", () => {
    const bare = [bone([])];
    for (const preset of PRESETS) {
      expect(() => evaluateAnimation(preset.animation, bare, 0.2)).not.toThrow();
      expect(evaluateAnimation(preset.animation, bare, 0.2).size).toBe(0);
    }
  });

  it("포효는 중심 · 머리만 있어도 움직인다", () => {
    const roar = findPreset("roar")!;
    const deltas = evaluateAnimation(roar.animation, [bone(["core"]), bone(["head"])], 0.6);
    expect(deltas.get("core")!.scaleX).toBeGreaterThan(1);
    expect(deltas.get("head")!.rotation).toBeLessThan(0);
  });

  it("포효에 턱이 있으면 턱도 열린다", () => {
    const roar = findPreset("roar")!;
    const withJaw = evaluateAnimation(roar.animation, [bone(["jaw"])], 0.6);
    expect(withJaw.get("jaw")!.rotation).toBeGreaterThan(0);
  });
});

describe("첫 관절", () => {
  it("관절이 없으면 무엇을 골랐든 중심이 된다", () => {
    expect(partForNewBone("머리", [])).toBe("중심");
    const first = createBone(partForNewBone("머리", []), 0, 0, []);
    expect(first.tags).toEqual(["root", "core", "body"]);
  });

  it("관절이 있으면 고른 파츠를 그대로 쓴다", () => {
    const first = createBone("중심", 0, 0, []);
    expect(partForNewBone("머리", [first])).toBe("머리");
  });
});

describe("내보내기 묶음", () => {
  const project = () => {
    const base = createEmptyProject({ name: "늑대" });
    return {
      ...base,
      animations: {
        idle: { ...findPreset("idle")!.animation },
        roar: { ...findPreset("roar")!.animation },
        attack: { ...findPreset("attack")!.animation, hidden: true },
      },
    };
  };

  it("숨긴 애니메이션은 빠진다", () => {
    expect(Object.keys(forExport(project()).animations)).toEqual(["idle", "roar"]);
  });

  it("원본 프로젝트는 그대로 남는다", () => {
    const original = project();
    forExport(original);
    expect(Object.keys(original.animations)).toEqual(["idle", "roar", "attack"]);
    expect(original.animations["attack"]!.hidden).toBe(true);
  });

  it("내보낸 데이터에는 hidden 표시가 남지 않는다", () => {
    for (const animation of Object.values(forExport(project()).animations)) {
      expect("hidden" in animation).toBe(false);
    }
  });

  it("전부 숨기면 빈 목록이 된다", () => {
    const all = project();
    for (const animation of Object.values(all.animations)) {
      animation.hidden = true;
    }
    expect(Object.keys(forExport(all).animations)).toEqual([]);
  });
});

/** 사람 모양 한 벌. 프리셋이 실제로 무엇을 하는지 재 보기 위한 것이다. */
function humanoid(): PuppetBone[] {
  const make = (id: string, tags: string[], x: number, y: number, parentId: string | null = null) => ({
    ...bone(tags), id, name: id, x, y, parentId,
  });
  return [
    make("root", ["root", "core", "body"], 50, 60),
    make("head", ["head", "neck"], 50, 20, "root"),
    make("arm1", ["arm", "attack", "hand"], 30, 55, "root"),
    make("arm2", ["arm", "attack", "hand"], 70, 55, "root"),
    make("leg1", ["leg", "foot"], 42, 95, "root"),
    make("leg2", ["leg", "foot"], 58, 95, "root"),
    make("tail", ["tail", "secondary"], 50, 80, "root"),
  ];
}

/** 한 동작이 관절을 얼마나 크게 움직이는지. 최댓값만 본다. */
function peak(id: string, prop: "x" | "y" | "rotation", boneId = "root"): number {
  const animation = findPreset(id)!.animation;
  const bones = humanoid();
  let most = 0;
  for (let i = 0; i <= 40; i += 1) {
    const delta = evaluateAnimation(animation, bones, (i / 40) * animation.duration).get(boneId);
    most = Math.max(most, Math.abs(delta?.[prop] ?? 0));
  }
  return most;
}

describe("사망은 찌그러지는 게 아니라 쓰러진다", () => {
  it("몸 전체가 크게 기운다", () => {
    // 이것이 없으면 제자리에서 눌리기만 한다. 60도(1.05rad) 넘게 넘어가야 쓰러져 보인다.
    expect(peak("death", "rotation")).toBeGreaterThan(1.05);
  });

  it("바닥으로 내려간다", () => {
    expect(peak("death", "y")).toBeGreaterThan(25);
  });

  it("무릎이 먼저 꺾인다", () => {
    expect(peak("death", "rotation", "leg1")).toBeGreaterThan(0.2);
  });

  it("찌그러짐은 넘어진 뒤에만 온다", () => {
    const animation = findPreset("death")!.animation;
    const squash = animation.tracks.find(
      (t) => t.target.kind === "tag" && t.target.tag === "core" && t.property === "scaleY",
    )!;
    // 처음 절반 동안은 1을 유지해야 한다. 계속 눌려 있으면 죽는 게 아니라 녹는 것처럼 보인다.
    const early = squash.keys.filter((k) => k.time < animation.duration * 0.5);
    for (const key of early) expect(key.value).toBeCloseTo(1);
  });
});

describe("공격 계열은 서로 다른 동작이다", () => {
  it("공격은 몸이 앞으로 나가고 할퀴기는 제자리다", () => {
    // 둘이 비슷하다는 지적을 받은 부분이다. 몸통 이동량으로 구분한다.
    expect(peak("attack", "x")).toBeGreaterThan(peak("scratch", "x") * 3);
  });

  it("할퀴기는 두 번 친다", () => {
    expect(findPreset("scratch")!.animation.events).toHaveLength(2);
    expect(findPreset("attack")!.animation.events).toHaveLength(1);
  });

  it("돌진은 어떤 공격보다 멀리 나간다", () => {
    for (const id of ["attack", "scratch", "swing", "stab", "spin", "stomp"]) {
      expect(peak("charge", "x"), id).toBeGreaterThan(peak(id, "x"));
    }
  });

  it("회전 베기는 한 바퀴를 돈다", () => {
    expect(peak("spin", "rotation")).toBeGreaterThan(Math.PI * 1.8);
  });

  it("내려찍기는 세로로 크게 움직인다", () => {
    expect(peak("stomp", "y")).toBeGreaterThan(peak("stomp", "x") + 20);
  });
});

describe("이동 계열도 서로 다르다", () => {
  it("달리기가 걷기보다 크게 튀고 다리를 크게 젓는다", () => {
    expect(peak("run", "y")).toBeGreaterThan(peak("walk", "y"));
    expect(peak("run", "rotation", "leg1")).toBeGreaterThan(peak("walk", "rotation", "leg1"));
  });

  it("달리기는 앞으로 기운 자세를 유지한다", () => {
    const animation = findPreset("run")!.animation;
    // 0초의 원본 자세를 지난 직후부터 달리기 특유의 전경 자세가 나타난다.
    const lean = evaluateAnimation(animation, humanoid(), animation.duration * 0.3).get("root")!.rotation;
    expect(lean).toBeGreaterThan(0.05);
  });
});

describe("프리셋 갈래", () => {
  it("모든 프리셋의 갈래가 목록 순서에 들어 있다", () => {
    // 화면은 PRESET_GROUPS를 그대로 훑어 그린다. 여기 빠진 갈래의 프리셋은
    // 만들어 두고도 사용자에게 아예 보이지 않는다 — 실제로 7개가 그렇게 숨어 있었다.
    for (const preset of PRESETS) {
      expect(PRESET_GROUPS, preset.id).toContain(preset.group);
    }
  });

  it("갈래마다 적어도 하나는 있다", () => {
    for (const group of PRESET_GROUPS) {
      expect(PRESETS.filter((p) => p.group === group).length, group).toBeGreaterThan(0);
    }
  });
});
