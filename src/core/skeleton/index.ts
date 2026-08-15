import type { PuppetBone } from "../format/types";

/**
 * Bone 집합에 대한 조회 유틸.
 * 특정 캐릭터 구조나 Bone 이름에 의존하지 않는다. (기획서 62, 63)
 */
export function getBonesByTag(bones: readonly PuppetBone[], tag: string): PuppetBone[] {
  return bones.filter((bone) => bone.tags.includes(tag));
}

export function getChildren(bones: readonly PuppetBone[], parentId: string | null): PuppetBone[] {
  return bones.filter((bone) => bone.parentId === parentId);
}

export function getBone(bones: readonly PuppetBone[], id: string): PuppetBone | undefined {
  return bones.find((bone) => bone.id === id);
}

/**
 * 자기 자신이나 후손 중에 그 태그를 가진 관절이 있는 Bone의 id 집합.
 *
 * "무기를 쥔 팔이 어느 쪽인가" 같은 것을 이름 없이 알아내기 위한 것이다.
 * 팔 → 손 → 검처럼 몇 단계 아래에 달려 있어도 팔까지 올라온다. (기획서 63)
 */
export function bonesCarrying(bones: readonly PuppetBone[], tag: string): Set<string> {
  const parentOf = new Map(bones.map((bone) => [bone.id, bone.parentId]));
  const carriers = new Set<string>();

  for (const bone of bones) {
    if (!bone.tags.includes(tag)) continue;

    // 자기 자신부터 루트까지 거슬러 올라가며 표시한다.
    let cursor: string | null = bone.id;
    while (cursor && !carriers.has(cursor)) {
      carriers.add(cursor);
      cursor = parentOf.get(cursor) ?? null;
    }
  }

  return carriers;
}

/**
 * 부모 → 자식 순서로 정렬한다. Transform 계산은 이 순서를 전제로 한다.
 * 부모가 목록에 없는 Bone은 루트로 취급한다.
 */
export function sortByHierarchy(bones: readonly PuppetBone[]): PuppetBone[] {
  const byId = new Map(bones.map((bone) => [bone.id, bone]));
  const sorted: PuppetBone[] = [];
  const visited = new Set<string>();

  const visit = (bone: PuppetBone, seen: Set<string>) => {
    if (visited.has(bone.id)) return;
    if (seen.has(bone.id)) return; // 순환 참조 방어
    seen.add(bone.id);

    const parent = bone.parentId ? byId.get(bone.parentId) : undefined;
    if (parent) visit(parent, seen);

    visited.add(bone.id);
    sorted.push(bone);
  };

  for (const bone of bones) visit(bone, new Set());
  return sorted;
}

/**
 * newParentId를 bone의 부모로 지정해도 되는지 검사한다.
 * 자기 자신이나 자손을 부모로 두면 순환이 생긴다.
 */
export function canReparent(
  bones: readonly PuppetBone[],
  boneId: string,
  newParentId: string | null,
): boolean {
  if (newParentId === null) return true;
  if (boneId === newParentId) return false;

  const byId = new Map(bones.map((bone) => [bone.id, bone]));
  let cursor = byId.get(newParentId);
  const guard = new Set<string>();

  while (cursor) {
    if (cursor.id === boneId) return false;
    if (guard.has(cursor.id)) return false;
    guard.add(cursor.id);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return true;
}
