import { describe, expect, it } from "vitest";
import type { PuppetAnimation, PuppetBone } from "../src/core/format";
import {
  AnimationPlayer,
  collectEvents,
  evaluateAnimation,
  resolveTargets,
  sampleTrack,
} from "../src/core/animation";
import idlePreset from "../src/presets/idle.json";

function bone(id: string, tags: string[], parentId: string | null = null, motion = 1): PuppetBone {
  return {
    id,
    name: id,
    parentId,
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    tags,
    motionStrength: motion,
    deform: "soft",
    color: "#ffffff",
  };
}

const idle = idlePreset as unknown as PuppetAnimation;

describe("키프레임 보간", () => {
  const keys = [
    { time: 0, value: 0 },
    { time: 1, value: 10 },
  ];

  it("중간 값은 선형 보간된다", () => {
    expect(sampleTrack(keys, 0.5, 0)).toBeCloseTo(5);
  });

  it("범위 밖은 양 끝 값으로 고정된다", () => {
    expect(sampleTrack(keys, -1, 0)).toBe(0);
    expect(sampleTrack(keys, 99, 0)).toBe(10);
  });

  it("키가 없으면 기본값을 쓴다", () => {
    expect(sampleTrack([], 0.5, 1)).toBe(1);
  });

  it("step은 다음 키까지 값을 유지한다", () => {
    const stepped = [
      { time: 0, value: 0, ease: "step" as const },
      { time: 1, value: 10 },
    ];
    expect(sampleTrack(stepped, 0.9, 0)).toBe(0);
  });
});

describe("태그 기반 대상 찾기 (기획서 12, 64)", () => {
  const bones = [bone("b1", ["core"]), bone("h1", ["head"]), bone("h2", ["head"])];

  it("머리가 여러 개면 전부 움직인다", () => {
    const deltas = evaluateAnimation(idle, bones, 0.5);
    expect(deltas.has("h1")).toBe(true);
    expect(deltas.has("h2")).toBe(true);
    expect(deltas.get("h1")!.rotation).toBeCloseTo(deltas.get("h2")!.rotation);
  });

  it("없는 태그를 요구하는 Track은 오류 없이 건너뛴다", () => {
    const noHead = [bone("b1", ["core"])];
    expect(() => evaluateAnimation(idle, noHead, 0.5)).not.toThrow();
    const deltas = evaluateAnimation(idle, noHead, 0.5);
    expect(deltas.has("b1")).toBe(true);
    expect(deltas.size).toBe(1);
  });

  it("Bone이 하나도 없어도 빈 결과만 나온다", () => {
    expect(evaluateAnimation(idle, [], 0.5).size).toBe(0);
  });

  it("Bone ID를 직접 가리키는 Track도 동작한다", () => {
    const track = { target: { kind: "bone" as const, boneId: "h1" }, property: "x" as const, keys: [] };
    expect(resolveTargets(track, bones).map((b) => b.id)).toEqual(["h1"]);
    expect(resolveTargets({ ...track, target: { kind: "bone", boneId: "없음" } }, bones)).toEqual([]);
  });
});

describe("motionStrength (기획서 28)", () => {
  it("움직임 크기에 곱해진다", () => {
    const weak = evaluateAnimation(idle, [bone("h", ["head"], null, 0.5)], 0.5);
    const strong = evaluateAnimation(idle, [bone("h", ["head"], null, 2)], 0.5);
    expect(strong.get("h")!.rotation).toBeCloseTo(weak.get("h")!.rotation * 4);
  });

  it("scale은 1을 기준으로 배율이 적용된다", () => {
    const deltas = evaluateAnimation(idle, [bone("c", ["core"], null, 2)], 0.8);
    expect(deltas.get("c")!.scaleY).toBeCloseTo(1.06);
  });
});

describe("이벤트", () => {
  const withEvent: PuppetAnimation = {
    name: "attack",
    duration: 1,
    loop: false,
    tracks: [],
    events: [{ time: 0.32, event: "impact" }],
  };

  it("지나간 구간의 이벤트만 모은다", () => {
    expect(collectEvents(withEvent, 0, 0.5)).toEqual(["impact"]);
    expect(collectEvents(withEvent, 0.5, 0.9)).toEqual([]);
  });

  it("재생 중 이벤트가 한 번만 발생한다", () => {
    const player = new AnimationPlayer();
    const fired: string[] = [];
    player.onEvent((event) => fired.push(event));
    player.play(withEvent);

    player.update(0.2, []);
    player.update(0.2, []);
    player.update(0.2, []);
    expect(fired).toEqual(["impact"]);
  });
});

describe("재생", () => {
  it("loop면 시간이 되돌아온다", () => {
    const player = new AnimationPlayer();
    player.play(idle);
    player.update(idle.duration + 0.1, []);
    expect(player.current!.time).toBeLessThan(idle.duration);
    expect(player.current!.playing).toBe(true);
  });

  it("loop가 아니면 끝에서 멈춘다", () => {
    const once: PuppetAnimation = { name: "hit", duration: 0.4, loop: false, tracks: [] };
    const player = new AnimationPlayer();
    player.play(once);
    player.update(1, []);
    expect(player.current!.time).toBeCloseTo(0.4);
    expect(player.current!.playing).toBe(false);
  });

  it("재생 중 속도와 크기를 바꿀 수 있다 (기획서 31)", () => {
    const player = new AnimationPlayer();
    player.play(idle, { speed: 0.5, amount: 0.5 });
    expect(player.current!.speed).toBe(0.5);

    player.update(1, []);
    expect(player.current!.time).toBeCloseTo(0.5);

    player.setSpeed(2);
    player.setAmount(1.5);
    expect(player.current!.speed).toBe(2);
    expect(player.current!.amount).toBe(1.5);

    player.update(0.5, []);
    expect(player.current!.time).toBeCloseTo(1.5);
  });

  it("강도는 Bone의 motionStrength와 함께 곱해진다", () => {
    const player = new AnimationPlayer();
    const head = bone("h", ["head"], null, 2);

    player.play(idle, { amount: 0.5 });
    const half = player.update(0.5, [head]).get("h")!.rotation;

    player.play(idle, { amount: 1 });
    const full = player.update(0.5, [head]).get("h")!.rotation;

    expect(half).toBeCloseTo(full * 0.5);
  });

  it("정지하면 상태가 사라진다", () => {
    const player = new AnimationPlayer();
    player.play(idle);
    player.stop();
    expect(player.current).toBeNull();
  });
});
