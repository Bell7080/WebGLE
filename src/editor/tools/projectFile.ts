import {
  parseProject,
  PuppetFormatError,
  serializeProject,
  type PuppetProject,
} from "@core/format";
import { createZip, readZip } from "@core/format/zip";
import { translate } from "@editor/i18n";

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
    `Phaser라면 puppetforge/phaser의 PuppetCreature.load(scene, "<경로>")가 그리기까지 해 줍니다. ` +
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
        // 저장된 확장자와 MIME을 맞춰 WebP 프로젝트도 브라우저가 동일하게 디코드하게 한다.
        new Blob([textureEntry.data as unknown as BlobPart], {
          type: project.character.texture.toLowerCase().endsWith(".webp") ? "image/webp" : "image/png",
        }),
      )
    : null;

  return { project, textureUrl };
}

/** 브라우저에서 파일로 내려받는다. */
/** 파일을 어떤 방법으로 내보냈는지. 상태줄 문구를 고르는 데 쓴다. */
export type SaveMethod = "share" | "download" | "tab" | "cancelled";

/**
 * 만든 파일을 사용자에게 넘긴다.
 *
 * 데스크톱에서는 `<a download>` 한 줄이면 되지만 휴대폰에서는 그렇지 않다.
 * iOS Safari는 blob에 붙은 `download`를 무시하는 일이 잦고, 그러면 아무 일도 일어나지 않아
 * "내보내기가 안 된다"가 된다. 그래서 순서를 둔다.
 *
 * 1. **공유 시트** — 휴대폰이 파일 공유를 지원하면 이걸 쓴다. 사용자가 파일 앱 · 드라이브 ·
 *    메신저 어디로든 보낼 수 있어서 휴대폰에서는 이 방법이 가장 확실하다.
 * 2. **내려받기** — 평소의 `<a download>`. 문서에 붙였다 떼는 것까지 한다.
 *    일부 브라우저는 붙어 있지 않은 링크의 클릭을 무시한다.
 * 3. **새 탭으로 열기** — 위 둘이 다 막힌 경우의 마지막 수단. 적어도 화면에는 뜬다.
 */
export async function saveFile(blob: Blob, fileName: string): Promise<SaveMethod> {
  const file = new File([blob], fileName, { type: blob.type || "application/octet-stream" });
  const shared = await shareFiles([file], fileName);
  if (shared) return shared;
  return saveFileWithoutShare(blob, fileName);
}

/**
 * 여러 결과 이미지를 운영체제 공유 시트로 직접 넘긴다.
 *
 * iPhone의 사진 앱은 ZIP 내부 이미지를 바로 받을 수 없지만 PNG 파일 공유는 받을 수 있다.
 * 공유를 지원하지 않는 브라우저에서는 호출자가 준비한 ZIP을 일반 파일로 저장한다.
 */
export async function saveImages(
  images: readonly File[],
  fallbackZip: Blob,
  fallbackName: string,
): Promise<SaveMethod> {
  const shared = await shareFiles(images, fallbackName);
  return shared ?? saveFileWithoutShare(fallbackZip, fallbackName);
}

/** 공유를 이미 시도한 뒤 쓰는 다운로드 경로다. 재귀적으로 공유 창을 띄우지 않는다. */
async function saveFileWithoutShare(blob: Blob, fileName: string): Promise<SaveMethod> {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    if ("download" in link) {
      link.href = url;
      link.download = fileName;
      link.rel = "noopener";
      document.body.append(link);
      link.click();
      link.remove();
      return "download";
    }
    window.open(url, "_blank", "noopener");
    return "tab";
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

/**
 * 공유 시트로 넘겨 본다. 쓸 수 없으면 null을 돌려주고 부르는 쪽이 다음 방법으로 넘어간다.
 *
 * 사용자가 공유 창을 닫은 것(AbortError)은 실패가 아니라 취소다.
 * 그때 내려받기까지 이어서 하면 원치 않는 파일이 남는다.
 */
async function shareFiles(files: readonly File[], title: string): Promise<SaveMethod | null> {
  if (typeof navigator === "undefined" || !navigator.canShare || !navigator.share) return null;
  const shareData = { files: [...files], title };
  if (!navigator.canShare(shareData)) return null;

  try {
    // 굽기·ZIP 생성의 await 동안 iOS의 사용자 제스처가 끝난다. 두 번째 탭으로 새 제스처를 만든다.
    if (needsFreshShareGesture()) await waitForShareTap();
    await navigator.share(shareData);
    return "share";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    // 그 밖의 실패(사용자 조작에서 너무 멀어졌다는 등)는 조용히 다음 방법으로 넘긴다.
    return null;
  }
}

/** 터치 기기에서는 비동기 파일 준비 후 공유 API를 부르기 전에 새 탭이 필요하다. */
function needsFreshShareGesture(): boolean {
  const activation = navigator.userActivation;
  // 구형 iOS가 userActivation을 노출하지 않아도 터치 기기라면 안전한 두 번째 탭을 받는다.
  return navigator.maxTouchPoints > 0 && (activation === undefined || !activation.isActive);
}

/**
 * 기존 흑백 컨트롤 테마를 따르는 작은 하단 확인창이다.
 * 버튼의 click 핸들러가 끝나기 전에 resolve하여 Web Share 호출에 사용자 활성화를 보존한다.
 */
function waitForShareTap(): Promise<void> {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "native-share-prompt";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");

    const panel = document.createElement("div");
    panel.className = "native-share-panel";
    const message = document.createElement("p");
    message.textContent = translate("파일 준비가 끝났습니다. 아래 버튼을 눌러 저장할 앱을 고르세요.");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = translate("저장 / 공유");
    button.addEventListener("click", () => {
      backdrop.remove();
      resolve();
    }, { once: true });

    panel.append(message, button);
    backdrop.append(panel);
    document.body.append(backdrop);
    button.focus();
  });
}

/** 예전 이름. 기다리지 않아도 되는 자리에서 쓴다. */
export function downloadBlob(blob: Blob, fileName: string): void {
  void saveFile(blob, fileName);
}
