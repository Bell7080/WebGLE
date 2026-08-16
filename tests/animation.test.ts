import { describe, expect, it } from "vitest";
import type { PuppetAnimation, PuppetBone } from "../src/core/format";
import {
  AnimationPlayer,
  collectEvents,
  deformModesFor,
  evaluateAnimation,
  keyTimes,
  mirrorDeltas,
  propertyScale,
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

describe("애니메이션별 변형 방식 덮어쓰기", () => {
  const bones = [bone("발", ["foot"]), bone("몸통", ["body"])];

  it("덮어쓰기가 없으면 Bone의 공용 값을 쓴다", () => {
    const modes = deformModesFor(bones, { name: "attack", duration: 1, loop: false, tracks: [] });
    expect(modes.get("발")).toBe("soft");
    expect(modes.get("몸통")).toBe("soft");
  });

  it("적어 둔 관절만 덮어쓴다", () => {
    const idle = {
      name: "idle",
      duration: 1,
      loop: true,
      tracks: [],
      deform: { 발: "pinnedSoft" as const },
    };
    const modes = deformModesFor(bones, idle);
    expect(modes.get("발")).toBe("pinnedSoft");
    expect(modes.get("몸통")).toBe("soft");
  });

  it("애니메이션이 없으면 공용 값 그대로다", () => {
    expect(deformModesFor(bones, null).get("발")).toBe("soft");
    expect(deformModesFor(bones).get("발")).toBe("soft");
  });

  it("없는 관절의 덮어쓰기는 조용히 무시한다", () => {
    const modes = deformModesFor(bones, {
      name: "idle",
      duration: 1,
      loop: true,
      tracks: [],
      deform: { 지워진관절: "fixed" as const },
    });
    expect(modes.size).toBe(2);
    expect(modes.has("지워진관절")).toBe(false);
  });

  it("한 애니메이션의 덮어쓰기가 다른 애니메이션에 새지 않는다", () => {
    const idle = {
      name: "idle",
      duration: 1,
      loop: true,
      tracks: [],
      deform: { 발: "pinnedSoft" as const },
    };
    const attack = { name: "attack", duration: 1, loop: false, tracks: [] };
    expect(deformModesFor(bones, idle).get("발")).toBe("pinnedSoft");
    expect(deformModesFor(bones, attack).get("발")).toBe("soft");
  });
});

describe("타임라인 조작", () => {
  const bones = [bone("머리", ["head"])];
  const anim: PuppetAnimation = {
    name: "test",
    duration: 2,
    loop: false,
    tracks: [
      { target: { kind: "tag", tag: "head" }, property: "rotation",
        keys: [{ time: 0, value: 0 }, { time: 1, value: 1 }, { time: 2, value: 0 }] },
    ],
    events: [{ time: 0.5, event: "impact" }],
  };

  it("특정 시각으로 옮긴다", () => {
    const player = new AnimationPlayer();
    player.play(anim);
    player.seek(1);
    expect(player.time).toBe(1);
    expect(player.duration).toBe(2);
  });

  it("범위 밖으로는 나가지 않는다", () => {
    const player = new AnimationPlayer();
    player.play(anim);
    player.seek(-5);
    expect(player.time).toBe(0);
    player.seek(99);
    expect(player.time).toBe(2);
  });

  it("옮기는 동안에는 이벤트를 내지 않는다", () => {
    // 타임라인을 훑을 때마다 공격 판정이 울리면 안 된다.
    const player = new AnimationPlayer();
    const heard: string[] = [];
    player.onEvent((e) => heard.push(e));
    player.play(anim);

    for (const t of [0.2, 0.6, 1.4, 0.3]) player.seek(t);
    expect(heard).toEqual([]);
  });

  it("옮긴 자리의 자세를 시간을 굴리지 않고 구한다", () => {
    const player = new AnimationPlayer();
    player.play(anim);
    player.seek(1);

    const deltas = player.sample(bones);
    expect(deltas.get("머리")?.rotation).toBeCloseTo(1);
    expect(player.time).toBe(1);
  });

  it("멈춰도 시각과 애니메이션이 남는다", () => {
    const player = new AnimationPlayer();
    player.play(anim);
    player.seek(1.5);
    player.pause();

    expect(player.current?.playing).toBe(false);
    expect(player.time).toBe(1.5);
    expect(player.update(0.1, bones).size).toBe(0);
  });

  it("다시 흐르게 하면 그 자리에서 이어 간다", () => {
    const player = new AnimationPlayer();
    player.play(anim);
    player.seek(1);
    player.pause();
    player.resume();

    player.update(0.1, bones);
    expect(player.time).toBeCloseTo(1.1);
  });

  it("끝에 서 있을 때 다시 누르면 처음부터 간다", () => {
    const player = new AnimationPlayer();
    player.play(anim);
    player.seek(2);
    player.pause();
    player.resume();
    expect(player.time).toBe(0);
  });

  it("정지한 뒤에는 옮겨도 아무 일이 없다", () => {
    const player = new AnimationPlayer();
    player.play(anim);
    player.stop();
    player.seek(1);
    expect(player.time).toBe(0);
    expect(player.sample(bones).size).toBe(0);
  });
});

describe("키가 찍힌 시각", () => {
  const bones = [bone("머리", ["head"]), bone("꼬리", ["tail"])];
  const anim: PuppetAnimation = {
    name: "test",
    duration: 2,
    loop: false,
    tracks: [
      { target: { kind: "tag", tag: "head" }, property: "rotation",
        keys: [{ time: 0, value: 0 }, { time: 1, value: 1 }] },
      { target: { kind: "tag", tag: "head" }, property: "x",
        keys: [{ time: 1, value: 5 }, { time: 2, value: 0 }] },
      { target: { kind: "tag", tag: "tail" }, property: "rotation",
        keys: [{ time: 0.5, value: 1 }] },
    ],
  };

  it("모든 Track의 키 시각을 겹치지 않게 모은다", () => {
    expect(keyTimes(anim, bones)).toEqual([0, 0.5, 1, 2]);
  });

  it("관절을 지정하면 그 관절을 움직이는 것만 본다", () => {
    expect(keyTimes(anim, bones, "머리")).toEqual([0, 1, 2]);
    expect(keyTimes(anim, bones, "꼬리")).toEqual([0.5]);
  });

  it("아무 Track도 건드리지 않는 관절이면 비어 있다", () => {
    expect(keyTimes(anim, [...bones, bone("날개", ["wing"])], "날개")).toEqual([]);
  });
});

describe("강도와 흔들림은 서로 다른 일을 한다", () => {
  function moving(id: string): PuppetBone {
    return {
      id, name: id, parentId: null, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1,
      tags: ["arm"], motionStrength: 1, deform: "soft", color: "#ffffff",
    };
  }

  const both: PuppetAnimation = {
    name: "t", duration: 1, loop: false,
    tracks: [
      { target: { kind: "tag", tag: "arm" }, property: "x", keys: [{ time: 0, value: 100 }] },
      { target: { kind: "tag", tag: "arm" }, property: "rotation", keys: [{ time: 0, value: 1 }] },
    ],
  };

  it("흔들림은 회전만 키운다 — 나아가는 거리는 그대로다", () => {
    const plain = evaluateAnimation(both, [moving("a")], 0).get("a")!;
    const swung = evaluateAnimation({ ...both, secondary: 2 }, [moving("a")], 0).get("a")!;

    expect(swung.rotation).toBeCloseTo(plain.rotation * 2);
    expect(swung.x).toBeCloseTo(plain.x);
  });

  it("흔들림 0이면 회전만 멈추고 이동은 남는다", () => {
    const still = evaluateAnimation({ ...both, secondary: 0 }, [moving("a")], 0).get("a")!;
    expect(still.rotation).toBe(0);
    expect(still.x).toBe(100);
  });

  it("강도는 이동과 회전을 함께 줄인다", () => {
    const half = evaluateAnimation(both, [moving("a")], 0, 0.5).get("a")!;
    expect(half.x).toBeCloseTo(50);
    expect(half.rotation).toBeCloseTo(0.5);
  });

  it("강도 0이면 아무것도 움직이지 않는다 — 흔들림이 켜져 있어도 그렇다", () => {
    const frozen = evaluateAnimation({ ...both, secondary: 2 }, [moving("a")], 0, 0).get("a")!;
    expect(frozen.x).toBe(0);
    expect(frozen.rotation).toBe(0);
  });

  it("propertyScale이 키를 되돌릴 때 쓰는 배율과 같다", () => {
    const bone = moving("a");
    const animation = { ...both, secondary: 1.5 };
    expect(propertyScale(animation, bone, "rotation", 0.5)).toBeCloseTo(0.75);
    expect(propertyScale(animation, bone, "x", 0.5)).toBeCloseTo(0.5);
  });
});

describe("좌우 반전", () => {
  const bone: PuppetBone = {
    id: "arm", name: "arm", parentId: null, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1,
    tags: ["arm"], motionStrength: 1, deform: "soft", color: "#ffffff",
  };

  const punch: PuppetAnimation = {
    name: "punch", duration: 1, loop: false,
    tracks: [
      { target: { kind: "tag", tag: "arm" }, property: "x", keys: [{ time: 0, value: 20 }] },
      { target: { kind: "tag", tag: "arm" }, property: "y", keys: [{ time: 0, value: -5 }] },
      { target: { kind: "tag", tag: "arm" }, property: "rotation", keys: [{ time: 0, value: 0.4 }] },
      { target: { kind: "tag", tag: "arm" }, property: "scaleX", keys: [{ time: 0, value: 1.2 }] },
    ],
  };

  it("가로와 회전만 뒤집는다", () => {
    const right = evaluateAnimation(punch, [bone], 0).get("arm")!;
    const left = evaluateAnimation(punch, [bone], 0, 1, true).get("arm")!;

    expect(left.x).toBe(-right.x);
    expect(left.rotation).toBe(-right.rotation);
    // 위아래와 크기는 좌우와 관계가 없다.
    expect(left.y).toBe(right.y);
    expect(left.scaleX).toBe(right.scaleX);
  });

  it("두 번 뒤집으면 원래대로다", () => {
    const once = evaluateAnimation(punch, [bone], 0, 1, true).get("arm")!;
    const twice = mirrorDeltas(new Map([["arm", { ...once }]])).get("arm")!;
    const plain = evaluateAnimation(punch, [bone], 0).get("arm")!;

    expect(twice.x).toBeCloseTo(plain.x);
    expect(twice.rotation).toBeCloseTo(plain.rotation);
  });

  it("재생 커서가 보는 쪽을 들고 있고 도중에 바꿀 수 있다", () => {
    const player = new AnimationPlayer();
    player.play(punch, { mirror: true });
    expect(player.sample([bone]).get("arm")!.x).toBe(-20);

    player.setMirror(false);
    expect(player.sample([bone]).get("arm")!.x).toBe(20);
  });

  it("애니메이션을 갈아 끼워도 보는 쪽은 유지된다", () => {
    // 여기서 흘리면 프리셋을 바꿀 때마다 캐릭터가 등 뒤로 주먹을 뻗는다.
    const player = new AnimationPlayer();
    player.play(punch, { mirror: true });
    player.play({ ...punch, name: "again" });
    expect(player.sample([bone]).get("arm")!.x).toBe(-20);
  });
});
