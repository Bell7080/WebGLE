import { describe, expect, it } from "vitest";
import type { PuppetBone } from "../src/core/format";
import { computeSkinMatrices, type BoneDelta } from "../src/core/skeleton/transform";
import { SecondaryMotion } from "../src/core/physics/secondary";

function bone(id: string, x: number, y: number, parentId: string | null, tags: string[]): PuppetBone {
  return {
    id,
    name: id,
    parentId,
    x,
    y,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    tags,
    motionStrength: 1,
    deform: "soft",
    color: "#ffffff",
  };
}

const delta = (patch: Partial<BoneDelta> = {}): BoneDelta => ({
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  ...patch,
});

/** 몸통을 좌우로 흔들면서 프레임을 진행시킨다. */
function shake(
  motion: SecondaryMotion,
  bones: readonly PuppetBone[],
  frames: number,
  amount = 1,
  move: (frame: number) => number = (frame) => Math.sin(frame * 0.6) * 30,
): Map<string, BoneDelta> {
  const dt = 1 / 60;
  let last = new Map<string, BoneDelta>();

  for (let frame = 0; frame < frames; frame += 1) {
    // move가 음수면 위로 끌어올리는 세로 이동으로 본다 (테스트에서 두 축을 함께 쓴다)
    const value = move(frame);
    const deltas = new Map<string, BoneDelta>([["body", delta({ y: value })]]);
    const posed = computeSkinMatrices(bones, deltas);
    motion.apply(bones, deltas, posed, dt, amount);
    last = deltas;
  }
  return last;
}

describe("따라 흔들림 (기획서 29)", () => {
  const bones = [
    bone("body", 100, 100, null, ["core"]),
    bone("tail", 100, 160, "body", ["tail", "secondary"]),
    bone("horn", 100, 60, "body", ["horn", "stiff"]),
  ];

  it("몸이 흔들리면 매달린 부위가 따라 흔들린다", () => {
    const motion = new SecondaryMotion();
    shake(motion, bones, 40);
    expect(Math.abs(motion.angleOf("tail"))).toBeGreaterThan(0.001);
  });

  it("secondary 태그가 없는 관절은 흔들리지 않는다", () => {
    const motion = new SecondaryMotion();
    const deltas = shake(motion, bones, 40);
    expect(motion.angleOf("horn")).toBe(0);
    expect(deltas.has("horn")).toBe(false);
  });

  it("첫 프레임에는 튀지 않는다", () => {
    const motion = new SecondaryMotion();
    shake(motion, bones, 1);
    expect(motion.angleOf("tail")).toBe(0);
  });

  it("몸이 멈추면 흔들림이 잦아든다", () => {
    const motion = new SecondaryMotion();
    shake(motion, bones, 30);
    const moving = Math.abs(motion.angleOf("tail"));

    // 같은 자리에 그대로 두면 스프링이 제자리로 당긴다.
    shake(motion, bones, 120, 1, () => 0);
    expect(Math.abs(motion.angleOf("tail"))).toBeLessThan(moving * 0.5);
  });

  it("세기를 0으로 두면 아무것도 더하지 않는다", () => {
    const motion = new SecondaryMotion();
    const deltas = shake(motion, bones, 40, 0);
    expect(deltas.has("tail")).toBe(false);
  });

  it("세기를 키우면 더 크게 흔들린다", () => {
    const weak = new SecondaryMotion();
    const strong = new SecondaryMotion();
    const weakDeltas = shake(weak, bones, 40, 0.5);
    const strongDeltas = shake(strong, bones, 40, 2);

    const weakSwing = Math.abs(weakDeltas.get("tail")?.rotation ?? 0);
    const strongSwing = Math.abs(strongDeltas.get("tail")?.rotation ?? 0);
    expect(strongSwing).toBeGreaterThan(weakSwing);
  });

  it("각도가 한계를 넘지 않는다", () => {
    const motion = new SecondaryMotion();
    // 매 프레임 크게 튀는 극단적인 입력을 넣어도 발산하지 않아야 한다.
    shake(motion, bones, 200, 1, (frame) => (frame % 2 === 0 ? -400 : 400));
    expect(Math.abs(motion.angleOf("tail"))).toBeLessThanOrEqual(0.6);
  });

  it("부모가 움직이면 위치가 뒤처진다", () => {
    const motion = new SecondaryMotion();
    // 위로(-y) 쭉 끌어올리면 부모가 앞서 나간 만큼 뒤처짐도 위쪽 부호로 쌓인다.
    shake(motion, bones, 12, 1, (frame) => frame * -6);
    expect(motion.lagOf("tail").y).toBeLessThan(-1);
  });

  it("뒤처진 만큼 반대로 밀어 매달린 쪽이 아래에 남는다", () => {
    const motion = new SecondaryMotion();
    const deltas = shake(motion, bones, 12, 1, (frame) => frame * -6);
    const tail = deltas.get("tail")!;

    // 부모는 위로 갔는데 꼬리는 아직 아래(+y)에 남아 있어야 한다.
    expect(tail.y).toBeGreaterThan(0);
    expect(tail.y).toBeCloseTo(-motion.lagOf("tail").y, 5);
  });

  it("부모가 멈춰 있으면 뒤처짐도 0으로 돌아온다", () => {
    const motion = new SecondaryMotion();
    shake(motion, bones, 12, 1, (frame) => frame * -6);
    shake(motion, bones, 90, 1, () => -66);
    expect(Math.abs(motion.lagOf("tail").y)).toBeLessThan(0.5);
  });

  it("reset하면 흔들림이 사라진다", () => {
    const motion = new SecondaryMotion();
    shake(motion, bones, 40);
    motion.reset();
    expect(motion.angleOf("tail")).toBe(0);
    expect(motion.lagOf("tail")).toEqual({ x: 0, y: 0 });
  });
});
