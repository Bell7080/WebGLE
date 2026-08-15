import type { DeformMode, PuppetBone, PuppetMesh } from "../format/types";
import { sortByHierarchy } from "./index";

/** 2D 아핀 변환. [a c tx / b d ty / 0 0 1] */
export interface Mat2D {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export const IDENTITY: Mat2D = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

export function multiply(m: Mat2D, n: Mat2D): Mat2D {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    tx: m.a * n.tx + m.c * n.ty + m.tx,
    ty: m.b * n.tx + m.d * n.ty + m.ty,
  };
}

export function invert(m: Mat2D): Mat2D {
  const det = m.a * m.d - m.b * m.c;
  if (det === 0) return { ...IDENTITY };
  const inv = 1 / det;
  return {
    a: m.d * inv,
    b: -m.b * inv,
    c: -m.c * inv,
    d: m.a * inv,
    tx: (m.c * m.ty - m.d * m.tx) * inv,
    ty: (m.b * m.tx - m.a * m.ty) * inv,
  };
}

export function applyPoint(m: Mat2D, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.c * y + m.tx, y: m.b * x + m.d * y + m.ty };
}

export function compose(
  x: number,
  y: number,
  rotation: number,
  scaleX: number,
  scaleY: number,
): Mat2D {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    a: cos * scaleX,
    b: sin * scaleX,
    c: -sin * scaleY,
    d: cos * scaleY,
    tx: x,
    ty: y,
  };
}

/** 애니메이션이 Bone에 주는 변화량. 기준 자세(rest)에 곱해진다. */
export interface BoneDelta {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export const NO_DELTA: BoneDelta = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

/** 편집기에 저장된 기준 자세의 월드 변환. */
export function restWorldTransforms(bones: readonly PuppetBone[]): Map<string, Mat2D> {
  const result = new Map<string, Mat2D>();
  for (const bone of bones) {
    result.set(bone.id, compose(bone.x, bone.y, bone.rotation, bone.scaleX, bone.scaleY));
  }
  return result;
}

/**
 * Bone마다 "기준 자세 → 현재 자세" 변환(스킨 행렬)을 만든다.
 * 부모가 움직이면 자식도 따라간다. (기획서 13)
 */
export function computeSkinMatrices(
  bones: readonly PuppetBone[],
  deltas: ReadonlyMap<string, BoneDelta>,
): Map<string, Mat2D> {
  const rest = restWorldTransforms(bones);
  const world = new Map<string, Mat2D>();
  const skin = new Map<string, Mat2D>();

  for (const bone of sortByHierarchy(bones)) {
    const restWorld = rest.get(bone.id) ?? IDENTITY;
    const parentRest = bone.parentId ? rest.get(bone.parentId) : undefined;
    const parentWorld = bone.parentId ? world.get(bone.parentId) : undefined;

    // 부모 기준 지역 변환 = 부모 기준 자세의 역 × 자기 기준 자세
    const local = parentRest ? multiply(invert(parentRest), restWorld) : restWorld;

    // 고정 계열은 자기 애니메이션뿐 아니라 부모 변환도 받지 않아 발 같은 기준점을 붙잡는다.
    const pinned = bone.deform === "pinnedSoft" || bone.deform === "fixed";
    if (pinned) {
      world.set(bone.id, restWorld);
      skin.set(bone.id, IDENTITY);
      continue;
    }

    const delta = deltas.get(bone.id) ?? NO_DELTA;
    const deltaMatrix = compose(delta.x, delta.y, delta.rotation, delta.scaleX, delta.scaleY);

    const boneWorld = multiply(parentWorld ?? IDENTITY, multiply(local, deltaMatrix));
    world.set(bone.id, boneWorld);
    skin.set(bone.id, multiply(boneWorld, invert(restWorld)));
  }

  return skin;
}

/**
 * 정점을 Bone 가중치에 따라 변형한다 (Linear Blend Skinning).
 * 가중치가 없는 정점은 원본 자리에 그대로 둔다. (기획서 64의 태도와 같다)
 */
export function skinVertices(
  mesh: PuppetMesh,
  skinMatrices: ReadonlyMap<string, Mat2D>,
  out?: Float32Array,
  deformModes: ReadonlyMap<string, DeformMode> = new Map(),
): Float32Array {
  const count = mesh.vertices.length / 2;
  const result = out && out.length === mesh.vertices.length ? out : new Float32Array(mesh.vertices.length);

  for (let i = 0; i < count; i += 1) {
    const x = mesh.vertices[i * 2] ?? 0;
    const y = mesh.vertices[i * 2 + 1] ?? 0;
    const vertexWeight = mesh.weights[i];

    if (!vertexWeight || vertexWeight.boneIds.length === 0) {
      result[i * 2] = x;
      result[i * 2 + 1] = y;
      continue;
    }

    // 완전 고정 영역은 다른 Bone과 가중치가 겹쳐도 원래 위치와 형태를 우선 보존한다.
    const hasFixedInfluence = vertexWeight.boneIds.some(
      (boneId, slot) => deformModes.get(boneId) === "fixed" && (vertexWeight.weights[slot] ?? 0) > 0,
    );
    if (hasFixedInfluence) {
      result[i * 2] = x;
      result[i * 2 + 1] = y;
      continue;
    }

    // Rigid 영역은 여러 행렬을 섞지 않고 가장 강한 Rigid Bone 하나로 통째로 움직인다.
    let rigidSlot = -1;
    let rigidWeight = 0;
    for (let slot = 0; slot < vertexWeight.boneIds.length; slot += 1) {
      const boneId = vertexWeight.boneIds[slot];
      const weight = vertexWeight.weights[slot] ?? 0;
      if (boneId && deformModes.get(boneId) === "rigid" && weight > rigidWeight) {
        rigidSlot = slot;
        rigidWeight = weight;
      }
    }
    if (rigidSlot >= 0) {
      const rigidBoneId = vertexWeight.boneIds[rigidSlot];
      const rigidMatrix = rigidBoneId ? skinMatrices.get(rigidBoneId) : undefined;
      const moved = rigidMatrix ? applyPoint(rigidMatrix, x, y) : { x, y };
      result[i * 2] = moved.x;
      result[i * 2 + 1] = moved.y;
      continue;
    }

    let sumX = 0;
    let sumY = 0;
    let sumWeight = 0;
    for (let slot = 0; slot < vertexWeight.boneIds.length; slot += 1) {
      const boneId = vertexWeight.boneIds[slot];
      const weight = vertexWeight.weights[slot] ?? 0;
      const matrix = boneId ? skinMatrices.get(boneId) : undefined;
      if (!matrix || weight <= 0) continue;

      const moved = applyPoint(matrix, x, y);
      sumX += moved.x * weight;
      sumY += moved.y * weight;
      sumWeight += weight;
    }

    if (sumWeight <= 0) {
      result[i * 2] = x;
      result[i * 2 + 1] = y;
    } else {
      result[i * 2] = sumX / sumWeight;
      result[i * 2 + 1] = sumY / sumWeight;
    }
  }

  return result;
}
