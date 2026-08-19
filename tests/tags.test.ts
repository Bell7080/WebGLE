/**
 * 태그 목록과 프리셋이 어긋나지 않는지 지킨다.
 *
 * 한동안 41개 중 29개가 아무 일도 하지 않았다. 화면에서는 나머지와 똑같이 생겼으므로
 * `tail`을 붙인 사람은 꼬리가 움직일 것이라 기대했고, 아무 일도 일어나지 않았다.
 * 기능이 없는 것보다 나쁜 것은 있는 척하는 UI다. 이 파일이 그것을 막는다.
 */
import { describe, expect, it } from "vitest";
import { TAG_AMPLITUDE, TAG_CATALOG, SUGGESTED_TAGS } from "../src/core/format/constants";
import { PRESETS } from "../src/presets";
import { evaluateAnimation, tagAmplitude } from "../src/core/animation";
import type { PuppetAnimation, PuppetBone } from "../src/core/format";

/** 어느 프리셋이든 대상으로 삼고 있는 태그. focus로 쓰는 것도 포함한다. */
const targeted = new Set<string>();
for (const preset of PRESETS) {
  for (const track of preset.animation.tracks) {
    if (track.target.kind === "tag") targeted.add(track.target.tag);
    if (track.focus) targeted.add(track.focus);
  }
}

function bone(id: string, tags: string[]): PuppetBone {
  return {
    id, name: id, parentId: null, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1,
    tags, motionStrength: 1, deform: "soft", color: "#ffffff",
  };
}

describe("태그 목록", () => {
  it("동작 태그는 전부 어떤 프리셋이 쓴다", () => {
    const dead = TAG_CATALOG.filter((tag) => tag.effect === "track" && !targeted.has(tag.id));
    // 여기 걸리면 둘 중 하나를 해야 한다 — 프리셋에서 쓰거나, effect를 hint로 낮추거나.
    expect(dead.map((tag) => tag.id)).toEqual([]);
  });

  it("배율 태그는 전부 배율표에 있다", () => {
    const modifiers = TAG_CATALOG.filter((tag) => tag.effect === "modifier").map((tag) => tag.id);
    expect(modifiers.every((id) => id in TAG_AMPLITUDE)).toBe(true);
    expect(Object.keys(TAG_AMPLITUDE).sort()).toEqual([...modifiers].sort());
  });

  it("배율 태그는 프리셋의 대상이 아니다 — 대상과 성격을 섞지 않는다", () => {
    for (const tag of TAG_CATALOG) {
      if (tag.effect === "modifier") expect(targeted.has(tag.id)).toBe(false);
    }
  });

  it("표시용 태그는 아무 일도 하지 않는다고 설명에 적혀 있다", () => {
    for (const tag of TAG_CATALOG) {
      if (tag.effect !== "hint") continue;
      expect(targeted.has(tag.id)).toBe(false);
      expect(tag.id in TAG_AMPLITUDE).toBe(false);
      expect(tag.description).toContain("아무 움직임도 만들지 않는");
    }
  });

  it("추천 태그는 전부 목록에 있는 태그다", () => {
    const known = new Set(TAG_CATALOG.map((tag) => tag.id));
    for (const [part, tags] of Object.entries(SUGGESTED_TAGS)) {
      for (const tag of tags) expect(known, `${part}의 ${tag}`).toContain(tag);
    }
  });
});

describe("성격 태그 배율", () => {
  it("heavy는 줄이고 light는 키운다", () => {
    expect(tagAmplitude(bone("a", ["heavy"]))).toBeLessThan(1);
    expect(tagAmplitude(bone("a", ["light"]))).toBeGreaterThan(1);
    expect(tagAmplitude(bone("a", []))).toBe(1);
  });

  it("여러 개 붙으면 곱해진다", () => {
    expect(tagAmplitude(bone("a", ["heavy", "stiff"]))).toBeCloseTo(
      TAG_AMPLITUDE.heavy! * TAG_AMPLITUDE.stiff!,
    );
  });

  it("실제 움직임이 그만큼 줄어든다", () => {
    const animation: PuppetAnimation = {
      name: "t", duration: 1, loop: false,
      tracks: [{
        target: { kind: "tag", tag: "arm" }, property: "x",
        keys: [{ time: 0, value: 100 }],
      }],
    };
    // 정확한 시작 자세 보호 뒤에도 성격 태그 배율은 동일하게 적용된다.
    const plain = evaluateAnimation(animation, [bone("a", ["arm"])], 0.001);
    const stiff = evaluateAnimation(animation, [bone("a", ["arm", "stiff"])], 0.001);

    expect(plain.get("a")!.x).toBe(100);
    expect(stiff.get("a")!.x).toBeCloseTo(100 * TAG_AMPLITUDE.stiff!);
  });
});
