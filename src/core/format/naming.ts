import type { PuppetBone } from "./types";

/**
 * 같은 파츠를 여러 개 추가할 때 붙는 자동 번호. (기획서 9)
 * "머리" → 머리1, 머리2, ...
 * 사용자가 이름을 바꾼 Bone과 충돌하지 않도록 실제 사용 중인 이름을 기준으로 센다.
 */
export function nextPartName(part: string, bones: readonly PuppetBone[]): string {
  const used = new Set(bones.map((b) => b.name));
  let index = 1;
  while (used.has(`${part}${index}`)) index += 1;
  return `${part}${index}`;
}

/** 중복되지 않는 Bone id 생성. crypto.randomUUID가 없는 환경도 지원한다. */
export function createBoneId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `bone_${uuid.slice(0, 8)}`;
  return `bone_${Math.random().toString(36).slice(2, 10)}`;
}
