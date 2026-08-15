/**
 * 생김새가 제각각인 몬스터들이 같은 프리셋으로 다 움직이는지 확인한다. (기획서 1.1, 63, 64)
 *
 * 스켈레톤 타입이 없으므로 "이건 사람 / 이건 거미" 같은 분기는 존재할 수 없다.
 * 태그만 보고 대상을 찾고, 없는 태그는 조용히 건너뛴다는 것을 실제 캐릭터로 확인한다.
 */
import { describe, expect, it } from "vitest";
import { CREATURES } from "./creatures.fixture";
import { evaluateAnimation } from "../src/core/animation";
import { applyPoint, computeSkinMatrices } from "../src/core/skeleton/transform";
import { PRESETS } from "../src/presets";
import type { PuppetBone } from "../src/core/format";

function preset(id: string) {
  const found = PRESETS.find((p) => p.id === id);
  if (!found) throw new Error(`프리셋 없음: ${id}`);
  return found.animation;
}

/** 프리셋을 한 주기 돌렸을 때 각 관절 원점이 실제로 움직인 최대 거리(px). */
function travel(bones: PuppetBone[], id: string, samples = 24): Map<string, number> {
  const animation = preset(id);
  const rest = computeSkinMatrices(bones, new Map());
  const home = new Map(bones.map((b) => [b.id, applyPoint(rest.get(b.id)!, b.x, b.y)]));
  const peak = new Map(bones.map((b) => [b.id, 0]));

  for (let i = 0; i <= samples; i += 1) {
    const deltas = evaluateAnimation(animation, bones, (animation.duration * i) / samples);
    const matrices = computeSkinMatrices(bones, deltas);
    for (const bone of bones) {
      const p = applyPoint(matrices.get(bone.id)!, bone.x, bone.y);
      const h = home.get(bone.id)!;
      peak.set(bone.id, Math.max(peak.get(bone.id)!, Math.hypot(p.x - h.x, p.y - h.y)));
    }
  }
  return peak;
}

const named = (bones: PuppetBone[], part: string): PuppetBone[] =>
  bones.filter((b) => b.name.startsWith(part));

describe("생김새가 다른 몬스터들", () => {
  it.each(Object.entries(CREATURES))(
    "%s — 고른 프리셋마다 모든 관절이 움직인다",
    (_label, [bones, presets]) => {
      for (const id of presets) {
        const peak = travel(bones, id);
        for (const bone of bones) {
          expect(peak.get(bone.id), `${id} / ${bone.name}`).toBeGreaterThan(0);
        }
      }
    },
  );

  it("팔다리가 없어도 오류 없이 걷는다", () => {
    const [뱀] = CREATURES["뱀 (팔다리 없음)"]!;
    expect(뱀.some((b) => b.tags.includes("leg"))).toBe(false);

    const peak = travel(뱀, "walk");
    // leg · arm Track은 대상이 없어 건너뛰고, root · core · secondary만 남는다.
    expect(Math.max(...peak.values())).toBeGreaterThan(3);
  });

  it("다리 없는 유령도 이동 동작이 성립한다", () => {
    const [유령] = CREATURES["유령 (다리 없음)"]!;
    expect(유령.some((b) => b.tags.includes("leg"))).toBe(false);
    expect(Math.max(...travel(유령, "walk").values())).toBeGreaterThan(3);
  });

  it("무기를 쥔 손끝이 가장 크게 휘둘린다", () => {
    const [도적] = CREATURES["도적 (단검)"]!;
    const peak = travel(도적, "swing");
    const 무기 = peak.get(named(도적, "무기")[0]!.id)!;
    const 몸통 = peak.get(named(도적, "몸통")[0]!.id)!;
    // 계층을 타고 팔 → 손 → 무기로 갈수록 움직임이 커진다.
    expect(무기).toBeGreaterThan(몸통 * 3);
  });

  it("꼬리 끝 독침이 찌르기에서 크게 움직인다", () => {
    const [전갈] = CREATURES["전갈 (꼬리 독침)"]!;
    const 독침 = named(전갈, "독침")[0]!;
    expect(독침.tags).toContain("attack");
    const peak = travel(전갈, "stab");
    expect(peak.get(독침.id)).toBeGreaterThan(peak.get(named(전갈, "몸통")[0]!.id)! * 2);
  });
});

describe("여러 개인 부위의 어긋냄 (stagger)", () => {
  /** 한 순간의 형제별 회전값. */
  const rotations = (bones: PuppetBone[], id: string, part: string, at: number): number[] => {
    const animation = preset(id);
    const deltas = evaluateAnimation(animation, bones, animation.duration * at);
    return named(bones, part).map((b) => deltas.get(b.id)?.rotation ?? 0);
  };

  it("다리 두 개는 정확히 반대로 나간다", () => {
    const [도적] = CREATURES["도적 (단검)"]!;
    const [왼, 오른] = rotations(도적, "walk", "다리", 0);
    expect(왼).toBeCloseTo(0.22, 2);
    expect(오른).toBeCloseTo(-0.22, 2);
  });

  it("다리 네 개는 주기를 넷으로 나눠 딛는다", () => {
    const [몬스터] = CREATURES["팔4·다리4 몬스터"]!;
    const values = rotations(몬스터, "walk", "다리", 0);
    expect(values).toHaveLength(4);
    // 같은 값이 겹치지 않고 네 위상으로 흩어진다.
    expect(new Set(values.map((v) => v.toFixed(2))).size).toBeGreaterThan(2);
  });

  it("다리 스무 개는 앞에서 뒤로 흐르는 파도가 된다", () => {
    const [지네] = CREATURES["지네 (다리 20)"]!;
    const values = rotations(지네, "walk", "다리", 0);
    expect(values).toHaveLength(20);

    // 이웃한 다리끼리는 조금씩만 다르다 — 뚝뚝 끊기지 않고 이어진 파도다.
    for (let i = 1; i < values.length; i += 1) {
      expect(Math.abs(values[i]! - values[i - 1]!)).toBeLessThan(0.1);
    }
    // 그러면서 전체로는 앞뒤가 완전히 반대까지 간다.
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.4);
  });

  it("파도는 시간이 지나면 몸을 타고 흘러간다", () => {
    const [지네] = CREATURES["지네 (다리 20)"]!;
    const before = rotations(지네, "walk", "다리", 0);
    const after = rotations(지네, "walk", "다리", 0.25);
    // 같은 파형이되 자리가 옮겨 가 있다.
    expect(after).not.toEqual(before);
    expect(Math.max(...after)).toBeCloseTo(Math.max(...before), 1);
  });

  it("어긋냄이 없으면 형제가 모두 같이 움직인다", () => {
    const [몬스터] = CREATURES["팔4·다리4 몬스터"]!;
    // 공격 프리셋에는 stagger가 없다 — 네 팔로 한꺼번에 내려친다.
    const values = rotations(몬스터, "attack", "팔", 0.3);
    for (const value of values) expect(value).toBeCloseTo(values[0]!, 6);
  });
});
