import type { PuppetBone } from "../format/types";
import { applyPoint, type BoneDelta, type Mat2D } from "../skeleton/transform";

/**
 * Secondary Motion. (기획서 29)
 *
 * 꼬리 · 머리카락 · 촉수처럼 몸에 매달린 부위가 몸을 한 박자 늦게 따라오게 한다.
 * 정밀한 물리 엔진을 쓰지 않고, 관절마다 damped spring 하나씩만 돌린다. (기획서 29)
 *
 * 원리: 부모 관절이 움직이면 매달린 쪽은 관성 때문에 뒤로 밀린다.
 * 그래서 부모의 **가속도**를 흔들림의 입력으로 쓰고, 스프링이 다시 제자리로 당긴다.
 */

/** 제자리로 돌아오려는 힘. 클수록 빨리 원위치한다. */
const STIFFNESS = 55;
/** 감쇠. 클수록 빨리 잦아든다. */
const DAMPING = 6.5;
/**
 * 부모 가속도를 흔들림으로 바꾸는 비율.
 * 대기의 3~4px 움직임에서도 눈에 보이도록 맞췄다.
 * (그 정도 흔들림이면 가속도가 대략 250px/s²이고, 여기서 5도쯤 흔들린다)
 */
const DRIVE = 0.02;
/** 부모 회전 속도를 흔들림으로 바꾸는 비율. */
const ROTATION_DRIVE = 1.2;
/** 흔들림 각도 상한(라디안). 너무 커지면 그림이 뒤집혀 보인다. */
const MAX_ANGLE = 0.6;
/**
 * 위치가 부모를 따라잡는 속도(1/초). 클수록 빨리 따라붙는다.
 * 회전만으로는 위아래 움직임에 거의 반응하지 못해서, 위치 지연을 함께 준다.
 */
const FOLLOW_RATE = 9;
/** 뒤처진 거리를 실제 어긋남으로 옮기는 비율. 1이면 부모를 아예 못 따라간다. */
const LAG = 0.75;
/** 뒤처짐 상한(px). */
const MAX_LAG = 18;
/** 이 태그가 붙은 관절만 흔들린다. */
export const SECONDARY_TAG = "secondary";

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

interface SpringState {
  angle: number;
  velocity: number;
  anchorX: number;
  anchorY: number;
  velocityX: number;
  velocityY: number;
  rotation: number;
  /** 부모를 뒤늦게 따라가는 위치. 부모가 앞서 나간 만큼이 뒤처짐이 된다. */
  followX: number;
  followY: number;
  lagX: number;
  lagY: number;
  started: boolean;
}

/**
 * 관절마다 스프링 하나를 들고 있는 상태 저장소.
 * 시간에 따라 누적되는 값이라 재생을 멈추면 reset한다.
 */
export class SecondaryMotion {
  private states = new Map<string, SpringState>();

  reset(): void {
    this.states.clear();
  }

  /**
   * 흔들림을 계산해 deltas에 더한다.
   *
   * @param worldMatrices 이번 프레임의 스킨 행렬(애니메이션만 반영된 상태)
   * @param amount 0이면 끔, 1이 기본. 애니메이션마다 조절한다. (기획서 31)
   */
  apply(
    bones: readonly PuppetBone[],
    deltas: Map<string, BoneDelta>,
    worldMatrices: ReadonlyMap<string, Mat2D>,
    dt: number,
    amount = 1,
  ): Map<string, BoneDelta> {
    if (dt <= 0 || amount <= 0) return deltas;

    // 프레임이 튀어도 스프링이 폭발하지 않게 상한을 둔다.
    const step = Math.min(dt, 1 / 30);
    const byId = new Map(bones.map((bone) => [bone.id, bone]));

    for (const bone of bones) {
      if (!bone.tags.includes(SECONDARY_TAG)) continue;

      // 매달린 기준점은 부모다. 부모가 없으면 자기 자신의 움직임을 본다.
      const anchorBone = bone.parentId ? byId.get(bone.parentId) : undefined;
      const source = anchorBone ?? bone;
      const matrix = worldMatrices.get(source.id);
      if (!matrix) continue;

      const anchor = applyPoint(matrix, source.x, source.y);
      const rotation = Math.atan2(matrix.b, matrix.a);
      const state = this.stateFor(bone.id, anchor.x, anchor.y, rotation);

      // 첫 프레임은 기준만 잡고 넘어간다. 시작하자마자 튀는 것을 막는다.
      if (!state.started) {
        state.started = true;
        state.anchorX = anchor.x;
        state.anchorY = anchor.y;
        state.rotation = rotation;
        state.followX = anchor.x - source.x;
        state.followY = anchor.y - source.y;
        continue;
      }

      const velocityX = (anchor.x - state.anchorX) / step;
      const velocityY = (anchor.y - state.anchorY) / step;
      const accelerationX = (velocityX - state.velocityX) / step;
      const accelerationY = (velocityY - state.velocityY) / step;
      const rotationVelocity = (rotation - state.rotation) / step;

      // 가로 가속도는 좌우로, 세로 가속도는 조금 약하게 흔든다.
      // 부모가 돌면 매달린 쪽은 그만큼 뒤처진다.
      const force =
        -accelerationX * DRIVE -
        accelerationY * DRIVE * 0.35 -
        rotationVelocity * ROTATION_DRIVE;

      state.velocity += (-STIFFNESS * state.angle + force) * step;
      state.velocity *= Math.exp(-DAMPING * step);
      state.angle += state.velocity * step;
      state.angle = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, state.angle));

      // 위치 지연: 부모가 기준 자세에서 얼마나 벗어났는지를 뒤늦게 따라간다.
      const displacementX = anchor.x - source.x;
      const displacementY = anchor.y - source.y;
      const catchUp = 1 - Math.exp(-FOLLOW_RATE * step);
      state.followX += (displacementX - state.followX) * catchUp;
      state.followY += (displacementY - state.followY) * catchUp;
      state.lagX = clamp((displacementX - state.followX) * LAG, MAX_LAG);
      state.lagY = clamp((displacementY - state.followY) * LAG, MAX_LAG);

      state.anchorX = anchor.x;
      state.anchorY = anchor.y;
      state.velocityX = velocityX;
      state.velocityY = velocityY;
      state.rotation = rotation;

      const scale = amount * bone.motionStrength;
      const swing = state.angle * scale;
      // 부모가 앞서 나간 만큼 반대로 밀어 두면 뒤늦게 따라오는 것처럼 보인다.
      const offsetX = -state.lagX * scale;
      const offsetY = -state.lagY * scale;
      if (swing === 0 && offsetX === 0 && offsetY === 0) continue;

      const delta = deltas.get(bone.id);
      if (delta) {
        delta.rotation += swing;
        delta.x += offsetX;
        delta.y += offsetY;
      } else {
        deltas.set(bone.id, {
          x: offsetX,
          y: offsetY,
          rotation: swing,
          scaleX: 1,
          scaleY: 1,
        });
      }
    }

    return deltas;
  }

  /** 지금 흔들리고 있는 각도. 표시나 테스트용. */
  angleOf(boneId: string): number {
    return this.states.get(boneId)?.angle ?? 0;
  }

  /** 지금 부모보다 얼마나 뒤처져 있는지(px). 표시나 테스트용. */
  lagOf(boneId: string): { x: number; y: number } {
    const state = this.states.get(boneId);
    return { x: state?.lagX ?? 0, y: state?.lagY ?? 0 };
  }

  private stateFor(id: string, x: number, y: number, rotation: number): SpringState {
    const existing = this.states.get(id);
    if (existing) return existing;

    const created: SpringState = {
      angle: 0,
      velocity: 0,
      anchorX: x,
      anchorY: y,
      velocityX: 0,
      velocityY: 0,
      rotation,
      followX: 0,
      followY: 0,
      lagX: 0,
      lagY: 0,
      started: false,
    };
    this.states.set(id, created);
    return created;
  }
}
