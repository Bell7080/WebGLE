import type {
  AnimationTrack,
  DeformMode,
  Interpolation,
  Keyframe,
  PuppetAnimation,
  PuppetBone,
  TrackProperty,
} from "../format/types";
import { bonesCarrying, getBonesByTag } from "../skeleton";
import { NO_DELTA, type BoneDelta } from "../skeleton/transform";

/** 키프레임 사이 값을 구한다. 키가 없으면 기본값을 그대로 쓴다. */
export function sampleTrack(keys: readonly Keyframe[], time: number, fallback: number): number {
  if (keys.length === 0) return fallback;

  const first = keys[0]!;
  if (time <= first.time) return first.value;

  const last = keys[keys.length - 1]!;
  if (time >= last.time) return last.value;

  for (let i = 0; i < keys.length - 1; i += 1) {
    const current = keys[i]!;
    const next = keys[i + 1]!;
    if (time < current.time || time > next.time) continue;

    const span = next.time - current.time;
    if (span <= 0) return next.value;

    const t = (time - current.time) / span;
    return interpolate(current.value, next.value, t, current.ease ?? "linear");
  }

  return last.value;
}

function interpolate(from: number, to: number, t: number, ease: Interpolation): number {
  switch (ease) {
    case "step":
      return from;
    case "smooth":
      return from + (to - from) * (t * t * (3 - 2 * t));
    case "linear":
    default:
      return from + (to - from) * t;
  }
}

/**
 * 지금 재생할 애니메이션에서 쓸 관절별 변형 방식.
 *
 * Bone의 `deform`이 모든 애니메이션이 함께 쓰는 값이고,
 * 애니메이션에 적힌 관절만 그 값을 덮어쓴다. 애니메이션이 없으면 공용 값 그대로다.
 * 지금 없는 관절의 덮어쓰기는 조용히 무시한다. (기획서 64)
 */
export function deformModesFor(
  bones: readonly PuppetBone[],
  animation?: PuppetAnimation | null,
): Map<string, DeformMode> {
  const modes = new Map(bones.map((bone) => [bone.id, bone.deform]));
  const overrides = animation?.deform;
  if (!overrides) return modes;

  for (const [boneId, mode] of Object.entries(overrides)) {
    if (modes.has(boneId)) modes.set(boneId, mode);
  }
  return modes;
}

/** 주인공이 아닌 대상이 받을 기본 비율. 멈추지는 않고 거드는 정도로 움직인다. */
const DEFAULT_FOCUS_OTHER = 0.3;

/**
 * 이 Track에서 주인공이 될 대상들.
 *
 * null이면 주인공을 가리지 않는다는 뜻이다. focus가 없을 때가 그렇고,
 * focus가 있어도 대상 중 아무도 해당하지 않으면 마찬가지다.
 * 무기를 안 든 캐릭터가 맨손 공격을 못 하게 되면 안 되기 때문이다. (기획서 64)
 */
function focusedTargets(
  focus: string | undefined,
  targets: readonly PuppetBone[],
  bones: readonly PuppetBone[],
  cache: Map<string, Set<string>>,
): Set<string> | null {
  if (!focus) return null;

  let carriers = cache.get(focus);
  if (!carriers) {
    carriers = bonesCarrying(bones, focus);
    cache.set(focus, carriers);
  }

  const picked = new Set<string>();
  for (const bone of targets) if (carriers.has(bone.id)) picked.add(bone.id);

  // 아무도 없으면(무기 없는 캐릭터) 가리지 않는다. 전부 해당하면 가릴 이유가 없다.
  return picked.size === 0 || picked.size === targets.length ? null : picked;
}

/**
 * 어긋낸 시각을 애니메이션 길이 안으로 되돌린다.
 * 반복이면 주기를 감고, 한 번짜리면 끝에서 멈춘다(뒤쪽 대상이 먼저 자세를 잡고 기다린다).
 */
function wrap(time: number, duration: number, loop: boolean): number {
  if (!loop) return Math.min(time, duration);
  const wrapped = time % duration;
  return wrapped < 0 ? wrapped + duration : wrapped;
}

/** Track이 가리키는 Bone들. 대상이 없으면 빈 배열이고, 호출부는 그냥 건너뛴다. (기획서 64) */
export function resolveTargets(
  track: AnimationTrack,
  bones: readonly PuppetBone[],
): PuppetBone[] {
  const target = track.target;
  if (target.kind === "bone") {
    const bone = bones.find((candidate) => candidate.id === target.boneId);
    return bone ? [bone] : [];
  }
  return getBonesByTag(bones, target.tag);
}

function applyProperty(
  delta: BoneDelta,
  property: TrackProperty,
  value: number,
  motionStrength: number,
): void {
  switch (property) {
    case "x":
      delta.x += value * motionStrength;
      break;
    case "y":
      delta.y += value * motionStrength;
      break;
    case "rotation":
      delta.rotation += value * motionStrength;
      break;
    case "scaleX":
      delta.scaleX *= 1 + (value - 1) * motionStrength;
      break;
    case "scaleY":
      delta.scaleY *= 1 + (value - 1) * motionStrength;
      break;
  }
}

/**
 * 특정 시각의 Bone별 변화량을 계산한다.
 * 요구한 태그가 캐릭터에 없으면 그 Track만 건너뛰고 나머지는 계속 적용한다. (기획서 64)
 */
export function evaluateAnimation(
  animation: PuppetAnimation,
  bones: readonly PuppetBone[],
  time: number,
  amount = 1,
): Map<string, BoneDelta> {
  const deltas = new Map<string, BoneDelta>();

  const duration = Math.max(0.0001, animation.duration);
  /** focus 태그별 "그 태그를 달고 있거나 아래에 매단" 관절들. 태그마다 한 번만 구한다. */
  const carriers = new Map<string, Set<string>>();

  for (const track of animation.tracks) {
    const targets = resolveTargets(track, bones);
    if (targets.length === 0) continue;

    const spotlight = focusedTargets(track.focus, targets, bones, carriers);
    const otherShare = track.focusOther ?? DEFAULT_FOCUS_OTHER;

    const base = track.property === "scaleX" || track.property === "scaleY" ? 1 : 0;
    const stagger = track.stagger ?? 0;
    // 어긋냄이 없으면 모든 대상이 같은 값을 쓰므로 한 번만 뽑는다.
    const shared = stagger === 0 ? sampleTrack(track.keys, time, base) : 0;

    for (let i = 0; i < targets.length; i += 1) {
      const bone = targets[i]!;
      const value =
        stagger === 0
          ? shared
          : sampleTrack(
              track.keys,
              // 반복 애니메이션은 주기를 감아서 이어 붙이고, 한 번짜리는 끝에 머문다.
              wrap(time + (duration * stagger * i) / targets.length, duration, animation.loop),
              base,
            );

      // 주인공이 정해진 Track에서, 주인공이 아닌 대상은 거드는 정도로만 움직인다.
      const share = !spotlight || spotlight.has(bone.id) ? 1 : otherShare;

      let delta = deltas.get(bone.id);
      if (!delta) {
        delta = { ...NO_DELTA };
        deltas.set(bone.id, delta);
      }
      applyProperty(delta, track.property, value, bone.motionStrength * amount * share);
    }
  }

  return deltas;
}

/**
 * 이 애니메이션에 키가 찍혀 있는 시각들. 타임라인에 표시할 자리다.
 *
 * `boneId`를 주면 그 관절을 움직이는 Track만 본다. 태그로 잡는 Track도 포함된다 —
 * 화면에서는 "이 관절이 이 시각에 움직인다"가 보여야 하기 때문이다.
 * 같은 시각의 키는 하나로 합치고, 시간 순으로 돌려준다.
 */
export function keyTimes(
  animation: PuppetAnimation,
  bones: readonly PuppetBone[],
  boneId?: string,
): number[] {
  const times = new Set<number>();

  for (const track of animation.tracks) {
    if (boneId && !resolveTargets(track, bones).some((bone) => bone.id === boneId)) continue;
    for (const key of track.keys) times.add(key.time);
  }

  return [...times].sort((a, b) => a - b);
}

/** 애니메이션 사이에 발생한 이벤트를 모은다. (기획서 42) */
export function collectEvents(
  animation: PuppetAnimation,
  from: number,
  to: number,
): string[] {
  if (!animation.events || animation.events.length === 0) return [];
  const [start, end] = from <= to ? [from, to] : [to, from];
  return animation.events
    .filter((event) => event.time > start && event.time <= end)
    .map((event) => event.event);
}

export interface PlaybackState {
  animation: PuppetAnimation;
  time: number;
  speed: number;
  /** 움직임 크기 배율. (기획서 31) */
  amount: number;
  playing: boolean;
}

/**
 * 재생 커서. 렌더러에 의존하지 않으므로 편집기와 런타임이 함께 쓴다.
 * 시간만 굴리고, 실제 변형은 evaluateAnimation이 맡는다.
 */
export class AnimationPlayer {
  private state: PlaybackState | null = null;
  private listeners = new Set<(event: string) => void>();

  play(animation: PuppetAnimation, options: { speed?: number; amount?: number } = {}): void {
    this.state = {
      animation,
      time: 0,
      speed: options.speed ?? 1,
      amount: options.amount ?? 1,
      playing: true,
    };
  }

  stop(): void {
    this.state = null;
  }

  /**
   * 재생을 멈추되 자세는 그대로 둔다. 타임라인을 붙잡고 있는 동안 쓴다.
   * `stop()`과 달리 시각과 애니메이션이 남아 있어 `resume()`으로 이어 갈 수 있다.
   */
  pause(): void {
    if (this.state) this.state.playing = false;
  }

  /** 멈춘 자리에서 다시 흐르게 한다. 끝에 서 있으면 처음부터 다시 간다. */
  resume(): void {
    if (!this.state) return;
    if (this.state.time >= this.state.animation.duration && !this.state.animation.loop) {
      this.state.time = 0;
    }
    this.state.playing = true;
  }

  /**
   * 특정 시각으로 옮긴다. 재생 여부는 건드리지 않는다.
   *
   * 이동 중에는 이벤트를 내지 않는다. 타임라인을 훑을 때마다 공격 판정이 울리면 안 된다.
   */
  seek(time: number): void {
    const state = this.state;
    if (!state) return;
    state.time = Math.min(Math.max(0, time), state.animation.duration);
  }

  /** 지금 시각. 재생 중이 아니면 0이다. */
  get time(): number {
    return this.state?.time ?? 0;
  }

  /** 지금 애니메이션의 길이(초). 없으면 0이다. */
  get duration(): number {
    return this.state?.animation.duration ?? 0;
  }

  /** 시각을 굴리지 않고 지금 자세만 구한다. 타임라인을 붙잡고 있을 때 쓴다. */
  sample(bones: readonly PuppetBone[]): Map<string, BoneDelta> {
    const state = this.state;
    if (!state) return new Map();
    return evaluateAnimation(state.animation, bones, state.time, state.amount);
  }

  /** 재생 중에 속도를 바꾼다. 시간은 그대로 두고 흐르는 빠르기만 달라진다. */
  setSpeed(speed: number): void {
    if (this.state) this.state.speed = speed;
  }

  /** 재생 중에 움직임 크기를 바꾼다. */
  setAmount(amount: number): void {
    if (this.state) this.state.amount = amount;
  }

  get current(): Readonly<PlaybackState> | null {
    return this.state;
  }

  onEvent(listener: (event: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** dt는 초 단위. 진행한 뒤의 Bone 변화량을 돌려준다. */
  update(dt: number, bones: readonly PuppetBone[]): Map<string, BoneDelta> {
    const state = this.state;
    if (!state || !state.playing) return new Map();

    const previous = state.time;
    let time = previous + dt * state.speed;
    const duration = Math.max(0.0001, state.animation.duration);

    if (time >= duration) {
      if (state.animation.loop) {
        for (const event of collectEvents(state.animation, previous, duration)) this.emit(event);
        time %= duration;
        for (const event of collectEvents(state.animation, 0, time)) this.emit(event);
      } else {
        for (const event of collectEvents(state.animation, previous, duration)) this.emit(event);
        time = duration;
        state.playing = false;
      }
    } else {
      for (const event of collectEvents(state.animation, previous, time)) this.emit(event);
    }

    state.time = time;
    return evaluateAnimation(state.animation, bones, time, state.amount);
  }

  private emit(event: string): void {
    for (const listener of this.listeners) listener(event);
  }
}
