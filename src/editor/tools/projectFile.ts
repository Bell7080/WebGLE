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
/**
 * 내보낸 파일 맨 앞에 붙는 한 줄. (기획서 40, 41)
 *
 * 파일만 열어 본 사람이나 AI가 곧바로 알아보고 쓸 수 있게 하려는 것이다.
 * 읽는 쪽은 이 값을 무시하므로 지워도 동작에는 영향이 없다.
 */
export function exportReadme(project: PuppetProject): string {
  const names = Object.keys(project.animations);
  const first = names[0] ?? "idle";
  return (
    `PuppetForge 2D 캐릭터입니다. 게임에서 재생하려면: ` +
    `npm i puppetforge → import { Puppet } from "puppetforge" → ` +
    `const p = await Puppet.load("<이 zip의 경로>"); p.play("${first}"); ` +
    `매 프레임 p.update(dt)가 변형된 정점(Float32Array)을 돌려주고, p.uv / p.texture로 그립니다. ` +
    `애니메이션: ${names.join(", ") || "(없음)"}. ` +
    `포맷: https://github.com/Bell7080/WebGLE/blob/main/docs/puppet-json.md`
  );
}

export function forExport(project: PuppetProject): PuppetProject {
  const animations = Object.fromEntries(
    Object.entries(project.animations)
      .filter(([, animation]) => !animation.hidden)
      .map(([id, animation]) => {
        const { hidden: _hidden, ...rest } = animation;
        return [id, rest];
      }),
  );
  const shipped = { ...project, animations };
  // 파일을 열자마자 보이도록 맨 앞에 둔다.
  return { _readme: exportReadme(shipped), ...shipped };
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
