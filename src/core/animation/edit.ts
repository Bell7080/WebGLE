/**
 * 키프레임 만들기 · 고치기. (기획서 21, 26)
 *
 * 모두 원본을 건드리지 않고 새 애니메이션을 돌려준다. Undo가 그대로 동작하게 하기 위한 것이다.
 *
 * 편집기에서 찍는 키는 관절 하나를 직접 가리킨다(`{kind:"bone"}`).
 * 프리셋이 쓰는 태그 Track과 섞여도 되며, 값은 서로 더해진다.
 */
import type {
  AnimationTrack,
  Interpolation,
  Keyframe,
  PuppetAnimation,
  PuppetBone,
  TrackProperty,
  TrackTarget,
} from "../format/types";
import { NO_DELTA, type BoneDelta } from "../skeleton/transform";
import { evaluateAnimation } from "./index";

/**
 * 같은 키로 볼 시간 차이(초).
 * 1/30초의 절반보다 훨씬 작다 — 한 프레임에 두 개가 찍히지 않으면서
 * 부동소수 오차로 키가 늘어나지도 않게 하는 값이다.
 */
export const KEY_EPSILON = 1e-4;

function sameTarget(a: TrackTarget, b: TrackTarget): boolean {
  if (a.kind === "bone" && b.kind === "bone") return a.boneId === b.boneId;
  if (a.kind === "tag" && b.kind === "tag") return a.tag === b.tag;
  return false;
}

/** 이 대상 · 속성을 맡은 Track. 없으면 undefined. */
export function findTrack(
  animation: PuppetAnimation,
  target: TrackTarget,
  property: TrackProperty,
): AnimationTrack | undefined {
  return animation.tracks.find(
    (track) => track.property === property && sameTarget(track.target, target),
  );
}

/**
 * 그 시각에 키를 놓는다. 이미 있으면 값을 갈아 끼우고, 없으면 시간 순으로 끼워 넣는다.
 * 해당 Track이 아직 없으면 만든다.
 */
export function setKey(
  animation: PuppetAnimation,
  target: TrackTarget,
  property: TrackProperty,
  time: number,
  value: number,
  ease: Keyframe["ease"] = "smooth",
): PuppetAnimation {
  const at = Math.min(Math.max(0, time), animation.duration);
  const existing = findTrack(animation, target, property);

  if (!existing) {
    return {
      ...animation,
      tracks: [...animation.tracks, { target, property, keys: [{ time: at, value, ease }] }],
    };
  }

  const keys = [...existing.keys];
  const index = keys.findIndex((key) => Math.abs(key.time - at) <= KEY_EPSILON);
  if (index >= 0) {
    keys[index] = { ...keys[index]!, value };
  } else {
    keys.push({ time: at, value, ease });
    keys.sort((a, b) => a.time - b.time);
  }

  return {
    ...animation,
    tracks: animation.tracks.map((track) =>
      track === existing ? { ...track, keys } : track,
    ),
  };
}

/**
 * 그 시각의 키를 지운다. 마지막 키였으면 Track째 없앤다 —
 * 키 없는 Track은 아무 일도 하지 않으면서 파일만 늘린다.
 */
export function removeKey(
  animation: PuppetAnimation,
  target: TrackTarget,
  property: TrackProperty,
  time: number,
): PuppetAnimation {
  const existing = findTrack(animation, target, property);
  if (!existing) return animation;

  const keys = existing.keys.filter((key) => Math.abs(key.time - time) > KEY_EPSILON);
  if (keys.length === existing.keys.length) return animation;

  return {
    ...animation,
    tracks: animation.tracks.flatMap((track) => {
      if (track !== existing) return [track];
      return keys.length > 0 ? [{ ...track, keys }] : [];
    }),
  };
}

/**
 * 이 관절의 키를 다른 시각으로 옮긴다. 값은 그대로 두고 시간만 바꾼다.
 *
 * `boneId`가 직접 가리키는 Track만 건드린다 — 태그 Track은 프리셋의 것이라
 * 여기서 옮기면 다른 관절까지 함께 움직인다.
 * 옮긴 자리에 이미 키가 있으면 그 키를 밀어내고 자리를 차지한다.
 */
export function moveOwnKeys(
  animation: PuppetAnimation,
  boneId: string,
  from: number,
  to: number,
): PuppetAnimation {
  const at = Math.min(Math.max(0, to), animation.duration);
  if (Math.abs(at - from) <= KEY_EPSILON) return animation;

  let touched = false;
  const tracks = animation.tracks.map((track) => {
    if (track.target.kind !== "bone" || track.target.boneId !== boneId) return track;

    const moving = track.keys.find((key) => Math.abs(key.time - from) <= KEY_EPSILON);
    if (!moving) return track;
    touched = true;

    const keys = track.keys
      // 옮기려는 자리에 있던 키와 원래 자리의 키를 먼저 뺀다.
      .filter(
        (key) =>
          Math.abs(key.time - from) > KEY_EPSILON && Math.abs(key.time - at) > KEY_EPSILON,
      )
      .concat({ ...moving, time: at })
      .sort((a, b) => a.time - b.time);

    return { ...track, keys };
  });

  return touched ? { ...animation, tracks } : animation;
}

/**
 * 이 관절이 그 시각에 직접 찍어 둔 키들. 속성별로 하나씩이다.
 * 트랙 목록과 보간 방식 편집에 쓴다.
 */
export function ownKeysAt(
  animation: PuppetAnimation,
  boneId: string,
  time: number,
): { property: TrackProperty; key: Keyframe }[] {
  const found: { property: TrackProperty; key: Keyframe }[] = [];
  for (const track of animation.tracks) {
    if (track.target.kind !== "bone" || track.target.boneId !== boneId) continue;
    const key = track.keys.find((candidate) => Math.abs(candidate.time - time) <= KEY_EPSILON);
    if (key) found.push({ property: track.property, key });
  }
  return found;
}

/** 이 관절이 직접 찍은 Track들. 속성과 키 개수를 목록으로 보여 줄 때 쓴다. */
export function ownTracks(animation: PuppetAnimation, boneId: string): AnimationTrack[] {
  return animation.tracks.filter(
    (track) => track.target.kind === "bone" && track.target.boneId === boneId,
  );
}

/**
 * 그 시각 키의 보간 방식을 바꾼다. 이 관절의 모든 속성에서 함께 바꾼다.
 *
 * 보간은 "이 키에서 **다음** 키로 갈 때 어떻게 갈지"를 정한다.
 * 그래서 마지막 키에 정해 둔 값은 당장은 드러나지 않고, 뒤에 키를 더 찍으면 살아난다.
 */
export function setOwnKeyEase(
  animation: PuppetAnimation,
  boneId: string,
  time: number,
  ease: Interpolation,
): PuppetAnimation {
  let touched = false;
  const tracks = animation.tracks.map((track) => {
    if (track.target.kind !== "bone" || track.target.boneId !== boneId) return track;

    let changed = false;
    const keys = track.keys.map((key) => {
      if (Math.abs(key.time - time) > KEY_EPSILON || (key.ease ?? "linear") === ease) return key;
      changed = true;
      return { ...key, ease };
    });

    if (!changed) return track;
    touched = true;
    return { ...track, keys };
  });

  return touched ? { ...animation, tracks } : animation;
}

/**
 * 이 관절에 **직접 찍은** 키의 시각들. 편집기에서 옮기거나 지울 수 있는 것들이다.
 *
 * 태그 Track의 키는 여기 들어오지 않는다 — 프리셋의 것이라 손대면 다른 관절까지 움직인다.
 * 화면에서도 이 둘을 다르게 그려야 무엇을 잡을 수 있는지 알 수 있다.
 */
export function ownKeyTimes(animation: PuppetAnimation, boneId: string): number[] {
  const times = new Set<number>();
  for (const track of animation.tracks) {
    if (track.target.kind !== "bone" || track.target.boneId !== boneId) continue;
    for (const key of track.keys) times.add(key.time);
  }
  return [...times].sort((a, b) => a - b);
}

/** 이 관절의 그 시각 키를 모든 속성에서 지운다. */
export function removeOwnKeys(
  animation: PuppetAnimation,
  boneId: string,
  time: number,
): PuppetAnimation {
  let touched = false;
  const tracks = animation.tracks.flatMap((track) => {
    if (track.target.kind !== "bone" || track.target.boneId !== boneId) return [track];

    const keys = track.keys.filter((key) => Math.abs(key.time - time) > KEY_EPSILON);
    if (keys.length === track.keys.length) return [track];
    touched = true;
    return keys.length > 0 ? [{ ...track, keys }] : [];
  });

  return touched ? { ...animation, tracks } : animation;
}

/** 이 관절을 직접 가리키는 Track을 모두 뺀 애니메이션. 값을 역산할 때 쓴다. */
export function withoutOwnTracks(
  animation: PuppetAnimation,
  boneId: string,
): PuppetAnimation {
  return {
    ...animation,
    tracks: animation.tracks.filter(
      (track) => !(track.target.kind === "bone" && track.target.boneId === boneId),
    ),
  };
}

/**
 * 직접 찍은 키를 뺀 나머지(태그 Track 등)가 이 관절에 만들어 내는 변화량.
 *
 * 캔버스에서 관절을 끌어 원하는 자세를 만들었을 때,
 * 키에 적어야 할 값은 "원하는 값 − 나머지가 이미 주는 값"이다.
 * 이것을 빼지 않으면 프리셋이 있는 애니메이션에서 관절이 두 배로 움직인다.
 */
export function deltaWithoutOwnKeys(
  animation: PuppetAnimation,
  bones: readonly PuppetBone[],
  boneId: string,
  time: number,
  amount = 1,
): BoneDelta {
  const deltas = evaluateAnimation(withoutOwnTracks(animation, boneId), bones, time, amount);
  return deltas.get(boneId) ?? { ...NO_DELTA };
}

/**
 * 원하는 변화량을 만들려면 키에 적어야 할 값.
 *
 * 값에는 관절의 `강도`와 애니메이션의 `강도`가 곱해져 화면에 반영되므로,
 * 거꾸로 나눠서 적어야 화면에서 원하는 만큼 움직인다.
 * 강도가 0이면 무엇을 적어도 움직이지 않으므로 0을 돌려준다.
 */
export function keyValueFor(
  desired: number,
  fromOthers: number,
  motionStrength: number,
  amount = 1,
): number {
  const scale = motionStrength * amount;
  if (Math.abs(scale) < 1e-6) return 0;
  return (desired - fromOthers) / scale;
}
