/**
 * 키프레임 만들기 · 고치기. (기획서 21, 26)
 *
 * 캔버스에서 관절을 끌어 만든 자세가 그대로 키에 담기는지가 핵심이다.
 * 프리셋(태그 Track)이 이미 그 관절을 움직이고 있으면 그만큼 빼고 적어야 한다.
 */
import { describe, expect, it } from "vitest";
import type { PuppetAnimation, PuppetBone } from "../src/core/format";
import {
  deltaWithoutOwnKeys,
  evaluateAnimation,
  findTrack,
  keyValueFor,
  scaleKeyValueFor,
  moveOwnKeys,
  ownKeysAt,
  ownTracks,
  removeKey,
  removeOwnKeys,
  setKey,
  setOwnKeyEase,
  withoutOwnTracks,
} from "../src/core/animation";

function bone(id: string, tags: string[] = [], motion = 1): PuppetBone {
  return {
    id, name: id, parentId: null, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1,
    tags, motionStrength: motion, deform: "soft", color: "#ffffff",
  };
}

const empty: PuppetAnimation = { name: "새 동작", duration: 2, loop: false, tracks: [] };
const 팔 = { kind: "bone" as const, boneId: "팔" };

describe("키 놓기", () => {
  it("Track이 없으면 만든다", () => {
    const next = setKey(empty, 팔, "rotation", 0.5, 0.3);
    expect(next.tracks).toHaveLength(1);
    expect(next.tracks[0]?.keys).toEqual([{ time: 0.5, value: 0.3, ease: "smooth" }]);
  });

  it("원본을 건드리지 않는다", () => {
    setKey(empty, 팔, "rotation", 0.5, 0.3);
    expect(empty.tracks).toHaveLength(0);
  });

  it("같은 Track에 두 번째 키는 시간 순으로 들어간다", () => {
    let a = setKey(empty, 팔, "rotation", 1, 0.5);
    a = setKey(a, 팔, "rotation", 0.2, 0.1);
    expect(a.tracks[0]?.keys.map((k) => k.time)).toEqual([0.2, 1]);
  });

  it("같은 시각에 다시 찍으면 값만 갈아 끼운다", () => {
    let a = setKey(empty, 팔, "rotation", 0.5, 0.3);
    a = setKey(a, 팔, "rotation", 0.5, 0.9);
    expect(a.tracks[0]?.keys).toHaveLength(1);
    expect(a.tracks[0]?.keys[0]?.value).toBe(0.9);
  });

  it("아주 가까운 시각도 같은 키로 본다", () => {
    // 부동소수 오차로 키가 늘어나면 안 된다.
    let a = setKey(empty, 팔, "rotation", 0.5, 0.3);
    a = setKey(a, 팔, "rotation", 0.5 + 1e-9, 0.9);
    expect(a.tracks[0]?.keys).toHaveLength(1);
  });

  it("속성이 다르면 Track이 따로 생긴다", () => {
    let a = setKey(empty, 팔, "rotation", 0.5, 0.3);
    a = setKey(a, 팔, "x", 0.5, 12);
    expect(a.tracks).toHaveLength(2);
    expect(findTrack(a, 팔, "x")?.keys[0]?.value).toBe(12);
  });

  it("길이 밖의 시각은 안쪽으로 잘린다", () => {
    expect(setKey(empty, 팔, "rotation", 99, 1).tracks[0]?.keys[0]?.time).toBe(2);
    expect(setKey(empty, 팔, "rotation", -5, 1).tracks[0]?.keys[0]?.time).toBe(0);
  });
});

describe("키 지우기", () => {
  it("그 시각의 키만 지운다", () => {
    let a = setKey(empty, 팔, "rotation", 0.5, 0.3);
    a = setKey(a, 팔, "rotation", 1.5, 0.8);
    const next = removeKey(a, 팔, "rotation", 0.5);
    expect(next.tracks[0]?.keys.map((k) => k.time)).toEqual([1.5]);
  });

  it("마지막 키를 지우면 Track째 사라진다", () => {
    // 키 없는 Track은 아무 일도 하지 않으면서 파일만 늘린다.
    const a = setKey(empty, 팔, "rotation", 0.5, 0.3);
    expect(removeKey(a, 팔, "rotation", 0.5).tracks).toHaveLength(0);
  });

  it("없는 키를 지우려 하면 그대로 둔다", () => {
    const a = setKey(empty, 팔, "rotation", 0.5, 0.3);
    expect(removeKey(a, 팔, "rotation", 1.9)).toBe(a);
    expect(removeKey(a, 팔, "x", 0.5)).toBe(a);
  });
});

describe("프리셋과 섞였을 때 적을 값", () => {
  const bones = [bone("팔", ["arm"])];
  /** 태그로 팔을 0.4rad 돌리는 프리셋이 이미 있다. */
  const preset: PuppetAnimation = {
    name: "attack", duration: 2, loop: false,
    tracks: [
      { target: { kind: "tag", tag: "arm" }, property: "rotation",
        keys: [{ time: 0, value: 0.4 }, { time: 2, value: 0.4 }] },
    ],
  };

  it("직접 찍은 키를 뺀 나머지가 주는 값을 구한다", () => {
    expect(deltaWithoutOwnKeys(preset, bones, "팔", 1).rotation).toBeCloseTo(0.4);
  });

  it("내가 찍은 키는 빼고 센다", () => {
    const mixed = setKey(preset, 팔, "rotation", 1, 5);
    expect(deltaWithoutOwnKeys(mixed, bones, "팔", 1).rotation).toBeCloseTo(0.4);
    expect(withoutOwnTracks(mixed, "팔").tracks).toHaveLength(1);
  });

  it("원하는 자세에서 나머지를 빼고 적는다", () => {
    // 화면에서 1.0rad를 만들고 싶은데 프리셋이 이미 0.4를 주고 있으면 0.6만 적는다.
    const value = keyValueFor(1.0, 0.4, 1, 1);
    expect(value).toBeCloseTo(0.6);

    const next = setKey(preset, 팔, "rotation", 1, value);
    expect(evaluateAnimation(next, bones, 1).get("팔")?.rotation).toBeCloseTo(1.0);
  });

  it("관절 강도가 곱해지는 만큼 나눠서 적는다", () => {
    const 약한팔 = [bone("팔", ["arm"], 0.5)];
    // 강도 0.5면 화면에는 절반만 반영되므로 두 배로 적어야 한다.
    const value = keyValueFor(1.0, 0.2, 0.5, 1);
    expect(value).toBeCloseTo(1.6);

    const weak: PuppetAnimation = {
      name: "t", duration: 2, loop: false,
      tracks: [{ target: { kind: "tag", tag: "arm" }, property: "rotation",
        keys: [{ time: 0, value: 0.4 }, { time: 2, value: 0.4 }] }],
    };
    const next = setKey(weak, 팔, "rotation", 1, value);
    expect(evaluateAnimation(next, 약한팔, 1).get("팔")?.rotation).toBeCloseTo(1.0);
  });

  it("애니메이션 강도까지 함께 나눈다", () => {
    const value = keyValueFor(1.0, 0.8, 1, 2);
    const next = setKey(preset, 팔, "rotation", 1, value);
    expect(evaluateAnimation(next, bones, 1, 2).get("팔")?.rotation).toBeCloseTo(1.0);
  });

  it("강도가 0이면 0을 적는다", () => {
    // 무엇을 적어도 움직이지 않는다. 큰 값을 적어 두면 나중에 강도를 올렸을 때 튄다.
    expect(keyValueFor(1, 0, 0, 1)).toBe(0);
    expect(keyValueFor(1, 0, 1, 0)).toBe(0);
  });

  it("아무 프리셋도 없으면 원하는 값을 그대로 적는다", () => {
    const value = keyValueFor(0.7, 0, 1, 1);
    const next = setKey(empty, 팔, "rotation", 1, value);
    expect(evaluateAnimation(next, bones, 1).get("팔")?.rotation).toBeCloseTo(0.7);
  });

  it("크기 키는 중립값 1을 보존하고 다른 크기 Track과 곱셈으로 역산한다", () => {
    // 다른 Track이 이미 0.8배라면 0.5배 결과를 만들 직접 키는 0.625여야 한다.
    expect(scaleKeyValueFor(0.5, 0.8, 1)).toBeCloseTo(0.625);
    expect(scaleKeyValueFor(1, 1, 1)).toBe(1);

    const scaled: PuppetAnimation = {
      ...empty,
      tracks: [{ target: { kind: "tag", tag: "arm" }, property: "scaleY",
        keys: [{ time: 0, value: 0.8 }, { time: 2, value: 0.8 }] }],
    };
    const direct = scaleKeyValueFor(0.5, 0.8, 1);
    const next = setKey(scaled, 팔, "scaleY", 1, direct);
    expect(evaluateAnimation(next, bones, 1).get("팔")?.scaleY).toBeCloseTo(0.5);
    // Y만 편집한 검증 데이터에는 X Track 자체가 생기지 않아야 한다.
    expect(findTrack(next, 팔, "scaleX")).toBeUndefined();
  });
});

describe("키 옮기기 · 지우기", () => {
  const 팔트랙 = { kind: "bone" as const, boneId: "팔" };
  const 태그트랙 = { kind: "tag" as const, tag: "arm" };

  function 준비(): PuppetAnimation {
    let a = setKey(empty, 팔트랙, "rotation", 0.5, 0.3);
    a = setKey(a, 팔트랙, "x", 0.5, 10);
    a = setKey(a, 팔트랙, "rotation", 1.5, 0.9);
    return setKey(a, 태그트랙, "rotation", 0.5, 0.1);
  }

  it("한 시각의 키를 모든 속성에서 함께 옮긴다", () => {
    const next = moveOwnKeys(준비(), "팔", 0.5, 1.0);
    expect(findTrack(next, 팔트랙, "rotation")?.keys.map((k) => k.time)).toEqual([1.0, 1.5]);
    expect(findTrack(next, 팔트랙, "x")?.keys.map((k) => k.time)).toEqual([1.0]);
  });

  it("값은 그대로 두고 시간만 바꾼다", () => {
    const next = moveOwnKeys(준비(), "팔", 0.5, 1.0);
    expect(findTrack(next, 팔트랙, "x")?.keys[0]?.value).toBe(10);
  });

  it("태그 Track은 건드리지 않는다", () => {
    // 프리셋의 것이라 여기서 옮기면 다른 관절까지 움직인다.
    const next = moveOwnKeys(준비(), "팔", 0.5, 1.0);
    expect(findTrack(next, 태그트랙, "rotation")?.keys[0]?.time).toBe(0.5);
  });

  it("옮긴 자리에 있던 키는 밀려난다", () => {
    const next = moveOwnKeys(준비(), "팔", 0.5, 1.5);
    const keys = findTrack(next, 팔트랙, "rotation")?.keys;
    expect(keys).toHaveLength(1);
    expect(keys?.[0]?.value).toBe(0.3);
  });

  it("길이 밖으로는 나가지 않는다", () => {
    expect(findTrack(moveOwnKeys(준비(), "팔", 0.5, 99), 팔트랙, "x")?.keys[0]?.time).toBe(2);
  });

  it("제자리로 옮기면 그대로 둔다", () => {
    const a = 준비();
    expect(moveOwnKeys(a, "팔", 0.5, 0.5)).toBe(a);
  });

  it("없는 키를 옮기려 하면 그대로 둔다", () => {
    const a = 준비();
    expect(moveOwnKeys(a, "팔", 1.9, 1.0)).toBe(a);
    expect(moveOwnKeys(a, "다리", 0.5, 1.0)).toBe(a);
  });

  it("한 시각의 키를 모든 속성에서 지운다", () => {
    const next = removeOwnKeys(준비(), "팔", 0.5);
    expect(findTrack(next, 팔트랙, "rotation")?.keys.map((k) => k.time)).toEqual([1.5]);
    // x는 그 키뿐이었으므로 Track째 사라진다.
    expect(findTrack(next, 팔트랙, "x")).toBeUndefined();
  });

  it("지울 때도 태그 Track은 남는다", () => {
    const next = removeOwnKeys(준비(), "팔", 0.5);
    expect(findTrack(next, 태그트랙, "rotation")?.keys).toHaveLength(1);
  });

  it("없는 키를 지우려 하면 그대로 둔다", () => {
    const a = 준비();
    expect(removeOwnKeys(a, "팔", 1.9)).toBe(a);
  });
});

describe("보간 방식 고치기", () => {
  const 팔트랙 = { kind: "bone" as const, boneId: "팔" };
  const 태그트랙 = { kind: "tag" as const, tag: "arm" };

  function 준비(): PuppetAnimation {
    let a = setKey(empty, 팔트랙, "rotation", 0.5, 0.3, "linear");
    a = setKey(a, 팔트랙, "x", 0.5, 10, "linear");
    a = setKey(a, 팔트랙, "rotation", 1.5, 0.9, "linear");
    return setKey(a, 태그트랙, "rotation", 0.5, 0.1, "linear");
  }

  it("그 시각의 키를 모든 속성에서 함께 바꾼다", () => {
    const next = setOwnKeyEase(준비(), "팔", 0.5, "step");
    expect(findTrack(next, 팔트랙, "rotation")?.keys[0]?.ease).toBe("step");
    expect(findTrack(next, 팔트랙, "x")?.keys[0]?.ease).toBe("step");
  });

  it("다른 시각의 키는 그대로 둔다", () => {
    const next = setOwnKeyEase(준비(), "팔", 0.5, "step");
    expect(findTrack(next, 팔트랙, "rotation")?.keys[1]?.ease).toBe("linear");
  });

  it("태그 Track은 건드리지 않는다", () => {
    const next = setOwnKeyEase(준비(), "팔", 0.5, "step");
    expect(findTrack(next, 태그트랙, "rotation")?.keys[0]?.ease).toBe("linear");
  });

  it("이미 그 방식이면 그대로 둔다", () => {
    const a = 준비();
    expect(setOwnKeyEase(a, "팔", 0.5, "linear")).toBe(a);
  });

  it("없는 시각이면 그대로 둔다", () => {
    const a = 준비();
    expect(setOwnKeyEase(a, "팔", 1.9, "step")).toBe(a);
  });

  it("실제 보간 결과가 달라진다", () => {
    const bones = [bone("팔", ["arm"])];
    let a: PuppetAnimation = { name: "t", duration: 2, loop: false, tracks: [] };
    a = setKey(a, 팔트랙, "rotation", 0, 0, "linear");
    a = setKey(a, 팔트랙, "rotation", 1, 1, "linear");

    // 일정하게: 가운데가 정확히 절반
    expect(evaluateAnimation(a, bones, 0.5).get("팔")?.rotation).toBeCloseTo(0.5);

    // 뚝 끊어서: 다음 키에 닿기 전까지 앞의 값 그대로
    const stepped = setOwnKeyEase(a, "팔", 0, "step");
    expect(evaluateAnimation(stepped, bones, 0.5).get("팔")?.rotation).toBeCloseTo(0);

    // 부드럽게: 가운데는 절반이지만 양 끝이 느리다
    const smooth = setOwnKeyEase(a, "팔", 0, "smooth");
    expect(evaluateAnimation(smooth, bones, 0.5).get("팔")?.rotation).toBeCloseTo(0.5);
    expect(evaluateAnimation(smooth, bones, 0.2).get("팔")?.rotation).toBeLessThan(
      evaluateAnimation(a, bones, 0.2).get("팔")!.rotation,
    );
  });
});

describe("찍어 둔 키 조회", () => {
  const 팔트랙 = { kind: "bone" as const, boneId: "팔" };

  it("그 시각의 속성별 키를 모은다", () => {
    let a = setKey(empty, 팔트랙, "rotation", 0.5, 0.3);
    a = setKey(a, 팔트랙, "x", 0.5, 10);
    a = setKey(a, 팔트랙, "y", 1.5, 4);

    const here = ownKeysAt(a, "팔", 0.5);
    expect(here.map((k) => k.property).sort()).toEqual(["rotation", "x"]);
    expect(here.find((k) => k.property === "x")?.key.value).toBe(10);
  });

  it("없으면 비어 있다", () => {
    expect(ownKeysAt(setKey(empty, 팔트랙, "x", 0.5, 1), "팔", 1.2)).toEqual([]);
    expect(ownKeysAt(setKey(empty, 팔트랙, "x", 0.5, 1), "다리", 0.5)).toEqual([]);
  });

  it("직접 찍은 Track만 목록에 나온다", () => {
    let a = setKey(empty, 팔트랙, "rotation", 0.5, 0.3);
    a = setKey(a, { kind: "tag", tag: "arm" }, "rotation", 0.5, 0.1);
    expect(ownTracks(a, "팔")).toHaveLength(1);
  });
});
