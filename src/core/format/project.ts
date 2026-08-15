import {
  PUPPET_FORMAT,
  PUPPET_VERSION,
  type PuppetBone,
  type PuppetProject,
} from "./types";
import { generateBoneColor, SUGGESTED_TAGS } from "./constants";
import { createBoneId, nextPartName } from "./naming";

export interface CreateProjectOptions {
  name?: string;
  texture?: string;
  width?: number;
  height?: number;
  pixelArt?: boolean;
}

export function createEmptyProject(options: CreateProjectOptions = {}): PuppetProject {
  return {
    format: PUPPET_FORMAT,
    version: PUPPET_VERSION,
    character: {
      name: options.name ?? "새 캐릭터",
      texture: options.texture ?? "character.png",
      width: options.width ?? 0,
      height: options.height ?? 0,
      pixelArt: options.pixelArt ?? false,
    },
    bones: [],
    mesh: null,
    animations: {},
  };
}

/** 파츠 이름과 좌표만으로 Bone을 만든다. 나머지는 자동값. (기획서 73) */
export function createBone(
  part: string,
  x: number,
  y: number,
  bones: readonly PuppetBone[],
  parentId: string | null = null,
): PuppetBone {
  return {
    id: createBoneId(),
    name: nextPartName(part, bones),
    parentId,
    x,
    y,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    tags: suggestTags(part, bones, parentId),
    motionStrength: 1,
    deform: "soft",
    color: nextBoneColor(bones),
  };
}

/**
 * 파츠에 맞는 추천 태그.
 *
 * 부모가 없고 아직 아무도 `root`를 달고 있지 않으면 `root`도 함께 붙인다.
 * 대기 · 점프처럼 캐릭터 전체를 움직이는 프리셋이 기준으로 삼을 관절이 없으면
 * 그 트랙이 통째로 건너뛰어지기 때문이다. (기획서 22, 64 · 73의 "자동값 우선")
 */
export function suggestTags(
  part: string,
  bones: readonly PuppetBone[],
  parentId: string | null = null,
): string[] {
  const tags = [...(SUGGESTED_TAGS[part] ?? [])];
  const hasRoot = bones.some((bone) => bone.tags.includes("root"));
  if (!hasRoot && parentId === null && !tags.includes("root")) tags.unshift("root");
  return tags;
}

/**
 * 첫 관절로 쓸 파츠. 캐릭터 전체의 기준이 되므로 `중심`으로 고정한다.
 * 관절이 하나라도 있으면 사용자가 고른 파츠를 그대로 쓴다.
 */
export const ROOT_PART = "중심";

export function partForNewBone(selected: string, bones: readonly PuppetBone[]): string {
  return bones.length === 0 ? ROOT_PART : selected;
}

/** 아직 쓰지 않은 색 중 가장 앞선 것. 지웠다 다시 만들어도 색이 겹치지 않는다. */
export function nextBoneColor(bones: readonly PuppetBone[]): string {
  const used = new Set(bones.map((bone) => bone.color));
  for (let index = 0; index < 360; index += 1) {
    const color = generateBoneColor(index);
    if (!used.has(color)) return color;
  }
  return generateBoneColor(bones.length);
}

export class PuppetFormatError extends Error {}

/**
 * 저장 파일을 검증하며 읽는다. 버전이 올라가면 여기에 Migration을 추가한다. (기획서 65)
 */
export function parseProject(raw: unknown): PuppetProject {
  if (typeof raw !== "object" || raw === null) {
    throw new PuppetFormatError("프로젝트 데이터가 올바르지 않습니다.");
  }
  const data = raw as Partial<PuppetProject>;

  if (data.format !== PUPPET_FORMAT) {
    throw new PuppetFormatError("PuppetForge 프로젝트 파일이 아닙니다.");
  }
  if (typeof data.version !== "number") {
    throw new PuppetFormatError("버전 정보가 없습니다.");
  }
  if (data.version > PUPPET_VERSION) {
    throw new PuppetFormatError(
      `이 파일은 더 최신 버전(v${data.version})입니다. 툴을 업데이트해 주세요.`,
    );
  }
  if (!data.character || !Array.isArray(data.bones)) {
    throw new PuppetFormatError("캐릭터 또는 관절 정보가 없습니다.");
  }

  const base = createEmptyProject();
  return {
    ...base,
    ...data,
    version: PUPPET_VERSION,
    character: { ...base.character, ...data.character },
    bones: migrateBones(data.bones as PuppetBone[]),
    mesh: data.mesh ?? null,
    animations: data.animations ?? {},
  };
}

/**
 * 구버전 Bone을 현재 포맷으로 올린다.
 * v1에는 색이 없었고, v2까지의 soft/rigid 값은 v3에서도 같은 의미로 유지된다.
 */
function migrateBones(bones: readonly PuppetBone[]): PuppetBone[] {
  const filled: PuppetBone[] = [];
  for (const bone of bones) {
    filled.push(bone.color ? bone : { ...bone, color: nextBoneColor(filled) });
  }
  return filled;
}

export function serializeProject(project: PuppetProject): string {
  return JSON.stringify(project, null, 2);
}
