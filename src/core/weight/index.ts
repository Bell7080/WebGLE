import type { PuppetMesh, VertexWeight } from "../format/types";
import { vertexCount } from "../mesh";

/** 한 Bone이 정점마다 가지는 원본 영향값(0~1). 정규화 전 값이다. */
export type WeightMap = Record<string, number[]>;

/** 정점 하나가 참조할 수 있는 최대 Bone 수. 런타임을 가볍게 유지한다. (기획서 49) */
export const MAX_BONES_PER_VERTEX = 4;

/**
 * 칠한 농도의 차이를 실제 변형에서 더 분명하게 만드는 지수.
 * 0.5 대 0.1처럼 주요 영역이 충분히 칠해졌다면 제곱 후 정규화해 약한 겹침보다 거의 고정되게 한다.
 */
const WEIGHT_DOMINANCE_POWER = 2;

/**
 * 원 또는 캡슐 모양의 영향 영역. (기획서 18)
 * x1,y1 == x2,y2 이면 원이고, 다르면 두 점을 잇는 캡슐이다.
 */
export interface Influence {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  radius: number;
  /** 중심에서의 가중치 0~1. */
  strength: number;
  /** 0이면 선형, 1이면 가장자리가 가장 부드럽다. */
  softness: number;
}

function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;

  let t = 0;
  if (lengthSq > 0) {
    t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
  }

  const nx = x1 + dx * t;
  const ny = y1 + dy * t;
  return Math.hypot(px - nx, py - ny);
}

/** 영역 안에서의 가중치. 중심이 높고 가장자리로 갈수록 낮아진다. (Soft Falloff, 기획서 16) */
export function influenceAt(influence: Influence, x: number, y: number): number {
  const { x1, y1, x2, y2, radius, strength, softness } = influence;
  if (radius <= 0) return 0;

  const distance = distanceToSegment(x, y, x1, y1, x2, y2);
  if (distance >= radius) return 0;

  const t = 1 - distance / radius;
  const smooth = t * t * (3 - 2 * t);
  const shaped = t + (smooth - t) * Math.max(0, Math.min(1, softness));
  return Math.max(0, Math.min(1, shaped * strength));
}

function ensureChannel(map: WeightMap, boneId: string, count: number): number[] {
  const existing = map[boneId];
  if (existing && existing.length === count) return existing;

  const channel = new Array<number>(count).fill(0);
  if (existing) {
    for (let i = 0; i < Math.min(existing.length, count); i += 1) channel[i] = existing[i] ?? 0;
  }
  map[boneId] = channel;
  return channel;
}

/**
 * 영향 영역을 Bone에 적용한다. 기존 값과는 최댓값으로 합친다.
 * 같은 자리를 여러 번 칠해도 1을 넘지 않는다.
 */
export function applyInfluence(
  map: WeightMap,
  boneId: string,
  mesh: PuppetMesh,
  influence: Influence,
  mask?: readonly boolean[] | null,
): WeightMap {
  const count = vertexCount(mesh);
  const next: WeightMap = { ...map };
  const channel = [...ensureChannel(next, boneId, count)];

  for (let i = 0; i < count; i += 1) {
    if (mask && !mask[i]) continue;
    const value = influenceAt(influence, mesh.vertices[i * 2] ?? 0, mesh.vertices[i * 2 + 1] ?? 0);
    channel[i] = Math.max(channel[i] ?? 0, value);
  }

  next[boneId] = channel;
  return next;
}

/**
 * 브러시로 덧칠하거나 지운다. 수채화처럼 칠할수록 쌓인다. (기획서 16)
 *
 * influence.strength가 한 번 칠할 때 더해지는 양이다.
 * 0.1이면 열 번 칠해야 가득 차고, 1이면 한 번에 최대가 된다.
 * 지우개도 같은 크기 · 같은 양으로 깎아낸다.
 */
export function paintInfluence(
  map: WeightMap,
  boneId: string,
  mesh: PuppetMesh,
  influence: Influence,
  erase = false,
  mask?: readonly boolean[] | null,
): WeightMap {
  const count = vertexCount(mesh);
  const next: WeightMap = { ...map };
  const channel = [...ensureChannel(next, boneId, count)];

  for (let i = 0; i < count; i += 1) {
    if (mask && !mask[i]) continue;
    const value = influenceAt(influence, mesh.vertices[i * 2] ?? 0, mesh.vertices[i * 2 + 1] ?? 0);
    if (value <= 0) continue;

    const current = channel[i] ?? 0;
    channel[i] = erase ? Math.max(0, current - value) : Math.min(1, current + value);
  }

  next[boneId] = channel;
  return next;
}

/** Bone이 사라지면 그 채널도 버린다. */
export function removeBoneWeights(map: WeightMap, boneId: string): WeightMap {
  const { [boneId]: _removed, ...rest } = map;
  return rest;
}

/**
 * 정점마다 가중치를 정규화한다. (기획서 17)
 * 영향이 큰 순으로 최대 MAX_BONES_PER_VERTEX개만 남기고 합이 1이 되게 만든다.
 * 아무도 칠하지 않은 정점은 빈 채로 둔다. 그 정점은 움직이지 않는다.
 */
export function normalizeWeights(
  map: WeightMap,
  count: number,
  /** 앞에 놓인 관절일수록 앞 레이어이며, 겹친 영역을 조금 더 강하게 가져간다. */
  layerOrder: readonly string[] = [],
): VertexWeight[] {
  const boneIds = Object.keys(map);
  const layerById = new Map(layerOrder.map((boneId, index) => [boneId, index]));

  return Array.from({ length: count }, (_unused, index) => {
    const candidates: { boneId: string; value: number }[] = [];
    for (const boneId of boneIds) {
      const painted = map[boneId]?.[index] ?? 0;
      // 저장되는 값만 강조하고 편집용 원본 농도는 보존해, 지우개와 덧칠의 감각은 그대로 유지한다.
      const base = Math.pow(Math.max(0, Math.min(1, painted)), WEIGHT_DOMINANCE_POWER);
      // 뒤 레이어도 사라지지는 않도록 전체 목록에 걸쳐 최대 35%만 낮춘다.
      const layer = layerById.get(boneId);
      const depth = layer === undefined || layerOrder.length < 2
        ? 0
        : layer / (layerOrder.length - 1);
      const value = base * (1 - depth * 0.35);
      if (value > 0.001) candidates.push({ boneId, value });
    }

    candidates.sort((a, b) => b.value - a.value);
    const kept = candidates.slice(0, MAX_BONES_PER_VERTEX);
    const total = kept.reduce((sum, item) => sum + item.value, 0);
    if (total <= 0) return { boneIds: [], weights: [] };

    return {
      boneIds: kept.map((item) => item.boneId),
      weights: kept.map((item) => item.value / total),
    };
  });
}

/** 저장된 정규화 결과를 다시 편집 가능한 형태로 되돌린다. */
export function toWeightMap(weights: readonly VertexWeight[]): WeightMap {
  const map: WeightMap = {};
  weights.forEach((vertex, index) => {
    vertex.boneIds.forEach((boneId, slot) => {
      const channel = ensureChannel(map, boneId, weights.length);
      channel[index] = vertex.weights[slot] ?? 0;
    });
  });
  return map;
}

/** 정점이 어떤 Bone의 영향도 받지 않는지. 표시용. */
export function unweightedCount(weights: readonly VertexWeight[]): number {
  return weights.filter((vertex) => vertex.boneIds.length === 0).length;
}

/**
 * 격자 해상도가 바뀔 때 칠해 둔 가중치를 새 격자로 옮긴다.
 *
 * 두 격자가 같은 이미지를 덮고 있으므로, 새 정점 자리의 값을 옛 격자에서
 * 이중 선형 보간으로 읽어 온다. 칠한 작업을 잃지 않기 위한 것이다.
 */
export function resampleWeights(
  from: PuppetMesh,
  to: PuppetMesh,
  map: WeightMap,
): WeightMap {
  const count = vertexCount(to);
  const result: WeightMap = {};

  for (const [boneId, channel] of Object.entries(map)) {
    const moved = new Array<number>(count).fill(0);

    const fromWidth = from.vertices[from.vertices.length - 2] ?? 1;
    const fromHeight = from.vertices[from.vertices.length - 1] ?? 1;
    const toWidth = to.vertices[to.vertices.length - 2] ?? 1;
    const toHeight = to.vertices[to.vertices.length - 1] ?? 1;
    for (let i = 0; i < count; i += 1) {
      // 이미지 크기가 바뀌는 스킨 교체에서도 같은 상대 위치의 칠을 읽는다.
      const x = ((to.vertices[i * 2] ?? 0) / (toWidth || 1)) * fromWidth;
      const y = ((to.vertices[i * 2 + 1] ?? 0) / (toHeight || 1)) * fromHeight;
      moved[i] = sampleGrid(channel, from, x, y);
    }

    result[boneId] = moved;
  }

  return result;
}

/** 옛 격자에서 (x, y) 위치의 값을 이중 선형 보간으로 읽는다. */
function sampleGrid(
  channel: readonly number[],
  mesh: PuppetMesh,
  x: number,
  y: number,
): number {
  const width = mesh.vertices[mesh.vertices.length - 2] ?? 1;
  const height = mesh.vertices[mesh.vertices.length - 1] ?? 1;

  const u = (x / (width || 1)) * mesh.cols;
  const v = (y / (height || 1)) * mesh.rows;
  const col = Math.min(mesh.cols - 1, Math.max(0, Math.floor(u)));
  const row = Math.min(mesh.rows - 1, Math.max(0, Math.floor(v)));
  const fx = Math.min(1, Math.max(0, u - col));
  const fy = Math.min(1, Math.max(0, v - row));

  const stride = mesh.cols + 1;
  const topLeft = row * stride + col;
  const a = channel[topLeft] ?? 0;
  const b = channel[topLeft + 1] ?? 0;
  const c = channel[topLeft + stride] ?? 0;
  const d = channel[topLeft + stride + 1] ?? 0;

  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return top + (bottom - top) * fy;
}
