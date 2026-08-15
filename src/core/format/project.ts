import {
  PUPPET_FORMAT,
  PUPPET_VERSION,
  type PuppetBone,
  type PuppetProject,
} from "./types";
import { SUGGESTED_TAGS } from "./constants";
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
    tags: [...(SUGGESTED_TAGS[part] ?? [])],
    motionStrength: 1,
    deform: "soft",
  };
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
    bones: data.bones as PuppetBone[],
    mesh: data.mesh ?? null,
    animations: data.animations ?? {},
  };
}

export function serializeProject(project: PuppetProject): string {
  return JSON.stringify(project, null, 2);
}
