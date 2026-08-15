import { describe, expect, it } from "vitest";
import {
  createBone,
  createEmptyProject,
  partForNewBone,
  TAG_CATALOG,
  type PuppetBone,
} from "../src/core/format";
import { evaluateAnimation } from "../src/core/animation";
import { findPreset, PRESETS } from "../src/presets";
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
