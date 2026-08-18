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
  /** 위치 고정용 내부 정보. 기준점에서 멀어질수록 normal 행렬로 되돌릴 때만 사용한다. */
  pin?: { anchorX: number; anchorY: number; normal: Mat2D };
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
  deformModes: ReadonlyMap<string, DeformMode> = new Map(),
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

    // 애니메이션별 덮어쓰기가 있으면 저장된 공용값보다 우선한다. 정점 혼합에서만 덮어쓰기를
    // 사용하면 고정 관절 자체는 부모를 따라가므로, 발 그림과 관절점의 결과가 서로 어긋난다.
    const deform = deformModes.get(bone.id) ?? bone.deform;
    // 완전 고정은 위치와 선형 변형을 모두 버려 원래 모양과 자리를 그대로 유지한다.
    if (deform === "fixed") {
      world.set(bone.id, restWorld);
      skin.set(bone.id, IDENTITY);
      continue;
    }

    const delta = deltas.get(bone.id) ?? NO_DELTA;
    const deltaMatrix = compose(delta.x, delta.y, delta.rotation, delta.scaleX, delta.scaleY);

    let boneWorld = multiply(parentWorld ?? IDENTITY, multiply(local, deltaMatrix));

    if (deform === "pinnedSoft") {
      // 위치 고정은 현재 회전·크기를 보존하되 관절의 기준점만 원래 월드 좌표로 되돌린다.
      // 행렬 전체를 항등으로 만들면 발 위치뿐 아니라 발 모양까지 fixed처럼 굳어 버린다.
      const movedAnchor = applyPoint(boneWorld, 0, 0);
      const normalWorld = boneWorld;
      boneWorld = {
        ...boneWorld,
        tx: boneWorld.tx + restWorld.tx - movedAnchor.x,
        ty: boneWorld.ty + restWorld.ty - movedAnchor.y,
      };
      // 정점 단계에서 가중치와 기준점 거리에 따라 고정 보정을 감쇠할 수 있도록
      // 보정 전 행렬도 함께 둔다. 저장 포맷에는 들어가지 않는 계산 중 메타데이터다.
      const pinnedSkin = multiply(boneWorld, invert(restWorld));
      pinnedSkin.pin = {
        anchorX: restWorld.tx,
        anchorY: restWorld.ty,
        normal: multiply(normalWorld, invert(restWorld)),
      };
      world.set(bone.id, boneWorld);
      skin.set(bone.id, pinnedSkin);
      continue;
    }

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

  // 위치 고정 영역의 실제 반경은 별도 데이터가 없으므로, 해당 관절이 칠해진 정점 중
  // 기준점에서 가장 먼 거리를 사용한다. 이렇게 하면 가중치가 1인 넓은 영역도 시작점만
  // 강하게 붙고 외곽은 주변 움직임으로 자연스럽게 돌아간다.
  const pinRadii = new Map<string, number>();
  for (let i = 0; i < count; i += 1) {
    const vertexWeight = mesh.weights[i];
    if (!vertexWeight) continue;
    const x = mesh.vertices[i * 2] ?? 0;
    const y = mesh.vertices[i * 2 + 1] ?? 0;
    for (let slot = 0; slot < vertexWeight.boneIds.length; slot += 1) {
      const boneId = vertexWeight.boneIds[slot];
      const matrix = boneId ? skinMatrices.get(boneId) : undefined;
      if (!boneId || !matrix?.pin || (vertexWeight.weights[slot] ?? 0) <= 0) continue;
      const distance = Math.hypot(x - matrix.pin.anchorX, y - matrix.pin.anchorY);
      pinRadii.set(boneId, Math.max(pinRadii.get(boneId) ?? 0, distance));
    }
  }

  for (let i = 0; i < count; i += 1) {
    const x = mesh.vertices[i * 2] ?? 0;
    const y = mesh.vertices[i * 2 + 1] ?? 0;
    const vertexWeight = mesh.weights[i];

    if (!vertexWeight || vertexWeight.boneIds.length === 0) {
      result[i * 2] = x;
      result[i * 2 + 1] = y;
      continue;
    }

    // 위치 고정(pinnedSoft)은 항등 행렬과 이웃 행렬을 비율대로 섞어 경계를 부드럽게 만든다.
    // 완전 고정(fixed)은 아래에서 주 영향인지 추가로 확인해 중심 영역까지 섞이는 일을 막는다.

    // Rigid 영역은 여러 행렬을 섞으면 형태가 찌그러지므로 하나로 통째로 움직인다.
    // 다만 **그 정점의 주인일 때만** 그렇게 한다 — 검이 살짝 걸친 정도로 스치는 자리까지
    // 검을 따라가 버리면, 정작 그 자리를 대부분 맡은 팔의 움직임이 사라진다.
    let fixedSlot = -1;
    let fixedWeight = 0;
    let nonFixedTopWeight = 0;
    let rigidSlot = -1;
    let rigidWeight = 0;
    let topWeight = 0;
    for (let slot = 0; slot < vertexWeight.boneIds.length; slot += 1) {
      const boneId = vertexWeight.boneIds[slot];
      const weight = vertexWeight.weights[slot] ?? 0;
      if (weight > topWeight) topWeight = weight;
      const mode = boneId ? deformModes.get(boneId) : undefined;
      if (mode === "fixed" && weight > fixedWeight) {
        fixedSlot = slot;
        fixedWeight = weight;
      } else if (mode !== "fixed" && weight > nonFixedTopWeight) {
        nonFixedTopWeight = weight;
      }
      if (boneId && mode === "rigid" && weight > rigidWeight) {
        rigidSlot = slot;
        rigidWeight = weight;
      }
    }
    // 완전 고정이 이 정점의 가장 큰 영향이면 다른 부모·이웃 관절과 섞지 않는다. 정규화된
    // 가중치에 다른 관절이 남아 있어도 발의 중심 영역은 월드 기준으로 완전히 붙잡혀야 한다.
    if (fixedSlot >= 0 && fixedWeight > nonFixedTopWeight) {
      result[i * 2] = x;
      result[i * 2 + 1] = y;
      continue;
    }
    if (rigidSlot >= 0 && rigidWeight >= topWeight) {
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

      let moved = applyPoint(matrix, x, y);
      if (matrix.pin && boneId) {
        const radius = pinRadii.get(boneId) ?? 0;
        const distance = Math.hypot(x - matrix.pin.anchorX, y - matrix.pin.anchorY);
        // 반경이 0인 단일 정점은 기준점으로 간주한다. 그 외에는 거리와 실제 칠 가중치를
        // 함께 곱해, 시작점에서 강하고 외곽 및 옅게 칠한 부분에서 약한 위치 고정을 만든다.
        const distanceFalloff = radius <= 0 ? 1 : Math.max(0, 1 - distance / radius);
        const pinStrength = Math.min(1, weight * distanceFalloff);
        const normalMoved = applyPoint(matrix.pin.normal, x, y);
        moved = {
          x: normalMoved.x + (moved.x - normalMoved.x) * pinStrength,
          y: normalMoved.y + (moved.y - normalMoved.y) * pinStrength,
        };
      }
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
