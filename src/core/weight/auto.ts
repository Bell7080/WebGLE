/**
 * 자동 가중치. 관절을 놓기만 해도 그림이 곧바로 따라 움직이게 하려는 것이다.
 *
 * 손으로 칠하는 것이 이 툴에서 가장 오래 걸리는 일이었다. 관절 다섯 개짜리 캐릭터도
 * 전부 칠하기 전에는 재생 버튼이 아무것도 하지 않았고, 처음 쓰는 사람은 그 지점에서
 * 툴이 고장 난 줄 알게 된다. 그래서 칠하기는 "처음부터 하는 일"이 아니라
 * "자동으로 깔린 것을 고치는 일"이 되어야 한다. (기획서 72 · 73의 "자동값 우선")
 *
 * 방식은 거리 기반이다. 관절 하나를 부모에서 자기까지의 선분으로 보고,
 * 정점마다 각 선분까지의 거리를 재서 가까운 쪽에 많이 준다.
 * 무릎 · 팔꿈치처럼 관절이 이어져 있으면 선분들이 팔다리를 자연스럽게 나눠 가진다.
 */
import type { PuppetBone, PuppetMesh } from "../format/types";
import { vertexCount } from "../mesh";
import type { WeightMap } from "./index";
import { MAX_BONES_PER_VERTEX } from "./index";

/**
 * 거리에 따라 얼마나 빠르게 영향이 줄어드는지.
 *
 * 클수록 관절 경계가 또렷해지고, 작을수록 넓게 뭉갠다.
 * 3은 팔다리가 서로 침범하지 않으면서 이음매는 부드럽게 남는 값이다.
 */
export const AUTO_FALLOFF = 3;

/** 관절 위에 정확히 얹힌 정점이 0으로 나누어지지 않게 하는 최소 거리(px). */
const MIN_DISTANCE = 1;

/** 관절 하나가 차지하는 선분. 부모가 없으면 길이 0의 점이다. */
export interface BoneSegment {
  boneId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * 관절들을 선분으로 바꾼다.
 *
 * 부모에서 자기까지를 몸통으로 본다. 이 툴의 관절은 점 하나지만,
 * 사람이 팔이라고 부르는 것은 어깨점과 팔꿈치점 **사이**이기 때문이다.
 */
export function boneSegments(bones: readonly PuppetBone[]): BoneSegment[] {
  const byId = new Map(bones.map((bone) => [bone.id, bone]));
  return bones.map((bone) => {
    const parent = bone.parentId ? byId.get(bone.parentId) : undefined;
    return {
      boneId: bone.id,
      x1: parent?.x ?? bone.x,
      y1: parent?.y ?? bone.y,
      x2: bone.x,
      y2: bone.y,
    };
  });
}

function distanceToSegment(px: number, py: number, s: BoneSegment): number {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const lengthSq = dx * dx + dy * dy;

  let t = 0;
  if (lengthSq > 0) {
    t = ((px - s.x1) * dx + (py - s.y1) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
  }
  return Math.hypot(px - (s.x1 + dx * t), py - (s.y1 + dy * t));
}

export interface AutoWeightOptions {
  /**
   * 이 관절들만 계산한다. 없으면 전부.
   * 직접 칠한 관절을 자동 계산이 덮어써 버리지 않게 하기 위한 것이다.
   */
  only?: ReadonlySet<string> | null;
  /** 그림이 그려진 정점만 칠한다. 투명한 바깥은 건드리지 않는다. */
  mask?: readonly boolean[] | null;
  falloff?: number;
}

/**
 * 거리 기반 자동 가중치.
 *
 * 정점마다 가까운 관절 순으로 최대 {@link MAX_BONES_PER_VERTEX}개를 골라
 * 합이 1이 되게 나눠 준다. 여기서 이미 나눠 두면 화면의 영향 영역 표시가
 * 실제로 적용될 값과 같아진다 — 보이는 것과 움직이는 것이 어긋나지 않는다.
 *
 * `only`를 주면 그 관절들의 채널만 결과에 담는다. 남은 관절의 몫은 계산에
 * **포함하되** 결과에서 빼는데, 그래야 손으로 칠한 관절 옆에서 자동 관절이
 * 혼자 1을 다 가져가는 일이 생기지 않는다.
 */
export function autoWeights(
  bones: readonly PuppetBone[],
  mesh: PuppetMesh,
  options: AutoWeightOptions = {},
): WeightMap {
  const { only = null, mask = null, falloff = AUTO_FALLOFF } = options;

  const segments = boneSegments(bones);
  const count = vertexCount(mesh);
  const result: WeightMap = {};
  if (segments.length === 0 || count === 0) return result;

  const wanted = segments.filter((segment) => !only || only.has(segment.boneId));
  if (wanted.length === 0) return result;

  for (const segment of wanted) result[segment.boneId] = new Array<number>(count).fill(0);

  // 정점 하나마다 후보를 담아 두고 재사용한다. 격자가 크면 이 할당이 그대로 비용이 된다.
  const scores: { boneId: string; score: number }[] = [];

  for (let i = 0; i < count; i += 1) {
    if (mask && !mask[i]) continue;

    const x = mesh.vertices[i * 2] ?? 0;
    const y = mesh.vertices[i * 2 + 1] ?? 0;

    scores.length = 0;
    for (const segment of segments) {
      const distance = Math.max(MIN_DISTANCE, distanceToSegment(x, y, segment));
      scores.push({ boneId: segment.boneId, score: 1 / distance ** falloff });
    }

    scores.sort((a, b) => b.score - a.score);
    const kept = scores.slice(0, MAX_BONES_PER_VERTEX);
    const total = kept.reduce((sum, item) => sum + item.score, 0);
    if (total <= 0) continue;

    for (const item of kept) {
      const channel = result[item.boneId];
      if (channel) channel[i] = item.score / total;
    }
  }

  return result;
}

/**
 * 자동으로 계산한 값을 기존 가중치에 덮어씌운다.
 *
 * `only`에 든 관절의 채널만 통째로 갈아 끼우고 나머지는 손대지 않는다.
 * 손으로 칠한 작업이 관절을 하나 더 놓았다는 이유로 사라지면 안 되기 때문이다.
 */
export function withAutoWeights(
  current: WeightMap,
  bones: readonly PuppetBone[],
  mesh: PuppetMesh,
  options: AutoWeightOptions = {},
): WeightMap {
  const computed = autoWeights(bones, mesh, options);
  return { ...current, ...computed };
}

/**
 * 자동으로 맡길 관절들. `autoWeight`가 켜진 것만 고른다.
 *
 * 값이 없으면 꺼진 것으로 본다. 예전 파일의 관절에는 이 값이 없는데,
 * 그것들은 전부 손으로 칠한 것이라 자동 계산이 덮어쓰면 작업이 사라진다.
 */
export function autoManagedBones(bones: readonly PuppetBone[]): Set<string> {
  return new Set(bones.filter((bone) => bone.autoWeight === true).map((bone) => bone.id));
}

/**
 * 이미 손으로 잡은 영역은 보존하면서, 실루엣 안의 빈 정점만 거리 기반 값으로 메운다.
 * 전체 자동 계산과 달리 기존 채널을 덮지 않으므로 마지막 안전망으로 부담 없이 쓸 수 있다.
 */
export function fillUnweighted(
  current: WeightMap,
  bones: readonly PuppetBone[],
  mesh: PuppetMesh,
  mask?: readonly boolean[] | null,
): WeightMap {
  const computed = autoWeights(bones, mesh, { mask });
  const count = vertexCount(mesh);
  const result: WeightMap = Object.fromEntries(
    bones.map((bone) => [bone.id, [...(current[bone.id] ?? new Array<number>(count).fill(0))]]),
  );

  for (let index = 0; index < count; index += 1) {
    if (mask && !mask[index]) continue;
    // 어떤 관절이든 이미 칠해졌다면 사용자의 경계 결정을 그대로 둔다.
    // 정규화 단계에서 제곱된 뒤 0.001 이하로 사라질 값은 실질적으로 빈 영역이므로 함께 보완한다.
    if (bones.some((bone) => (current[bone.id]?.[index] ?? 0) > Math.sqrt(0.001))) continue;
    for (const bone of bones) result[bone.id]![index] = computed[bone.id]?.[index] ?? 0;
  }
  return result;
}

/**
 * 한 정점에만 찍힌 고립 가중치와 거의 보이지 않는 잔여 값을 걷어낸 뒤 생긴 구멍을 다시 메운다.
 * 8방향 이웃을 쓰므로 대각선으로 이어지는 가느다란 팔다리는 정상 영역으로 유지된다.
 */
export function cleanupWeights(
  current: WeightMap,
  bones: readonly PuppetBone[],
  mesh: PuppetMesh,
  mask?: readonly boolean[] | null,
): WeightMap {
  const count = vertexCount(mesh);
  const stride = mesh.cols + 1;
  const cleaned: WeightMap = {};

  for (const bone of bones) {
    const source = current[bone.id] ?? new Array<number>(count).fill(0);
    const channel = [...source];
    for (let index = 0; index < count; index += 1) {
      if ((mask && !mask[index]) || (source[index] ?? 0) <= 0) continue;
      const row = Math.floor(index / stride);
      const col = index % stride;
      let supportingNeighbors = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if ((dx === 0 && dy === 0) || row + dy < 0 || row + dy > mesh.rows || col + dx < 0 || col + dx > mesh.cols) continue;
          if ((source[(row + dy) * stride + col + dx] ?? 0) > 0.01) supportingNeighbors += 1;
        }
      }
      // 아주 옅은 자국과 주변 지지가 전혀 없는 한 점짜리 오점을 제거한다.
      if ((source[index] ?? 0) < 0.03 || supportingNeighbors === 0) channel[index] = 0;
    }
    cleaned[bone.id] = channel;
  }

  return fillUnweighted(cleaned, bones, mesh, mask);
}
