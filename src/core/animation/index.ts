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

  for (const track of animation.tracks) {
    const targets = resolveTargets(track, bones);
    if (targets.length === 0) continue;

    const base = track.property === "scaleX" || track.property === "scaleY" ? 1 : 0;
    const value = sampleTrack(track.keys, time, base);

    for (const bone of targets) {
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
