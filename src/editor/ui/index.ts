import {
  OVERLAY_LAYERS,
  PART_NAMES,
  ROOT_PART,
  TAG_AMPLITUDE,
  TAG_CATALOG,
  TAG_DESCRIPTIONS,
  MESH_LABELS,
  TAG_GROUPS,
  type DeformMode,
  type Interpolation,
  type MeshResolution,
  type OverlayLayer,
  type PuppetBone,
} from "@core/format";
import { canReparent } from "@core/skeleton";
import { MAX_DURATION, MIN_DURATION, ownTracks } from "@core/animation";
import type { BrushState, EditorStore } from "../state/store";
import type { WeightCorrectionStrength } from "@core/weight/auto";
import { createColorWheel } from "./colorWheel";
import { findPreset, PRESET_GROUPS, PRESETS } from "../../presets";
import { icon, setIcon, type IconName } from "./icons";
import { attachTooltip, hideTooltip } from "./tooltip";
import {
  formatAnimationSummary,
  formatPresetMeta,
  formatTagMultiplier,
  formatTagUsage,
  getLanguage,
  LANGUAGES,
  setLanguage,
  translate,
  translatePresetDescription,
  translateTagDescription,
} from "../i18n";

/** 이 태그를 실제로 쓰는 애니메이션 이름들. 툴팁 아래에 붙여 준다. */
function animationsUsingTag(tag: string): string {
  // 성격 태그는 대상을 고르지 않는다. 동작 목록을 보여 주면 거짓말이 된다.
  const amplitude = TAG_AMPLITUDE[tag];
  if (amplitude !== undefined) {
    // 배율은 동적 값이므로 i18n의 언어별 문장 틀에 끼운다.
    return formatTagMultiplier(amplitude);
  }

  const known = TAG_CATALOG.find((entry) => entry.id === tag);
  if (known?.effect === "hint") {
    return translateTagDescription(tag, known.description);
  }

  const users = PRESETS.filter((preset) =>
    preset.animation.tracks.some(
      (track) =>
        (track.target.kind === "tag" && track.target.tag === tag) || track.focus === tag,
    ),
  ).map((preset) => preset.label);

  return formatTagUsage(users.map((label) => translate(label)));
}

/** 프리셋 id의 한국어 이름. 목록에 없는 것(직접 만든 것)은 id를 그대로 쓴다. */
function presetLabel(id: string): string {
  const label = findPreset(id)?.label;
  return label ? translate(label) : id;
}

/** 길이 · 반복 · 트랙 수를 한 줄로. */
function describeAnimation(animation: { duration: number; loop: boolean; tracks: unknown[] }): string {
  // 시간과 트랙 수는 i18n의 언어별 문장 틀에서 조립한다.
  return formatAnimationSummary(animation.duration, animation.loop, animation.tracks.length);
}

/** 이 애니메이션이 찾는 태그들. */
function usedTags(animation: { tracks: { target: { kind: string; tag?: string } }[] }): string {
  const tags = new Set<string>();
  for (const track of animation.tracks) {
    if (track.target.kind === "tag" && track.target.tag) tags.add(track.target.tag);
  }
  return [...tags].join(" ");
}

export interface EditorUICallbacks {
  onAddBone(part: string): void;
  onDeleteBone(boneId: string): void;
  onUpdateBone(boneId: string, patch: Partial<PuppetBone>): void;
  /** 목록에서 끌어 옮긴 결과. targetId 앞/뒤로 옮긴다. */
  onReorderBone(boneId: string, targetId: string, place: "before" | "after"): void;
  onMenu(action: string): void;
  onPlay(animationId: string): void;
  onStop(): void;
  onAddAnimation(presetId: string): void;
  onRenameAnimation(animationId: string, name: string): void;
  onRemoveAnimation(animationId: string): void;
  onToggleAnimationHidden(animationId: string): void;
  /**
   * 길이 · 속도 · 강도 조절. (기획서 31)
   *
   * `done`은 막대에서 손을 뗐다는 뜻이다. 끄는 동안에는 false로 계속 들어오므로
   * 받는 쪽은 드래그 한 번을 Undo 한 단위로 묶을 수 있다.
   */
  onAnimationSetting(
    animationId: string,
    patch: {
      duration?: number;
      speed?: number;
      strength?: number;
      secondary?: number;
      mirror?: boolean;
    },
    done?: boolean,
  ): void;
  /**
   * 이 애니메이션에서만 쓸 관절 변형 방식. mode가 null이면 덮어쓰기를 지우고 공용 값을 따른다.
   */
  onAnimationDeform(animationId: string, boneId: string, mode: DeformMode | null): void;
  /** 재생 헤드가 선 자리에 이 관절의 키가 있는지. 없으면 null. */
  onKeyQuery(boneId: string): { time: number; count: number; ease: Interpolation } | null;
  /** 그 자리 키의 보간 방식을 바꾼다. */
  onKeyEase(boneId: string, ease: Interpolation): void;
  /** 그 자리 키를 지운다. */
  onKeyDelete(boneId: string): void;
  onExport(): void;
  /** 캐릭터 전체 설정. 관절을 고르지 않았을 때 속성 패널에 나온다. */
  onCharacterSetting(patch: {
    name?: string;
    pixelArt?: boolean;
    resolution?: MeshResolution;
  }): void;
  /** 그림 · 관절 · 칠한 영역을 통째로 좌우 반전한다. */
  onFlipCharacter(): void;
  onBrushChange(patch: Partial<BrushState>): void;
  /** 이 관절의 영향 영역을 자동에 맡길지 직접 잡을지 바꾼다. */
  onAutoWeight(boneId: string, enabled: boolean): void;
  /** 현재 관절 전체를 기준으로 실루엣의 빈 영향 영역을 메운다. */
  onFillAllWeights(strength: WeightCorrectionStrength): void;
  /** 고립된 오점과 미세 잔여 가중치를 정돈하고 빈 곳을 메운다. */
  onCleanupWeights(strength: WeightCorrectionStrength): void;
}

/** 변형 방식 선택지. 짧은 이름은 버튼에, 나머지는 툴팁에 쓴다. */
/** 속성 이름을 한국어로. 트랙 목록에 그대로 보여 준다. */
const PROPERTY_NAMES: Record<string, string> = {
  x: "가로 이동",
  y: "세로 이동",
  rotation: "회전",
  scaleX: "가로 크기",
  scaleY: "세로 크기",
};

/** 키에서 다음 키로 이어지는 방식. (기획서 22) */
const EASE_OPTIONS = [
  {
    id: "smooth" as const,
    label: "부드럽게",
    help: "시작과 끝에서 느려지고 가운데서 빠릅니다. 살아 있는 것의 움직임은 대개 이렇습니다.",
    example: "예: 팔을 휘두르는 동작, 숨쉬기",
  },
  {
    id: "linear" as const,
    label: "일정하게",
    help: "처음부터 끝까지 같은 속도로 갑니다. 기계처럼 딱딱한 움직임에 씁니다.",
    example: "예: 톱니바퀴, 일정하게 도는 물체",
  },
  {
    id: "step" as const,
    label: "뚝 끊어서",
    help: "중간을 만들지 않고 다음 키에서 한 번에 바뀝니다. 도트 그림의 프레임 전환처럼 씁니다.",
    example: "예: 눈 깜빡임, 도트 애니메이션",
  },
];

const DEFORM_OPTIONS = [
  {
    id: "soft",
    short: "부드럽게",
    label: "움직이고 휜다",
    help: "이웃 관절과 가중치를 섞어 자연스럽게 휘고 찌그러집니다. 대부분의 살아 있는 부위가 여기 해당합니다.",
    examples: "몸통 · 팔 · 다리 · 꼬리 · 촉수",
  },
  {
    id: "rigid",
    short: "형태 유지",
    label: "움직이되 안 휜다",
    help: "위치 · 회전 · 크기는 따라가지만 형태는 그대로 유지합니다. 찌그러지면 어색해지는 단단한 물건에 씁니다.",
    examples: "검 · 방패 · 왕관 · 안경 · 뿔",
  },
  {
    id: "pinnedSoft",
    short: "위치 고정",
    label: "제자리, 경계는 부드럽게",
    help: "자기와 부모의 움직임을 무시하고 원래 자리를 지킵니다. 다만 이웃이 칠한 부분과의 경계는 부드럽게 휘어 이어집니다.",
    examples: "바닥을 딛은 발 · 벽에 붙은 부위",
  },
  {
    id: "fixed",
    short: "완전 고정",
    label: "위치도 형태도 그대로",
    help: "다른 관절이 겹쳐 칠해도 원래 좌표를 우선합니다. 절대 움직이면 안 되는 곳에만 쓰세요. 가장자리가 딱딱하게 끊겨 보일 수 있습니다.",
    examples: "바닥 접점 · 고정된 받침",
  },
] as const satisfies readonly { id: PuppetBone["deform"]; short: string; label: string; help: string; examples: string }[];

/**
 * 브러시 크기 선택지(이미지 픽셀). 그림 도구처럼 점 크기로 고른다.
 * 한 줄에 일곱 개씩 네 줄, 스물여덟 단계다. 작은 쪽은 촘촘하게, 큰 쪽은 성기게 나눈다.
 */
const BRUSH_SIZES = [
  2, 3, 4, 5, 6, 8, 10,
  12, 15, 18, 22, 27, 33, 40,
  48, 58, 70, 84, 100, 120, 145,
  175, 210, 250, 300, 355, 420, 500,
] as const;

/** 막대 하나의 채움과 숫자를 지금 값에 맞춘다. */
function updateKnob(
  knob: HTMLElement | undefined,
  value: number,
  min: number,
  max: number,
  unit = "배",
): void {
  if (!knob) return;
  const fill = knob.querySelector<HTMLElement>(".knob-fill");
  const readout = knob.querySelector<HTMLElement>(".knob-readout");
  if (fill) fill.style.width = `${((value - min) / (max - min)) * 100}%`;
  if (readout) readout.textContent = `${value.toFixed(2)}${unit}`;
}

/** 크기 버튼에 그릴 점의 지름 범위(px). */
const DOT_MIN = 4;
const DOT_MAX = 26;

/** 브러시 크기를 0~1로 옮긴다. 선택지가 등비에 가까우므로 로그로 재야 고르게 벌어진다. */
function dotScale(size: number): number {
  const min = Math.log(BRUSH_SIZES[0]);
  const max = Math.log(BRUSH_SIZES[BRUSH_SIZES.length - 1]!);
  return (Math.log(size) - min) / (max - min);
}

/** `파일` 메뉴에 들어가는 항목. */
interface FileMenuItem {
  action: string;
  label: string;
  /** 오른쪽에 흐리게 적는 단축키. 없으면 적지 않는다. */
  shortcut?: string;
}

const FILE_MENU: readonly FileMenuItem[] = [
  { action: "new", label: "새 프로젝트" },
  { action: "import-image", label: "이미지 불러오기" },
  // 현재 관절·애니메이션을 유지한 채 스킨만 바꾸는 별도 흐름이다.
  { action: "replace-image", label: "일러스트 교체" },
  { action: "open", label: "프로젝트 열기" },
  { action: "save", label: "프로젝트 저장", shortcut: "Ctrl+S" },
  { action: "export", label: "내보내기" },
  { action: "sprite-sheet", label: "스프라이트 시트로 굽기" },
];

/** 격자 선택지. 이름표는 `MESH_LABELS`가 들고 있어 여기서 다시 적지 않는다. */
const MESH_CHOICES = (Object.keys(MESH_LABELS) as MeshResolution[]).map((value) => ({
  value,
  label: MESH_LABELS[value],
}));

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`UI 요소를 찾을 수 없습니다: #${id}`);
  return element as T;
}

/**
 * DOM 편집기 UI. 모든 문자열은 한국어다. (기획서 33)
 * 상태는 EditorStore에서만 읽고, 변경은 콜백으로 위임한다.
 */
export class EditorUI {
  private readonly layerToggles = requireElement<HTMLDivElement>("layerToggles");
  private readonly boneList = requireElement<HTMLUListElement>("boneList");
  private readonly boneHint = requireElement<HTMLParagraphElement>("boneHint");
  private readonly inspector = requireElement<HTMLDivElement>("inspector");
  private readonly animButtons = requireElement<HTMLDivElement>("animButtons");
  private readonly animPicker = requireElement<HTMLDivElement>("animPicker");
  private readonly animSettings = requireElement<HTMLDivElement>("animSettings");
  private readonly statusText = requireElement<HTMLSpanElement>("statusText");
  private readonly dropzone = requireElement<HTMLButtonElement>("dropzone");
  private readonly addBoneButton = requireElement<HTMLButtonElement>("addBoneButton");
  private readonly fileButton = requireElement<HTMLButtonElement>("fileButton");
  private readonly fileMenu = requireElement<HTMLDivElement>("fileMenu");
  private readonly settingsButton = requireElement<HTMLButtonElement>("settingsButton");
  private readonly settingsPanel = requireElement<HTMLDivElement>("settingsPanel");
  private partSelect!: HTMLSelectElement;
  private draggingBoneId: string | null = null;
  /** 원형 팔레트를 펼쳐 둔 관절. */
  private colorOpenBoneId: string | null = null;
  /** 태그 고르기 패널을 펼쳐 둔 관절. */
  private tagPickerBoneId: string | null = null;
  /** 애니메이션 추가 목록을 펼쳤는지. */
  private animPickerOpen = false;
  /** 상단에서 펼쳐 둔 메뉴. */
  private openMenu: "file" | "settings" | null = null;
  private settingsPending = false;
  /** 변형 값을 고른 애니메이션 기준으로 편집하는 중인지. 기본은 공용이다. */
  private deformScoped = false;
  /** 마지막으로 그린 애니메이션 목록의 모양. 같으면 다시 그리지 않는다. */
  private animSignature = "";
  /** 속도 · 강도 줄이 지금 어느 애니메이션을 보여 주고 있는지. */
  private animSettingsId: string | null = null;
  /** 전체 보정 단계는 패널이 다시 그려져도 사용자가 마지막으로 고른 값을 유지한다. */
  private weightCorrectionStrength: WeightCorrectionStrength = "normal";

  constructor(
    private readonly store: EditorStore,
    private readonly callbacks: EditorUICallbacks,
  ) {
    this.buildLayerToggles();
    this.buildAnimButtons();
    this.buildPartSelect();
    this.bindMenu();

    this.store.subscribe(() => this.render());
  }

  setStatus(message: string): void {
    this.statusText.textContent = message;
  }

  /** 상단 우측 표시 토글. 기본은 모두 켜짐이고, 끄면 캔버스에서 감춘다. */
  private buildLayerToggles(): void {
    for (const layer of OVERLAY_LAYERS) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = layer.label;
      button.dataset.layer = layer.id;
      button.title = `${layer.label} 표시 켜기 / 끄기`;
      button.addEventListener("click", () => this.toggleLayer(layer.id));
      this.layerToggles.append(button);
    }
  }

  private toggleLayer(layer: OverlayLayer): void {
    const visibility = this.store.get().visibility;
    this.store.set({ visibility: { ...visibility, [layer]: !visibility[layer] } });
  }

  private buildAnimButtons(): void {
    requireElement<HTMLButtonElement>("playButton").addEventListener("click", () => {
      const first = Object.keys(this.store.get().project.animations)[0];
      if (first) this.callbacks.onPlay(first);
    });
    requireElement<HTMLButtonElement>("stopButton").addEventListener("click", () =>
      this.callbacks.onStop(),
    );
  }

  /**
   * 하단 애니메이션 목록. 프로젝트가 가진 것만 보여 준다. (기획서 30)
   * 각 칸: 이름을 누르면 재생, `−`는 내보내기에서만 빼기(숨김), `×`는 아예 삭제.
   */
  /**
   * 고른 애니메이션의 속도 · 강도. (기획서 31)
   * 값은 애니메이션에 함께 저장되므로 내보내기 결과와 게임에도 그대로 따라간다.
   */
  private renderAnimationSettings(): void {
    const { project, selectedAnimation } = this.store.get();
    const id = selectedAnimation;
    const animation = id ? project.animations[id] : undefined;

    this.animSettings.classList.toggle("visible", Boolean(animation));
    if (!id || !animation) {
      this.animSettings.replaceChildren();
      this.animSettingsId = null;
      return;
    }

    const length = animation.duration;
    const speed = animation.speed ?? 1;
    const strength = animation.strength ?? 1;
    const swing = animation.secondary ?? 1;

    // 같은 애니메이션이면 막대만 갱신한다.
    // 통째로 다시 그리면 끌고 있던 막대가 사라져 드래그가 끊긴다.
    if (this.animSettingsId === id) {
      const knobs = this.animSettings.querySelectorAll<HTMLElement>(".anim-knob");
      updateKnob(knobs[0], length, MIN_DURATION, MAX_DURATION, "초");
      updateKnob(knobs[1], speed, 0.1, 3);
      updateKnob(knobs[2], strength, 0, 2);
      updateKnob(knobs[3], swing, 0, 2);

      // 반전 버튼은 막대가 아니라 상태 표시라 여기서 따로 맞춰 준다.
      const flipButton = this.animSettings.querySelector<HTMLButtonElement>(".anim-flip");
      if (flipButton) {
        flipButton.classList.toggle("active", animation.mirror === true);
        flipButton.setAttribute("aria-pressed", String(animation.mirror === true));
      }
      return;
    }
    this.animSettingsId = id;
    this.animSettings.replaceChildren();

    // 어느 애니메이션을 조절하는지 적어 둔다. 목록에서 떨어져 떠 있기 때문이다.
    const title = document.createElement("span");
    title.className = "anim-settings-title";
    title.textContent = id;
    attachTooltip(title, {
      title: "조절 대상",
      body: "아래 목록에서 고른 애니메이션입니다. 다른 이름을 누르면 그쪽 값으로 바뀝니다.",
      meta: "값은 이 애니메이션에 저장되어 내보내기까지 따라갑니다",
    });
    this.animSettings.append(title);

    this.animSettings.append(
      this.animKnob("길이", length, MIN_DURATION, MAX_DURATION, `${length.toFixed(2)}초`, {
        title: "애니메이션 길이",
        body: "한 번 도는 데 걸리는 시간입니다. 키가 찍힌 시각도 같은 비율로 함께 늘어나므로 동작의 모양은 그대로입니다.",
        meta: "속도와 달리 파일에 그대로 적혀 게임이 읽는 길이가 됩니다",
      }, (value, done) => this.callbacks.onAnimationSetting(id, { duration: value }, done), "초"),

      this.animKnob("속도", speed, 0.1, 3, `${speed.toFixed(2)}배`, {
        title: "재생 속도",
        body: "1이 원래 속도입니다. 0.5면 두 배 느리게, 2면 두 배 빠르게 재생됩니다. 굼뜬 골렘과 잽싼 거미를 같은 프리셋으로 만들 때 씁니다.",
        meta: `${id}에 저장되어 내보내기와 게임에도 그대로 따라갑니다`,
      }, (value, done) => this.callbacks.onAnimationSetting(id, { speed: value }, done)),

      this.animKnob("강도", strength, 0, 2, `${strength.toFixed(2)}배`, {
        title: "움직임 크기",
        body: "1이 원래 크기입니다. 0이면 아예 움직이지 않고, 2면 두 배 크게 움직입니다. 관절마다의 강도 값과 곱해집니다.",
        meta: "너무 크면 그림이 찢어져 보일 수 있습니다",
      }, (value, done) => this.callbacks.onAnimationSetting(id, { strength: value }, done)),

      this.animKnob("흔들림", swing, 0, 2, `${swing.toFixed(2)}배`, {
        title: "따라 흔들림 (Secondary Motion)",
        body: "꼬리 · 머리카락 · 촉수처럼 몸에 매달린 부위가 몸을 한 박자 늦게 따라 흔들리는 정도입니다. 애니메이션에 그런 트랙이 없어도 자동으로 생깁니다.",
        meta: "secondary 태그가 붙은 관절에만 적용됩니다 · 0이면 끕니다",
      }, (value, done) => this.callbacks.onAnimationSetting(id, { secondary: value }, done)),
    );

    // 좌우 반전 — 동작 하나씩 정한다. 걷기는 오른쪽으로, 후려치기는 왼쪽으로 둘 수 있다.
    const flip = document.createElement("button");
    flip.type = "button";
    flip.className = animation.mirror ? "anim-flip active" : "anim-flip";
    flip.textContent = "좌우 반전";
    flip.setAttribute("aria-pressed", String(animation.mirror === true));
    attachTooltip(flip, {
      title: animation.mirror ? "좌우가 뒤집힌 동작" : "좌우 반전",
      body: "이 동작만 좌우를 뒤집습니다. 앞으로 나가던 걸음과 공격이 반대쪽으로 갑니다. 그림과 관절 자리는 그대로입니다.",
      meta: "그림 자체를 뒤집으려면 설정의 좌우 뒤집기를 쓰세요 · 이 값도 내보내기에 따라갑니다",
    });
    flip.addEventListener("click", () => {
      // 누르는 시점의 값을 스토어에서 다시 읽는다.
      // 이 줄은 같은 애니메이션이 골라져 있는 동안 다시 만들어지지 않아서(아래 빠른 갱신 경로),
      // 여기서 바깥의 `animation`을 쓰면 처음 그렸을 때의 값에 영원히 묶인다.
      // 그러면 켜지기만 하고 다시 눌러도 꺼지지 않는다.
      const now = this.store.get().project.animations[id];
      this.callbacks.onAnimationSetting(id, { mirror: !now?.mirror });
    });

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "anim-reset";
    reset.textContent = "되돌리기";
    attachTooltip(reset, {
      title: "기본값으로",
      body: "속도 · 강도 · 흔들림을 모두 1로 되돌리고 좌우 반전을 끕니다.",
      meta: `대상: ${id}`,
    });
    reset.addEventListener("click", () =>
      this.callbacks.onAnimationSetting(id, {
        speed: 1,
        strength: 1,
        secondary: 1,
        mirror: false,
      }),
    );
    this.animSettings.append(flip, reset);
  }

  /** 하단 바에 들어가는 작은 조절 막대. 1 자리에 눈금이 있다. */
  private animKnob(
    label: string,
    value: number,
    min: number,
    max: number,
    readoutText: string,
    tip: { title: string; body: string; meta: string },
    onChange: (value: number, done: boolean) => void,
    unit = "배",
  ): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "anim-knob";

    const labelElement = document.createElement("span");
    labelElement.className = "knob-label";
    labelElement.textContent = label;
    attachTooltip(labelElement, tip);

    const track = document.createElement("div");
    track.className = "knob-track";
    // 기본값 1이 어디인지 눈금으로 표시한다.
    track.style.setProperty("--default-at", `${((1 - min) / (max - min)) * 100}%`);

    const fill = document.createElement("div");
    fill.className = "knob-fill";
    fill.style.width = `${((value - min) / (max - min)) * 100}%`;

    const readout = document.createElement("span");
    readout.className = "knob-readout";
    readout.textContent = readoutText;

    // 끄는 동안의 값. 손을 뗄 때 이 값으로 한 번 더 알려 준다 —
    // 받는 쪽이 "드래그 한 번"을 Undo 한 단위로 묶을 수 있게 하기 위한 것이다.
    let last = value;

    const setFromEvent = (event: PointerEvent) => {
      const bounds = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
      const next = Math.round((min + ratio * (max - min)) * 20) / 20;
      fill.style.width = `${ratio * 100}%`;
      readout.textContent = `${next.toFixed(2)}${unit}`;
      last = next;
      onChange(next, false);
    };

    track.addEventListener("pointerdown", (event) => {
      track.setPointerCapture(event.pointerId);
      setFromEvent(event);
    });
    track.addEventListener("pointermove", (event) => {
      if (event.buttons === 1) setFromEvent(event);
    });
    const finish = () => onChange(last, true);
    track.addEventListener("pointerup", finish);
    track.addEventListener("pointercancel", finish);

    track.append(fill);
    wrapper.append(labelElement, track, readout);
    return wrapper;
  }

  /** 이름 칸을 입력창으로 바꿔 즉석에서 고친다. */
  private startRename(anchor: HTMLElement, id: string): void {
    hideTooltip();

    const input = document.createElement("input");
    input.type = "text";
    input.className = "anim-rename";
    input.value = id;
    input.size = Math.max(6, id.length);

    let done = false;
    const finish = (commit: boolean) => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      input.replaceWith(anchor);
      this.animSignature = "";
      if (commit && value && value !== id) this.callbacks.onRenameAnimation(id, value);
      else this.render();
    };

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") finish(true);
      if (event.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));

    anchor.replaceWith(input);
    input.focus();
    input.select();
  }

  private renderAnimations(): void {
    const { project, playing } = this.store.get();
    const entries = Object.entries(project.animations);

    // 목록 구성이 그대로면 재생 표시만 바꾼다.
    // 통째로 다시 그리면 그 사이에 눌린 더블클릭이 사라져 이름 바꾸기가 안 된다.
    const signature = `${entries
      .map(([id, animation]) => `${id}:${animation.hidden ? 1 : 0}`)
      .join(",")}|${this.animPickerOpen}|${this.store.get().selectedAnimation}`;

    if (signature === this.animSignature) {
      for (const item of this.animButtons.querySelectorAll<HTMLElement>(".anim-item")) {
        item.classList.toggle("playing", item.dataset.animId === playing);
      }
      return;
    }
    this.animSignature = signature;
    this.animButtons.replaceChildren();
    for (const [id, animation] of entries) {
      const item = document.createElement("div");
      item.className = "anim-item";
      item.dataset.animId = id;
      if (animation.hidden) item.classList.add("hidden-anim");
      if (playing === id) item.classList.add("playing");

      const play = document.createElement("button");
      play.type = "button";
      play.className = "anim-play";
      play.textContent = id;
      attachTooltip(play, {
        title: id,
        body: `${describeAnimation(animation)}${
          animation.hidden ? " · 지금은 내보내기에서 제외됨" : ""
        }`,
        meta: "누르면 재생 · 더블클릭하면 이름 변경 (게임에서 부를 이름입니다)",
      });
      play.addEventListener("click", () => this.callbacks.onPlay(id));
      play.addEventListener("dblclick", () => this.startRename(play, id));
      if (this.store.get().selectedAnimation === id) item.classList.add("tuning");

      const hide = document.createElement("button");
      hide.type = "button";
      hide.className = "anim-hide";
      setIcon(hide, animation.hidden ? "plus" : "minus");
      hide.title = animation.hidden
        ? "내보내기에 다시 포함"
        : "내보내기에서만 빼기 (파일에는 남는다)";
      hide.setAttribute("aria-label", hide.title);
      hide.addEventListener("click", () => this.callbacks.onToggleAnimationHidden(id));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "anim-remove";
      remove.append(icon("close"));
      remove.title = `${presetLabel(id)} 삭제`;
      remove.setAttribute("aria-label", remove.title);
      remove.addEventListener("click", () => this.callbacks.onRemoveAnimation(id));

      item.append(play, hide, remove);
      this.animButtons.append(item);
    }

    if (entries.length === 0) {
      const empty = document.createElement("span");
      empty.className = "anim-empty";
      empty.textContent = "애니메이션 없음";
      this.animButtons.append(empty);
    }

    const add = document.createElement("button");
    add.type = "button";
    add.className = "anim-add";
    // 닫을 때는 말로 적는다. 아이콘만 두면 "무엇을 닫는지" 알기 어렵다.
    if (this.animPickerOpen) {
      add.dataset.icon = "";
      add.textContent = "닫기";
    } else {
      setIcon(add, "plus");
    }
    add.title = "애니메이션 추가";
    add.addEventListener("click", () => {
      this.animPickerOpen = !this.animPickerOpen;
      this.render();
    });
    this.animButtons.append(add);

    this.animPicker.replaceChildren();
    this.animPicker.classList.toggle("open", this.animPickerOpen);
    if (!this.animPickerOpen) return;

    /**
     * 이 목록은 **고르는 곳**이고 아래 줄은 **가진 것**이다.
     * 둘 다 이름이 나열돼 있어서 같은 것이 두 번 있는 것처럼 보이기 쉬웠다.
     * 그래서 여기에 무슨 곳인지 적고, 버튼마다 ＋를 붙이고, 이미 담은 것은 그렇다고 표시한다.
     */
    const head = document.createElement("div");
    head.className = "anim-picker-head";
    const headTitle = document.createElement("strong");
    headTitle.textContent = "애니메이션 추가";
    const headHint = document.createElement("span");
    headHint.textContent = "고르면 아래 목록에 담기고 바로 재생됩니다";
    head.append(headTitle, headHint);
    this.animPicker.append(head);

    // 이미 담아 둔 프리셋. 이름 뒤 번호(walk2)는 떼고 본다.
    const owned = new Set(
      Object.keys(project.animations).map((id) => id.replace(/\d+$/, "")),
    );

    for (const group of PRESET_GROUPS) {
      const presets = PRESETS.filter((candidate) => candidate.group === group);
      if (presets.length === 0) continue;

      const column = document.createElement("div");
      column.className = "anim-group";

      const title = document.createElement("h4");
      // 프리셋 그룹도 데이터의 한국어 원문을 그대로 노출하지 않고 공용 번역기를 거친다.
      title.textContent = translate(group);
      column.append(title);

      const row = document.createElement("div");
      row.className = "anim-group-items";

      for (const preset of presets) {
        const has = owned.has(preset.id);
        const button = document.createElement("button");
        button.type = "button";
        button.className = has ? "outlined has" : "outlined";
        button.append(icon("plus"));
        const label = document.createElement("span");
        label.textContent = translate(preset.label);
        button.append(label);

        attachTooltip(button, {
          title: `${translate(preset.label)} (${preset.id})`,
          body: translatePresetDescription(translate(preset.label), preset.description),
          // 보유 여부와 태그 목록은 i18n의 언어별 문장 틀에서 값을 직접 조립한다.
          meta: formatPresetMeta(describeAnimation(preset.animation), has, usedTags(preset.animation)),
        });
        button.addEventListener("click", () => {
          this.callbacks.onAddAnimation(preset.id);
          this.animPickerOpen = false;
          this.render();
        });
        row.append(button);
      }

      column.append(row);
      this.animPicker.append(column);
    }
  }

  /** 어떤 파츠를 추가할지 고르는 목록. (기획서 9) */
  private buildPartSelect(): void {
    this.partSelect = document.createElement("select");
    this.partSelect.className = "part-select";
    for (const part of PART_NAMES) {
      const option = document.createElement("option");
      option.value = part;
      option.textContent = part;
      this.partSelect.append(option);
    }
    this.addBoneButton.before(this.partSelect);
    this.addBoneButton.addEventListener("click", () =>
      this.callbacks.onAddBone(this.partSelect.value),
    );
  }

  /**
   * 상단 메뉴. 파일 관련은 `파일` 하나로 모으고, 캐릭터 설정은 `설정`에 둔다.
   * 버튼을 늘어놓는 대신 눌러서 펼치는 방식이라 상단이 캔버스를 덜 잡아먹는다.
   */
  private bindMenu(): void {
    for (const item of FILE_MENU) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dropdown-item";
      button.dataset.menu = item.action;

      const label = document.createElement("span");
      label.textContent = translate(item.label);
      button.append(label);

      if (item.shortcut) {
        const key = document.createElement("kbd");
        key.textContent = item.shortcut;
        button.append(key);
      }

      button.addEventListener("click", () => {
        this.setOpenMenu(null);
        this.callbacks.onMenu(item.action);
      });
      this.fileMenu.append(button);
    }

    this.fileButton.addEventListener("click", () =>
      this.setOpenMenu(this.openMenu === "file" ? null : "file"),
    );
    this.settingsButton.addEventListener("click", () =>
      this.setOpenMenu(this.openMenu === "settings" ? null : "settings"),
    );

    // 바깥을 누르거나 Esc를 누르면 닫는다.
    document.addEventListener("pointerdown", (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".dropdown")) return;
      this.setOpenMenu(null);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.setOpenMenu(null);
    });
  }

  /** 설정 메뉴를 밖에서 열 때 쓴다. */
  openSettings(): void {
    this.setOpenMenu("settings");
  }

  /**
   * 캔버스 위에 떠 있는 것들을 전부 내린다. 캔버스를 만졌을 때 부른다.
   *
   * 좁은 화면에서는 프리셋 목록이 화면 절반을 덮는다. 재생을 구경하려고 화면을 눌렀는데
   * 목록이 그대로 남아 있으면 정작 캐릭터가 보이지 않는다.
   * 무언가 실제로 닫혔을 때만 true다 — 부르는 쪽이 헛일을 했는지 알 수 있게.
   */
  closePopups(): boolean {
    const had = this.animPickerOpen || this.openMenu !== null;
    if (!had) return false;

    this.animPickerOpen = false;
    this.setOpenMenu(null);
    this.animPicker.classList.remove("open");
    this.render();
    return true;
  }

  private setOpenMenu(menu: "file" | "settings" | null): void {
    this.openMenu = menu;
    hideTooltip();

    this.fileMenu.classList.toggle("open", menu === "file");
    this.settingsPanel.classList.toggle("open", menu === "settings");
    this.fileButton.classList.toggle("active", menu === "file");
    this.settingsButton.classList.toggle("active", menu === "settings");
    this.fileButton.setAttribute("aria-expanded", String(menu === "file"));
    this.settingsButton.setAttribute("aria-expanded", String(menu === "settings"));

    if (menu === "settings") this.renderSettings();
  }

  /**
   * 설정 패널 다시 그리기를 다음 차례로 미룬다.
   * 입력칸에서 포커스가 빠질 때 값이 확정되는데, 그 자리에서 칸을 통째로 갈아 끼우면
   * 브라우저가 처리하던 blur 대상이 사라져 버린다.
   */
  private scheduleSettingsRender(): void {
    if (this.settingsPending) return;
    this.settingsPending = true;
    setTimeout(() => {
      this.settingsPending = false;
      if (this.openMenu === "settings") this.renderSettings();
    }, 0);
  }

  /**
   * 설정 내용. 캐릭터 하나에 딸린 값들이다.
   * 이미지를 불러오기 전에는 바꿀 것이 없다.
   */
  private renderSettings(): void {
    const { project, textureUrl, pixelArtReason } = this.store.get();
    this.settingsPanel.replaceChildren();

    // 언어는 프로젝트가 아닌 브라우저 설정이므로 이미지가 없어도 항상 맨 위에 노출한다.
    const language = document.createElement("label");
    language.className = "field settings-language";
    const languageLabel = document.createElement("span");
    languageLabel.textContent = translate("언어");
    const languageSelect = document.createElement("select");
    languageSelect.setAttribute("aria-label", translate("언어"));
    for (const item of LANGUAGES) {
      const option = document.createElement("option");
      option.value = item.code;
      option.textContent = item.name;
      option.selected = item.code === getLanguage();
      languageSelect.append(option);
    }
    languageSelect.addEventListener("change", () => {
      setLanguage(languageSelect.value as (typeof LANGUAGES)[number]["code"]);
      // 이미 생성된 동적 UI와 툴팁도 빠짐없이 새 언어로 다시 만들기 위해 새로고침한다.
      window.location.reload();
    });
    language.append(languageLabel, languageSelect);
    this.settingsPanel.append(language);

    if (!textureUrl) {
      const hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent = translate("이미지를 불러오면 설정할 수 있습니다.");
      this.settingsPanel.append(hint);
      return;
    }

    this.settingsPanel.append(
      this.textField(translate("이름"), project.character.name, (value) =>
        this.callbacks.onCharacterSetting({ name: value.trim() || "character" }),
      ),
    );

    const size = document.createElement("p");
    size.className = "hint";
    size.textContent = `${project.character.texture} · ${project.character.width} × ${project.character.height}`;
    this.settingsPanel.append(size);

    // 그림 종류 — 불러올 때 자동으로 판정하고, 틀렸으면 여기서 바꾼다. (기획서 51)
    this.settingsPanel.append(
      this.choiceField(
        translate("그림"),
        {
          title: "그림 종류",
          body: "도트로 보면 확대해도 픽셀이 또렷하게 남고, 일반으로 보면 부드럽게 뭉갭니다. 불러올 때 자동으로 판정합니다.",
          meta: "여기서 바꾸면 자동 판정을 덮어씁니다",
        },
        [
          { value: false, label: translate("일반") },
          { value: true, label: translate("도트") },
        ],
        project.character.pixelArt,
        (value) => this.callbacks.onCharacterSetting({ pixelArt: value }),
      ),
    );

    if (pixelArtReason) {
      const reason = document.createElement("p");
      reason.className = "hint";
      reason.textContent = `자동 판정: ${pixelArtReason}`;
      this.settingsPanel.append(reason);
    }

    // 격자 해상도 (기획서 15)
    const mesh = project.mesh;
    this.settingsPanel.append(
      this.choiceField(
        translate("격자"),
        {
          title: "Mesh 해상도",
          body: "이미지를 몇 칸으로 나눠 변형할지 정합니다. 촘촘할수록 섬세하게 휘지만 무거워지고, 성길수록 가볍지만 뭉툭하게 휩니다. 도트 그림은 과하게 휘면 깨져 보여 낮은 쪽이 좋습니다.",
          meta: "바꿔도 칠해 둔 영향 영역은 새 격자로 옮겨 담습니다",
        },
        MESH_CHOICES,
        mesh?.resolution ?? "normal",
        (value) => {
          this.callbacks.onCharacterSetting({ resolution: value });
          this.renderSettings();
        },
      ),
    );

    if (mesh) {
      const grid = document.createElement("p");
      grid.className = "hint";
      grid.textContent = `${mesh.cols} × ${mesh.rows}칸 · 정점 ${(mesh.cols + 1) * (mesh.rows + 1)}개`;
      this.settingsPanel.append(grid);
    }

    // 그림 · 관절 · 칠한 영역을 실제로 뒤집는다. 동작 하나만 뒤집는 것과는 다른 일이라
    // 조절값이 아니라 "실행하는 버튼"으로 둔다.
    const flip = document.createElement("button");
    flip.type = "button";
    flip.className = "settings-action";
    flip.textContent = translate("좌우 뒤집기");
    attachTooltip(flip, {
      title: "그림과 관절을 통째로 뒤집기",
      body: "그림 · 관절 자리 · 칠해 둔 영향 영역을 모두 좌우로 옮깁니다. 왼쪽을 보는 그림을 받았을 때 아예 오른쪽을 보게 만드는 용도입니다.",
      meta: "동작 하나만 뒤집으려면 하단의 좌우 반전을 쓰세요 · 한 번 더 누르면 돌아옵니다",
    });
    flip.addEventListener("click", () => this.callbacks.onFlipCharacter());
    this.settingsPanel.append(flip);
  }

  /** 몇 갈래 중 하나를 고르는 줄. 설정에서 여러 번 쓴다. */
  private choiceField<T>(
    label: string,
    tip: { title: string; body: string; meta: string },
    options: readonly { value: T; label: string }[],
    current: T,
    onPick: (value: T) => void,
  ): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "field field-choice";

    const labelElement = document.createElement("label");
    labelElement.textContent = label;
    attachTooltip(labelElement, tip);

    const row = document.createElement("div");
    row.className = "choice-row";
    for (const option of options) {
      const button = document.createElement("button");
      button.type = "button";
      const on = option.value === current;
      button.className = on ? "choice active-fill" : "choice";
      button.textContent = option.label;
      button.setAttribute("aria-pressed", String(on));
      button.addEventListener("click", () => onPick(option.value));
      row.append(button);
    }

    wrapper.append(labelElement, row);
    return wrapper;
  }

  private render(): void {
    hideTooltip();
    const { project, visibility, selectedBoneId, textureUrl } = this.store.get();

    for (const button of this.layerToggles.querySelectorAll("button")) {
      const on = visibility[button.dataset.layer as OverlayLayer] ?? true;
      button.classList.toggle("active", on);
      button.setAttribute("aria-pressed", String(on));
    }

    this.dropzone.classList.toggle("hidden", textureUrl !== null);
    this.addBoneButton.disabled = textureUrl === null;

    // 첫 관절은 캐릭터 전체의 기준이 되므로 `중심`으로 고정한다.
    const firstBone = project.bones.length === 0;
    this.partSelect.disabled = textureUrl === null || firstBone;
    if (firstBone) this.partSelect.value = ROOT_PART;
    this.partSelect.title = firstBone
      ? "첫 관절은 캐릭터 전체의 기준(중심)이 됩니다"
      : "추가할 파츠 고르기";

    if (this.openMenu === "settings") this.scheduleSettingsRender();
    this.renderAnimations();
    this.renderAnimationSettings();
    this.renderBoneList(project.bones, selectedBoneId);
    this.renderInspector(project.bones, selectedBoneId);
  }

  private renderBoneList(bones: readonly PuppetBone[], selectedBoneId: string | null): void {
    this.boneList.replaceChildren();

    const depthOf = (bone: PuppetBone): number => {
      let depth = 0;
      let cursor = bone.parentId;
      const guard = new Set<string>();
      while (cursor && !guard.has(cursor)) {
        guard.add(cursor);
        depth += 1;
        cursor = bones.find((b) => b.id === cursor)?.parentId ?? null;
      }
      return depth;
    };

    for (const bone of bones) {
      this.boneList.append(this.boneRow(bone, depthOf(bone), bone.id === selectedBoneId));
    }

    this.boneHint.textContent =
      bones.length === 0
        ? "이미지를 불러온 뒤 관절을 추가하세요."
        : `관절 ${bones.length}개 · 끌어서 순서 변경`;
  }

  /** 관절 목록의 한 줄. 드래그로 순서를 바꾸고 ×로 삭제한다. */
  private boneRow(bone: PuppetBone, depth: number, selected: boolean): HTMLLIElement {
    const row = document.createElement("li");
    row.className = "bone-row";
    row.dataset.boneId = bone.id;
    row.draggable = true;
    row.title = bone.tags.length > 0 ? bone.tags.join(", ") : "태그 없음";
    row.classList.toggle("selected", selected);
    row.style.paddingLeft = `${10 + depth * 12}px`;
    row.addEventListener("click", () => this.store.set({ selectedBoneId: bone.id }));

    const grip = document.createElement("span");
    grip.className = "grip";
    grip.append(icon("grip"));
    grip.setAttribute("aria-hidden", "true");

    const dot = document.createElement("span");
    dot.className = "bone-color";
    dot.style.background = bone.color;

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = bone.name;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove";
    remove.append(icon("close"));
    remove.title = `${bone.name} 삭제`;
    remove.setAttribute("aria-label", `${bone.name} 삭제`);
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      this.callbacks.onDeleteBone(bone.id);
    });

    row.append(grip, dot, name, remove);
    this.bindRowDrag(row, bone.id);
    return row;
  }

  private bindRowDrag(row: HTMLLIElement, boneId: string): void {
    row.addEventListener("dragstart", (event) => {
      this.draggingBoneId = boneId;
      row.classList.add("dragging");
      event.dataTransfer?.setData("text/plain", boneId);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    });

    row.addEventListener("dragend", () => {
      this.draggingBoneId = null;
      this.clearDropMarks();
      row.classList.remove("dragging");
    });

    row.addEventListener("dragover", (event) => {
      if (!this.draggingBoneId || this.draggingBoneId === boneId) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";

      const bounds = row.getBoundingClientRect();
      const after = event.clientY > bounds.top + bounds.height / 2;
      this.clearDropMarks();
      row.classList.add(after ? "drop-after" : "drop-before");
    });

    row.addEventListener("dragleave", () => {
      row.classList.remove("drop-before", "drop-after");
    });

    row.addEventListener("drop", (event) => {
      event.preventDefault();
      const draggedId = this.draggingBoneId ?? event.dataTransfer?.getData("text/plain");
      const place = row.classList.contains("drop-after") ? "after" : "before";
      this.clearDropMarks();
      if (!draggedId || draggedId === boneId) return;
      this.callbacks.onReorderBone(draggedId, boneId, place);
    });
  }

  private clearDropMarks(): void {
    for (const row of this.boneList.querySelectorAll(".bone-row")) {
      row.classList.remove("drop-before", "drop-after");
    }
  }

  private renderInspector(bones: readonly PuppetBone[], selectedBoneId: string | null): void {
    this.inspector.replaceChildren();
    const bone = bones.find((b) => b.id === selectedBoneId);
    if (!bone) {
      // 고른 관절이 없으면 캐릭터 전체 설정을 보여 준다.
      this.renderCharacterSettings();
      return;
    }

    this.inspector.append(
      this.textField("이름", bone.name, (value) =>
        this.callbacks.onUpdateBone(bone.id, { name: value }),
      ),
      this.colorField(bone),
      this.parentField(bones, bone),
      this.tagsField(bone),
      this.numberField("강도", bone.motionStrength, (value) =>
        this.callbacks.onUpdateBone(bone.id, { motionStrength: value }),
      ),
      this.deformField(bone),
    );

    if (this.tagPickerBoneId === bone.id) {
      this.inspector.append(this.tagPicker(bone));
    }

    if (this.colorOpenBoneId === bone.id) {
      this.inspector.append(
        createColorWheel(bone.color, (color) =>
          this.callbacks.onUpdateBone(bone.id, { color }),
        ),
      );
    }

    const coords = document.createElement("p");
    coords.className = "hint";
    coords.textContent = `위치 ${Math.round(bone.x)}, ${Math.round(bone.y)}`;
    this.inspector.append(coords, this.keySection(bone), this.weightSection(bone));
  }

  /**
   * 이 관절에 직접 찍어 둔 키. (기획서 21, 26)
   *
   * 프리셋(태그)의 키는 여기 나오지 않는다 — 손댈 수 없는 것을 보여 주면 헷갈린다.
   * 재생 헤드가 키 위에 서 있으면 그 키의 보간 방식을 바로 고칠 수 있다.
   */
  private keySection(bone: PuppetBone): HTMLElement {
    const wrapper = document.createElement("section");
    wrapper.className = "key-section";

    const state = this.store.get();
    const animationId = state.selectedAnimation;
    const animation = animationId ? state.project.animations[animationId] : undefined;
    if (!animation) return wrapper;

    const title = document.createElement("h3");
    title.className = "inspector-title";
    title.textContent = "키";
    // 애니메이션 이름은 사용자가 지은 것이라 대문자로 바꾸지 않고 그대로 둔다.
    const which = document.createElement("span");
    which.className = "key-anim";
    which.textContent = animationId ?? "";
    title.append(which);
    wrapper.append(title);

    const tracks = ownTracks(animation, bone.id);
    if (tracks.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent =
        "직접 찍은 키가 없습니다. 일시정지한 뒤 관절을 끌면 그 시점에 키가 생깁니다.";
      wrapper.append(empty);
      return wrapper;
    }

    const list = document.createElement("ul");
    list.className = "key-tracks";
    for (const track of tracks) {
      const row = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = PROPERTY_NAMES[track.property] ?? track.property;
      const count = document.createElement("span");
      count.className = "key-count";
      count.textContent = `${track.keys.length}개`;
      row.append(name, count);
      list.append(row);
    }
    wrapper.append(list);

    // 재생 헤드가 선 자리에 키가 있으면 보간 방식을 고칠 수 있다.
    const here = this.callbacks.onKeyQuery(bone.id);
    if (!here) {
      const away = document.createElement("p");
      away.className = "hint";
      away.textContent = "재생 헤드를 키 위에 두면 보간 방식을 고칠 수 있습니다.";
      wrapper.append(away);
      return wrapper;
    }

    const row = document.createElement("div");
    row.className = "field field-choice";
    const label = document.createElement("label");
    label.textContent = "보간";
    attachTooltip(label, {
      title: "다음 키까지 어떻게 갈지",
      body: "이 키에서 다음 키로 이어질 때의 방식입니다. 마지막 키의 값은 당장 드러나지 않고, 뒤에 키를 더 찍으면 살아납니다.",
      meta: `${here.time.toFixed(2)}초의 키 ${here.count}개에 함께 적용됩니다`,
    });

    const choices = document.createElement("div");
    choices.className = "choice-row";
    for (const option of EASE_OPTIONS) {
      const button = document.createElement("button");
      button.type = "button";
      const on = here.ease === option.id;
      button.className = on ? "choice active-fill" : "choice";
      button.textContent = option.label;
      button.setAttribute("aria-pressed", String(on));
      attachTooltip(button, { title: option.label, body: option.help, meta: option.example });
      button.addEventListener("click", () => this.callbacks.onKeyEase(bone.id, option.id));
      choices.append(button);
    }
    row.append(label, choices);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "outlined key-remove";
    remove.textContent = `${here.time.toFixed(2)}초 키 지우기`;
    attachTooltip(remove, {
      title: "이 시각의 키 지우기",
      body: "재생 헤드가 선 자리에 직접 찍어 둔 키를 모든 속성에서 지웁니다.",
      meta: "단축키 Delete · 타임라인 마름모 우클릭도 같습니다",
    });
    remove.addEventListener("click", () => this.callbacks.onKeyDelete(bone.id));

    wrapper.append(row, remove);
    return wrapper;
  }

  /**
   * 영향 영역 칠하기. (기획서 16, 18)
   * 상단 토글은 표시 여부만 담당하므로, 실제 칠하는 조작은 여기에 둔다.
   */
  private weightSection(bone: PuppetBone): HTMLElement {
    const { brush, project } = this.store.get();
    const section = document.createElement("section");
    section.className = "section";

    const title = document.createElement("h3");
    title.textContent = "영향 영역";
    section.append(title);

    if (!project.mesh) {
      const hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent = "이미지를 먼저 불러오세요.";
      section.append(hint);
      return section;
    }

    section.append(this.autoWeightRow(bone));

    // 기존 chip 모양을 그대로 써서 별도의 색이나 새로운 조작 문법을 만들지 않는다.
    const strengthRow = document.createElement("div");
    strengthRow.className = "weight-strength";
    const strengthLabel = document.createElement("span");
    strengthLabel.className = "hint";
    strengthLabel.textContent = "보정 강도";
    strengthRow.append(strengthLabel);
    for (const [value, label] of [["weak", "약하게"], ["normal", "보통"], ["strong", "강하게"]] as const) {
      const choice = document.createElement("button");
      choice.type = "button";
      choice.className = this.weightCorrectionStrength === value ? "chip active" : "chip";
      choice.textContent = label;
      choice.setAttribute("aria-pressed", String(this.weightCorrectionStrength === value));
      choice.addEventListener("click", () => {
        this.weightCorrectionStrength = value;
        this.render();
      });
      strengthRow.append(choice);
    }
    section.append(strengthRow);

    // 두 동작은 선택 관절 하나가 아니라 캐릭터 전체를 다루므로 같은 비중의 묶음으로 둔다.
    const bulkTools = document.createElement("div");
    bulkTools.className = "weight-bulk-tools";
    const fillAll = document.createElement("button");
    fillAll.type = "button";
    fillAll.className = "outlined";
    fillAll.textContent = "모두 채우기";
    fillAll.title = "현재 관절과 가중치를 기준으로 그림의 모든 빈 영역을 채웁니다.";
    fillAll.addEventListener("click", () => this.callbacks.onFillAllWeights(this.weightCorrectionStrength));
    const cleanup = document.createElement("button");
    cleanup.type = "button";
    cleanup.className = "outlined";
    cleanup.textContent = "정리";
    cleanup.title = "고립된 작은 자국과 희미한 잔여 영역을 지우고 빈 곳을 메웁니다.";
    cleanup.addEventListener("click", () => this.callbacks.onCleanupWeights(this.weightCorrectionStrength));
    bulkTools.append(fillAll, cleanup);
    section.append(bulkTools);

    // 칠하기 / 지우개는 한 줄에 모은 아이콘 토글이다.
    // 같은 것을 다시 누르면 꺼지고, 다른 것을 누르면 그쪽으로 바뀐다.
    const tools = document.createElement("div");
    tools.className = "tool-row";
    tools.append(
      this.toolButton("brush", "brush", "칠하기", brush.tool === "brush"),
      this.toolButton("eraser", "eraser", "지우개", brush.tool === "eraser"),
    );
    section.append(tools);

    // 가중치가 먼저다. 한 번에 얼마나 쌓을지가 크기보다 자주 바뀐다.
    section.append(this.weightMeter(brush.amount), this.brushSizes(brush.size, brush.amount));

    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent =
      brush.tool === "brush"
        ? `${bone.name}에 칠하는 중 · 캔버스를 드래그하세요`
        : brush.tool === "eraser"
          ? `${bone.name}에서 지우는 중 · 캔버스를 드래그하세요`
          : "칠하기나 지우개를 켜면 캔버스 드래그가 영역 편집으로 바뀝니다.";
    section.append(hint);

    return section;
  }

  /**
   * 자동 / 직접 전환. 이 관절의 영향 영역을 툴에 맡길지 손으로 잡을지 정한다.
   *
   * 새 관절은 자동으로 시작하고, 한 번이라도 칠하면 자동이 저절로 꺼진다.
   * 잘못 칠했을 때 처음 상태로 돌아올 길을 남겨 두기 위해 여기서 다시 켤 수 있다.
   */
  private autoWeightRow(bone: PuppetBone): HTMLElement {
    const auto = bone.autoWeight === true;
    const row = document.createElement("div");
    row.className = "auto-weight";

    const button = document.createElement("button");
    button.type = "button";
    button.className = auto ? "chip active" : "chip";
    button.textContent = auto ? "자동" : "직접";
    button.setAttribute("aria-pressed", String(auto));
    attachTooltip(button, {
      title: auto ? "자동으로 맡기는 중" : "직접 칠한 영역",
      body: auto
        ? "관절을 옮기거나 더할 때마다 이 관절의 영향 영역을 다시 계산합니다. 칠하기 시작하면 자동으로 꺼집니다."
        : "손으로 칠한 값을 그대로 지킵니다. 눌러서 자동으로 되돌리면 지금 칠한 것은 사라집니다.",
      meta: "가까운 관절일수록 많이 가져가는 거리 기준입니다",
    });
    button.addEventListener("click", () => this.callbacks.onAutoWeight(bone.id, !auto));

    const note = document.createElement("span");
    note.className = "hint";
    note.textContent = auto ? "관절만 놓으면 알아서 칠해집니다" : "이 관절은 직접 맡고 있습니다";

    row.append(button, note);
    return row;
  }

  private toolButton(
    tool: "brush" | "eraser",
    glyph: IconName,
    label: string,
    active: boolean,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = active ? "tool active-fill" : "tool";
    button.title = active ? `${label} 끄기` : label;
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", label);

    const mark = document.createElement("span");
    mark.className = "glyph";
    mark.append(icon(glyph));
    const text = document.createElement("span");
    text.textContent = label;
    button.append(mark, text);

    button.addEventListener("click", () =>
      this.callbacks.onBrushChange({ tool: active ? null : tool }),
    );
    return button;
  }

  /** 관절을 고르지 않았을 때. 캐릭터 요약만 보여 주고 설정은 상단으로 넘긴다. */
  private renderCharacterSettings(): void {
    const { project, textureUrl } = this.store.get();

    if (!textureUrl) {
      const hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent = "이미지를 불러오면 여기에 캐릭터 정보가 나옵니다.";
      this.inspector.append(hint);
      return;
    }

    const title = document.createElement("h3");
    title.className = "inspector-title";
    title.textContent = "캐릭터";
    this.inspector.append(title);

    const summary = document.createElement("p");
    summary.className = "hint";
    summary.textContent = [
      project.character.name,
      `${project.character.width} × ${project.character.height}`,
      project.character.pixelArt ? "도트" : "일반",
      project.mesh ? `격자 ${project.mesh.cols} × ${project.mesh.rows}` : "격자 없음",
      `관절 ${project.bones.length}개`,
      `애니메이션 ${Object.keys(project.animations).length}개`,
    ].join(" · ");
    this.inspector.append(summary);

    const actions = document.createElement("div");
    actions.className = "inspector-actions";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "outlined";
    open.textContent = "설정 열기";
    attachTooltip(open, {
      title: "설정",
      body: "이름 · 그림 종류(일반/도트) · 격자 해상도를 바꿉니다.",
      meta: "상단 `설정` 버튼과 같은 곳입니다",
    });
    open.addEventListener("click", () => this.openSettings());
    actions.append(open);
    this.inspector.append(actions);

    const pick = document.createElement("p");
    pick.className = "hint";
    pick.textContent = "관절을 고르면 그 관절의 속성이 나옵니다.";
    this.inspector.append(pick);
  }

  /** 관절 색. 원형 팔레트는 색 견본을 누를 때만 펼친다. */
  private colorField(bone: PuppetBone): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "field field-color";

    const label = document.createElement("label");
    label.textContent = "색";

    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "swatch";
    swatch.style.background = bone.color;
    swatch.title = "색 고르기";
    swatch.setAttribute("aria-expanded", String(this.colorOpenBoneId === bone.id));

    swatch.addEventListener("click", () => {
      this.colorOpenBoneId = this.colorOpenBoneId === bone.id ? null : bone.id;
      this.render();
    });

    wrapper.append(label, swatch);
    return wrapper;
  }

  /**
   * 가중치 그래프. 한 번 칠할 때 쌓이는 양이다.
   * 막대를 누르거나 끌어 정한다. 10이면 열 번 칠해야 가득 찬다.
   */
  private weightMeter(value: number): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "field field-meter";

    const label = document.createElement("label");
    label.textContent = "가중치";
    attachTooltip(label, {
      title: "가중치",
      body: "한 번 칠할 때 더해지는 양입니다. 10이면 열 번 겹쳐 칠해야 가득 차고, 100이면 한 번에 최대가 됩니다.",
      meta: "지우개도 같은 값만큼 깎아냅니다",
    });

    const meter = document.createElement("div");
    meter.className = "meter";
    meter.setAttribute("role", "slider");
    meter.setAttribute("aria-valuemin", "1");
    meter.setAttribute("aria-valuemax", "100");
    meter.setAttribute("aria-valuenow", String(value));

    const fill = document.createElement("div");
    fill.className = "meter-fill";
    fill.style.width = `${value}%`;

    const readout = document.createElement("span");
    readout.className = "readout";
    readout.textContent = String(value);

    const setFromEvent = (event: PointerEvent) => {
      const bounds = meter.getBoundingClientRect();
      const ratio = (event.clientX - bounds.left) / bounds.width;
      const next = Math.max(1, Math.min(100, Math.round(ratio * 100)));
      fill.style.width = `${next}%`;
      readout.textContent = String(next);
      meter.setAttribute("aria-valuenow", String(next));
      this.callbacks.onBrushChange({ amount: next });
    };

    meter.addEventListener("pointerdown", (event) => {
      meter.setPointerCapture(event.pointerId);
      setFromEvent(event);
    });
    meter.addEventListener("pointermove", (event) => {
      if (event.buttons === 1) setFromEvent(event);
    });

    meter.append(fill);
    wrapper.append(label, meter, readout);
    return wrapper;
  }

  /**
   * 브러시 크기. 그림 도구처럼 실제 크기에 맞는 점을 눌러 고른다.
   * 숫자보다 점 크기를 보고 고르는 편이 빠르다.
   */
  private brushSizes(current: number, amount: number): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "field field-sizes";

    const label = document.createElement("label");
    label.textContent = "크기";
    attachTooltip(label, {
      title: "브러시 크기",
      body: "칠하거나 지울 원의 반지름입니다(이미지 픽셀 기준). 캔버스의 흰 원이 실제 크기입니다.",
      meta: "가장자리로 갈수록 옅게 칠해집니다",
    });

    const row = document.createElement("div");
    row.className = "size-row";

    // 저장된 값이 선택지와 정확히 같지 않을 수 있으니 가장 가까운 것을 켠다.
    const nearest = BRUSH_SIZES.reduce((best, size) =>
      Math.abs(size - current) < Math.abs(best - current) ? size : best,
    );

    for (const size of BRUSH_SIZES) {
      const selected = size === nearest;
      const button = document.createElement("button");
      button.type = "button";
      button.className = selected ? "size-option selected" : "size-option";
      button.setAttribute("aria-pressed", String(selected));

      const dot = document.createElement("span");
      dot.className = "size-dot";
      // 지름은 로그 눈금으로 매긴다. 제곱근이나 실제 비율로 하면 작은 쪽이 뭉쳐 구분이 안 된다.
      const diameter = Math.round(DOT_MIN + dotScale(size) * (DOT_MAX - DOT_MIN));
      dot.style.width = `${diameter}px`;
      dot.style.height = `${diameter}px`;
      // 가중치가 낮으면 점도 옅게. 한 번 칠했을 때 얼마나 묻는지를 그대로 보여 준다.
      // 가장 낮을 때도 어느 크기인지는 보여야 하므로 0.35 아래로는 내리지 않는다.
      dot.style.opacity = String(0.35 + (amount / 100) * 0.65);

      button.append(dot);
      attachTooltip(button, {
        title: `${size}px`,
        body:
          size <= 10
            ? "아주 가는 브러시. 격자 한두 칸만 건드린다. 경계를 미세하게 고칠 때."
            : size <= 40
              ? "가는 브러시. 손 · 발 · 귀처럼 작은 부위에."
              : size <= 145
                ? "보통 브러시. 팔 · 다리 · 머리 같은 부위에."
                : "굵은 브러시. 몸통을 한 번에 덮을 때.",
        meta: selected
          ? `지금 쓰는 크기 · 점 진하기는 가중치 ${amount}를 나타냅니다`
          : "눌러서 이 크기로 바꾸기",
      });
      button.addEventListener("click", () => this.callbacks.onBrushChange({ size }));
      row.append(button);
    }

    wrapper.append(label, row);
    return wrapper;
  }

  private field(label: string, control: HTMLElement): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "field";
    const labelElement = document.createElement("label");
    labelElement.textContent = label;
    wrapper.append(labelElement, control);
    return wrapper;
  }

  private textField(
    label: string,
    value: string,
    onChange: (value: string) => void,
  ): HTMLDivElement {
    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    input.addEventListener("change", () => onChange(input.value));
    return this.field(label, input);
  }

  private numberField(
    label: string,
    value: number,
    onChange: (value: number) => void,
  ): HTMLDivElement {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "0.1";
    input.value = String(value);
    input.addEventListener("change", () => {
      const parsed = Number.parseFloat(input.value);
      if (Number.isFinite(parsed)) onChange(parsed);
    });
    return this.field(label, input);
  }

  private parentField(bones: readonly PuppetBone[], bone: PuppetBone): HTMLDivElement {
    const select = document.createElement("select");
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "(없음)";
    select.append(none);

    for (const candidate of bones) {
      if (!canReparent(bones, bone.id, candidate.id)) continue;
      const option = document.createElement("option");
      option.value = candidate.id;
      option.textContent = candidate.name;
      select.append(option);
    }
    select.value = bone.parentId ?? "";
    select.addEventListener("change", () =>
      this.callbacks.onUpdateBone(bone.id, { parentId: select.value || null }),
    );
    return this.field("부모", select);
  }

  /**
   * 태그 편집. (기획서 11, 12)
   * 붙어 있는 태그는 칩으로 보여 주고, 목록에서 눌러 추가한다.
   * 각 버튼에 마우스를 올리면 그 태그가 애니메이션에서 무슨 일을 하는지 알려 준다.
   */
  private tagsField(bone: PuppetBone): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "field field-tags";

    const label = document.createElement("label");
    label.textContent = "태그";
    label.title = "애니메이션은 관절 이름이 아니라 태그로 대상을 찾는다.";

    const body = document.createElement("div");
    body.className = "tag-body";

    const chips = document.createElement("div");
    chips.className = "tag-chips";

    for (const tag of bone.tags) {
      chips.append(this.tagChip(bone, tag));
    }

    if (bone.tags.length === 0) {
      const empty = document.createElement("span");
      empty.className = "tag-empty";
      empty.textContent = "없음 · 이 관절은 어떤 애니메이션에도 반응하지 않습니다";
      chips.append(empty);
    }

    const more = document.createElement("button");
    more.type = "button";
    more.className = "tag-add";
    more.textContent = this.tagPickerBoneId === bone.id ? "닫기" : "+ 태그";
    more.title = "붙일 태그 고르기";
    more.addEventListener("click", () => {
      this.tagPickerBoneId = this.tagPickerBoneId === bone.id ? null : bone.id;
      this.render();
    });
    chips.append(more);

    body.append(chips);
    wrapper.append(label, body);
    return wrapper;
  }

  private tagChip(bone: PuppetBone, tag: string): HTMLSpanElement {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    attachTooltip(chip, {
      title: tag,
      body:
        (TAG_DESCRIPTIONS[tag] ? translateTagDescription(tag, TAG_DESCRIPTIONS[tag]) : undefined) ??
        "목록에 없는 태그입니다. 이 태그를 찾는 애니메이션을 만들면 그때부터 쓰입니다.",
      meta: animationsUsingTag(tag),
    });

    const name = document.createElement("span");
    name.textContent = tag;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "tag-remove";
    remove.append(icon("close"));
    remove.title = `${tag} 떼기`;
    remove.setAttribute("aria-label", `${tag} 떼기`);
    remove.addEventListener("click", () =>
      this.callbacks.onUpdateBone(bone.id, {
        tags: bone.tags.filter((candidate) => candidate !== tag),
      }),
    );

    chip.append(name, remove);
    return chip;
  }

  /** 태그 고르기 패널. 묶음별로 나열하고, 이미 붙은 태그는 켜진 상태로 보인다. */
  private tagPicker(bone: PuppetBone): HTMLElement {
    const picker = document.createElement("div");
    picker.className = "tag-picker";

    for (const group of TAG_GROUPS) {
      const tags = TAG_CATALOG.filter((tag) => tag.group === group.id);
      if (tags.length === 0) continue;

      const title = document.createElement("h4");
      // 태그 묶음 이름은 core 데이터와 무관하게 현재 UI 언어로만 바꿔 표시한다.
      title.textContent = translate(group.label);
      picker.append(title);

      const row = document.createElement("div");
      row.className = "tag-options";

      for (const tag of tags) {
        const on = bone.tags.includes(tag.id);
        const button = document.createElement("button");
        button.type = "button";
        button.className = on ? "tag-option active-fill" : "tag-option";
        button.textContent = tag.id;
        button.setAttribute("aria-pressed", String(on));
        attachTooltip(
          button,
          {
            title: on ? `${tag.id} — 붙어 있음 (누르면 뗍니다)` : tag.id,
            body: translateTagDescription(tag.id, tag.description),
            meta: animationsUsingTag(tag.id),
          },
          // 태그는 마흔 개가 넘고 이름만으로는 무엇이 움직일지 알 수 없다.
          // 손가락으로는 한 번 눌러 읽고, 다시 눌러 붙인다.
          { explainOnTouch: true },
        );
        button.addEventListener("click", () =>
          this.callbacks.onUpdateBone(bone.id, {
            tags: on
              ? bone.tags.filter((candidate) => candidate !== tag.id)
              : [...bone.tags, tag.id],
          }),
        );
        row.append(button);
      }

      picker.append(row);
    }

    // 목록에 없는 태그도 직접 만들 수 있다. (기획서 11)
    const custom = document.createElement("div");
    custom.className = "tag-custom";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "직접 입력";

    const add = document.createElement("button");
    add.type = "button";
    add.className = "outlined";
    add.textContent = "추가";
    add.title = "목록에 없는 태그를 직접 만든다";

    const submit = () => {
      const value = input.value.trim();
      if (!value || bone.tags.includes(value)) return;
      input.value = "";
      this.callbacks.onUpdateBone(bone.id, { tags: [...bone.tags, value] });
    };
    add.addEventListener("click", submit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submit();
    });

    custom.append(input, add);
    picker.append(custom);
    return picker;
  }

  /**
   * 변형 방식. 네 가지를 한눈에 비교할 수 있게 버튼으로 두고,
   * 각각 어떤 파츠를 위한 것인지 툴팁으로 설명한다. (기획서 19)
   */
  private deformField(bone: PuppetBone): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "field field-deform";

    const label = document.createElement("label");
    label.textContent = "변형";
    attachTooltip(label, {
      title: "변형 방식",
      body: "이 관절이 칠한 영역을 어떻게 다룰지 정합니다. 휘게 둘지, 형태를 지킬지, 아예 제자리에 묶어 둘지.",
      meta: "마우스를 각 버튼에 올리면 어떤 파츠에 맞는지 설명이 나옵니다",
    });

    const { project, selectedAnimation } = this.store.get();
    const animation = selectedAnimation ? project.animations[selectedAnimation] : undefined;
    const override = animation?.deform?.[bone.id];
    // 애니메이션을 고른 상태에서만 "이 동작에서만" 탭이 생긴다.
    const scoped = Boolean(selectedAnimation && animation && this.deformScoped);
    const current = scoped ? (override ?? bone.deform) : bone.deform;

    const grid = document.createElement("div");
    grid.className = "deform-grid";

    for (const option of DEFORM_OPTIONS) {
      const on = current === option.id;
      const button = document.createElement("button");
      button.type = "button";
      button.className = on ? "deform-option active-fill" : "deform-option";
      // 덮어쓰지 않고 공용 값을 따르는 중이면 옅게 표시해 구분한다.
      if (on && scoped && !override) button.classList.add("inherited");
      button.textContent = option.short;
      button.setAttribute("aria-pressed", String(on));
      attachTooltip(button, {
        title: `${option.short} — ${option.label}`,
        body: option.help,
        meta: scoped
          ? `${selectedAnimation}에서만 이렇게 씁니다 · 예: ${option.examples}`
          : `예: ${option.examples}`,
      });
      button.addEventListener("click", () => {
        if (scoped && selectedAnimation) {
          this.callbacks.onAnimationDeform(selectedAnimation, bone.id, option.id);
        } else {
          this.callbacks.onUpdateBone(bone.id, { deform: option.id });
        }
      });
      grid.append(button);
    }

    wrapper.append(label, grid);
    if (!selectedAnimation || !animation) return wrapper;

    wrapper.append(this.deformScopeRow(bone, selectedAnimation, scoped, Boolean(override)));
    return wrapper;
  }

  /**
   * 변형 값을 공용으로 둘지 고른 애니메이션에서만 다르게 둘지 고르는 줄.
   *
   * 기본은 공용이다. 대기에서만 발을 바닥에 묶어 두고 싶을 때 탭을 옮겨 그것만 바꾼다.
   */
  private deformScopeRow(
    bone: PuppetBone,
    animationId: string,
    scoped: boolean,
    overridden: boolean,
  ): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "deform-scope";

    const tabs: [label: string, on: boolean, tip: { title: string; body: string; meta: string }][] = [
      [
        "공용",
        !scoped,
        {
          title: "모든 애니메이션 공용",
          body: "이 관절의 기본 변형 방식입니다. 따로 정해 두지 않은 애니메이션은 전부 이 값을 씁니다.",
          meta: "여기서 바꾸면 대기 · 이동 · 공격 전부에 반영됩니다",
        },
      ],
      [
        `${animationId}에서만`,
        scoped,
        {
          title: `${animationId}에서만 다르게`,
          body: "이 애니메이션을 재생할 때만 쓸 값입니다. 공용 값에서 시작하며, 바꾼 관절만 덮어씁니다. 다른 애니메이션은 그대로입니다.",
          meta: "대기에서만 발을 바닥에 묶어 서 있는 느낌을 줄 때 씁니다",
        },
      ],
    ];

    for (const [text, on, tip] of tabs) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = on ? "deform-scope-tab active-fill" : "deform-scope-tab";
      button.textContent = text;
      button.setAttribute("aria-pressed", String(on));
      attachTooltip(button, tip);
      button.addEventListener("click", () => {
        this.deformScoped = text !== "공용";
        this.render();
      });
      row.append(button);
    }

    if (scoped) {
      const note = document.createElement("p");
      note.className = "hint deform-scope-note";
      note.textContent = overridden
        ? `${bone.name}은(는) ${animationId}에서만 따로 정해져 있습니다.`
        : "공용 값을 따르는 중입니다. 버튼을 누르면 이 애니메이션에서만 바뀝니다.";
      row.append(note);

      if (overridden) {
        const reset = document.createElement("button");
        reset.type = "button";
        reset.className = "outlined deform-scope-reset";
        reset.textContent = "공용으로 되돌리기";
        attachTooltip(reset, {
          title: "덮어쓰기 지우기",
          body: "이 애니메이션만의 값을 지우고 다시 공용 값을 따르게 합니다.",
          meta: "다른 애니메이션과 공용 값은 건드리지 않습니다",
        });
        reset.addEventListener("click", () =>
          this.callbacks.onAnimationDeform(animationId, bone.id, null),
        );
        row.append(reset);
      }
    }

    return row;
  }
}
