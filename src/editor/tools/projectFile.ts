import {
  parseProject,
  PuppetFormatError,
  serializeProject,
  type PuppetProject,
} from "@core/format";
import { createZip, readZip } from "@core/format/zip";

const JSON_NAME = "puppet.json";

/** 저장 파일명. 사용자가 정하지 않아도 되게 캐릭터 이름에서 만든다. (기획서 73) */
export function projectFileName(project: PuppetProject): string {
  const safe = (project.character.name || "character").replace(/[\\/:*?"<>|]/g, "_").trim();
  return `${safe || "character"}.puppet.zip`;
}

/**
 * 프로젝트를 ZIP 하나로 묶는다. (기획서 6, 38)
 * 안에는 puppet.json과 원본 이미지가 들어간다.
 */
export async function packProject(
  project: PuppetProject,
  textureUrl: string | null,
  /** 들여쓰기 없이 적을지. 게임에 넘길 내보내기에서 켠다. */
  minified = false,
): Promise<Blob> {
  const encoder = new TextEncoder();
  const entries = [
    { name: JSON_NAME, data: encoder.encode(serializeProject(project, !minified)) },
  ];

  if (textureUrl) {
    const response = await fetch(textureUrl);
    const buffer = await response.arrayBuffer();
    entries.push({ name: project.character.texture, data: new Uint8Array(buffer) });
  }

  return new Blob([createZip(entries) as unknown as BlobPart], { type: "application/zip" });
}

/**
 * 게임에 넘길 내보내기 묶음. (기획서 38, 76)
 *
 * 숨김으로 표시한 애니메이션은 빠진다. 프로젝트 파일에는 그대로 남으므로
 * 시안을 지우지 않고도 결과물만 골라 낼 수 있다.
 */
export function forExport(project: PuppetProject): PuppetProject {
  const animations = Object.fromEntries(
    Object.entries(project.animations)
      .filter(([, animation]) => !animation.hidden)
      .map(([id, animation]) => {
        const { hidden: _hidden, ...rest } = animation;
        return [id, rest];
      }),
  );
  return { ...project, animations };
}

export function exportFileName(project: PuppetProject): string {
  const safe = (project.character.name || "character").replace(/[\\/:*?"<>|]/g, "_").trim();
  return `${safe || "character"}.export.zip`;
}

export interface LoadedProject {
  project: PuppetProject;
  /** 프로젝트에 이미지가 들어 있으면 그 Object URL. */
  textureUrl: string | null;
}

/** 저장된 ZIP을 되돌린다. 다시 올리면 완전히 복원되어야 한다. (기획서 38) */
export async function unpackProject(file: File): Promise<LoadedProject> {
  const entries = await readZip(new Uint8Array(await file.arrayBuffer()));

  const jsonEntry = entries.find((entry) => entry.name === JSON_NAME);
  if (!jsonEntry) throw new PuppetFormatError("puppet.json이 없습니다.");

  const project = parseProject(JSON.parse(new TextDecoder().decode(jsonEntry.data)));
  const textureEntry = entries.find((entry) => entry.name === project.character.texture);

  const textureUrl = textureEntry
    ? URL.createObjectURL(
        new Blob([textureEntry.data as unknown as BlobPart], { type: "image/png" }),
      )
    : null;

  return { project, textureUrl };
}

/** 브라우저에서 파일로 내려받는다. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
