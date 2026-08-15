import type {
  AnimationTrack,
  Interpolation,
  Keyframe,
  PuppetAnimation,
  PuppetBone,
  TrackProperty,
} from "../format/types";
import { getBonesByTag } from "../skeleton";
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

  for (const track of animation.tracks) {
    const targets = resolveTargets(track, bones);
    if (targets.length === 0) continue;

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

      let delta = deltas.get(bone.id);
      if (!delta) {
        delta = { ...NO_DELTA };
        deltas.set(bone.id, delta);
      }
      applyProperty(delta, track.property, value, bone.motionStrength * amount);
    }
  }

  return deltas;
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
